import sharp from 'sharp';

export type SpriteBounds = { left: number; top: number; width: number; height: number };
export type ScaleLock = { version: 1; method: 'calibration' | 'legacy-body'; reference: SpriteBounds; anchor: SpriteBounds; scale: number; frameWidth: number; frameHeight: number };
export function alphaBounds(data: Uint8Array, width: number, height: number): SpriteBounds | undefined {
  let left = width, top = height, right = -1, bottom = -1;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (data[(y * width + x) * 4 + 3] >= 128) { left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y); }
  return right < left ? undefined : { left, top, width: right - left + 1, height: bottom - top + 1 };
}
export async function measureSprite(image: Buffer): Promise<{ width: number; height: number; bounds: SpriteBounds }> {
  const { data, info } = await sharp(image, { limitInputPixels: 16_777_216 }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const bounds = alphaBounds(data, info.width, info.height);
  if (!bounds) throw new Error('기준 이미지에 불투명한 캐릭터가 없습니다.');
  return { width: info.width, height: info.height, bounds };
}
// Reference size is a bounding limit, never an instruction to stretch the body.
export async function characterReference(source: Buffer, width: number, height: number, bodyWidth: number, bodyHeight: number) {
  const measured = await measureSprite(source), b = measured.bounds;
  const ratio = Math.min(bodyWidth / b.width, bodyHeight / b.height);
  const w = Math.max(1, Math.round(b.width * ratio)), h = Math.max(1, Math.round(b.height * ratio));
  const left = Math.floor((width - w) / 2), top = Math.max(0, Math.min(height - h, Math.round(height * .85) - h));
  const sprite = await sharp(source).extract(b).resize(w, h, { kernel: 'nearest', fit: 'fill' }).png().toBuffer();
  const png = await sharp({ create: { width, height, channels: 4, background: '#00000000' } }).composite([{ input: sprite, left, top }]).png().toBuffer();
  return { png, bounds: (await measureSprite(png)).bounds };
}
export async function referenceGrid(reference: Buffer, size: string, columns: number, rows: number, count: number) {
  const [width, height] = size.split('x').map(Number), cellWidth = width / columns, cellHeight = height / rows;
  if (![width, height, cellWidth, cellHeight].every(n => Number.isInteger(n) && n > 0) || width * height > 16_777_216) throw new Error('생성 기준 격자의 크기를 확인해 주세요.');
  const cell = await sharp(reference).resize(cellWidth, cellHeight, { kernel: 'nearest', fit: 'contain', background: '#00000000' }).png().toBuffer();
  return sharp({ create: { width, height, channels: 4, background: '#00000000' } }).composite(Array.from({ length: count }, (_, i) => ({ input: cell, left: i % columns * cellWidth, top: Math.floor(i / columns) * cellHeight }))).png().toBuffer();
}
export function scaleLock(reference: SpriteBounds, anchor: SpriteBounds, frameWidth: number, frameHeight: number, method: ScaleLock['method'] = 'calibration'): ScaleLock {
  if (anchor.height < 1 || reference.height < 1) throw new Error('크기 기준 프레임을 확인해 주세요.');
  return { version: 1, method, reference, anchor, scale: reference.height / anchor.height, frameWidth, frameHeight };
}
// One similarity transform for the ENTIRE clip. Never fit each moving silhouette
// separately: lifted tools, strides and vertical bob must keep their relative size.
export async function alignCharacter(image: Buffer, lock: ScaleLock) {
  const { data, info } = await sharp(image, { limitInputPixels: 16_777_216 }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { frameWidth: width, frameHeight: height, scale, reference: r, anchor: a } = lock;
  const sourceX = a.left + a.width / 2, sourceY = a.top + a.height;
  const targetX = r.left + r.width / 2, targetY = r.top + r.height;
  const output = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const sx = Math.floor(sourceX + (x + .5 - targetX) / scale), sy = Math.floor(sourceY + (y + .5 - targetY) / scale);
    if (sx >= 0 && sx < info.width && sy >= 0 && sy < info.height) data.copy(output, (y * width + x) * 4, (sy * info.width + sx) * 4, (sy * info.width + sx) * 4 + 4);
  }
  const b = alphaBounds(data, info.width, info.height);
  const clipped = !!b && ((b.left - sourceX) * scale + targetX < -.5 || (b.top - sourceY) * scale + targetY < -.5 || (b.left + b.width - sourceX) * scale + targetX > width + .5 || (b.top + b.height - sourceY) * scale + targetY > height + .5);
  return { png: await sharp(output, { raw: { width, height, channels: 4 } }).png().toBuffer(), clipped };
}
export async function legacyBodyAnchor(frames: Buffer[]) {
  const bounds = await Promise.all(frames.map(f => measureSprite(f).then(m => m.bounds)));
  const median = (values: number[]) => { const sorted = values.sort((a, b) => a - b); const i = Math.floor(sorted.length / 2); return sorted.length % 2 ? sorted[i] : (sorted[i - 1] + sorted[i]) / 2; };
  const height = median(bounds.map(b => b.height)), width = median(bounds.map(b => b.width));
  const bottom = median(bounds.map(b => b.top + b.height)), center = median(bounds.map(b => b.left + b.width / 2));
  return { left: center - width / 2, top: bottom - height, width, height };
}
