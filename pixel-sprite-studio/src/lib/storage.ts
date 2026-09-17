import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { zipSync, strToU8 } from 'fflate';
import { pixelate } from './pixel';
import type { Job } from './types';
export const OUTPUTS = path.join(process.cwd(), 'outputs');
export function jobDir(id: string) {
  if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error('올바르지 않은 작업 ID입니다.');
  return path.join(OUTPUTS, id);
}
export async function saveJob(job: Job) {
  const dir = jobDir(job.id); await mkdir(dir, { recursive: true });
  const tmp = path.join(dir, 'job.tmp');
  await writeFile(tmp, JSON.stringify(job, null, 2));
  await rename(tmp, path.join(dir, 'job.json'));
}
export async function readJob(id: string): Promise<Job> { return JSON.parse(await readFile(path.join(jobDir(id), 'job.json'), 'utf8')); }
export async function listJobs(): Promise<Job[]> {
  await mkdir(OUTPUTS, { recursive: true });
  const dirs = await readdir(OUTPUTS, { withFileTypes: true });
  const jobs: Job[] = [];
  for (const d of dirs.filter(d => d.isDirectory() && /^[a-f0-9-]{36}$/.test(d.name))) {
    try { jobs.push(await readJob(d.name)); } catch { /* incomplete manifest is skipped */ }
  }
  return jobs.sort((a, b) => b.created.localeCompare(a.created)).slice(0, 100);
}
export async function finishJob(job: Job, original: Buffer, processedInput?: Buffer) {
  const dir = jobDir(job.id);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, 'original.png'), original);
  if (processedInput) { await writeFile(path.join(dir, 'normalized.png'), processedInput); job.normalized = 'normalized.png'; }
  job.original = 'original.png'; job.status = 'processing'; await saveJob(job);
  const result = await pixelate(processedInput ?? original, job.settings);
  const zip: Record<string, Uint8Array> = { 'original.png': original };
  for (const reference of job.references ?? []) {
    if (!/^reference-[1-4]\.png$/.test(reference.file)) throw new Error('레퍼런스 파일명이 올바르지 않습니다.');
    zip[reference.file] = await readFile(path.join(dir, reference.file));
  }
  for (const output of result.outputs) {
    const previewFile = output.variant.previewFile ?? `preview-${output.variant.size}.png`;
    await writeFile(path.join(dir, output.variant.file), output.png);
    await writeFile(path.join(dir, previewFile), output.preview);
    zip[output.variant.file] = output.png; zip[previewFile] = output.preview;
  }
  job.variants = result.outputs.map(o => o.variant); job.warning = result.warning; job.status = 'complete';
  zip['metadata.json'] = strToU8(JSON.stringify(job, null, 2));
  zip['README.txt'] = strToU8('Pixel Sprite Studio\n원본 1장을 선택한 규격으로 변환했습니다. 크기마다 AI를 호출한 것이 아닙니다.\nsprite-WxH.png (정사각형: sprite-N.png): 게임용 PNG. 최종 가로/세로 = 목표 가로/세로 + padding * 2.\npreview-*.png: 작은 결과는 정수배 확대, 큰 결과는 512px 이내로 축소한 미리보기. 실제 게임에는 sprite 파일을 사용하세요.\n설정, 실제 출력 크기, 사용 색상 수는 metadata.json에 있습니다.\n');
  await writeFile(path.join(dir, 'sprites.zip'), zipSync(zip));
  await saveJob(job);
  return job;
}
