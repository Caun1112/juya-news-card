import { BOTTOM_RESERVED_PX } from './layout-calculator';
import { readPublicEnv } from './runtime-env';
import { DEFAULT_ICON_CDN_URL, DEFAULT_ICON_FALLBACK } from './icon-mapping';

const STORAGE_KEY = 'p2v-global-settings-v4';
const LEGACY_STORAGE_KEYS = ['p2v-global-settings-v3', 'p2v-global-settings-v2', 'p2v-global-settings-v1'] as const;
const STORAGE_VERSION = 4 as const;
const MAX_ICON_CDN_URL_LENGTH = 2048;

export type ExportFormat = 'png' | 'svg';
const VALID_EXPORT_STRATEGIES = [
  'strict-render-api',
  'strict-browser',
  'auto-fallback',
] as const;

export type PngExportStrategy = (typeof VALID_EXPORT_STRATEGIES)[number];

export const EXPORT_FORMAT_OPTIONS: { value: ExportFormat; label: string; description: string }[] = [
  { value: 'png', label: 'PNG', description: '通过 SVG 转换，兼容性最佳' },
  { value: 'svg', label: 'SVG', description: '矢量格式，体积小、可缩放' },
];

export const PNG_EXPORT_STRATEGY_OPTIONS: { value: PngExportStrategy; label: string; description: string }[] = [
  { value: 'strict-browser', label: 'Browser Only', description: '仅前端渲染（snapdom/html2canvas），无需后端' },
  { value: 'strict-render-api', label: 'Render API Only', description: '仅后端 Playwright 渲染，失败时报错不回退' },
  { value: 'auto-fallback', label: 'Auto Fallback', description: '优先后端，失败自动回退前端并通知' },
];

export interface LlmGlobalSettings {
  baseURL: string;
}

export interface IconMappingSettings {
  enabled: boolean;
  cdnUrl: string;
  fallbackIcon: string;
}

export interface AppGlobalSettings {
  bottomReservedPx: number;
  exportFormat: ExportFormat;
  pngExportStrategy: PngExportStrategy;
  llm: LlmGlobalSettings;
  iconMapping: IconMappingSettings;
}

type PersistedGlobalSettingsV4 = {
  version: typeof STORAGE_VERSION;
  overrides: Partial<AppGlobalSettings>;
};

function clampNumber(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
  integer = false,
): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  const normalized = Math.min(max, Math.max(min, parsed));
  return integer ? Math.round(normalized) : normalized;
}

function nonEmptyTrimmedString(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  return trimmed || fallback;
}

function boundedNonEmptyTrimmedString(value: unknown, fallback: string, maxLength: number): string {
  const normalized = nonEmptyTrimmedString(value, fallback);
  return normalized.slice(0, maxLength);
}

function resolveDefaultBaseURL(): string {
  const envBaseUrl = readPublicEnv('VITE_API_BASE_URL');
  if (envBaseUrl) return envBaseUrl;
  if (typeof window !== 'undefined') {
    return `${window.location.origin}/api`;
  }
  return '/api';
}

function resolveDefaultPngExportStrategy(): PngExportStrategy {
  const raw = readPublicEnv('VITE_PNG_EXPORT_STRATEGY').toLowerCase();
  if (raw === 'strict-render-api') return 'strict-render-api';
  if (raw === 'strict-browser') return 'strict-browser';
  if (raw === 'auto-fallback') return 'auto-fallback';
  return 'strict-browser';
}

function resolveDefaultIconCdnUrl(): string {
  const envIconCdn = readPublicEnv('VITE_ICON_CDN_URL');
  return (envIconCdn || DEFAULT_ICON_CDN_URL).slice(0, MAX_ICON_CDN_URL_LENGTH);
}

export function createDefaultGlobalSettings(): AppGlobalSettings {
  return {
    bottomReservedPx: BOTTOM_RESERVED_PX,
    exportFormat: 'png',
    pngExportStrategy: resolveDefaultPngExportStrategy(),
    llm: {
      baseURL: resolveDefaultBaseURL(),
    },
    iconMapping: {
      enabled: true,
      cdnUrl: resolveDefaultIconCdnUrl(),
      fallbackIcon: DEFAULT_ICON_FALLBACK,
    },
  };
}

function isValidExportStrategy(value: unknown): value is PngExportStrategy {
  return typeof value === 'string' && (VALID_EXPORT_STRATEGIES as readonly string[]).includes(value);
}

function sanitizeSettings(
  raw: Partial<AppGlobalSettings>,
  defaults: AppGlobalSettings = createDefaultGlobalSettings(),
): AppGlobalSettings {
  const llmRaw: Partial<LlmGlobalSettings> = raw.llm ?? {};

  const exportFormat = raw.exportFormat === 'png' || raw.exportFormat === 'svg'
    ? raw.exportFormat
    : defaults.exportFormat;
  const pngExportStrategy = isValidExportStrategy(raw.pngExportStrategy)
    ? raw.pngExportStrategy
    : defaults.pngExportStrategy;

  const iconMappingRaw: Partial<IconMappingSettings> = raw.iconMapping ?? {};

  return {
    bottomReservedPx: clampNumber(raw.bottomReservedPx, defaults.bottomReservedPx, 0, 600, true),
    exportFormat,
    pngExportStrategy,
    llm: {
      baseURL: nonEmptyTrimmedString(llmRaw.baseURL, defaults.llm.baseURL),
    },
    iconMapping: {
      enabled: typeof iconMappingRaw.enabled === 'boolean' ? iconMappingRaw.enabled : defaults.iconMapping.enabled,
      cdnUrl: boundedNonEmptyTrimmedString(
        iconMappingRaw.cdnUrl,
        defaults.iconMapping.cdnUrl,
        MAX_ICON_CDN_URL_LENGTH,
      ),
      fallbackIcon: nonEmptyTrimmedString(iconMappingRaw.fallbackIcon, defaults.iconMapping.fallbackIcon),
    },
  };
}

function hasOwnKeys(value: object): boolean {
  return Object.keys(value).length > 0;
}

function mergeWithDefaults(
  raw: Partial<AppGlobalSettings>,
  defaults: AppGlobalSettings,
): Partial<AppGlobalSettings> {
  return {
    ...defaults,
    ...raw,
    llm: {
      ...defaults.llm,
      ...(raw.llm || {}),
    },
    iconMapping: {
      ...defaults.iconMapping,
      ...(raw.iconMapping || {}),
    },
  };
}

function parsePersistedSettings(raw: string): Partial<AppGlobalSettings> | null {
  const parsed = JSON.parse(raw) as unknown;
  if (!parsed || typeof parsed !== 'object') return null;

  const objectValue = parsed as Record<string, unknown>;
  if (
    objectValue.version === STORAGE_VERSION &&
    objectValue.overrides &&
    typeof objectValue.overrides === 'object'
  ) {
    return objectValue.overrides as Partial<AppGlobalSettings>;
  }
  return null;
}

/**
 * Migrate v3 overrides to v4 format.
 * Maps: pngRenderer 'render-api' → pngExportStrategy 'auto-fallback',
 *        pngRenderer 'browser'    → pngExportStrategy 'strict-browser'.
 */
function migrateV3Overrides(v3Overrides: Record<string, unknown>): Partial<AppGlobalSettings> {
  const migrated = { ...v3Overrides } as Record<string, unknown>;
  const legacyRenderer = v3Overrides.pngRenderer;
  if (typeof legacyRenderer === 'string') {
    delete migrated.pngRenderer;
    migrated.pngExportStrategy =
      legacyRenderer === 'render-api' ? 'auto-fallback' : 'strict-browser';
  }
  return migrated as Partial<AppGlobalSettings>;
}

function tryLoadV3Settings(): Partial<AppGlobalSettings> | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem('p2v-global-settings-v3');
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (parsed?.version === 3 && parsed.overrides && typeof parsed.overrides === 'object') {
      return migrateV3Overrides(parsed.overrides as Record<string, unknown>);
    }
  } catch {
    // ignore
  }
  return null;
}

function buildSettingsOverrides(
  settings: AppGlobalSettings,
  defaults: AppGlobalSettings,
): Partial<AppGlobalSettings> {
  const overrides: Partial<AppGlobalSettings> = {};

  if (settings.bottomReservedPx !== defaults.bottomReservedPx) {
    overrides.bottomReservedPx = settings.bottomReservedPx;
  }
  if (settings.exportFormat !== defaults.exportFormat) {
    overrides.exportFormat = settings.exportFormat;
  }
  if (settings.pngExportStrategy !== defaults.pngExportStrategy) {
    overrides.pngExportStrategy = settings.pngExportStrategy;
  }

  const llmOverrides: Partial<LlmGlobalSettings> = {};
  if (settings.llm.baseURL !== defaults.llm.baseURL) {
    llmOverrides.baseURL = settings.llm.baseURL;
  }
  if (hasOwnKeys(llmOverrides)) {
    overrides.llm = llmOverrides as LlmGlobalSettings;
  }

  const iconMappingOverrides: Partial<IconMappingSettings> = {};
  if (settings.iconMapping.enabled !== defaults.iconMapping.enabled) {
    iconMappingOverrides.enabled = settings.iconMapping.enabled;
  }
  if (settings.iconMapping.cdnUrl !== defaults.iconMapping.cdnUrl) {
    iconMappingOverrides.cdnUrl = settings.iconMapping.cdnUrl;
  }
  if (settings.iconMapping.fallbackIcon !== defaults.iconMapping.fallbackIcon) {
    iconMappingOverrides.fallbackIcon = settings.iconMapping.fallbackIcon;
  }
  if (hasOwnKeys(iconMappingOverrides)) {
    overrides.iconMapping = iconMappingOverrides as IconMappingSettings;
  }

  return overrides;
}

function removeLegacySettings(): void {
  if (typeof window === 'undefined') return;
  try {
    for (const key of LEGACY_STORAGE_KEYS) {
      window.localStorage.removeItem(key);
    }
  } catch {
    // ignore
  }
}

export function loadGlobalSettings(): AppGlobalSettings {
  const defaults = createDefaultGlobalSettings();
  if (typeof window === 'undefined') return defaults;

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = parsePersistedSettings(raw);
      if (parsed) {
        const normalized = sanitizeSettings(mergeWithDefaults(parsed, defaults), defaults);
        removeLegacySettings();
        return normalized;
      }
      // Invalid v4 data — remove it
      try { window.localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
    }

    // Try migrating from v3
    const v3Migrated = tryLoadV3Settings();
    if (v3Migrated) {
      const normalized = sanitizeSettings(mergeWithDefaults(v3Migrated, defaults), defaults);
      // Persist as v4 so migration only happens once
      saveGlobalSettings(normalized);
      removeLegacySettings();
      return normalized;
    }

    removeLegacySettings();
    return defaults;
  } catch (error) {
    console.warn('Failed to load global settings. Using defaults.', error);
    return defaults;
  }
}

export function saveGlobalSettings(settings: AppGlobalSettings): AppGlobalSettings {
  const defaults = createDefaultGlobalSettings();
  const normalized = sanitizeSettings(settings, defaults);
  const overrides = buildSettingsOverrides(normalized, defaults);
  const payload: PersistedGlobalSettingsV4 = {
    version: STORAGE_VERSION,
    overrides,
  };

  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      removeLegacySettings();
    } catch (error) {
      console.warn('Failed to persist global settings.', error);
    }
  }

  return normalized;
}
