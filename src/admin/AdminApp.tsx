import { useCallback, useEffect, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase, errMsg } from '../lib/supabase';
import { BrandMark, Icon } from '../lib/icons';
import { ar } from '../lib/format';
import { Loading } from '../lib/ui';
import { load, save } from '../lib/router';
import type { SyncPayload } from '../lib/types';
import { activeCode, createSession, settle, sync, teacherAction, teacherConfig } from '../lib/api';
import { useLive } from '../lib/live';
import { msUntil } from '../lib/clock';
import { ControlPanel, LiveMonitor, SessionHeader, type TeacherAction } from './ControlPanel';
import { QuestionManager } from './QuestionManager';
import { ReportPanel } from './ReportPanel';

/* ═══════════════════════════════════════════════════════════════════════════
   Teacher console. Loaded as a separate chunk so students never download it.
   ═══════════════════════════════════════════════════════════════════════════ */

const SESSION_KEY = 'qlive.session';
const BEAT = 12_000;

type Tab = 'live' | 'questions' | 'report';

export function AdminApp() {
  const [session, setSession] = useState<Session | null>(null);
  const [checked, setChecked] = useState(false);
  const [tab, setTab] = useState<Tab>('live');
  const [sessionId, setSessionId] = useState<string | null>(() => load<string | null>(SESSION_KEY, null));
  const [data, setData] = useState<SyncPayload | null>(null);
  const [code, setCode] = useState<{ code: string; expiresAt: string; usedCount: number } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  /* ── auth ──────────────────────────────────────────────────────────────
     `checked` flips exactly once, after the very first getSession() settles.
     onAuthStateChange then keeps `session` in sync, so a successful
     sign-in swaps the login form for the dashboard immediately — no spinner
     to get stuck on and no refresh required. */
  useEffect(() => {
    let alive = true;
    const done = (s: Session | null) => {
      if (!alive) return;
      setSession(s);
      setChecked(true);
    };

    void supabase.auth.getSession().then(({ data, error }) => {
      if (error) console.warn('[auth] getSession:', error.message);
      done(data.session ?? null);
    }).catch((e) => {
      console.warn('[auth] getSession failed:', e);
      done(null);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'TOKEN_REFRESHED') {
        setSession(s ?? null);
      }
      setChecked(true);
    });

    return () => {
      alive = false;
      subscription.unsubscribe();
    };
  }, []);

  const pull = useCallback(
    async (quiet = true) => {
      if (!sessionId) return;
      try {
        const d = await sync(sessionId);
        setData(d);
        setError(null);
      } catch (e) {
        if (!quiet) setError(errMsg(e));
      }
    },
    [sessionId],
  );

  const pullCode = useCallback(async () => {
    if (!sessionId) return;
    try {
      setCode(await activeCode(sessionId));
    } catch (e) {
      setError(errMsg(e));
    }
  }, [sessionId]);

  /* ── session lifecycle ────────────────────────────────────────────────── */
  useEffect(() => {
    if (!session || !sessionId) {
      setData(null);
      return;
    }
    void pull(false);
    void pullCode();
    const beat = window.setInterval(() => void pull(), BEAT);
    return () => window.clearInterval(beat);
  }, [session, sessionId, pull, pullCode]);

  useLive(sessionId, () => void pull());

  /* The teacher's tab also closes an expired round, so the reveal can never
     be stuck even if every student has already left. */
  useEffect(() => {
    if (!sessionId || data?.session.status !== 'question') return;
    const id = window.setInterval(() => {
      if (msUntil(data.session.questionEndsAt, 0) <= 0) {
        void settle(sessionId)
          .catch(() => undefined)
          .finally(() => void pull());
      }
    }, 500);
    return () => window.clearInterval(id);
  }, [data, pull, sessionId]);

  /* ── actions ──────────────────────────────────────────────────────────── */
  const flash = useCallback((t: string) => {
    setToast(t);
    window.setTimeout(() => setToast(null), 2600);
  }, []);

  const run = useCallback(
    async (fn: () => Promise<unknown>, message: string) => {
      if (busy) return;
      setBusy(true);
      setError(null);
      try {
        await fn();
        await pull();
        if (message) flash(message);
      } catch (e) {
        setError(errMsg(e));
      } finally {
        setBusy(false);
      }
    },
    [busy, pull, flash],
  );

  const doAction = useCallback(
    (action: TeacherAction, message = '') =>
      run(async () => {
        await teacherAction(sessionId!, action);
      }, message),
    [run, sessionId],
  );

  const ensureSession = useCallback(
    async (title: string, seconds: number) => {
      const id = await createSession(title, seconds);
      save(SESSION_KEY, id);
      setSessionId(id);
      await pullCode();
      return id;
    },
    [pullCode],
  );

  const reloadQuestions = useCallback(() => {
    /* QuestionManager writes directly; the live panel just needs a refresh */
    void pull();
  }, [pull]);

  /* ── render ───────────────────────────────────────────────────────────── */
  if (!checked) return <Loading label="جارٍ التحقق من الهوية…" />;

  if (!session) return <LoginScreen onSession={setSession} />;

  return (
    <div>
      <AdminHead tab={tab} setTab={setTab} email={session.user.email ?? ''} onSignOut={() => void supabase.auth.signOut()} />

      <div className="admin-grid">
        <main>
          {error && (
            <div className="err" style={{ marginBottom: 14 }}>
              <Icon name="alert" size={18} />
              {ar(error)}
            </div>
          )}

          {tab === 'live' && <LiveMonitor data={data} onEnsureSession={ensureSession} />}

          {tab === 'questions' && (
            <QuestionManager sessionId={sessionId} onChanged={reloadQuestions} />
          )}

          {tab === 'report' && <ReportPanel sessionId={sessionId} />}
        </main>

        <aside className="stick">
          <SessionHeader
            data={data}
            code={code}
            onOpen={() => doAction(sessionId ? 'open' : 'open', 'فُتح الباب للطلاب')}
            onClose={() => doAction('close', 'أُغلق الباب')}
            onRefreshCode={pullCode}
            onConfig={(t, s) => run(() => teacherConfig(sessionId!, t, s), 'حُفظت الإعدادات')}
            onAction={doAction}
            busy={busy}
          />
          <ControlPanel data={data} onAction={doAction} busy={busy} />
        </aside>
      </div>

      {toast && (
        <div className="toast" role="status">
          <Icon name="checkCircle" size={18} />
          {ar(toast)}
        </div>
      )}
    </div>
  );
}

/* ── header + tabs ──────────────────────────────────────────────────────── */
function AdminHead({
  tab,
  setTab,
  email,
  onSignOut,
}: {
  tab: Tab;
  setTab: (t: Tab) => void;
  email: string;
  onSignOut: () => void;
}) {
  return (
    <header className="head">
      <div className="head-in">
        <div className="brand">
          <BrandMark size={38} />
          <span>
            منصة الاختبار اللحظي
            <small>لوحة المعلّم</small>
          </span>
        </div>

        <nav className="tabs" role="tablist">
          <button
            className="tab"
            role="tab"
            aria-selected={tab === 'live'}
            onClick={() => setTab('live')}
          >
            <Icon name="signal" size={16} />
            الجولة الحيّة
          </button>
          <button
            className="tab"
            role="tab"
            aria-selected={tab === 'questions'}
            onClick={() => setTab('questions')}
          >
            <Icon name="list" size={16} />
            بنك الأسئلة
          </button>
          <button
            className="tab"
            role="tab"
            aria-selected={tab === 'report'}
            onClick={() => setTab('report')}
          >
            <Icon name="chart" size={16} />
            التقرير النهائي
          </button>
        </nav>

        <div className="row" style={{ marginInlineStart: 'auto', gap: 8 }}>
          <span className="badge n tiny" title={email}>
            <Icon name="user" size={13} style={{ verticalAlign: '-2px', marginInlineEnd: 4 }} />
            {ar(email.split('@')[0])}
          </span>
          <button className="btn xs alt" onClick={onSignOut}>
            <Icon name="logout" size={15} />
            خروج
          </button>
        </div>
      </div>
    </header>
  );
}

/* ── login ──────────────────────────────────────────────────────────────── */
function LoginScreen({ onSession }: { onSession: (s: Session) => void }) {
  const [email, setEmail] = useState(() => load('teacherEmail', ''));
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [show, setShow] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);

  const signIn = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (busy) return;
      const id = email.trim();
      if (!id || !password) {
        setErr('أدخل البريد وكلمة المرور');
        return;
      }
      setBusy(true);
      setErr('');
      save('teacherEmail', id);

      try {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: id,
          password,
        });
        if (error) {
          setErr(
            /invalid/i.test(error.message)
              ? 'البريد الإلكتروني أو كلمة المرور غير صحيحة'
              : /rate|too many/i.test(error.message)
                ? 'محاولات كثيرة — انتظر قليلاً ثم أعد المحاولة'
                : errMsg(error),
          );
          setBusy(false);
          return;
        }

        /* Belt and braces: onAuthStateChange normally swaps the form out for
           the dashboard, but if that event is ever dropped we adopt the session
           signInWithPassword returned — so a spinner can never get stuck. */
        if (data.session) onSession(data.session);
      } catch (e) {
        setErr(errMsg(e));
        setBusy(false);
      }
    },
    [busy, email, onSession, password],
  );

  useEffect(() => {
    emailRef.current?.focus();
  }, []);

  return (
    <main className="shell" style={{ maxWidth: 460, paddingTop: 60 }}>
      <section className="card">
        <div className="center" style={{ marginBottom: 10 }}>
          <BrandMark size={54} />
          <h1 style={{ fontSize: 'clamp(22px,5vw,30px)', margin: '8px 0 2px' }}>لوحة المعلّم</h1>
          <p className="mut tiny" style={{ margin: 0 }}>
            سجّل الدخول للتحكم بالاختبار وإدارة الأسئلة
          </p>
        </div>

        <form onSubmit={signIn} className="grid2" style={{ marginTop: 14 }}>
          <div className="field">
            <label htmlFor="em">البريد الإلكتروني</label>
            <input
              id="em"
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="teacher@example.com"
              dir="ltr"
              style={{ textAlign: 'left' }}
            />
          </div>
          <div className="field">
            <label htmlFor="pw">كلمة المرور</label>
            <input
              id="pw"
              type={show ? 'text' : 'password'}
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              dir="ltr"
              style={{ textAlign: 'left' }}
            />
            <button
              type="button"
              className="btn xs alt"
              style={{ marginTop: 8 }}
              onClick={() => setShow((v) => !v)}
            >
              <Icon name="eye" size={15} />
              {show ? 'إخفاء' : 'إظهار'}
            </button>
          </div>
          {err && (
            <div className="err" style={{ gridColumn: '1/-1' }}>
              <Icon name="alert" size={18} />
              {ar(err)}
            </div>
          )}
          <button className="btn block" style={{ gridColumn: '1/-1' }} disabled={busy}>
            {busy ? <Icon name="refresh" size={18} className="spin" /> : <Icon name="lock" size={18} />}
            {busy ? 'جارٍ الدخول…' : 'دخول'}
          </button>
        </form>
      </section>
    </main>
  );
}