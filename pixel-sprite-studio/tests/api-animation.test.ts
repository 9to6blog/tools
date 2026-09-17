import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import path from 'node:path';
import {mkdir,readFile,rename} from 'node:fs/promises';
import {POST as edit} from '../src/app/api/edit/route';
import {POST as importSheet} from '../src/app/api/animation/import/route';
import {POST as exportRoute} from '../src/app/api/animation/export/route';
import {DEFAULT_SETTINGS} from '../src/lib/types';
import {jobDir,readJob} from '../src/lib/storage';
import {activeJob} from '../src/lib/api';
const key='sk-local-mock-only-not-a-real-key';
const headers={'Host':'127.0.0.1:3216','Origin':'http://127.0.0.1:3216','X-Pixel-Studio':'1'};
test('edit API transmits reference and settings once, duplicate blocked, local import/export makes no API call',async()=>{
  const created:string[]=[],calls:FormData[]=[];
  const source=await sharp({create:{width:32,height:24,channels:4,background:'#336699'}}).png().toBuffer();
  const originalFetch=globalThis.fetch;
  globalThis.fetch=async(url,init)=>{
    if(String(url)==='data:,')return new Response('');
    assert.equal(String(url),'https://api.openai.com/v1/images/edits');
    assert.ok(init?.body instanceof FormData);const form=init.body;calls.push(form);
    assert.equal(form.get('model'),'gpt-image-2.5-flare');assert.equal(form.get('n'),'1');assert.equal(form.has('input_fidelity'),false);
    assert.match(String(form.get('prompt')),/west, left side profile/);assert.match(String(form.get('prompt')),/#FF0000, #00FF00/);
    assert.ok([...form.entries()].some(([k,v])=>k.startsWith('image')&&v instanceof File));
    return new Response(JSON.stringify({created:1,data:[{b64_json:source.toString('base64')}],usage:{total_tokens:1}}),{status:200,headers:{'Content-Type':'application/json','x-request-id':'mock-reference-request'}});
  };
  try{
    const id=crypto.randomUUID();created.push(id);const form=new FormData();form.set('id',id);form.set('image',new File([source],'reference.png',{type:'image/png'}));form.set('apiKey',key);form.set('model','gpt-image-2.5-flare');form.set('quality','low');form.set('prompt','Keep reference hero');
    form.set('settings',JSON.stringify({...DEFAULT_SETTINGS,size:24,width:16,height:24,padding:0,view:'rpg',facing:'left',palette:['#FF0000','#00FF00']}));
    form.set('motion',JSON.stringify({action:'walk',direction:'left',frames:2,fps:8,loop:true,bodyWidth:12,bodyHeight:20,weapon:'sword',custom:''}));
    const res=await edit(new Request('http://127.0.0.1:3216/api/edit',{method:'POST',headers,body:form}));const job=await res.json();assert.equal(res.status,200,JSON.stringify(job));assert.equal(job.animation.frames.length,2);assert.equal(activeJob(),undefined);
    const duplicate=await edit(new Request('http://127.0.0.1:3216/api/edit',{method:'POST',headers,body:form}));assert.equal(duplicate.status,409);assert.equal(calls.length,1);
    assert.ok(!(await readFile(path.join(jobDir(id),'job.json'),'utf8')).includes(key));
    assert.equal((await readJob(id)).requestId,'mock-reference-request');
    const palette=new Set(['ff0000','00ff00']);for(const f of job.animation.frames){const raw=await sharp(await readFile(path.join(jobDir(id),f))).raw().toBuffer();for(let i=0;i<raw.length;i+=4)if(raw[i+3])assert.ok(palette.has(raw.subarray(i,i+3).toString('hex')));}
    const localId=crypto.randomUUID();created.push(localId);const local=new FormData();local.set('id',localId);local.set('image',new File([source],'sheet.png',{type:'image/png'}));local.set('settings',JSON.stringify({...DEFAULT_SETTINGS,size:24,width:16,height:24,padding:0}));local.set('sheet',JSON.stringify({name:'walk_left',cellWidth:16,cellHeight:24,columns:2,count:2,margin:0,spacing:0,start:0,fps:8,loop:true}));
    const imported=await importSheet(new Request('http://127.0.0.1:3216/api/animation/import',{method:'POST',headers,body:local}));assert.equal(imported.status,200,await imported.text());
    const exported=await exportRoute(new Request('http://127.0.0.1:3216/api/animation/export',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({clips:[{id:'test',name:'walk_left',width:16,height:24,fps:8,loop:true,frames:[0,1].map(index=>({jobId:localId,index,x:0,y:0,duration:125}))}]})}));assert.equal(exported.status,200);assert.equal(exported.headers.get('Content-Type'),'application/zip');assert.equal(calls.length,1);assert.equal(activeJob(),undefined);
    assert.equal((await readJob(localId)).kind,'sheet');
  }finally{
    globalThis.fetch=originalFetch;const dest=path.resolve('test-artifacts/api-animation-jobs');await mkdir(dest,{recursive:true});
    for(const id of created){const from=jobDir(id),to=path.join(dest,id);if(!from.startsWith(path.resolve('outputs')+path.sep)||!to.startsWith(dest+path.sep))throw new Error('Test archive path boundary');await rename(from,to).catch(()=>{});}
  }
});
