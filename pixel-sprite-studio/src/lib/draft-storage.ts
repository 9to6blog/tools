export type DraftFiles = Record<string, File | File[] | null>;
type StoredFile = { blob: Blob; name: string; type: string; lastModified: number };
type StoredFiles = Record<string, StoredFile | StoredFile[] | null>;
const databaseName = 'pixel-studio-drafts-v1';
function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => request.result.createObjectStore('files');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('파일 저장소를 열지 못했습니다.'));
  });
}
export async function readDraftFiles(key: string): Promise<DraftFiles> {
  const db = await openDatabase();
  try {
    const stored = await new Promise<StoredFiles | undefined>((resolve, reject) => { const request = db.transaction('files').objectStore('files').get(key); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    const restore = (f: StoredFile) => new File([f.blob], f.name, { type: f.type, lastModified: f.lastModified });
    return Object.fromEntries(Object.entries(stored ?? {}).map(([name, value]) => [name, Array.isArray(value) ? value.map(restore) : value ? restore(value) : null]));
  } finally { db.close(); }
}
let fileWrites: Promise<void> = Promise.resolve();
export function writeDraftFiles(key: string, files: DraftFiles): Promise<void> {
  const store = (f: File): StoredFile => ({ blob: f, name: f.name, type: f.type, lastModified: f.lastModified });
  const stored: StoredFiles = Object.fromEntries(Object.entries(files).map(([name, value]) => [name, Array.isArray(value) ? value.map(store) : value ? store(value) : null]));
  const write = async () => {
    const db = await openDatabase();
    try { await new Promise<void>((resolve, reject) => { const tx = db.transaction('files', 'readwrite'); tx.objectStore('files').put(stored, key); tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error); }); }
    finally { db.close(); }
  };
  // Preserve ordering when a large reference is replaced or removed during a save.
  const result = fileWrites.then(write, write); fileWrites = result.catch(() => {}); return result;
}
export async function referenceMetrics(file: Blob) {
  const bitmap = await createImageBitmap(file);
  try {
    if (bitmap.width * bitmap.height > 16_777_216) throw new Error('원본은 1,677만 픽셀 이하로 선택하세요.');
    const canvas = document.createElement('canvas'); canvas.width = bitmap.width; canvas.height = bitmap.height;
    const context = canvas.getContext('2d', { willReadFrequently: true }); if (!context) throw new Error('이미지 크기를 읽지 못했습니다.');
    context.drawImage(bitmap, 0, 0); const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let left = canvas.width, top = canvas.height, right = -1, bottom = -1;
    for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) if (data[(y * canvas.width + x) * 4 + 3] >= 128) { left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y); }
    if (right < left) throw new Error('원본에 불투명한 캐릭터가 없습니다.');
    return { width: canvas.width, height: canvas.height, bodyWidth: right - left + 1, bodyHeight: bottom - top + 1 };
  } finally { bitmap.close(); }
}
