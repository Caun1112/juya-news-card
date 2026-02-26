import assert from 'node:assert/strict';
import test from 'node:test';
import { setTimeout as sleep } from 'node:timers/promises';
import {
  DEFAULT_ICON_CDN_URL,
  normalizeIconToken,
  parseIconListPayload,
  splitIconCandidates,
} from '../src/utils/icon-mapping';
import { resolveIconName } from '../src/utils/icon-resolution';
import {
  DEFAULT_ICON_CDN_FETCH_TIMEOUT_MS,
  loadIconCatalogFromCdn,
} from '../src/utils/icon-cdn-catalog';
import { resolveIconMappingRuntimeConfig } from '../src/utils/icon-config';

function installFetchMock(mock: typeof fetch): () => void {
  const originalFetch = globalThis.fetch;
  Object.defineProperty(globalThis, 'fetch', {
    value: mock,
    configurable: true,
    writable: true,
  });
  return () => {
    Object.defineProperty(globalThis, 'fetch', {
      value: originalFetch,
      configurable: true,
      writable: true,
    });
  };
}

test('normalizeIconToken and splitIconCandidates handle separators + invalid tokens', () => {
  assert.equal(normalizeIconToken('Trending-Up', 'article'), 'trending_up');
  assert.equal(normalizeIconToken('bad icon', 'article'), 'article');
  assert.deepEqual(splitIconCandidates('bad icon, Trending-Up,check-circle'), ['trending_up', 'check_circle']);
});

test('parseIconListPayload parses JSON payload and codepoints payload', () => {
  const jsonPayload = JSON.stringify({
    icons: ['article', { name: 'check-circle' }, { name: 'bad icon' }],
  });
  assert.deepEqual(parseIconListPayload(jsonPayload), ['article', 'check_circle']);

  const codepoints = 'trending_up e001\ncheck_circle e002\nbad icon e003\n';
  assert.deepEqual(parseIconListPayload(codepoints), ['trending_up', 'check_circle', 'bad']);
});

test('resolveIconName prefers CDN candidate, otherwise falls back', () => {
  const matched = resolveIconName('bad icon, check-circle, article', {
    fallbackIcon: 'article',
    cdnIconSet: new Set(['article', 'check_circle']),
  });
  assert.equal(matched, 'check_circle');

  const fallback = resolveIconName('bad icon, invalid icon', {
    fallbackIcon: 'trending_up',
    cdnIconSet: new Set(['article']),
  });
  assert.equal(fallback, 'trending_up');
});

test('loadIconCatalogFromCdn uses stale cache when refresh fails', async () => {
  const url = `https://example.test/icons-cache-fallback-${Date.now()}.txt`;
  let callCount = 0;
  const restoreFetch = installFetchMock((async () => {
    callCount += 1;
    if (callCount === 1) {
      return new Response('article e001\ncheck_circle e002\n', { status: 200 });
    }
    throw new Error('network down');
  }) as typeof fetch);

  try {
    const first = await loadIconCatalogFromCdn(url, { ttlMs: 1 });
    assert.deepEqual(first, ['article', 'check_circle']);

    await sleep(5);

    const second = await loadIconCatalogFromCdn(url, { ttlMs: 1 });
    assert.deepEqual(second, ['article', 'check_circle']);
    assert.equal(callCount, 2);
  } finally {
    restoreFetch();
  }
});

test('loadIconCatalogFromCdn does not cache empty payload without fallback cache', async () => {
  const url = `https://example.test/icons-empty-${Date.now()}.txt`;
  let callCount = 0;
  const restoreFetch = installFetchMock((async () => {
    callCount += 1;
    if (callCount === 1) {
      return new Response('', { status: 200 });
    }
    return new Response('trending_up e001\n', { status: 200 });
  }) as typeof fetch);

  try {
    const first = await loadIconCatalogFromCdn(url, { ttlMs: 60_000 });
    assert.deepEqual(first, []);

    const second = await loadIconCatalogFromCdn(url, { ttlMs: 60_000 });
    assert.deepEqual(second, ['trending_up']);
    assert.equal(callCount, 2);
  } finally {
    restoreFetch();
  }
});

test('loadIconCatalogFromCdn falls back to stale cache when refresh times out', async () => {
  const url = `https://example.test/icons-timeout-${Date.now()}.txt`;
  let callCount = 0;
  const restoreFetch = installFetchMock((async (_input: RequestInfo | URL, init?: RequestInit) => {
    callCount += 1;
    if (callCount === 1) {
      return new Response('article e001\ncheck_circle e002\n', { status: 200 });
    }

    const signal = init?.signal as AbortSignal | null | undefined;
    return await new Promise<Response>((resolve, reject) => {
      if (signal?.aborted) {
        reject(new DOMException('The operation was aborted', 'AbortError'));
        return;
      }
      signal?.addEventListener('abort', () => {
        reject(new DOMException('The operation was aborted', 'AbortError'));
      }, { once: true });
    });
  }) as typeof fetch);

  try {
    const first = await loadIconCatalogFromCdn(url, { ttlMs: 1, timeoutMs: 30 });
    assert.deepEqual(first, ['article', 'check_circle']);

    await sleep(5);

    const second = await loadIconCatalogFromCdn(url, { ttlMs: 1, timeoutMs: 30 });
    assert.deepEqual(second, ['article', 'check_circle']);
    assert.equal(callCount, 2);
  } finally {
    restoreFetch();
  }
});

test('loadIconCatalogFromCdn honors timeout even when external signal is provided', async () => {
  const url = `https://example.test/icons-timeout-signal-${Date.now()}.txt`;
  let callCount = 0;
  const restoreFetch = installFetchMock((async (_input: RequestInfo | URL, init?: RequestInit) => {
    callCount += 1;
    if (callCount === 1) {
      return new Response('article e001\ncheck_circle e002\n', { status: 200 });
    }

    const signal = init?.signal as AbortSignal | null | undefined;
    return await new Promise<Response>((_resolve, reject) => {
      if (signal?.aborted) {
        reject(new DOMException('The operation was aborted', 'AbortError'));
        return;
      }
      signal?.addEventListener('abort', () => {
        reject(new DOMException('The operation was aborted', 'AbortError'));
      }, { once: true });
    });
  }) as typeof fetch);

  try {
    const first = await loadIconCatalogFromCdn(url, { ttlMs: 1, timeoutMs: 30 });
    assert.deepEqual(first, ['article', 'check_circle']);
    await sleep(5);

    const external = new AbortController();
    const second = await Promise.race([
      loadIconCatalogFromCdn(url, {
        ttlMs: 1,
        timeoutMs: 30,
        signal: external.signal,
      }),
      sleep(200).then(() => '__timed_out__'),
    ]);
    assert.notEqual(second, '__timed_out__');
    assert.deepEqual(second, ['article', 'check_circle']);
    assert.equal(callCount, 2);
  } finally {
    restoreFetch();
  }
});

test('resolveIconMappingRuntimeConfig validates URL and fallback under strict mode', () => {
  assert.throws(
    () => resolveIconMappingRuntimeConfig({ ICON_CDN_URL: 'not-a-url' }, { strict: true }),
    /Invalid ICON_CDN_URL/,
  );
  assert.throws(
    () => resolveIconMappingRuntimeConfig({ ICON_FALLBACK: 'bad icon' }, { strict: true }),
    /Invalid ICON_FALLBACK/,
  );
  assert.throws(
    () => resolveIconMappingRuntimeConfig({ ICON_CDN_FETCH_TIMEOUT_MS: 'x' }, { strict: true }),
    /Invalid ICON_CDN_FETCH_TIMEOUT_MS/,
  );
});

test('resolveIconMappingRuntimeConfig falls back when invalid values are provided in non-strict mode', () => {
  const config = resolveIconMappingRuntimeConfig({
    ICON_CDN_URL: 'not-a-url',
    ICON_FALLBACK: 'bad icon',
  });

  assert.equal(config.cdnUrl, DEFAULT_ICON_CDN_URL);
  assert.equal(config.fallbackIcon, 'article');
  assert.equal(config.cdnFetchTimeoutMs, DEFAULT_ICON_CDN_FETCH_TIMEOUT_MS);
});
