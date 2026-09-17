import sharp from 'sharp';
import { limitPalette } from './palette';
import { exportTargets, validateSettings, type PixelSettings, type Variant } from './types';

sharp.cache({ memory: 32, files: 0, items: 32 });
sharp.concurrency(1);

// Border-connected white only: preserves enclosed white eyes and markings.
function clearWhite(data: Buffer, width: number, height: number) {
  const seen = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  let head = 0, tail = 0;
  const visit = (p: number) => {
    if (seen[p]) return;
    seen[p] = 1;
    const i = p * 4;
    if (data[i + 3] < 128 || (data[i] >= 240 && data[i + 1] >= 240 && data[i + 2] >= 240)) {
      data[i + 3] = 0; queue[tail++] = p;
    }
  };
  for (let x = 0; x < width; x++) { visit(x); visit((height - 1) * width + x); }
  for (let y = 0; y < height; y++) { visit(y * width); visit(y * width + width - 1); }
  while (head < tail) {
    const p = queue[head++], x = p % width, y = Math.floor(p / width);
    if (x) visit(p - 1); if (x + 1 < width) visit(p + 1);
    if (y) visit(p - width); if (y + 1 < height) visit(p + width);
  }
}

export async function pixelate(input: Buffer, settings: PixelSettings) {
  settings = validateSettings(settings);
  const meta = await sharp(input, { limitInputPixels: 16_777_216 }).metadata();
  if (!['png', 'jpeg', 'webp'].includes(meta.format ?? '') || (meta.pages ?? 1) > 1) throw new Error('단일 PNG, JPEG, WebP 이미지를 사용해 주세요.');
  const decoded = await sharp(input, { limitInputPixels: 16_777_216 }).rotate().toColourspace('srgb').ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { data } = decoded;
  const { width, height } = decoded.info;
  if (settings.removeWhite) clearWhite(data, width, height);
  let left = width, top = height, right = -1, bottom = -1, transparent = 0;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = (y * width + x) * 4;
    if (data[i + 3] >= 128) {
      data[i + 3] = 255;
      left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y);
    } else { data.fill(0, i, i + 4); transparent++; }
  }
  if (right < left) throw new Error('이미지에서 불투명한 그림을 찾지 못했습니다. 배경 제거 설정을 확인해 주세요.');
  if (settings.framing === 'canvas') { left = 0; top = 0; right = width - 1; bottom = height - 1; }
  const boxWidth = right - left + 1, boxHeight = bottom - top + 1;
  limitPalette(data, settings.colors, settings.palette);

  const outputs: { variant: Variant; png: Buffer; preview: Buffer }[] = [];
  let enlarged = false;
  for (const { width: tw, height: th } of exportTargets(settings)) {
    const size = Math.max(tw, th);
    const scale = Math.min(tw / boxWidth, th / boxHeight);
    if (scale > 1) enlarged = true;
    const sw = Math.max(1, Math.round(boxWidth * scale)), sh = Math.max(1, Math.round(boxHeight * scale));
    const cw = tw + settings.padding * 2, ch = th + settings.padding * 2;
    const target = Buffer.alloc(cw * ch * 4);
    const ox = settings.padding + Math.floor((tw - sw) / 2), oy = settings.padding + Math.floor((th - sh) / 2);
    const used = new Set<number>();
    for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) {
      const x0 = left + Math.floor(x * boxWidth / sw), x1 = Math.min(right + 1, left + Math.max(Math.floor(x * boxWidth / sw) + 1, Math.floor((x + 1) * boxWidth / sw)));
      const y0 = top + Math.floor(y * boxHeight / sh), y1 = Math.min(bottom + 1, top + Math.max(Math.floor(y * boxHeight / sh) + 1, Math.floor((y + 1) * boxHeight / sh)));
      let winner = -1, max = 0, covered = 0;
      if (settings.sampling === 'nearest' || (x1 - x0 === 1 && y1 - y0 === 1)) {
        const cx = Math.min(right, left + Math.floor((x + .5) * boxWidth / sw)), cy = Math.min(bottom, top + Math.floor((y + .5) * boxHeight / sh));
        const i = (cy * width + cx) * 4;
        if (data[i + 3]) winner = (data[i] << 16) | (data[i + 1] << 8) | data[i + 2];
      } else {
        const counts = new Map<number, number>();
        for (let sy = y0; sy < y1; sy++) for (let sx = x0; sx < x1; sx++) {
          const i = (sy * width + sx) * 4;
          if (!data[i + 3]) continue;
          covered++;
          const color = (data[i] << 16) | (data[i + 1] << 8) | data[i + 2];
          const n = (counts.get(color) ?? 0) + 1;
          counts.set(color, n);
          if (n > max) { max = n; winner = color; }
        }
        if (covered / ((x1 - x0) * (y1 - y0)) < settings.threshold / 100) winner = -1;
      }
      if (winner < 0) continue;
      const i = ((oy + y) * cw + ox + x) * 4;
      target[i] = winner >> 16; target[i + 1] = (winner >> 8) & 255; target[i + 2] = winner & 255; target[i + 3] = 255;
      used.add(winner);
    }
    const canvas = Math.max(cw, ch);
    const png = await sharp(target, { raw: { width: cw, height: ch, channels: 4 } }).png().toBuffer();
    const zoom = canvas <= 512 ? Math.max(1, Math.floor(512 / canvas)) : 512 / canvas;
    const preview = await sharp(png).resize(Math.max(1, Math.round(cw * zoom)), Math.max(1, Math.round(ch * zoom)), { kernel: 'nearest' }).png().toBuffer();
    const suffix = tw === th ? `${tw}` : `${tw}x${th}`;
    outputs.push({ variant: { size, canvas, targetWidth: tw, targetHeight: th, canvasWidth: cw, canvasHeight: ch, width: sw, height: sh, colors: used.size, file: `sprite-${suffix}.png`, previewFile: `preview-${suffix}.png` }, png, preview });
  }
  const warnings = [];
  if (transparent === 0) warnings.push('원본에 투명 배경이 없습니다. 배경까지 함께 변환됩니다. 흰 배경이라면 배경 제거를 켤 수 있습니다.');
  if (enlarged) warnings.push('일부 출력이 원본 영역보다 큽니다. 픽셀을 확대하며, 새로운 디테일을 생성하지 않습니다.');
  return { outputs, warning: warnings.join(' ') || undefined };
}
