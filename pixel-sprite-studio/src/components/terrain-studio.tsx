'use client';
/* eslint-disable @next/next/no-img-element */
import { useEffect, useRef, useState } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { MAX_UPLOAD_BYTES, primaryVariant, type Job, type PixelSettings } from '@/lib/types';
import { exampleMap, mapTiles, terrainLabel, type Patch, type TerrainOptions } from '@/lib/terrain-rules';
import type { TerrainReport } from '@/lib/terrain';
type Props={jobs:Job[];settings:PixelSettings;serverBusy:boolean;onBusy:(v:boolean)=>void;refresh:()=>Promise<void>};
type Result={options:TerrainOptions;atlas:string;columns:number;rows:number;masks:number[];report:TerrainReport;grid:number[];mapWidth:number;mapHeight:number};
const defaults:TerrainOptions={kind:'blob47',tileSize:16,seed:7,baseColor:'#619B35',fillColor:'#BA8450'};
export function TerrainStudio(p:Props){
  const [options,setOptions]=useState(defaults),[file,setFile]=useState<File|null>(null),[sourceId,setSourceId]=useState(''),[fileUrl,setFileUrl]=useState('');
  const [sourceSize,setSourceSize]=useState({width:0,height:0}),[patchSize,setPatchSize]=useState(8),[pick,setPick]=useState<'basePatch'|'fillPatch'>('basePatch');
  const [result,setResult]=useState<Result|null>(null),[builtKey,setBuiltKey]=useState(''),[grid,setGrid]=useState<number[]>([]),[history,setHistory]=useState<number[][]>([]);
  const [brush,setBrush]=useState(1),[zoom,setZoom]=useState(2),[showGrid,setShowGrid]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
  const canvas=useRef<HTMLCanvasElement>(null),imageRef=useRef<HTMLImageElement|null>(null),urlRef=useRef(''),lock=useRef(false),stroke=useRef<{x:number;y:number;brush:number}|null>(null);
  const job=p.jobs.find(j=>j.id===sourceId),sourceFile=job?primaryVariant(job)?.file??'original.png':'';
  const sourceUrl=file?fileUrl:job?`/api/assets/${job.id}/${sourceFile}`:'';
  const effective={...options,palette:p.settings.palette};
  const key=JSON.stringify([effective,sourceId,sourceFile,file?.name,file?.size,file?.lastModified]);
  const dirty=!!result&&builtKey!==key,disabled=busy||p.serverBusy;
  useEffect(()=>()=>{if(urlRef.current)URL.revokeObjectURL(urlRef.current);},[]);
  useEffect(()=>{
    if(!result||!canvas.current)return;
    const el=canvas.current,ctx=el.getContext('2d')!,n=result.options.tileSize;
    const draw=()=>{const img=imageRef.current;if(!img||!img.complete)return;ctx.imageSmoothingEnabled=false;ctx.clearRect(0,0,el.width,el.height);
      mapTiles(grid,result.mapWidth,result.mapHeight,result.options.kind).forEach((id,i)=>ctx.drawImage(img,(id%result.columns)*n,Math.floor(id/result.columns)*n,n,n,(i%result.mapWidth)*n,Math.floor(i/result.mapWidth)*n,n,n));
      if(showGrid){ctx.strokeStyle='#ffffff50';ctx.lineWidth=1;for(let x=0;x<el.width;x+=n){ctx.beginPath();ctx.moveTo(x+.5,0);ctx.lineTo(x+.5,el.height);ctx.stroke();}for(let y=0;y<el.height;y+=n){ctx.beginPath();ctx.moveTo(0,y+.5);ctx.lineTo(el.width,y+.5);ctx.stroke();}}
    };
    if(imageRef.current?.src!==result.atlas){const img=new Image();imageRef.current=img;img.onload=draw;img.src=result.atlas;}else{imageRef.current.onload=draw;draw();}
    return()=>{if(imageRef.current)imageRef.current.onload=null;};
  },[result,grid,showGrid]);
  function resetPatches(){setOptions(o=>({...o,basePatch:undefined,fillPatch:undefined}));setSourceSize({width:0,height:0});}
  async function chooseFile(f:File){try{if(!f.size||f.size>MAX_UPLOAD_BYTES)throw new Error('50MB 이하 이미지를 선택하세요.');const bitmap=await createImageBitmap(f);if(bitmap.width*bitmap.height>16_777_216){bitmap.close();throw new Error('1,677만 픽셀 이하 이미지를 사용하세요.');}bitmap.close();if(urlRef.current)URL.revokeObjectURL(urlRef.current);urlRef.current=URL.createObjectURL(f);setFile(f);setFileUrl(urlRef.current);setSourceId('');resetPatches();setError('');}catch(e){setError((e as Error).message);}}
  function payload(action:string){const form=new FormData();form.set('action',action);form.set('options',JSON.stringify(effective));if(file)form.set('image',file);else if(sourceId){form.set('sourceId',sourceId);form.set('sourceFile',sourceFile);}if(action==='export')form.set('map',JSON.stringify(grid));return form;}
  async function request(action:'preview'|'export'){
    if(lock.current||disabled||action==='export'&&dirty)return;lock.current=true;setBusy(true);p.onBusy(true);setError('');setMessage('');
    try{const response=await fetch('/api/terrain',{method:'POST',headers:{'X-Pixel-Studio':'1'},body:payload(action)});if(!response.ok)throw new Error((await response.json()).error);
      if(action==='preview'){const data:Result=await response.json();setResult(data);setGrid(data.grid);setHistory([]);setBuiltKey(key);setMessage('규격 조립과 경계 검사가 완료됐습니다. 오른쪽 시험 지도에 직접 칠해보세요.');}
      else{const url=URL.createObjectURL(await response.blob()),a=document.createElement('a');a.href=url;a.download=`terrain-${options.kind}-${options.tileSize}px.zip`;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);setMessage('Godot 지형 설정, 시험 지도와 네이티브 Aseprite 타일맵을 다운로드했습니다.');}
    }catch(e){setError((e as Error).message);}finally{lock.current=false;setBusy(false);p.onBusy(false);await p.refresh();}
  }
  function saveHistory(){setHistory(h=>[...h.slice(-29),[...grid]]);}
  function paint(e:React.PointerEvent<HTMLCanvasElement>,first=false){
    if(!result||disabled)return;
    const rect=e.currentTarget.getBoundingClientRect(),x=Math.floor((e.clientX-rect.left)/rect.width*result.mapWidth),y=Math.floor((e.clientY-rect.top)/rect.height*result.mapHeight);
    if(x<0||y<0||x>=result.mapWidth||y>=result.mapHeight)return;
    if(first){saveHistory();stroke.current={x,y,brush:e.button===2?0:brush};e.currentTarget.setPointerCapture(e.pointerId);}
    const s=stroke.current;if(!s)return;
    const points:{x:number;y:number}[]=[];let xx=s.x,yy=s.y;const dx=Math.abs(x-xx),dy=-Math.abs(y-yy),sx=xx<x?1:-1,sy=yy<y?1:-1;let err=dx+dy;
    while(true){points.push({x:xx,y:yy});if(xx===x&&yy===y)break;const twice=2*err;if(twice>=dy){err+=dy;xx+=sx;}if(twice<=dx){err+=dx;yy+=sy;}}
    setGrid(g=>{const next=[...g];for(const pt of points)next[pt.y*result.mapWidth+pt.x]=s.brush;return next;});stroke.current={x,y,brush:s.brush};
  }
  function regionStyle(patch:Patch,color:string){return {left:`${patch.x/sourceSize.width*100}%`,top:`${patch.y/sourceSize.height*100}%`,width:`${patch.width/sourceSize.width*100}%`,height:`${patch.height/sourceSize.height*100}%`,borderColor:color};}
  return <div className="terrain-workspace"><div className="terrain-intro"><strong>연결 규격부터 만드는 타일셋</strong><p>기본 질감 또는 이미지에서 고른 두 재질을 규격에 맞춰 조립합니다. API 호출 없이 무료로 처리합니다.</p></div>
    <div className="animation-builder"><section className="control-panel"><div className="panel-title"><h2>1. 규격과 질감</h2><span>AUTOTILE</span></div><div className="animation-controls"><fieldset disabled={disabled}>
      <Label htmlFor="terrainKind">만들 종류</Label><select id="terrainKind" value={options.kind} onChange={e=>setOptions({...options,kind:e.target.value as TerrainOptions['kind']})}><option value="blob47">넓은 지형 · Blob 47종</option><option value="road16">좁은 길 · 4방향 16종</option></select><p className="help">{options.kind==='blob47'?'흙바닥·잔디·물처럼 면적을 칠합니다. 바깥·안쪽 모서리를 포함합니다.':'직선·꺾임·T자·십자·막다른 끝을 일정한 폭으로 연결합니다.'}</p>
      <div className="sheet-input-grid"><div className="field"><Label htmlFor="terrainSize">타일 한 칸 px</Label><Input id="terrainSize" type="number" min={8} max={128} step={2} value={options.tileSize} onChange={e=>setOptions({...options,tileSize:Number(e.target.value)})}/></div><div className="field"><Label htmlFor="terrainSeed">기본 질감 번호</Label><Input id="terrainSeed" type="number" min={0} max={2147483647} value={options.seed} onChange={e=>setOptions({...options,seed:Number(e.target.value)})}/></div></div>
      <div className="button-row">{[16,32,48,64,128].map(n=><Button key={n} size="sm" variant="outline" onClick={()=>setOptions({...options,tileSize:n})}>{n}px</Button>)}</div>
      <div className="tile-total">연결 조각 {options.kind==='road16'?16:47}종 + 바닥 1종<br/><small>전체 {options.tileSize*8}×{options.tileSize*(options.kind==='road16'?3:6)}px · 8열 · 여백 0</small></div>
      <div className="sheet-input-grid"><div className="field"><Label htmlFor="baseColor">바닥 색</Label><Input id="baseColor" type="color" value={options.baseColor} onChange={e=>setOptions({...options,baseColor:e.target.value})}/></div><div className="field"><Label htmlFor="fillColor">길·지형 색</Label><Input id="fillColor" type="color" value={options.fillColor} onChange={e=>setOptions({...options,fillColor:e.target.value})}/></div></div>
      <details className="regen"><summary>내 이미지 / AI 결과에서 질감 가져오기</summary><p className="help">잔디만 있는 영역과 흙만 있는 영역을 각각 고르세요. 원본의 길 배치를 그대로 자르지 않고 선택한 질감으로 다시 조립합니다.</p><Input type="file" accept="image/png,image/jpeg,image/webp" aria-label="규격형 타일 질감 이미지" onChange={e=>{const f=e.target.files?.[0];if(f)void chooseFile(f);e.target.value='';}}/>
        <Label htmlFor="terrainSource">저장된 AI 생성 결과</Label><select id="terrainSource" value={sourceId} onChange={e=>{setFile(null);setSourceId(e.target.value);resetPatches();}}><option value="">기본 질감 사용</option>{p.jobs.filter(j=>j.status==='complete'&&!j.animation).map(j=><option key={j.id} value={j.id}>{j.prompt.slice(0,65)}</option>)}</select>
        {sourceUrl&&<><div className="button-row"><Button size="sm" variant={pick==='basePatch'?'default':'outline'} onClick={()=>setPick('basePatch')}>① 바닥 영역 선택</Button><Button size="sm" variant={pick==='fillPatch'?'default':'outline'} onClick={()=>setPick('fillPatch')}>② 길·지형 영역 선택</Button></div><Label htmlFor="patchSize">선택 사각형 한 변 px</Label><Input id="patchSize" type="number" min={1} max={1024} value={patchSize} onChange={e=>setPatchSize(Number(e.target.value))}/>
          <div className="terrain-source" onClick={e=>{if(!sourceSize.width||!Number.isInteger(patchSize)||patchSize<1||patchSize>1024)return;const rect=e.currentTarget.getBoundingClientRect(),w=Math.min(patchSize,sourceSize.width),h=Math.min(patchSize,sourceSize.height),x=Math.max(0,Math.min(sourceSize.width-w,Math.floor((e.clientX-rect.left)/rect.width*sourceSize.width))),y=Math.max(0,Math.min(sourceSize.height-h,Math.floor((e.clientY-rect.top)/rect.height*sourceSize.height)));setOptions({...options,[pick]:{x,y,width:w,height:h}});}}>
            <img src={sourceUrl} alt="클릭해서 바닥 또는 길의 질감 영역 선택" onLoad={e=>setSourceSize({width:e.currentTarget.naturalWidth,height:e.currentTarget.naturalHeight})}/>{sourceSize.width>0&&options.basePatch&&<span style={regionStyle(options.basePatch,'#bafa7a')}>①</span>}{sourceSize.width>0&&options.fillPatch&&<span style={regionStyle(options.fillPatch,'#ffbc73')}>②</span>}</div>
          <p className="help">바닥: {options.basePatch?`${options.basePatch.x},${options.basePatch.y}`:'기본 색상'} / 지형: {options.fillPatch?`${options.fillPatch.x},${options.fillPatch.y}`:'기본 색상'}</p><Button size="sm" variant="outline" onClick={()=>{setFile(null);setSourceId('');resetPatches();}}>이미지 선택 해제</Button></>}
      </details>
      <p className="help">{p.settings.palette?`공통 고정 팔레트 ${p.settings.palette.length}색을 적용합니다.`:'공통 색상 팔레트를 지정하면 완성된 모든 타일에 적용합니다.'}</p><Button className="generate-button" onClick={()=>request('preview')}>{busy?'처리 중…':'규격형 타일 만들기 · 무료'}</Button>
    </fieldset></div></section>
    <section className="control-panel"><div className="panel-title"><h2>2. 직접 칠해서 연결 확인</h2><span>24 × 16</span></div><div className="animation-controls">{result?<>
      <div className={`terrain-report ${result.report.passed?'pass':'fail'}`}><strong>연결 검사 {result.report.passed?'통과':'실패'}</strong><span>{result.report.foregroundPatterns}종 완비 · {result.report.checkedPairs}쌍 검사 · 경계 불일치 {result.report.mismatchedPairs}쌍</span><small>유효한 수평·수직 연결의 RGBA 경계 검사입니다. 질감의 반복감과 전체 인상도 아래에서 확인하세요.</small></div>
      {result.report.warnings.map(w=><p className="message warning" key={w}>{w}</p>)}{dirty&&<p className="message warning">설정이 변경됐습니다. ‘규격형 타일 만들기’를 눌러 다시 검사한 뒤 내보내세요.</p>}
      <div className="button-row"><Button size="sm" variant={brush===1?'default':'outline'} onClick={()=>setBrush(1)}>길·지형 칠하기</Button><Button size="sm" variant={brush===0?'default':'outline'} onClick={()=>setBrush(0)}>바닥으로 지우기</Button><Button size="sm" variant="outline" disabled={!history.length||disabled} onClick={()=>{setGrid(history[history.length-1]);setHistory(h=>h.slice(0,-1));}}>되돌리기</Button><Button size="sm" variant="outline" disabled={disabled} onClick={()=>{saveHistory();setGrid(exampleMap(result.options.kind));}}>시험 지도</Button><Button size="sm" variant="outline" disabled={disabled} onClick={()=>{saveHistory();setGrid(Array(384).fill(0));}}>전체 지우기</Button></div>
      <div className="playback-controls"><Label htmlFor="terrainZoom">표시 배율</Label><select id="terrainZoom" value={zoom} onChange={e=>setZoom(Number(e.target.value))}>{[1,2,3,4].map(n=><option key={n} value={n}>{n}×</option>)}</select><label className="checkbox-label"><input type="checkbox" checked={showGrid} onChange={e=>setShowGrid(e.target.checked)}/>격자</label></div>
      <div className="terrain-paint-scroll"><canvas ref={canvas} width={result.mapWidth*result.options.tileSize} height={result.mapHeight*result.options.tileSize} style={{width:result.mapWidth*result.options.tileSize*zoom,height:result.mapHeight*result.options.tileSize*zoom}} aria-label="자동 연결 시험 지도" onPointerDown={e=>paint(e,true)} onPointerMove={e=>paint(e)} onPointerUp={()=>{stroke.current=null;}} onPointerCancel={()=>{stroke.current=null;}} onLostPointerCapture={()=>{stroke.current=null;}} onContextMenu={e=>e.preventDefault()}/></div><p className="help">드래그해 그리면 직선·모서리·갈림길이 자동으로 바뀝니다. 마우스 오른쪽 버튼으로 지웁니다. 현재 지도가 ZIP에도 저장됩니다.</p>
      <details className="regen"><summary>타일 아틀라스와 각 조각의 역할 보기</summary><div className="terrain-atlas"><img src={result.atlas} alt="검사된 규격형 타일 아틀라스" style={{width:result.columns*result.options.tileSize*3}}/></div><div className="terrain-roles"><span>0 · 바닥</span>{result.masks.map((m,i)=><span key={m}>{i+1} · {terrainLabel(m,result.options.kind)} <small>({m})</small></span>)}</div></details>
      <Button className="generate-button" disabled={disabled||dirty||!result.report.passed} onClick={()=>request('export')}>Godot + Aseprite 타일맵 ZIP 다운로드 · 무료</Button><p className="help">실제 Tilemap Layer가 있는 Aseprite 파일, PNG, 개별 타일, Godot 자동 연결 설정, 시험 지도, 검사 보고서를 포함합니다.</p>
    </>:<div className="canvas-empty"><h3>왼쪽에서 규격형 타일을 만들어 주세요.</h3><p>이미지나 API 키 없이 바로 시험할 수 있습니다.</p><p>길 16종 / 넓은 지형 47종 · 연결 규칙 자동 등록</p></div>}</div></section></div>
    <div aria-live="polite">{busy&&<p className="message success">{result?'규격 타일을 처리하고 있습니다. Aseprite 출력은 잠시 걸릴 수 있습니다…':'타일 조립과 연결 검사를 진행하고 있습니다…'}</p>}{message&&<p className="message success">{message}</p>}{error&&<p className="message error" role="alert">{error}</p>}</div>
    <section className="art-controls tile-guide"><strong>Godot에서 자동으로 길과 모서리를 연결하려면</strong><ol><li>ZIP의 <b>pixel_terrain</b> 폴더를 프로젝트 루트에 복사합니다.</li><li><b>preview_map.tscn</b>으로 시험 지도를 확인합니다.</li><li>실제 작업은 <b>paint_here.tscn → Ground → TileMap → Terrains</b>에서 진행합니다.</li><li><b>Base</b>로 바닥을 채우고, <b>Path</b>를 Connect 모드로 칠합니다. 지울 때는 Base로 덮습니다.</li></ol><p>현재 규격형 모드는 정사각형 탑다운 지형용입니다. 건물·장식 묶기와 자유로운 시트 가져오기는 ‘기존 아틀라스’에서 할 수 있습니다.</p></section>
  </div>;
}
