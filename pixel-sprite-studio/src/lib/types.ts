export const SIZES = [16, 32, 48, 64, 128] as const;
export const SIZE_PRESETS = [8, 16, 24, 32, 48, 64, 96, 128, 192, 256, 384, 512, 768, 1024, 1536, 2048, 4096] as const;
export const MAX_EDGE = 4096;
export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
export const MODELS = ['gpt-image-2.5-flare', 'gpt-image-2.5-sunburst'] as const;
export type PixelSettings = {
  size: number; padding: number; colors: number; threshold: number;
  sampling: 'dominant' | 'nearest'; removeWhite: boolean;
  width?: number; height?: number;
  exportSet?: 'selected' | 'classic'; framing?: 'trim' | 'canvas';
  view?: string; facing?: string; palette?: string[];
};
export type Variant = { size: number; canvas: number; width: number; height: number; colors: number; file: string; targetWidth?: number; targetHeight?: number; canvasWidth?: number; canvasHeight?: number; previewFile?: string };
export type ApiErrorDetails = { status?: number; code?: string; param?: string; type?: string; message?: string; requestId?: string };
export type Job = {
  id: string; status: 'generating' | 'processing' | 'complete' | 'failed';
  created: string; prompt: string; model: string; quality: string;
  settings: PixelSettings; variants: Variant[]; original?: string; error?: string;
  warning?: string; usage?: unknown; requestId?: string; source?: string; apiError?: ApiErrorDetails;
  apiSize?: string;
  animation?: import('./animation-types').AnimationInfo;
  kind?: 'image' | 'edit' | 'motion' | 'sheet';
};
export const DEFAULT_SETTINGS: PixelSettings = { size: 16, padding: 4, colors: 16, threshold: 30, sampling: 'dominant', removeWhite: false, exportSet: 'selected', framing: 'trim' };
export function dimensions(s: PixelSettings) { return { width: s.width ?? s.size, height: s.height ?? s.size }; }
export function exportTargets(s: PixelSettings) {
  const target = dimensions(s);
  const targets = s.exportSet === 'selected' ? [target] : [...SIZES.map(size => ({ width: size, height: size })), target];
  return targets.filter((t, i) => targets.findIndex(v => v.width === t.width && v.height === t.height) === i);
}
export function variantDimensions(v: Variant) { return { width: v.canvasWidth ?? v.canvas, height: v.canvasHeight ?? v.canvas }; }
export function primaryVariant(job: Job) {
  const target=dimensions(job.settings);
  return job.variants.find(v=>(v.targetWidth??v.size)===target.width&&(v.targetHeight??v.size)===target.height)??job.variants[0];
}
export function generationSize(s: PixelSettings): '1024x1024' | '1536x1024' | '1024x1536' {
  const { width, height } = dimensions(s);
  return width / height >= 1.25 ? '1536x1024' : height / width >= 1.25 ? '1024x1536' : '1024x1024';
}
export function validateSettings(value: unknown): PixelSettings {
  if (!value || typeof value !== 'object') throw new Error('픽셀 설정을 확인해 주세요.');
  const s = value as PixelSettings;
  if (!Number.isInteger(s.size) || s.size < 1 || s.size > MAX_EDGE) throw new Error(`크기는 1~${MAX_EDGE}px 정수로 입력해 주세요.`);
  if ((s.width === undefined) !== (s.height === undefined)) throw new Error('가로와 세로를 모두 입력해 주세요.');
  const { width, height } = dimensions(s);
  if (![width, height].every(n => Number.isInteger(n) && n >= 1 && n <= MAX_EDGE)) throw new Error(`가로·세로는 1~${MAX_EDGE}px 정수로 입력해 주세요.`);
  for (const [key, min, max] of [['padding', 0, 128], ['colors', 2, 256], ['threshold', 1, 99]] as const) {
    if (!Number.isInteger(s[key]) || s[key] < min || s[key] > max) throw new Error(`${key} 설정이 범위를 벗어났습니다.`);
  }
  if (!['dominant', 'nearest'].includes(s.sampling) || typeof s.removeWhite !== 'boolean') throw new Error('변환 설정이 올바르지 않습니다.');
  if (s.exportSet !== undefined && !['selected', 'classic'].includes(s.exportSet)) throw new Error('출력 묶음을 확인해 주세요.');
  if (s.framing !== undefined && !['trim', 'canvas'].includes(s.framing)) throw new Error('원본 영역 설정을 확인해 주세요.');
  if (Math.max(width, height) + s.padding * 2 > MAX_EDGE) throw new Error(`여백을 포함한 최종 캔버스는 한 변 ${MAX_EDGE}px 이하여야 합니다.`);
  if (s.view !== undefined && !['keep', 'front', 'side', 'rpg', 'top', 'quarter', 'isometric'].includes(s.view)) throw new Error('시점을 확인해 주세요.');
  if (s.facing !== undefined && !['keep', 'down', 'up', 'left', 'right', 'down_left', 'down_right', 'up_left', 'up_right'].includes(s.facing)) throw new Error('방향을 확인해 주세요.');
  if (s.palette !== undefined && (!Array.isArray(s.palette) || s.palette.length < 2 || s.palette.length > 256 || !s.palette.every(c => typeof c === 'string' && /^#[a-f0-9]{6}$/i.test(c)))) throw new Error('고정 팔레트는 #RRGGBB 색상 2~256개로 지정해 주세요.');
  return { size: Math.max(width, height), width, height, padding: s.padding, colors: s.palette?.length ?? s.colors, threshold: s.threshold, sampling: s.sampling, removeWhite: s.removeWhite, exportSet: s.exportSet ?? 'classic', framing: s.framing ?? 'trim', view: s.view ?? 'keep', facing: s.facing ?? 'keep', palette: s.palette ? [...new Set(s.palette.map(c => c.toUpperCase()))] : undefined };
}
