import { toFile } from 'openai';
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { acquire, apiErrorDetails, client, localRequest, promptFor, release, safeError } from '@/lib/api';
import { imageSource } from '@/lib/image-source';
import { usageCost } from '@/lib/pricing';
import { artPrompt } from '@/lib/art-options';
import { motionApiSize, motionLayout, motionPrompt, validateMotion } from '@/lib/animation-types';
import { finishAnimation } from '@/lib/animation';
import { finishJob, jobDir, readJob, saveJob } from '@/lib/storage';
import { dimensions, generationSize, MAX_UPLOAD_BYTES, MODELS, validateSettings, type Job } from '@/lib/types';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  let job:Job|undefined, locked=false, called=false, requestKey='';
  try {
    localRequest(request);
    if(Number(request.headers.get('content-length'))>MAX_UPLOAD_BYTES+32768) throw new Error('이미지는 50MB 이하로 선택해 주세요.');
    const form=await request.formData(), id=String(form.get('id')); jobDir(id);
    const settings=validateSettings(JSON.parse(String(form.get('settings'))));
    const model=String(form.get('model')), quality=String(form.get('quality'));
    if(!MODELS.includes(model as typeof MODELS[number]) || !['low','medium','high'].includes(quality)) throw new Error('모델과 품질을 확인해 주세요.');
    const prompt=String(form.get('prompt')||'Preserve this character and its design.').trim();
    if(prompt.length>4000) throw new Error('설명은 4,000자 이하로 입력해 주세요.');
    const motion=form.get('motion')?validateMotion(JSON.parse(String(form.get('motion'))),settings):undefined;
    const source=await imageSource(form); const openai=client(form.get('apiKey'));
    requestKey=openai.apiKey??'';
    acquire(id); locked=true;
    if(await readJob(id).catch(()=>null)) return Response.json({error:'이미 요청한 작업입니다. 작업 기록을 확인해 주세요.'},{status:409});
    const target=dimensions(settings);
    const layout=motion?motionLayout(motion.frames):undefined;
    const size=motion?motionApiSize(target.width,target.height,motion.frames):generationSize(settings);
    job={id,created:new Date().toISOString(),prompt:motion?`${motion.action}_${motion.direction} · ${prompt}`:prompt,model,quality,kind:motion?'motion':'edit',source:source.source,settings,status:'generating',variants:[],apiSize:size};
    await saveJob(job);
    await mkdir(jobDir(id),{recursive:true}); await writeFile(path.join(jobDir(id),'reference.png'),source.bytes);
    called=true;
    // Use the model's default input handling instead of forcing the optional input_fidelity override.
    const {data:response,request_id}=await openai.images.edit({model,image:await toFile(source.bytes,'reference.png',{type:'image/png'}),prompt:motion?motionPrompt(prompt,settings,motion):promptFor(prompt,target.width,settings.colors,target.height)+artPrompt(settings)+'\nEdit the reference image. Preserve identity, outfit, materials and recognizable features while applying the requested camera, facing and pose.',n:1,size,quality:quality as 'low'|'medium'|'high',background:'transparent',output_format:'png'}).withResponse();
    job.requestId=request_id??undefined;
    job.usage=response.usage; job.cost=usageCost(model,response.usage);
    await saveJob(job);
    const b64=response.data?.[0]?.b64_json;
    if(!b64) throw new Error('Missing image');
    const image=Buffer.from(b64,'base64');
    if(motion && layout) {
      const meta=await sharp(image).metadata();
      if(!meta.width || !meta.height || meta.width%layout.columns || meta.height%layout.rows) {
        await writeFile(path.join(jobDir(id),'original.png'),image); job.original='original.png';
        throw new Error('The generated grid cannot be split evenly');
      }
      return Response.json(await finishAnimation(job,image,{name:`${motion.action}_${motion.direction}`,columns:layout.columns,count:motion.frames,cellWidth:meta.width/layout.columns,cellHeight:meta.height/layout.rows,margin:0,spacing:0,start:0,fps:motion.fps,loop:motion.loop},motion));
    }
    return Response.json(await finishJob(job,image));
  } catch(e) {
    const error=called?safeError(e,[requestKey]):e instanceof Error?e.message:'입력을 확인해 주세요.';
    const details=called?apiErrorDetails(e,[requestKey]):undefined;
    if(job){job.status='failed';job.error=error;job.apiError=details;job.requestId=details?.requestId??job.requestId;await saveJob(job).catch(()=>{});}
    return Response.json({error,job},{status:details?.status&&[400,401,403,404,422,429].includes(details.status)?details.status:called?502:400});
  } finally {if(locked)release();}
}
