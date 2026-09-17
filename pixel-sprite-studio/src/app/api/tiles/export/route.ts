import { localRequest, acquire, release } from '@/lib/api';
import { imageSource } from '@/lib/image-source';
import { exportTiles, validateTiles } from '@/lib/tiles';
import { MAX_UPLOAD_BYTES,DEFAULT_SETTINGS,validateSettings } from '@/lib/types';
export const runtime='nodejs';
export async function POST(request:Request){let locked=false;try{
  localRequest(request);if(Number(request.headers.get('content-length'))>MAX_UPLOAD_BYTES+1048576)throw new Error('이미지는 50MB 이하로 선택해 주세요.');
  const form=await request.formData(),spec=validateTiles(JSON.parse(String(form.get('tiles'))));
  const palette=validateSettings({...DEFAULT_SETTINGS,palette:form.get('palette')?JSON.parse(String(form.get('palette'))):undefined}).palette;
  const {bytes}=await imageSource(form);acquire(`tiles-${crypto.randomUUID()}`);locked=true;
  const result=await exportTiles(bytes,spec,palette);return new Response(new Uint8Array(result.zip),{headers:{'Content-Type':'application/zip','Content-Disposition':'attachment; filename="godot-tileset.zip"','Cache-Control':'no-store'}});
}catch(e){return Response.json({error:e instanceof Error?e.message:'타일셋을 내보내지 못했습니다.'},{status:400});}finally{if(locked)release();}}
