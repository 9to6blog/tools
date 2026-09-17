import { DIRECTIONS, artPrompt } from './art-options';
import { validateSettings, type PixelSettings } from './types';
export const ACTIONS = [
  ['idle','대기','subtle breathing idle loop',4,true], ['walk','걷기','walk in place, alternate feet and counter-swing arms',6,true],
  ['run','달리기','running in place with clear contact and flight poses',6,true],
  ['sword_slash','검 베기','sword slash: anticipation, wind-up, slash, contact, follow-through, recovery',6,false],
  ['axe_chop','도끼 내려찍기','two-handed axe overhead chop: raise, wind-up, downward strike, impact, recovery',6,false],
  ['axe_slash','도끼 가로베기','axe horizontal slash with anticipation, impact and recovery',6,false],
  ['thrust','찌르기','weapon thrust forward then recover',6,false], ['guard','방어','raise shield and hold defensive pose',4,true],
  ['hurt','피격','brief hit recoil and recovery',3,false], ['dodge','회피','dodge roll, tuck and recover, in place',6,false],
  ['death','쓰러짐','collapse to the ground and remain down on the last frame',6,false],
  ['woodcut','벌목','chop wood with an axe, no tree or extra object drawn',6,true], ['mine','채광','swing pickaxe into ground, no rock drawn',6,true],
  ['cast','마법','cast spell with hand gesture and recovery',6,false], ['jump','점프','anticipation, jump upward, descent, landing',6,false],
  ['custom','직접 지정','user-defined action',6,false],
  ['stand','방향별 모습','neutral standing pose, arms relaxed, full body visible, no action or equipment changes',1,false],
  ['bow','활쏘기','archery: raise bow, draw string, aim, release arrow, follow-through, recover; preserve bow hand and string hand',8,false],
  ['fish','낚시','fishing rod cast: prepare, swing rod, cast line, settle into fishing stance; only character, rod and line, no water or scenery',8,false],
  ['hoe','괭이질','two-handed farming hoe: raise hoe, swing down to till soil, contact, recover; no ground or scenery drawn',6,true],
] as const;
export type MotionSpec = { action: string; direction: string; frames: number; fps: number; loop: boolean; bodyWidth: number; bodyHeight: number; weapon: string; custom: string; lockScale?: boolean; phase?: { index: number; total: number } };
export type AnimationInfo = { name: string; width: number; height: number; fps: number; loop: boolean; frames: string[]; columns: number; palette: string[]; motion?: MotionSpec; warnings?: string[] };
export type FrameRef = { jobId: string; index: number; x: number; y: number; duration: number };
export type Clip = { id: string; name: string; fps: number; loop: boolean; width: number; height: number; frames: FrameRef[]; hitFrame?: number };
export type SheetSpec = { cellWidth: number; cellHeight: number; columns: number; count: number; margin: number; spacing: number; start: number; fps: number; loop: boolean; name: string };
export const MAX_ANIMATION_PIXELS = 16_777_216;
export function integer(n: unknown, min: number, max: number, label: string): number {
  if (typeof n !== 'number' || !Number.isInteger(n) || n < min || n > max) throw new Error(`${label}: ${min}~${max} 정수를 입력해 주세요.`); return n;
}
export function safeName(n: unknown) {
  if (typeof n !== 'string' || !/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(n)) throw new Error('동작 이름은 영문자로 시작하는 영문·숫자·밑줄 1~64자로 입력해 주세요.'); return n;
}
export function validateMotion(value: unknown, settings: PixelSettings): MotionSpec {
  if (!value || typeof value !== 'object') throw new Error('모션 설정이 없습니다.');
  const m = value as MotionSpec, s = validateSettings(settings);
  if (!ACTIONS.some(a => a[0] === m.action) || !DIRECTIONS.some(d => d[0] === m.direction)) throw new Error('동작과 방향을 확인해 주세요.');
  integer(m.frames,1,16,'프레임 수'); integer(m.fps,1,60,'FPS');
  integer(m.bodyWidth,1,s.width!,'몸 가로'); integer(m.bodyHeight,1,s.height!,'몸 세로');
  if (s.width! * s.height! * m.frames > MAX_ANIMATION_PIXELS) throw new Error('모션 전체 픽셀 수는 1,677만 이하로 설정해 주세요.');
  if (typeof m.loop !== 'boolean' || typeof m.weapon !== 'string' || m.weapon.length > 200 || typeof m.custom !== 'string' || m.custom.length > 1000) throw new Error('모션 설명을 확인해 주세요.');
  if (m.phase) { integer(m.phase.total,1,16,'전체 프레임'); integer(m.phase.index,0,m.phase.total-1,'교체 프레임'); }
  if (m.lockScale !== undefined && typeof m.lockScale !== 'boolean') throw new Error('크기 고정 설정을 확인해 주세요.');
  return { action: m.action, direction: m.direction, frames: m.frames, fps: m.fps, loop: m.loop, bodyWidth: m.bodyWidth, bodyHeight: m.bodyHeight, weapon: m.weapon, custom: m.custom, phase: m.phase, lockScale: m.lockScale ?? true };
}
export function motionLayout(frames: number) {
  const columns = Math.ceil(Math.sqrt(frames)); return { columns, rows: Math.ceil(frames / columns) };
}
export function motionApiSize(width: number, height: number, frames: number, lockScale = false) {
  if (![width, height].every(n => Number.isInteger(n) && n >= 1 && n <= 4096) || !Number.isInteger(frames) || frames < 1 || frames > 16) return '';
  const layout = motionLayout(frames + (lockScale ? 1 : 0));
  let cw = Math.max(128, Math.round(512 * width / Math.max(width, height) / 16) * 16);
  let ch = Math.max(128, Math.round(512 * height / Math.max(width, height) / 16) * 16);
  while (cw * layout.columns > 3 * ch * layout.rows) ch += 16;
  while (ch * layout.rows > 3 * cw * layout.columns) cw += 16;
  while (cw * ch * layout.columns * layout.rows < 655360) { cw += 16; ch += 16; }
  while (cw * ch * layout.columns * layout.rows > 4_194_304) { if (cw >= ch && cw > 128) cw -= 16; else if (ch > 128) ch -= 16; else break; }
  return `${cw * layout.columns}x${ch * layout.rows}`;
}
export function motionPrompt(subject: string, s: PixelSettings, m: MotionSpec) {
  const { columns, rows } = motionLayout(m.frames + (m.lockScale ? 1 : 0));
  const description = ACTIONS.find(a => a[0] === m.action)![2];
  return `Create a precise pixel-art animation sprite sheet of the SAME character as the reference. ${subject}\nAction: ${description}. ${m.custom}\nEquipment for action cells only: ${m.weapon || 'preserve reference equipment'}. ${artPrompt({ ...s, facing: m.direction })}\nExactly ${m.frames} different chronological animation frames ${m.lockScale ? 'AFTER the first calibration cell' : ''}, in a strict ${columns} column by ${rows} row grid, equal cells, row-major order, no gaps or margins between cells. Grid occupied cells: ${m.frames + (m.lockScale ? 1 : 0)}. ${m.lockScale ? 'CELL 0 IS A SCALE CALIBRATION: copy the neutral reference in the first input cell exactly, with its ORIGINAL facing, original pose, original equipment and original size. Never add the new action tool to cell 0. It is not an animation frame. Edit the remaining repeated reference cells into the requested action. Keep head diameter, torso length and limb thickness identical to the calibration character in every action cell; do not zoom characters to fill cells or shrink them to fit weapons. The supplied grid is a size and placement template, not multiple different characters.' : ''} Leave any unused final cells completely transparent. No text, labels, borders, grid lines, checkerboard, environment or extra characters. Transparent background.\nEach cell represents a ${s.width ?? s.size} by ${s.height ?? s.size} pixel game canvas. The BODY excluding weapons fits within ${m.bodyWidth} by ${m.bodyHeight} logical pixels. Preserve the same body scale, costume, face, equipment and handedness in ALL action cells. Fixed camera and light. Ground baseline is at 85% of every cell's height, horizontal anchor at 50%. Keep weapons and effects entirely inside their own cells. Animate IN PLACE, no horizontal travel. Do not independently enlarge or crop frames. ${m.loop ? 'Seamless loop, final pose flows into first; do not duplicate the first frame.' : 'Clear anticipation, action, recovery; distinct readable poses.'}\n${m.phase ? `Generate ONLY animation phase ${m.phase.index + 1} of ${m.phase.total}, normalized phase ${m.phase.index / Math.max(1,m.phase.total-1)}. This is a replacement frame, not an entire animation.` : ''}\nCrisp square pixel clusters, flat colors, no blur, no gradients, no antialiasing. Use at most ${s.colors} colors. Preserve character identity.`;
}
export function validateSheet(value: unknown): SheetSpec {
  if (!value || typeof value !== 'object') throw new Error('시트 설정이 없습니다.');
  const s = value as SheetSpec;
  integer(s.cellWidth,1,4096,'셀 가로'); integer(s.cellHeight,1,4096,'셀 세로'); integer(s.columns,1,256,'열 수'); integer(s.count,1,256,'프레임 수');
  integer(s.margin,0,4096,'바깥 여백'); integer(s.spacing,0,4096,'칸 간격'); integer(s.start,0,65535,'시작 칸'); integer(s.fps,1,60,'FPS'); safeName(s.name);
  if (typeof s.loop !== 'boolean') throw new Error('반복 설정을 확인해 주세요.');
  return { cellWidth:s.cellWidth, cellHeight:s.cellHeight, columns:s.columns, count:s.count, margin:s.margin, spacing:s.spacing, start:s.start, fps:s.fps, loop:s.loop, name:s.name };
}
