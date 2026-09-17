type Bin = { key: number; count: number; r: number; g: number; b: number };
type Color = { r: number; g: number; b: number };
// Deterministic weighted median cut, followed by bounded Lloyd refinement.
// Assignment uses one of exactly N centroids, so the user color cap is strict.
export function limitPalette(data: Buffer, limit: number, fixed?: string[]) {
  if (fixed?.length) { applyPalette(data, fixed); return; }
  const counts = new Uint32Array(32768), red = new Uint32Array(32768), green = new Uint32Array(32768), blue = new Uint32Array(32768);
  const exact = new Set<number>();
  for (let i = 0; i < data.length; i += 4) if (data[i + 3]) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    if (exact.size <= limit) exact.add((r << 16) | (g << 8) | b);
    const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
    counts[key]++; red[key] += r; green[key] += g; blue[key] += b;
  }
  if (exact.size <= limit) return;
  const bins: Bin[] = [];
  for (let key = 0; key < counts.length; key++) if (counts[key]) bins.push({ key, count: counts[key], r: red[key] / counts[key], g: green[key] / counts[key], b: blue[key] / counts[key] });
  const boxes: Bin[][] = [bins];
  const mean = (box: Bin[]): Color => {
    let n = 0, r = 0, g = 0, b = 0;
    for (const p of box) { n += p.count; r += p.r * p.count; g += p.g * p.count; b += p.b * p.count; }
    return { r: r / n, g: g / n, b: b / n };
  };
  while (boxes.length < limit) {
    let best = -1, bestScore = -1, channel: 'r' | 'g' | 'b' = 'r';
    boxes.forEach((box, index) => {
      if (box.length < 2) return;
      const center = mean(box);
      for (const c of ['r', 'g', 'b'] as const) {
        const variance = box.reduce((sum, p) => sum + p.count * (p[c] - center[c]) ** 2, 0);
        if (variance > bestScore) { best = index; bestScore = variance; channel = c; }
      }
    });
    if (best < 0) break;
    const box = boxes[best].sort((a, b) => a[channel] - b[channel]);
    const half = box.reduce((n, p) => n + p.count, 0) / 2;
    let weight = 0, split = 0;
    while (split < box.length - 1 && weight < half) weight += box[split++].count;
    split = Math.max(1, split);
    boxes.splice(best, 1, box.slice(0, split), box.slice(split));
  }
  let palette = boxes.map(mean);
  const closest = (p: Color) => {
    let index = 0, distance = Infinity;
    for (let i = 0; i < palette.length; i++) {
      const c = palette[i], d = (p.r - c.r) ** 2 + (p.g - c.g) ** 2 + (p.b - c.b) ** 2;
      if (d < distance) { index = i; distance = d; }
    }
    return index;
  };
  for (let round = 0; round < 6; round++) {
    const groups: Bin[][] = palette.map(() => []);
    for (const bin of bins) groups[closest(bin)].push(bin);
    palette = groups.map((group, i) => group.length ? mean(group) : palette[i]);
  }
  palette = palette.map(c => ({ r: Math.round(c.r), g: Math.round(c.g), b: Math.round(c.b) }));
  const lookup = new Uint8Array(32768);
  for (const bin of bins) lookup[bin.key] = closest(bin);
  for (let i = 0; i < data.length; i += 4) if (data[i + 3]) {
    const key = ((data[i] >> 3) << 10) | ((data[i + 1] >> 3) << 5) | (data[i + 2] >> 3);
    const c = palette[lookup[key]]; data[i] = c.r; data[i + 1] = c.g; data[i + 2] = c.b;
  }
}

export function applyPalette(data: Buffer, colors: string[]) {
  const palette = colors.map(c => parseInt(c.slice(1), 16));
  const cache = new Map<number, number>();
  for (let i = 0; i < data.length; i += 4) if (data[i + 3]) {
    const key = (data[i] << 16) | (data[i + 1] << 8) | data[i + 2];
    let chosen = cache.get(key);
    if (chosen === undefined) {
      let best = Infinity; chosen = palette[0];
      for (const p of palette) {
        const distance = (data[i] - (p >> 16)) ** 2 * 2 + (data[i + 1] - ((p >> 8) & 255)) ** 2 * 4 + (data[i + 2] - (p & 255)) ** 2 * 3;
        if (distance < best) { best = distance; chosen = p; }
      }
      if (cache.size < 65536) cache.set(key, chosen);
    }
    data[i] = chosen >> 16; data[i + 1] = (chosen >> 8) & 255; data[i + 2] = chosen & 255;
  }
}
export function paletteFromRaw(data: Buffer, limit = 16) {
  const copy = Buffer.from(data); limitPalette(copy, limit);
  const counts = new Map<string, number>();
  for (let i = 0; i < copy.length; i += 4) if (copy[i + 3] >= 128) {
    const c = '#' + copy.subarray(i, i + 3).toString('hex').toUpperCase(); counts.set(c, (counts.get(c) ?? 0) + 1);
  }
  return [...counts].sort((a, b) => b[1] - a[1]).map(([c]) => c);
}
