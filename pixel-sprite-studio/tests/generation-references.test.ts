import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import path from 'node:path';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { unzipSync } from 'fflate';
import { POST as generate } from '../src/app/api/jobs/route';
import { GET as asset } from '../src/app/api/assets/[id]/[file]/route';
import { DEFAULT_SETTINGS } from '../src/lib/types';
import { jobDir, readJob } from '../src/lib/storage';
import { activeJob } from '../src/lib/api';

const key = 'sk-local-mock-only-not-a-real-key';
const headers = { Host: '127.0.0.1:3216', Origin: 'http://127.0.0.1:3216', 'X-Pixel-Studio': '1' };
const usage = { input_tokens: 300, input_tokens_details: { text_tokens: 100, image_tokens: 200 }, output_tokens: 1000, total_tokens: 1300 };
test('new generation routes references through edits, preserves ordered inputs and costs, and never retries', async () => {
  const fixture = await sharp({ create: { width: 24, height: 32, channels: 4, background: '#447733' } }).png().toBuffer();
  const jpeg = await sharp(fixture).jpeg().toBuffer();
  const archive = path.resolve('test-artifacts/generation-references'); await mkdir(archive, { recursive: true });
  await writeFile(path.join(archive, 'reference-fixture.png'), fixture); await writeFile(path.join(archive, 'reference-fixture.jpg'), jpeg);
  const created: string[] = [], calls: { url: string; body: unknown }[] = [];
  let responseMode: 'ok' | 'reject' | 'missing' = 'ok';
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    if (String(url) === 'data:,') return new Response('');
    assert.ok(['https://api.openai.com/v1/images/edits', 'https://api.openai.com/v1/images/generations'].includes(String(url)));
    calls.push({ url: String(url), body: init?.body });
    if (responseMode === 'reject') return new Response(JSON.stringify({ error: { message: 'Mock content rejection', code: 'moderation_blocked', type: 'image_generation_user_error' } }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    return new Response(JSON.stringify({ created: 1, data: responseMode === 'missing' ? [] : [{ b64_json: fixture.toString('base64') }], usage }), { status: 200, headers: { 'Content-Type': 'application/json', 'x-request-id': 'mock-reference-generation' } });
  };
  function form(id: string, count = 2) {
    const f = new FormData(); f.set('id', id); f.set('prompt', 'A new pixel hero'); f.set('model', 'gpt-image-2.5-flare'); f.set('quality', 'medium'); f.set('apiKey', key); f.set('settings', JSON.stringify(DEFAULT_SETTINGS)); f.set('referencePrompt', 'Image 1 identity; image 2 colors');
    for (let i = 0; i < count; i++) f.append('references', new File([i % 2 ? jpeg : fixture], i % 2 ? 'colors.jpg' : 'identity.png', { type: i % 2 ? 'image/jpeg' : 'image/png' }));
    return f;
  }
  const send = (f: FormData, customHeaders = headers) => generate(new Request('http://127.0.0.1:3216/api/jobs', { method: 'POST', headers: customHeaders, body: f }));
  try {
    const id = crypto.randomUUID(); created.push(id);
    const r = await send(form(id)), job = await r.json(); assert.equal(r.status, 200, JSON.stringify(job));
    assert.equal(job.kind, 'reference'); assert.equal(job.references.length, 2); assert.equal(job.referencePrompt, 'Image 1 identity; image 2 colors');
    const sent = calls[0].body as FormData; assert.equal(calls[0].url, 'https://api.openai.com/v1/images/edits'); assert.equal(sent.get('n'), '1'); assert.equal(sent.has('input_fidelity'), false);
    assert.match(String(sent.get('prompt')), /Image 1 identity; image 2 colors/);
    const inputs = [...sent.entries()].filter(([name]) => name.startsWith('image')).map(([, v]) => v as File);
    assert.equal(inputs.length, 2); assert.equal(inputs[0].name, 'reference-1.png'); assert.equal(inputs[1].name, 'reference-2.png');
    for (let i = 0; i < inputs.length; i++) assert.deepEqual(Buffer.from(await inputs[i].arrayBuffer()), await readFile(path.join(jobDir(id), `reference-${i + 1}.png`)));
    const saved = await readJob(id); assert.equal(saved.requestId, 'mock-reference-generation'); assert.ok(Math.abs(saved.cost!.usd - .0321) < 1e-12);
    assert.ok(!(await readFile(path.join(jobDir(id), 'job.json'), 'utf8')).includes(key));
    const files = unzipSync(await readFile(path.join(jobDir(id), 'sprites.zip')));
    assert.equal(Object.keys(files).length, 7); assert.ok(files['reference-1.png']); assert.ok(files['reference-2.png']);
    assert.equal(JSON.parse(Buffer.from(files['metadata.json']).toString()).cost.usd, saved.cost!.usd);
    assert.equal((await asset(new Request('http://127.0.0.1:3216/'), { params: Promise.resolve({ id, file: 'reference-2.png' }) })).status, 200);
    assert.equal((await asset(new Request('http://127.0.0.1:3216/'), { params: Promise.resolve({ id, file: 'reference-5.png' }) })).status, 404);
    assert.equal((await send(form(id))).status, 409); assert.equal(calls.length, 1);

    for (const count of [0, 5]) assert.equal((await send(form(crypto.randomUUID(), count))).status, 400);
    const invalid = form(crypto.randomUUID(), 0); invalid.append('references', new File(['not an image'], 'bad.png', { type: 'image/png' }));
    assert.equal((await send(invalid)).status, 400);
    const long = form(crypto.randomUUID()); long.set('referencePrompt', 'x'.repeat(2001)); assert.equal((await send(long)).status, 400);
    assert.equal((await send(form(crypto.randomUUID()), { ...headers, Origin: 'https://example.com' })).status, 400);
    assert.equal(calls.length, 1);

    const legacyId = crypto.randomUUID(); created.push(legacyId);
    const legacy = await generate(new Request('http://127.0.0.1:3216/api/jobs', { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ id: legacyId, prompt: 'No reference', model: 'gpt-image-2.5-flare', quality: 'medium', apiKey: key, settings: DEFAULT_SETTINGS }) }));
    assert.equal(legacy.status, 200); assert.equal(calls[1].url, 'https://api.openai.com/v1/images/generations');

    responseMode = 'reject'; const rejectedId = crypto.randomUUID(); created.push(rejectedId);
    assert.equal((await send(form(rejectedId))).status, 400); assert.equal(calls.length, 3);
    const rejected = await readJob(rejectedId); assert.equal(rejected.status, 'failed'); assert.equal(rejected.apiError?.code, 'moderation_blocked'); assert.equal(rejected.cost, undefined);
    assert.ok((await readFile(path.join(jobDir(rejectedId), 'reference-1.png'))).length);

    responseMode = 'missing'; const missingId = crypto.randomUUID(); created.push(missingId);
    assert.equal((await send(form(missingId))).status, 502); assert.equal(calls.length, 4);
    const missing = await readJob(missingId); assert.equal(missing.status, 'failed'); assert.ok(missing.cost); assert.deepEqual(missing.usage, usage);
    assert.equal(activeJob(), undefined);
    await writeFile(path.join(archive, 'report.json'), JSON.stringify({ passed: true, paidApiCalls: 0, mockApiCalls: calls.length, orderedReferences: true, referenceZip: true, usageCostPersisted: true, failureCostPreserved: true, duplicateBlocked: true, legacyGenerationPreserved: true, jobIds: created }, null, 2));
  } finally {
    globalThis.fetch = originalFetch;
    for (const id of created) {
      const from = jobDir(id), to = path.join(archive, id);
      if (!from.startsWith(path.resolve('outputs') + path.sep) || !to.startsWith(archive + path.sep)) throw new Error('Archive boundary');
      await rename(from, to).catch(() => {});
    }
  }
});
