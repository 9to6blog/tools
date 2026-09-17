import { NextResponse } from 'next/server';
import { toFile } from 'openai';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { activeJob, acquire, apiErrorDetails, client, localRequest, promptFor, release, safeError } from '@/lib/api';
import { finishJob, jobDir, listJobs, readJob, saveJob } from '@/lib/storage';
import { MAX_UPLOAD_BYTES, MODELS, dimensions, generationSize, validateSettings, type Job } from '@/lib/types';
import { readReferences, referenceInstructions } from '@/lib/references';
import { usageCost } from '@/lib/pricing';
import { artPrompt } from '@/lib/art-options';
import { tilePrompt, validateTiles } from '@/lib/tiles';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET() {
  return NextResponse.json({ jobs: await listJobs(), active: activeJob() ?? null, hasKey: !!process.env.OPENAI_API_KEY }, { headers: { 'Cache-Control': 'no-store' } });
}
export async function POST(request: Request) {
  let input, settings, openai, tiles;
  let references: Awaited<ReturnType<typeof readReferences>> = [];
  let referencePrompt = '';
  try {
    localRequest(request);
    const multipart = request.headers.get('content-type')?.startsWith('multipart/form-data');
    if (Number(request.headers.get('content-length')) > (multipart ? MAX_UPLOAD_BYTES + 65536 : 16384)) throw new Error('요청이 너무 큽니다.');
    if (multipart) {
      const form = await request.formData();
      input = { id: String(form.get('id') ?? ''), prompt: String(form.get('prompt') ?? ''), model: String(form.get('model') ?? ''), quality: String(form.get('quality') ?? ''), apiKey: form.get('apiKey'), settings: JSON.parse(String(form.get('settings'))), tiles: undefined };
      referencePrompt = String(form.get('referencePrompt') ?? '').trim();
      if (referencePrompt.length > 2000) throw new Error('레퍼런스 설명은 2,000자 이하로 입력해 주세요.');
      references = await readReferences(form);
      if (!references.length) throw new Error('레퍼런스 이미지를 첨부해 주세요.');
    } else input = await request.json();
    settings = validateSettings(input.settings);
    if (input.tiles) {
      tiles = validateTiles(input.tiles);
      settings = validateSettings({ ...settings, width: tiles.tileWidth * tiles.columns, height: tiles.tileHeight * tiles.rows, size: Math.max(tiles.tileWidth * tiles.columns, tiles.tileHeight * tiles.rows), padding: 0, exportSet: 'selected', framing: 'canvas' });
    }
    if (!/^[a-f0-9-]{36}$/.test(input.id ?? '')) throw new Error('작업 ID가 올바르지 않습니다.');
    if (typeof input.prompt !== 'string' || !input.prompt.trim() || input.prompt.length > 4000) throw new Error('그릴 내용을 1~4,000자로 입력해 주세요.');
    if (!MODELS.includes(input.model) || !['low', 'medium', 'high'].includes(input.quality)) throw new Error('모델과 품질 설정을 확인해 주세요.');
    openai = client(input.apiKey);
  } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : '요청을 확인해 주세요.' }, { status: 400 }); }
  try { acquire(input.id); } catch { return NextResponse.json({ error: '이미 처리 중인 작업이 있습니다.', active: activeJob() }, { status: 409 }); }
  let job: Job | undefined;
  try {
    const existing = await readJob(input.id).catch(() => null);
    if (existing) return NextResponse.json({ error: '이미 제출한 작업입니다. 작업 기록을 확인해 주세요.', job: existing }, { status: 409 });
    job = { id: input.id, created: new Date().toISOString(), prompt: input.prompt.trim(), model: input.model, quality: input.quality, kind: references.length ? 'reference' : 'image', settings, status: 'generating', variants: [], apiSize: generationSize(settings), ...(references.length ? { references: references.map(({ file, name }) => ({ file, name })), referencePrompt } : {}) };
    await saveJob(job);
    for (const ref of references) await writeFile(path.join(jobDir(job.id), ref.file), ref.bytes);
    const target = dimensions(settings);
    const options = { model: job.model, prompt: (tiles ? tilePrompt(job.prompt, tiles) : promptFor(job.prompt, target.width, settings.colors, target.height)) + artPrompt(settings) + (references.length ? referenceInstructions(references.length, referencePrompt) : ''), n: 1, size: generationSize(settings), quality: input.quality as 'low' | 'medium' | 'high', background: 'transparent' as const, output_format: 'png' as const };
    const { data: response, request_id } = references.length
      ? await openai.images.edit({ ...options, image: await Promise.all(references.map(ref => toFile(ref.bytes, ref.file, { type: 'image/png' }))) }).withResponse()
      : await openai.images.generate(options).withResponse();
    job.requestId = request_id ?? undefined;
    job.usage = response.usage;
    job.cost = usageCost(job.model, response.usage);
    await saveJob(job);
    const b64 = response.data?.[0]?.b64_json;
    if (!b64) throw new Error('Missing image');
    return NextResponse.json(await finishJob(job, Buffer.from(b64, 'base64')));
  } catch (error) {
    const message = safeError(error, [openai.apiKey??'']);
    const details = apiErrorDetails(error, [openai.apiKey??'']);
    if (job) { job.status = 'failed'; job.error = message; job.apiError = details; job.requestId = details?.requestId ?? job.requestId; await saveJob(job).catch(() => {}); }
    return NextResponse.json({ error: message, job }, { status: details?.status && [400,401,403,404,422,429].includes(details.status) ? details.status : 502 });
  } finally { release(); }
}
