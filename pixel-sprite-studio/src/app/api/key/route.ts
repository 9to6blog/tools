import { NextResponse } from 'next/server';
import { client, localRequest, safeError } from '@/lib/api';
import { MODELS } from '@/lib/types';
export async function POST(request: Request) {
  try {
    localRequest(request);
    const input = await request.json();
    if (!MODELS.includes(input.model)) return NextResponse.json({ error: '모델을 확인해 주세요.' }, { status: 400 });
    await client(input.apiKey).models.retrieve(input.model);
    return NextResponse.json({ ok: true, message: '키 인증 및 모델 조회 성공. 실제 이미지 생성 권한과 잔액은 생성 요청 시 확인됩니다.' });
  } catch (error) { return NextResponse.json({ error: safeError(error) }, { status: 400 }); }
}
