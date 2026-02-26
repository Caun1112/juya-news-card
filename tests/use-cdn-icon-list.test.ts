import assert from 'node:assert/strict';
import test from 'node:test';
import { shouldFetchIconCatalog } from '../src/hooks/use-cdn-icon-list';

test('shouldFetchIconCatalog requests when cache is missing', () => {
  assert.equal(shouldFetchIconCatalog(null), true);
});

test('shouldFetchIconCatalog skips refresh for fresh cache by default', () => {
  const freshEntry = {
    icons: ['article'],
    fetchedAt: Date.now(),
  };
  assert.equal(shouldFetchIconCatalog(freshEntry), false);
});

test('shouldFetchIconCatalog refreshes when forced after re-enabling', () => {
  const freshEntry = {
    icons: ['article'],
    fetchedAt: Date.now(),
  };
  assert.equal(shouldFetchIconCatalog(freshEntry, { forceRefresh: true }), true);
});

test('shouldFetchIconCatalog refreshes stale cache', () => {
  const staleEntry = {
    icons: ['article'],
    fetchedAt: 1,
  };
  assert.equal(shouldFetchIconCatalog(staleEntry), true);
});

