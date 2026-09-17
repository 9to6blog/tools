'use client';
/* eslint-disable @next/next/no-img-element */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowDownToLine, ArrowRight, Box, Check, ChevronDown, Grid2X2, ImagePlus, KeyRound, Layers3, LoaderCircle, RefreshCw, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ArtControls } from '@/components/art-controls';
import { CharacterStudio } from '@/components/character-studio';
import { GenerationReferences } from '@/components/generation-references';
import { CostEstimate, CostLedger, JobCost } from '@/components/cost-panel';
import './animation.css';
import { PrimaryActionProvider, HeaderPrimaryAction, usePrimaryAction } from '@/components/primary-action';
import { useWorkspaceDraft, DraftStatus } from '@/components/use-workspace-draft';
import { motionApiSize } from '@/lib/animation-types';
import { OutputPresets } from '@/components/output-presets';
import { DEFAULT_SETTINGS, MAX_EDGE, MAX_UPLOAD_BYTES, MODELS, dimensions, generationSize, validateSettings, variantDimensions, type Job, type PixelSettings, type Variant } from '@/lib/types';

const asset = (id: string, file: string, download = false) => `/api/assets/${id}/${file}${download ? '?download=1' : ''}`;
const targetLabel = (s: PixelSettings) => { const d = dimensions(s); return `${d.width} × ${d.height}`; };
const variantLabel = (v: Variant) => `${v.targetWidth ?? v.size} × ${v.targetHeight ?? v.size}`;
const initialFile = (j: Job) => {
  const d = dimensions(j.settings);
  return j.variants.find(v => (v.targetWidth ?? v.size) === d.width && (v.targetHeight ?? v.size) === d.height)?.file ?? j.variants[0]?.file ?? '';
};
const prompts = [
  ['고양이', '정면을 보고 앉아 있는 귀여운 주황색 고양이. 크고 뾰족한 귀, 검은 눈, 옆으로 말린 꼬리. 단순한 레트로 게임 캐릭터.'],
  ['버섯', '빨간 갓에 흰 점이 있는 귀여운 작은 버섯. 크림색 줄기, 정면 시점, 레트로 게임 아이템.'],
  ['건물', '기와지붕과 나무 기둥이 있는 2층 한옥 건물. 정면 시점, 지붕 전체와 기단이 보임. 창문, 문, 난간이 명확하게 구분되는 레트로 RPG 건물.'],
];

export default function Studio() {
  return <PrimaryActionProvider><StudioWorkspace /></PrimaryActionProvider>;
}
function StudioWorkspace() {
  const [mode, setMode] = useState<'generate' | 'upload' | 'character'>('generate');
  const [extraWorking, setExtraWorking] = useState(false);
  const [editPrompt, setEditPrompt] = useState('캐릭터의 외형을 유지하고 선택한 시점·방향으로 바꿔 주세요.');
  const [settings, setSettings] = useState<PixelSettings>(DEFAULT_SETTINGS);
  const [prompt, setPrompt] = useState(prompts[0][1]);
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState<string>(MODELS[0]);
  const [quality, setQuality] = useState('medium');
  const [hasKey, setHasKey] = useState(false);
  const [keyOpen, setKeyOpen] = useState(true);
  const [keyStatus, setKeyStatus] = useState('');
  const [checking, setChecking] = useState(false);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [job, setJob] = useState<Job | null>(null);
  const [active, setActive] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [viewFile, setViewFile] = useState('');
  const [showOriginal, setShowOriginal] = useState(false);
  const [grid, setGrid] = useState(false);
  const [actualPixels, setActualPixels] = useState(false);
  const [background, setBackground] = useState('checker');
  const [file, setFile] = useState<File | null>(null);
  const [fileSize, setFileSize] = useState<{ width: number; height: number } | null>(null);
  const [fileUrl, setFileUrl] = useState('');
  const [readingFile, setReadingFile] = useState(false);
  const [references, setReferences] = useState<File[]>([]);
  const [referencePrompt, setReferencePrompt] = useState('');
  const [readingReferences, setReadingReferences] = useState(false);
  const [tileSize, setTileSize] = useState(32);
  const [tileCols, setTileCols] = useState(8);
  const [tileRows, setTileRows] = useState(6);
  const requestLock = useRef(false);
  const selectedId = useRef<string | null>(null);
  const initialized = useRef(false);
  const upload = useRef<HTMLInputElement>(null);
  const draftFiles = useMemo(() => ({ file, references }), [file, references]);
  const draft = useWorkspaceDraft('workspace', { mode, prompt, referencePrompt, editPrompt, settings, model, quality, fileSize, tileSize, tileCols, tileRows }, draftFiles, (data, saved) => {
    if (['generate','upload','character'].includes(String(data.mode))) setMode(data.mode as 'generate' | 'upload' | 'character');
    if (typeof data.prompt === 'string') setPrompt(data.prompt.slice(0,4000));
    if (typeof data.referencePrompt === 'string') setReferencePrompt(data.referencePrompt.slice(0,2000));
    if (typeof data.editPrompt === 'string') setEditPrompt(data.editPrompt.slice(0,4000));
    if (MODELS.includes(data.model as typeof MODELS[number])) setModel(String(data.model));
    if (['low','medium','high'].includes(String(data.quality))) setQuality(String(data.quality));
    if (saved.file instanceof File) setFile(saved.file);
    if (Array.isArray(saved.references)) setReferences(saved.references.slice(0,4));
    const dimensions = data.fileSize as {width?:number;height?:number}|null;
    if (dimensions && Number.isInteger(dimensions.width) && Number.isInteger(dimensions.height)) setFileSize(dimensions as {width:number;height:number});
    if (typeof data.tileSize === 'number') setTileSize(data.tileSize);
    if (typeof data.tileCols === 'number') setTileCols(data.tileCols);
    if (typeof data.tileRows === 'number') setTileRows(data.tileRows);
    if (data.settings) setSettings(validateSettings(data.settings));
  });
  const busy = !draft.ready || working || !!active || extraWorking || readingReferences;
  const target = dimensions(settings);
  const update = <K extends keyof PixelSettings>(key: K, value: PixelSettings[K]) => setSettings(s => ({ ...s, [key]: value }));
  const setDimensions = (width: number, height: number) => setSettings(s => ({ ...s, width, height, size: Math.max(width, height), padding: Math.max(width, height) + s.padding * 2 > MAX_EDGE ? 0 : s.padding }));
  const refresh = useCallback(async () => {
    try {
      const response = await fetch('/api/jobs', { cache: 'no-store' });
      if (!response.ok) return;
      const data = await response.json();
      setJobs(data.jobs); setActive(data.active); setHasKey(data.hasKey);
      if (!initialized.current) {
        initialized.current = true;
        const initial: Job | undefined = data.jobs.find((j: Job) => j.status === 'complete' && !j.animation);
        if (initial) { selectedId.current = initial.id; setJob(initial); setViewFile(initialFile(initial)); }
      } else if (selectedId.current) {
        const current = data.jobs.find((j: Job) => j.id === selectedId.current);
        if (current) setJob(current);
      }
    } catch { /* Keep the current result on polling failure. */ }
  }, []);
  useEffect(() => {
    const initial = setTimeout(refresh, 0), timer = setInterval(refresh, 4000);
    return () => { clearTimeout(initial); clearInterval(timer); };
  }, [refresh]);
  useEffect(() => { const timer = setTimeout(() => { try { const palette = JSON.parse(localStorage.getItem('pixel-studio-palette') ?? 'null'); if (palette) setSettings(s => validateSettings({ ...s, palette })); } catch {} }, 0); return () => clearTimeout(timer); }, []);
  useEffect(() => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    const timer = setTimeout(() => setFileUrl(url), 0);
    return () => { clearTimeout(timer); URL.revokeObjectURL(url); };
  }, [file]);
  async function chooseFile(next?: File) {
    if (!next) return;
    setError(''); setNotice(''); setReadingFile(true);
    try {
      if (next.size > MAX_UPLOAD_BYTES || next.size === 0) throw new Error('50MB 이하 PNG, JPEG, WebP 파일을 선택해 주세요.');
      if (!['image/png', 'image/jpeg', 'image/webp'].includes(next.type)) throw new Error('PNG, JPEG, WebP 파일을 선택해 주세요.');
      const bitmap = await createImageBitmap(next);
      const d = { width: bitmap.width, height: bitmap.height }; bitmap.close();
      if (d.width * d.height > 16_777_216) throw new Error('원본은 최대 16,777,216픽셀까지 지원합니다.');
      setFile(next); setFileSize(d);
    } catch (e) { setError(e instanceof Error ? e.message : '이미지를 읽지 못했습니다.'); }
    finally { setReadingFile(false); }
  }
  async function checkKey() {
    setChecking(true); setKeyStatus('');
    try {
      const r = await fetch('/api/key', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Pixel-Studio': '1' }, body: JSON.stringify({ apiKey, model }) });
      const data = await r.json(); setKeyStatus(data.message || data.error);
    } catch { setKeyStatus('연결을 확인하지 못했습니다. 로컬 서버 상태를 확인해 주세요.'); }
    finally { setChecking(false); }
  }
  async function run(action: 'generate' | 'upload' | 'reprocess' | 'edit') {
    if (requestLock.current || busy) return;
    let validated: PixelSettings;
    try { validated = validateSettings(settings); } catch (e) { setError((e as Error).message); return; }
    if ((action === 'generate' || action === 'edit') && !apiKey.trim() && !hasKey) { setKeyOpen(true); setError('OpenAI API 키를 입력해 주세요.'); return; }
    if ((action === 'upload' || action === 'edit') && !file) { setError('먼저 내 컴퓨터에서 이미지 파일을 선택해 주세요.'); return; }
    if (action === 'reprocess' && !job?.original) { setError('먼저 원본이 저장된 작업을 선택해 주세요.'); return; }
    const sourceId = job?.id;
    requestLock.current = true; setWorking(true); setError(''); setNotice('');
    const id = crypto.randomUUID(); selectedId.current = id;
    setViewFile(''); setShowOriginal(false);
    setJob({ id, created: new Date().toISOString(), prompt: action === 'upload' ? file!.name : action === 'edit' ? editPrompt : prompt, model: ['generate','edit'].includes(action) ? model : 'local', quality, settings: validated, variants: [], status: ['generate','edit'].includes(action) ? 'generating' : 'processing' });
    try {
      let body: string | FormData;
      const headers: Record<string, string> = { 'X-Pixel-Studio': '1' };
      if (action === 'generate') {
        if (references.length) {
          body = new FormData(); body.set('id', id); body.set('prompt', prompt); body.set('model', model); body.set('quality', quality); body.set('settings', JSON.stringify(validated)); body.set('apiKey', apiKey); body.set('referencePrompt', referencePrompt);
          references.forEach(file => (body as FormData).append('references', file));
        } else { headers['Content-Type'] = 'application/json'; body = JSON.stringify({ id, prompt, model, quality, settings: validated, apiKey }); }
      } else {
        body = new FormData(); body.set('id', id); body.set('settings', JSON.stringify(validated));
        if (action === 'upload' || action === 'edit') body.set('image', file!); else body.set('sourceId', sourceId!);
        if (action === 'edit') { body.set('apiKey', apiKey); body.set('model', model); body.set('quality', quality); body.set('prompt', editPrompt); }
      }
      const response = await fetch(action === 'generate' ? '/api/jobs' : action === 'edit' ? '/api/edit' : '/api/convert', { method: 'POST', headers, body });
      const result = await response.json();
      if (!response.ok) { if (result.job) setJob(result.job); throw new Error(result.error || '요청을 완료하지 못했습니다.'); }
      setJob(result); setViewFile(initialFile(result));
      setNotice(`${action === 'generate' ? 'API 생성' : action === 'edit' ? 'AI 시점·자세 변경' : '무료 변환'} 완료. ${result.variants.length}개 규격과 원본이 PC에 저장되었습니다.`);
    } catch (e) { setError(e instanceof Error ? e.message : '응답이 끊겼습니다. 작업 기록을 확인해 주세요.'); }
    finally { requestLock.current = false; setWorking(false); await refresh(); }
  }
  function selectJob(item: Job) {
    selectedId.current = item.id; setJob(item); setSettings({ ...item.settings, exportSet: item.settings.exportSet ?? 'classic', framing: item.settings.framing ?? 'trim' }); setViewFile(initialFile(item)); setShowOriginal(false); setError(''); setNotice('');
    if (item.model !== 'local') { setPrompt(item.prompt); setModel(item.model); setQuality(item.quality); }
  }
  async function exportImage() {
    if (!job || !variant || busy) return;
    setWorking(true); setError('');
    try {
      const d = variantDimensions(variant);
      const r = await fetch('/api/animation/export', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Pixel-Studio': '1' }, body: JSON.stringify({ clips: [{ id: job.id, name: 'image', width: d.width, height: d.height, fps: 1, loop: false, frames: [{ jobId: job.id, index: job.variants.indexOf(variant), x: 0, y: 0, duration: 1000 }] }] }) });
      if (!r.ok) throw new Error((await r.json()).error);
      const url = URL.createObjectURL(await r.blob()); const a = document.createElement('a'); a.href = url; a.download = 'pixel-image-aseprite.zip'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 30000);
      setNotice('Aseprite·PNG·Godot 파일을 ZIP으로 내보냈습니다.');
    } catch (e) { setError((e as Error).message); } finally { setWorking(false); }
  }
  const variant = job?.variants.find(v => v.file === viewFile) ?? job?.variants[0];
  const canvas = variant ? variantDimensions(variant) : { width: target.width + settings.padding * 2, height: target.height + settings.padding * 2 };
  const largest = Math.max(canvas.width, canvas.height);
  const zoom = actualPixels ? 1 : largest <= 352 ? Math.max(1, Math.floor(352 / largest)) : 352 / largest;
  const ready = !!variant && job?.status === 'complete';
  const tileValid = [tileSize, tileCols, tileRows].every(n => Number.isInteger(n) && n > 0) && tileSize * Math.max(tileCols, tileRows) <= MAX_EDGE;
  usePrimaryAction(mode === 'generate' || mode === 'upload', {
    label: mode === 'generate' ? '이미지 생성 · 유료' : '이미지 변환 · 무료',
    detail: mode === 'generate' ? `${target.width} × ${target.height}px · ${references.length ? `레퍼런스 ${references.length}장` : '텍스트로 생성'}` : '내 컴퓨터에서 변환 · API 호출 없음',
    disabled: busy || readingFile || (mode === 'generate' ? !prompt.trim() : !file),
    error, run: () => run(mode === 'generate' ? 'generate' : 'upload'),
  });
  return <div className="studio-shell">
    <header className="topbar"><Link className="brand" href="/"><span className="brand-mark"><Grid2X2 size={20} /></span><span>pixel<span className="brand-light">studio</span><sup>LOCAL</sup></span></Link><HeaderPrimaryAction busy={busy}/></header>
    <main>
      <div className="page-intro"><div><div className="eyebrow">A PIXEL FOR EVERY WORLD.</div><h1>아이템부터 커다란 건물까지.</h1><p>게임에 필요한 크기로 만들고, 원본에서 다시 변환하세요.</p></div><Badge variant="outline" className="engine-badge"><Sparkles size={13} /> GPT Image 2.5</Badge></div>
      <div className="mode-switch" aria-label="작업 방식">
        <button disabled={busy} aria-pressed={mode === 'generate'} className={mode === 'generate' ? 'selected' : ''} onClick={() => { setMode('generate'); setError(''); }}><Sparkles size={20} /><span><strong>API로 새로 생성</strong><small>설명을 입력해 새 그림 만들기 · 유료</small></span></button>
        <button disabled={busy} aria-pressed={mode === 'upload'} className={mode === 'upload' ? 'selected' : ''} onClick={() => { setMode('upload'); setError(''); }}><ImagePlus size={20} /><span><strong>내 컴퓨터 이미지 변환</strong><small>무료 픽셀 변환 · AI 시점 변경 별도</small></span></button>
        <button disabled={busy} aria-pressed={mode === 'character'} className={mode === 'character' ? 'selected' : ''} onClick={() => setMode('character')}><Layers3 size={20}/><span><strong>캐릭터 스프라이트</strong><small>정면 원본 → 방향별 모습 · 7가지 동작</small></span></button>
      </div>
      <DraftStatus {...draft}/>
      <ArtControls settings={settings} onChange={setSettings} disabled={busy} file={mode === 'upload' ? file : null} sourceId={job?.id} sourceFile={variant?.file}/>
      <div hidden={mode !== 'character'}><CharacterStudio active={mode === 'character'} jobs={jobs} settings={settings} apiKey={apiKey} setApiKey={setApiKey} hasKey={hasKey} model={model} setModel={setModel} quality={quality} setQuality={setQuality} refresh={refresh} serverBusy={!draft.ready || working || !!active} onBusy={setExtraWorking}/></div>
      <div hidden={mode === 'character'}>
      <div className="workspace">
        <aside className="control-panel"><div className="panel-title">{mode === 'generate' ? <Sparkles size={17} /> : <ImagePlus size={17} />}<h2>{mode === 'generate' ? '새 그림 생성하기' : '로컬 파일 변환하기'}</h2><span>{mode === 'generate' ? 'API' : 'LOCAL'}</span></div>
          <fieldset disabled={busy || readingFile} className="controls">
            {mode === 'generate' ? <div className="field"><Label htmlFor="prompt">무엇을 그릴까요?</Label><Textarea id="prompt" value={prompt} onChange={e => setPrompt(e.target.value)} maxLength={4000} className="prompt-input" placeholder="캐릭터, 아이템, 건물…" /><div className="prompt-presets">{prompts.map(([name, value]) => <button type="button" key={name} onClick={() => setPrompt(value)}>{name} <span>↗</span></button>)}</div></div> : <div className="upload-card">
              <input className="sr-only" ref={upload} type="file" accept="image/png,image/jpeg,image/webp" aria-label="변환할 로컬 이미지 파일" onChange={e => { void chooseFile(e.target.files?.[0]); e.target.value = ''; }} />
              {file && fileUrl && <img className="upload-thumb checker" src={fileUrl} alt="선택한 로컬 원본" />}
              <Button type="button" variant="outline" onClick={() => upload.current?.click()}><ImagePlus size={16} />{readingFile ? '파일 읽는 중…' : file ? '다른 이미지 선택' : '내 컴퓨터에서 파일 선택'}</Button>
              {file ? <><strong className="file-name">{file.name}</strong><p>{fileSize?.width} × {fileSize?.height}px · {(file.size / 1024 / 1024).toFixed(2)}MB</p><Button type="button" size="sm" variant="ghost" disabled={!fileSize || Math.max(fileSize.width, fileSize.height) > MAX_EDGE} onClick={() => { if (fileSize) setSettings(s => ({ ...s, size: Math.max(fileSize.width, fileSize.height), width: fileSize.width, height: fileSize.height, padding: 0, framing: 'canvas', exportSet: 'selected', sampling: 'nearest' })); }}>원본 크기·배치 유지</Button></> : <p>PNG · JPEG · WebP / 최대 50MB, 1,677만 픽셀</p>}
              <p className="help">파일을 선택한 다음 아래 변환 버튼을 누르세요. 이미지가 OpenAI로 전송되지 않습니다.</p>
            </div>}
            {mode === 'generate' && <GenerationReferences files={references} onChange={setReferences} instruction={referencePrompt} onInstruction={setReferencePrompt} disabled={busy} onReading={setReadingReferences} />}
            <OutputPresets settings={settings} onChange={setSettings}/>
            <div className="field-pair"><div className="field"><Label htmlFor="targetWidth">가로</Label><Input id="targetWidth" type="number" min={1} max={MAX_EDGE} value={target.width} onChange={e => setDimensions(Number(e.target.value), target.height)} /></div><div className="field"><Label htmlFor="targetHeight">세로</Label><Input id="targetHeight" type="number" min={1} max={MAX_EDGE} value={target.height} onChange={e => setDimensions(target.width, Number(e.target.value))} /></div></div>
            <details className="tile-calculator"><summary>타일 칸 수로 크기 계산 <ChevronDown size={14} /></summary><div className="tile-inputs"><div><Label htmlFor="tileSize">타일 px</Label><Input id="tileSize" type="number" min={1} max={4096} value={tileSize} onChange={e => setTileSize(Number(e.target.value))} /></div><div><Label htmlFor="tileCols">가로 칸</Label><Input id="tileCols" type="number" min={1} max={4096} value={tileCols} onChange={e => setTileCols(Number(e.target.value))} /></div><div><Label htmlFor="tileRows">세로 칸</Label><Input id="tileRows" type="number" min={1} max={4096} value={tileRows} onChange={e => setTileRows(Number(e.target.value))} /></div></div><Button type="button" size="sm" variant="outline" disabled={!tileValid} onClick={() => setSettings(s => ({ ...s, size: tileSize * Math.max(tileCols, tileRows), width: tileSize * tileCols, height: tileSize * tileRows, padding: 0, exportSet: 'selected' }))}>{tileSize * tileCols} × {tileSize * tileRows}px 적용 · 여백 0</Button><p className="help">전체 이미지의 크기를 계산합니다. 타일 분할이나 타일맵 생성 기능은 아닙니다.</p></details>
            <div className="field-pair"><div className="field"><Label htmlFor="padding">사방 여백</Label><div className="unit-input"><Input id="padding" type="number" min={0} max={128} value={settings.padding} onChange={e => update('padding', Number(e.target.value))} /><span>px</span></div></div><div className="field"><Label htmlFor="colors">최대 색상</Label><select id="colors" value={settings.colors} onChange={e => update('colors', Number(e.target.value))}>{[2, 4, 8, 12, 16, 24, 32, 48, 64, 128, 256].map(n => <option key={n} value={n}>{n}색</option>)}</select></div></div>
            <div className="canvas-equation"><Box size={15} /><span>최종 PNG</span><strong>{target.width + settings.padding * 2} × {target.height + settings.padding * 2}px</strong></div>
            <div className="field"><Label htmlFor="exportSet">저장할 크기</Label><select id="exportSet" value={settings.exportSet ?? 'classic'} onChange={e => update('exportSet', e.target.value as PixelSettings['exportSet'])}><option value="selected">지정한 크기 1개</option><option value="classic">지정 크기 + 16 / 32 / 48 / 64 / 128 비교본</option></select><p className="help">가로·세로 1~4096px. 여백을 포함한 한 변도 최대 4096px입니다. 비율을 유지하여 지정 영역 안에 배치합니다.</p></div>
            <div className="field-pair model-fields"><div className="field"><Label htmlFor="model">AI 작업 모델</Label><select id="model" value={model} onChange={e => { setModel(e.target.value); setKeyStatus(''); }}><option value={MODELS[0]}>2.5 Flare</option><option value={MODELS[1]}>2.5 Sunburst</option></select></div><div className="field"><Label htmlFor="quality">생성 품질</Label><select id="quality" value={quality} onChange={e => setQuality(e.target.value)}><option value="low">빠른 초안</option><option value="medium">표준</option><option value="high">높음</option></select></div></div><p className="help source-note">API 원본: {generationSize(settings).replace('x', ' × ')}px. 무료 변환에는 AI 설정이 적용되지 않습니다.</p>
            <details className="advanced"><summary>픽셀 변환 설정 <ChevronDown size={14} /></summary><div className="advanced-body"><div className="field"><Label htmlFor="framing">변환할 원본 영역</Label><select id="framing" value={settings.framing ?? 'trim'} onChange={e => update('framing', e.target.value as PixelSettings['framing'])}><option value="trim">투명 여백을 잘라 그림 중심으로 맞춤</option><option value="canvas">원본 캔버스와 내부 배치 유지</option></select></div><div className="field"><Label htmlFor="sampling">픽셀 선택 방식</Label><select id="sampling" value={settings.sampling} onChange={e => update('sampling', e.target.value as PixelSettings['sampling'])}><option value="dominant">셀 안의 대표 색상</option><option value="nearest">중앙 픽셀 선택 (기존 도트 이미지)</option></select></div><div className="field"><Label htmlFor="threshold">실루엣 유지 기준 <span className="mono">{settings.threshold}%</span></Label><input id="threshold" type="range" min={1} max={99} disabled={settings.sampling === 'nearest'} value={settings.threshold} onChange={e => update('threshold', Number(e.target.value))} /><p className="help">대표 색상 방식에만 적용됩니다. 낮추면 얇은 외곽을 더 남깁니다.</p></div><label className="checkbox-label"><input type="checkbox" checked={settings.removeWhite} onChange={e => update('removeWhite', e.target.checked)} /> 가장자리에 연결된 흰 배경 제거</label></div></details>
          </fieldset>
          {(mode === 'generate' || mode === 'upload') && <div className="key-section"><button className="key-toggle" onClick={() => setKeyOpen(!keyOpen)}><span><KeyRound size={14} /> OpenAI API 키</span><span className="key-tag">{apiKey || hasKey ? '입력됨' : '연결 필요'}<ChevronDown size={13} /></span></button>{keyOpen && <div className="key-body"><Label htmlFor="apiKey" className="sr-only">OpenAI API 키</Label><div className="key-input-row"><Input id="apiKey" type="password" autoComplete="off" spellCheck={false} placeholder={hasKey ? '환경 변수의 키 사용 중' : 'sk-…'} value={apiKey} onChange={e => { setApiKey(e.target.value); setKeyStatus(''); }} disabled={busy} /><Button size="sm" variant="outline" onClick={checkKey} disabled={checking || busy || (!apiKey && !hasKey)}>{checking ? <LoaderCircle className="spin" size={14} /> : '확인'}</Button></div><p className="help">이 탭의 메모리에만 유지됩니다. 화면 새로고침 시 다시 입력해야 합니다.</p>{keyStatus && <p className="key-status" role="status">{keyStatus}</p>}</div>}</div>}
          {mode === 'generate' && <div className="generation-cost"><CostEstimate jobs={jobs} requests={[{ model, quality, apiSize: generationSize(settings), kind: references.length ? 'reference' : 'image', referenceCount: references.length }]} /></div>}
          <div className="generate-area"><Button className="generate-button" onClick={() => run(mode === 'generate' ? 'generate' : 'upload')} disabled={busy || readingFile || (mode === 'generate' ? !prompt.trim() : !file)}>{busy ? <LoaderCircle size={17} className="spin" /> : mode === 'generate' ? <Sparkles size={17} /> : <ImagePlus size={17} />}{busy ? '작업 진행 중' : mode === 'generate' ? references.length ? `레퍼런스 ${references.length}장으로 새 이미지 생성` : 'API로 새 이미지 생성' : '선택한 로컬 이미지 변환'}{!busy && <ArrowRight size={17} />}</Button><p>{mode === 'generate' ? '이미지 1장 생성 · OpenAI API 요금 발생' : '내 PC에서 변환 · API 호출 없음 · 무료'}</p>{error && <div role="alert" className="message error">{error}</div>}</div>
          {mode === 'upload' && <div className="ai-edit-box"><Label htmlFor="editPrompt">AI로 시점·자세 변경</Label><Textarea id="editPrompt" value={editPrompt} maxLength={4000} onChange={e=>setEditPrompt(e.target.value)} disabled={busy}/><p className="help">원본의 몸 크기와 위치를 기준으로 자세를 변경합니다. 크기 기준 칸을 함께 생성한 뒤 결과 1장만 저장합니다. API 1회 요금이 발생합니다.</p><CostEstimate jobs={jobs} requests={[{ model, quality, apiSize: motionApiSize(target.width,target.height,1,true), kind: 'edit', referenceCount: 1 }]} /><Button variant="outline" disabled={busy || !file || !editPrompt.trim()} onClick={()=>run('edit')}>선택 이미지 시점·자세 변경 · 유료</Button></div>}
        </aside>
        <section className="preview-panel" aria-label="스프라이트 미리보기">
          <div className="preview-toolbar"><div className="preview-tabs"><button className={!showOriginal ? 'active' : ''} onClick={() => setShowOriginal(false)}><Grid2X2 size={15} /> 픽셀 결과</button><button disabled={!job?.original} className={showOriginal ? 'active' : ''} onClick={() => setShowOriginal(true)}>저장된 원본</button></div><div className="preview-tools"><button title="픽셀 격자 표시" aria-label="픽셀 격자 표시" disabled={zoom < 3} aria-pressed={grid} className={grid ? 'on' : ''} onClick={() => setGrid(!grid)}><Grid2X2 size={16} /></button><button aria-pressed={actualPixels} className={actualPixels ? 'on' : ''} onClick={() => setActualPixels(!actualPixels)}>{actualPixels ? '화면에 맞춤' : '1:1 보기'}</button><span className="mono">{showOriginal ? 'ORIGINAL' : `${Math.round(zoom * 100)}%`}</span></div></div>
          <div className={`canvas-stage ${background}`}><div className="canvas-viewport">{(busy && !ready) ? <div className="canvas-empty"><span className="empty-icon"><LoaderCircle size={32} className="spin" /></span><h3>{job?.status === 'generating' ? '새 이미지를 그리는 중…' : '픽셀과 색상을 정리하는 중…'}</h3><p>완료된 원본과 PNG는 PC에 저장됩니다.</p></div> : (showOriginal && job?.original) ? <img className="original-image" src={asset(job.id, 'original.png')} alt="생성 또는 업로드한 원본" /> : ready ? <div className="sprite-frame" style={{ width: Math.max(1, Math.round(canvas.width * zoom)), height: Math.max(1, Math.round(canvas.height * zoom)) }}><img src={asset(job!.id, variant!.file)} alt={`${variantLabel(variant!)}px 결과, ${canvas.width} × ${canvas.height}px 캔버스`} width={canvas.width} height={canvas.height} style={{ width: '100%', height: '100%' }} />{grid && zoom >= 3 && <div className="pixel-grid" style={{ backgroundSize: `${zoom}px ${zoom}px` }} />}</div> : <div className="canvas-empty"><span className="empty-icon"><Grid2X2 size={32} strokeWidth={1.3} /></span><h3>{mode === 'generate' ? '새로운 게임 자산을 그려보세요.' : '가지고 있는 이미지를 변환하세요.'}</h3><p>{mode === 'generate' ? '설명과 출력 크기를 정해 주세요.' : '파일 선택 → 출력 크기 설정 → 로컬 이미지 변환'}</p><span className="empty-size mono">{targetLabel(settings)} PX</span></div>}</div><div className="stage-bottom"><div className="background-picks">{['checker', 'light', 'dark'].map(bg => <button key={bg} aria-label={`${bg} 배경`} aria-pressed={background === bg} className={`swatch ${bg} ${background === bg ? 'chosen' : ''}`} onClick={() => setBackground(bg)} />)}</div><span>{zoom < 1 ? '축소 미리보기 · 1:1 보기로 실제 픽셀 확인' : '실제 픽셀 · 정수배 표시'}</span></div></div>
          <div className="result-controls"><div className="result-title"><div><span className="eyebrow">EXPORTED ASSETS</span><h3>{job?.status === 'complete' ? `${job.variants.length}개 규격의 저장된 결과` : '지정한 크기로 저장됩니다'}</h3></div>{ready && <Badge variant="outline" className="complete-badge"><Check size={12} /> 저장 완료</Badge>}</div>
            <div className="variant-row">{job?.variants.map(v => { const d = variantDimensions(v); return <button key={v.file} className={variant?.file === v.file ? 'active' : ''} onClick={() => { setViewFile(v.file); setShowOriginal(false); }}><strong className="mono">{variantLabel(v)}</strong><small>PNG {d.width} × {d.height}</small></button>; })}</div>
            {job && <JobCost job={job} />}
            {!!job?.references?.length && <details className="saved-references"><summary>사용한 레퍼런스 {job.references.length}장</summary><div className="generation-reference-grid">{job.references.map((ref, i) => <a key={ref.file} href={asset(job.id, ref.file, true)}><img className="checker" src={asset(job.id, ref.file)} alt={`사용한 레퍼런스 ${i + 1}`} /><span>{i + 1}. {ref.name}</span></a>)}</div><p className="help">{job.referencePrompt || '외형·스타일·색상 참고'} · 전체 ZIP에도 포함됩니다. 새 요청에 자동 첨부되지 않습니다.</p></details>}
            <p className="help export-help">저장된 결과: {job ? targetLabel(job.settings) : '—'}px 설정. 왼쪽 설정을 바꾸면 다음 생성·변환에 적용됩니다. 큰 건물을 작게 줄일수록 창문과 지붕의 디테일이 사라질 수 있습니다.</p>
            {ready && <><div className="result-meta"><span>그림 배치 영역 <strong>{variant!.width} × {variant!.height}px</strong></span><span>실제 사용 <strong>{variant!.colors}색</strong></span><span>파일 <strong>PNG</strong></span></div><div className="download-row"><Button asChild className="download-button"><a href={asset(job!.id, variant!.file, true)}><ArrowDownToLine size={16} /> PNG 다운로드</a></Button><Button asChild variant="outline"><a href={asset(job!.id, 'sprites.zip', true)}><Layers3 size={16} /> 전체 ZIP</a></Button></div></>}
            {ready && <div className="download-row"><Button variant="outline" disabled={busy} onClick={exportImage}>Aseprite · Godot 내보내기</Button></div>}
            {job?.original && <div className="reprocess-area"><Button variant="outline" disabled={busy} onClick={() => run('reprocess')}><RefreshCw size={14} /> 저장된 원본을 현재 설정으로 재변환 · 무료</Button><p className="help">현재 결과의 원본 → {targetLabel(settings)}px. 왼쪽에서 선택한 로컬 파일과 별개입니다.</p></div>}
            <div aria-live="polite">{notice && <div className="message success"><Check size={15} />{notice}</div>}{job?.warning && <div className="message warning">{job.warning}</div>}{job?.error && !error && <div className="message error">{job.error}</div>}</div>
          </div>
        </section>
      </div>
      <section className="history"><div className="history-heading"><h2>작업 기록 <span>{jobs.length}</span></h2><Button variant="ghost" size="sm" onClick={refresh}><RefreshCw size={13} /> 새로고침</Button></div>{jobs.length ? <div className="history-grid">{jobs.filter(j=>!j.animation).slice(0, 10).map(item => <button disabled={busy} className={`history-item ${job?.id === item.id ? 'current' : ''}`} key={item.id} onClick={() => selectJob(item)}><span className="history-thumb checker">{item.status === 'complete' ? <img src={asset(item.id, initialFile(item))} alt="" /> : <Box size={20} />}</span><span className="history-text"><strong>{item.prompt}</strong><small>{targetLabel(item.settings)}px · {item.model === 'local' ? item.source ? '원본 재변환' : '로컬 파일' : 'API 생성'} · {item.status === 'complete' ? '완료' : item.status === 'failed' ? '실패' : active === item.id ? '진행 중' : '응답 확인 필요'}</small></span></button>)}</div> : <div className="history-empty"><Layers3 size={16} /> 원본과 결과는 PC에 저장되며 새로고침 후에도 다시 열 수 있어요.</div>}</section>
      </div>
      <CostLedger jobs={jobs} />
      <footer><span>PIXEL STUDIO · 개발자 <a href="https://9to6blog.com" target="_blank" rel="noopener noreferrer">9to6blog.com ↗</a></span><span>로컬 저장 · 원본 보존 · 무료 재변환</span></footer>
    </main>
  </div>;
}
