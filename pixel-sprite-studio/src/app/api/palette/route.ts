import sharp from 'sharp';
import { localRequest } from '@/lib/api';
import { imageSource } from '@/lib/image-source';
import { paletteFromRaw } from '@/lib/palette';
import { integer } from '@/lib/animation-types';
import { MAX_UPLOAD_BYTES } from '@/lib/types';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  try {
    localRequest(request);
    if (Number(request.headers.get('content-length')) > MAX_UPLOAD_BYTES+2097152) throw new Error('이미지는 50MB 이하로 선택해 주세요.');
    const form = await request.formData(); const count = integer(Number(form.get('colors') || 16),2,256,'팔레트 색상 수');
    const {bytes} = await imageSource(form);
    const raw = await sharp(bytes).resize({width:512,height:512,fit:'inside',withoutEnlargement:true,kernel:'nearest'}).ensureAlpha().raw().toBuffer();
    return Response.json({palette:paletteFromRaw(raw,count)});
  } catch(e) { return Response.json({error:e instanceof Error?e.message:'색상을 추출하지 못했습니다.'},{status:400}); }
}
