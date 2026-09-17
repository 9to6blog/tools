import OpenAI from 'openai';
import type { ApiErrorDetails } from './types';
export function localRequest(request: Request) {
  // Next may normalize request.url to its internal listener URL. Validate the
  // actual Host and browser Origin instead, without trusting forwarded headers.
  const host = request.headers.get('host');
  if (!host || !/^(127\.0\.0\.1|localhost|\[::1\]):3216$/.test(host)) throw new Error('로컬 주소로 접속해 주세요.');
  const origin = request.headers.get('origin');
  if (origin && origin !== `http://${host}`) throw new Error('다른 사이트에서 보낸 요청은 허용되지 않습니다.');
  if (request.headers.get('x-pixel-studio') !== '1') throw new Error('스튜디오 화면에서 요청해 주세요.');
}
export function client(key: unknown) {
  const apiKey = (typeof key === 'string' ? key.trim() : '') || process.env.OPENAI_API_KEY;
  if (!apiKey || !apiKey.startsWith('sk-') || apiKey.length < 20 || apiKey.length > 512) throw new Error('OpenAI API 키를 입력해 주세요.');
  return new OpenAI({ apiKey, maxRetries: 0, timeout: 240_000 });
}
const runtime = globalThis as typeof globalThis & { pixelStudioActive?: string };
export function activeJob() { return runtime.pixelStudioActive; }
export function acquire(id: string) {
  if (runtime.pixelStudioActive) throw new Error('이미 처리 중인 작업이 있습니다. 완료 후 다시 시도해 주세요.');
  runtime.pixelStudioActive = id;
}
export function release() { runtime.pixelStudioActive = undefined; }
// Keep only diagnostic fields, never the complete SDK error or its headers.
export function apiErrorDetails(error: unknown, secrets: readonly string[] = []): ApiErrorDetails | undefined {
  if (!(error instanceof OpenAI.APIError)) return undefined;
  function clean(value: unknown, limit = 1000) {
    if (typeof value !== 'string' || !value.trim()) return undefined;
    let text = value;
    for (const secret of [...secrets, process.env.OPENAI_API_KEY ?? '']) {
      if (secret) text = text.split(secret).join('[API 키 숨김]');
    }
    text = text.replace(/sk-[a-z0-9_-]+/gi, '[API 키 숨김]')
      .replace(/Bearer\s+[^\s"',;]+/gi, 'Bearer [숨김]')
      .replace(/data:image\/[^\s"']+/gi, '[이미지 데이터 숨김]')
      .replace(/[\u0000-\u001f\u007f]/g, ' ').trim();
    return text.length > limit ? text.slice(0, limit) + '…' : text;
  }
  const body = error.error as { message?: unknown } | undefined;
  return {
    status: error.status,
    code: clean(error.code, 120), param: clean(error.param, 120), type: clean(error.type, 120),
    message: clean(body?.message ?? error.message), requestId: clean(error.requestID, 200),
  };
}
export function safeError(error: unknown, secrets: readonly string[] = []) {
  if (error instanceof OpenAI.APIError) {
    const details = apiErrorDetails(error, secrets)!;
    let message = 'API 응답을 확인하지 못했습니다. 중복 과금을 피하기 위해 자동 재시도하지 않습니다. 작업 기록을 먼저 확인해 주세요.';
    if (error.status === 401) message = 'API 키 인증에 실패했습니다. 키를 확인해 주세요.';
    else if (error.status === 403 || error.status === 404) message = '요청한 API 또는 모델에 접근하지 못했습니다. 프로젝트 권한과 모델 접근 여부를 확인해 주세요.';
    else if (error.status === 429) message = 'API 한도 또는 결제 잔액을 확인해 주세요. 자동으로 다시 요청하지 않습니다.';
    else if (error.status === 400 || error.status === 422) {
      if (/moderation|content_policy|safety/i.test(details.code ?? '')) message = 'API의 콘텐츠 검사에서 요청이 거절되었습니다. 아래 사유와 참조 이미지를 확인해 주세요.';
      else if (details.param) message = `API가 요청 설정을 거절했습니다. 확인할 항목: ${details.param}.`;
      else message = 'API가 요청을 거절했습니다. 아래 API 사유를 확인해 주세요.';
    }
    const tags = [details.status && `HTTP ${details.status}`, details.code, details.param && `항목 ${details.param}`].filter(Boolean).join(' · ');
    return [message, tags && `[${tags}]`, details.message && `API 사유: ${details.message}`, details.requestId && `요청 ID: ${details.requestId}`].filter(Boolean).join('\n');
  }
  return '작업을 완료하지 못했습니다. 원본이 저장되어 있다면 무료 재변환을 사용할 수 있습니다.';
}
export function promptFor(subject: string, width: number, colors: number, height = width) {
  return `Create one game-ready pixel-art asset of: ${subject}\nDesign specifically for a native ${width} by ${height} pixel bounding box, aspect ratio ${width}:${height}. Represent this pixel design at the supplied output resolution. Every logical pixel must be perfectly flat, axis-aligned and square, on a consistent grid. Use at most ${colors} distinct opaque colors. A clear readable silhouette, intentional compact pixel clusters, crisp stair-step edges, no antialiasing, no gradients, no blur, no dithering, no subpixel details, no realistic textures. ${Math.max(width, height) <= 32 ? 'Extremely simple iconic design. Eyes and features should occupy single logical pixels. Omit fine details.' : 'Use details appropriate to the target resolution. For buildings preserve separate windows, doors, roof shapes and structural features as readable pixel clusters.'}\nOne centered object, entire subject visible without cropping, including roof, base, limbs or tail as applicable. Fit its natural proportions inside the requested bounding box. Occupy about 80 percent of the available image area. Transparent background. No text, no grid lines, no frame, no labels, no floor, no cast shadow, no extra objects. The subject should be recognizable at native resolution.`;
}
