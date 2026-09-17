import sharp from 'sharp';
import { deflateSync } from 'node:zlib';
import { zipSync, strToU8 } from 'fflate';
import { integer, safeName, MAX_ANIMATION_PIXELS, type Clip } from './animation-types';
import { packFrames } from './animation';
import { applyPalette } from './palette';

type RenderedClip = { clip: Clip; pngs: Buffer[]; raws: Buffer[] };
export function validateClips(input: unknown): Clip[] {
  if(!Array.isArray(input) || !input.length || input.length>128) throw new Error('동작을 1~128개 선택해 주세요.');
  const names=new Set<string>(); let pixels=0, count=0;
  const clips=input.map((c:Clip)=>{
    safeName(c.name); if(names.has(c.name)) throw new Error(`동작 이름이 중복됩니다: ${c.name}`); names.add(c.name);
    integer(c.width,1,4096,'프레임 가로');integer(c.height,1,4096,'프레임 세로');integer(c.fps,1,60,'FPS');
    if(typeof c.loop!=='boolean' || !Array.isArray(c.frames) || !c.frames.length || c.frames.length>256) throw new Error('동작 프레임을 1~256개 선택해 주세요.');
    if(c.hitFrame!==undefined) integer(c.hitFrame,0,c.frames.length-1,'타격 프레임');
    const frames=c.frames.map(f=>{
      if(!/^[a-f0-9-]{36}$/.test(f.jobId)) throw new Error('프레임 원본 ID를 확인해 주세요.');
      integer(f.index,0,255,'프레임 번호'); integer(f.x,-4096,4096,'가로 이동');integer(f.y,-4096,4096,'세로 이동');integer(f.duration,10,60000,'프레임 시간');
      return {jobId:f.jobId,index:f.index,x:f.x,y:f.y,duration:f.duration};
    });
    count+=frames.length; pixels+=c.width*c.height*frames.length;
    return {id:String(c.id).slice(0,100),name:c.name,width:c.width,height:c.height,fps:c.fps,loop:c.loop,frames,hitFrame:c.hitFrame};
  });
  if(count>512 || pixels>MAX_ANIMATION_PIXELS) throw new Error('내보내기는 총 512프레임, 1,677만 픽셀 이하로 나누어 주세요.');
  if(clips.some(c=>c.width!==clips[0].width || c.height!==clips[0].height)) throw new Error('함께 내보낼 동작의 프레임 가로·세로를 같게 맞춰 주세요.');
  return clips;
}
function word(n:number){const b=Buffer.alloc(2);b.writeUInt16LE(n);return b;}
function string(s:string){const b=Buffer.from(s);return Buffer.concat([word(b.length),b]);}
function chunk(type:number, data:Buffer){const h=Buffer.alloc(6);h.writeUInt32LE(data.length+6);h.writeUInt16LE(type,4);return Buffer.concat([h,data]);}
export function aseprite(rendered:RenderedClip[],width:number,height:number,palette:string[]) {
  const frames=rendered.flatMap(c=>c.raws.map((raw,i)=>({raw,duration:c.clip.frames[i].duration})));
  const layer=Buffer.alloc(16);layer.writeUInt16LE(3,0);layer[12]=255;
  const tags:Buffer[]=[word(rendered.length),Buffer.alloc(8)];let offset=0;
  for(const {clip} of rendered){const b=Buffer.alloc(17);b.writeUInt16LE(offset);b.writeUInt16LE(offset+clip.frames.length-1,2);b.writeUInt16LE(clip.loop?0:1,5);b[13]=186;b[14]=250;b[15]=122;tags.push(b,string(clip.name));offset+=clip.frames.length;}
  const p=Buffer.alloc(20);p.writeUInt32LE(palette.length+1);p.writeUInt32LE(palette.length,8);
  const entries=[Buffer.alloc(6),...palette.map(c=>Buffer.from([0,0,parseInt(c.slice(1,3),16),parseInt(c.slice(3,5),16),parseInt(c.slice(5,7),16),255]))];
  const encoded=frames.map((f,i)=>{
    const cel=Buffer.alloc(20);cel[6]=255;cel.writeUInt16LE(2,7);cel.writeUInt16LE(width,16);cel.writeUInt16LE(height,18);
    const chunks=[...(i===0?[chunk(0x2004,Buffer.concat([layer,string('Artwork')])),chunk(0x2018,Buffer.concat(tags)),...(palette.length?[chunk(0x2019,Buffer.concat([p,...entries]))]:[])]:[]),chunk(0x2005,Buffer.concat([cel,deflateSync(f.raw)]))];
    const body=Buffer.concat(chunks),h=Buffer.alloc(16);h.writeUInt32LE(body.length+16);h.writeUInt16LE(0xF1FA,4);h.writeUInt16LE(chunks.length,6);h.writeUInt16LE(f.duration,8);h.writeUInt32LE(chunks.length,12);return Buffer.concat([h,body]);
  });
  const data=Buffer.concat(encoded),h=Buffer.alloc(128);h.writeUInt32LE(data.length+128);h.writeUInt16LE(0xA5E0,4);h.writeUInt16LE(frames.length,6);h.writeUInt16LE(width,8);h.writeUInt16LE(height,10);h.writeUInt16LE(32,12);h.writeUInt32LE(1,14);h.writeUInt16LE(frames[0].duration,18);h[34]=1;h[35]=1;return Buffer.concat([h,data]);
}
export async function renderFrame(png:Buffer,width:number,height:number,x:number,y:number,palette?:string[]) {
  const decoded=await sharp(png).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  if(decoded.info.width!==width || decoded.info.height!==height) throw new Error('저장된 프레임 크기가 동작 설정과 다릅니다.');
  const raw=Buffer.alloc(width*height*4),src=decoded.data;
  for(let sy=0;sy<height;sy++) {const dy=sy+y;if(dy<0||dy>=height)continue;const left=Math.max(0,x),right=Math.min(width,width+x);if(right<=left)continue;src.copy(raw,(dy*width+left)*4,(sy*width+left-x)*4,(sy*width+right-x)*4);}
  for(let i=0;i<raw.length;i+=4){if(raw[i+3]<128)raw.fill(0,i,i+4);else raw[i+3]=255;}
  if(palette?.length)applyPalette(raw,palette);
  return {raw,png:await sharp(raw,{raw:{width,height,channels:4}}).png().toBuffer()};
}
export async function exportAnimation(clips:Clip[],load:(jobId:string,index:number)=>Promise<Buffer>,palette?:string[],rpgMaker=false) {
  clips=validateClips(clips);
  const {width,height}=clips[0],rendered:RenderedClip[]=[];
  const zip:Record<string,Uint8Array>={}, warnings:string[]=[];
  for(const clip of clips){const pngs:Buffer[]=[],raws:Buffer[]=[];for(const f of clip.frames){const p=await renderFrame(await load(f.jobId,f.index),width,height,f.x,f.y,palette);pngs.push(p.png);raws.push(p.raw);}rendered.push({clip,pngs,raws});}
  const flat=rendered.flatMap(c=>c.pngs),cols=Math.max(1,Math.min(Math.floor(4096/width),Math.ceil(Math.sqrt(flat.length))));
  if(Math.ceil(flat.length/cols)*height>16384)throw new Error('시트 높이가 16,384px을 넘습니다. 동작을 나누어 내보내세요.');
  const sheet=await packFrames(flat,width,height,cols);zip['pixel_assets/sheet.png']=sheet;
  const frames:Record<string,unknown>={},animations:Record<string,unknown>[]=[];
  const tres:string[]=[`[gd_resource type="SpriteFrames" load_steps=${flat.length+2} format=3]`,'','[ext_resource type="Texture2D" path="res://pixel_assets/sheet.png" id="1"]',''];
  let n=0;const godotAnimations:string[]=[];
  for(const {clip,pngs,raws} of rendered){
    const clipColumns=Math.max(1,Math.min(Math.floor(4096/width),Math.ceil(Math.sqrt(pngs.length))));
    zip[`pixel_assets/sheets/${clip.name}.png`]=await packFrames(pngs,width,height,clipColumns);
    const godotFrames:string[]=[],start=n;
    for(let i=0;i<pngs.length;i++,n++){
      const x=(n%cols)*width,y=Math.floor(n/cols)*height,name=`${clip.name}/${String(i).padStart(3,'0')}.png`;
      zip[`pixel_assets/frames/${name}`]=pngs[i];
      frames[name]={frame:{x,y,w:width,h:height},rotated:false,trimmed:false,spriteSourceSize:{x:0,y:0,w:width,h:height},sourceSize:{w:width,h:height},duration:clip.frames[i].duration};
      tres.push(`[sub_resource type="AtlasTexture" id="Atlas_${n}"]`,`atlas = ExtResource("1")`,`region = Rect2(${x}, ${y}, ${width}, ${height})`,'');
      godotFrames.push(`{ "duration": ${clip.frames[i].duration*clip.fps/1000}, "texture": SubResource("Atlas_${n}") }`);
    }
    animations.push({name:clip.name,from:start,to:n-1,direction:'forward',repeat:clip.loop?0:1,fps:clip.fps,loop:clip.loop,hitFrame:clip.hitFrame});
    godotAnimations.push(`{ "name": &"${clip.name}", "speed": ${clip.fps}.0, "loop": ${clip.loop}, "frames": [${godotFrames.join(', ')}] }`);
    zip[`pixel_assets/gif/${clip.name}.gif`]=await sharp(Buffer.concat(raws),{raw:{width,height:height*raws.length,channels:4,pageHeight:height}}).gif({loop:clip.loop?0:1,delay:clip.frames.map(f=>Math.max(10,Math.round(f.duration/10)*10)),dither:0,effort:3,keepDuplicateFrames:true}).toBuffer();
  }
  tres.push('[resource]',`animations = [${godotAnimations.join(',\n')}]`);
  zip['pixel_assets/animations.tres']=strToU8(tres.join('\n'));
  zip['pixel_assets/preview.tscn']=strToU8(`[gd_scene load_steps=2 format=3]\n\n[ext_resource type="SpriteFrames" path="res://pixel_assets/animations.tres" id="1"]\n\n[node name="PixelCharacter" type="AnimatedSprite2D"]\ntexture_filter = 1\nsprite_frames = ExtResource("1")\nanimation = &"${clips[0].name}"\nautoplay = "${clips[0].name}"\ncentered = false\noffset = Vector2(${-Math.floor(width/2)}, ${-Math.round(height*.85)})\n`);
  zip['pixel_assets/metadata.json']=strToU8(JSON.stringify({frames,meta:{app:'Pixel Studio',version:2,image:'sheet.png',format:'RGBA8888',size:{w:cols*width,h:Math.ceil(flat.length/cols)*height},scale:'1',frameTags:animations,pivot:{x:Math.floor(width/2),y:Math.round(height*.85)},palette},clips},null,2));
  zip['pixel_assets/character.aseprite']=aseprite(rendered,width,height,palette??[]);
  if(rpgMaker){
    const dirs=['down','left','right','up'];
    const selected=dirs.map(d=>rendered.find(r=>r.clip.name===`walk_${d}`));
    if(selected.some(c=>!c)) throw new Error('RPG Maker 걷기 내보내기에는 walk_down, walk_left, walk_right, walk_up 네 동작이 필요합니다.');
    const rpgFrames=selected.flatMap(c=>{
      const length=c!.pngs.length;
      return [c!.pngs[0],c!.pngs[Math.floor(length/3)],c!.pngs[Math.floor(length*2/3)]];
    });
    zip['rpg_maker_mz/$Character.png']=await packFrames(rpgFrames,width,height,3);
    warnings.push('MZ 걷기는 방향별 프레임 0, floor(N/3), floor(2N/3)을 3패턴으로 배치했습니다. 가운데 패턴은 정지 자세로도 쓰이므로 편집기에서 순서를 확인하세요. 8방향과 공격 동작 실행은 별도의 게임 로직/플러그인이 필요합니다.');
  }
  zip['README_ko.txt']=strToU8(`Pixel Studio 애니메이션 내보내기\n\nGodot 4.7.2+: ZIP의 pixel_assets 폴더를 Godot 프로젝트 루트로 복사합니다. preview.tscn을 열거나 animations.tres를 AnimatedSprite2D의 Sprite Frames에 넣으세요. Nearest 필터, 발 기준 오프셋이 설정되어 있습니다. 폴더를 이동하면 Godot 편집기에서 경로를 갱신하세요. 동작 이름으로 play("walk_down")을 호출합니다. 이동·충돌·타격 판정은 게임 코드에서 연결합니다. hitFrame은 metadata.json에 저장됩니다.\n\nAseprite: character.aseprite에 Artwork 픽셀 레이어, 프레임별 시간, 동작별 태그가 들어 있습니다. 팔·머리 등 부위별 레이어 자동 분리는 아닙니다.\n\nPNG: sheet.png와 frames 폴더는 동일한 RGBA 픽셀입니다. 프레임 크기는 ${width}x${height}px이며 개별 프레임을 자동 확대/트리밍하지 않습니다. 수동 위치 이동 시 캔버스 밖 픽셀은 잘립니다. 원본은 앱 작업 기록에 보존됩니다.\n\nGIF: 동작별 재생용 파일입니다. 10ms 시간 단위와 최대 256색(투명 포함) 때문에 PNG/Aseprite와 색·시간 표현이 약간 다를 수 있습니다.\n\nRPG Maker MZ: rpg_maker_mz/$Character.png가 있는 경우 img/characters에 넣으세요. 아래·왼쪽·오른쪽·위 순, 3열×4행의 단일 캐릭터 형식입니다.\n${warnings.join('\n')}\n\n동일 캐릭터 유지와 AI 시트 배치에는 검수가 필요합니다. 고정 팔레트는 내보낼 때 불투명 픽셀의 RGB를 지정 목록으로 제한합니다.\n`);
  return {zip:zipSync(zip,{level:6}),warnings,files:Object.keys(zip),entries:zip};
}
