import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import sharp from 'sharp';
import { unzipSync } from 'fflate';
const base = 'http://127.0.0.1:3216';
const headers = { 'X-Pixel-Studio': '1', Origin: base };
const settings = { size: 16, padding: 4, colors: 8, threshold: 30, sampling: 'dominant', removeWhite: false };
const raw = Buffer.alloc(16 * 16 * 4);
for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
  if ((x < 2 || x > 13) && (y < 2 || y > 13)) continue;
  raw.set([x < 8 ? 230 : 64, y < 8 ? 170 : 94, 80, 255], (y * 16 + x) * 4);
}
const fixture = await sharp(raw, { raw: { width: 16, height: 16, channels: 4 } }).resize(512, 512, { kernel: 'nearest' }).png().toBuffer();
await mkdir('test-artifacts', { recursive: true });
await writeFile('test-artifacts/verification-pattern.png', fixture);
const form = new FormData();
const id = randomUUID();
form.set('id', id); form.set('settings', JSON.stringify(settings));
form.set('image', new Blob([fixture], { type: 'image/png' }), '검증용 패턴 - AI 생성 아님.png');
const response = await fetch(`${base}/api/convert`, { method: 'POST', headers, body: form });
const result = await response.json();
assert.equal(response.status, 200, JSON.stringify(result));
assert.equal(result.variants.length, 5);
const variants = [];
for (const v of result.variants) {
  const r = await fetch(`${base}/api/assets/${id}/${v.file}?download=1`);
  assert.equal(r.status, 200); assert.match(r.headers.get('content-disposition'), /attachment/);
  const bytes = Buffer.from(await r.arrayBuffer());
  const image = await sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  assert.equal(image.info.width, v.size + 8); assert.equal(image.info.height, v.size + 8);
  const colors = new Set(), alphas = new Set();
  for (let i = 0; i < image.data.length; i += 4) { alphas.add(image.data[i + 3]); if (image.data[i + 3]) colors.add(image.data.subarray(i, i + 3).toString('hex')); }
  assert.ok([...alphas].every(a => a === 0 || a === 255)); assert.ok(colors.size <= 8);
  variants.push({ size: v.size, canvas: image.info.width, colors: colors.size, alpha: [...alphas] });
}
const zip = new Uint8Array(await (await fetch(`${base}/api/assets/${id}/sprites.zip`)).arrayBuffer());
const entries = unzipSync(zip);
assert.equal(Object.keys(entries).length, 13);
const reId = randomUUID(), reForm = new FormData();
reForm.set('id', reId); reForm.set('sourceId', id); reForm.set('settings', JSON.stringify({ ...settings, padding: 0 }));
const re = await fetch(`${base}/api/convert`, { method: 'POST', headers, body: reForm });
const reJob = await re.json(); assert.equal(re.status, 200, JSON.stringify(reJob));
assert.deepEqual(reJob.variants.map(v => v.canvas), [16, 32, 48, 64, 128]);
assert.equal(reJob.source, id);
const countBefore = (await (await fetch(`${base}/api/jobs`)).json()).jobs.length;
// An explicit invalid key overrides any environment key and fails locally.
const invalid = await fetch(`${base}/api/jobs`, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ id: randomUUID(), prompt: 'cat', model: 'gpt-image-2.5-flare', quality: 'medium', settings, apiKey: 'local-validation-only' }) });
assert.equal(invalid.status, 400);
const forged = await fetch(`${base}/api/jobs`, { method: 'POST', headers: { ...headers, Origin: 'https://example.com', 'Content-Type': 'application/json' }, body: '{}' });
assert.equal(forged.status, 400);
const jobs = (await (await fetch(`${base}/api/jobs`)).json()).jobs;
assert.equal(jobs.length, countBefore);
assert.ok(jobs.some(j => j.id === id && j.status === 'complete'));
const report = { testedAt: new Date().toISOString(), paidApiCalls: 0, jobIds: [id, reId], variants, zeroPaddingCanvases: reJob.variants.map(v => v.canvas), zipEntries: Object.keys(entries).length, checks: ['upload', 'pixel output', 'download headers', 'zip extraction', 'free reprocess', 'history persistence', 'invalid key rejected locally', 'cross-origin rejected'] };
await writeFile('test-artifacts/http-report.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
