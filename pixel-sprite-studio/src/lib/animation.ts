import sharp from 'sharp';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { jobDir, saveJob } from './storage';
import { pixelate } from './pixel';
import { paletteFromRaw } from './palette';
import { MAX_ANIMATION_PIXELS, validateSheet, type SheetSpec, type MotionSpec } from './animation-types';
import { dimensions, type Job } from './types';
import { alignCharacter, measureSprite, scaleLock, type SpriteBounds } from './character-scale';

export async function splitSheet(source: Buffer, spec: SheetSpec): Promise<Buffer[]> {
  const s = validateSheet(spec);
  const meta = await sharp(source, { limitInputPixels: 16_777_216 }).metadata();
  if (!meta.width || !meta.height || (meta.pages ?? 1) !== 1) throw new Error('단일 시트 이미지를 사용해 주세요.');
  if (s.cellWidth * s.cellHeight * s.count > MAX_ANIMATION_PIXELS) throw new Error('잘라낼 전체 프레임은 1,677만 픽셀 이하로 설정해 주세요.');
  if (s.margin + s.columns * s.cellWidth + (s.columns - 1) * s.spacing > meta.width) throw new Error('열 수·셀 가로·간격이 원본 가로 크기를 넘습니다.');
  const bounds = Array.from({length:s.count}, (_,i) => {
    const index = s.start + i;
    const left = s.margin + (index % s.columns) * (s.cellWidth + s.spacing);
    const top = s.margin + Math.floor(index / s.columns) * (s.cellHeight + s.spacing);
    if (left + s.cellWidth > meta.width! || top + s.cellHeight > meta.height!) throw new Error(`${i + 1}번째 프레임이 시트 범위를 벗어납니다. 시작 칸·개수를 확인해 주세요.`);
    return { left, top, width:s.cellWidth, height:s.cellHeight };
  });
  const frames: Buffer[] = [];
  for (const region of bounds) frames.push(await sharp(source).extract(region).png().toBuffer());
  return frames;
}
export async function packFrames(frames: Buffer[], width: number, height: number, columns = Math.ceil(Math.sqrt(frames.length))) {
  return sharp({create:{width:columns * width,height:Math.ceil(frames.length/columns)*height,channels:4,background:'#00000000'}})
    .composite(frames.map((input,i) => ({input,left:(i%columns)*width,top:Math.floor(i/columns)*height}))).png().toBuffer();
}
export async function finishAnimation(job: Job, source: Buffer, spec: SheetSpec, motion?: MotionSpec, reference?: SpriteBounds) {
  const dir = jobDir(job.id); await mkdir(dir,{recursive:true});
  await writeFile(path.join(dir,'original.png'),source);
  job.original = 'original.png'; job.status = 'processing'; await saveJob(job);
  const {width,height} = dimensions(job.settings);
  if (width * height * (spec.count-(motion?.lockScale&&reference?1:0)) > MAX_ANIMATION_PIXELS) throw new Error('변환 후 전체 프레임은 1,677만 픽셀 이하로 설정해 주세요.');
  const frames = await splitSheet(source,spec);
  if (motion?.lockScale && reference) {
    const calibration = frames.shift()!;
    await writeFile(path.join(dir,'calibration.png'),calibration);
    job.scaleLock = scaleLock(reference, (await measureSprite(calibration)).bounds, width, height);
  }
  const raw = await sharp(source).ensureAlpha().raw().toBuffer();
  const palette = job.settings.palette ?? paletteFromRaw(raw,job.settings.colors);
  const settings = {...job.settings,width,height,size:Math.max(width,height),padding:0,exportSet:'selected' as const,framing:'canvas' as const,palette:palette.length >= 2 ? palette : undefined};
  const processed: Buffer[] = [], warnings: string[] = [];
  for (let i=0;i<frames.length;i++) {
    const stats = await sharp(frames[i]).ensureAlpha().stats();
    let png: Buffer;
    if (stats.channels[3].max < 128) { png = await sharp({create:{width,height,channels:4,background:'#00000000'}}).png().toBuffer(); warnings.push(`프레임 ${i+1}: 빈 프레임`); }
    else {
      const aligned = job.scaleLock ? await alignCharacter(frames[i],job.scaleLock) : undefined;
      if (aligned?.clipped) warnings.push(`프레임 ${i+1}: 기준 몸 크기를 유지하면 일부가 캔버스 밖으로 나갑니다. 더 큰 프레임 영역이 필요합니다.`);
      png = (await pixelate(aligned?.png ?? frames[i],settings)).outputs[0].png;
    }
    processed.push(png);
    await writeFile(path.join(dir,`frame-${i}.png`),png);
  }
  const columns = Math.min(8,Math.ceil(Math.sqrt(frames.length)));
  const sheet = await packFrames(processed,width,height,columns);
  await writeFile(path.join(dir,'sheet.png'),sheet);
  job.animation = {name:spec.name,width,height,fps:spec.fps,loop:spec.loop,columns,frames:processed.map((_,i)=>`frame-${i}.png`),palette,motion,warnings};
  job.variants = [{size:Math.max(width,height),canvas:Math.max(width,height),width,height,canvasWidth:width,canvasHeight:height,targetWidth:width,targetHeight:height,colors:palette.length,file:'frame-0.png'}];
  job.settings = settings; job.status = 'complete';
  job.warning = [...warnings, ...(job.model !== 'local' ? ['AI의 방향·셀 배치·자세 일관성은 프레임별로 확인해 주세요. 프레임 순서·시간·위치를 편집한 뒤 내보낼 수 있습니다.'] : [])].join(' ') || undefined;
  await saveJob(job); return job;
}
