import sharp from 'sharp';
import { createHash } from 'node:crypto';
import { applyPalette, limitPalette } from './palette';
import { exampleMap, mapTiles, terrainMasks, type TerrainOptions, type TerrainKind, type Patch } from './terrain-rules';
export type TerrainReport = { passed: boolean; tileCount: number; foregroundPatterns: number; uniqueImages: number; checkedPairs: number; mismatchedPairs: number; mismatchedPixels: number; missingPatterns: number; warnings: string[] };
export type TerrainResult = { options: TerrainOptions; atlas: Buffer; preview: Buffer; tiles: Buffer[]; rawTiles: Buffer[]; masks: number[]; columns: number; rows: number; grid: number[]; mapWidth: number; mapHeight: number; report: TerrainReport; source?: Buffer };
export function validateTerrain(value: unknown): TerrainOptions {
  if(!value||typeof value!=='object')throw new Error('지형 설정을 확인해 주세요.');
  const o=value as TerrainOptions;
  if(!['road16','blob47'].includes(o.kind)||!Number.isInteger(o.tileSize)||o.tileSize<8||o.tileSize>128||o.tileSize%2)throw new Error('타일은 8~128px 짝수, 규격은 길 16종 또는 지형 47종으로 선택하세요.');
  if(!Number.isInteger(o.seed)||o.seed<0||o.seed>2147483647)throw new Error('질감 번호는 0~2147483647 정수입니다.');
  if(![o.baseColor,o.fillColor].every(c=>typeof c==='string'&&/^#[a-f\d]{6}$/i.test(c)))throw new Error('바닥과 지형 색상을 선택하세요.');
  for(const p of [o.basePatch,o.fillPatch])if(p&&(![p.x,p.y,p.width,p.height].every(Number.isInteger)||p.x<0||p.y<0||p.width<1||p.height<1||p.width>1024||p.height>1024))throw new Error('질감 선택 영역을 확인해 주세요.');
  if(o.palette&&(!Array.isArray(o.palette)||o.palette.length<2||o.palette.length>256||o.palette.some(c=>!/^#[a-f\d]{6}$/i.test(c))))throw new Error('팔레트는 HEX 색상 2~256개입니다.');
  return {kind:o.kind,tileSize:o.tileSize,seed:o.seed,baseColor:o.baseColor,fillColor:o.fillColor,basePatch:o.basePatch,fillPatch:o.fillPatch,palette:o.palette};
}
function inside(kind: TerrainKind, mask: number, n: number, x: number, y: number, b: number) {
  const cx=x>=b&&x<n-b,cy=y>=b&&y<n-b;
  if(kind==='road16')return cx&&cy||!!(mask&1)&&cx&&y<n/2||!!(mask&16)&&cx&&y>=n/2||!!(mask&64)&&cy&&x<n/2||!!(mask&4)&&cy&&x>=n/2;
  const right=x>=n/2,bottom=y>=n/2,dx=right?n-1-x:x,dy=bottom?n-1-y:y;
  const h=!!(mask&(right?4:64)),v=!!(mask&(bottom?16:1)),d=!!(mask&(bottom?(right?8:32):(right?2:128)));
  if(h&&v)return d||dx*dx+dy*dy>=b*b;
  if(h)return dy>=b;
  if(v)return dx>=b;
  if(dx<b||dy<b)return false;
  const r=Math.max(1,Math.floor(n/8));
  return dx>=b+r||dy>=b+r||(dx-b-r)**2+(dy-b-r)**2<=r*r;
}
function hash(x:number,y:number,seed:number){let v=Math.imul(x+seed+13,374761393)^Math.imul(y+37,668265263);v=Math.imul(v^(v>>>13),1274126177);return (v^(v>>>16))>>>0;}
async function texture(n:number,color:string,seed:number,source?:Buffer,patch?:Patch) {
  let raw:Buffer;
  if(source&&patch){const m=await sharp(source).metadata();if(patch.x+patch.width>m.width!||patch.y+patch.height>m.height!)throw new Error('질감 선택 영역이 원본 크기를 넘습니다.');
    raw=await sharp(source).extract({left:patch.x,top:patch.y,width:patch.width,height:patch.height}).resize(n,n,{kernel:'nearest'}).flatten({background:color}).toColourspace('srgb').ensureAlpha().raw().toBuffer();limitPalette(raw,12);
  }else{const c=parseInt(color.slice(1),16);raw=Buffer.alloc(n*n*4);for(let y=0;y<n;y++)for(let x=0;x<n;x++){const h=hash(x,y,seed)%100,d=h<8?-13:h<19?9:0;raw.set([Math.max(0,Math.min(255,(c>>16)+d)),Math.max(0,Math.min(255,((c>>8)&255)+d)),Math.max(0,Math.min(255,(c&255)+d)),255],(y*n+x)*4);}}
  // A common edge strip across both axes: pairing does not depend on AI accuracy.
  for(let y=0;y<n;y++)raw.copy(raw,(y*n+n-1)*4,(y*n)*4,(y*n)*4+4);
  raw.copy(raw,(n-1)*n*4,0,n*4);
  return raw;
}
const pairCache=new Map<TerrainKind,{a:number;b:number;vertical:boolean}[]>();
export function legalPairs(kind:TerrainKind){
  if(pairCache.has(kind))return pairCache.get(kind)!;
  const unique=new Map<string,{a:number;b:number;vertical:boolean}>();
  // Exhaust all overlapping 3x3 neighborhoods (a 4x3 window, 2^12 cases).
  for(let value=0;value<4096;value++){
    const grid=Array.from({length:12},(_,i)=>(value>>i)&1),ids=mapTiles(grid,4,3,kind);
    unique.set(`h:${ids[5]}:${ids[6]}`,{a:ids[5],b:ids[6],vertical:false});
    const transpose=Array.from({length:12},(_,i)=>grid[(i%3)*4+Math.floor(i/3)]),v=mapTiles(transpose,3,4,kind);
    unique.set(`v:${v[4]}:${v[7]}`,{a:v[4],b:v[7],vertical:true});
  }
  const pairs=[...unique.values()];pairCache.set(kind,pairs);return pairs;
}
export function verifyTerrain(rawTiles:Buffer[],n:number,kind:TerrainKind):TerrainReport {
  let mismatchedPairs=0,mismatchedPixels=0;const pairs=legalPairs(kind),expected=terrainMasks(kind).length+1;
  for(const {a,b,vertical}of pairs){let failed=false;
    for(let t=0;t<n;t++){const ai=(vertical?((n-1)*n+t):(t*n+n-1))*4,bi=(vertical?t:t*n)*4;
      if(!rawTiles[a]||!rawTiles[b]||!rawTiles[a].subarray(ai,ai+4).equals(rawTiles[b].subarray(bi,bi+4))){failed=true;mismatchedPixels++;}}
    if(failed)mismatchedPairs++;
  }
  const uniqueImages=new Set(rawTiles.map(r=>createHash('sha256').update(r).digest('hex'))).size;
  const missingPatterns=Math.abs(expected-rawTiles.length),warnings:string[]=[];
  if(uniqueImages<expected)warnings.push('일부 타일 그림이 동일합니다. 팔레트나 질감의 대비를 높여 주세요.');
  return {passed:!mismatchedPairs&&!missingPatterns&&rawTiles.every(r=>r.length===n*n*4),tileCount:rawTiles.length,foregroundPatterns:expected-1,uniqueImages,checkedPairs:pairs.length,mismatchedPairs,mismatchedPixels,missingPatterns,warnings};
}
export async function renderTerrainMap(tiles:Buffer[],grid:number[],width:number,height:number,kind:TerrainKind,n:number){
  const ids=mapTiles(grid,width,height,kind);
  return sharp({create:{width:width*n,height:height*n,channels:4,background:'#00000000'}}).composite(ids.map((id,i)=>({input:tiles[id],left:(i%width)*n,top:Math.floor(i/width)*n}))).png().toBuffer();
}
export async function buildTerrain(input:unknown,source?:Buffer,customMap?:number[]):Promise<TerrainResult>{
  const o=validateTerrain(input),n=o.tileSize,masks=terrainMasks(o.kind),columns=8,rows=Math.ceil((masks.length+1)/8);
  if((o.basePatch||o.fillPatch)&&!source)throw new Error('질감 영역을 사용하려면 원본 이미지를 선택하세요.');
  const base=await texture(n,o.baseColor,o.seed,source,o.basePatch),fill=await texture(n,o.fillColor,o.seed+73,source,o.fillPatch);
  const rawTiles=[Buffer.from(base)];const b=Math.max(2,Math.floor(n/4)),rim=Math.max(1,Math.floor(n/16));
  for(const mask of masks){const raw=Buffer.from(base);for(let y=0;y<n;y++)for(let x=0;x<n;x++)if(inside(o.kind,mask,n,x,y,b)){
    const i=(y*n+x)*4;fill.copy(raw,i,i,i+4);
    if(!inside(o.kind,mask,n,x,y,b+rim))for(let c=0;c<3;c++)raw[i+c]=Math.round(raw[i+c]*0.77);
  }rawTiles.push(raw);}
  if(o.palette)rawTiles.forEach(raw=>applyPalette(raw,o.palette!));
  const report=verifyTerrain(rawTiles,n,o.kind);if(!report.passed)throw new Error(`연결 검사를 통과하지 못했습니다: ${report.mismatchedPairs}쌍`);
  const tiles=await Promise.all(rawTiles.map(raw=>sharp(raw,{raw:{width:n,height:n,channels:4}}).png().toBuffer()));
  const atlas=await sharp({create:{width:columns*n,height:rows*n,channels:4,background:'#00000000'}}).composite(tiles.map((input,i)=>({input,left:(i%columns)*n,top:Math.floor(i/columns)*n}))).png().toBuffer();
  const mapWidth=24,mapHeight=16;
  if(customMap&&(!Array.isArray(customMap)||customMap.length!==mapWidth*mapHeight||customMap.some(v=>v!==0&&v!==1)))throw new Error('시험 지도는 24×16칸, 값은 0 또는 1이어야 합니다.');
  const grid=customMap??exampleMap(o.kind,mapWidth,mapHeight);
  return {options:o,atlas,tiles,rawTiles,masks,columns,rows,grid,mapWidth,mapHeight,report,source,preview:await renderTerrainMap(tiles,grid,mapWidth,mapHeight,o.kind,n)};
}
