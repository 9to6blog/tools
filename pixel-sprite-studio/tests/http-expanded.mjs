import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import sharp from 'sharp';
import { unzipSync } from 'fflate';

const base = 'http://127.0.0.1:3216';
const headers = { 'X-Pixel-Studio': '1', Origin: base };
const settings = { size: 256, width: 256, height: 192, padding: 0, colors: 32, threshold: 30, sampling: 'nearest', removeWhite: false, framing: 'canvas', exportSet: 'selected' };
const baseline = (await (await fetch(`${base}/api/jobs`)).json()).jobs;
const raw = Buffer.alloc(256 * 192 * 4);
for (let y = 12; y < 180; y++) for (let x = 16; x < 240; x++) {
  const window = x % 32 >= 12 && x % 32 <= 19 && y % 32 >= 12 && y % 32 <= 19;
  raw.set(window ? [35, 70, 105, 255] : y < 40 ? [60, 105, 75, 255] : [190, 160, 100, 255], (y * 256 + x) * 4);
}
const fixture = await sharp(raw, { raw: { width: 256, height: 192, channels: 4 } }).resize(1024, 768, { kernel: 'nearest' }).png().toBuffer();
await mkdir('test-artifacts', { recursive: true });
await writeFile('test-artifacts/building-verification-pattern.png', fixture);
const ids = [];
async function convert(overrides = {}, sourceId) {
  const id = randomUUID(), form = new FormData(); ids.push(id);
  form.set('id', id); form.set('settings', JSON.stringify({ ...settings, ...overrides }));
  if (sourceId) form.set('sourceId', sourceId);
  else form.set('image', new Blob([fixture], { type: 'image/png' }), 'TEST building pattern - not AI generated.png');
  const r = await fetch(`${base}/api/convert`, { method: 'POST', headers, body: form });
  const job = await r.json(); assert.equal(r.status, 200, JSON.stringify(job));
  return job;
}
const first = await convert();
assert.equal(first.variants.length, 1);
assert.equal(first.model, 'local'); assert.equal(first.usage, undefined);
const response = await fetch(`${base}/api/assets/${first.id}/sprite-256x192.png?download=1`);
assert.equal(response.status, 200); assert.match(response.headers.get('content-disposition'), /attachment/);
const image = await sharp(Buffer.from(await response.arrayBuffer())).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
assert.equal(image.info.width, 256); assert.equal(image.info.height, 192); assert.deepEqual(image.data, raw);
const zip = unzipSync(new Uint8Array(await (await fetch(`${base}/api/assets/${first.id}/sprites.zip`)).arrayBuffer()));
assert.equal(Object.keys(zip).length, 5); assert.ok(zip['sprite-256x192.png']); assert.ok(zip['preview-256x192.png']);
const second = await convert({ width: 192, height: 384, padding: 4, exportSet: 'classic' }, first.id);
assert.equal(second.source, first.id); assert.equal(second.variants.length, 6);
assert.deepEqual(second.variants.map(v => [v.canvasWidth, v.canvasHeight]), [[24, 24], [40, 40], [56, 56], [72, 72], [136, 136], [200, 392]]);
const secondZip = unzipSync(new Uint8Array(await (await fetch(`${base}/api/assets/${second.id}/sprites.zip`)).arrayBuffer()));
assert.equal(Object.keys(secondZip).length, 15);
const hash = b => createHash('sha256').update(b).digest('hex');
assert.equal(hash(zip['original.png']), hash(secondZip['original.png']));
assert.equal((await fetch(`${base}/api/assets/${second.id}/preview-192x384.png`)).status, 200);
const old = await convert({ size: 16, width: undefined, height: undefined, exportSet: undefined }, first.id);
assert.equal(old.variants.length, 5);
const invalid = new FormData(); invalid.set('id', randomUUID()); invalid.set('settings', JSON.stringify({ ...settings, width: 4096, padding: 1 })); invalid.set('sourceId', first.id);
const rejected = await fetch(`${base}/api/convert`, { method: 'POST', headers, body: invalid });
assert.equal(rejected.status, 400); assert.match((await rejected.json()).error, /4096/);
const forged = await fetch(`${base}/api/convert`, { method: 'POST', headers: { ...headers, Origin: 'https://example.com' }, body: new FormData() });
assert.equal(forged.status, 400);
const after = (await (await fetch(`${base}/api/jobs`)).json()).jobs;
for (const saved of baseline) assert.deepEqual(after.find(j => j.id === saved.id), saved);
const report = { testedAt: new Date().toISOString(), paidApiCalls: 0, jobIds: ids, previousJobsUnchanged: baseline.length, exactNativePixels: true, rectangularPNG: [256, 192], selectedZipEntries: 5, comparisonPNGDimensions: second.variants.map(v => [v.canvasWidth, v.canvasHeight]), comparisonZipEntries: 15, originalSHA256Preserved: true, legacyVariantCount: old.variants.length, checks: ['local upload without key', 'native window pixels preserved', 'rectangle PNG download', 'PNG preview download', 'ZIP filenames and entries', 'saved original free reprocess', 'same original SHA256', 'old clients compatible', 'oversized canvas rejected', 'foreign origin rejected', 'previous jobs unchanged'] };
await writeFile('test-artifacts/http-expanded-report.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
