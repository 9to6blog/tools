'use client';
import { useEffect, useRef, useState } from 'react';
import { readDraftFiles, writeDraftFiles, type DraftFiles } from '@/lib/draft-storage';

export function useWorkspaceDraft(key: string, snapshot: Record<string, unknown>, files: DraftFiles, onRestore: (data: Record<string, unknown>, files: DraftFiles) => void) {
  const [ready, setReady] = useState(false), [warning, setWarning] = useState(''), [saving, setSaving] = useState(false);
  const [restore] = useState(() => onRestore);
  const previousMetadata = useRef<string | null>(null), previousFiles = useRef<DraftFiles | null>(null);
  const filesLoaded = useRef(false);
  const storageKey = `pixel-studio-draft-${key}-v1`, serialized = JSON.stringify(snapshot);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      let data: Record<string, unknown> = {}, saved: DraftFiles = {};
      try { const text = localStorage.getItem(storageKey); if (text) { const parsed = JSON.parse(text); if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) data = parsed; } }
      catch { if (!cancelled) setWarning('작업 설정을 읽지 못했습니다. 브라우저 저장 권한을 확인하세요.'); }
      try { saved = await readDraftFiles(key); filesLoaded.current = true; }
      catch { if (!cancelled) setWarning('레퍼런스 파일을 복원하지 못했습니다. 다시 추가해 주세요.'); }
      if (!cancelled) { try { restore(data, saved); } catch { setWarning('일부 저장 설정이 올바르지 않아 기본값을 사용합니다.'); } previousFiles.current = saved; setReady(true); }
    })();
    return () => { cancelled = true; };
  }, [key, storageKey, restore]);
  useEffect(() => {
    if (!ready || previousMetadata.current === serialized) return;
    try { localStorage.setItem(storageKey, serialized); previousMetadata.current = serialized; }
    catch { queueMicrotask(() => setWarning('설정 저장 공간이 부족하거나 저장이 차단됐습니다.')); }
  }, [ready, serialized, storageKey]);
  useEffect(() => {
    if (!ready) return;
    if (!filesLoaded.current && Object.values(files).every(v => !v || Array.isArray(v) && !v.length)) return;
    const old = previousFiles.current;
    const equal = old && Object.keys(old).length === Object.keys(files).length && Object.entries(files).every(([name, value]) => Array.isArray(value) ? Array.isArray(old[name]) && value.length === old[name].length && value.every((f, i) => f === (old[name] as File[])[i]) : value === old[name]);
    if (equal) return;
    previousFiles.current = files;
    let cancelled = false;
    queueMicrotask(() => { if (!cancelled) setSaving(true); });
    void writeDraftFiles(key, files).catch(() => { if (!cancelled) { previousFiles.current = null; setWarning('레퍼런스 자동 저장에 실패했습니다. 브라우저 저장 공간을 확인하세요.'); } }).finally(() => { if (!cancelled) setSaving(false); });
    return () => { cancelled = true; };
  }, [ready, files, key]);
  return { ready, warning, saving };
}
export function DraftStatus({ ready, warning, saving }: ReturnType<typeof useWorkspaceDraft>) {
  return <p className={`draft-status ${warning ? 'draft-warning' : ''}`} role="status">{!ready ? '마지막 작업 복원 중…' : warning || (saving ? '레퍼런스 파일 저장 중…' : '레퍼런스·프롬프트·설정 자동 저장 · 같은 브라우저에서 다시 열면 복원됩니다.')}</p>;
}
