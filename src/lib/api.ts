import { rpc, supabase } from './supabase';
import { syncClock, timed } from './clock';
import { clientKey } from './router';
import type {
  LiveDetail,
  LiveQuestion,
  MyResult,
  Question,
  QuestionRow,
  RosterPayload,
  SessionInfo,
  StoredQuestion,
  SyncPayload,
} from './types';

/* ═══════════════════════════════════════════════════════════════════════════
   Every network call in one place. All student writes go through RPCs so the
   database — not the browser — owns the rules.
   ═══════════════════════════════════════════════════════════════════════════ */

/* ── Student ────────────────────────────────────────────────────────────── */

export async function joinSession(code: string, name: string, avatar: string, banner: string) {
  const { value, rtt } = await timed(() =>
    rpc<{ playerId: string; name: string; avatar: string; sessionId: string; title: string }>(
      'rpc_join',
      { p_code: code, p_client_key: clientKey(), p_name: name, p_avatar: avatar, p_banner: banner },
    ),
  );
  return { ...value, rtt };
}

/** Authoritative heartbeat: state + clock + roster + standings + reveal. */
export async function sync(sessionId: string): Promise<SyncPayload> {
  const { value, rtt } = await timed(() =>
    rpc<SyncPayload>('rpc_sync', { p_session: sessionId, p_client_key: clientKey() }),
  );
  if (value?.serverNow) syncClock(value.serverNow, rtt);
  return value;
}

/**
 * The teacher console reads the same snapshot, but deliberately *without* a
 * client_key. If a teacher ever previews the quiz from a device that already
 * joined as a student, sending the key would make the database treat the
 * console as that player (touching `last_seen` and handing back a seat).
 * With no key the call stays a pure read and `me` is always null.
 */
export async function teacherSync(sessionId: string): Promise<SyncPayload> {
  const { value, rtt } = await timed(() => rpc<SyncPayload>('rpc_sync', { p_session: sessionId }));
  if (value?.serverNow) syncClock(value.serverNow, rtt);
  return value;
}

/** Fire-and-forget: used when a realtime event nudges us to re-check. */
export async function syncQuiet(sessionId: string): Promise<SyncPayload | null> {
  try {
    return await sync(sessionId);
  } catch {
    return null;
  }
}

export async function submitAnswer(sessionId: string, slot: number, option: number) {
  return rpc<{ ok: boolean }>('rpc_answer', {
    p_session: sessionId,
    p_client_key: clientKey(),
    p_slot: slot,
    p_option: option,
  });
}

/** Closes the round. Safe to call from every client — the DB refuses early. */
export async function settle(sessionId: string) {
  return rpc<{ ok: boolean; alreadyRevealed?: boolean; slot: number }>('rpc_settle', {
    p_session: sessionId,
  });
}

export async function roster(sessionId: string): Promise<RosterPayload> {
  const { value, rtt } = await timed(() => rpc<RosterPayload>('rpc_roster', { p_session: sessionId }));
  if (value?.serverNow) syncClock(value.serverNow, rtt);
  return value;
}

export interface ResolvedCode {
  sessionId: string;
  expiresAt: string;
  title: string;
  isOpen: boolean;
  status: string;
}

/**
 * Step 1 only: does this join code exist, is it still valid, and is the door
 * open? This is a read-only check — it never creates a player row, so the
 * student is not asked for a name before the name field exists.
 */
export async function resolveCode(code: string): Promise<ResolvedCode | null> {
  const { data, error } = await supabase
    .from('session_codes')
    .select('session_id, expires_at, sessions!inner(id, title, is_open, status)')
    .eq('code', code.toUpperCase().trim())
    .eq('revoked', false)
    .gt('expires_at', new Date().toISOString())
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;

  const row = data as unknown as {
    session_id: string;
    expires_at: string;
    sessions:
      | { id: string; title: string; is_open: boolean; status: string }
      | { id: string; title: string; is_open: boolean; status: string }[];
  };
  const s = Array.isArray(row.sessions) ? row.sessions[0] : row.sessions;
  if (!s) return null;

  return {
    sessionId: row.session_id,
    expiresAt: row.expires_at,
    title: s.title,
    isOpen: s.is_open,
    status: s.status,
  };
}

/* ── Teacher ────────────────────────────────────────────────────────────── */

export type TeacherAction =
  | 'open'
  | 'close'
  | 'load_questions'
  | 'start'
  | 'next'
  | 'skip'
  | 'pause'
  | 'resume'
  | 'extend'
  | 'finish'
  | 'to_lobby'
  | 'reset'
  | 'kick_all'
  | 'prune';

export async function teacherAction(sessionId: string, action: TeacherAction) {
  const { value, rtt } = await timed(() =>
    rpc<SyncPayload>('rpc_teacher_action', { p_session: sessionId, p_action: action }),
  );
  if (value?.serverNow) syncClock(value.serverNow, rtt);
  return value;
}

export async function teacherConfig(sessionId: string, title?: string | null, seconds?: number | null) {
  const { value, rtt } = await timed(() =>
    rpc<SyncPayload>('rpc_teacher_config', {
      p_session: sessionId,
      p_title: title ?? null,
      p_seconds: seconds ?? null,
    }),
  );
  if (value?.serverNow) syncClock(value.serverNow, rtt);
  return value;
}

export async function activeCode(sessionId: string) {
  return rpc<{ code: string; expiresAt: string; usedCount: number }>('rpc_active_code', {
    p_session: sessionId,
  });
}

export async function rotateCode(sessionId: string, hours = 24) {
  return rpc<{ code: string; expiresAt: string }>('rpc_rotate_code', {
    p_session: sessionId,
    p_hours: hours,
  });
}

export async function createSession(title: string, seconds: number) {
  return rpc<string>('rpc_create_session', { p_title: title, p_seconds: seconds });
}

export async function report(sessionId: string) {
  return rpc<Record<string, unknown>>('rpc_report', { p_session: sessionId });
}

/** Per-option histogram + who answered the live question (teacher only). */
export async function liveDetail(sessionId: string): Promise<LiveDetail> {
  return rpc<LiveDetail>('rpc_live_detail', { p_session: sessionId });
}

/* ── Question bank (teacher CRUD) ───────────────────────────────────────── */

export async function listQuestions(): Promise<StoredQuestion[]> {
  const { data, error } = await supabase
    .from('questions')
    .select('*')
    .order('position')
    .order('created_at');
  if (error) throw new Error(error.message);
  return ((data ?? []) as QuestionRow[]).map((r) => ({
    id: r.id,
    lesson: r.lesson,
    position: r.position,
    body: r.body,
    figure: r.figure ?? undefined,
    options: r.options,
    correctIndex: r.correct_index,
    explanation: r.explanation,
    numberLine: r.number_line ?? undefined,
    isActive: r.is_active,
  }));
}

export async function saveQuestion(q: Partial<StoredQuestion> & { body: string; options: unknown }) {
  const payload: Record<string, unknown> = {
    body: q.body,
    options: q.options,
    lesson: q.lesson ?? 0,
    figure: q.figure ?? null,
    explanation: q.explanation ?? '',
    number_line: q.numberLine ?? null,
    correct_index: q.correctIndex ?? 0,
    position: q.position ?? 0,
    is_active: q.isActive ?? true,
  };
  if (q.id) payload.id = q.id;

  const { data, error } = await supabase.from('questions').upsert(payload).select().single();
  if (error) throw new Error(error.message);
  const r = data as QuestionRow;
  return {
    id: r.id,
    lesson: r.lesson,
    position: r.position,
    body: r.body,
    figure: r.figure ?? undefined,
    options: r.options,
    correctIndex: r.correct_index,
    explanation: r.explanation,
    numberLine: r.number_line ?? undefined,
    isActive: r.is_active,
  } satisfies StoredQuestion;
}

export async function deleteQuestion(id: string) {
  const { error } = await supabase.from('questions').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

export async function reorderQuestions(ids: string[]) {
  const { error } = await supabase.rpc('rpc_reorder_questions', { p_ids: ids });
  if (error) throw new Error(error.message);
}

export type { LiveQuestion, MyResult, Question, SessionInfo, StoredQuestion, SyncPayload };