import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';
import { generateTemplateHtml } from '../src/templates/ssr-runtime.js';
import type { GeneratedContent } from '../src/types';
import { loadIconCatalogFromCdn } from '../src/utils/icon-cdn-catalog.js';
import { resolveIconMappingRuntimeConfig } from '../src/utils/icon-config.js';
import { applyIconMappingToContent } from '../src/utils/icon-resolution.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  const mockDataPath = path.join(process.cwd(), 'tests/mock-data.json');
  if (!fs.existsSync(mockDataPath)) {
    console.error('Error: tests/mock-data.json not found.');
    process.exit(1);
  }

  const mockData = JSON.parse(fs.readFileSync(mockDataPath, 'utf-8'));
  const iconMappingConfig = resolveIconMappingRuntimeConfig(process.env);
  let cdnIcons: string[] = [];
  if (iconMappingConfig.enabled) {
    try {
      cdnIcons = await loadIconCatalogFromCdn(iconMappingConfig.cdnUrl, {
        ttlMs: iconMappingConfig.cdnCacheTtlMs,
        timeoutMs: iconMappingConfig.cdnFetchTimeoutMs,
      });
    } catch (error) {
      console.warn('Failed to refresh icon catalog. Continue with fallback-only mapping.', error);
    }
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outputDir = path.join(process.cwd(), `output/offline-test-${timestamp}`);
  fs.mkdirSync(outputDir, { recursive: true });

  console.log(`Starting offline rendering. Output directory: ${outputDir}`);

  const browser = await chromium.launch();
  const fontPathCandidates = [
    path.join(process.cwd(), 'assets', 'htmlFont.ttf'),
    path.join(process.cwd(), 'public', 'assets', 'htmlFont.ttf'),
  ];
  const fontPath = fontPathCandidates.find(p => fs.existsSync(p));
  let fontFace = '';
  if (fontPath) {
    const fontBase64 = fs.readFileSync(fontPath).toString('base64');
    fontFace = `
      <style>
        @font-face {
          font-family: 'CustomPreviewFont';
          src: url(data:font/ttf;base64,${fontBase64}) format('truetype');
        }
        .main-container {
          font-family: 'CustomPreviewFont', system-ui, -apple-system, sans-serif !important;
        }
      </style>
    `;
  }

  for (const content of mockData as GeneratedContent[]) {
    const mappedContent = applyIconMappingToContent(content, {
      fallbackIcon: iconMappingConfig.fallbackIcon,
      cdnIcons,
    });
    const N = mappedContent.cards.length;
    console.log(`Rendering ${N} cards...`);

    const html = generateTemplateHtml(mappedContent);
    const finalHtml = fontFace ? html.replace('</head>', `${fontFace}</head>`) : html;

    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      deviceScaleFactor: 1,
    });
    const page = await context.newPage();
    await page.setContent(finalHtml, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000); // Wait for effects

    const screenshotPath = path.join(outputDir, `cards-${N}.png`);
    await page.screenshot({ path: screenshotPath });
    await context.close();
  }

  await browser.close();
  console.log('\n--- Offline Rendering Complete ---');
  console.log(`Results: ${outputDir}`);
}

main();
