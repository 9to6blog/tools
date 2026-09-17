import { localRequest, acquire, release } from '@/lib/api';
import { imageSource } from '@/lib/image-source';
import { MAX_UPLOAD_BYTES } from '@/lib/types';
import { buildTerrain } from '@/lib/terrain';
import { exportTerrain } from '@/lib/terrain-export';
export const runtime='nodejs';
export async function POST(request:Request){let locked=false;try{
  localRequest(request);
  if(Number(request.headers.get('content-length'))>MAX_UPLOAD_BYTES+1048576)throw new Error('50MB 이하 이미지를 사용하세요.');
  const form=await request.formData(),options=JSON.parse(String(form.get('options')));
  const action=String(form.get('action')??'preview');if(!['preview','export'].includes(action))throw new Error('잘못된 작업입니다.');
  acquire(`terrain-${crypto.randomUUID()}`);locked=true;
  const source=form.get('image')||form.get('sourceId')?(await imageSource(form)).bytes:undefined;
  const result=await buildTerrain(options,source,form.get('map')?JSON.parse(String(form.get('map'))):undefined);
  if(action==='export')return new Response(new Uint8Array(await exportTerrain(result)),{headers:{'Content-Type':'application/zip','Content-Disposition':`attachment; filename="terrain-${result.options.kind}.zip"`,'Cache-Control':'no-store'}});
  return Response.json({options:result.options,atlas:`data:image/png;base64,${result.atlas.toString('base64')}`,columns:result.columns,rows:result.rows,masks:result.masks,report:result.report,grid:result.grid,mapWidth:result.mapWidth,mapHeight:result.mapHeight},{headers:{'Cache-Control':'no-store'}});
}catch(e){return Response.json({error:e instanceof Error?e.message:'지형 생성에 실패했습니다.'},{status:400});}finally{if(locked)release();}}
