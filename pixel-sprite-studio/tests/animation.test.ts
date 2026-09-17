import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { unzipSync } from 'fflate';
import { inflateSync } from 'node:zlib';
import { readFile,writeFile,mkdir } from 'node:fs/promises';
import path from 'node:path';
import { applyPalette } from '../src/lib/palette';
import { parsePalette } from '../src/lib/art-options';
import { splitSheet } from '../src/lib/animation';
import { exportAnimation,renderFrame,validateClips } from '../src/lib/animation-export';
import { exportTiles,validateTiles,type TileSpec } from '../src/lib/tiles';
import { type Clip } from '../src/lib/animation-types';
const artifacts=path.resolve('test-artifacts/animation-native');
const id='11111111-1111-4111-8111-111111111111';
async function fixture(){const frames:Buffer[]=[];for(let f=0;f<3;f++){const raw=Buffer.alloc(16*24*4);for(let y=5;y<20;y++)for(let x=4+f;x<10+f;x++)raw.set([40+f*40,160,70,255],(y*16+x)*4);frames.push(await sharp(raw,{raw:{width:16,height:24,channels:4}}).png().toBuffer());}return frames;}
function clip(name='walk_down'):Clip{return {id:name,name,width:16,height:24,fps:10,loop:true,frames:[0,1,2].map(index=>({jobId:id,index,x:0,y:0,duration:[100,200,300][index]})),hitFrame:1};}
test('fixed palette emits exact RGB members and parses HEX/GPL lists',()=>{const raw=Buffer.from([200,12,20,255,17,210,10,255,1,2,3,0]);applyPalette(raw,['#FF0000','#00FF00']);assert.deepEqual([...raw],[255,0,0,255,0,255,0,255,1,2,3,0]);assert.deepEqual(parsePalette('GIMP Palette\n255 0 0 red\n0 255 0 green'),['#FF0000','#00FF00']);assert.deepEqual(parsePalette('["#ff0000", "#FF0000"]'),['#FF0000']);});
test('sheet margin, spacing, start and empty cells keep exact coordinates',async()=>{const frames=await fixture();const sheet=await sharp({create:{width:39,height:28,channels:4,background:'#00000000'}}).composite([{input:frames[0],left:2,top:2},{input:frames[1],left:21,top:2}]).png().toBuffer();const split=await splitSheet(sheet,{name:'test',cellWidth:16,cellHeight:24,columns:2,count:1,start:1,margin:2,spacing:3,fps:10,loop:true});assert.deepEqual(await sharp(split[0]).raw().toBuffer(),await sharp(frames[1]).raw().toBuffer());await assert.rejects(()=>splitSheet(sheet,{name:'test',cellWidth:16,cellHeight:24,columns:2,count:2,start:1,margin:2,spacing:3,fps:10,loop:true}),/범위/);});
test('frame offset crops at canvas edges without resizing body',async()=>{const frames=await fixture();const p=await renderFrame(frames[0],16,24,-5,2,['#FF0000','#00FF00']);assert.equal(p.raw[(7*16)*4+3],255);assert.equal(p.raw[(5*16)*4+3],0);assert.equal(p.raw[(7*16+7)*4+3],0);});
test('animation ZIP round trips frames, GIF timing, Aseprite cels/tags and RPG layout',async()=>{
  const images=await fixture(),clips=['down','left','right','up'].map(d=>clip(`walk_${d}`));
  const result=await exportAnimation(clips,async(_,i)=>images[i],undefined,true);const files=unzipSync(result.zip);
  await mkdir(artifacts,{recursive:true});
  for(const [name,bytes] of Object.entries(files)){const dest=path.join(artifacts,name);await mkdir(path.dirname(dest),{recursive:true});await writeFile(dest,bytes);}
  await writeFile(path.join(artifacts,'project.godot'),'config_version=5\n[application]\nconfig/name="Pixel Studio validation"\n[rendering]\nrenderer/rendering_method="gl_compatibility"\n');
  const gif=await sharp(files['pixel_assets/gif/walk_down.gif'],{animated:true}).metadata();assert.equal(gif.pages,3);assert.equal(gif.width,16);assert.equal(gif.pageHeight,24);assert.deepEqual(gif.delay,[100,200,300]);
  const ase=Buffer.from(files['pixel_assets/character.aseprite']);assert.equal(ase.readUInt16LE(4),0xa5e0);assert.equal(ase.readUInt16LE(6),12);assert.equal(ase.readUInt32LE(0),ase.length);let pos=128,celCount=0,tagCount=0;
  for(let frame=0;frame<12;frame++){const end=pos+ase.readUInt32LE(pos);assert.equal(ase.readUInt16LE(pos+4),0xf1fa);assert.equal(ase.readUInt16LE(pos+8),[100,200,300][frame%3]);let cp=pos+16;while(cp<end){const len=ase.readUInt32LE(cp),type=ase.readUInt16LE(cp+4);if(type===0x2005){const raw=inflateSync(ase.subarray(cp+6+20,cp+len));assert.deepEqual(raw,await sharp(images[frame%3]).raw().toBuffer());celCount++;}if(type===0x2018)tagCount=ase.readUInt16LE(cp+6);cp+=len;}pos=end;}assert.equal(celCount,12);assert.equal(tagCount,4);
  const rpg=files['rpg_maker_mz/$Character.png'];const meta=await sharp(rpg).metadata();assert.equal(meta.width,48);assert.equal(meta.height,96);
  for(let y=0;y<4;y++)for(let x=0;x<3;x++)assert.deepEqual(await sharp(rpg).extract({left:x*16,top:y*24,width:16,height:24}).raw().toBuffer(),await sharp(images[x]).raw().toBuffer());
  assert.match(Buffer.from(files['pixel_assets/animations.tres']).toString(),/"duration": 2/);
  await assert.rejects(()=>exportAnimation([clips[0]],async(_,i)=>images[i],undefined,true),/네 동작/);
});
test('animation bounds and duplicate names reject before export',()=>{assert.throws(()=>validateClips([clip(),clip()]),/중복/);assert.throws(()=>validateClips([{...clip(),width:4096,height:4096}]),/픽셀/);assert.throws(()=>validateClips([{...clip(),name:'../x'}]),/동작 이름/);});
test('128 atlas separates into 16px cells, groups and terrain properties survive export',async()=>{
  const raw=Buffer.alloc(128*128*4);for(let y=0;y<128;y++)for(let x=0;x<128;x++)raw.set([Math.floor(x/16)*28,Math.floor(y/16)*28,80,255],(y*128+x)*4);
  const source=await sharp(raw,{raw:{width:128,height:128,channels:4}}).png().toBuffer();
  const spec:TileSpec={tileWidth:16,tileHeight:16,columns:8,rows:8,margin:0,spacing:0,terrainName:'Grass',groups:[{x:0,y:0,w:2,h:2,solid:true},{x:2,y:0,w:1,h:1,solid:false,terrain:[0,1,2,3,4,5,6,7]}]};
  const result=await exportTiles(source,spec),files=unzipSync(result.zip);assert.equal(result.groups.length,61);assert.deepEqual(await sharp(result.atlas).raw().toBuffer(),raw);
  const tres=Buffer.from(files['pixel_tiles/tileset.tres']).toString();assert.match(tres,/texture_region_size = Vector2i\(16, 16\)/);assert.match(tres,/0:0\/size_in_atlas = Vector2i\(2, 2\)/);assert.match(tres,/terrain_set_0\/mode = 0/);
  for(const [name,bytes] of Object.entries(files)){const dest=path.join(artifacts,name);await mkdir(path.dirname(dest),{recursive:true});await writeFile(dest,bytes);}
  assert.throws(()=>validateTiles({...spec,groups:[...spec.groups,{x:1,y:1,w:1,h:1,solid:false}]}),/겹/);
  assert.deepEqual(await readFile(path.join(artifacts,'source/original.png')),source);
  const fixed=await exportTiles(source,{...spec,columns:1,rows:1,groups:[]},['#FF0000','#00FF00']);
  const fixedRaw=await sharp(fixed.atlas).raw().toBuffer();
  for(let i=0;i<fixedRaw.length;i+=4)assert.ok(['ff0000','00ff00'].includes(fixedRaw.subarray(i,i+3).toString('hex')));
});
