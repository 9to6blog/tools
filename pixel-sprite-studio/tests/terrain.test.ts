import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { buildTerrain, verifyTerrain, validateTerrain } from '../src/lib/terrain';
import { terrainMasks, normalizeMask, mapTiles, type TerrainOptions } from '../src/lib/terrain-rules';
import { godotTerrain } from '../src/lib/terrain-export';
const options:TerrainOptions={kind:'blob47',tileSize:16,seed:7,baseColor:'#619B35',fillColor:'#BA8450'};
test('binary neighborhood enumeration covers 16 road and 47 normalized blob patterns',()=>{
  assert.equal(terrainMasks('road16').length,16);assert.equal(terrainMasks('blob47').length,47);
  assert.equal(normalizeMask(2,'blob47'),0);assert.equal(normalizeMask(7,'blob47'),7);
  assert.equal(normalizeMask(255,'road16'),85);
  const grid=[0,1,0,1,1,1,0,1,0];
  assert.equal(terrainMasks('road16')[mapTiles(grid,3,3,'road16')[4]-1],85);
  grid[1]=0;assert.equal(terrainMasks('road16')[mapTiles(grid,3,3,'road16')[4]-1],84);
});
test('all compatible RGBA seams match for both rules at every offered standard tile size',async()=>{
  for(const kind of ['road16','blob47'] as const)for(const tileSize of [8,16,32,48,64,128]){
    const r=await buildTerrain({...options,kind,tileSize});
    assert.equal(r.report.passed,true,`${kind} ${tileSize}`);assert.equal(r.report.mismatchedPixels,0);
    assert.equal(r.tiles.length,kind==='road16'?17:48);assert.ok(r.report.checkedPairs>100);
    assert.equal(r.report.uniqueImages,r.tiles.length);
  }
});
test('edge corruption is detected independently of atlas dimensions',async()=>{
  const r=await buildTerrain(options),tiles=r.rawTiles.map(b=>Buffer.from(b));tiles[0][0]^=255;
  const report=verifyTerrain(tiles,16,'blob47');assert.equal(report.passed,false);assert.ok(report.mismatchedPairs>0);
});
test('source texture patches and fixed palette keep exact edges and source bytes',async()=>{
  const source=await sharp({create:{width:32,height:16,channels:4,background:'#517E2B'}}).composite([{input:await sharp({create:{width:16,height:16,channels:4,background:'#CC8844'}}).png().toBuffer(),left:16,top:0}]).png().toBuffer();
  const r=await buildTerrain({...options,basePatch:{x:0,y:0,width:16,height:16},fillPatch:{x:16,y:0,width:16,height:16},palette:['#517E2B','#CC8844','#775533']},source);
  assert.equal(r.report.passed,true);assert.deepEqual(r.source,source);
  for(const raw of r.rawTiles)for(let i=0;i<raw.length;i+=4)assert.ok(['517e2b','cc8844','775533'].includes(raw.subarray(i,i+3).toString('hex')));
  await assert.rejects(()=>buildTerrain({...options,basePatch:{x:31,y:0,width:2,height:2}},source),/영역/);
});
test('export metadata has two terrain IDs, correct mode and peering directions',async()=>{
  for(const kind of ['road16','blob47'] as const){const r=await buildTerrain({...options,kind}),tres=godotTerrain(r);
    assert.match(tres,new RegExp(`terrain_set_0/mode = ${kind==='road16'?2:0}`));
    assert.match(tres,/terrain_set_0\/terrain_1\/name = "Path"/);
    assert.equal((tres.match(/\/0\/terrain = 1/g)??[]).length,kind==='road16'?16:47);
    if(kind==='road16')assert.doesNotMatch(tres,/terrains_peering_bit\/top_right_corner/);
  }
});
test('grayscale texture uploads are expanded to RGBA before tiling',async()=>{
  const source=await sharp({create:{width:16,height:16,channels:3,background:'#808080'}}).greyscale().png().toBuffer();
  const r=await buildTerrain({...options,basePatch:{x:0,y:0,width:16,height:16}},source);
  assert.equal(r.report.passed,true);assert.equal(r.rawTiles[0].length,16*16*4);
  assert.deepEqual([...r.rawTiles[0].subarray(0,4)],[128,128,128,255]);
});
test('invalid settings and maps reject before export; palette collapse is reported honestly',async()=>{
  assert.throws(()=>validateTerrain({...options,tileSize:15}),/짝수/);
  await assert.rejects(()=>buildTerrain(options,undefined,[1,0]),/시험 지도/);
  const r=await buildTerrain({...options,palette:['#000000','#000001']});assert.ok(r.report.warnings.length);assert.equal(r.report.passed,true);
});
