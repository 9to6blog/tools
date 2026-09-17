import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import path from 'node:path';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { alignCharacter, characterReference, measureSprite, scaleLock, alphaBounds } from '../src/lib/character-scale';
import { motionApiSize } from '../src/lib/animation-types';
import { finishAnimation, packFrames } from '../src/lib/animation';
import { DEFAULT_SETTINGS, type Job } from '../src/lib/types';
import { jobDir, readJob } from '../src/lib/storage';
import { POST as edit } from '../src/app/api/edit/route';
import { POST as normalize } from '../src/app/api/animation/normalize/route';
import { POST as convert } from '../src/app/api/convert/route';
const headers = { Host: '127.0.0.1:3216', Origin: 'http://127.0.0.1:3216', 'X-Pixel-Studio': '1' };
const settings = { ...DEFAULT_SETTINGS, width: 96, height: 96, size: 96, padding: 0, colors: 2, palette: ['#FF0000','#0000FF'], sampling: 'nearest' as const, exportSet: 'selected' as const };
async function drawing(size: number, body: [number,number,number,number], tool?: [number,number,number,number]) {
  const raw = Buffer.alloc(size*size*4);
  for (const [rect, color] of [[body,[255,0,0,255]],[tool,[0,0,255,255]]] as const) if(rect) for(let y=rect[1];y<rect[1]+rect[3];y++) for(let x=rect[0];x<rect[0]+rect[2];x++) raw.set(color,(y*size+x)*4);
  return sharp(raw,{raw:{width:size,height:size,channels:4}}).png().toBuffer();
}
async function redBounds(png: Buffer) {const {data,info}=await sharp(png).ensureAlpha().raw().toBuffer({resolveWithObject:true});for(let i=0;i<data.length;i+=4)if(data[i]!==255||data[i+1]!==0||data[i+2]!==0)data[i+3]=0;return alphaBounds(data,info.width,info.height)!;}
test('one calibration transform keeps body height, tool reach and motion bob without fitting each silhouette', async () => {
  const reference=await drawing(96,[38,34,20,48]), anchor=await drawing(192,[66,24,60,144]);
  const target=(await measureSprite(reference)).bounds,lock=scaleLock(target,(await measureSprite(anchor)).bounds,96,96);
  const first=await alignCharacter(await drawing(192,[66,24,60,144],[90,0,9,21]),lock);
  const second=await alignCharacter(await drawing(192,[72,18,60,144],[159,30,27,9]),lock);
  assert.deepEqual(await redBounds(first.png),target);
  assert.deepEqual(await redBounds(second.png),{...target,left:40,top:32});
  assert.ok((await measureSprite(first.png)).bounds.height>48,'raised tool must not shrink the body');
  assert.equal(first.clipped,false);
  const side=await alignCharacter(await drawing(192,[81,24,30,144]),lock);assert.equal((await redBounds(side.png)).width,10,'side profile must not be stretched to front width');
  const fitted=await characterReference(reference,96,96,32,48);assert.equal(fitted.bounds.width,20);assert.equal(fitted.bounds.height,48);
  for(let frames=1;frames<=16;frames++){const [w,h]=motionApiSize(96,96,frames,true).split('x').map(Number);assert.ok(w*h<=4_194_304);assert.equal(w%16,0);assert.equal(h%16,0);}
});
test('pose and motion routes remove calibration cells, preserve reference size on reprocess, and repair legacy walks locally', async () => {
  const originalFetch=globalThis.fetch,ids:string[]=[],archive=path.resolve('test-artifacts/character-scale');await mkdir(archive,{recursive:true});
  const reference=await drawing(96,[38,34,20,48]),anchor=await drawing(192,[66,24,60,144]);
  const first=await drawing(192,[66,24,60,144],[90,0,9,21]),second=await drawing(192,[72,18,60,144],[159,30,27,9]);
  let calls=0;
  globalThis.fetch=async(url,init)=>{assert.equal(String(url),'https://api.openai.com/v1/images/edits');calls++;const body=init!.body as FormData,prompt=String(body.get('prompt'));assert.match(prompt,/calibration/i);const motion=prompt.includes('Grid occupied cells:');const sheet=await packFrames(motion?[anchor,first,second]:[anchor,first],192,192,2);return new Response(JSON.stringify({data:[{b64_json:sheet.toString('base64')}],usage:{input_tokens:110,input_tokens_details:{text_tokens:10,image_tokens:100},output_tokens:100}}),{headers:{'Content-Type':'application/json'}});};
  const motion={action:'sword_slash',direction:'down',frames:2,fps:8,loop:true,bodyWidth:20,bodyHeight:48,weapon:'A sword',custom:''};
  function request(motionEnabled:boolean){const id=crypto.randomUUID();ids.push(id);const form=new FormData();form.set('id',id);form.set('apiKey','sk-test-scale-only-not-a-real-key');form.set('model','gpt-image-2.5-flare');form.set('quality','medium');form.set('settings',JSON.stringify(settings));form.set('prompt','Change pose');form.set('image',new File([reference],'reference.png',{type:'image/png'}));if(motionEnabled)form.set('motion',JSON.stringify(motion));return new Request('http://127.0.0.1:3216/api/edit',{method:'POST',headers,body:form});}
  try{
    const poseResponse=await edit(request(false)),pose:Job=await poseResponse.json();assert.equal(poseResponse.status,200,JSON.stringify(pose));assert.equal(pose.scaleLock?.reference.height,48);assert.equal(pose.normalized,'normalized.png');
    assert.equal((await redBounds(await readFile(path.join(jobDir(pose.id),pose.variants[0].file)))).height,48);
    const form=new FormData(),convertedId=crypto.randomUUID();ids.push(convertedId);form.set('id',convertedId);form.set('sourceId',pose.id);form.set('settings',JSON.stringify(settings));const convertedResponse=await convert(new Request('http://127.0.0.1:3216/api/convert',{method:'POST',headers,body:form})),converted:Job=await convertedResponse.json();assert.equal(convertedResponse.status,200,JSON.stringify(converted));assert.equal((await redBounds(await readFile(path.join(jobDir(converted.id),converted.variants[0].file)))).height,48);
    const response=await edit(request(true)),job:Job=await response.json();assert.equal(response.status,200,JSON.stringify(job));assert.equal(job.animation!.frames.length,2);assert.equal(job.scaleLock!.scale,1/3);
    assert.equal((await redBounds(await readFile(path.join(jobDir(job.id),'frame-0.png')))).height,48);assert.equal((await redBounds(await readFile(path.join(jobDir(job.id),'frame-1.png')))).height,48);
    const legacyId=crypto.randomUUID();ids.push(legacyId);const oldRaw=await packFrames([anchor,await drawing(192,[66,18,60,144])],192,192,2);
    const legacy:Job={id:legacyId,created:new Date().toISOString(),prompt:'Legacy walk',model:'test',quality:'medium',kind:'motion',settings,status:'processing',variants:[]};
    await finishAnimation(legacy,oldRaw,{name:'walk_down',cellWidth:192,cellHeight:192,columns:2,count:2,margin:0,spacing:0,start:0,fps:8,loop:true},{...motion,action:'walk',lockScale:false});await writeFile(path.join(jobDir(legacyId),'reference.png'),reference);
    assert.equal((await redBounds(await readFile(path.join(jobDir(legacyId),'frame-0.png')))).height,72);
    const correction=await normalize(new Request('http://127.0.0.1:3216/api/animation/normalize',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({sourceId:legacyId})})),fixed:Job=await correction.json();assert.equal(correction.status,200,JSON.stringify(fixed));ids.push(fixed.id);
    assert.equal(fixed.model,'local');assert.equal(fixed.source,legacyId);assert.equal(fixed.cost,undefined);assert.equal((await redBounds(await readFile(path.join(jobDir(fixed.id),'frame-0.png')))).height,48);assert.ok((await readFile(path.join(jobDir(legacyId),'original.png'))).equals(oldRaw));assert.equal((await readJob(legacyId)).status,'complete');assert.equal(calls,2,'local repair and reprocess must not call the image API');
    await writeFile(path.join(archive,'report.json'),JSON.stringify({passed:true,paidApiCalls:0,mockApiCalls:calls,bodyHeight:48,legacyBefore:72,legacyAfter:48,jobIds:ids},null,2));
  }finally{globalThis.fetch=originalFetch;for(const id of ids){const from=jobDir(id),to=path.join(archive,id);assert.ok(from.startsWith(path.resolve('outputs')+path.sep));assert.ok(to.startsWith(archive+path.sep));await rename(from,to).catch(e=>{if(e.code!=='ENOENT')throw e;});}}
});
