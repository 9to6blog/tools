import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { strToU8, zipSync } from 'fflate';
import { mapTiles, NEIGHBORS } from './terrain-rules';
import type { TerrainResult } from './terrain';
const run=promisify(execFile);
const LUA=`local f=assert(io.open(app.params.input,"r"))
local p=json.decode(f:read("*a")); f:close()
local atlas=Image{fromFile=p.atlas}
local function make(filename,cols,rows,ids)
  local s=Sprite(cols*p.size,rows*p.size,ColorMode.RGB)
  s.gridBounds=Rectangle(0,0,p.size,p.size)
  local old=s.layers[1]
  app.command.NewLayer{name="Terrain tiles",tilemap=true,gridBounds=Rectangle(0,0,p.size,p.size),ask=false}
  local layer=app.layer
  local ts=s:newTileset(Rectangle(0,0,p.size,p.size),p.count+1)
  ts.name="Terrain atlas"; layer.tileset=ts
  for id=0,p.count-1 do
    local im=ts:tile(id+1).image
    local ox=(id%p.columns)*p.size; local oy=math.floor(id/p.columns)*p.size
    for y=0,p.size-1 do for x=0,p.size-1 do im:drawPixel(x,y,atlas:getPixel(ox+x,oy+y)) end end
  end
  local cel=s:newCel(layer,1,Image(cols,rows,ColorMode.TILEMAP),Point(0,0))
  for y=0,rows-1 do for x=0,cols-1 do
    local id=ids[y*cols+x+1]
    cel.image:drawPixel(x,y,app.pixelColor.tile(id and id>=0 and id+1 or 0))
  end end
  s:deleteLayer(old)
  s:saveAs(filename)
  s:close()
end
local ids={}
for i=0,p.columns*p.rows-1 do ids[i+1]=i<p.count and i or -1 end
make(p.tileset,p.columns,p.rows,ids)
make(p.preview,p.mapWidth,p.mapHeight,p.mapIds)
`;
async function nativeAseprite(r:TerrainResult){
  const candidates=[process.env.ASEPRITE_PATH,...(process.platform==='win32'?['C:/Program Files/Aseprite/Aseprite.exe']:[])].filter(Boolean) as string[];
  let exe='';for(const candidate of candidates){try{await access(candidate);exe=candidate;break;}catch{}}
  if(!exe)throw new Error('네이티브 타일맵 출력에 Aseprite가 필요합니다. 설치 후 ASEPRITE_PATH 환경 변수에 실행 파일을 지정하세요.');
  const dir=await mkdtemp(path.join(os.tmpdir(),'pixel-terrain-'));
  try{
    const atlas=path.join(dir,'atlas.png'),script=path.join(dir,'build.lua'),input=path.join(dir,'input.json'),tileset=path.join(dir,'tileset.aseprite'),preview=path.join(dir,'preview.aseprite');
    await writeFile(atlas,r.atlas);await writeFile(script,LUA);
    await writeFile(input,JSON.stringify({atlas,tileset,preview,size:r.options.tileSize,count:r.tiles.length,columns:r.columns,rows:r.rows,mapWidth:r.mapWidth,mapHeight:r.mapHeight,mapIds:mapTiles(r.grid,r.mapWidth,r.mapHeight,r.options.kind)}));
    await run(exe,['--batch','--script-param',`input=${input}`,'--script',script],{windowsHide:true,timeout:60000,maxBuffer:1024*1024});
    return {tileset:await readFile(tileset),preview:await readFile(preview)};
  } finally {
    if(path.dirname(dir)===path.resolve(os.tmpdir())&&path.basename(dir).startsWith('pixel-terrain-'))await rm(dir,{recursive:true,force:true});
  }
}
const sideNames=['top_side','top_right_corner','right_side','bottom_right_corner','bottom_side','bottom_left_corner','left_side','top_left_corner'];
export function godotTerrain(r:TerrainResult){
  const n=r.options.tileSize,kind=r.options.kind;
  const lines=['[gd_resource type="TileSet" load_steps=3 format=3]','','[ext_resource type="Texture2D" path="res://pixel_terrain/atlas.png" id="1"]','','[sub_resource type="TileSetAtlasSource" id="Atlas"]','texture = ExtResource("1")',`texture_region_size = Vector2i(${n}, ${n})`];
  for(let id=0;id<r.tiles.length;id++){
    const key=`${id%r.columns}:${Math.floor(id/r.columns)}`,mask=id?r.masks[id-1]:0;
    lines.push(`${key}/0 = 0`,`${key}/0/terrain_set = 0`,`${key}/0/terrain = ${id?1:0}`);
    NEIGHBORS.forEach(([, ,bit],i)=>{if(kind==='blob47'||(bit&85))lines.push(`${key}/0/terrains_peering_bit/${sideNames[i]} = ${mask&bit?1:0}`);});
  }
  lines.push('','[resource]',`tile_size = Vector2i(${n}, ${n})`,`terrain_set_0/mode = ${kind==='road16'?2:0}`,'terrain_set_0/terrain_0/name = "Base"','terrain_set_0/terrain_0/color = Color(0.3, 0.6, 0.2, 1)','terrain_set_0/terrain_1/name = "Path"','terrain_set_0/terrain_1/color = Color(0.7, 0.45, 0.23, 1)','sources/0 = SubResource("Atlas")');
  return lines.join('\n');
}
export async function exportTerrain(r:TerrainResult){
  if(!r.report.passed)throw new Error('연결 검사에 실패한 결과는 내보낼 수 없습니다.');
  const native=await nativeAseprite(r),n=r.options.tileSize,ids=mapTiles(r.grid,r.mapWidth,r.mapHeight,r.options.kind);
  const files:Record<string,Uint8Array>={};
  files['pixel_terrain/atlas.png']=r.atlas;files['pixel_terrain/preview.png']=r.preview;
  files['aseprite/tileset.aseprite']=native.tileset;files['aseprite/preview_map.aseprite']=native.preview;
  files['pixel_terrain/tileset.tres']=strToU8(godotTerrain(r));
  const scene='[gd_scene load_steps=2 format=3]\n\n[ext_resource type="TileSet" path="res://pixel_terrain/tileset.tres" id="1"]\n\n[node name="Terrain" type="Node2D"]\n\n[node name="Ground" type="TileMapLayer" parent="."]\ntexture_filter = 1\ntile_set = ExtResource("1")\n';
  files['pixel_terrain/paint_here.tscn']=strToU8(scene);
  files['pixel_terrain/preview_map.gd']=strToU8(`@tool\nextends TileMapLayer\n\nfunc _ready():\n\tclear()\n\tvar tiles = ${JSON.stringify(ids)}\n\tfor i in range(tiles.size()):\n\t\tset_cell(Vector2i(i % ${r.mapWidth}, i / ${r.mapWidth}), 0, Vector2i(tiles[i] % ${r.columns}, tiles[i] / ${r.columns}))\n`);
  files['pixel_terrain/preview_map.tscn']=strToU8('[gd_scene load_steps=3 format=3]\n\n[ext_resource type="TileSet" path="res://pixel_terrain/tileset.tres" id="1"]\n[ext_resource type="Script" path="res://pixel_terrain/preview_map.gd" id="2"]\n\n[node name="PreviewMap" type="TileMapLayer"]\ntexture_filter = 1\ntile_set = ExtResource("1")\nscript = ExtResource("2")\n');
  r.tiles.forEach((png,i)=>files[`pixel_terrain/individual/${String(i).padStart(2,'0')}-${i?'mask-'+r.masks[i-1]:'base'}.png`]=png);
  files['pixel_terrain/layout.json']=strToU8(JSON.stringify({version:1,options:r.options,columns:r.columns,rows:r.rows,tiles:r.tiles.map((_,id)=>({id,asepriteIndex:id+1,x:id%r.columns,y:Math.floor(id/r.columns),mask:id?r.masks[id-1]:null,terrain:id?1:0})),map:{width:r.mapWidth,height:r.mapHeight,cells:r.grid,ids}},null,2));
  files['pixel_terrain/validation.json']=strToU8(JSON.stringify(r.report,null,2));
  if(r.source)files['source/original.png']=r.source;
  files['README_ko.txt']=strToU8(`규격형 자동 연결 타일셋\n\n${r.options.kind==='road16'?'4방향 길 16종':'8방향 Blob 지형 47종'} + 바닥 1종 = ${r.tiles.length}타일\n한 칸 ${n}×${n}px / 시트 ${r.columns*n}×${r.rows*n}px / 여백·간격 0\n\nGodot\n1. pixel_terrain 폴더를 프로젝트 최상위에 복사하세요.\n2. preview_map.tscn을 열면 앱에서 그린 시험 지도를 볼 수 있습니다. 이 장면은 열 때 스크립트가 원래 시험 지도를 복원하므로 실제 맵 작업에는 paint_here.tscn을 사용하세요.\n3. paint_here.tscn → Ground 선택 → 아래 TileMap → Terrains에서 Base로 먼저 바닥을 채우세요.\n4. Path 지형을 선택해 Connect 모드로 길/지형을 칠하세요. 지울 때 Base 지형으로 덮으면 주변 모서리도 갱신됩니다. ${r.options.kind==='blob47'?'대각선이 양옆 직선 연결 없이 닿는 경우는 분리된 모서리로 처리하는 Blob 규칙입니다.':'연결 정보는 상하좌우만 사용합니다.'}\n5. PNG만 다시 등록하지 말고 제공한 tileset.tres를 사용하세요.\n\nAseprite\naseprite/tileset.aseprite와 preview_map.aseprite는 실제 Tilemap Layer와 재사용 가능한 Tileset을 포함합니다. 예약된 빈 타일은 0, 실제 타일은 1부터입니다. Draw Pixels → Manual 모드로 수정하면 타일 순서를 유지할 수 있습니다. 수정된 그림은 다시 연결 검사해야 하며 자동으로 Godot 리소스에 동기화되지는 않습니다.\n\n검증\n${r.report.checkedPairs}개 유효한 수평·수직 타일 쌍의 RGBA 경계 픽셀 비교 / 불일치 ${r.report.mismatchedPairs}쌍. 그림 내부의 반복감·미적 품질은 시험 지도를 보면서 확인하세요.\n${r.report.warnings.join('\n')}\n\n생성 방식\nAI 호출 없이 규격 마스크와 공유 경계 질감으로 조립합니다. 업로드 또는 저장된 AI 결과에서는 사용자가 선택한 두 질감 영역을 사용합니다. 기존 이미지의 길 전체를 자동 인식·복원하는 기능은 아닙니다. 바닥·지형이 비슷한 색이면 대비를 높이세요. 원본은 source/original.png에 보존합니다.\n`);
  // Different rule sets can be imported together without replacing each other's atlas.
  const packaged:Record<string,Uint8Array>={},folder=`pixel_terrain/${r.options.kind}`;
  for(const [name,bytes]of Object.entries(files)){
    const target=name.startsWith('pixel_terrain/')?name.replace('pixel_terrain/',`${folder}/`):name;
    packaged[target]=/\.(tres|tscn)$/.test(name)?strToU8(Buffer.from(bytes).toString('utf8').replaceAll('res://pixel_terrain/',`res://${folder}/`)):bytes;
  }
  packaged['README_ko.txt']=strToU8(Buffer.from(packaged['README_ko.txt']).toString('utf8')+`\nGodot 리소스 위치: ${folder}/. 길과 지형 규격을 각각 다른 하위 폴더로 분리해 함께 가져올 수 있습니다. 같은 규격을 다시 복사하면 이전 결과를 갱신하므로 기존 파일을 보관한 뒤 적용하세요.\n`);
  return zipSync(packaged,{level:6});
}
