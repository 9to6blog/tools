import { integer, validateMotion, type MotionSpec } from './animation-types';
import { validateSettings, type PixelSettings } from './types';

export const CHARACTER_DIRECTIONS = [['down', '정면'], ['left', '왼쪽'], ['right', '오른쪽'], ['up', '뒷모습']] as const;
export const CHARACTER_ACTIONS = [
  { action: 'walk', label: '걷기', frames: 6, loop: true, weapon: 'No new equipment. Preserve the reference clothing.' },
  { action: 'sword_slash', label: '칼질', frames: 6, loop: false, weapon: 'One sword, consistently held in the same hand.' },
  { action: 'bow', label: '활쏘기', frames: 8, loop: false, weapon: 'A bow and arrow, keep bow hand and drawing hand consistent.' },
  { action: 'fish', label: '낚시', frames: 8, loop: false, weapon: 'A fishing rod with a thin line, consistently held with the same grip.' },
  { action: 'woodcut', label: '도끼질', frames: 6, loop: true, weapon: 'A two-handed woodcutting axe. No tree or log.' },
  { action: 'hoe', label: '괭이질', frames: 6, loop: true, weapon: 'A two-handed farming hoe with its broad blade perpendicular to the handle.' },
  { action: 'mine', label: '곡괭이질', frames: 6, loop: true, weapon: 'A two-handed pickaxe with a pointed head. No rock.' },
] as const;
export type CharacterActionRow = { action: string; frames: number; fps: number; loop: boolean; directions: string[] };
export type CharacterPlan = { settings: PixelSettings; motions: MotionSpec[]; frames: number };
export function characterPlan(settings: PixelSettings, width: number, height: number, bodyWidth: number, bodyHeight: number, views: string[], rows: CharacterActionRow[]): CharacterPlan {
  const output = validateSettings({ ...settings, width, height, size: Math.max(width, height), padding: 0, exportSet: 'selected', framing: 'canvas' });
  integer(bodyWidth, 1, width, '몸 가로'); integer(bodyHeight, 1, height, '몸 세로');
  const direction = (d: string) => { if (!CHARACTER_DIRECTIONS.some(([id]) => id === d)) throw new Error('정면·왼쪽·오른쪽·뒷모습 중 방향을 선택해 주세요.'); return d; };
  const motions: MotionSpec[] = [...new Set(views)].map(d => validateMotion({ action: 'stand', direction: direction(d), frames: 1, fps: 1, loop: false, bodyWidth, bodyHeight, weapon: 'Preserve the reference outfit and equipment.', custom: 'Character turnaround from the supplied front reference. Show precisely the requested facing direction, full body in a neutral standing pose. Do not mirror asymmetric clothing or equipment.' }, output));
  const seen = new Set<string>();
  for (const row of rows) {
    const action = CHARACTER_ACTIONS.find(a => a.action === row.action);
    if (!action || seen.has(row.action)) throw new Error('지원하는 동작을 중복 없이 선택해 주세요.');
    seen.add(row.action);
    for (const d of new Set(row.directions)) motions.push(validateMotion({ ...row, direction: direction(d), bodyWidth, bodyHeight, weapon: action.weapon, custom: '' }, output));
  }
  if (!motions.length) throw new Error('생성할 모습 또는 동작의 방향을 하나 이상 선택해 주세요.');
  return { settings: output, motions, frames: motions.reduce((sum, m) => sum + m.frames, 0) };
}
export function characterClipLabel(name: string) {
  for (const [id, label] of CHARACTER_DIRECTIONS) {
    const suffix = `_${id}`;
    // Duplicates may be named walk_down_2 by the editor.
    const match = name.match(new RegExp(`${suffix}(_\\d+)?$`));
    if (match) { const action = name.slice(0, match.index); return `${action === 'stand' ? '기본 모습' : CHARACTER_ACTIONS.find(a => a.action === action)?.label ?? action} · ${label}${match[1] ? ` ${match[1].slice(1)}` : ''}`; }
  }
  return name;
}
