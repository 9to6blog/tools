import { readFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { MAX_UPLOAD_BYTES } from './types';
import { jobDir, readJob } from './storage';
export async function imageSource(form: FormData): Promise<{ bytes: Buffer; name: string; source?: string }> {
  const sourceId = form.get('sourceId');
  if (sourceId) {
    const job = await readJob(String(sourceId));
    const file = String(form.get('sourceFile') || job.original || '');
    const allowed = [job.original, ...job.variants.map(v => v.file), ...(job.animation?.frames ?? [])];
    if (!allowed.includes(file) || !/^[a-z0-9-]+\.png$/.test(file)) throw new Error('저장된 원본 또는 프레임을 선택해 주세요.');
    return { bytes: await readFile(path.join(jobDir(job.id), file)), name: job.prompt, source: job.id };
  }
  const file = form.get('image');
  if (!(file instanceof File) || !file.size || file.size > MAX_UPLOAD_BYTES) throw new Error('50MB 이하 PNG, JPEG, WebP 이미지를 선택해 주세요.');
  const bytes = Buffer.from(await file.arrayBuffer());
  const meta = await sharp(bytes, { limitInputPixels: 16_777_216 }).metadata();
  if (!['png','jpeg','webp'].includes(meta.format ?? '') || (meta.pages ?? 1) > 1) throw new Error('단일 PNG, JPEG, WebP 파일이 필요합니다.');
  return { bytes: await sharp(bytes, { limitInputPixels: 16_777_216 }).rotate().png().toBuffer(), name: file.name.slice(0,150) };
}
