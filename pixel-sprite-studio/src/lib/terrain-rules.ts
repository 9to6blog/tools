// Shared by the browser painter, renderer and Godot exporter.
export type TerrainKind = 'road16' | 'blob47';
export type Patch = { x: number; y: number; width: number; height: number };
export type TerrainOptions = { kind: TerrainKind; tileSize: number; seed: number; baseColor: string; fillColor: string; basePatch?: Patch; fillPatch?: Patch; palette?: string[] };
export const NEIGHBORS = [[0,-1,1],[1,-1,2],[1,0,4],[1,1,8],[0,1,16],[-1,1,32],[-1,0,64],[-1,-1,128]] as const;
export function normalizeMask(mask: number, kind: TerrainKind) {
  if (kind === 'road16') return mask & 85;
  if (!(mask & 1) || !(mask & 4)) mask &= ~2;
  if (!(mask & 4) || !(mask & 16)) mask &= ~8;
  if (!(mask & 16) || !(mask & 64)) mask &= ~32;
  if (!(mask & 64) || !(mask & 1)) mask &= ~128;
  return mask;
}
export function terrainMasks(kind: TerrainKind) { return Array.from({length:256},(_,i)=>i).filter(i=>normalizeMask(i,kind)===i); }
export function maskAt(grid: number[], width: number, height: number, x: number, y: number, kind: TerrainKind) {
  let mask=0;
  for(const [dx,dy,bit] of NEIGHBORS) if(x+dx>=0&&y+dy>=0&&x+dx<width&&y+dy<height&&grid[(y+dy)*width+x+dx]) mask|=bit;
  return normalizeMask(mask,kind);
}
export function mapTiles(grid: number[], width: number, height: number, kind: TerrainKind) {
  const masks=terrainMasks(kind);
  return grid.map((v,i)=>v?1+masks.indexOf(maskAt(grid,width,height,i%width,Math.floor(i/width),kind)):0);
}
export function exampleMap(kind: TerrainKind, width=24, height=16) {
  const grid=Array<number>(width*height).fill(0);
  const put=(x:number,y:number)=>{if(x>=0&&y>=0&&x<width&&y<height)grid[y*width+x]=1;};
  if(kind==='road16') {
    for(let x=2;x<width-2;x++)put(x,4);
    for(let y=2;y<height-2;y++)put(8,y);
    for(let y=4;y<12;y++)put(19,y);
    for(let x=13;x<20;x++)put(x,11);
    put(3,12); put(4,12); put(3,13); put(21,13);
  } else {
    for(let y=2;y<height-2;y++)for(let x=2;x<width-2;x++)if((x<10||y>6)&&!(x>=5&&x<=7&&y>=5&&y<=8))put(x,y);
    put(16,2);put(17,3);put(18,4);put(13,3);put(13,4);put(13,5);
  }
  return grid;
}
export function terrainLabel(mask: number, kind: TerrainKind) {
  const sides=NEIGHBORS.filter(([, ,bit])=>(bit&85)&&!!(mask&bit)).length;
  if(!sides)return '독립 / 끝섬';
  if(sides===1)return '막다른 끝';
  if(kind==='blob47'&&mask===255)return '가운데';
  if(sides===4)return kind==='road16'?'십자 연결':'모서리 / 가운데';
  if(sides===3)return 'T자 연결';
  return (mask&85)===17||(mask&85)===68?'직선':'꺾임';
}
