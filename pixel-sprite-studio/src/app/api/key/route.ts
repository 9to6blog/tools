import { NextResponse } from 'next/server';
import { client, localRequest, safeError } from '@/lib/api';
import { MODELS } from '@/lib/types';
import { deleteStoredApiKey, hasStoredApiKey, saveStoredApiKey } from '@/lib/windows-credential';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  try {
    localRequest(request);
    let hasStoredKey = false;
    try { hasStoredKey = await hasStoredApiKey(); }
    catch (error) { if (!process.env.OPENAI_API_KEY) throw error; }
    return NextResponse.json({ hasKey: hasStoredKey || !!process.env.OPENAI_API_KEY, hasStoredKey, keySource: hasStoredKey ? 'windows' : process.env.OPENAI_API_KEY ? 'environment' : null }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'API 키 상태를 확인하지 못했습니다.' }, { status: 500 }); }
}
export async function POST(request: Request) {
  try {
    localRequest(request);
    const input = await request.json();
    if (!MODELS.includes(input.model)) return NextResponse.json({ error: '모델을 확인해 주세요.' }, { status: 400 });
    const apiKey = typeof input.apiKey === 'string' ? input.apiKey.trim() : '';
    await (await client(apiKey || undefined)).models.retrieve(input.model);
    if (apiKey) await saveStoredApiKey(apiKey);
    return NextResponse.json({ ok: true, hasStoredKey: !!apiKey || undefined, message: apiKey ? '키 인증 성공. Windows 자격 증명 관리자에 저장했습니다.' : '저장된 키의 인증 및 모델 조회에 성공했습니다.' });
  } catch (error) { return NextResponse.json({ error: error instanceof Error && !('status' in error) ? error.message : safeError(error) }, { status: 400 }); }
}
export async function DELETE(request: Request) {
  try {
    localRequest(request);
    await deleteStoredApiKey();
    return NextResponse.json({ ok: true, hasKey: !!process.env.OPENAI_API_KEY, message: 'Windows 자격 증명 관리자에서 API 키를 삭제했습니다.' });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'API 키를 삭제하지 못했습니다.' }, { status: 500 }); }
}
