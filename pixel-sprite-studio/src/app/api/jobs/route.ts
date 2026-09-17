import { NextResponse } from 'next/server';
import { activeJob, acquire, apiErrorDetails, client, localRequest, promptFor, release, safeError } from '@/lib/api';
import { finishJob, listJobs, readJob, saveJob } from '@/lib/storage';
import { MODELS, dimensions, generationSize, validateSettings, type Job } from '@/lib/types';
import { artPrompt } from '@/lib/art-options';
import { tilePrompt, validateTiles } from '@/lib/tiles';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET() {
  return NextResponse.json({ jobs: await listJobs(), active: activeJob() ?? null, hasKey: !!process.env.OPENAI_API_KEY }, { headers: { 'Cache-Control': 'no-store' } });
}
export async function POST(request: Request) {
  let input, settings, openai, tiles;
  try {
    localRequest(request);
    if (Number(request.headers.get('content-length')) > 16384) throw new Error('요청이 너무 큽니다.');
    input = await request.json(); settings = validateSettings(input.settings);
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
    job = { id: input.id, created: new Date().toISOString(), prompt: input.prompt.trim(), model: input.model, quality: input.quality, settings, status: 'generating', variants: [], apiSize: generationSize(settings) };
    await saveJob(job);
    const target = dimensions(settings);
    const { data: response, request_id } = await openai.images.generate({
      model: job.model, prompt: (tiles ? tilePrompt(job.prompt, tiles) : promptFor(job.prompt, target.width, settings.colors, target.height)) + artPrompt(settings),
      n: 1, size: generationSize(settings), quality: input.quality, background: 'transparent', output_format: 'png',
    }).withResponse();
    job.requestId = request_id ?? undefined;
    const b64 = response.data?.[0]?.b64_json;
    if (!b64) throw new Error('Missing image');
    job.usage = response.usage;
    return NextResponse.json(await finishJob(job, Buffer.from(b64, 'base64')));
  } catch (error) {
    const message = safeError(error, [openai.apiKey??'']);
    const details = apiErrorDetails(error, [openai.apiKey??'']);
    if (job) { job.status = 'failed'; job.error = message; job.apiError = details; job.requestId = details?.requestId ?? job.requestId; await saveJob(job).catch(() => {}); }
    return NextResponse.json({ error: message, job }, { status: details?.status && [400,401,403,404,422,429].includes(details.status) ? details.status : 502 });
  } finally { release(); }
}
