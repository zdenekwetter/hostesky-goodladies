'use client';

import { useCallback, useState } from 'react';

export type Toast = { text: string; err?: boolean } | null;

/** Volání API administrace s jednotným hlášením chyb. */
export function useApi() {
  const [toast, setToast] = useState<Toast>(null);
  const show = useCallback((text: string, err = false) => {
    setToast({ text, err });
    setTimeout(() => setToast(null), err ? 7000 : 3000);
  }, []);

  const call = useCallback(async <T = unknown>(url: string, opts: RequestInit & { json?: unknown } = {}): Promise<T | null> => {
    const init: RequestInit = { ...opts };
    if (opts.json !== undefined) {
      init.body = JSON.stringify(opts.json);
      init.headers = { 'Content-Type': 'application/json', ...(opts.headers ?? {}) };
      init.method = opts.method ?? 'POST';
    }
    const res = await fetch(url, init);
    if (res.status === 401) { window.location.href = '/admin/login'; return null; }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { show(data.error || 'Něco se pokazilo', true); return null; }
    return data as T;
  }, [show]);

  return { call, toast, show };
}

export function ToastView({ toast }: { toast: Toast }) {
  if (!toast) return null;
  return <div className={`toast${toast.err ? ' err' : ''}`} role="status">{toast.text}</div>;
}
