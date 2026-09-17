'use client';
import { useState } from 'react';
import { DIRECTIONS, VIEWS } from '@/lib/art-options';
import type { PixelSettings } from '@/lib/types';

type Point = [number, number, number];
type Block = { at: Point; size: Point; color: string };
type Sample = 'character' | 'tree' | 'house';
const samples = [['character', '캐릭터'], ['tree', '나무'], ['house', '집']] as const;
const block = (at: Point, size: Point, color: string): Block => ({ at, size, color });
const models: Record<Sample, Block[]> = {
  character: [
    block([-3, -1.5, 0], [2.5, 4, 2], '#352838'), block([0.5, -1.5, 0], [2.5, 4, 2], '#352838'),
    block([-3, -1.5, 2], [2.5, 3, 4], '#506B8A'), block([0.5, -1.5, 2], [2.5, 3, 4], '#506B8A'),
    block([-3.5, -2, 6], [7, 4, 5], '#73915B'), block([-5.5, -1.5, 6], [2, 3, 4], '#E5AD77'), block([3.5, -1.5, 6], [2, 3, 4], '#E5AD77'),
    block([-3, -2.5, 11], [6, 5, 5], '#E5AD77'), block([-3.5, -3, 15], [7, 5.5, 2], '#85544A'),
    block([-3, -3, 12], [6, 1, 3], '#85544A'),
    block([-2, 2.5, 13], [1, 0.2, 1], '#171219'), block([1, 2.5, 13], [1, 0.2, 1], '#171219'),
    block([-0.5, 2.5, 11.5], [1, 0.4, 1], '#B87A59'),
  ],
  tree: [
    block([-2, -2, 0], [4, 4, 9], '#85544A'), block([-3, -2.5, 0], [6, 5, 1], '#5B3B47'),
    block([-7, -5, 7], [14, 10, 4], '#3D6653'), block([-6, -4.5, 11], [12, 9, 4], '#73915B'),
    block([-4, -3.5, 15], [8, 7, 3], '#B0BE74'), block([-5, 4.5, 10], [2, 1, 2], '#B87A59'),
    block([3, 4.5, 12], [2, 1, 2], '#E5AD77'),
  ],
  house: [
    block([-7, -5, 0], [14, 10, 1], '#5B3B47'), block([-6, -4, 1], [12, 8, 8], '#F6DBA6'),
    block([-7, -5, 9], [14, 10, 2], '#85544A'), block([-5, -5, 11], [10, 10, 2], '#B87A59'),
    block([-3, -5, 13], [6, 10, 2], '#85544A'), block([-1, -5, 15], [2, 10, 1], '#5B3B47'),
    block([-1.5, 4, 1], [3, 0.2, 5], '#5B3B47'), block([-4.5, 4, 4], [2, 0.2, 2], '#506B8A'),
    block([2.5, 4, 4], [2, 0.2, 2], '#506B8A'), block([6, -1, 4], [0.2, 2, 2], '#506B8A'),
    block([3, -3, 12], [2, 2, 5], '#5B3B47'),
  ],
};
const cameras: Record<string, [number, number]> = { keep: [0, 35], front: [0, 0], side: [90, 0], rpg: [0, 35], top: [0, 90], quarter: [35, 35], isometric: [45, 30] };
// Screen directions: rotating toward left turns a south-facing model west.
const facingAngles: Record<string, number> = { keep: 0, down: 0, left: 90, right: -90, up: 180, down_left: 45, down_right: -45, up_left: 135, up_right: -135 };
const rgb = (hex: string) => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
function paint(hex: string, shade: number, palette?: string[]) {
  const target = rgb(hex).map(n => Math.round(Math.min(255, n * shade)));
  if (!palette?.length) return `rgb(${target.join(',')})`;
  return palette.reduce((best, candidate) => {
    const distance = (c: string) => rgb(c).reduce((sum, n, i) => sum + (n - target[i]) ** 2, 0);
    return distance(candidate) < distance(best) ? candidate : best;
  });
}
function SampleDrawing({ sample, settings }: { sample: Sample; settings: PixelSettings }) {
  const [yaw, elevation] = (cameras[settings.view ?? 'keep'] ?? cameras.keep).map(n => n * Math.PI / 180);
  const angle = (facingAngles[settings.facing ?? 'keep'] ?? 0) * Math.PI / 180;
  const rotate = ([x, y, z]: Point): Point => [x * Math.cos(angle) - y * Math.sin(angle), x * Math.sin(angle) + y * Math.cos(angle), z];
  const camera: Point = [Math.sin(yaw) * Math.cos(elevation), Math.cos(yaw) * Math.cos(elevation), Math.sin(elevation)];
  const dot = (a: Point, b: Point) => a.reduce((sum, n, i) => sum + n * b[i], 0);
  const project = ([x, y, z]: Point) => [x * Math.cos(yaw) - y * Math.sin(yaw), (x * Math.sin(yaw) + y * Math.cos(yaw)) * Math.sin(elevation) - z * Math.cos(elevation)];
  const faces = models[sample].flatMap(({ at: [x, y, z], size: [w, d, h], color }) => {
    const corners: Point[] = [[x,y,z],[x+w,y,z],[x+w,y+d,z],[x,y+d,z],[x,y,z+h],[x+w,y,z+h],[x+w,y+d,z+h],[x,y+d,z+h]];
    const sides: { indices: number[]; normal: Point; shade: number }[] = [
      { indices: [0,1,5,4], normal: [0,-1,0], shade: 0.8 }, { indices: [3,2,6,7], normal: [0,1,0], shade: 1 },
      { indices: [0,3,7,4], normal: [-1,0,0], shade: 0.75 }, { indices: [1,2,6,5], normal: [1,0,0], shade: 0.86 },
      { indices: [4,5,6,7], normal: [0,0,1], shade: 1.13 },
    ];
    return sides.filter(face => dot(rotate(face.normal), camera) > 0.001).map(face => {
      const points = face.indices.map(i => rotate(corners[i]));
      return { points: points.map(project), depth: points.reduce((sum, p) => sum + dot(p, camera), 0) / 4, color: paint(color, face.shade, settings.palette) };
    });
  }).sort((a, b) => a.depth - b.depth);
  const points = faces.flatMap(f => f.points), xs = points.map(p => p[0]), ys = points.map(p => p[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const scale = Math.min(136 / (maxX - minX), 122 / (maxY - minY));
  const offsetX = 110 - (minX + maxX) / 2 * scale, offsetY = 83 - (minY + maxY) / 2 * scale;
  return <svg viewBox="0 0 220 166" role="img" aria-label={`${samples.find(s => s[0] === sample)?.[1]} 스타일 예시`} shapeRendering="crispEdges">
    {faces.map((face, i) => <polygon key={i} points={face.points.map(([x, y]) => `${Math.round(x * scale + offsetX)},${Math.round(y * scale + offsetY)}`).join(' ')} fill={face.color} />)}
  </svg>;
}

export function StylePreview({ settings }: { settings: PixelSettings }) {
  const [sample, setSample] = useState<Sample>('character');
  const view = VIEWS.find(v => v[0] === settings.view)?.[1] ?? '현재 시점 유지';
  const facing = DIRECTIONS.find(v => v[0] === settings.facing)?.[1] ?? '현재 방향 유지';
  return <section className="style-preview" aria-label="공통 스타일 미리보기">
    <div className="style-preview-stage checker"><SampleDrawing sample={sample} settings={settings} /><span>무료 설정 예시</span></div>
    <div className="style-preview-info">
      <div className="style-preview-heading"><strong>공통 스타일 미리보기</strong><span>즉시 반영</span></div>
      <div className="style-preview-tabs" role="group" aria-label="미리보기 대상">{samples.map(([id, label]) => <button type="button" key={id} aria-pressed={sample === id} onClick={() => setSample(id)}>{label}</button>)}</div>
      <dl><div><dt>시점</dt><dd>{view}</dd></div><div><dt>방향</dt><dd>{facing}</dd></div><div><dt>팔레트</dt><dd>{settings.palette ? `${settings.palette.length}색 고정` : '자동 · 샘플 기본색'}</dd></div></dl>
      <p>샘플로 시점·방향·색감의 차이를 확인하세요. 실제 AI 생성 결과와는 다릅니다.{(!settings.view || settings.view === 'keep' || !settings.facing || settings.facing === 'keep') && ' ‘유지’는 원본을 따르는 설정이며, 예시는 RPG 시점·정면을 기본으로 표시합니다.'}</p>
    </div>
  </section>;
}
