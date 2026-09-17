import sharp from 'sharp';
import { strToU8, zipSync } from 'fflate';
import { integer } from './animation-types';
import { aseprite } from './animation-export';
import { applyPalette } from './palette';
export type TileGroup={x:number;y:number;w:number;h:number;solid:boolean;terrain?:number[]};
export type TileSpec={tileWidth:number;tileHeight:number;columns:number;rows:number;margin:number;spacing:number;groups:TileGroup[];terrainName:string};
export const PEERING=['top_left_corner','top_side','top_right_corner','left_side','right_side','bottom_left_corner','bottom_side','bottom_right_corner'] as const;
export function validateTiles(input:unknown):TileSpec{
  if(!input||typeof input!=='object')throw new Error('타일 설정을 확인해 주세요.');const s=input as TileSpec;
  integer(s.tileWidth,1,1024,'타일 가로');integer(s.tileHeight,1,1024,'타일 세로');integer(s.columns,1,128,'열 수');integer(s.rows,1,128,'행 수');integer(s.margin,0,4096,'여백');integer(s.spacing,0,256,'간격');
  if(s.columns*s.rows>4096)throw new Error('한 묶음은 4,096칸 이하로 나누어 주세요.');
  if(typeof s.terrainName!=='string'||s.terrainName.length>60||/["\n\r\\]/.test(s.terrainName))throw new Error('지형 이름은 따옴표·줄바꿈 없이 60자 이하로 입력해 주세요.');
  if(!Array.isArray(s.groups)||s.groups.length>4096)throw new Error('타일 등록 정보를 확인해 주세요.');
  const used=new Set<string>();
  const groups=s.groups.map(g=>{
    integer(g.x,0,s.columns-1,'타일 X');integer(g.y,0,s.rows-1,'타일 Y');integer(g.w,1,s.columns-g.x,'묶음 가로');integer(g.h,1,s.rows-g.y,'묶음 세로');
    if(typeof g.solid!=='boolean'||g.terrain!==undefined&&(!Array.isArray(g.terrain)||g.terrain.some(n=>!Number.isInteger(n)||n<0||n>7)))throw new Error('충돌·지형 연결 설정을 확인해 주세요.');
    if(g.terrain!==undefined&&(g.w!==1||g.h!==1))throw new Error('자동 지형 연결은 1×1 타일에만 지정해 주세요.');
    for(let y=g.y;y<g.y+g.h;y++)for(let x=g.x;x<g.x+g.w;x++){const key=`${x},${y}`;if(used.has(key))throw new Error('등록한 타일 영역이 겹칩니다. 기존 묶음을 해제한 뒤 등록하세요.');used.add(key);}
    return {x:g.x,y:g.y,w:g.w,h:g.h,solid:g.solid,terrain:g.terrain};
  });
  return {...s,groups};
}
export function tilePrompt(subject:string,s:TileSpec){
  return `Create a game pixel-art TILE ATLAS, NOT a single object. Theme: ${subject}.\nThe entire atlas is ${s.columns*s.tileWidth} x ${s.rows*s.tileHeight} logical pixels. It contains exactly ${s.columns} columns and ${s.rows} rows. EACH INDIVIDUAL TILE is ${s.tileWidth} x ${s.tileHeight} logical pixels. No padding, no spacing, no borders, no labels, no grid lines. Pixel clusters must follow a uniform square pixel grid.\nInclude useful terrain center textures, straight boundaries, outer corners, inner corners and a few decorative variations. Ground tiles must fill their cells fully, and repeat seamlessly at their matching edges. All terrain boundaries must meet the same fixed edge positions. Decorations may have transparent background inside their cell. Never scatter illustrations across arbitrary cell boundaries. Draw larger objects only aligned exactly to multiples of the tile grid. Crisp flat limited colors, consistent light and camera, no blur or antialiasing. Render the grid design at the supplied output resolution. Preserve logical cell alignment across the whole atlas.`;
}
export async function exportTiles(source:Buffer,input:TileSpec,palette?:string[]){
  const s=validateTiles(input),meta=await sharp(source,{limitInputPixels:16_777_216}).metadata();
  const sourceWidth=s.margin+s.columns*s.tileWidth+(s.columns-1)*s.spacing,sourceHeight=s.margin+s.rows*s.tileHeight+(s.rows-1)*s.spacing;
  if(!meta.width||!meta.height||sourceWidth>meta.width||sourceHeight>meta.height)throw new Error('타일 크기·행·열·여백이 원본 크기를 넘습니다. 시트 전체 크기와 한 칸 크기를 구분해 주세요.');
  const width=s.columns*s.tileWidth,height=s.rows*s.tileHeight;if(width*height>16_777_216)throw new Error('시트 전체는 1,677만 픽셀 이하로 설정해 주세요.');
  let workingSource=source;
  if(palette?.length){const decoded=await sharp(source).ensureAlpha().raw().toBuffer({resolveWithObject:true});for(let i=0;i<decoded.data.length;i+=4){if(decoded.data[i+3]<128)decoded.data.fill(0,i,i+4);else decoded.data[i+3]=255;}applyPalette(decoded.data,palette);workingSource=await sharp(decoded.data,{raw:{width:decoded.info.width,height:decoded.info.height,channels:4}}).png().toBuffer();}
  const composites:{input:Buffer;left:number;top:number}[]=[],zip:Record<string,Uint8Array>={},groups=[...s.groups];
  const covered=new Set<string>();for(const g of groups)for(let y=g.y;y<g.y+g.h;y++)for(let x=g.x;x<g.x+g.w;x++)covered.add(`${x},${y}`);
  for(let y=0;y<s.rows;y++)for(let x=0;x<s.columns;x++){
    const png=await sharp(workingSource).extract({left:s.margin+x*(s.tileWidth+s.spacing),top:s.margin+y*(s.tileHeight+s.spacing),width:s.tileWidth,height:s.tileHeight}).ensureAlpha().png().toBuffer();
    composites.push({input:png,left:x*s.tileWidth,top:y*s.tileHeight});
    zip[`pixel_tiles/individual/tile-${x}-${y}.png`]=png;
    const stat=await sharp(png).stats();if(!covered.has(`${x},${y}`)&&stat.channels[3]?.max>0)groups.push({x,y,w:1,h:1,solid:false});
  }
  const atlas=await sharp({create:{width,height,channels:4,background:'#00000000'}}).composite(composites).png().toBuffer();
  zip['pixel_tiles/atlas.png']=atlas;zip['source/original.png']=source;
  const terrain=groups.some(g=>g.terrain!==undefined),physics=groups.some(g=>g.solid);
  const lines=['[gd_resource type="TileSet" load_steps=3 format=3]','','[ext_resource type="Texture2D" path="res://pixel_tiles/atlas.png" id="1"]','','[sub_resource type="TileSetAtlasSource" id="Atlas"]','texture = ExtResource("1")',`texture_region_size = Vector2i(${s.tileWidth}, ${s.tileHeight})`];
  for(const g of groups){
    const key=`${g.x}:${g.y}`;if(g.w>1||g.h>1)lines.push(`${key}/size_in_atlas = Vector2i(${g.w}, ${g.h})`);
    lines.push(`${key}/0 = 0`);
    if(g.solid){const hw=g.w*s.tileWidth/2,hh=g.h*s.tileHeight/2;lines.push(`${key}/0/physics_layer_0/polygon_0/points = PackedVector2Array(${-hw}, ${-hh}, ${hw}, ${-hh}, ${hw}, ${hh}, ${-hw}, ${hh})`);}
    if(g.terrain!==undefined){lines.push(`${key}/0/terrain_set = 0`,`${key}/0/terrain = 0`);for(const bit of g.terrain)lines.push(`${key}/0/terrains_peering_bit/${PEERING[bit]} = 0`);}
  }
  lines.push('','[resource]',`tile_size = Vector2i(${s.tileWidth}, ${s.tileHeight})`);
  if(physics)lines.push('physics_layer_0/collision_layer = 1');
  if(terrain)lines.push('terrain_set_0/mode = 0',`terrain_set_0/terrain_0/name = "${s.terrainName||'Ground'}"`,'terrain_set_0/terrain_0/color = Color(0.45, 0.7, 0.25, 1)');
  lines.push('sources/0 = SubResource("Atlas")');
  zip['pixel_tiles/tileset.tres']=strToU8(lines.join('\n'));
  zip['pixel_tiles/paint_here.tscn']=strToU8('[gd_scene load_steps=2 format=3]\n\n[ext_resource type="TileSet" path="res://pixel_tiles/tileset.tres" id="1"]\n\n[node name="PaintHere" type="Node2D"]\n\n[node name="Ground" type="TileMapLayer" parent="."]\ntexture_filter = 1\ntile_set = ExtResource("1")\n');
  for(const g of groups.filter(g=>g.w>1||g.h>1))zip[`pixel_tiles/objects/object-${g.x}-${g.y}.png`]=await sharp(atlas).extract({left:g.x*s.tileWidth,top:g.y*s.tileHeight,width:g.w*s.tileWidth,height:g.h*s.tileHeight}).png().toBuffer();
  const raw=await sharp(atlas).ensureAlpha().raw().toBuffer();
  zip['pixel_tiles/atlas.aseprite']=aseprite([{clip:{id:'atlas',name:'atlas',width,height,fps:1,loop:false,frames:[{jobId:'00000000-0000-0000-0000-000000000000',index:0,x:0,y:0,duration:1000}]},pngs:[atlas],raws:[raw]}],width,height,palette??[]);
  zip['pixel_tiles/layout.json']=strToU8(JSON.stringify({...s,groups,atlasWidth:width,atlasHeight:height,sourceSize:{width:meta.width,height:meta.height}},null,2));
  zip['README_ko.txt']=strToU8(`Godot 타일셋 사용법\n\n전체 PNG: ${width}×${height}px / 타일 한 칸: ${s.tileWidth}×${s.tileHeight}px / 배열: ${s.columns}열×${s.rows}행\n\n1. ZIP의 pixel_tiles 폴더를 Godot 프로젝트 루트에 복사하세요.\n2. pixel_tiles/paint_here.tscn을 여세요. 왼쪽 씬 트리에서 Ground(TileMapLayer)를 선택하세요.\n3. 아래쪽 TileMap 탭을 선택하세요. TileSet 탭은 타일 규격·충돌·지형을 설정하는 곳이고, TileMap 탭은 맵을 칠하는 곳입니다.\n4. 타일 팔레트에서 타일을 클릭하고 2D 화면에서 왼쪽 클릭으로 칠하세요. 마우스 오른쪽으로 지웁니다. 여러 칸을 선택하면 패턴으로 칠할 수도 있습니다.\n5. Ctrl+S로 씬을 저장하세요.\n\n이미 사용 중인 맵: TileMapLayer의 Tile Set에 pixel_tiles/tileset.tres를 지정하세요. PNG만 드래그해서 전체 그림을 타일 하나로 등록하지 마세요.\n\n설정: Tile Size와 Texture Region Size는 ${s.tileWidth}×${s.tileHeight}입니다. 입력 여백·간격은 제거한 새 atlas.png를 만들었으므로 새 리소스의 Margins와 Separation은 0입니다. 원본은 source/original.png에 보존합니다.\n\n2×2 등으로 묶은 오브젝트는 여러 그림 조각을 한 번에 선택하는 큰 타일로 등록됩니다. 맵의 논리 셀 크기는 그대로이며 그림은 선택한 셀의 중심을 기준으로 배치됩니다. 독립적인 4칸 패턴으로 칠하고 싶다면 묶지 말고 1×1 타일들을 여러 개 선택하세요.\n\n지형 자동 연결: ${terrain?'설정한 타일의 8방향 연결 비트를 저장했습니다. TileMap의 Terrains 탭에서 Ground 지형을 선택하여 칠하세요. 모든 모서리 조합이 없으면 빈틈이나 부적절한 타일이 생길 수 있으므로 테스트해야 합니다.':'연결 비트를 지정하지 않아 수동 타일 배치용입니다. 잔디 그림만으로 모든 연결 관계를 자동 추정하지 않습니다.'}\n충돌: ${physics?'선택한 막힘 타일에 사각형 충돌을 등록했습니다. 실제 모양에 맞춘 다각형 조정은 Godot TileSet 편집기에서 가능합니다.':'자동 충돌 없음. 바닥은 통과 가능한 상태입니다.'}\n\nAseprite: atlas.aseprite는 편집 가능한 단일 픽셀 레이어이며 native tilemap이 아닙니다. individual/에 개별 타일 PNG, objects/에 묶음 오브젝트 PNG가 들어 있습니다.\n`);
  return {zip:zipSync(zip,{level:6}),groups,atlas};
}
