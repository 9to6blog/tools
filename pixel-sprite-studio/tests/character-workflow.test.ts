import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { unzipSync } from 'fflate';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { CHARACTER_ACTIONS, characterPlan, characterClipLabel } from '../src/lib/character-actions';
import { characterExport, validateExportFormat } from '../src/lib/character-export';
import { motionLayout, motionPrompt, type Clip } from '../src/lib/animation-types';
import { exportAnimation, renderFrame } from '../src/lib/animation-export';
import { DEFAULT_SETTINGS } from '../src/lib/types';
import { jobDir } from '../src/lib/storage';
import { POST as edit } from '../src/app/api/edit/route';
import { POST as download } from '../src/app/api/animation/export/route';

const rows = () => CHARACTER_ACTIONS.map(a => ({ action: a.action, frames: a.frames, fps: 8, loop: a.loop, directions: ['down'] }));
const settings = { ...DEFAULT_SETTINGS, width: 16, height: 24, size: 24, colors: 16 };
test('front reference plan covers three turnaround views and all seven actions with equipment and frame bounds', () => {
  const plan = characterPlan(settings, 16, 24, 10, 18, ['left', 'right', 'up'], rows());
  assert.equal(plan.motions.length, 10);
  assert.deepEqual(plan.motions.slice(0, 3).map(m => [m.action, m.direction, m.frames]), [['stand', 'left', 1], ['stand', 'right', 1], ['stand', 'up', 1]]);
  assert.equal(plan.frames, 49);
  for (const m of plan.motions) { const prompt = motionPrompt('Front reference', plan.settings, m); assert.match(prompt, new RegExp(`Exactly ${m.frames} different`)); assert.ok(prompt.includes(m.weapon)); assert.match(prompt, /Preserve character identity/); }
  assert.match(plan.motions.find(m => m.action === 'bow')!.weapon, /bow and arrow/);
  assert.match(plan.motions.find(m => m.action === 'hoe')!.weapon, /perpendicular/);
  assert.equal(characterClipLabel('sword_slash_left_2'), '칼질 · 왼쪽 2');
  for (const frames of [0, 17, 1.5]) assert.throws(() => characterPlan(settings, 16, 24, 10, 18, ['left'], [{ ...rows()[0], frames }]), /프레임 수/);
  assert.throws(() => characterPlan(settings, 16, 24, 17, 18, [], rows()), /몸 가로/);
  assert.throws(() => characterPlan(settings, 16, 24, 10, 18, ['diagonal'], rows()), /방향/);
  assert.throws(() => characterPlan(settings, 16, 24, 10, 18, [], []), /하나 이상/);
  assert.throws(() => characterPlan(settings, 16, 24, 10, 18, [], [rows()[0], rows()[0]]), /중복/);
});

async function fixture(n: number) {
  const raw = Buffer.alloc(16 * 24 * 4);
  for (let y = 3; y < 22; y++) for (let x = 3 + n; x < 10 + n; x++) raw.set([80 + n * 50, 150, 65, 255], (y * 16 + x) * 4);
  return sharp(raw, { raw: { width: 16, height: 24, channels: 4 } }).png().toBuffer();
}
test('direct PNG/GIF/Aseprite/frame exports match the edited timeline and full ZIP entries', async () => {
  const images = await Promise.all([0, 1, 2].map(fixture));
  const clip: Clip = { id: 'clip', name: 'hoe_down', width: 16, height: 24, fps: 8, loop: true, frames: [2, 0, 1].map((index, i) => ({ jobId: '11111111-1111-4111-8111-111111111111', index, x: i - 1, y: 2, duration: [120, 240, 360][i] })) };
  const result = await exportAnimation([clip], async (_, index) => images[index]);
  const files = unzipSync(result.zip);
  const frame = characterExport(result, [clip], 'frame', 0);
  assert.equal(frame.filename, 'hoe_down-000.png');
  assert.deepEqual(await sharp(frame.bytes).raw().toBuffer(), (await renderFrame(images[2], 16, 24, -1, 2)).raw);
  const png = characterExport(result, [clip], 'png');
  assert.deepEqual(Buffer.from(png.bytes), Buffer.from(files['pixel_assets/sheets/hoe_down.png']));
  const pngMeta = await sharp(png.bytes).metadata(); assert.equal(pngMeta.width, 32); assert.equal(pngMeta.height, 48);
  const gif = await sharp(characterExport(result, [clip], 'gif').bytes, { animated: true }).metadata(); assert.equal(gif.pages, 3); assert.deepEqual(gif.delay, [120, 240, 360]);
  const ase = Buffer.from(characterExport(result, [clip], 'aseprite').bytes); assert.equal(ase.readUInt16LE(4), 0xA5E0); assert.equal(ase.readUInt16LE(6), 3);
  assert.equal(Object.keys(unzipSync(characterExport(result, [clip], 'frames').bytes)).length, 3);
  assert.deepEqual(characterExport(result, [clip], 'zip').bytes, result.zip);
  assert.throws(() => validateExportFormat('svg', [clip], 0), /지원하지/);
  assert.throws(() => validateExportFormat('gif', [clip, clip], 0), /하나/);
  assert.throws(() => validateExportFormat('frame', [clip], 3), /프레임/);
});

test('all requested character actions reach the edit route with the front reference and all direct download formats work without paid calls', async () => {
  const originalFetch = globalThis.fetch, created: string[] = [], archive = path.resolve('test-artifacts/character-workflow');
  await mkdir(archive, { recursive: true });
  const front = await fixture(0), calls: { prompt: string; image: Uint8Array }[] = [];
  globalThis.fetch = async (url, init) => {
    assert.equal(String(url), 'https://api.openai.com/v1/images/edits');
    const form = init!.body as FormData, prompt = String(form.get('prompt'));
    const image = [...form.entries()].find(([key]) => key.startsWith('image'))![1] as File;
    calls.push({ prompt, image: new Uint8Array(await image.arrayBuffer()) });
    const count = Number(prompt.match(/Grid occupied cells: (\d+)/)![1]), layout = motionLayout(count);
    const sheet = await sharp({ create: { width: layout.columns * 16, height: layout.rows * 24, channels: 4, background: '#00000000' } }).composite(await Promise.all(Array.from({ length: count }, async (_, i) => ({ input: await fixture(i % 3), left: i % layout.columns * 16, top: Math.floor(i / layout.columns) * 24 })))).png().toBuffer();
    return new Response(JSON.stringify({ data: [{ b64_json: sheet.toString('base64') }], usage: { input_tokens: 110, input_tokens_details: { text_tokens: 10, image_tokens: 100 }, output_tokens: 100 } }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  const headers = { Host: '127.0.0.1:3216', Origin: 'http://127.0.0.1:3216', 'X-Pixel-Studio': '1' };
  try {
    const plan = characterPlan(settings, 16, 24, 10, 18, ['left', 'right', 'up'], rows());
    for (const motion of plan.motions) {
      const id = crypto.randomUUID(); created.push(id);
      const form = new FormData(); form.set('id', id); form.set('apiKey', 'sk-test-character-only-not-a-real-key'); form.set('model', 'gpt-image-2.5-flare'); form.set('quality', 'medium'); form.set('prompt', 'The supplied reference shows the FRONT.'); form.set('settings', JSON.stringify(plan.settings)); form.set('motion', JSON.stringify(motion)); form.set('image', new File([front], 'front.png', { type: 'image/png' }));
      const response = await edit(new Request('http://127.0.0.1:3216/api/edit', { method: 'POST', headers, body: form })), job = await response.json();
      assert.equal(response.status, 200, JSON.stringify(job)); assert.equal(job.animation.frames.length, motion.frames); assert.equal(job.animation.motion.direction, motion.direction); assert.ok(job.cost);
      assert.deepEqual(await readFile(path.join(jobDir(id), 'reference.png')), front);
    }
    assert.equal(calls.length, 10); for (const [i,call] of calls.entries()) { assert.match(call.prompt, /FRONT/); assert.match(call.prompt,/CELL 0 IS A SCALE CALIBRATION/); assert.ok(Buffer.from(call.image).equals(await readFile(path.join(jobDir(created[i]),'reference-guide.png')))); }
    const clip: Clip = { id: 'test', name: 'mine_down', width: 16, height: 24, fps: 8, loop: true, frames: [0, 1, 2].map(index => ({ jobId: created.at(-1)!, index, x: 0, y: 0, duration: 125 })) };
    for (const [format, mime] of [['zip', 'application/zip'], ['aseprite', 'application/octet-stream'], ['png', 'image/png'], ['gif', 'image/gif'], ['frames', 'application/zip'], ['frame', 'image/png']]) {
      const response = await download(new Request('http://127.0.0.1:3216/api/animation/export', { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ clips: [clip], format, frame: 1 }) }));
      assert.equal(response.status, 200, format); assert.equal(response.headers.get('Content-Type'), mime);
      const bytes = Buffer.from(await response.arrayBuffer()); assert.ok(bytes.length > 30); await writeFile(path.join(archive, `export-${format}.${format === 'frames' || format === 'zip' ? 'zip' : format === 'frame' ? 'png' : format}`), bytes);
    }
    assert.equal(calls.length, 10, 'downloads must never invoke the image API');
    await writeFile(path.join(archive, 'report.json'), JSON.stringify({ passed: true, mockCalls: calls.length, paidApiCalls: 0, jobIds: created }, null, 2));
  } finally {
    globalThis.fetch = originalFetch;
    for (const id of created) { const from = jobDir(id), to = path.join(archive, id); assert.ok(from.startsWith(path.resolve('outputs') + path.sep)); assert.ok(to.startsWith(archive + path.sep)); await rename(from, to).catch(e => { if (e.code !== 'ENOENT') throw e; }); }
  }
});
