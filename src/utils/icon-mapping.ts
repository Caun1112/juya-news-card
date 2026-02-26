const ICON_TOKEN_PATTERN = /^[a-z0-9][a-z0-9_]{1,150}$/i;

export const DEFAULT_ICON_FALLBACK = 'article';
export const DEFAULT_ICON_CDN_URL = 'https://cdn.jsdelivr.net/gh/google/material-design-icons@master/font/MaterialIcons-Regular.codepoints';

type IconJsonItem = string | { name?: unknown };

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}

function normalizeIconList(values: IconJsonItem[]): string[] {
  const normalized = values
    .map((item) => (typeof item === 'string' ? item : typeof item?.name === 'string' ? item.name : ''))
    .map((item) => normalizeIconToken(item, ''))
    .filter(Boolean);
  return unique(normalized);
}

function parseJsonIconList(payload: unknown): string[] {
  if (Array.isArray(payload)) {
    return normalizeIconList(payload as IconJsonItem[]);
  }

  if (payload && typeof payload === 'object') {
    const candidate = (payload as { icons?: unknown }).icons;
    if (Array.isArray(candidate)) {
      return normalizeIconList(candidate as IconJsonItem[]);
    }
  }

  return [];
}

function parseCodepointsIconList(rawText: string): string[] {
  // Codepoints format is typically: "<icon_name> <hex_codepoint>".
  const icons = rawText
    .split(/\r?\n/g)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.split(/\s+/)[0] || '')
    .map((name) => normalizeIconToken(name, ''))
    .filter(Boolean);
  return unique(icons);
}

function tryParseJsonPayload(rawPayload: string): string[] {
  try {
    return parseJsonIconList(JSON.parse(rawPayload) as unknown);
  } catch {
    return [];
  }
}

export function isSupportedIconCdnUrl(value: unknown): boolean {
  const raw = String(value ?? '').trim();
  if (!raw) return false;
  if (raw.startsWith('/')) return true;

  try {
    const url = new URL(raw);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

export function isValidIconToken(value: unknown): boolean {
  const normalized = String(value ?? '').trim().replaceAll('-', '_').toLowerCase();
  return ICON_TOKEN_PATTERN.test(normalized);
}

export function normalizeIconToken(value: unknown, fallback = DEFAULT_ICON_FALLBACK): string {
  const normalized = String(value ?? '').trim().replaceAll('-', '_').toLowerCase();
  return ICON_TOKEN_PATTERN.test(normalized) ? normalized : fallback;
}

export function splitIconCandidates(value: unknown): string[] {
  const raw = String(value ?? '').trim();
  if (!raw) return [];
  const candidates = raw
    .split(',')
    .map((item) => normalizeIconToken(item, ''))
    .filter(Boolean);
  return unique(candidates);
}

export function parseIconListPayload(rawPayload: string): string[] {
  const trimmed = rawPayload.trim();
  if (!trimmed) return [];

  // Some providers prepend anti-XSSI characters before JSON.
  const xssiPrefix = ")]}'";
  if (trimmed.startsWith(xssiPrefix)) {
    const stripped = trimmed.slice(xssiPrefix.length).trim();
    const parsed = tryParseJsonPayload(stripped);
    if (parsed.length > 0) return parsed;
  }

  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    const parsed = tryParseJsonPayload(trimmed);
    if (parsed.length > 0) return parsed;
  }

  return parseCodepointsIconList(trimmed);
}
