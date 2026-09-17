import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { pixelate } from '../src/lib/pixel';
import { DEFAULT_SETTINGS as NEW_DEFAULTS, SIZES, exportTargets, generationSize, validateSettings } from '../src/lib/types';
import { localRequest, promptFor } from '../src/lib/api';
import { limitPalette } from '../src/lib/palette';
const DEFAULT_SETTINGS = { ...NEW_DEFAULTS, exportSet: 'classic' as const };

function fixture() {
  const raw = Buffer.alloc(16 * 12 * 4);
  const colors = [[24, 32, 48], [240, 160, 48], [248, 232, 192], [255, 255, 255]];
  for (let y = 0; y < 12; y++) for (let x = 0; x < 16; x++) {
    if (x > 2 && x < 5 && y > 2 && y < 5) continue;
    const c = colors[(x + y) % 4], i = (y * 16 + x) * 4;
    raw.set([...c, 255], i);
  }
  return raw;
}
test('enlarged native pixels survive quantization and cell sampling exactly', async () => {
  const raw = fixture();
  const enlarged = await sharp(raw, { raw: { width: 16, height: 12, channels: 4 } }).resize(512, 384, { kernel: 'nearest' }).extend({ top: 48, bottom: 48, left: 48, right: 48, background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
  const { outputs } = await pixelate(enlarged, DEFAULT_SETTINGS);
  assert.equal(outputs.length, 5);
  const native = await sharp(outputs[0].png).extract({ left: 4, top: 6, width: 16, height: 12 }).ensureAlpha().raw().toBuffer();
  assert.deepEqual(native, raw);
  for (const { variant, png } of outputs) {
    assert.equal(variant.canvas, variant.size + 8);
    const decoded = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    assert.equal(decoded.info.width, variant.canvas); assert.equal(decoded.info.height, variant.canvas);
    const colors = new Set<string>();
    for (let y = 0; y < variant.canvas; y++) for (let x = 0; x < variant.canvas; x++) {
      const i = (y * variant.canvas + x) * 4, a = decoded.data[i + 3];
      assert.ok(a === 0 || a === 255);
      if (a) colors.add(decoded.data.subarray(i, i + 3).toString('hex'));
      if (x < 4 || y < 4 || x >= variant.canvas - 4 || y >= variant.canvas - 4) assert.equal(a, 0);
    }
    assert.ok(colors.size <= DEFAULT_SETTINGS.colors);
  }
});
test('zero padding gives exact requested canvases and all-transparent input is rejected', async () => {
  const input = await sharp(fixture(), { raw: { width: 16, height: 12, channels: 4 } }).png().toBuffer();
  const { outputs } = await pixelate(input, { ...DEFAULT_SETTINGS, padding: 0, sampling: 'nearest' });
  assert.deepEqual(outputs.map(o => o.variant.canvas), [...SIZES]);
  const empty = await sharp({ create: { width: 16, height: 16, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).png().toBuffer();
  await assert.rejects(() => pixelate(empty, DEFAULT_SETTINGS), /불투명/);
});
test('white removal keeps enclosed white detail but removes connected border', async () => {
  const raw = Buffer.alloc(16 * 16 * 4, 255);
  for (let y = 4; y < 12; y++) for (let x = 4; x < 12; x++) raw.set([20, 30, 40, 255], (y * 16 + x) * 4);
  raw.set([255, 255, 255, 255], (7 * 16 + 7) * 4);
  const input = await sharp(raw, { raw: { width: 16, height: 16, channels: 4 } }).png().toBuffer();
  const result = await pixelate(input, { ...DEFAULT_SETTINGS, removeWhite: true });
  assert.doesNotMatch(result.warning ?? '', /투명 배경이 없습니다/);
  const out = await sharp(result.outputs[0].png).ensureAlpha().raw().toBuffer();
  assert.equal(out[3], 0);
  assert.ok(out.includes(Buffer.from([255, 255, 255, 255])));
});
test('request dimensions and origin validation reject unsafe or invalid input', () => {
  assert.equal(validateSettings({ ...DEFAULT_SETTINGS, size: 24 }).size, 24);
  assert.throws(() => validateSettings({ ...DEFAULT_SETTINGS, size: 0 }));
  assert.throws(() => validateSettings({ ...DEFAULT_SETTINGS, padding: -1 }));
  assert.throws(() => validateSettings({ ...DEFAULT_SETTINGS, colors: 257 }));
  const req = (origin: string) => new Request('http://127.0.0.1:3216/api/jobs', { headers: { host: '127.0.0.1:3216', origin, 'X-Pixel-Studio': '1' } });
  assert.doesNotThrow(() => localRequest(req('http://127.0.0.1:3216')));
  assert.throws(() => localRequest(req('https://example.com')));
  assert.match(promptFor('cat', 16, 8), /16 by 16/);
});
test('color caps are strict for a noisy high-color source, including limits below 16', async () => {
  const raw = Buffer.alloc(64 * 64 * 4);
  for (let i = 0; i < raw.length; i += 4) { raw[i] = (i * 17 + 24) % 256; raw[i + 1] = Math.floor(i / 4) % 256; raw[i + 2] = Math.floor(i / 64) % 256; raw[i + 3] = 255; }
  for (const limit of [2, 4, 8, 12, 16, 24, 32, 48, 64, 128, 256]) {
    const copy = Buffer.from(raw); limitPalette(copy, limit);
    const unique = new Set<string>();
    for (let i = 0; i < copy.length; i += 4) unique.add(copy.subarray(i, i + 3).toString('hex'));
    assert.ok(unique.size <= limit, `${unique.size} exceeds ${limit}`);
  }
  const input = await sharp(raw, { raw: { width: 64, height: 64, channels: 4 } }).png().toBuffer();
  const result = await pixelate(input, { ...DEFAULT_SETTINGS, colors: 8 });
  assert.ok(result.outputs.every(o => o.variant.colors <= 8));
});

test('rectangular building targets keep proportions, transparent padding and exact PNG dimensions', async () => {
  const raw = fixture();
  const input = await sharp(raw, { raw: { width: 16, height: 12, channels: 4 } }).png().toBuffer();
  const result = await pixelate(input, { ...NEW_DEFAULTS, width: 256, height: 192, padding: 3, framing: 'canvas' });
  assert.equal(result.outputs.length, 1);
  const { variant, png } = result.outputs[0];
  assert.equal(variant.file, 'sprite-256x192.png');
  assert.equal(variant.previewFile, 'preview-256x192.png');
  assert.equal(variant.width, 256); assert.equal(variant.height, 192);
  assert.equal(variant.canvasWidth, 262); assert.equal(variant.canvasHeight, 198);
  const decoded = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  assert.equal(decoded.info.width, 262); assert.equal(decoded.info.height, 198);
  for (let y = 0; y < 198; y++) for (let x = 0; x < 262; x++) {
    if (x < 3 || y < 3 || x >= 259 || y >= 195) assert.equal(decoded.data[(y * 262 + x) * 4 + 3], 0);
  }
  const restored = await sharp(png).extract({ left: 3, top: 3, width: 256, height: 192 }).resize(16, 12, { kernel: 'nearest' }).raw().toBuffer();
  assert.deepEqual(restored, raw);
});

test('canvas framing preserves native pixels beyond the former 1536px decode limit', async () => {
  const width = 2048, height = 16, raw = Buffer.alloc(width * height * 4);
  for (let y = 2; y < height - 2; y++) for (let x = 17; x < width - 11; x++) raw.set(x % 2 ? [28, 44, 60, 255] : [230, 220, 170, 255], (y * width + x) * 4);
  const input = await sharp(raw, { raw: { width, height, channels: 4 } }).png().toBuffer();
  const result = await pixelate(input, { ...NEW_DEFAULTS, width, height, padding: 0, framing: 'canvas', sampling: 'nearest' });
  const output = await sharp(result.outputs[0].png).raw().toBuffer();
  assert.deepEqual(output, raw);
  assert.equal(result.warning, undefined);
});

test('custom limits, legacy jobs and API source aspect ratios are consistent', () => {
  const old = { size: 16, padding: 4, colors: 8, threshold: 30, sampling: 'dominant', removeWhite: false };
  assert.equal(exportTargets(validateSettings(old)).length, 5);
  assert.equal(exportTargets(validateSettings({ ...NEW_DEFAULTS, width: 256, height: 192, exportSet: 'classic' })).length, 6);
  assert.equal(exportTargets(validateSettings({ ...NEW_DEFAULTS, width: 32, height: 32, exportSet: 'classic' })).length, 5);
  for (const bad of [{ width: 0, height: 16 }, { width: 16.5, height: 32 }, { width: 4097, height: 1 }, { width: 4096, height: 4096, padding: 1 }, { width: 16 }, { framing: 'stretch' }, { exportSet: 'everything' }]) assert.throws(() => validateSettings({ ...NEW_DEFAULTS, ...bad }));
  assert.doesNotThrow(() => validateSettings({ ...NEW_DEFAULTS, width: 4096, height: 4096, padding: 0, colors: 256 }));
  assert.equal(generationSize({ ...NEW_DEFAULTS, width: 256, height: 192 }), '1536x1024');
  assert.equal(generationSize({ ...NEW_DEFAULTS, width: 64, height: 128 }), '1024x1536');
  assert.equal(generationSize(NEW_DEFAULTS), '1024x1024');
  assert.match(promptFor('building', 256, 32, 192), /256 by 192/);
});

test('maximum 4096 canvas and one-pixel output encode without exceeding preview bounds', async () => {
  const input = await sharp({ create: { width: 2, height: 2, channels: 4, background: { r: 30, g: 50, b: 70, alpha: 1 } } }).png().toBuffer();
  for (const size of [1, 4096]) {
    const result = await pixelate(input, { ...NEW_DEFAULTS, size, padding: 0 });
    const meta = await sharp(result.outputs[0].png).metadata();
    const preview = await sharp(result.outputs[0].preview).metadata();
    assert.equal(meta.width, size); assert.equal(meta.height, size);
    assert.ok(preview.width! <= 512 && preview.height! <= 512);
    assert.equal(result.outputs[0].variant.colors, 1);
  }
});
