import { localRequest, acquire, release } from '@/lib/api';
import { imageSource } from '@/lib/image-source';
import { validateSheet } from '@/lib/animation-types';
import { finishAnimation } from '@/lib/animation';
import { jobDir, readJob, saveJob } from '@/lib/storage';
import { MAX_UPLOAD_BYTES, validateSettings, type Job } from '@/lib/types';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  let locked=false, job:Job|undefined;
  try {
    localRequest(request);
    if (Number(request.headers.get('content-length')) > MAX_UPLOAD_BYTES+2097152) throw new Error('이미지는 50MB 이하로 선택해 주세요.');
    const form=await request.formData(), id=String(form.get('id')); jobDir(id);
    const settings=validateSettings(JSON.parse(String(form.get('settings'))));
    const spec=validateSheet(JSON.parse(String(form.get('sheet'))));
    acquire(id); locked=true;
    if(await readJob(id).catch(()=>null)) throw new Error('이미 저장된 작업입니다. 작업 기록을 확인해 주세요.');
    const source=await imageSource(form);
    job={id,created:new Date().toISOString(),prompt:source.name,model:'local',quality:'local',kind:'sheet',source:source.source,settings,status:'processing',variants:[]};
    return Response.json(await finishAnimation(job,source.bytes,spec));
  } catch(e) {
    const error=e instanceof Error?e.message:'시트를 분할하지 못했습니다.';
    if(job){job.status='failed';job.error=error;await saveJob(job).catch(()=>{});}
    return Response.json({error,job},{status:400});
  } finally {if(locked) release();}
}
