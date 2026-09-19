export const API_KEY_STORAGE_KEY = 'pixel-studio-openai-api-key-v1';

type BrowserStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export function loadApiKey(storage: BrowserStorage) {
  try {
    const apiKey = storage.getItem(API_KEY_STORAGE_KEY)?.trim() ?? '';
    return apiKey.length <= 512 ? apiKey : '';
  } catch {
    return '';
  }
}

export function saveApiKey(storage: BrowserStorage, value: string) {
  try {
    const apiKey = value.trim();
    if (apiKey) storage.setItem(API_KEY_STORAGE_KEY, apiKey);
    else storage.removeItem(API_KEY_STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}

export function removeApiKey(storage: BrowserStorage) {
  try {
    storage.removeItem(API_KEY_STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}
