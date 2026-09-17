import { zipSync } from 'fflate';
import { integer, type Clip } from './animation-types';
export const CHARACTER_EXPORT_FORMATS = ['zip', 'aseprite', 'png', 'gif', 'frames', 'frame'] as const;
export type CharacterExportFormat = typeof CHARACTER_EXPORT_FORMATS[number];
export function validateExportFormat(format: unknown, clips: Clip[], frame: unknown): CharacterExportFormat {
  const value = format ?? 'zip';
  if (!CHARACTER_EXPORT_FORMATS.includes(value as CharacterExportFormat)) throw new Error('지원하지 않는 내보내기 형식입니다.');
  if (value !== 'zip' && clips.length !== 1) throw new Error('개별 파일은 동작 하나를 선택해 내보내세요.');
  if (value === 'frame') integer(frame, 0, clips[0].frames.length - 1, '내보낼 프레임');
  return value as CharacterExportFormat;
}
export function characterExport(result: { zip: Uint8Array; entries: Record<string, Uint8Array> }, clips: Clip[], format: CharacterExportFormat, frame?: number) {
  const name = clips[0].name;
  const entry = (path: string) => { const bytes = result.entries[path]; if (!bytes) throw new Error('내보낼 파일을 찾지 못했습니다.'); return bytes; };
  if (format === 'zip') return { bytes: result.zip, mime: 'application/zip', filename: clips.length === 1 ? `${name}.zip` : 'character-sprites.zip' };
  if (format === 'aseprite') return { bytes: entry('pixel_assets/character.aseprite'), mime: 'application/octet-stream', filename: `${name}.aseprite` };
  if (format === 'png') return { bytes: entry(`pixel_assets/sheets/${name}.png`), mime: 'image/png', filename: `${name}-sheet.png` };
  if (format === 'gif') return { bytes: entry(`pixel_assets/gif/${name}.gif`), mime: 'image/gif', filename: `${name}.gif` };
  if (format === 'frame') { const index = String(integer(frame, 0, clips[0].frames.length - 1, '내보낼 프레임')).padStart(3, '0'); return { bytes: entry(`pixel_assets/frames/${name}/${index}.png`), mime: 'image/png', filename: `${name}-${index}.png` }; }
  const prefix = `pixel_assets/frames/${name}/`;
  const frames = Object.fromEntries(Object.entries(result.entries).filter(([path]) => path.startsWith(prefix)).map(([path, bytes]) => [path.slice(prefix.length), bytes]));
  return { bytes: zipSync(frames), mime: 'application/zip', filename: `${name}-frames.zip` };
}
