import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import configHandler from '../pages/api/config';

type MockState = {
  statusCode: number | null;
  payload: unknown;
};

function createMockJsonResponse() {
  const state: MockState = {
    statusCode: null,
    payload: null,
  };

  const res = {
    status(code: number) {
      state.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      state.payload = payload;
      return this;
    },
  };

  return { res, state };
}

test('/api/config payload does not expose llm.baseURL', () => {
  const { res, state } = createMockJsonResponse();
  configHandler({} as never, res as never);

  assert.equal(state.statusCode, 200);
  assert.ok(state.payload && typeof state.payload === 'object');

  const payload = state.payload as { llm?: Record<string, unknown> };
  assert.ok(payload.llm && typeof payload.llm === 'object');
  assert.equal(Object.prototype.hasOwnProperty.call(payload.llm, 'baseURL'), false);
  assert.equal(typeof payload.llm.hasCustomBaseURL, 'boolean');
});

test('/api/generate upstream failure response does not contain internal baseURL', () => {
  const script = `
globalThis.fetch = async () => {
  throw new Error('mock upstream failure: https://internal.llm.example/v1');
};
const { default: handler } = await import('./pages/api/generate.ts');
const state = { statusCode: null, payload: null };
const res = {
  setHeader() {},
  status(code) {
    state.statusCode = code;
    return this;
  },
  json(payload) {
    state.payload = payload;
    return this;
  },
};
await handler(
  { method: 'POST', body: { inputText: 'test input' }, headers: {} },
  res
);
process.stdout.write(JSON.stringify(state));
`;

  const run = spawnSync(
    process.execPath,
    ['--import', 'tsx', '--input-type=module', '-e', script],
    {
      cwd: process.cwd(),
      encoding: 'utf8',
      env: {
        ...process.env,
        ALLOW_UNAUTHENTICATED_WRITE: 'true',
        LLM_API_KEY: 'test-key',
        LLM_API_BASE_URL: 'https://internal.llm.example/v1',
        LLM_TIMEOUT_MS: '1000',
        LLM_MAX_RETRIES: '0',
      },
    },
  );

  assert.equal(run.status, 0, run.stderr || run.stdout);
  assert.ok(run.stdout.trim(), run.stderr);

  const result = JSON.parse(run.stdout.trim()) as {
    statusCode: number;
    payload: { error?: string };
  };

  assert.equal(result.statusCode, 502);
  assert.equal(result.payload.error, 'LLM upstream request failed');
  assert.doesNotMatch(result.payload.error || '', /internal\.llm\.example|https?:\/\//i);
});
