import type { PixelSettings } from './types';
export const VIEWS = [
  ['keep', '현재 시점 유지', 'Preserve the reference camera and projection.'],
  ['front', '정면 · 눈높이', 'Eye-level camera, no top-down tilt.'],
  ['side', '측면 · 횡스크롤', 'Orthographic side-view platform game camera.'],
  ['rpg', 'RPG 내려다보기', 'Classic top-down RPG camera tilted down approximately 35 degrees; show the face and top of the head.'],
  ['top', '수직 탑다운', 'Camera vertically overhead looking straight down.'],
  ['quarter', '쿼터뷰 · 사선', 'Three-quarter oblique game camera looking down, show two sides with clear depth.'],
  ['isometric', '아이소메트릭 2:1', 'Orthographic isometric game projection with 2:1 pixel diagonal slopes, no perspective convergence.'],
] as const;
export const DIRECTIONS = [
  ['down', '아래 · 정면', 'south, toward the viewer'], ['left', '왼쪽', 'west, left side profile'],
  ['right', '오른쪽', 'east, right side profile'], ['up', '위 · 뒷면', 'north, back facing the viewer'],
  ['down_left', '왼쪽 아래 ↙', 'southwest'], ['down_right', '오른쪽 아래 ↘', 'southeast'],
  ['up_left', '왼쪽 위 ↖', 'northwest'], ['up_right', '오른쪽 위 ↗', 'northeast'],
] as const;
export const PALETTES: Record<string, string[]> = {
  '따뜻한 RPG 16': ['#171219','#352838','#5B3B47','#85544A','#B87A59','#E5AD77','#F6DBA6','#F8F0D1','#263F3D','#3D6653','#73915B','#B0BE74','#303E61','#506B8A','#85A4BA','#CCD8D8'],
  '게임보이 4': ['#0F380F','#306230','#8BAC0F','#9BBC0F'],
  '흑백 4': ['#101820','#56616A','#A4AFB7','#F2F4E8'],
};
export function artPrompt(s: Pick<PixelSettings, 'view' | 'facing' | 'palette'>) {
  const view = VIEWS.find(v => v[0] === s.view)?.[2] ?? '';
  const facing = DIRECTIONS.find(v => v[0] === s.facing)?.[2];
  return `\nCamera: ${view} ${facing ? `Character facing ${facing}. Preserve weapon handedness, never mirror asymmetric equipment.` : ''}${s.palette?.length ? `\nUse only these project palette colors: ${s.palette.join(', ')}. Preserve material color assignments across frames.` : ''}`;
}
export function parsePalette(text: string): string[] {
  const matches = text.match(/#[a-f\d]{6}\b/gi);
  if (matches?.length) return [...new Set(matches.map(c => c.toUpperCase()))];
  const colors: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const rgb = line.match(/^\s*(\d{1,3})\s+(\d{1,3})\s+(\d{1,3})(?:\s|$)/);
    if (rgb && rgb.slice(1).every(v => Number(v) <= 255)) colors.push('#' + rgb.slice(1).map(v => Number(v).toString(16).padStart(2, '0')).join('').toUpperCase());
  }
  return [...new Set(colors)];
}
