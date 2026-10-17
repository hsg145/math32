import { useCallback, useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../lib/icons';
import { ar, arNum, mmss } from '../lib/format';
import { Avatar, Empty, Progress, Stat, StatusChip, Timer, confetti } from '../lib/ui';
import { msUntil } from '../lib/clock';
import { liveDetail, rotateCode } from '../lib/api';
import type { LiveDetail, SyncPayload } from '../lib/types';

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

const LETTERS = ['أ', 'ب', 'ج', 'د', 'هـ', 'و'];

/* ═══════════════════════════════════════════════════════════════════════════
   Sidebar — session identity, the rotating join code, and master controls.
   ═══════════════════════════════════════════════════════════════════════════ */

export function SessionHeader({
  data,
  code,
  onOpen,
  onClose,
  onRefreshCode,
  onConfig,
  onAction,
  busy,
}: {
  data: SyncPayload | null;
  code: { code: string; expiresAt: string; usedCount: number } | null;
  onOpen: () => void;
  onClose: () => void;
  onRefreshCode: () => void;
  onConfig: (title: string | null, seconds: number | null) => void;
  onAction: (a: TeacherAction, m?: string) => void;
  busy: boolean;
}) {
  const [title, setTitle] = useState('');
  const [duration, setDuration] = useState(20);
  const [copied, setCopied] = useState<'link' | 'code' | null>(null);
  const [rotating, setRotating] = useState(false);
  const [, tick] = useTick();

  useEffect(() => {
    if (!data) return;
    setTitle(data.session.title);
    setDuration(data.session.questionSeconds);
  }, [data]);

  useEffect(() => {
    if (data?.session.status !== 'question') return;
    const id = window.setInterval(tick, 250);
    return () => window.clearInterval(id);
  }, [data, tick]);

  const joinUrl = useMemo(
    () => (code ? `${window.location.origin}${window.location.pathname}#/j/${code.code}` : ''),
    [code],
  );

  const copy = useCallback(
    async (text: string, kind: 'link' | 'code') => {
      try {
        await navigator.clipboard.writeText(text);
      } catch {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        ta.remove();
      }
      setCopied(kind);
      window.setTimeout(() => setCopied(null), 1600);
    },
    [],
  );

  const doRotate = useCallback(async () => {
    if (rotating || !data) return;
    setRotating(true);
    try {
      await rotateCode(data.session.id, 24);
      onRefreshCode();
    } finally {
      setRotating(false);
    }
  }, [data, onRefreshCode, rotating]);

  if (!data) {
    return (
      <section className="card">
        <h3 style={{ marginTop: 0 }}>
          <Icon name="key" size={18} style={{ verticalAlign: '-3px', marginInlineEnd: 6 }} />
          جلسة الاختبار
        </h3>
        <Empty icon="info" text="أنشئ جلسة في العمود الأيمن لتظهر هنا الأدوات" />
      </section>
    );
  }

  const s = data.session;
  const ttl = code ? msUntil(code.expiresAt, 0) : 0;
  const ttlH = Math.floor(ttl / 3_600_000);
  const ttlM = Math.floor((ttl % 3_600_000) / 60_000);

  return (
    <section className="card">
      <div className="spread" style={{ marginBottom: 10 }}>
        <h3 style={{ margin: 0 }}>
          <Icon name="key" size={18} style={{ verticalAlign: '-3px', marginInlineEnd: 6 }} />
          كود الدخول
        </h3>
        <StatusChip status={s.status} />
      </div>

      <div className="codebox">
        <div className="cd">{code?.code ?? '—'}</div>
        <div className="tiny" style={{ fontWeight: 700 }}>
          {s.isOpen ? (
            <>
              <Icon name="unlock" size={13} style={{ verticalAlign: '-2px' }} /> الباب مفتوح
            </>
          ) : (
            <>
              <Icon name="lock" size={13} style={{ verticalAlign: '-2px' }} /> الباب مغلق
            </>
          )}
          {ttl > 0 && ` · ينتهي بعد ${ar(ttlH)} س ${ar(ttlM)} د`}
        </div>
      </div>

      <div className="row" style={{ marginTop: 10, gap: 8 }}>
        <button className="btn xs alt" style={{ flex: 1 }} onClick={() => void copy(code?.code ?? '', 'code')} disabled={!code}>
          <Icon name={copied === 'code' ? 'check' : 'copy'} size={15} />
          {copied === 'code' ? 'تم النسخ' : 'نسخ الكود'}
        </button>
        <button className="btn xs alt" style={{ flex: 1 }} onClick={() => void copy(joinUrl, 'link')} disabled={!code}>
          <Icon name={copied === 'link' ? 'check' : 'link'} size={15} />
          {copied === 'link' ? 'تم النسخ' : 'نسخ الرابط'}
        </button>
        <button className="btn xs alt" onClick={() => void doRotate()} disabled={rotating || busy}>
          <Icon name="refresh" size={15} className={rotating ? 'spin' : ''} />
          <span className="tiny">جديد</span>
        </button>
      </div>

      <div className="linkbox" title={joinUrl}>
        {joinUrl || '—'}
      </div>
      <p className="tiny mut" style={{ margin: '6px 0 0' }}>
        {`يُجدَّد الكود كل ٢٤ ساعة. عدد من استعملوه: ${ar(code?.usedCount ?? 0)}`}
      </p>

      <div className="grid2" style={{ marginTop: 14 }}>
        <div className="field">
          <label htmlFor="ttl">عنوان الاختبار</label>
          <input
            id="ttl"
            type="text"
            maxLength={80}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => title !== s.title && onConfig(title, null)}
          />
        </div>
        <div className="field">
          <label htmlFor="dur">مدة السؤال (ثانية)</label>
          <input
            id="dur"
            type="number"
            min={5}
            max={300}
            value={duration}
            onChange={(e) => setDuration(Number(e.target.value))}
            onBlur={() => duration !== s.questionSeconds && onConfig(null, duration)}
            style={{ direction: 'ltr' }}
          />
        </div>
      </div>

      <div className="row" style={{ marginTop: 12, gap: 8 }}>
        {s.isOpen ? (
          <button className="btn xs warn" style={{ flex: 1 }} onClick={onClose} disabled={busy}>
            <Icon name="lock" size={15} />
            إغلاق الباب
          </button>
        ) : (
          <button className="btn xs ok" style={{ flex: 1 }} onClick={onOpen} disabled={busy}>
            <Icon name="unlock" size={15} />
            فتح الباب
          </button>
        )}
        <button className="btn xs alt" style={{ flex: 1 }} onClick={() => onAction('prune', 'حُذف المنقطعون')} disabled={busy}>
          <Icon name="trash" size={15} />
          تنظيف
        </button>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   Master controls
   ═══════════════════════════════════════════════════════════════════════════ */

export function ControlPanel({
  data,
  onAction,
  busy,
}: {
  data: SyncPayload | null;
  onAction: (a: TeacherAction, m?: string) => void;
  busy: boolean;
}) {
  const [, tick] = useTick();
  const s = data?.session;

  useEffect(() => {
    if (s?.status !== 'question') return;
    const id = window.setInterval(tick, 250);
    return () => window.clearInterval(id);
  }, [s, tick]);

  if (!data || !s) return null;

  const remaining =
    s.questionIndex >= 0 ? Math.max(0, s.totalQuestions - s.questionIndex - 1) : s.totalQuestions;

  return (
    <section className="card" style={{ marginTop: 16 }}>
      <h3 style={{ marginTop: 0 }}>
        <Icon name="settings" size={18} style={{ verticalAlign: '-3px', marginInlineEnd: 6 }} />
        التحكم بالعبة
      </h3>

      <div className="stats">
        <Stat icon="users" value={s.playerCount} label="طالب" />
        <Stat icon="check" value={s.answeredCount} label="أجابوا" />
        <Stat icon="list" value={`${Math.max(0, s.questionIndex + 1)}/${s.totalQuestions}`} label="السؤال" />
        <Stat icon="clock" value={s.questionSeconds} label="ثانية" />
      </div>

      {s.status === 'question' && (
        <div className="spread" style={{ margin: '10px 0 14px' }}>
          <div>
            <div style={{ fontWeight: 800, color: 'var(--ink)' }}>جولة جارية</div>
            <div className="tiny mut">{`أجاب ${ar(s.answeredCount)} من ${ar(s.playerCount)}`}</div>
          </div>
          <Timer
            secondsLeft={Math.max(0, Math.ceil(msUntil(s.questionEndsAt, s.questionSeconds) / 1000))}
            total={s.questionSeconds}
          />
        </div>
      )}

      <Progress value={s.answeredCount} total={Math.max(1, s.playerCount)} />

      <div className="grid2" style={{ marginTop: 12 }}>
        {s.status === 'lobby' && (
          <>
            <button
              className="btn ok"
              onClick={() => {
                confetti(30);
                onAction('start', 'بدأت اللعبة!');
              }}
              disabled={busy || s.totalQuestions === 0}
            >
              <Icon name="play" size={18} />
              ابدأ اللعبة
            </button>
            <button className="btn alt" onClick={() => onAction('load_questions')} disabled={busy}>
              <Icon name="refresh" size={18} />
              تحديث الأسئلة
            </button>
          </>
        )}

        {s.status === 'question' && (
          <>
            <button className="btn warn" onClick={() => onAction('skip', 'كُشف الحل')} disabled={busy}>
              <Icon name="eye" size={18} />
              كشف الحل الآن
            </button>
            <button className="btn alt" onClick={() => onAction('extend')} disabled={busy}>
              <Icon name="clock" size={18} />
              {`+${ar(s.questionSeconds)} ثانية`}
            </button>
            <button className="btn alt" onClick={() => onAction('pause', 'أُوقفت مؤقتاً')} disabled={busy}>
              <Icon name="pause" size={18} />
              إيقاف مؤقت
            </button>
            <button className="btn" onClick={() => onAction('next')} disabled={busy}>
              <Icon name="skip" size={18} />
              السؤال التالي
            </button>
          </>
        )}

        {s.status === 'reveal' && (
          <>
            <button className="btn ok" onClick={() => onAction('next')} disabled={busy}>
              <Icon name="next" size={18} />
              {remaining > 0 ? `السؤال التالي (${ar(remaining)})` : 'إنهاء اللعبة'}
            </button>
            <button className="btn alt" onClick={() => onAction('to_lobby', 'عدنا للانتظار')} disabled={busy}>
              <Icon name="hourglass" size={18} />
              انتظار
            </button>
          </>
        )}

        {s.status === 'between' && (
          <>
            <button className="btn ok" onClick={() => onAction('resume')} disabled={busy}>
              <Icon name="play" size={18} />
              استئناف
            </button>
            <button className="btn alt" onClick={() => onAction('next')} disabled={busy}>
              <Icon name="skip" size={18} />
              تخطّي
            </button>
          </>
        )}

        {s.status === 'finished' && (
          <>
            <button className="btn ok" onClick={() => onAction('start', 'جولة جديدة')} disabled={busy}>
              <Icon name="refresh" size={18} />
              جولة جديدة
            </button>
            <button className="btn alt" onClick={() => onAction('reset', 'صُفّرت النتائج')} disabled={busy}>
              <Icon name="trash" size={18} />
              تصفير النتائج
            </button>
          </>
        )}

        {(s.status === 'question' || s.status === 'reveal' || s.status === 'between') && (
          <button className="btn no" onClick={() => onAction('finish', 'انتهت اللعبة')} disabled={busy}>
            <Icon name="stop" size={18} />
            إنهاء اللعبة
          </button>
        )}
      </div>

      <details style={{ marginTop: 14 }}>
        <summary className="tiny mut" style={{ cursor: 'pointer', fontWeight: 700 }}>
          إجراءات متقدّمة
        </summary>
        <div className="row" style={{ marginTop: 10, gap: 8 }}>
          <button className="btn xs alt" onClick={() => onAction('reset')} disabled={busy}>
            تصفير كامل
          </button>
          <button className="btn xs alt" onClick={() => onAction('kick_all')} disabled={busy}>
            إخراج كل الطلاب
          </button>
          <button className="btn xs alt" onClick={() => onAction('to_lobby')} disabled={busy}>
            العودة للانتظار
          </button>
        </div>
      </details>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   Main column — session bootstrap + live student monitor.
   ═══════════════════════════════════════════════════════════════════════════ */

export function LiveMonitor({
  data,
  onEnsureSession,
}: {
  data: SyncPayload | null;
  onEnsureSession: (title: string, seconds: number) => Promise<string>;
}) {
  const [title, setTitle] = useState('اختبار الاقترانات — الوحدة الثانية');
  const [duration, setDuration] = useState(20);
  const [creating, setCreating] = useState(false);

  const create = useCallback(async () => {
    if (creating) return;
    setCreating(true);
    try {
      await onEnsureSession(title, duration);
    } finally {
      setCreating(false);
    }
  }, [creating, duration, onEnsureSession, title]);

  if (!data) {
    return (
      <section className="card">
        <h1 style={{ fontSize: 'clamp(22px,4.5vw,32px)' }}>ابدأ جلسة اختبار جديدة</h1>
        <p className="mut">
          ستُنشأ كود دخول صالح ٢٤ ساعة فوراً. أضف الأسئلة من تبويب «بنك الأسئلة» ثم عد إلى هنا.
        </p>
        <div className="grid2" style={{ marginTop: 14 }}>
          <div className="field">
            <label htmlFor="nt">عنوان الجلسة</label>
            <input id="nt" type="text" maxLength={80} value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="nd">مدة السؤال (ثانية)</label>
            <input
              id="nd"
              type="number"
              min={5}
              max={300}
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
              style={{ direction: 'ltr' }}
            />
          </div>
        </div>
        <button className="btn ok" style={{ marginTop: 16 }} onClick={create} disabled={creating}>
          {creating ? <Icon name="refresh" size={18} className="spin" /> : <Icon name="plus" size={18} />}
          {creating ? 'جارٍ الإنشاء…' : 'إنشاء الجلسة'}
        </button>
      </section>
    );
  }

  return (
    <>
      <LiveHeader data={data} />
      <StudentsGrid data={data} />
      <Distribution data={data} />
      <TeacherBoard data={data} />
      <p className="center mut tiny" style={{ marginTop: 12 }}>
        <Icon name="info" size={13} style={{ verticalAlign: '-2px' }} /> كل الأزرار أعلاه تنفّذ فوراً على كل الأجهزة
        المتصلة
      </p>
    </>
  );
}

function LiveHeader({ data }: { data: SyncPayload }) {
  const s = data.session;
  return (
    <section className="card" style={{ marginBottom: 16 }}>
      <div className="spread" style={{ flexWrap: 'wrap', gap: 10 }}>
        <div style={{ minWidth: 0 }}>
          <h1 style={{ fontSize: 'clamp(20px,4vw,30px)', margin: 0 }}>{ar(s.title)}</h1>
          <p className="mut tiny" style={{ margin: 0 }}>
            {s.status === 'lobby'
              ? 'الباب مفتوح — بانتظار الطلاب ثم اضغط «ابدأ اللعبة»'
              : s.status === 'finished'
                ? 'انتهت اللعبة — راجع تبويب التقرير'
                : `السؤال ${ar(Math.max(1, s.questionIndex + 1))} من ${ar(s.totalQuestions)}`}
          </p>
        </div>
        <div className="row" style={{ gap: 10 }}>
          <StatusChip status={s.status} />
          {s.status === 'question' && (
            <span className="badge n">
              <Icon name="users" size={13} style={{ verticalAlign: '-2px', marginInlineEnd: 3 }} />
              {`${ar(s.answeredCount)}/${ar(s.playerCount)}`}
            </span>
          )}
        </div>
      </div>
      <Progress value={Math.max(0, s.questionIndex + 1)} total={Math.max(1, s.totalQuestions)} />
    </section>
  );
}

/* ── students grid ──────────────────────────────────────────────────────── */
function StudentsGrid({ data }: { data: SyncPayload }) {
  const [detail, setDetail] = useState<LiveDetail | null>(null);
  const [filter, setFilter] = useState<'all' | 'done' | 'waiting'>('all');
  const s = data.session;

  useEffect(() => {
    let stop = false;
    const load = async () => {
      try {
        const d = await liveDetail(s.id);
        if (!stop) setDetail(d);
      } catch {
        /* the monitor degrades to standings-only */
      }
    };
    void load();
    const id = window.setInterval(load, s.status === 'question' ? 3000 : 8000);
    return () => {
      stop = true;
      window.clearInterval(id);
    };
  }, [s.id, s.status, s.questionIndex]);

  const answered = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of detail?.answers ?? []) if (a.chosen != null) m.set(a.playerId, a.chosen);
    return m;
  }, [detail]);

  const speed = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of detail?.answers ?? []) if (a.msTaken != null) m.set(a.playerId, a.msTaken);
    return m;
  }, [detail]);

  const rows = useMemo(() => [...data.leaderboard].sort((a, b) => a.rank - b.rank), [data.leaderboard]);

  const shown = useMemo(() => {
    if (filter === 'done') return rows.filter((r) => answered.has(r.player_id));
    if (filter === 'waiting') return rows.filter((r) => !answered.has(r.player_id));
    return rows;
  }, [answered, filter, rows]);

  if (!rows.length) {
    return (
      <section className="card">
        <Empty icon="users" text="لم ينضم أي طالب بعد — شارك الكود أو الرابط" />
      </section>
    );
  }

  const live = s.status === 'question';

  return (
    <section className="card">
      <div className="spread" style={{ flexWrap: 'wrap', gap: 8 }}>
        <h3 style={{ margin: 0 }}>
          <Icon name="users" size={18} style={{ verticalAlign: '-3px', marginInlineEnd: 6 }} />
          {`الطلاب (${ar(rows.length)})`}
        </h3>
        <div className="row" style={{ gap: 6 }}>
          {(['all', 'done', 'waiting'] as const).map((f) => (
            <button
              key={f}
              className="btn xs alt"
              style={filter === f ? { background: 'var(--ink)', color: 'var(--card)' } : undefined}
              onClick={() => setFilter(f)}
            >
              {f === 'all' ? `الكل ${ar(rows.length)}` : f === 'done' ? `أجابوا ${ar(answered.size)}` : `لم يجيبوا ${ar(rows.length - answered.size)}`}
            </button>
          ))}
        </div>
      </div>

      <div className="seatgrid dense">
        {shown.map((r, i) => {
          const done = answered.has(r.player_id);
          const pick = answered.get(r.player_id);
          return (
            <div
              key={r.player_id}
              className={`seat ${done ? 'done' : live ? 'thinking' : ''}`}
              style={{ '--i': Math.min(i, 24) } as CSSProperties}
              title={`${ar(r.name)} — ${arNum(r.total_points)} نقطة${pick != null ? ` — أجاب ${ar(LETTERS[pick])}` : ''}`}
            >
              <Avatar emoji={r.avatar} banner={r.banner} />
              <span>{ar(r.name)}</span>
              <span className="flag">
                {pick != null ? ar(LETTERS[pick]) : arNum(r.total_points)}
              </span>
            </div>
          );
        })}
      </div>

      {live && (
        <p className="tiny mut center" style={{ marginBottom: 0 }}>
          {speed.size > 0
            ? `أسرع إجابة: ${ar(Math.round(Math.min(...speed.values()) / 100) / 10)} ثانية`
            : 'لم يُجب أحد بعد'}
        </p>
      )}
    </section>
  );
}

/* ── distribution for the live question ─────────────────────────────────── */
function Distribution({ data }: { data: SyncPayload }) {
  const s = data.session;
  const [detail, setDetail] = useState<LiveDetail | null>(null);

  useEffect(() => {
    if (s.status === 'lobby' || s.status === 'finished') {
      setDetail(null);
      return;
    }
    let stop = false;
    const load = async () => {
      try {
        const d = await liveDetail(s.id);
        if (!stop) setDetail(d);
      } catch {
        /* ignore */
      }
    };
    void load();
    const id = window.setInterval(load, 3000);
    return () => {
      stop = true;
      window.clearInterval(id);
    };
  }, [s.id, s.status, s.questionIndex]);

  if (s.status === 'lobby' || s.status === 'finished') return null;

  const total = Math.max(1, detail?.answers.filter((a) => a.chosen != null).length ?? 0);
  const correct = data.reveal?.correctIndex ?? null;

  return (
    <section className="card" style={{ marginTop: 16 }}>
      <h3 style={{ marginTop: 0 }}>
        <Icon name="chart" size={18} style={{ verticalAlign: '-3px', marginInlineEnd: 6 }} />
        توزيع إجابات السؤال الحالي
      </h3>
      {total === 0 ? (
        <div className="note">
          <Icon name="hourglass" size={17} />
          لم يُجب أحد بعد.
        </div>
      ) : (
        <div className="dist">
          {LETTERS.map((L, i) => (
            <div key={L} className={correct === i ? 'hit' : ''}>
              <span>{ar(L)}</span>
              <i>
                <u style={{ width: `${((detail?.distribution[String(i)] ?? 0) / total) * 100}%` }} />
              </i>
              <span style={{ direction: 'ltr' }}>{arNum(detail?.distribution[String(i)] ?? 0)}</span>
            </div>
          ))}
        </div>
      )}
      {s.status === 'question' && (
        <p className="tiny mut" style={{ margin: '10px 0 0' }}>
          يظهر обознаش على الخيار الصحيح فور كشف الحل.
        </p>
      )}
    </section>
  );
}

/* ── teacher-side leaderboard ───────────────────────────────────────────── */
function TeacherBoard({ data }: { data: SyncPayload }) {
  const rows = data.leaderboard;
  if (!rows.length) return null;
  const top = Math.max(1, ...rows.map((r) => r.total_points));

  return (
    <section className="card" style={{ marginTop: 16 }}>
      <div className="spread" style={{ marginBottom: 10 }}>
        <h3 style={{ margin: 0 }}>
          <Icon name="trophy" size={18} style={{ verticalAlign: '-3px', marginInlineEnd: 6 }} />
          ترتيب الطلاب
        </h3>
        <span className="badge n">{`${ar(rows.length)} طالب`}</span>
      </div>

      {/* Every seat, first to last. The list scrolls internally so a class of
          200 never pushes the rest of the dashboard off the screen. */}
      <div className="lb-scroll">
        <div className="lb">
          {rows.map((r, i) => (
            <div
              key={r.player_id}
              className={`row ${r.rank <= 3 ? `top${r.rank}` : ''}`}
              style={{ '--i': i } as CSSProperties}
            >
              <span className="who">
                <span className="rk">{ar(r.rank)}</span>
                <Avatar emoji={r.avatar} banner={r.banner} />
                <b>{ar(r.name)}</b>
              </span>
              <i>
                <u style={{ width: `${(r.total_points / top) * 100}%` }} />
              </i>
              <span className="pts">{arNum(r.total_points)}</span>
            </div>
          ))}
        </div>
      </div>

      <p className="center tiny mut" style={{ margin: '10px 0 0' }}>
        {`المتصدر ${ar(rows[0]!.name)} · الأخير ${ar(rows[rows.length - 1]!.name)}`}
      </p>
    </section>
  );
}

function useTick(): [number, () => void] {
  const [n, setN] = useState(0);
  const bump = useCallback(() => setN((v) => v + 1), []);
  return [n, bump];
}

export { mmss };