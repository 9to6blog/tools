'use client';
/* eslint-disable @next/next/no-img-element */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { CostEstimate, JobCost } from './cost-panel';
import { useWorkspaceDraft, DraftStatus } from './use-workspace-draft';
import { referenceMetrics } from '@/lib/draft-storage';
import { usePrimaryAction } from './primary-action';
import { motionApiSize, type Clip, type FrameRef } from '@/lib/animation-types';
import { CHARACTER_ACTIONS, CHARACTER_DIRECTIONS, characterPlan, characterClipLabel, type CharacterActionRow } from '@/lib/character-actions';
import type { CharacterExportFormat } from '@/lib/character-export';
import { MAX_UPLOAD_BYTES, MODELS, primaryVariant, type Job, type PixelSettings } from '@/lib/types';
import { Trash2 } from 'lucide-react';

type Props = { active: boolean; jobs: Job[]; settings: PixelSettings; apiKey: string; setApiKey: (s: string) => void; clearApiKey: () => void; apiKeyStatus: string; hasKey: boolean; model: string; setModel: (s: string) => void; quality: string; setQuality: (s: string) => void; refresh: () => Promise<void>; serverBusy: boolean; onBusy: (b: boolean) => void };
const asset = (id: string, file: string) => `/api/assets/${id}/${file}`;
const frameFile = (jobs: Job[], f: FrameRef) => { const j = jobs.find(j => j.id === f.jobId); return j?.animation?.frames[f.index] ?? j?.variants[f.index]?.file ?? `frame-${f.index}.png`; };
export function CharacterStudio(p: Props) {
  const [sourceId, setSourceId] = useState(''), [refFile, setRefFile] = useState<File | null>(null), [refUrl, setRefUrl] = useState('');
  const [subject, setSubject] = useState('정면 원본의 얼굴, 헤어스타일, 의상과 체형을 유지해 주세요.');
  const [width, setWidth] = useState(96), [height, setHeight] = useState(96), [bodyWidth, setBodyWidth] = useState(32), [bodyHeight, setBodyHeight] = useState(48);
  const [views, setViews] = useState<string[]>(['left', 'right', 'up']);
  const [rows, setRows] = useState<CharacterActionRow[]>(CHARACTER_ACTIONS.map(a => ({ action: a.action, frames: a.frames, fps: 8, loop: a.loop, directions: [] })));
  const [clips, setClips] = useState<Clip[]>([]), [selected, setSelected] = useState(''), [frame, setFrame] = useState(0), [playing, setPlaying] = useState(false), [zoom, setZoom] = useState(3);
  const [busy, setBusy] = useState(false), [reading, setReading] = useState(false), [message, setMessage] = useState(''), [error, setError] = useState(''), [progress, setProgress] = useState(''), [restore, setRestore] = useState(false);
  const stop = useRef(false), lock = useRef(false), refInput = useRef<HTMLInputElement>(null);
  const [showReference,setShowReference] = useState(false);
  const draftFiles = useMemo(() => ({ refFile }), [refFile]);
  const draft = useWorkspaceDraft('character', { sourceId, subject, width, height, bodyWidth, bodyHeight, views, rows, selected, zoom }, draftFiles, (data,saved) => {
    if (typeof data.sourceId === 'string') setSourceId(data.sourceId);
    if (typeof data.subject === 'string') setSubject(data.subject.slice(0,3500));
    const dimension = (value:unknown,fallback:number) => typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 4096 ? value : fallback;
    setWidth(dimension(data.width,96)); setHeight(dimension(data.height,96)); setBodyWidth(dimension(data.bodyWidth,32)); setBodyHeight(dimension(data.bodyHeight,48));
    if (Array.isArray(data.views)) setViews([...new Set(data.views.filter((v):v is string => CHARACTER_DIRECTIONS.some(([id])=>id===v)))]);
    if (Array.isArray(data.rows)) setRows(CHARACTER_ACTIONS.map(a=>{const row=(data.rows as CharacterActionRow[]).find(r=>r?.action===a.action);return {action:a.action,frames:row&&Number.isInteger(row.frames)&&row.frames>=1&&row.frames<=16?row.frames:a.frames,fps:row&&Number.isInteger(row.fps)&&row.fps>=1&&row.fps<=60?row.fps:8,loop:typeof row?.loop==='boolean'?row.loop:a.loop,directions:Array.isArray(row?.directions)?[...new Set(row.directions.filter(d=>CHARACTER_DIRECTIONS.some(([id])=>id===d)))]:[]};}));
    if (typeof data.selected === 'string') setSelected(data.selected);
    if ([1,2,3,4,6,8].includes(Number(data.zoom))) setZoom(Number(data.zoom));
    if (saved.refFile instanceof File) setRefFile(saved.refFile);
  });
  const disabled = !draft.ready || busy || reading || p.serverBusy;
  const clip = clips.find(c => c.id === selected) ?? clips[0], frameIndex = clip ? Math.min(frame, clip.frames.length - 1) : 0, current = clip?.frames[frameIndex];
  const totalCalls = views.length + rows.reduce((sum, r) => sum + r.directions.length, 0), totalFrames = views.length + rows.reduce((sum, r) => sum + r.directions.length * r.frames, 0);
  useEffect(() => { const t = setTimeout(() => { try { const saved = JSON.parse(localStorage.getItem('pixel-studio-animation-v1') ?? '[]'); if (Array.isArray(saved) && saved.length <= 128) setClips(saved.filter(c => c && Array.isArray(c.frames) && c.frames.length > 0 && c.frames.length <= 256)); } catch {} setRestore(true); }, 0); return () => clearTimeout(t); }, []);
  useEffect(() => { if (restore) try { localStorage.setItem('pixel-studio-animation-v1', JSON.stringify(clips)); } catch {} }, [clips, restore]);
  useEffect(() => { if (!refFile) return; const u = URL.createObjectURL(refFile), t = setTimeout(() => setRefUrl(u), 0); return () => { clearTimeout(t); URL.revokeObjectURL(u); }; }, [refFile]);
  useEffect(() => { if (!p.active || !playing || !clip) return; const timer = setTimeout(() => { if (frameIndex + 1 >= clip.frames.length && !clip.loop) { setPlaying(false); return; } setFrame((frameIndex + 1) % clip.frames.length); }, clip.frames[frameIndex].duration); return () => clearTimeout(timer); }, [p.active, playing, clip, frameIndex]);
  function updateClip(patch: Partial<Clip>) { if (clip) setClips(cs => cs.map(c => c.id === clip.id ? { ...c, ...patch } : c)); }
  function updateFrame(patch: Partial<FrameRef>) { if (clip) updateClip({ frames: clip.frames.map((f, i) => i === frameIndex ? { ...f, ...patch } : f) }); }
  function addJob(job: Job) { const a = job.animation; if (!a) return; const id = crypto.randomUUID(); setClips(cs => { let name = a.name, n = 2; while (cs.some(c => c.name === name)) name = `${a.name}_${n++}`; return [...cs, { id, name, width: a.width, height: a.height, fps: a.fps, loop: a.loop, frames: a.frames.map((_, index) => ({ jobId: job.id, index, x: 0, y: 0, duration: Math.round(1000 / a.fps) })) }]; }); setSelected(id); setFrame(0); setPlaying(false); }
  async function fitReference(file: Blob) {
    const measured = await referenceMetrics(file);
    const ratio = Math.max(measured.bodyWidth,measured.bodyHeight)>512 ? Math.min(32/measured.bodyWidth,48/measured.bodyHeight) : 1;
    const w=Math.max(1,Math.round(measured.bodyWidth*ratio)),h=Math.max(1,Math.round(measured.bodyHeight*ratio));
    setBodyWidth(w);setBodyHeight(h);setWidth(v=>Math.max(v,Math.ceil(w*1.6/8)*8));setHeight(v=>Math.max(v,Math.ceil(h/.85/8)*8));
    setMessage(`원본 불투명 영역 ${measured.bodyWidth}×${measured.bodyHeight}px → 기준 몸 ${w}×${h}px. 여백과 몸 크기를 구분해 적용합니다.`);
  }
  async function chooseSource(id:string) {
    setSourceId(id);setRefFile(null);setError('');if(!id)return;setReading(true);
    try {const job=p.jobs.find(j=>j.id===id);if(!job)throw new Error('저장된 기준 이미지를 찾지 못했습니다.');const file=job.animation?.frames[0]??primaryVariant(job)?.file??'original.png';const r=await fetch(asset(id,file));if(!r.ok)throw new Error('기준 이미지를 읽지 못했습니다.');await fitReference(await r.blob());}catch(e){setError((e as Error).message);}finally{setReading(false);}
  }
  async function chooseFile(file: File) {
    setReading(true); setError('');
    try { if (!file.size || file.size > MAX_UPLOAD_BYTES || !['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) throw new Error('50MB 이하 PNG, JPEG, WebP 정면 이미지를 선택하세요.'); await fitReference(file); setRefFile(file); setSourceId(''); }
    catch (e) { setError((e as Error).message); } finally { setReading(false); }
  }
  function begin() { if (lock.current || disabled) return false; lock.current = true; setBusy(true); p.onBusy(true); setError(''); setMessage(''); setPlaying(false); stop.current = false; return true; }
  async function end() { lock.current = false; setBusy(false); p.onBusy(false); setProgress(''); await p.refresh(); }
  async function generate() {
    if (!begin()) return;
    let done = 0;
    try {
      if (!refFile && !sourceId) throw new Error('정면 이미지를 먼저 선택해 주세요.');
      if (!p.apiKey.trim() && !p.hasKey) throw new Error('OpenAI API 키를 입력해 주세요.');
      // Validate the entire batch before the first paid request.
      const plan = characterPlan(p.settings, width, height, bodyWidth, bodyHeight, views, rows);
      let palette = p.settings.palette;
      for (const motion of plan.motions) {
        if (stop.current) { setMessage(`${done}개 결과를 저장하고 중단했습니다.`); return; }
        setProgress(`${done + 1} / ${plan.motions.length} · ${characterClipLabel(`${motion.action}_${motion.direction}`)} 생성 중`);
        const form = new FormData();
        if (refFile) form.set('image', refFile); else { const source = p.jobs.find(j => j.id === sourceId); form.set('sourceId', sourceId); form.set('sourceFile', source?.animation?.frames[0] ?? (source ? primaryVariant(source)?.file : undefined) ?? 'original.png'); }
        form.set('id', crypto.randomUUID()); form.set('apiKey', p.apiKey); form.set('model', p.model); form.set('quality', p.quality); form.set('prompt', `The supplied reference shows the FRONT of this character. Preserve identity and proportions. ${subject}`);
        form.set('settings', JSON.stringify({ ...plan.settings, palette })); form.set('motion', JSON.stringify(motion));
        const response = await fetch('/api/edit', { method: 'POST', headers: { 'X-Pixel-Studio': '1' }, body: form }), data = await response.json();
        if (!response.ok) throw new Error(data.error || '생성하지 못했습니다.');
        addJob(data); if (!palette && data.animation?.palette?.length >= 2) palette = data.animation.palette;
        done++; await p.refresh();
      }
      setMessage(`${done}개 결과를 저장했습니다. 방향·동작과 프레임 연결을 재생해 확인하고 내보내세요.`);
    } catch (e) { setError(`${(e as Error).message} 완료된 ${done}개 결과는 보존되며 자동 재시도하지 않습니다.`); }
    finally { await end(); }
  }
  async function normalizeCurrent() {
    if(!current||!begin())return;
    try{const response=await fetch('/api/animation/normalize',{method:'POST',headers:{'Content-Type':'application/json','X-Pixel-Studio':'1'},body:JSON.stringify({sourceId:current.jobId})}),data=await response.json();if(!response.ok)throw new Error(data.error);addJob(data);setMessage('원본에서 기준 몸 크기로 보정한 결과를 추가했습니다. 기존 결과는 보존됩니다. API 호출 없이 무료입니다.');}catch(e){setError((e as Error).message);}finally{await end();}
  }
  async function exportClips(all: boolean, format: CharacterExportFormat) {
    if (!begin()) return;
    try {
      const response = await fetch('/api/animation/export', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Pixel-Studio': '1' }, body: JSON.stringify({ clips: all ? clips : clip ? [clip] : [], palette: p.settings.palette, format, frame: frameIndex }) });
      if (!response.ok) throw new Error((await response.json()).error);
      const url = URL.createObjectURL(await response.blob()), a = document.createElement('a'); a.href = url; a.download = response.headers.get('Content-Disposition')?.match(/filename="([^"]+)"/)?.[1] ?? 'character-sprites.zip'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 30000);
      setMessage(`${a.download} 다운로드 완료. 프레임 편집 내용을 반영했습니다.`);
    } catch (e) { setError((e as Error).message); } finally { await end(); }
  }
  const source = p.jobs.find(j => j.id === sourceId), sourcePreview = refFile ? refUrl : source ? asset(source.id, source.animation?.frames[0] ?? primaryVariant(source)?.file ?? 'original.png') : '';
  const requests = [...views.map(() => 1), ...rows.flatMap(row => row.directions.map(() => row.frames))].map(frames => ({ model: p.model, quality: p.quality, apiSize: motionApiSize(width, height, frames, true), kind: 'motion' as const, referenceCount: 1 }));
  usePrimaryAction(p.active, { label: `선택한 ${totalCalls}개 생성 · 유료`, detail: `${totalCalls}회 API 호출 · 총 ${totalFrames}프레임`, disabled: disabled || !totalCalls || (!refFile && !sourceId), error, run: generate });
  return <div className="animation-workspace character-workspace"><DraftStatus {...draft}/><div className="character-intro"><strong>정면 한 장으로, 캐릭터의 모습과 동작까지.</strong><p>1. 정면 원본 추가 → 2. 좌·우·뒷모습과 동작 선택 → 3. 재생·편집·내보내기</p></div><div className="animation-builder">
    <section className="control-panel"><div className="panel-title"><h2>1. 정면 원본</h2><span>REFERENCE</span></div><div className="animation-controls"><fieldset disabled={disabled}>
      <div className="reference-picker"><Button variant="outline" onClick={()=>refInput.current?.click()}>정면 이미지 추가</Button><input hidden ref={refInput} type="file" accept="image/png,image/jpeg,image/webp" aria-label="캐릭터 정면 이미지" onChange={e=>{const f=e.target.files?.[0];e.target.value='';if(f)void chooseFile(f);}}/>{refFile&&<span className="help">{refFile.name}</span>}
      <Label htmlFor="characterSource">또는 저장된 정면 결과 선택</Label><select id="characterSource" value={refFile?'file':sourceId} onChange={e=>{void chooseSource(e.target.value);}}><option value="">선택하세요</option>{refFile&&<option value="file">업로드한 이미지</option>}{p.jobs.filter(j=>j.status==='complete').map(j=><option key={j.id} value={j.id}>{j.prompt.slice(0,65)}</option>)}</select>{sourcePreview?<img className="reference-preview checker" src={sourcePreview} alt="캐릭터 정면 원본"/>:<div className="character-reference-empty">얼굴부터 발끝까지 보이는<br/>정면 이미지 한 장을 추가하세요.</div>}</div>
      <div className="field"><Label htmlFor="characterSubject">캐릭터 특징 · 유지할 요소</Label><Textarea id="characterSubject" value={subject} maxLength={3500} onChange={e=>setSubject(e.target.value)}/></div>
      <div className="field-pair"><div className="field"><Label htmlFor="characterWidth">프레임 가로 px</Label><Input id="characterWidth" type="number" min={1} max={4096} value={width} onChange={e=>setWidth(Number(e.target.value))}/></div><div className="field"><Label htmlFor="characterHeight">프레임 세로 px</Label><Input id="characterHeight" type="number" min={1} max={4096} value={height} onChange={e=>setHeight(Number(e.target.value))}/></div></div>
      <div className="field-pair"><div className="field"><Label htmlFor="bodyWidth">몸 가로 px</Label><Input id="bodyWidth" type="number" min={1} max={width} value={bodyWidth} onChange={e=>setBodyWidth(Number(e.target.value))}/></div><div className="field"><Label htmlFor="bodyHeight">몸 세로 px</Label><Input id="bodyHeight" type="number" min={1} max={height} value={bodyHeight} onChange={e=>setBodyHeight(Number(e.target.value))}/></div></div><p className="help">원본의 투명 여백을 제외한 크기를 자동 측정합니다. 생성 기준 이미지를 배치하고, 결과의 기준 칸으로 시트 전체에 같은 배율을 적용합니다. 도구가 뻗는 영역은 몸 크기로 계산하지 않습니다.</p>
      <div className="field-pair"><div className="field"><Label htmlFor="characterModel">모델</Label><select id="characterModel" value={p.model} onChange={e=>p.setModel(e.target.value)}>{MODELS.map(m=><option key={m}>{m}</option>)}</select></div><div className="field"><Label htmlFor="characterQuality">품질</Label><select id="characterQuality" value={p.quality} onChange={e=>p.setQuality(e.target.value)}><option value="low">빠르게</option><option value="medium">균형</option><option value="high">고품질</option></select></div></div>
      <div className="field"><Label htmlFor="characterKey">OpenAI API 키</Label><div className="key-input-row"><Input id="characterKey" type="password" autoComplete="off" spellCheck={false} maxLength={512} value={p.apiKey} placeholder={p.hasKey?'환경 변수 키 사용':'sk-…'} onChange={e=>p.setApiKey(e.target.value)}/><Button className="key-clear" type="button" size="sm" variant="ghost" onClick={p.clearApiKey} disabled={!p.apiKey} aria-label="브라우저에 저장된 API 키 삭제"><Trash2 size={14}/> 삭제</Button></div><p className="help">이 브라우저의 localStorage에 저장됩니다. 공용 PC에서는 사용하지 말고, 필요 없을 때 삭제하세요. 생성 버튼을 누를 때 요금이 발생합니다.</p>{p.apiKeyStatus&&<p className="key-status" role="status">{p.apiKeyStatus}</p>}</div>
    </fieldset></div></section>
    <section className="control-panel character-selection"><div className="panel-title"><h2>2. 모습 · 동작 선택</h2><span>1~16 FRAMES</span></div><div className="animation-controls"><fieldset disabled={disabled}>
      <div className="character-section-heading"><h3>좌·우·뒷모습</h3><span>방향당 정지 이미지 1장</span></div>
      <div className="character-views">{CHARACTER_DIRECTIONS.map(([id,label])=>{const c=[...clips].reverse().find(c=>c.name===`stand_${id}`||c.name.startsWith(`stand_${id}_`));const f=c?.frames[0];return <label key={id} className={views.includes(id)?'selected':''}><span className="character-view-image checker">{f?<img src={asset(f.jobId,frameFile(p.jobs,f))} alt={`${label} 생성 결과`}/>:id==='down'&&sourcePreview?<img src={sourcePreview} alt="정면 원본"/>:<span>{id==='left'?'←':id==='right'?'→':id==='up'?'↑':'↓'}</span>}</span><span><input type="checkbox" aria-label={`${label} 모습 생성`} checked={views.includes(id)} onChange={e=>setViews(v=>e.target.checked?[...v,id]:v.filter(d=>d!==id))}/>{label}</span></label>;})}</div>
      <p className="help">정면은 추가한 원본을 표시합니다. 같은 프레임 크기의 정면 결과도 필요하면 정면을 선택하세요. 각 모습은 원본을 참조해 따로 생성하며 단순 좌우 반전이 아닙니다.</p>
      <div className="character-section-heading"><h3>동작 스프라이트 시트</h3><span>방향마다 시트 1장</span></div><div className="button-row"><Button type="button" size="sm" variant="outline" onClick={()=>{setViews([]);setRows(rs=>rs.map(r=>({...r,directions:r.action==='walk'?['down','left','right','up']:[]})));}}>걷기 4방향</Button><Button type="button" size="sm" variant="outline" onClick={()=>setRows(rs=>rs.map(r=>({...r,directions:['down','left','right','up']})))}>모든 동작 4방향</Button><Button type="button" size="sm" variant="ghost" onClick={()=>{setViews([]);setRows(rs=>rs.map(r=>({...r,directions:[]})));}}>전체 해제</Button></div>
      <div className="character-action-grid">{rows.map((row,i)=><div className={`character-action-card ${row.directions.length?'selected':''}`} key={row.action}><div className="character-action-title"><strong>{CHARACTER_ACTIONS[i].label}</strong><span>{row.directions.length?`${row.directions.length}방향 · ${row.directions.length*row.frames}프레임`:'방향을 선택하세요'}</span></div><div className="character-action-options"><label>프레임<select aria-label={`${CHARACTER_ACTIONS[i].label} 프레임 수`} value={row.frames} onChange={e=>setRows(rs=>rs.map((r,n)=>n===i?{...r,frames:Number(e.target.value)}:r))}>{Array.from({length:16},(_,n)=>n+1).map(n=><option key={n} value={n}>{n}장</option>)}</select></label><label>FPS<input aria-label={`${CHARACTER_ACTIONS[i].label} FPS`} type="number" min={1} max={60} value={row.fps} onChange={e=>setRows(rs=>rs.map((r,n)=>n===i?{...r,fps:Number(e.target.value)}:r))}/></label><label className="character-loop"><input type="checkbox" checked={row.loop} onChange={e=>setRows(rs=>rs.map((r,n)=>n===i?{...r,loop:e.target.checked}:r))}/><span>반복</span></label></div><div className="character-direction-picks">{CHARACTER_DIRECTIONS.map(([id,label])=><label key={id}><input type="checkbox" aria-label={`${CHARACTER_ACTIONS[i].label} ${label}`} checked={row.directions.includes(id)} onChange={e=>setRows(rs=>rs.map((r,n)=>n===i?{...r,directions:e.target.checked?[...r.directions,id]:r.directions.filter(d=>d!==id)}:r))}/>{label}</label>)}</div></div>)}</div>
    </fieldset><div className="batch-total"><strong>선택 {totalCalls}개 · 총 {totalFrames}프레임</strong><p>API {totalCalls}회 순차 실행 · 요청마다 크기 기준 1칸 포함 · 결과 프레임 수에는 제외</p></div><CostEstimate jobs={p.jobs} requests={requests}/><Button className="generate-button" disabled={disabled||!totalCalls||(!refFile&&!sourceId)} onClick={generate}>선택한 {totalCalls}개 생성 · 유료</Button>{busy&&progress&&<Button variant="outline" className="stop-button" onClick={()=>{stop.current=true;setMessage('현재 요청이 끝나면 다음 생성부터 중단합니다.');}}>현재 요청 이후 중단</Button>}<p className="help">고정 팔레트가 없으면 첫 결과의 팔레트를 이번 묶음에 공유합니다. AI가 만든 방향과 동작의 일관성은 아래에서 재생해 확인하세요.</p></div></section>
  </div><div aria-live="polite">{progress&&<div className="message success">{progress}</div>}{message&&<div className="message success">{message}</div>}{error&&<div className="message error" role="alert">{error}</div>}</div>
  <section className="animation-editor control-panel"><div className="panel-title"><h2>프레임 편집 · 재생 · 내보내기</h2><span>{clips.length} CLIPS</span></div><div className="editor-layout"><aside className="clip-list"><p className="help">작업 목록은 이 브라우저에 자동 저장됩니다.</p>{clips.map(c=><button disabled={disabled} className={clip?.id===c.id?'selected':''} key={c.id} onClick={()=>{setSelected(c.id);setFrame(0);setPlaying(false);}}><strong>{characterClipLabel(c.name)}</strong><small>{c.frames.length}프레임 · {c.width}×{c.height}px</small></button>)}<details><summary>저장된 결과 추가</summary>{p.jobs.filter(j=>j.animation&&j.status==='complete').map(j=><Button key={j.id} size="sm" variant="ghost" disabled={disabled} onClick={()=>addJob(j)}>{characterClipLabel(j.animation!.name)} · {j.animation!.frames.length}F</Button>)}</details></aside>
  {clip&&current?<div className="clip-editor"><div className="playback-stage checker"><div className="playback-frame" style={{width:clip.width*zoom,height:clip.height*zoom}}><img src={asset(current.jobId,frameFile(p.jobs,current))} alt={`${clip.name} ${frameIndex+1}번째 프레임`} width={clip.width} height={clip.height} style={{width:clip.width*zoom,height:clip.height*zoom,transform:`translate(${current.x*zoom}px, ${current.y*zoom}px)`}}/><>{showReference&&p.jobs.find(j=>j.id===current.jobId)?.scaleLock&&<img className="reference-ghost" src={asset(current.jobId,'reference-sized.png')} alt="기준 몸 크기 비교" style={{width:clip.width*zoom,height:clip.height*zoom}}/>}</><span className="foot-guide" style={{top:Math.round(clip.height*.85)*zoom}}/></div></div><div className="playback-controls"><Button size="sm" onClick={()=>{if(!playing&&frameIndex===clip.frames.length-1)setFrame(0);setPlaying(!playing);}}>{playing?'일시 정지':'▶ 재생'}</Button><Button size="sm" variant="outline" onClick={()=>{setPlaying(false);setFrame(Math.max(0,frameIndex-1));}}>이전</Button><span className="mono">{frameIndex+1} / {clip.frames.length}</span><Button size="sm" variant="outline" onClick={()=>{setPlaying(false);setFrame(Math.min(clip.frames.length-1,frameIndex+1));}}>다음</Button><Label htmlFor="animationZoom">배율</Label><select id="animationZoom" value={zoom} onChange={e=>setZoom(Number(e.target.value))}>{[1,2,3,4,6,8].map(n=><option key={n} value={n}>{n}×</option>)}</select></div>
    {p.jobs.find(j=>j.id===current.jobId)?.scaleLock&&<label className="checkbox-label"><input type="checkbox" checked={showReference} onChange={e=>setShowReference(e.target.checked)}/>기준 원본 겹쳐보기 · 몸 크기 비교</label>}
    {p.jobs.find(j=>j.id===current.jobId)?.warning&&<p className="message warning">{p.jobs.find(j=>j.id===current.jobId)?.warning}</p>}
    <fieldset disabled={disabled}><div className="button-row"><Button variant="outline" size="sm" onClick={normalizeCurrent} disabled={!p.jobs.find(j=>j.id===current.jobId)?.animation?.motion}>원본에서 몸 크기 보정본 추가 · 무료</Button></div><div className="clip-options"><div className="field"><Label htmlFor="clipName">동작 이름</Label><Input id="clipName" value={clip.name} maxLength={64} onChange={e=>updateClip({name:e.target.value})}/></div><div className="field"><Label htmlFor="clipFps">FPS · 전체 프레임에 적용</Label><Input id="clipFps" type="number" min={1} max={60} value={clip.fps} onChange={e=>{const fps=Number(e.target.value);if(fps>=1&&fps<=60)updateClip({fps,frames:clip.frames.map(f=>({...f,duration:Math.round(1000/fps)}))});}}/></div><label className="checkbox-label"><input type="checkbox" checked={clip.loop} onChange={e=>updateClip({loop:e.target.checked})}/>반복</label></div>
    <div className="frame-strip">{clip.frames.map((f,i)=><button key={i} aria-label={`프레임 ${i+1}`} className={frameIndex===i?'selected':''} onClick={()=>{setFrame(i);setPlaying(false);}}><img src={asset(f.jobId,frameFile(p.jobs,f))} alt=""/><span>{i+1}{clip.hitFrame===i?' · HIT':''}</span></button>)}</div>
    <div className="clip-options"><div className="field"><Label htmlFor="frameX">선택 프레임 X 이동</Label><Input id="frameX" type="number" min={-4096} max={4096} value={current.x} onChange={e=>updateFrame({x:Number(e.target.value)})}/></div><div className="field"><Label htmlFor="frameY">Y 이동 · 발 위치 조정</Label><Input id="frameY" type="number" min={-4096} max={4096} value={current.y} onChange={e=>updateFrame({y:Number(e.target.value)})}/></div><div className="field"><Label htmlFor="frameDuration">시간 ms</Label><Input id="frameDuration" type="number" min={10} max={60000} value={current.duration} onChange={e=>updateFrame({duration:Number(e.target.value)})}/></div></div>
    <div className="button-row"><Button size="sm" variant="outline" disabled={frameIndex===0} onClick={()=>{const a=[...clip.frames];[a[frameIndex-1],a[frameIndex]]=[a[frameIndex],a[frameIndex-1]];updateClip({frames:a,hitFrame:undefined});setFrame(frameIndex-1);}}>← 순서 앞으로</Button><Button size="sm" variant="outline" disabled={frameIndex===clip.frames.length-1} onClick={()=>{const a=[...clip.frames];[a[frameIndex+1],a[frameIndex]]=[a[frameIndex],a[frameIndex+1]];updateClip({frames:a,hitFrame:undefined});setFrame(frameIndex+1);}}>순서 뒤로 →</Button><Button size="sm" variant="outline" onClick={()=>{updateClip({frames:[...clip.frames.slice(0,frameIndex+1),{...current},...clip.frames.slice(frameIndex+1)],hitFrame:undefined});}}>복제</Button><Button size="sm" variant="ghost" disabled={clip.frames.length===1} onClick={()=>{updateClip({frames:clip.frames.filter((_,i)=>i!==frameIndex),hitFrame:undefined});setFrame(Math.max(0,frameIndex-1));}}>프레임 제외</Button><Button size="sm" variant="outline" onClick={()=>updateClip({hitFrame:clip.hitFrame===frameIndex?undefined:frameIndex})}>타격 시점 {clip.hitFrame===frameIndex?'해제':'표시'}</Button></div><p className="help">초록선은 발 기준선(높이의 85%)입니다. 이동 후 캔버스 밖 픽셀은 잘립니다. 타격 표시는 내보내기 메타데이터에 저장됩니다.</p>
    {current&&p.jobs.find(j=>j.id===current.jobId)&&<JobCost job={p.jobs.find(j=>j.id===current.jobId)!}/>}
    <div className="export-section"><strong>선택한 동작 내보내기 · 무료</strong><div className="button-row export-formats">
      <Button variant="outline" onClick={()=>exportClips(false,'aseprite')}>Aseprite</Button>
      <Button variant="outline" onClick={()=>exportClips(false,'png')}>시트 PNG</Button>
      <Button variant="outline" onClick={()=>exportClips(false,'gif')}>GIF</Button>
      <Button variant="outline" onClick={()=>exportClips(false,'frame')}>현재 프레임 PNG</Button>
      <Button variant="outline" onClick={()=>exportClips(false,'frames')}>각 프레임 PNG 묶음</Button>
      <Button variant="outline" onClick={()=>exportClips(false,'zip')}>현재 동작 ZIP</Button>
    </div><div className="button-row"><Button onClick={()=>exportClips(true,'zip')}>전체 ZIP 내보내기 · {clips.length}개</Button><Button variant="ghost" onClick={()=>{setClips(cs=>cs.filter(c=>c.id!==clip.id));setSelected('');setFrame(0);setPlaying(false);}}>목록에서 제외</Button></div>
    <p className="help">전체 ZIP: 통합 시트·동작별 시트 PNG, 개별 프레임 PNG, 동작별 GIF, 태그가 있는 Aseprite, 메타데이터. 편집한 순서·위치·시간을 반영합니다. 모든 동작의 프레임 크기가 같아야 하며 최대 512프레임·1,677만 픽셀까지 내보냅니다.</p></div>
    </fieldset></div>:<div className="canvas-empty"><h3>정면 이미지를 추가하고 모습·동작을 생성하세요.</h3><p>왼쪽 목록에서 결과를 선택해 재생하고, PNG·GIF·Aseprite로 내보냅니다.</p></div>}
  </div></section></div>;
}
