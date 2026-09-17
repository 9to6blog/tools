import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { acquire, localRequest, release } from '@/lib/api';
import { readJob, saveJob, jobDir } from '@/lib/storage';
import { motionLayout } from '@/lib/animation-types';
import { finishAnimation, splitSheet } from '@/lib/animation';
import { characterReference, legacyBodyAnchor, scaleLock } from '@/lib/character-scale';
import { pixelate } from '@/lib/pixel';
import { dimensions, type Job } from '@/lib/types';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  let locked = false, job: Job | undefined;
  try {
    localRequest(request);
    const body = await request.json(), source = await readJob(String(body.sourceId));
    const motion = source.animation?.motion;
    if (source.status !== 'complete' || !motion || !source.original) throw new Error('원본과 크기 설정이 있는 캐릭터 결과를 선택하세요.');
    if (!source.scaleLock && !['stand', 'idle', 'walk', 'run'].includes(motion.action)) throw new Error('이전 도구 동작에는 몸 크기 기준 칸이 없습니다. 새 생성에서 크기 고정이 적용됩니다.');
    const id = crypto.randomUUID(); acquire(id); locked = true;
    const raw = await readFile(path.join(jobDir(source.id), source.original));
    const reference = await readFile(path.join(jobDir(source.id), 'reference.png'));
    const { width, height } = dimensions(source.settings);
    const base = (await pixelate(reference, { ...source.settings, width: motion.bodyWidth, height: motion.bodyHeight, size: Math.max(motion.bodyWidth, motion.bodyHeight), padding: 0, framing: 'trim', exportSet: 'selected' })).outputs[0].png;
    const fitted = await characterReference(base, width, height, motion.bodyWidth, motion.bodyHeight);
    const calibrated = !!source.scaleLock && source.scaleLock.method === 'calibration' && !!motion.lockScale;
    const layout = motionLayout(motion.frames + (calibrated ? 1 : 0));
    const meta = await sharp(raw).metadata();
    if (!meta.width || !meta.height || meta.width % layout.columns || meta.height % layout.rows) throw new Error('원본의 프레임 격자를 확인할 수 없습니다.');
    const spec = { name: source.animation!.name, columns: layout.columns, count: motion.frames + (calibrated ? 1 : 0), cellWidth: meta.width / layout.columns, cellHeight: meta.height / layout.rows, margin: 0, spacing: 0, start: 0, fps: motion.fps, loop: motion.loop };
    job = { id, source: source.id, created: new Date().toISOString(), prompt: `크기 보정 · ${source.prompt}`, model: 'local', quality: 'local', settings: source.settings, kind: 'motion', status: 'processing', variants: [] };
    if (!calibrated) job.scaleLock = scaleLock(fitted.bounds, await legacyBodyAnchor(await splitSheet(raw, spec)), width, height, 'legacy-body');
    await saveJob(job); await writeFile(path.join(jobDir(id), 'reference.png'), reference); await writeFile(path.join(jobDir(id), 'reference-sized.png'), fitted.png);
    return Response.json(await finishAnimation(job, raw, spec, { ...motion, lockScale: calibrated }, calibrated ? fitted.bounds : undefined));
  } catch (e) {
    const error = e instanceof Error ? e.message : '크기를 보정하지 못했습니다.';
    if (job) { job.status = 'failed'; job.error = error; await saveJob(job).catch(() => {}); }
    return Response.json({ error }, { status: 400 });
  } finally { if (locked) release(); }
}
