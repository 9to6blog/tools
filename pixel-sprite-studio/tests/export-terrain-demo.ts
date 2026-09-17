import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { unzipSync } from 'fflate';
import { buildTerrain } from '../src/lib/terrain';
import { exportTerrain } from '../src/lib/terrain-export';
async function main(){
  const source=process.env.TERRAIN_SOURCE_IMAGE?await readFile(process.env.TERRAIN_SOURCE_IMAGE):undefined;
  for(const kind of ['road16','blob47'] as const){
    const r=await buildTerrain({kind,tileSize:16,seed:7,baseColor:'#619B35',fillColor:'#BA8450',...(source?{basePatch:{x:0,y:0,width:16,height:16},fillPatch:{x:62,y:33,width:8,height:8}}:{})},source);
    const zip=await exportTerrain(r),root=path.resolve('test-artifacts/terrain',kind);await mkdir(root,{recursive:true});
    for(const [name,bytes]of Object.entries(unzipSync(zip))){const dest=path.join(root,name);await mkdir(path.dirname(dest),{recursive:true});await writeFile(dest,bytes);}
    await writeFile(path.join(root,'project.godot'),`config_version=5\n[application]\nconfig/name="Terrain validation"\nrun/main_scene="res://pixel_terrain/${kind}/preview_map.tscn"\n[rendering]\nrenderer/rendering_method="gl_compatibility"\n`);
    await writeFile(path.resolve('test-artifacts/terrain',`${kind}-16px.zip`),zip);
    console.log(JSON.stringify({kind,...r.report}));
  }
}
main().catch(e=>{console.error(e);process.exitCode=1;});
