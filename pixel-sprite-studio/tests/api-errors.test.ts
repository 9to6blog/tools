import test from 'node:test';
import assert from 'node:assert/strict';
import OpenAI from 'openai';
import sharp from 'sharp';
import path from 'node:path';
import { mkdir, readFile, rename } from 'node:fs/promises';
import { POST as edit } from '../src/app/api/edit/route';
import { POST as generate } from '../src/app/api/jobs/route';
import { activeJob, apiErrorDetails, safeError } from '../src/lib/api';
import { DEFAULT_SETTINGS } from '../src/lib/types';
import { jobDir, readJob } from '../src/lib/storage';

const key = 'sk-local-error-test-only-not-a-real-key';
const headers = { Host: '127.0.0.1:3216', Origin: 'http://127.0.0.1:3216', 'X-Pixel-Studio': '1' };

test('API diagnostics preserve actionable fields while redacting keys, bearer credentials and image data', () => {
  const error = new OpenAI.BadRequestError(400, {
    message: `Unsupported parameter input_fidelity. ${key} sk-another-key Bearer session-secret data:image/png;base64,AAAA`,
    code: 'unsupported_parameter', param: 'input_fidelity', type: 'invalid_request_error',
    hidden: 'never serialize the whole response',
  }, undefined, new Headers({ 'x-request-id': 'req_mock_diagnostics', authorization: `Bearer ${key}` }));
  const details = apiErrorDetails(error, [key])!;
  assert.equal(details.status, 400);
  assert.equal(details.code, 'unsupported_parameter');
  assert.equal(details.param, 'input_fidelity');
  assert.equal(details.requestId, 'req_mock_diagnostics');
  assert.deepEqual(Object.keys(details).sort(), ['status','code','param','type','message','requestId'].sort());
  const serialized = JSON.stringify(details) + safeError(error, [key]);
  for (const secret of [key, 'sk-another-key', 'session-secret', 'AAAA', 'authorization', 'never serialize']) assert.ok(!serialized.includes(secret));
  assert.match(safeError(error, [key]), /확인할 항목: input_fidelity/);
  assert.match(safeError(error, [key]), /req_mock_diagnostics/);
  const long = new OpenAI.BadRequestError(400, { message: 'x'.repeat(5000) }, undefined, new Headers());
  assert.equal(apiErrorDetails(long)?.message?.length, 1001);
  assert.equal(apiErrorDetails(new Error('local failure')), undefined);
});

test('content rejection, authentication, quota and transport failures stay distinguishable', () => {
  const policy = new OpenAI.BadRequestError(400, { message: 'Rejected by moderation', code: 'moderation_blocked' }, undefined, new Headers());
  assert.match(safeError(policy), /콘텐츠 검사/);
  assert.doesNotMatch(safeError(policy), /확인할 항목/);
  const auth = new OpenAI.AuthenticationError(401, { message: `Incorrect API key: ${key}` }, undefined, new Headers());
  assert.match(safeError(auth), /키 인증/);
  assert.ok(!safeError(auth).includes(key));
  const quota = new OpenAI.RateLimitError(429, { code: 'insufficient_quota', message: 'Quota exceeded' }, undefined, new Headers());
  assert.match(safeError(quota), /결제 잔액/);
  assert.match(safeError(quota), /insufficient_quota/);
  const timeout = new OpenAI.APIConnectionTimeoutError();
  assert.match(safeError(timeout), /자동 재시도하지 않습니다/);
  assert.doesNotMatch(safeError(timeout), /요청 설정을 거절/);
});

test('both generation routes save sanitized rejection details, preserve references and never retry or fall back', async () => {
  const created: string[] = [];
  const source = await sharp({ create: { width: 24, height: 24, channels: 4, background: '#336699' } }).png().toBuffer();
  const originalFetch = globalThis.fetch;
  let calls = 0, status = 400;
  globalThis.fetch = async (url, init) => {
    // The SDK probes FormData support with a local data URL, not an API request.
    if (String(url) === 'data:,') return new Response('');
    calls++;
    assert.match(String(url), /^https:\/\/api\.openai\.com\/v1\/images\/(edits|generations)$/);
    if (String(url).endsWith('/edits')) {
      assert.ok(init?.body instanceof FormData);
      assert.equal(init.body.get('model'), 'gpt-image-2.5-sunburst');
      assert.equal(init.body.has('input_fidelity'), false);
      assert.equal(init.body.get('n'), '1');
    } else {
      const sent = JSON.parse(String(init?.body));
      assert.equal(sent.model, 'gpt-image-2.5-flare');
      assert.equal(sent.n, 1);
    }
    return new Response(JSON.stringify({ error: { message: `Mock rejection: ${key}`, code: status === 400 ? 'invalid_value' : 'insufficient_quota', param: status === 400 ? 'size' : null, type: 'invalid_request_error' } }), {
      status, headers: { 'Content-Type': 'application/json', 'x-request-id': `req_mock_${calls}`, 'retry-after': '0' },
    });
  };
  try {
    for (const endpoint of ['edit', 'generate'] as const) {
      for (status of [400, 429]) {
        const id = crypto.randomUUID(); created.push(id);
        const form = new FormData();
        form.set('id', id); form.set('image', new File([source], 'reference.png', { type: 'image/png' }));
        form.set('apiKey', key); form.set('model', 'gpt-image-2.5-sunburst'); form.set('quality', 'low');
        form.set('prompt', 'A pixel character'); form.set('settings', JSON.stringify(DEFAULT_SETTINGS));
        const request = () => endpoint === 'edit'
          ? new Request('http://127.0.0.1:3216/api/edit', { method: 'POST', headers, body: form })
          : new Request('http://127.0.0.1:3216/api/jobs', { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ id, apiKey: key, model: 'gpt-image-2.5-flare', quality: 'low', prompt: 'A pixel character', settings: DEFAULT_SETTINGS }) });
        const handler = endpoint === 'edit' ? edit : generate;
        const before = calls;
        const response = await handler(request());
        const result = await response.json();
        assert.equal(response.status, status, JSON.stringify(result));
        assert.equal(calls, before + 1);
        assert.equal(activeJob(), undefined);
        assert.equal(result.job.status, 'failed');
        assert.equal(result.job.apiError.status, status);
        assert.equal(result.job.requestId, `req_mock_${calls}`);
        assert.match(result.error, /API 사유: Mock rejection/);
        if (status === 400) assert.match(result.error, /확인할 항목: size/);
        const saved = await readJob(id);
        assert.deepEqual(saved.apiError, result.job.apiError);
        const disk = await readFile(path.join(jobDir(id), 'job.json'), 'utf8');
        assert.ok(!disk.includes(key)); assert.ok(!JSON.stringify(result).includes(key));
        if (endpoint === 'edit') assert.deepEqual(await readFile(path.join(jobDir(id), 'reference.png')), source);
        const duplicate = await handler(request());
        assert.equal(duplicate.status, 409); assert.equal(calls, before + 1);
        assert.equal(activeJob(), undefined);
      }
    }
  } finally {
    globalThis.fetch = originalFetch;
    const dest = path.resolve('test-artifacts/api-error-jobs'); await mkdir(dest, { recursive: true });
    for (const id of created) {
      const from = jobDir(id), to = path.join(dest, id);
      if (!from.startsWith(path.resolve('outputs') + path.sep) || !to.startsWith(dest + path.sep)) throw new Error('Test archive path boundary');
      await rename(from, to).catch(() => {});
    }
  }
});
