import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../lib/icons';
import { ar, fmtLine, mmss } from '../lib/format';
import { Empty, StatusChip, Timer, useTick } from '../lib/ui';
import { msUntil } from '../lib/clock';
import { LESSONS } from '../lib/lessons';
import { Figure, NumberLine } from '../lib/graph';
import { OptionBody, QuestionCard } from '../lib/questionCard';
import type { RevealPayload, SyncPayload } from '../lib/types';

/* ═══════════════════════════════════════════════════════════════════════════
   Teacher preview — "what the students are looking at right now".

   It is a mirror, never a seat: the card renders with the live countdown and
   the same options, but every option is disabled, so watching a round can
   never be mistaken for answering it. Once the round closes the server
   releases the correct answer plus the explanation, and both appear
   underneath the question so the teacher can read the solution aloud.

   Nothing here is privileged beyond what students themselves receive: the
   question payload never carries `correct_index`, and the explanation only
   arrives once the round has been settled.
   ═══════════════════════════════════════════════════════════════════════════ */

const LETTERS = ['أ', 'ب', 'ج', 'د', 'هـ', 'و'];

const noop = () => undefined;

export function QuestionPreview({ data }: { data: SyncPayload | null }) {
  /* The server drops `reveal` the instant the teacher moves on, so remember the
     last one seen for this slot — otherwise a fast "next" would erase the
     explanation before it had been read. */
  const [kept, setKept] = useState<{ slot: number; reveal: RevealPayload } | null>(null);
  const slot = data?.session.questionIndex ?? -1;
  const fresh = data?.reveal ?? null;

  useEffect(() => {
    if (fresh) setKept({ slot: fresh.slot, reveal: fresh });
  }, [fresh]);

  /* Re-render four times a second so the countdown matches the students'. */
  useTick(data?.session.status === 'question');

  if (!data) {
    return (
      <section className="card">
        <Empty icon="eye" text="أنشئ جلسة لتظهر محاكاة ما يراه الطلاب" />
      </section>
    );
  }

  const s = data.session;

  if (s.status === 'lobby' || s.status === 'finished') {
    return (
      <section className="card">
        <PreviewHead
          status={s.status}
          slot={slot}
          total={s.totalQuestions}
          answered={s.answeredCount}
          players={s.playerCount}
          secondsLeft={0}
        />
        <Empty
          icon={s.status === 'lobby' ? 'hourglass' : 'stop'}
          text={
            s.status === 'lobby'
              ? 'اضغط «ابدأ اللعبة» لتبدأ المحاكاة تلقائياً'
              : 'انتهت اللعبة — ابدأ جولة جديدة لتعود المحاكاة'
          }
        />
      </section>
    );
  }

  if (!data.question) {
    return (
      <section className="card">
        <Empty icon="hourglass" text="جارٍ تحضير السؤال…" />
      </section>
    );
  }

  const secondsLeft = Math.max(0, Math.ceil(msUntil(s.questionEndsAt, s.questionSeconds) / 1000));
  /* Prefer the live payload; fall back to the kept copy for the same slot. */
  const reveal = fresh ?? (kept && kept.slot === slot ? kept.reveal : null);
  const settled = reveal !== null && s.status !== 'question';

  return (
    <>
      <section className="card" style={{ marginBottom: 16 }}>
        <PreviewHead
          status={s.status}
          slot={slot}
          total={s.totalQuestions}
          answered={s.answeredCount}
          players={s.playerCount}
          secondsLeft={secondsLeft}
        />
      </section>

      {settled && reveal ? (
        <SettledCard data={data} reveal={reveal} secondsLeft={secondsLeft} secondsTotal={s.questionSeconds} />
      ) : (
        <>
          <MirrorCard data={data} secondsLeft={secondsLeft} />
          <p className="center tiny mut" style={{ marginTop: 12 }}>
            <Icon name="info" size={13} style={{ verticalAlign: '-2px' }} />{' '}
            {s.answeredCount >= s.playerCount && s.playerCount > 0
              ? 'أنهى الجميع الإجابة — سيُكشف الحل تلقائياً عند انتهاء الوقت.'
              : `بانتظار إجابات الطلاب (${ar(s.answeredCount)} من ${ar(s.playerCount)}).`}
          </p>
        </>
      )}
    </>
  );
}

/* ── the read-only twin of the student question card ────────────────────── */
function MirrorCard({ data, secondsLeft }: { data: SyncPayload; secondsLeft: number }) {
  const s = data.session;
  const q = data.question!;
  return (
    <QuestionCard
      question={q}
      lessonName={LESSONS[q.lesson] ?? ''}
      slot={s.questionIndex}
      totalSlots={s.totalQuestions}
      secondsLeft={secondsLeft}
      secondsTotal={s.questionSeconds}
      answeredSlot={null}
      chosen={null}
      onPick={noop}
      onTimeUp={noop}
      live={false}
      readOnly
    />
  );
}

/* ── banner above the mirror ───────────────────────────────────────────── */
function PreviewHead({
  status,
  slot,
  total,
  answered,
  players,
  secondsLeft,
}: {
  status: string;
  slot: number;
  total: number;
  answered: number;
  players: number;
  secondsLeft: number;
}) {
  return (
    <div className="spread" style={{ flexWrap: 'wrap', gap: 10 }}>
      <div>
        <h3 style={{ margin: 0 }}>
          <Icon name="eye" size={18} style={{ verticalAlign: '-3px', marginInlineEnd: 6 }} />
          شاشة الطلاب الآن
        </h3>
        <p className="tiny mut" style={{ margin: '2px 0 0' }}>
          محاكاة للعرض فقط — الخيارات معطّلة ولا تُسجَّل أي إجابة.
        </p>
      </div>
      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
        {slot >= 0 && <span className="badge n">{`السؤال ${ar(slot + 1)} من ${ar(total)}`}</span>}
        {status === 'question' && (
          <span
            className={`badge ${secondsLeft <= 5 ? 'r' : secondsLeft <= 10 ? '' : 'n'}`}
            style={{ fontWeight: 800 }}
          >
            <Icon name="clock" size={13} style={{ verticalAlign: '-2px', marginInlineEnd: 3 }} />
            {mmss(secondsLeft)}
          </span>
        )}
        <span className="badge">
          <Icon name="users" size={13} style={{ verticalAlign: '-2px', marginInlineEnd: 3 }} />
          {`${ar(answered)}/${ar(players)}`}
        </span>
        <StatusChip status={status} />
      </div>
    </div>
  );
}

/* ── the answer + explanation, shown once the round is closed ───────────── */
function SettledCard({
  data,
  reveal,
  secondsLeft,
  secondsTotal,
}: {
  data: SyncPayload;
  reveal: RevealPayload;
  secondsLeft: number;
  secondsTotal: number;
}) {
  const s = data.session;
  const question = data.question!;
  const slot = s.questionIndex;

  const figureOptions = useMemo(
    () => question.options.some((o) => o.kind === 'figure'),
    [question.options],
  );

  return (
    <section className="card still">
      <div className="top">
        <span className="badge g">
          <Icon name="checkCircle" size={13} style={{ verticalAlign: '-2px', marginInlineEnd: 4 }} />
          الحل
        </span>
        <span>{`السؤال ${ar(slot + 1)} من ${ar(s.totalQuestions)}`}</span>
      </div>

      <div className="spread" style={{ alignItems: 'flex-start' }}>
        <h2 style={{ margin: '4px 0', flex: 1 }} dangerouslySetInnerHTML={{ __html: fmtLine(question.body) }} />
        <Timer secondsLeft={secondsLeft} total={secondsTotal} />
      </div>

      {question.figure && (
        <div className="pan">
          <Figure spec={question.figure} />
        </div>
      )}

      <div className={`ops ${figureOptions ? 'gr' : ''}`} style={{ pointerEvents: 'none' }}>
        {question.options.map((opt, j) => {
          const correct = j === reveal.correctIndex;
          return (
            <div
              key={j}
              className={`op ${correct ? 'ok' : 'locked'}`}
              style={{ '--i': j, cursor: 'default' } as CSSProperties}
            >
              <b>{LETTERS[j]}</b>
              <span>
                <OptionBody opt={opt} />
              </span>
              {correct && <Icon name="checkCircle" size={20} />}
            </div>
          );
        })}
      </div>

      <div className="ex good">
        <h3>{`الدرس ${ar(question.lesson + 1)} — الحل`}</h3>
        <p dangerouslySetInnerHTML={{ __html: fmtLine(reveal.explanation) }} />
        {reveal.numberLine && <NumberLine spec={reveal.numberLine} />}
      </div>

      <p className="center tiny mut" style={{ marginTop: 12, marginBottom: 0 }}>
        {`هذا النص يظهر للطلاب أيضاً لحظة كشف الحل — اقرأه بصوت مسموع قبل الانتقال.`}
      </p>
    </section>
  );
}
