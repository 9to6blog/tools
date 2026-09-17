'use client';
import { useRef, useState } from 'react';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';
import { Label } from './ui/label';
import { DIRECTIONS, PALETTES, parsePalette, VIEWS } from '@/lib/art-options';
import type { PixelSettings } from '@/lib/types';
export function ArtControls({settings,onChange,disabled,file,sourceId,sourceFile}:{settings:PixelSettings;onChange:(s:PixelSettings)=>void;disabled:boolean;file?:File|null;sourceId?:string;sourceFile?:string}) {
  const [draft,setDraft]=useState(''),[message,setMessage]=useState(''),[loading,setLoading]=useState(false);
  const upload=useRef<HTMLInputElement>(null);
  function palette(colors?:string[]){
    if(colors && (colors.length<2 || colors.length>256)){setMessage('팔레트는 서로 다른 색상 2~256개가 필요합니다.');return;}
    onChange({...settings,palette:colors,colors:colors?.length??settings.colors});
    setDraft(colors?.join(' ')??'');setMessage(colors?`${colors.length}색 고정. 생성·변환·모션에 공통 적용됩니다.`:'이미지별 자동 팔레트로 변경했습니다.');
    try{if(colors)localStorage.setItem('pixel-studio-palette',JSON.stringify(colors));else localStorage.removeItem('pixel-studio-palette');}catch{}
  }
  async function extract(){
    setLoading(true);setMessage('');
    try{const form=new FormData();form.set('colors',String(settings.colors));if(file)form.set('image',file);else if(sourceId){form.set('sourceId',sourceId);if(sourceFile)form.set('sourceFile',sourceFile);}else throw new Error('변환 탭에서 파일을 선택하거나 작업 기록에서 결과를 선택해 주세요.');
      const r=await fetch('/api/palette',{method:'POST',headers:{'X-Pixel-Studio':'1'},body:form}),data=await r.json();if(!r.ok)throw new Error(data.error);palette(data.palette);
    }catch(e){setMessage((e as Error).message);}finally{setLoading(false);}
  }
  return <details className="art-controls" open><summary>공통 스타일 <span>시점 · 방향 · 프로젝트 팔레트</span></summary><fieldset disabled={disabled||loading}>
    <div className="art-row"><div className="field"><Label htmlFor="artView">카메라 시점</Label><select id="artView" value={settings.view??'keep'} onChange={e=>onChange({...settings,view:e.target.value})}>{VIEWS.map(([v,label])=><option key={v} value={v}>{label}</option>)}</select></div><div className="field"><Label htmlFor="artFacing">단일 이미지가 바라보는 방향</Label><select id="artFacing" value={settings.facing??'keep'} onChange={e=>onChange({...settings,facing:e.target.value})}><option value="keep">현재 방향 유지</option>{DIRECTIONS.map(([v,label])=><option key={v} value={v}>{label}</option>)}</select></div><div className="field"><Label htmlFor="palettePreset">색상 팔레트</Label><select id="palettePreset" value={settings.palette?'fixed':'auto'} onChange={e=>{if(e.target.value==='auto')palette();else if(PALETTES[e.target.value])palette(PALETTES[e.target.value]);}}><option value="auto">이미지마다 자동 추출</option>{settings.palette&&<option value="fixed">현재 고정 팔레트 · {settings.palette.length}색</option>}{Object.keys(PALETTES).map(name=><option key={name} value={name}>{name}</option>)}</select></div></div>
    <p className="help">시점·방향은 새 생성과 AI 변경에 적용됩니다. 무료 픽셀 변환은 원래 자세와 시점을 유지합니다. 모션의 방향은 아래 동작 표에서 따로 선택합니다.</p>
    {settings.palette&&<div className="palette-swatches">{settings.palette.map(c=><span key={c} title={c} style={{background:c}}/>)}<span className="palette-count">{settings.palette.length}색 고정</span></div>}
    <details className="palette-editor"><summary>팔레트 직접 입력 · 파일 가져오기 · 원본에서 추출</summary><Label htmlFor="paletteHex">HEX 색상 목록</Label><Textarea id="paletteHex" value={draft} onChange={e=>setDraft(e.target.value)} placeholder="#171219 #F8F0D1 #73915B …" maxLength={20000}/><div className="button-row"><Button size="sm" variant="outline" onClick={()=>palette(parsePalette(draft))}>입력한 색상 고정</Button><Button size="sm" variant="outline" onClick={()=>upload.current?.click()}>HEX / GPL / JSON 가져오기</Button><Button size="sm" variant="outline" disabled={!file&&!sourceId} onClick={extract}>{loading?'추출 중…':'선택한 원본에서 추출 후 고정'}</Button>{settings.palette&&<Button size="sm" variant="ghost" onClick={()=>{const blob=new Blob([JSON.stringify(settings.palette,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='palette.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}}>팔레트 저장</Button>}</div><input hidden type="file" ref={upload} accept=".hex,.gpl,.json,.txt" onChange={async e=>{const f=e.target.files?.[0];e.target.value='';if(f){if(f.size>100000){setMessage('팔레트 파일은 100KB 이하로 선택해 주세요.');return;}palette(parsePalette(await f.text()));}}}/></details>
    {message&&<p className="help" role="status">{message}</p>}
  </fieldset></details>;
}
