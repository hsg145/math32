import { useCallback, useEffect, useSyncExternalStore } from 'react';

/* ═══════════════════════════════════════════════════════════════════════════
   Minimal hash router — no dependency, works on any static host (and even
   file://). Routes look like  #/join  ·  #/j/ABC-DEF  ·  #/play  ·  #/admin
   ═══════════════════════════════════════════════════════════════════════════ */

const listeners = new Set<() => void>();
let wired = false;

function emit() {
  for (const l of listeners) l();
}

function subscribe(l: () => void) {
  listeners.add(l);
  if (!wired) {
    wired = true;
    window.addEventListener('hashchange', emit);
  }
  return () => void listeners.delete(l);
}

function current(): string {
  const h = window.location.hash.replace(/^#/, '');
  return h || '/';
}

export function navigate(path: string, replace = false) {
  const target = `#${path.startsWith('/') ? path : `/${path}`}`;
  if (window.location.hash === target) return;
  if (replace) {
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}${target}`);
    emit();
  } else {
    window.location.hash = target;
  }
}

export function useRoute(): string {
  return useSyncExternalStore(
    subscribe,
    current,
    () => '/',
  );
}

export function parseRoute(path: string) {
  const parts = path.split('/').filter(Boolean);
  return { head: parts[0] ?? '', arg: parts[1] ?? '' };
}

/* ── Theme ──────────────────────────────────────────────────────────────── */

const THEME_KEY = 'qlive.theme';

export function useTheme(): [string, () => void] {
  const theme = useSyncExternalStore(
    subscribe,
    () => document.documentElement.dataset.theme ?? 'light',
    () => 'light',
  );
  const toggle = useCallback(() => {
    const next = (document.documentElement.dataset.theme ?? 'light') === 'light' ? 'dark' : 'light';
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      /* private mode */
    }
  }, []);
  return [theme, toggle];
}

export function initTheme() {
  let saved = 'light';
  try {
    saved = localStorage.getItem(THEME_KEY) ?? 'light';
  } catch {
    /* private mode */
  }
  document.documentElement.dataset.theme = saved;
}

/* ── Local storage helpers (namespaced, failure tolerant) ───────────────── */
const NS = 'qlive.';

export function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(NS + key);
    return raw == null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

export function save(key: string, value: unknown) {
  try {
    localStorage.setItem(NS + key, JSON.stringify(value));
  } catch {
    /* private mode */
  }
}

/** Stable per-device identity so a refresh returns you to the same seat. */
export function clientKey(): string {
  let k = load<string | null>('clientKey', null);
  if (!k || k.length < 8) {
    const buf = new Uint8Array(16);
    crypto.getRandomValues(buf);
    k = Array.from(buf, (b) => b.toString(16).padStart(2, '0')).join('');
    save('clientKey', k);
  }
  return k;
}

/* ── Route change listener helper ───────────────────────────────────────── */
export function useRouteEffect(fn: () => void) {
  useEffect(() => {
    const h = () => fn();
    window.addEventListener('hashchange', h);
    return () => window.removeEventListener('hashchange', h);
  }, [fn]);
}