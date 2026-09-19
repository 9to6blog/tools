import assert from 'node:assert/strict';
import test from 'node:test';
import { API_KEY_STORAGE_KEY, loadApiKey, removeApiKey, saveApiKey } from '../src/lib/browser-api-key';

function memoryStorage(initial?: string) {
  const values = new Map<string, string>();
  if (initial !== undefined) values.set(API_KEY_STORAGE_KEY, initial);
  return {
    getItem(key: string) { return values.get(key) ?? null; },
    setItem(key: string, value: string) { values.set(key, value); },
    removeItem(key: string) { values.delete(key); },
  };
}

test('API key is trimmed, saved, and restored from browser storage', () => {
  const storage = memoryStorage();
  assert.equal(saveApiKey(storage, '  sk-local-browser-key  '), true);
  assert.equal(loadApiKey(storage), 'sk-local-browser-key');
});

test('empty values and the remove action delete the stored API key', () => {
  const storage = memoryStorage('sk-existing-key');
  assert.equal(saveApiKey(storage, '   '), true);
  assert.equal(loadApiKey(storage), '');
  saveApiKey(storage, 'sk-another-key');
  assert.equal(removeApiKey(storage), true);
  assert.equal(loadApiKey(storage), '');
});

test('unavailable browser storage fails closed without exposing the key', () => {
  const storage = {
    getItem() { throw new Error('blocked'); },
    setItem() { throw new Error('blocked'); },
    removeItem() { throw new Error('blocked'); },
  };
  assert.equal(loadApiKey(storage), '');
  assert.equal(saveApiKey(storage, 'sk-secret-value'), false);
  assert.equal(removeApiKey(storage), false);
});
