import assert from 'node:assert/strict';
import test from 'node:test';
import { createDefaultGlobalSettings, loadGlobalSettings, saveGlobalSettings } from '../src/utils/global-settings';

const STORAGE_KEY = 'p2v-global-settings-v4';
const LEGACY_STORAGE_KEY_V3 = 'p2v-global-settings-v3';

type MemoryWindow = {
  location: { origin: string };
  localStorage: {
    getItem: (key: string) => string | null;
    setItem: (key: string, value: string) => void;
    removeItem: (key: string) => void;
  };
};

function createMemoryWindow(origin: string): MemoryWindow {
  const store = new Map<string, string>();
  return {
    location: { origin },
    localStorage: {
      getItem: (key: string) => (store.has(key) ? store.get(key) || null : null),
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
      removeItem: (key: string) => {
        store.delete(key);
      },
    },
  };
}

function installWindow(origin = 'http://localhost:3000'): MemoryWindow {
  const windowMock = createMemoryWindow(origin);
  Object.defineProperty(globalThis, 'window', {
    value: windowMock,
    configurable: true,
    writable: true,
  });
  return windowMock;
}

function uninstallWindow(): void {
  Reflect.deleteProperty(globalThis, 'window');
}

test('loadGlobalSettings ignores legacy payload and clears it', () => {
  const windowMock = installWindow();
  try {
    windowMock.localStorage.setItem(LEGACY_STORAGE_KEY_V3, JSON.stringify({
      bottomReservedPx: 123,
      llm: {
        baseURL: 'http://127.0.0.1:8080/api',
        model: 'legacy-model',
        temperature: 1.5,
      },
      iconMapping: {
        enabled: true,
        cdnUrl: 'https://cdn.example.com/icons.json',
        fallbackIcon: 'article',
      },
    }));

    const defaults = createDefaultGlobalSettings();
    const loaded = loadGlobalSettings();
    assert.deepEqual(loaded, defaults);
    assert.equal(windowMock.localStorage.getItem(LEGACY_STORAGE_KEY_V3), null);
    assert.equal(windowMock.localStorage.getItem(STORAGE_KEY), null);

    saveGlobalSettings(loaded);
    const raw = windowMock.localStorage.getItem(STORAGE_KEY);
    assert.ok(raw);
    const parsed = JSON.parse(raw);
    assert.equal(parsed.version, 4);
    assert.deepEqual(parsed.overrides, {});
  } finally {
    uninstallWindow();
  }
});

test('loadGlobalSettings uses origin-based default backend api base url', () => {
  installWindow('http://example.test:3000');
  try {
    const loaded = loadGlobalSettings();
    assert.equal(loaded.llm.baseURL, 'http://example.test:3000/api');
  } finally {
    uninstallWindow();
  }
});

test('saveGlobalSettings persists overrides only so defaults can move with runtime origin', () => {
  const windowMock = installWindow('http://origin-a.test:3000');
  try {
    const loaded = loadGlobalSettings();
    assert.equal(loaded.llm.baseURL, 'http://origin-a.test:3000/api');

    saveGlobalSettings(loaded);

    const raw = windowMock.localStorage.getItem(STORAGE_KEY);
    assert.ok(raw);
    const parsed = JSON.parse(raw);
    assert.equal(parsed.version, 4);
    assert.deepEqual(parsed.overrides, {});

    windowMock.location.origin = 'http://origin-b.test:3000';
    const reloaded = loadGlobalSettings();
    assert.equal(reloaded.llm.baseURL, 'http://origin-b.test:3000/api');
  } finally {
    uninstallWindow();
  }
});

test('custom backend base url override remains stable after runtime origin changes', () => {
  const windowMock = installWindow('http://origin-a.test:3000');
  try {
    const loaded = loadGlobalSettings();
    const customized = saveGlobalSettings({
      ...loaded,
      llm: {
        ...loaded.llm,
        baseURL: 'http://127.0.0.1:8080/api',
      },
    });
    assert.equal(customized.llm.baseURL, 'http://127.0.0.1:8080/api');

    windowMock.location.origin = 'http://origin-b.test:3000';
    const reloaded = loadGlobalSettings();
    assert.equal(reloaded.llm.baseURL, 'http://127.0.0.1:8080/api');
  } finally {
    uninstallWindow();
  }
});

test('loadGlobalSettings enables icon mapping defaults with builtin CDN + fallback icon', () => {
  installWindow('http://example.test:3000');
  try {
    const loaded = loadGlobalSettings();
    assert.equal(loaded.iconMapping.enabled, true);
    assert.ok(loaded.iconMapping.cdnUrl.includes('MaterialIcons-Regular.codepoints'));
    assert.equal(loaded.iconMapping.fallbackIcon, 'article');
  } finally {
    uninstallWindow();
  }
});

test('loadGlobalSettings reads NEXT_PUBLIC_ICON_CDN_URL as default icon catalog', () => {
  const previous = process.env.NEXT_PUBLIC_ICON_CDN_URL;
  process.env.NEXT_PUBLIC_ICON_CDN_URL = 'https://cdn.example.test/icons.txt';
  installWindow('http://example.test:3000');
  try {
    const loaded = loadGlobalSettings();
    assert.equal(loaded.iconMapping.cdnUrl, 'https://cdn.example.test/icons.txt');
  } finally {
    if (typeof previous === 'string') {
      process.env.NEXT_PUBLIC_ICON_CDN_URL = previous;
    } else {
      delete process.env.NEXT_PUBLIC_ICON_CDN_URL;
    }
    uninstallWindow();
  }
});

test('saveGlobalSettings clamps icon CDN url length', () => {
  const windowMock = installWindow('http://example.test:3000');
  try {
    const loaded = loadGlobalSettings();
    const longUrl = `https://cdn.example.test/${'x'.repeat(3000)}`;
    const saved = saveGlobalSettings({
      ...loaded,
      iconMapping: {
        ...loaded.iconMapping,
        cdnUrl: longUrl,
      },
    });

    assert.equal(saved.iconMapping.cdnUrl.length, 2048);
    const raw = windowMock.localStorage.getItem(STORAGE_KEY);
    assert.ok(raw);
  } finally {
    uninstallWindow();
  }
});

test('createDefaultGlobalSettings throws when NEXT_PUBLIC_PNG_EXPORT_STRATEGY is invalid', () => {
  const previous = process.env.NEXT_PUBLIC_PNG_EXPORT_STRATEGY;
  process.env.NEXT_PUBLIC_PNG_EXPORT_STRATEGY = 'nonsense';
  try {
    assert.throws(
      () => createDefaultGlobalSettings(),
      /PNG_EXPORT_STRATEGY/,
    );
  } finally {
    if (typeof previous === 'string') {
      process.env.NEXT_PUBLIC_PNG_EXPORT_STRATEGY = previous;
    } else {
      delete process.env.NEXT_PUBLIC_PNG_EXPORT_STRATEGY;
    }
  }
});

test('createDefaultGlobalSettings normalizes NEXT_PUBLIC_PNG_EXPORT_STRATEGY to lower-case', () => {
  const previous = process.env.NEXT_PUBLIC_PNG_EXPORT_STRATEGY;
  process.env.NEXT_PUBLIC_PNG_EXPORT_STRATEGY = 'AUTO-FALLBACK';
  try {
    const defaults = createDefaultGlobalSettings();
    assert.equal(defaults.pngExportStrategy, 'auto-fallback');
  } finally {
    if (typeof previous === 'string') {
      process.env.NEXT_PUBLIC_PNG_EXPORT_STRATEGY = previous;
    } else {
      delete process.env.NEXT_PUBLIC_PNG_EXPORT_STRATEGY;
    }
  }
});
