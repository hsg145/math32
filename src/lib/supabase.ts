import { createClient } from '@supabase/supabase-js';

/* ═══════════════════════════════════════════════════════════════════════════
   Only the *publishable* key ever reaches the browser. The secret/service
   key is used exclusively by the Node scripts in /scripts (create-teacher,
   seed) which must never be bundled.
   ═══════════════════════════════════════════════════════════════════════════ */

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const isConfigured = Boolean(url && anonKey);

export const supabase = createClient(url ?? 'http://localhost', anonKey ?? 'public-anon-key', {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
    storageKey: 'qlive.auth',
  },
  global: { headers: { 'x-client-info': 'quiz-live/1.0' } },
  realtime: { params: { eventsPerSecond: 12 } },
  db: { schema: 'public' },
});

/** Turns a PostgREST/RPC error into a clean Arabic message. */
export function errMsg(e: unknown): string {
  const raw =
    e && typeof e === 'object' && 'message' in e ? String((e as { message: unknown }).message) : String(e);
  const m = raw.match(/:([^:]+)$/);
  const body = (m ? m[1] : raw).trim();
  return body || 'حدث خطأ غير متوقع';
}

export async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn as never, args as never);
  if (error) throw new Error(errMsg(error));
  return data as T;
}