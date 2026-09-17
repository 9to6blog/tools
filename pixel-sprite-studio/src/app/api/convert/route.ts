import { NextResponse } from 'next/server';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { acquire, activeJob, localRequest, release } from '@/lib/api';
import { finishJob, jobDir, readJob, saveJob } from '@/lib/storage';
import { MAX_UPLOAD_BYTES, validateSettings, type Job } from '@/lib/types';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  let job: Job | undefined;
  let locked = false;
  try {
    localRequest(request);
    if (Number(request.headers.get('content-length')) > MAX_UPLOAD_BYTES + 2 * 1024 * 1024) throw new Error('50MB 이하 이미지를 사용해 주세요.');
    const form = await request.formData();
    const settings = validateSettings(JSON.parse(String(form.get('settings'))));
    const id = String(form.get('id')); jobDir(id);
    if (await readJob(id).catch(() => null)) throw new Error('이미 제출한 변환 작업입니다.');
    if (activeJob()) return NextResponse.json({ error: '현재 작업 완료 후 변환해 주세요.' }, { status: 409 });
    acquire(id); locked = true;
    let original: Buffer, prompt = '업로드 이미지', source: string | undefined;
    const sourceId = form.get('sourceId');
    if (sourceId) {
      const previous = await readJob(String(sourceId));
      if (!previous.original) throw new Error('저장된 원본이 없습니다.');
      original = await readFile(path.join(jobDir(previous.id), 'original.png'));
      prompt = previous.prompt; source = previous.id;
    } else {
      const file = form.get('image');
      if (!(file instanceof File) || file.size > MAX_UPLOAD_BYTES || file.size === 0) throw new Error('50MB 이하 PNG, JPEG, WebP 파일을 선택해 주세요.');
      const bytes = Buffer.from(await file.arrayBuffer());
      const meta = await sharp(bytes, { limitInputPixels: 16_777_216 }).metadata();
      if (!['png', 'jpeg', 'webp'].includes(meta.format ?? '') || (meta.pages ?? 1) > 1) throw new Error('단일 PNG, JPEG, WebP 파일만 지원합니다.');
      original = await sharp(bytes).rotate().png().toBuffer();
      prompt = file.name.slice(0, 150);
    }
    job = { id, created: new Date().toISOString(), prompt, model: 'local', quality: 'local', settings, status: 'processing', variants: [], source };
    await saveJob(job);
    return NextResponse.json(await finishJob(job, original));
  } catch (error) {
    const message = error instanceof Error && !error.message.includes('Input') ? error.message : '이미지를 처리하지 못했습니다. 파일 형식과 크기를 확인해 주세요.';
    if (job) { job.status = 'failed'; job.error = message; await saveJob(job).catch(() => {}); }
    return NextResponse.json({ error: message }, { status: 400 });
  } finally { if (locked) release(); }
}
