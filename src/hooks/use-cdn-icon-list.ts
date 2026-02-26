import { useEffect, useRef, useState } from 'react';
import { isSupportedIconCdnUrl, parseIconListPayload } from '../utils/icon-mapping';
import { DEFAULT_ICON_CDN_CACHE_TTL_MS, DEFAULT_ICON_CDN_FETCH_TIMEOUT_MS } from '../utils/icon-cdn-catalog';

const ICON_CDN_CACHE_KEY = 'p2v-icon-cdn-cache-v1';
const ICON_CDN_CACHE_TTL_MS = DEFAULT_ICON_CDN_CACHE_TTL_MS;
const ICON_CDN_FETCH_TIMEOUT_MS = DEFAULT_ICON_CDN_FETCH_TIMEOUT_MS;

type IconCacheEntry = {
  icons: string[];
  fetchedAt: number;
};

type IconCacheStore = Record<string, IconCacheEntry>;

const memoryCache = new Map<string, IconCacheEntry>();

function normalizeCacheEntry(value: unknown): IconCacheEntry | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as { icons?: unknown; fetchedAt?: unknown };
  if (!Array.isArray(raw.icons)) return null;

  const icons = raw.icons.filter((item): item is string => typeof item === 'string');
  const fetchedAt = typeof raw.fetchedAt === 'number' ? raw.fetchedAt : Number(raw.fetchedAt);
  if (!Number.isFinite(fetchedAt) || fetchedAt <= 0) return null;

  return {
    icons,
    fetchedAt: Math.floor(fetchedAt),
  };
}

function readCacheStore(): IconCacheStore {
  if (typeof window === 'undefined') return {};

  try {
    const raw = window.localStorage.getItem(ICON_CDN_CACHE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return {};

    const store: IconCacheStore = {};
    for (const [url, entryValue] of Object.entries(parsed as Record<string, unknown>)) {
      const entry = normalizeCacheEntry(entryValue);
      if (!entry) continue;
      store[url] = entry;
    }
    return store;
  } catch {
    return {};
  }
}

function writeCacheStore(store: IconCacheStore): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(ICON_CDN_CACHE_KEY, JSON.stringify(store));
  } catch {
    // ignore quota / security errors
  }
}

function readCachedEntry(url: string): IconCacheEntry | null {
  const memoryEntry = memoryCache.get(url);
  if (memoryEntry) return memoryEntry;

  const store = readCacheStore();
  const localEntry = store[url];
  if (!localEntry) return null;
  memoryCache.set(url, localEntry);
  return localEntry;
}

function writeCachedEntry(url: string, icons: string[]): void {
  const entry: IconCacheEntry = {
    icons,
    fetchedAt: Date.now(),
  };
  memoryCache.set(url, entry);

  const store = readCacheStore();
  store[url] = entry;
  writeCacheStore(store);
}

function isFresh(entry: IconCacheEntry): boolean {
  return Date.now() - entry.fetchedAt <= ICON_CDN_CACHE_TTL_MS;
}

export function shouldFetchIconCatalog(
  cachedEntry: IconCacheEntry | null,
  options: { forceRefresh?: boolean } = {},
): boolean {
  if (!cachedEntry) return true;
  if (options.forceRefresh) return true;
  return !isFresh(cachedEntry);
}

export function useCdnIconList(enabled: boolean, cdnUrl: string): string[] {
  const [iconList, setIconList] = useState<string[]>([]);
  const prevEnabledRef = useRef<boolean>(enabled);
  const prevUrlRef = useRef<string>(cdnUrl.trim());

  useEffect(() => {
    const normalizedUrl = cdnUrl.trim();
    const wasEnabled = prevEnabledRef.current;
    const previousUrl = prevUrlRef.current;
    prevEnabledRef.current = enabled;
    prevUrlRef.current = normalizedUrl;

    if (!enabled || !normalizedUrl) {
      setIconList([]);
      return;
    }
    if (!isSupportedIconCdnUrl(normalizedUrl)) {
      console.warn('Invalid icon CDN url:', normalizedUrl);
      setIconList([]);
      return;
    }

    const cachedEntry = readCachedEntry(normalizedUrl);
    const forceRefreshOnEnable = !wasEnabled && previousUrl === normalizedUrl;
    if (cachedEntry) {
      setIconList(cachedEntry.icons);
      if (!shouldFetchIconCatalog(cachedEntry, { forceRefresh: forceRefreshOnEnable })) {
        return;
      }
    } else {
      setIconList([]);
    }

    const abortController = new AbortController();
    const timeoutId = setTimeout(() => abortController.abort(), ICON_CDN_FETCH_TIMEOUT_MS);
    fetch(normalizedUrl, { signal: abortController.signal })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        return response.text();
      })
      .then((rawPayload) => {
        const parsed = parseIconListPayload(rawPayload);
        if (parsed.length === 0) {
          if (cachedEntry) {
            console.warn('Fetched icon list is empty, keeping cached icon list.');
            return;
          }
          console.warn('Fetched icon list is empty, skipping cache update.');
          setIconList([]);
          return;
        }
        writeCachedEntry(normalizedUrl, parsed);
        setIconList(parsed);
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        console.error('Failed to fetch icon CDN list:', error);
        if (!cachedEntry) {
          setIconList([]);
        }
      });

    return () => {
      clearTimeout(timeoutId);
      abortController.abort();
    };
  }, [cdnUrl, enabled]);

  return iconList;
}
