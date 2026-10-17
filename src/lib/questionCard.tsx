import { useMemo } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from './icons';
import { ar, arNum, fmtLine, secs } from './format';
import { Figure, NumberLine } from './graph';
import { Badge, Timer } from './ui';
import type { LiveQuestion, MyResult, NumberLineSpec, Option } from './types';

/* ═══════════════════════════════════════════════════════════════════════════
   The question card — visually identical to the original quiz, with one
   crucial difference: the option list is the only part that behaves differently
   during a live round. Before the round closes the correct answer is not
   rendered anywhere (the server does not even send it), so it can no longer
   leak the way the single-file version did.
   ═══════════════════════════════════════════════════════════════════════════ */

const LETTERS = ['أ', 'ب', 'ج', 'د', 'هـ', 'و'];

export function OptionBody({ opt }: { opt: Option }) {
  if (opt.kind === 'figure') return <Figure spec={opt.figure} />;
  return <span dangerouslySetInnerHTML={{ __html: fmtLine(opt.text) }} />;
}

/* ── Live question ─────────────────────────────────────────────────────── */
export function QuestionCard({
  question,
  lessonName,
  slot,
  totalSlots,
  secondsLeft,
  secondsTotal,
  answeredSlot,
  chosen,
  onPick,
  onTimeUp,
  live,
  readOnly,
}: {
  question: LiveQuestion;
  lessonName: string;
  slot: number;
  totalSlots: number;
  secondsLeft: number;
  secondsTotal: number;
  answeredSlot: number | null;
  chosen: number | null;
  onPick: (index: number) => void;
  onTimeUp: () => void;
  live: boolean;
  /**
   * Teacher preview: render the identical card (including the running
   * countdown) but the options are inert, so watching the round can never be
   * mistaken for answering it.
   */
  readOnly?: boolean;
}) {
  const figureOptions = useMemo(
    () => question.options.some((o) => o.kind === 'figure'),
    [question.options],
  );
  const locked = answeredSlot !== null || !live || readOnly === true;
  const showTimer = live || readOnly === true;

  return (
    <section className={`card ${locked ? 'still' : ''}`}>
      <div className="top">
        <span className="badge">
          <Icon name="book" size={13} style={{ verticalAlign: '-2px', marginInlineEnd: 4 }} />
          {`الدرس ${ar(question.lesson + 1)}: ${lessonName}`}
        </span>
        <span>{`السؤال ${ar(slot + 1)} من ${ar(totalSlots)}`}</span>
      </div>

      <div className="bar">
        <i style={{ width: `${((slot + 1) / Math.max(totalSlots, 1)) * 100}%` }} />
      </div>

      <div className="spread" style={{ alignItems: 'flex-start' }}>
        <h2 style={{ margin: '4px 0', flex: 1 }} dangerouslySetInnerHTML={{ __html: fmtLine(question.body) }} />
        {showTimer && <Timer secondsLeft={secondsLeft} total={secondsTotal} onDone={live ? onTimeUp : undefined} />}
      </div>

      {question.figure && (
        <div className="pan">
          <Figure spec={question.figure} />
        </div>
      )}

      <div className={`ops ${figureOptions ? 'gr' : ''}`}>
        {question.options.map((opt, j) => {
          const mine = chosen === j;
          return (
            <button
              key={j}
              type="button"
              className={`op ${mine ? 'no locked' : 'in'}`}
              style={{ '--i': j } as CSSProperties}
              disabled={locked}
              onClick={() => onPick(j)}
              aria-pressed={mine}
            >
              <b>{LETTERS[j]}</b>
              <span>
                <OptionBody opt={opt} />
              </span>
              {mine && <Icon name="check" size={18} />}
            </button>
          );
        })}
      </div>
    </section>
  );
}

/* ── Waiting for the other students / next question ────────────────────── */
export function WaitingCard({
  answeredCount,
  playerCount,
  slot,
  totalSlots,
  paused,
}: {
  answeredCount: number;
  playerCount: number;
  slot: number;
  totalSlots: number;
  paused: boolean;
}) {
  const done = answeredCount >= playerCount && playerCount > 0;
  return (
    <section className="card center">
      <Badge icon={done ? 'checkCircle' : paused ? 'pause' : 'hourglass'} tone={done ? 'good' : 'warn'} size={78} />
      <h2 style={{ margin: '4px 0' }}>
        {paused ? 'أوقف المعلّم اللعبة مؤقتاً' : done ? 'أنهى الجميع الإجابة!' : 'تم تسجيل إجابتك'}
      </h2>
      <p className="mut">
        {done
          ? 'بانتظار أن يرسل المعلّم السؤال التالي…'
          : `بانتظار باقي الطلاب (${ar(answeredCount)} من ${ar(playerCount)})`}
      </p>
      <div className="bar" style={{ maxWidth: 420, margin: '14px auto 6px' }}>
        <i style={{ width: `${playerCount ? (answeredCount / playerCount) * 100 : 0}%` }} />
      </div>
      <p className="tiny mut">
        {`السؤال ${ar(slot + 1)} من ${ar(totalSlots)}`}
      </p>
    </section>
  );
}

/* ── Between rounds ────────────────────────────────────────────────────── */
export function BetweenCard({ nextIn, slot, totalSlots }: { nextIn: number | null; slot: number; totalSlots: number }) {
  return (
    <section className="card center">
      <Badge icon="sparkle" tone="muted" size={78} />
      <h2 style={{ margin: '4px 0' }}>بانتظار السؤال التالي</h2>
      <p className="mut">{`أنجزت ${ar(slot)} من ${ar(totalSlots)} — استمر، بقي القليل!`}</p>
      {nextIn != null && (
        <p className="tiny mut" style={{ marginTop: 6 }}>
          {ar(Math.ceil(nextIn))} ثانية
        </p>
      )}
    </section>
  );
}

/* ── Reveal ────────────────────────────────────────────────────────────── */
export function RevealCard({
  question,
  slot,
  totalSlots,
  correctIndex,
  chosen,
  result,
  explanation,
  numberLine,
  timeUp,
}: {
  question: LiveQuestion;
  slot: number;
  totalSlots: number;
  correctIndex: number;
  chosen: number | null;
  result: MyResult | null;
  explanation: string;
  numberLine: NumberLineSpec | null;
  timeUp: boolean;
}) {
  const ok = result?.correct === true;
  const missed = result ? !result.answered : true;
  const figureOptions = useMemo(
    () => question.options.some((o) => o.kind === 'figure'),
    [question.options],
  );

  return (
    <section className="card still">
      <div className="top">
        <span className={`badge ${ok ? 'g' : missed ? 'n' : 'r'}`}>
          {`السؤال ${ar(slot + 1)} من ${ar(totalSlots)}`}
        </span>
        <span>{timeUp ? 'انتهى الوقت' : 'أوقف المعلّم الوقت'}</span>
      </div>

      <div className="spread" style={{ margin: '10px 0 4px', alignItems: 'flex-start' }}>
        <div className="row" style={{ gap: 12, flex: 1 }}>
          <Badge
            icon={ok ? 'checkCircle' : missed ? 'hourglass' : 'book'}
            tone={ok ? 'good' : missed ? 'warn' : 'bad'}
            size={62}
          />
          <div style={{ minWidth: 0 }}>
            <h2 style={{ margin: 0 }}>
              {ok ? 'إجابة صحيحة!' : missed ? 'انتهى الوقت… راحت عليك' : 'إجابة غير صحيحة'}
            </h2>
            <p className="mut tiny" style={{ margin: 0 }}>
              {missed
                ? 'لم تُجب عن هذا السؤال'
                : `أجبت في ${arNum(((result?.msTaken ?? 0) / 1000).toFixed(1))} ثانية`}
            </p>
          </div>
        </div>

        <div className="stat" style={{ boxShadow: '3px 3px 0 var(--ink)', padding: '4px 16px', flex: 'none' }}>
          <b style={{ fontSize: 26, color: ok ? 'var(--ok)' : 'var(--mut)' }}>{ar(result?.points ?? 0)}</b>
          <span>نقطة</span>
        </div>
      </div>

      {missed && (
        <div className="note" style={{ marginTop: 12 }}>
          <Icon name="hourglass" size={18} />
          انتهى الوقت قبل أن تصل إجابتك، فلم تُحتسب نقاط لهذه الجولة.
        </div>
      )}

      {question.figure && (
        <div className="pan">
          <Figure spec={question.figure} />
        </div>
      )}

      <div className={`ops ${figureOptions ? 'gr' : ''}`} style={{ pointerEvents: 'none' }}>
        {question.options.map((opt, j) => {
          const correct = j === correctIndex;
          const mine = chosen === j;
          const cls = correct ? 'ok' : mine ? 'no' : 'locked';
          return (
            <div key={j} className={`op ${cls}`} style={{ cursor: 'default' }}>
              <b>{LETTERS[j]}</b>
              <span>
                <OptionBody opt={opt} />
              </span>
              {correct ? (
                <Icon name="checkCircle" size={20} />
              ) : mine ? (
                <Icon name="xCircle" size={20} />
              ) : null}
            </div>
          );
        })}
      </div>

      <div className={`ex ${ok ? 'good' : missed ? 'idle' : 'bad'}`}>
        <h3>{`الدرس ${ar(question.lesson + 1)} — الحل`}</h3>
        <p dangerouslySetInnerHTML={{ __html: fmtLine(explanation) }} />
        {numberLine && <NumberLine spec={numberLine} />}
        {result?.msTaken != null && result.answered && (
          <p className="tiny" style={{ marginTop: 8 }}>
            {`زمن الإجابة: ${ar(secs(result.msTaken))} — النقاط تعتمد على الصواب وسرعة الإجابة`}
          </p>
        )}
      </div>
    </section>
  );
}