import { isSupportedIconCdnUrl, parseIconListPayload } from './icon-mapping';

export const DEFAULT_ICON_CDN_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
export const DEFAULT_ICON_CDN_FETCH_TIMEOUT_MS = 5_000;

type CatalogCacheEntry = {
  icons: string[];
  fetchedAt: number;
};

const catalogCache = new Map<string, CatalogCacheEntry>();
const inFlightRequests = new Map<string, Promise<string[]>>();

function isFresh(entry: CatalogCacheEntry, ttlMs: number): boolean {
  return Date.now() - entry.fetchedAt <= ttlMs;
}

function createFetchSignal(
  signal: AbortSignal | undefined,
  timeoutMs: number,
): { signal: AbortSignal | undefined; cleanup: () => void } {
  const hasTimeout = Number.isFinite(timeoutMs) && timeoutMs > 0;
  if (!hasTimeout) {
    return { signal, cleanup: () => {} };
  }

  const controller = new AbortController();
  const onAbort = () => controller.abort();
  if (signal) {
    if (signal.aborted) {
      controller.abort();
    } else {
      signal.addEventListener('abort', onAbort, { once: true });
    }
  }

  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  return {
    signal: controller.signal,
    cleanup: () => {
      clearTimeout(timeoutId);
      signal?.removeEventListener('abort', onAbort);
    },
  };
}

export async function loadIconCatalogFromCdn(
  cdnUrl: string,
  options: { ttlMs?: number; signal?: AbortSignal; timeoutMs?: number } = {},
): Promise<string[]> {
  const normalizedUrl = cdnUrl.trim();
  if (!isSupportedIconCdnUrl(normalizedUrl)) return [];

  const ttlMs = options.ttlMs ?? DEFAULT_ICON_CDN_CACHE_TTL_MS;
  const cached = catalogCache.get(normalizedUrl);
  if (cached && isFresh(cached, ttlMs)) {
    return cached.icons;
  }

  const existingRequest = inFlightRequests.get(normalizedUrl);
  if (existingRequest) {
    return existingRequest;
  }

  const timeoutMs = options.timeoutMs ?? DEFAULT_ICON_CDN_FETCH_TIMEOUT_MS;
  const { signal: requestSignal, cleanup } = createFetchSignal(options.signal, timeoutMs);

  const request = fetch(normalizedUrl, { signal: requestSignal })
    .then(async (response) => {
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const rawPayload = await response.text();
      const parsed = parseIconListPayload(rawPayload);

      if (parsed.length === 0) {
        if (cached) {
          return cached.icons;
        }
        console.warn('Fetched icon catalog is empty, skipping cache update.');
        return [];
      }

      catalogCache.set(normalizedUrl, {
        icons: parsed,
        fetchedAt: Date.now(),
      });
      return parsed;
    })
    .catch((error) => {
      if (cached) {
        console.warn('Failed to refresh icon catalog, using cached version:', error);
        return cached.icons;
      }
      throw error;
    })
    .finally(() => {
      cleanup();
      inFlightRequests.delete(normalizedUrl);
    });

  inFlightRequests.set(normalizedUrl, request);
  return request;
}
