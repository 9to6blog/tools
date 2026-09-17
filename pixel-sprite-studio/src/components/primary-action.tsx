'use client';
import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { ArrowRight, LoaderCircle } from 'lucide-react';
import { Button } from './ui/button';

type Action = { label: string; detail: string; disabled: boolean; error?: string; run: () => void | Promise<void> };
type ActionView = Omit<Action, 'run'>;
type Registry = { publish: (owner: string, action: Action) => void; clear: (owner: string) => void };
const RegistryContext = createContext<Registry | null>(null);
const HeaderContext = createContext<{ action: ActionView | null; run: () => void } | null>(null);

export function PrimaryActionProvider({ children }: { children: ReactNode }) {
  const current = useRef<{ owner: string; action: Action } | null>(null);
  const [action, setAction] = useState<ActionView | null>(null);
  const publish = useCallback((owner: string, next: Action) => {
    current.current = { owner, action: next };
    setAction(previous => previous?.label === next.label && previous.detail === next.detail && previous.disabled === next.disabled && previous.error === next.error
      ? previous : { label: next.label, detail: next.detail, disabled: next.disabled, error: next.error });
  }, []);
  const clear = useCallback((owner: string) => {
    if (current.current?.owner === owner) { current.current = null; setAction(null); }
  }, []);
  const run = useCallback(() => {
    const selected = current.current?.action;
    if (selected && !selected.disabled) void selected.run();
  }, []);
  const registry = useMemo(() => ({ publish, clear }), [publish, clear]);
  return <RegistryContext.Provider value={registry}><HeaderContext.Provider value={{ action, run }}>{children}</HeaderContext.Provider></RegistryContext.Provider>;
}
export function usePrimaryAction(enabled: boolean, action: Action) {
  const registry = useContext(RegistryContext), owner = useId();
  // Keep the latest handler without making its changing closure trigger a
  // workspace rerender. Only the header subscribes to the visible metadata.
  useEffect(() => { if (enabled) registry?.publish(owner, action); }, [enabled, registry, owner, action]);
  useEffect(() => () => registry?.clear(owner), [enabled, registry, owner]);
}
export function HeaderPrimaryAction({ busy }: { busy: boolean }) {
  const state = useContext(HeaderContext), action = state?.action;
  return <div className="header-action">
    <div className="header-action-detail"><span>{action?.detail ?? '작업 준비 중'}</span>{action?.error && <span className="header-action-error" role="alert" title={action.error}>{action.error}</span>}</div>
    <Button type="button" className="header-generate" disabled={busy || !action || action.disabled} onClick={() => state?.run()} aria-label={`상단 ${busy ? '작업 진행 중' : action?.label ?? '작업 준비 중'}`}>
      {busy ? <LoaderCircle size={17} className="spin" /> : <ArrowRight size={17} />}{busy ? '작업 진행 중' : action?.label ?? '준비 중'}
    </Button>
  </div>;
}
