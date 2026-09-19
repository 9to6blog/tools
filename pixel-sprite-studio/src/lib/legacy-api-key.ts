export const LEGACY_API_KEY_STORAGE_KEY = 'pixel-studio-openai-api-key-v1';

export function clearLegacyBrowserApiKey(storage: Pick<Storage, 'removeItem'>) {
  try {
    storage.removeItem(LEGACY_API_KEY_STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}
