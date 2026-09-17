import { toFile } from 'openai';
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { acquire, apiErrorDetails, client, localRequest, promptFor, release, safeError } from '@/lib/api';
import { imageSource } from '@/lib/image-source';
import { usageCost } from '@/lib/pricing';
import { artPrompt } from '@/lib/art-options';
import { motionApiSize, motionLayout, motionPrompt, validateMotion } from '@/lib/animation-types';
import { finishAnimation, splitSheet } from '@/lib/animation';
import { pixelate } from '@/lib/pixel';
import { alignCharacter, characterReference, measureSprite, referenceGrid, scaleLock } from '@/lib/character-scale';
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
    const preserveScale=motion?.lockScale ?? form.get('preserveScale')!=='false';
    const count=motion ? motion.frames+(preserveScale?1:0) : preserveScale?2:1;
    const layout=motion||preserveScale?motionLayout(count):undefined;
    const size=motion||preserveScale?motionApiSize(target.width,target.height,motion?.frames??1,preserveScale):generationSize(settings);
    job={id,created:new Date().toISOString(),prompt:motion?`${motion.action}_${motion.direction} · ${prompt}`:prompt,model,quality,kind:motion?'motion':'edit',source:source.source,settings,status:'generating',variants:[],apiSize:size};
    await saveJob(job);
    await mkdir(jobDir(id),{recursive:true}); await writeFile(path.join(jobDir(id),'reference.png'),source.bytes);
    const normalized=preserveScale?(await pixelate(source.bytes,{...settings,width:motion?.bodyWidth??target.width,height:motion?.bodyHeight??target.height,size:Math.max(motion?.bodyWidth??target.width,motion?.bodyHeight??target.height),padding:0,exportSet:'selected',framing:motion?'trim':'canvas'})).outputs[0].png:undefined;
    const reference=normalized ? motion ? await characterReference(normalized,target.width,target.height,motion.bodyWidth,motion.bodyHeight) : {png:normalized,bounds:(await measureSprite(normalized)).bounds} : undefined;
    const input=reference&&layout?await referenceGrid(reference.png,size,layout.columns,layout.rows,count):source.bytes;
    if(reference) { await writeFile(path.join(jobDir(id),'reference-sized.png'),reference.png); await writeFile(path.join(jobDir(id),'reference-guide.png'),input); }
    const editPrompt=promptFor(prompt,target.width,settings.colors,target.height)+artPrompt(settings)+'\nEdit the reference image. Preserve identity, outfit, materials and recognizable features while applying the requested camera, facing and pose.';
    const pairedPrompt=`The input is a ${layout?.columns} by ${layout?.rows} grid of the SAME reference subject. Return exactly TWO equal cells with no border or labels. CELL 0: copy the original pose, camera, facing, body size and equipment unchanged as a scale calibration. CELL 1: apply the following edit only to this cell, keeping the same head size, torso length, limb thickness and pixel scale as cell 0. Do not zoom, fill the canvas, shrink for weapons, or mirror asymmetric equipment. Transparent background. This cell represents a ${target.width} by ${target.height} logical pixel canvas. Edit instructions for CELL 1 only: ${editPrompt}`;
    called=true;
    // Use the model's default input handling instead of forcing the optional input_fidelity override.
    const {data:response,request_id}=await openai.images.edit({model,image:await toFile(input,reference?'reference-guide.png':'reference.png',{type:'image/png'}),prompt:motion?motionPrompt(prompt,settings,motion):preserveScale?pairedPrompt:editPrompt,n:1,size,quality:quality as 'low'|'medium'|'high',background:'transparent',output_format:'png'}).withResponse();
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
      return Response.json(await finishAnimation(job,image,{name:`${motion.action}_${motion.direction}`,columns:layout.columns,count,cellWidth:meta.width/layout.columns,cellHeight:meta.height/layout.rows,margin:0,spacing:0,start:0,fps:motion.fps,loop:motion.loop},motion,reference?.bounds));
    }
    if(reference&&layout) {
      await writeFile(path.join(jobDir(id),'generation-sheet.png'),image);
      const meta=await sharp(image).metadata();
      if(!meta.width||!meta.height||meta.width%layout.columns||meta.height%layout.rows)throw new Error('크기 기준 칸과 자세 변경 결과를 나누지 못했습니다. 원본 응답은 보존됩니다.');
      const [calibration,pose]=await splitSheet(image,{name:'pose',columns:layout.columns,count:2,cellWidth:meta.width/layout.columns,cellHeight:meta.height/layout.rows,margin:0,spacing:0,start:0,fps:1,loop:false});
      await writeFile(path.join(jobDir(id),'calibration.png'),calibration);
      job.scaleLock=scaleLock(reference.bounds,(await measureSprite(calibration)).bounds,target.width,target.height);
      job.settings={...settings,framing:'canvas'};
      const aligned=await alignCharacter(pose,job.scaleLock);
      const result=await finishJob(job,pose,aligned.png);
      if(aligned.clipped){result.warning='몸 크기를 유지하면 일부가 캔버스 밖으로 나갑니다. 더 큰 출력 영역을 사용하세요.';await saveJob(result);}
      return Response.json(result);
    }
    return Response.json(await finishJob(job,image));
  } catch(e) {
    const error=called?safeError(e,[requestKey]):e instanceof Error?e.message:'입력을 확인해 주세요.';
    const details=called?apiErrorDetails(e,[requestKey]):undefined;
    if(job){job.status='failed';job.error=error;job.apiError=details;job.requestId=details?.requestId??job.requestId;await saveJob(job).catch(()=>{});}
    return Response.json({error,job},{status:details?.status&&[400,401,403,404,422,429].includes(details.status)?details.status:called?502:400});
  } finally {if(locked)release();}
}
