import { DEFAULT_ICON_CDN_CACHE_TTL_MS, DEFAULT_ICON_CDN_FETCH_TIMEOUT_MS } from './icon-cdn-catalog';
import {
  DEFAULT_ICON_CDN_URL,
  DEFAULT_ICON_FALLBACK,
  isSupportedIconCdnUrl,
  isValidIconToken,
  normalizeIconToken,
} from './icon-mapping';

export type IconMappingRuntimeConfig = {
  enabled: boolean;
  cdnUrl: string;
  fallbackIcon: string;
  cdnCacheTtlMs: number;
  cdnFetchTimeoutMs: number;
};

type IconMappingEnvInput = {
  // Server-side runtime env only. Frontend public env is resolved in global-settings.ts.
  [key: string]: string | undefined;
  ICON_MAPPING_ENABLED?: string;
  ICON_CDN_URL?: string;
  ICON_FALLBACK?: string;
  ICON_CDN_CACHE_TTL_MS?: string;
  ICON_CDN_FETCH_TIMEOUT_MS?: string;
};

type ResolveIconMappingRuntimeConfigOptions = {
  strict?: boolean;
  defaultEnabled?: boolean;
  defaultCdnUrl?: string;
  defaultFallbackIcon?: string;
  defaultCdnCacheTtlMs?: number;
  defaultCdnFetchTimeoutMs?: number;
  minCdnCacheTtlMs?: number;
  maxCdnCacheTtlMs?: number;
  minCdnFetchTimeoutMs?: number;
  maxCdnFetchTimeoutMs?: number;
};

function normalizeBool(value: unknown, fallback: boolean, strict: boolean, key: string): boolean {
  const raw = String(value ?? '').trim().toLowerCase();
  if (!raw) return fallback;
  if (['1', 'true', 'yes', 'on'].includes(raw)) return true;
  if (['0', 'false', 'no', 'off'].includes(raw)) return false;
  if (strict) {
    throw new Error(`Invalid ${key}: "${raw}" (expected true/false)`);
  }
  return fallback;
}

function normalizeIntegerRange(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
  strict: boolean,
  key: string,
): number {
  const raw = String(value ?? '').trim();
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) {
    if (strict) {
      throw new Error(`Invalid ${key}: "${raw}" (expected integer in ${min}..${max})`);
    }
    return fallback;
  }
  if (parsed < min || parsed > max) {
    if (strict) {
      throw new Error(`Invalid ${key}: "${raw}" (expected integer in ${min}..${max})`);
    }
    return fallback;
  }
  return Math.floor(parsed);
}

export function resolveIconMappingRuntimeConfig(
  env: IconMappingEnvInput,
  options: ResolveIconMappingRuntimeConfigOptions = {},
): IconMappingRuntimeConfig {
  const strict = options.strict === true;
  const defaultEnabled = options.defaultEnabled ?? true;
  const defaultCdnUrl = options.defaultCdnUrl ?? DEFAULT_ICON_CDN_URL;
  const defaultFallbackIcon = options.defaultFallbackIcon ?? DEFAULT_ICON_FALLBACK;
  const defaultCdnCacheTtlMs = options.defaultCdnCacheTtlMs ?? DEFAULT_ICON_CDN_CACHE_TTL_MS;
  const defaultCdnFetchTimeoutMs = options.defaultCdnFetchTimeoutMs ?? DEFAULT_ICON_CDN_FETCH_TIMEOUT_MS;
  const minCdnCacheTtlMs = options.minCdnCacheTtlMs ?? 1_000;
  const maxCdnCacheTtlMs = options.maxCdnCacheTtlMs ?? 30 * 24 * 60 * 60 * 1000;
  const minCdnFetchTimeoutMs = options.minCdnFetchTimeoutMs ?? 100;
  const maxCdnFetchTimeoutMs = options.maxCdnFetchTimeoutMs ?? 120_000;
  const normalizedDefaultCdnUrl = isSupportedIconCdnUrl(defaultCdnUrl) ? defaultCdnUrl : DEFAULT_ICON_CDN_URL;
  const normalizedDefaultFallbackIcon = normalizeIconToken(defaultFallbackIcon, DEFAULT_ICON_FALLBACK);
  const configuredCdnUrl = String(env.ICON_CDN_URL ?? '').trim();
  let cdnUrl = configuredCdnUrl || normalizedDefaultCdnUrl;
  if (!isSupportedIconCdnUrl(cdnUrl)) {
    if (strict) {
      throw new Error(`Invalid ICON_CDN_URL: "${cdnUrl}" (expected http(s) URL or /relative/path)`);
    }
    cdnUrl = normalizedDefaultCdnUrl;
  }

  const configuredFallbackIcon = String(env.ICON_FALLBACK ?? '').trim();
  if (strict && configuredFallbackIcon && !isValidIconToken(configuredFallbackIcon)) {
    throw new Error(`Invalid ICON_FALLBACK: "${configuredFallbackIcon}" (expected icon token, e.g. article)`);
  }
  const fallbackIcon = normalizeIconToken(
    configuredFallbackIcon || normalizedDefaultFallbackIcon,
    normalizedDefaultFallbackIcon,
  );

  return {
    enabled: normalizeBool(env.ICON_MAPPING_ENABLED, defaultEnabled, strict, 'ICON_MAPPING_ENABLED'),
    cdnUrl,
    fallbackIcon,
    cdnCacheTtlMs: normalizeIntegerRange(
      env.ICON_CDN_CACHE_TTL_MS,
      defaultCdnCacheTtlMs,
      minCdnCacheTtlMs,
      maxCdnCacheTtlMs,
      strict,
      'ICON_CDN_CACHE_TTL_MS',
    ),
    cdnFetchTimeoutMs: normalizeIntegerRange(
      env.ICON_CDN_FETCH_TIMEOUT_MS,
      defaultCdnFetchTimeoutMs,
      minCdnFetchTimeoutMs,
      maxCdnFetchTimeoutMs,
      strict,
      'ICON_CDN_FETCH_TIMEOUT_MS',
    ),
  };
}
