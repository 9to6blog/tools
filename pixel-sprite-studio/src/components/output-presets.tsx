'use client';
import { useState } from 'react';
import { Label } from './ui/label';
import { Button } from './ui/button';
import { OUTPUT_PRESETS, applyOutputPreset, type OutputPreset } from '@/lib/output-presets';
import { dimensions, SIZE_PRESETS, type PixelSettings } from '@/lib/types';

export function OutputPresets({ settings, onChange }: { settings: PixelSettings; onChange: (s: PixelSettings) => void }) {
  const [selected, setSelected] = useState('');
  const d = dimensions(settings), preset = OUTPUT_PRESETS.find(p => p.id === selected);
  const active = preset && preset.width === d.width && preset.height === d.height && settings.padding === 0 ? preset : undefined;
  function choose(p: OutputPreset) { setSelected(p.id); onChange(applyOutputPreset(settings, p)); }
  return <div className="output-presets field">
    <Label htmlFor="sizePreset">출력 영역 프리셋 <span className="label-unit">용도별 추천</span></Label>
    <select id="sizePreset" value={active?.id ?? 'custom'} onChange={e => { const p = OUTPUT_PRESETS.find(p => p.id === e.target.value); if (p) choose(p); else setSelected(''); }}>
      <option value="custom">사용자 지정 · {d.width} × {d.height}px</option>
      {[...new Set(OUTPUT_PRESETS.map(p => p.group))].map(group => <optgroup key={group} label={group}>{OUTPUT_PRESETS.filter(p => p.group === group).map(p => <option value={p.id} key={p.id}>{p.label} · {p.width} × {p.height}px</option>)}</optgroup>)}
    </select>
    <div className="preset-shortcuts">{(['grass', 'tree', 'character', 'house'] as const).map(id => { const p = OUTPUT_PRESETS.find(p => p.id === id)!; return <Button key={id} type="button" size="sm" variant={active?.id === id ? 'default' : 'outline'} aria-pressed={active?.id === id} onClick={() => choose(p)}>{({ grass: '풀', tree: '나무', character: '캐릭터', house: '집' })[id]}</Button>; })}</div>
    <div className="preset-description"><strong>{active?.label ?? '사용자 지정 영역'} <span>{d.width} × {d.height}px</span></strong><p>{active?.note ?? '아래 가로·세로와 여백을 직접 입력하세요.'}</p><small>용도 프리셋은 여백 0 · 지정 크기 1개로 설정합니다. 게임의 타일·캐릭터 크기에 맞춰 조정하세요.</small></div>
    <details className="pixel-size-presets"><summary>숫자로 정사각형 크기 선택 · 8~4096px</summary><div>{SIZE_PRESETS.map(n => <button key={n} type="button" onClick={() => { setSelected(''); onChange({ ...settings, width: n, height: n, size: n, padding: n + settings.padding * 2 > 4096 ? 0 : settings.padding }); }}>{n}</button>)}</div></details>
  </div>;
}
