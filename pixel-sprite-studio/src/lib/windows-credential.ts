import { spawn } from 'node:child_process';
import path from 'node:path';

export const WINDOWS_CREDENTIAL_TARGET = '9to6blog.tools.pixel-sprite-studio/openai-api-key';
const MAX_API_KEY_LENGTH = 512;
const CACHE_MS = 60_000;

type CredentialAction = 'read' | 'write' | 'delete';
type CredentialRuntime = typeof globalThis & { pixelStudioCredentialCache?: { value: string; expires: number } };
const credentialRuntime = globalThis as CredentialRuntime;

export function validateApiKey(value: unknown) {
  const apiKey = typeof value === 'string' ? value.trim() : '';
  if (!apiKey || !apiKey.startsWith('sk-') || apiKey.length < 20 || apiKey.length > MAX_API_KEY_LENGTH) {
    throw new Error('OpenAI API 키를 입력해 주세요.');
  }
  return apiKey;
}

function runCredential(action: CredentialAction, apiKey = '') {
  if (process.platform !== 'win32') return Promise.reject(new Error('Windows 자격 증명 관리자는 Windows에서만 사용할 수 있습니다.'));
  const script = path.join(process.cwd(), 'scripts', 'windows-credential.ps1');
  return new Promise<string>((resolve, reject) => {
    const child = spawn('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script, '-Action', action, '-Target', WINDOWS_CREDENTIAL_TARGET], {
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => child.kill(), 10_000);
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', chunk => { if (stdout.length < 4096) stdout += chunk; });
    child.stderr.on('data', chunk => { if (stderr.length < 4096) stderr += chunk; });
    child.on('error', () => { clearTimeout(timer); reject(new Error('Windows 자격 증명 관리자를 실행하지 못했습니다.')); });
    child.on('close', code => {
      clearTimeout(timer);
      if (code === 0) resolve(stdout.trim());
      else reject(new Error(`Windows 자격 증명 관리자 작업에 실패했습니다.${stderr ? ' Windows 상태를 확인해 주세요.' : ''}`));
    });
    child.stdin.end(action === 'write' ? Buffer.from(apiKey, 'utf8').toString('base64') : '');
  });
}

export async function readStoredApiKey(refresh = false) {
  const cached = credentialRuntime.pixelStudioCredentialCache;
  if (!refresh && cached && cached.expires > Date.now()) return cached.value;
  const encoded = await runCredential('read');
  const value = encoded ? Buffer.from(encoded, 'base64').toString('utf8').trim() : '';
  const apiKey = value ? validateApiKey(value) : '';
  credentialRuntime.pixelStudioCredentialCache = { value: apiKey, expires: Date.now() + CACHE_MS };
  return apiKey;
}

export async function saveStoredApiKey(value: unknown) {
  const apiKey = validateApiKey(value);
  await runCredential('write', apiKey);
  credentialRuntime.pixelStudioCredentialCache = { value: apiKey, expires: Date.now() + CACHE_MS };
}

export async function deleteStoredApiKey() {
  await runCredential('delete');
  credentialRuntime.pixelStudioCredentialCache = { value: '', expires: Date.now() + CACHE_MS };
}

export async function hasStoredApiKey() {
  if (process.platform !== 'win32') return false;
  return !!(await readStoredApiKey());
}
