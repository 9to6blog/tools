import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile}from'node:fs/promises';
import {unzipSync}from'fflate';
const base='http://127.0.0.1:3216';
const before=await(await fetch(`${base}/api/jobs`)).json();
const source=process.env.TERRAIN_SOURCE_IMAGE?await readFile(process.env.TERRAIN_SOURCE_IMAGE):undefined;
const options={kind:'blob47',tileSize:16,seed:7,baseColor:'#619B35',fillColor:'#BA8450',...(source?{basePatch:{x:0,y:0,width:16,height:16},fillPatch:{x:62,y:33,width:8,height:8}}:{})};
async function send(action,map){const form=new FormData();form.set('action',action);form.set('options',JSON.stringify(options));if(source)form.set('image',new Blob([source],{type:'image/png'}),'atlas.png');if(map)form.set('map',JSON.stringify(map));return fetch(`${base}/api/terrain`,{method:'POST',headers:{'X-Pixel-Studio':'1'},body:form});}
let response=await send('preview');assert.equal(response.status,200);const preview=await response.json();assert.equal(preview.report.passed,true);assert.equal(preview.report.checkedPairs,392);
const grid=Array(384).fill(0);grid[25]=1;grid[26]=1;grid[50]=1;
response=await send('export',grid);assert.equal(response.status,200);const zip=new Uint8Array(await response.arrayBuffer()),files=unzipSync(zip),layout=JSON.parse(Buffer.from(files['pixel_terrain/blob47/layout.json']).toString());
assert.deepEqual(layout.map.cells,grid);if(source)assert.deepEqual(Buffer.from(files['source/original.png']),source);
assert.ok(files['aseprite/tileset.aseprite']);assert.ok(files['aseprite/preview_map.aseprite']);
const after=await(await fetch(`${base}/api/jobs`)).json();assert.deepEqual(after.jobs.map(j=>j.id).sort(),before.jobs.map(j=>j.id).sort());assert.equal(after.active,null);
await mkdir('test-artifacts/terrain',{recursive:true});await writeFile('test-artifacts/terrain/http-terrain.zip',zip);await writeFile('test-artifacts/terrain/http-report.json',JSON.stringify({previewPassed:true,sourcePreserved:source?true:'not tested; no source supplied',customMapPreserved:true,nativeAsepriteIncluded:true,userJobsUnchanged:true,jobs:after.jobs.length},null,2));console.log('HTTP preview, native ZIP, custom map and job preservation passed.',source?'Source preservation passed.':'No source image supplied.');
