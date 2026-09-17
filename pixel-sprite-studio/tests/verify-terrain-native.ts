import { readFile, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import sharp from 'sharp';
const exec=promisify(execFile),ase=process.env.ASEPRITE_PATH??(process.platform==='win32'?'C:/Program Files/Aseprite/Aseprite.exe':'aseprite'),godot=process.env.GODOT_PATH??'godot';
async function main(){
  for(const kind of ['road16','blob47']){
    const root=path.resolve('test-artifacts/terrain',kind);
    await writeFile(path.join(root,'verify.gd'),(await readFile('tests/verify-terrain.gd','utf8')).replaceAll('res://pixel_terrain/',`res://pixel_terrain/${kind}/`));
    const roundtrip:Record<string,boolean|number>={};
    for(const [native,original]of [['tileset','atlas'],['preview_map','preview']]){
      const png=path.join(root,`${native}-readback.png`);
      await exec(ase,['--batch',path.join(root,`aseprite/${native}.aseprite`),'--save-as',png],{windowsHide:true,timeout:30000});
      const a=await sharp(png).ensureAlpha().raw().toBuffer(),b=await sharp(path.join(root,`pixel_terrain/${kind}/${original}.png`)).ensureAlpha().raw().toBuffer();
      roundtrip[`${native}_pixels_equal`]=a.equals(b);
      if(!a.equals(b))throw new Error(`${kind} ${native}: pixel mismatch`);
    }
    const lua=path.join(root,'inspect.lua');
    await writeFile(lua,'local s=app.open(app.params.file)\nlocal found=false\nfor _,l in ipairs(s.layers) do if l.isTilemap then found=true; assert(#l.tileset==tonumber(app.params.count)); end end\nassert(found,"missing native tilemap")\nprint("Native tileset checked")\n');
    await exec(ase,['--batch','--script-param',`file=${path.join(root,'aseprite/tileset.aseprite')}`,'--script-param',`count=${kind==='road16'?18:49}`,'--script',lua],{windowsHide:true,timeout:30000});
    roundtrip.native_tileset=true;await writeFile(path.join(root,'aseprite-verification.json'),JSON.stringify(roundtrip,null,2));
    await exec(godot,['--headless','--editor','--path',root,'--import','--quit'],{windowsHide:true,timeout:60000,maxBuffer:2e6});
    try{const run=await exec(godot,['--headless','--path',root,'--script','res://verify.gd'],{windowsHide:true,timeout:60000,maxBuffer:2e6});console.log(run.stdout);}catch(e){console.error((e as {stdout?:string;stderr?:string}).stdout,(e as {stderr?:string}).stderr);throw e;}
    console.log(kind,roundtrip,JSON.parse(await readFile(path.join(root,'godot-verification.json'),'utf8')).passed);
  }
}
main().catch(e=>{console.error(e);process.exitCode=1;});
