import { useEffect, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from './supabase';

/* ═══════════════════════════════════════════════════════════════════════════
   One websocket per client, three filtered streams. Students never poll for
   state changes — they react to these events and then re-read the authoritative
   snapshot through rpc_sync.
   ═══════════════════════════════════════════════════════════════════════════ */

export type LiveEvent = 'sessions' | 'players' | 'answers';

export function useLive(sessionId: string | null, onEvent: (e: LiveEvent) => void) {
  const cb = useRefLike(onEvent);

  useEffect(() => {
    if (!sessionId) return;
    let channel: RealtimeChannel | null = null;

    channel = supabase.channel(`sess:${sessionId}`);

    // sessions is keyed by id, the other two by session_id
    channel.on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'sessions', filter: `id=eq.${sessionId}` },
      () => cb.current('sessions'),
    );
    channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'players', filter: `session_id=eq.${sessionId}` },
      () => cb.current('players'),
    );
    channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'answers', filter: `session_id=eq.${sessionId}` },
      () => cb.current('answers'),
    );

    channel.subscribe();
    return () => {
      if (channel) void supabase.removeChannel(channel);
    };
  }, [sessionId, cb]);
}

/** Keeps the latest callback without re-triggering the subscription. */
function useRefLike<T>(value: T) {
  const [box] = useState<{ current: T }>(() => ({ current: value }));
  box.current = value;
  return box;
}

/** true when the tab has network access — drives the "offline" chip. */
export function useOnline(): boolean {
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
}