import type { ExportFormat, PngExportStrategy } from './global-settings';
import type { ExportResult, ExportMetadata, RenderAttempt } from './export-types';
import type { TemplateConfig } from '../templates/types';
import type { GeneratedContent } from '../types';

export interface ExportOptions {
  template: TemplateConfig;
  templateId: string;
  data: GeneratedContent;
  format: ExportFormat;
  strategy: PngExportStrategy;
  scale?: number;
  pixelRatio?: number;
  waitForLayoutMs?: number;
  bottomReservedPx?: number;
  backgroundColor?: string | null;
  sourceElement?: HTMLElement | null;
}

function makeFilename(templateId: string, format: ExportFormat): string {
  return `${templateId}-${Date.now()}.${format}`;
}

/**
 * Execute an image export using the specified strategy.
 *
 * - SVG format always uses browser export (strategy is irrelevant).
 * - PNG format dispatches to the selected strategy.
 */
export async function executeExport(options: ExportOptions): Promise<ExportResult> {
  const { format, strategy } = options;

  // SVG: always browser-rendered, strategy irrelevant
  if (format === 'svg') {
    return executeBrowserExport(options);
  }

  switch (strategy) {
    case 'strict-render-api':
      return executeStrictRenderApi(options);
    case 'strict-browser':
      return executeBrowserExport(options);
    case 'auto-fallback':
      return executeAutoFallback(options);
    default: {
      const _exhaustive: never = strategy;
      throw new Error(`Unknown PNG export strategy: ${_exhaustive}`);
    }
  }
}

/** Browser-only export (snapdom → html2canvas internal fallback preserved). */
async function executeBrowserExport(options: ExportOptions): Promise<ExportResult> {
  const { generateImageFromPreview } = await import('./export-preview-image');
  return generateImageFromPreview({
    template: options.template,
    data: options.data,
    format: options.format,
    scale: options.scale,
    pixelRatio: options.pixelRatio,
    waitForLayoutMs: options.waitForLayoutMs,
    bottomReservedPx: options.bottomReservedPx,
    backgroundColor: options.backgroundColor,
    sourceElement: options.sourceElement,
  });
}

/** Render API only — fail loudly, no fallback. */
async function executeStrictRenderApi(options: ExportOptions): Promise<ExportResult> {
  const { generatePngBlobFromRenderApi } = await import('./export-render-api-image');
  const t0 = performance.now();

  const blob = await generatePngBlobFromRenderApi({
    templateId: options.templateId,
    data: options.data,
    dpr: (options.pixelRatio ?? 2) >= 2 ? 2 : 1,
  });

  const durationMs = Math.round(performance.now() - t0);
  const metadata: ExportMetadata = {
    renderSource: 'render-api',
    fallbackReason: null,
    attemptTrace: [{ renderer: 'render-api', success: true, durationMs }],
  };

  return {
    blob,
    format: 'png',
    filename: makeFilename(options.templateId, 'png'),
    metadata,
  };
}

/** Render API first, fall back to browser export on failure. */
async function executeAutoFallback(options: ExportOptions): Promise<ExportResult> {
  const renderApiTrace: RenderAttempt[] = [];

  // Try render-api first
  let t0 = performance.now();
  try {
    const { generatePngBlobFromRenderApi } = await import('./export-render-api-image');
    t0 = performance.now();
    const blob = await generatePngBlobFromRenderApi({
      templateId: options.templateId,
      data: options.data,
      dpr: (options.pixelRatio ?? 2) >= 2 ? 2 : 1,
    });

    const durationMs = Math.round(performance.now() - t0);
    renderApiTrace.push({ renderer: 'render-api', success: true, durationMs });

    const metadata: ExportMetadata = {
      renderSource: 'render-api',
      fallbackReason: null,
      attemptTrace: renderApiTrace,
    };

    return {
      blob,
      format: 'png',
      filename: makeFilename(options.templateId, 'png'),
      metadata,
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    const durationMs = Math.round(performance.now() - t0);
    renderApiTrace.push({ renderer: 'render-api', success: false, failureReason: reason, durationMs });
    console.warn('[export] render-api PNG failed, falling back to browser renderer.', error);
  }

  // Fallback to browser export
  const browserResult = await executeBrowserExport(options);

  // Merge render-api attempt into the browser result's trace
  const mergedTrace = [...renderApiTrace, ...browserResult.metadata.attemptTrace];
  const fallbackReason = renderApiTrace.find(a => !a.success)?.failureReason ?? 'render-api failed';

  return {
    ...browserResult,
    metadata: {
      ...browserResult.metadata,
      fallbackReason,
      attemptTrace: mergedTrace,
    },
  };
}
