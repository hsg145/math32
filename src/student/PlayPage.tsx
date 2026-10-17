import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BrandMark, Icon } from '../lib/icons';
import { ar, arNum, mmss, secs } from '../lib/format';
import { Avatar, Badge, Loading, StatusChip, confetti } from '../lib/ui';
import { msUntil, serverNow } from '../lib/clock';
import { useLive } from '../lib/live';
import { navigate, save } from '../lib/router';
import { roster, settle, submitAnswer, sync } from '../lib/api';
import { LESSONS } from '../lib/lessons';
import type { MyResult, RosterPlayer, SyncPayload } from '../lib/types';
import { IdentityPage, StudentFooter } from './JoinPages';
import { BetweenCard, QuestionCard, RevealCard, WaitingCard } from '../lib/questionCard';
import { FinalBoard } from './FinalBoard';

/* ═══════════════════════════════════════════════════════════════════════════
   The live game. One websocket, one 18-second heartbeat, zero polling loops.
   ═══════════════════════════════════════════════════════════════════════════ */

const HEARTBEAT_MS = 18_000;

type PlayPageProps = { sessionId: string | null; code: string };

export function PlayPage({ sessionId, code }: PlayPageProps) {
  const [data, setData] = useState<SyncPayload | null>(null);
  const [rosterPlayers, setRoster] = useState<RosterPlayer[]>([]);
  const [error, setError] = useState('');
  const [fatal, setFatal] = useState(false);
  const [picked, setPicked] = useState<{ slot: number; choice: number } | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const settling = useRef(false);
  const lastSlot = useRef<number>(-1);
  const confettiFor = useRef<number>(-1);

  /* ── pull the authoritative snapshot ──────────────────────────────────── */
  const pull = useCallback(
    async (showSpinner = false) => {
      if (!sessionId) return;
      try {
        const d = await sync(sessionId);
        setData(d);
        setError('');
        setFatal(false);
        if (d.me && d.session.status === 'lobby') void refreshRoster();
      } catch (e) {
        const m = e instanceof Error ? e.message : 'تعذّر الاتصال';
        /* the stored session is gone (deleted or code rotated away) — send the
           student back to the door instead of a form that cannot succeed */
        if (/الجلسة غير موجودة/.test(m)) {
          save('sessionId', null);
          navigate('/join', true);
          return;
        }
        if (/غير مسجّل/.test(m)) setFatal(true);
        else setError(m);
      } finally {
        if (showSpinner) setData((d) => d);
      }
    },
    [sessionId],
  );

  const refreshRoster = useCallback(async () => {
    if (!sessionId) return;
    try {
      const r = await roster(sessionId);
      setRoster(r.players);
    } catch {
      /* the roster is decorative — never block the game on it */
    }
  }, [sessionId]);

  /* ── initial load + heartbeat + realtime nudges ───────────────────────── */
  useEffect(() => {
    if (!sessionId) {
      navigate('/join', true);
      return;
    }
    void pull(true);
    const beat = window.setInterval(() => void pull(), HEARTBEAT_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void pull();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onVisible);
    void refreshRoster();
    return () => {
      window.clearInterval(beat);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onVisible);
    };
  }, [sessionId, pull, refreshRoster]);

  useLive(sessionId, (evt) => {
    if (evt === 'sessions') void pull();
    else if (evt === 'players') void refreshRoster();
    else if (evt === 'answers') void pull();
  });

  /* ── answer ───────────────────────────────────────────────────────────── */
  const answer = useCallback(
    async (index: number) => {
      if (!sessionId || !data) return;
      const slot = data.session.questionIndex;
      if (picked?.slot === slot) return;

      setPicked({ slot, choice: index });
      setFlash(null);

      try {
        /* Reaction time is measured by the database, not by this device. */
        await submitAnswer(sessionId, slot, index);
        void pull();
      } catch (e) {
        setFlash(e instanceof Error ? e.message : 'تعذّر تسجيل الإجابة');
        setPicked(null);
      }
    },
    [data, picked, pull, sessionId],
  );

  /* ── automatic round close (safe: the DB refuses before the timer ends) ─ */
  const closeRound = useCallback(async () => {
    if (!sessionId || settling.current) return;
    settling.current = true;
    try {
      await settle(sessionId);
    } catch {
      /* another client already closed it — the follow-up pull fixes everything */
    } finally {
      settling.current = false;
      void pull();
    }
  }, [pull, sessionId]);

  /* ── countdown clock ──────────────────────────────────────────────────── */
  const [, tick] = useReducerTick();
  useEffect(() => {
    if (!data) return;
    if (data.session.status !== 'question') return;
    const id = window.setInterval(tick, 200);
    return () => window.clearInterval(id);
  }, [data, tick]);

  const status = data?.session.status ?? 'lobby';
  const secondsLeft =
    status === 'question'
      ? Math.max(0, Math.ceil(msUntil(data!.session.questionEndsAt, data!.session.questionSeconds) / 1000))
      : status === 'reveal' && data?.session.revealedAt
        ? Math.max(0, Math.ceil((serverNow() - new Date(data.session.revealedAt).getTime()) / 1000))
        : 0;

  // fire the settlement as soon as the local clock crosses zero
  useEffect(() => {
    if (status !== 'question') return;
    if (msUntil(data?.session.questionEndsAt, 0) <= 0) void closeRound();
  }, [status, secondsLeft, data, closeRound]);

  /* ── per-round bookkeeping ────────────────────────────────────────────── */
  const slot = data?.session.questionIndex ?? -1;
  useEffect(() => {
    if (slot !== lastSlot.current) {
      lastSlot.current = slot;
      setPicked(null);
      settling.current = false;
    }
  }, [slot]);

  /* confetti once per round for the current leader */
  useEffect(() => {
    if (status !== 'reveal' || !data?.leaderboard.length) return;
    if (confettiFor.current === slot) return;
    confettiFor.current = slot;
    const me = data.leaderboard.find((r) => r.player_id === data.me?.playerId);
    if (me && me.rank === 1) confetti(40);
  }, [status, data, slot]);

  useEffect(() => {
    if (data?.session.title) document.title = data.session.title;
  }, [data?.session.title]);

  /* ── gates ────────────────────────────────────────────────────────────── */
  if (!sessionId) return <Loading />;
  if (!data) {
    return error ? (
      <main className="shell">
        <section className="card center">
          <div className="err">
            <Icon name="alert" size={18} />
            {ar(error)}
          </div>
          <button className="btn" style={{ marginTop: 14 }} onClick={() => void pull()}>
            <Icon name="refresh" size={18} />
            إعادة المحاولة
          </button>
        </section>
      </main>
    ) : (
      <Loading label="جارٍ الاتصال بالاختبار…" />
    );
  }

  if (fatal || !data.me) return <IdentityPage code={code} />;

  const s = data.session;
  const meId = data.me.playerId;
  const liveChoice = picked?.slot === slot ? picked.choice : null;
  const settledChoice = lastChosen(data, slot);
  const myChoice = liveChoice ?? settledChoice;
  const answeredSlot = liveChoice !== null ? slot : null;
  const myResult = (n: number): MyResult | null => data.myResults.find((r) => r.slot === n) ?? null;

  /* ── header ───────────────────────────────────────────────────────────── */
  const header = (
    <div className="row between" style={{ marginBottom: 10 }}>
      <div className="row" style={{ gap: 10, minWidth: 0 }}>
        <BrandMark size={34} />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 800, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {ar(s.title)}
          </div>
          <div className="tiny mut row" style={{ gap: 6 }}>
            <StatusChip status={s.status} />
            <span>
              {`${ar(s.playerCount)} طالب`}
            </span>
          </div>
        </div>
      </div>
      <div className="row" style={{ gap: 8, flexWrap: 'nowrap' }}>
        <MyScore data={data} />
        {status === 'question' && (
          <span className={`badge ${secondsLeft <= 5 ? 'r' : secondsLeft <= 10 ? '' : 'n'}`} style={{ fontWeight: 800 }}>
            <Icon name="clock" size={13} style={{ verticalAlign: '-2px', marginInlineEnd: 3 }} />
            {mmss(secondsLeft)}
          </span>
        )}
      </div>
    </div>
  );

  /* ── views ────────────────────────────────────────────────────────────── */
  let body: React.ReactNode;

  if (!s.isOpen && status === 'lobby') {
    body = (
      <section className="card center">
        <Badge icon="lock" tone="warn" size={78} />
        <h2>الباب مغلق مؤقتاً</h2>
        <p className="mut">أغلق المعلّم استقبال الطلاب، ابقَ في الصفحة — سيُفتح تلقائياً.</p>
      </section>
    );
  } else if (status === 'lobby') {
    body = (
      <LobbyView
        players={rosterPlayers}
        meId={meId}
        doneSlots={data.myResults.length}
        totalSlots={s.totalQuestions}
        points={data.leaderboard.find((r) => r.player_id === meId)?.total_points ?? 0}
      />
    );
  } else if (status === 'between') {
    body = (
      <>
        <BetweenCard
          nextIn={s.revealedAt ? Math.max(0, (new Date(s.revealedAt).getTime() + 45_000 - serverNow()) / 1000) : null}
          slot={slot}
          totalSlots={s.totalQuestions}
        />
        <Standings data={data} meId={meId} title="الترتيب الآن" />
      </>
    );
  } else if (status === 'question' && data.question) {
    body = answeredSlot !== null ? (
      <WaitingCard
        answeredCount={s.answeredCount}
        playerCount={s.playerCount}
        slot={slot}
        totalSlots={s.totalQuestions}
        paused={false}
      />
    ) : (
      <QuestionCard
        question={data.question}
        lessonName={LESSONS[data.question.lesson] ?? ''}
        slot={slot}
        totalSlots={s.totalQuestions}
        secondsLeft={secondsLeft}
        secondsTotal={s.questionSeconds}
        answeredSlot={answeredSlot}
        chosen={liveChoice}
        onPick={answer}
        onTimeUp={closeRound}
        live
      />
    );
  } else if (status === 'reveal' && data.question && data.reveal) {
    body = (
      <>
        <RevealCard
          question={data.question}
          slot={slot}
          totalSlots={s.totalQuestions}
          correctIndex={data.reveal.correctIndex}
          chosen={myChoice}
          result={myResult(slot)}
          explanation={data.reveal.explanation}
          numberLine={data.reveal.numberLine}
          timeUp
        />
        <Standings data={data} meId={meId} title="الترتيب الآن" />
      </>
    );
  } else if (status === 'finished') {
    body = <FinalBoard data={data} />;
  } else {
    body = <Loading label="جارٍ تحضير السؤال…" />;
  }

  return (
    <main className="shell">
      {!s.isOpen && status !== 'lobby' && (
        <div className="note" style={{ marginBottom: 12 }}>
          <Icon name="lock" size={17} />
          استقبال الطلاب مغلق — لا يمكن لدخول طالب جديد الآن.
        </div>
      )}
      {error && (
        <div className="note" style={{ marginBottom: 12 }}>
          <Icon name="signalOff" size={17} />
          {ar(error)} — نحاول إعادة الاتصال تلقائياً.
        </div>
      )}
      {flash && (
        <div className="err" style={{ marginBottom: 12 }}>
          <Icon name="alert" size={17} />
          {ar(flash)}
        </div>
      )}
      {header}
      {body}
      <StudentFooter />
    </main>
  );
}

/* ── waiting room ───────────────────────────────────────────────────────── */
function LobbyView({
  players,
  meId,
  doneSlots,
  totalSlots,
  points,
}: {
  players: RosterPlayer[];
  meId: string;
  doneSlots: number;
  totalSlots: number;
  points: number;
}) {
  /* me first, then whoever is ahead — mirrors what the teacher sees */
  const sorted = useMemo(
    () =>
      [...players].sort((a, b) => {
        if (a.playerId === meId) return -1;
        if (b.playerId === meId) return 1;
        return b.points - a.points || a.joinedAt.localeCompare(b.joinedAt);
      }),
    [players, meId],
  );

  const ranked = useMemo(
    () => [...players].sort((a, b) => b.points - a.points || a.joinedAt.localeCompare(b.joinedAt)),
    [players],
  );
  const top = Math.max(1, ...ranked.map((r) => r.points));

  return (
    <section className="card lobby">
      <header className="lobby-head">
        <Badge icon="hourglass" tone="muted" size={72} />
        <h1>غرفة الانتظار</h1>
        <p className="mut">أنت مسجّل. انتظر بداية المعلّم — ابقَ في هذه الصفحة.</p>
        <div className="lobby-stats">
          <span className="badge">
            <Icon name="users" size={13} style={{ verticalAlign: '-2px', marginInlineEnd: 4 }} />
            {ar(`${players.length} طالب`)}
          </span>
          {totalSlots > 0 && <span className="badge n">{ar(`${totalSlots} سؤال`)}</span>}
          <span className="badge g">{ar(`نقاطك ${arNum(points)}`)}</span>
          {doneSlots > 0 && <span className="badge n">{ar(`أجبت ${doneSlots}`)}</span>}
        </div>
        <div className="lobby-live">
          <span className="lobby-dot" />
          بانتظار المعلّم…
        </div>
      </header>

      <h3 className="lobby-sub">
        <Icon name="users" size={16} style={{ verticalAlign: '-3px', marginInlineEnd: 6 }} />
        الطلاب معك
      </h3>

      {players.length === 0 ? (
        <div className="empty">
          <Icon name="users" size={30} />
          <div style={{ marginTop: 6 }}>لا يوجد طلاب بعد — كن أول المنضمين!</div>
        </div>
      ) : (
        <div className="roster">
          {sorted.map((p, i) => (
            <div key={p.playerId} className={`seat-card${p.playerId === meId ? ' me' : ''}`} style={{ '--i': i } as React.CSSProperties}>
              <span className="seat-rank">{ar(i + 1)}</span>
              <Avatar emoji={p.avatar} banner={p.banner} size="lg" ring={p.playerId === meId} />
              <span className="seat-name">{p.playerId === meId ? 'أنت' : ar(p.name)}</span>
              <span className="seat-points">{arNum(p.points)}</span>
              {p.playerId === meId && <span className="seat-you">أنت</span>}
            </div>
          ))}
        </div>
      )}

      {ranked.length > 1 && (
        <>
          <h3 className="lobby-sub">
            <Icon name="trophy" size={16} style={{ verticalAlign: '-3px', marginInlineEnd: 6 }} />
            الترتيب المبدئي
          </h3>
          <div className="lb">
            {ranked.slice(0, 5).map((p, i) => (
              <div
                key={p.playerId}
                className={`row ${p.playerId === meId ? 'me' : ''} ${i < 3 ? `top${i + 1}` : ''}`}
                style={{ '--i': i } as React.CSSProperties}
              >
                <span className="who">
                  <span className="rk">{ar(i + 1)}</span>
                  <Avatar emoji={p.avatar} banner={p.banner} />
                  <b>{p.playerId === meId ? 'أنت' : ar(p.name)}</b>
                </span>
                <i>
                  <u style={{ width: `${(p.points / top) * 100}%` }} />
                </i>
                <span className="pts">{arNum(p.points)}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

/* ── standings panel ────────────────────────────────────────────────────── */
export function Standings({
  data,
  meId,
  title = 'الترتيب',
  limit = 10,
}: {
  data: SyncPayload;
  meId: string;
  title?: string;
  limit?: number;
}) {
  const rows = data.leaderboard;
  if (!rows.length) return null;
  const top = Math.max(1, ...rows.map((r) => r.total_points));
  const myIdx = rows.findIndex((r) => r.player_id === meId);
  const shown = myIdx >= limit ? [...rows.slice(0, limit), rows[myIdx]!] : rows.slice(0, limit);

  return (
    <section className="card" style={{ marginTop: 16 }}>
      <div className="spread">
        <h3 style={{ margin: 0 }}>
          <Icon name="trophy" size={18} style={{ verticalAlign: '-3px', marginInlineEnd: 6 }} />
          {ar(title)}
        </h3>
        {myIdx >= 0 && (
          <span className="badge">
            {`ترتيبك ${ar(myIdx + 1)} من ${ar(rows.length)}`}
          </span>
        )}
      </div>
      <div className="lb" style={{ marginTop: 10 }}>
        {shown.map((r, i) => (
          <div
            key={r.player_id}
            className={`row ${r.player_id === meId ? 'me' : ''} ${r.rank <= 3 ? `top${r.rank}` : ''}`}
            style={{ '--i': i } as React.CSSProperties}
          >
            <span className="who">
              <span className="rk">{ar(r.rank)}</span>
              <Avatar emoji={r.avatar} banner={r.banner} />
              <b>{ar(r.player_id === meId ? 'أنت' : r.name)}</b>
            </span>
            <i>
              <u style={{ width: `${(r.total_points / top) * 100}%` }} />
            </i>
            <span className="pts">{arNum(r.total_points)}</span>
          </div>
        ))}
      </div>
      <p className="center mut tiny" style={{ marginBottom: 0 }}>
        {`صحيح ${ar(rows.find((r) => r.player_id === meId)?.correct ?? 0)} · إجابة ${ar(
          rows.find((r) => r.player_id === meId)?.answered ?? 0,
        )} · أسرع ${secs(rows.find((r) => r.player_id === meId)?.best_ms)}`}
      </p>
    </section>
  );
}

function MyScore({ data }: { data: SyncPayload }) {
  const me = data.leaderboard.find((r) => r.player_id === data.me?.playerId);
  return (
    <span className="badge g" style={{ fontWeight: 800 }}>
      <Icon name="bolt" size={13} style={{ verticalAlign: '-2px', marginInlineEnd: 3 }} />
      {arNum(me?.total_points ?? 0)}
    </span>
  );
}

/* The chosen index for a settled round comes from the server copy. */
function lastChosen(data: SyncPayload, slot: number): number | null {
  return data.myResults.find((r) => r.slot === slot)?.chosen ?? null;
}

function useReducerTick(): [number, () => void] {
  const [n, setN] = useState(0);
  const bump = useCallback(() => setN((v) => v + 1), []);
  return [n, bump];
}