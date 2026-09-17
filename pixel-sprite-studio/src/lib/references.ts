import { imageSource } from './image-source';
import { MAX_REFERENCES, MAX_UPLOAD_BYTES } from './types';

export async function readReferences(form: FormData) {
  const files = form.getAll('references');
  if (files.length > MAX_REFERENCES) throw new Error(`레퍼런스는 최대 ${MAX_REFERENCES}장까지 첨부할 수 있습니다.`);
  if (files.some(f => !(f instanceof File) || !f.size) || files.reduce((n, f) => n + (f instanceof File ? f.size : 0), 0) > MAX_UPLOAD_BYTES) throw new Error('레퍼런스 이미지 전체 용량은 50MB 이하여야 합니다.');
  const result: { bytes: Buffer; name: string; file: string }[] = [];
  let total = 0;
  for (const [index, file] of files.entries()) {
    const single = new FormData(); single.set('image', file);
    const source = await imageSource(single);
    total += source.bytes.length;
    if (total > MAX_UPLOAD_BYTES) throw new Error('PNG 변환 후 레퍼런스 전체 용량이 50MB를 넘습니다. 이미지를 줄여 주세요.');
    result.push({ bytes: source.bytes, name: source.name, file: `reference-${index + 1}.png` });
  }
  return result;
}
export function referenceInstructions(count: number, instruction: string) {
  return `\nCreate one new asset using the ${count} attached reference image(s), numbered in upload order. Follow the user's requested subject and these reference instructions; do not reproduce a reference sheet or collage.\nReference instructions: ${instruction || 'Use the references for the subject identity, visual style and colors while following the requested new image.'}`;
}
