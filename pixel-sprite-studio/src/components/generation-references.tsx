'use client';
/* eslint-disable @next/next/no-img-element */
import { useEffect, useRef, useState } from 'react';
import { Button } from './ui/button';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { MAX_REFERENCES, MAX_UPLOAD_BYTES } from '@/lib/types';

type Props = { files: File[]; onChange: (files: File[]) => void; instruction: string; onInstruction: (s: string) => void; disabled: boolean; onReading: (b: boolean) => void };
export function GenerationReferences(p: Props) {
  const input = useRef<HTMLInputElement>(null), lock = useRef(false);
  const [previews, setPreviews] = useState<string[]>([]), [error, setError] = useState('');
  useEffect(() => {
    const urls = p.files.map(file => URL.createObjectURL(file));
    const timer = setTimeout(() => setPreviews(urls), 0);
    return () => { clearTimeout(timer); urls.forEach(url => URL.revokeObjectURL(url)); };
  }, [p.files]);
  async function add(files: File[]) {
    if (lock.current || !files.length) return;
    lock.current = true; p.onReading(true); setError('');
    try {
      const next = [...p.files, ...files];
      if (next.length > MAX_REFERENCES) throw new Error(`최대 ${MAX_REFERENCES}장까지 첨부할 수 있습니다.`);
      if (next.reduce((sum, f) => sum + f.size, 0) > MAX_UPLOAD_BYTES) throw new Error('전체 용량은 50MB 이하여야 합니다.');
      for (const file of files) {
        if (!file.size || !['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) throw new Error('PNG, JPEG, WebP 이미지를 선택해 주세요.');
        const bitmap = await createImageBitmap(file), pixels = bitmap.width * bitmap.height;
        bitmap.close();
        if (pixels > 16_777_216) throw new Error('이미지 한 장은 1,677만 픽셀 이하여야 합니다.');
      }
      p.onChange(next);
    } catch (e) { setError(e instanceof Error ? e.message : '이미지를 읽지 못했습니다.'); }
    finally { lock.current = false; p.onReading(false); }
  }
  return <div className="generation-references">
    <div className="reference-heading"><strong>레퍼런스 이미지 <span>선택 사항</span></strong><span>{p.files.length} / {MAX_REFERENCES}</span></div>
    <input ref={input} className="sr-only" type="file" multiple accept="image/png,image/jpeg,image/webp" aria-label="생성 레퍼런스 이미지" disabled={p.disabled} onChange={e => { void add(Array.from(e.target.files ?? [])); e.target.value = ''; }} />
    <Button type="button" variant="outline" disabled={p.disabled || p.files.length >= MAX_REFERENCES} onClick={() => input.current?.click()}>레퍼런스 이미지 추가</Button>
    {!!p.files.length && <><div className="generation-reference-grid">{p.files.map((file, index) => <div className="generation-reference" key={`${file.name}-${index}`}>
      {previews[index] && <img className="checker" src={previews[index]} alt={`레퍼런스 ${index + 1}: ${file.name}`} />}
      <span title={file.name}>{index + 1}. {file.name}</span>
      <Button type="button" size="sm" variant="ghost" disabled={p.disabled} aria-label={`레퍼런스 ${index + 1} 제거`} onClick={() => { p.onChange(p.files.filter((_, i) => i !== index)); setError(''); }}>제거</Button>
    </div>)}</div><Label htmlFor="referencePrompt">무엇을 참고할까요?</Label><Textarea id="referencePrompt" value={p.instruction} onChange={e => p.onInstruction(e.target.value)} maxLength={2000} disabled={p.disabled} placeholder="예: 1번 캐릭터의 얼굴과 의상 유지, 2번 이미지의 색감과 도트 스타일 참고" /></>}
    <p className="help">PNG · JPEG · WebP, 전체 50MB 이하. 생성 버튼을 누를 때 첨부한 이미지와 설명을 OpenAI에 전송합니다. 참조 이미지 입력 비용이 추가되며, 결과 1장을 생성합니다.</p>
    {error && <p className="message error" role="alert">{error}</p>}
  </div>;
}
