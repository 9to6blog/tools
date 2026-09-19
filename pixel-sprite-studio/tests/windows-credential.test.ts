import assert from 'node:assert/strict';
import test from 'node:test';
import { clearLegacyBrowserApiKey, LEGACY_API_KEY_STORAGE_KEY } from '../src/lib/legacy-api-key';
import { validateApiKey, WINDOWS_CREDENTIAL_TARGET } from '../src/lib/windows-credential';

test('credential target is app-specific and API keys are normalized before native storage', () => {
  assert.equal(WINDOWS_CREDENTIAL_TARGET, '9to6blog.tools.pixel-sprite-studio/openai-api-key');
  assert.equal(validateApiKey('  sk-local-credential-test-key  '), 'sk-local-credential-test-key');
  assert.throws(() => validateApiKey('not-a-key'), /API 키/);
  assert.throws(() => validateApiKey(`sk-${'a'.repeat(511)}`), /API 키/);
});

test('legacy plaintext browser key is removed without reading it', () => {
  let removed = '';
  const storage = { removeItem(key: string) { removed = key; } };
  assert.equal(clearLegacyBrowserApiKey(storage), true);
  assert.equal(removed, LEGACY_API_KEY_STORAGE_KEY);
});

test('legacy cleanup fails closed when browser storage is unavailable', () => {
  const storage = { removeItem() { throw new Error('blocked'); } };
  assert.equal(clearLegacyBrowserApiKey(storage), false);
});
