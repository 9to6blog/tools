import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { acquire, localRequest, release } from '@/lib/api';
import { jobDir, readJob } from '@/lib/storage';
import { exportAnimation, validateClips } from '@/lib/animation-export';
import { DEFAULT_SETTINGS, validateSettings, type Job } from '@/lib/types';
export const runtime='nodejs';
export async function POST(request:Request){
  let locked=false;
  try{
    localRequest(request);if(Number(request.headers.get('content-length'))>1048576)throw new Error('내보내기 설정이 너무 큽니다.');
    const body=await request.json(),clips=validateClips(body.clips);
    const palette=validateSettings({...DEFAULT_SETTINGS,palette:body.palette}).palette;
    acquire(`export-${crypto.randomUUID()}`);locked=true;
    const jobs=new Map<string,Job>();
    const result=await exportAnimation(clips,async(id,index)=>{
      let job=jobs.get(id);if(!job){job=await readJob(id);jobs.set(id,job);}
      const file=job.animation ? job.animation.frames[index] : job.variants[index]?.file;
      if(!file || job.status!=='complete')throw new Error('완료된 프레임을 찾지 못했습니다. 작업 기록에서 다시 선택해 주세요.');
      return readFile(path.join(jobDir(id),file));
    },palette,body.rpgMaker===true);
    return new Response(new Uint8Array(result.zip),{headers:{'Content-Type':'application/zip','Content-Disposition':'attachment; filename="pixel-animation.zip"','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
  }catch(e){return Response.json({error:e instanceof Error?e.message:'내보내지 못했습니다.'},{status:400});}
  finally{if(locked)release();}
}
