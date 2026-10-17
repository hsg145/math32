/**
 * Renders the live question components to static HTML so the ported maths /
 * graph engine can be diffed against the original single-file quiz.
 *   npm run render:check
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { Figure, NumberLine } from '../src/lib/graph';
import { QuestionCard, RevealCard } from '../src/lib/questionCard';
import { QuestionPreview } from '../src/admin/QuestionPreview';
import { fmtLine } from '../src/lib/format';
import { QUESTION_BANK } from '../src/data/questionBank';
import type { LiveQuestion, SessionInfo, SyncPayload } from '../src/lib/types';

const out: string[] = [];
const pick = (i: number): LiveQuestion => {
  const q = QUESTION_BANK[i]!;
  return {
    slot: i,
    lesson: q.lesson,
    body: q.body,
    figure: q.figure ?? null,
    options: q.options,
    numberLine: q.numberLine ?? null,
    optionCount: q.options.length,
  };
};

/** Render with a label so a failure points at the exact specimen. */
function grab(label: string, fn: () => string): string {
  try {
    return `\n${label}\n${fn()}`;
  } catch (e) {
    return `\n${label}\n!! ${(e as Error).message}`;
  }
}

/* 1. formatted maths line */
out.push(grab('── fmtLine ──', () =>
  [
    fmtLine(QUESTION_BANK[10]!.body),
    fmtLine(QUESTION_BANK[12]!.body), // fraction  ‹a|b›
    fmtLine(QUESTION_BANK[4]!.body), // radical  √س
    fmtLine(QUESTION_BANK[3]!.options[0]!.kind === 'text' ? QUESTION_BANK[3]!.options[0]!.text : ''),
  ].join('\n'),
));

/* 2. a graph-heavy question (parabola pair + labels) */
out.push(grab('── Figure: q2 ──', () => renderToStaticMarkup(<Figure spec={pick(1).figure!} />)));

/* 3. a piecewise / multi-curve question */
out.push(grab('── Figure: q20 (3-piece) ──', () => renderToStaticMarkup(<Figure spec={pick(19).figure!} />)));

/* 4. the horizontal reference line + open circles (q17) */
out.push(grab('── Figure: q17 (profit + hline) ──', () => renderToStaticMarkup(<Figure spec={pick(16).figure!} />)));

/* 5. axis-less mini graphs used as options (q5) */
out.push(
  grab(
    '── Option figures: q5 ──',
    () =>
      pick(4)
        .options
        .map((o, i) =>
          o.kind === 'figure' ? `#${i}: ${renderToStaticMarkup(<Figure spec={o.figure} />)}` : '',
        )
        .join('\n'),
  ),
);

/* 6. number line */
out.push(
  grab('── NumberLine ──', () =>
    renderToStaticMarkup(<NumberLine spec={QUESTION_BANK[14]!.numberLine!} />),
  ),
);

/* 6b. an absolute-value graph */
out.push(grab('── Figure: |x| pair ──', () => renderToStaticMarkup(<Figure spec={pick(22).figure!} />)));

/* 7. the whole live question card */
out.push(
  grab('── QuestionCard ──', () =>
    renderToStaticMarkup(
      <QuestionCard
        question={pick(1)}
        lessonName="الانسحاب"
        slot={1}
        totalSlots={24}
        secondsLeft={14}
        secondsTotal={20}
        answeredSlot={null}
        chosen={null}
        onPick={() => {}}
        onTimeUp={() => {}}
        live
      />,
    ),
  ),
);

/* 8. the reveal card */
out.push(
  grab('── RevealCard ──', () =>
    renderToStaticMarkup(
      <RevealCard
        question={pick(1)}
        slot={1}
        totalSlots={24}
        correctIndex={0}
        chosen={2}
        result={{ slot: 1, correct: false, points: 0, answered: true, msTaken: 7400, chosen: 2 }}
        explanation={QUESTION_BANK[1]!.explanation}
        numberLine={null}
        timeUp
      />,
    ),
  ),
);

/* 8b. a round the student let expire */
out.push(
  grab('── RevealCard (missed) ──', () =>
    renderToStaticMarkup(
      <RevealCard
        question={pick(10)}
        slot={10}
        totalSlots={26}
        correctIndex={0}
        chosen={null}
        result={{ slot: 10, correct: false, points: 0, answered: false, msTaken: null, chosen: null }}
        explanation={QUESTION_BANK[10]!.explanation}
        numberLine={QUESTION_BANK[10]!.numberLine ?? null}
        timeUp
      />,
    ),
  ),
);

/* ═══════════════════════════════════════════════════════════════════════════
   Teacher preview — the "what do the students see" mirror.
   ═══════════════════════════════════════════════════════════════════════════ */

/** Minimal but shape-accurate SyncPayload for the four preview states. */
function payload(
  status: SessionInfo['status'],
  over: Partial<SessionInfo> = {},
  slot = 10,
): SyncPayload {
  const now = new Date();
  const s: SessionInfo = {
    id: '00000000-0000-0000-0000-000000000000',
    title: 'اختبار الاقترانات',
    status,
    isOpen: true,
    questionSeconds: 20,
    questionIndex: slot,
    totalQuestions: 26,
    startedAt: now.toISOString(),
    questionStartedAt: now.toISOString(),
    questionEndsAt: new Date(now.getTime() + 14_000).toISOString(),
    revealedAt: null,
    finishedAt: null,
    answeredCount: 7,
    playerCount: 12,
    isTeacher: true,
    ...over,
  };
  return {
    serverNow: now.toISOString(),
    session: s,
    me: null,
    question: slot >= 0 ? pick(slot) : null,
    reveal: null,
    myResults: [],
    leaderboard: [],
  };
}

const withReveal = (p: SyncPayload, correctIndex: number): SyncPayload => ({
  ...p,
  reveal: {
    slot: p.session.questionIndex,
    correctIndex,
    explanation: QUESTION_BANK[p.session.questionIndex]!.explanation,
    numberLine: QUESTION_BANK[p.session.questionIndex]!.numberLine ?? null,
  },
});

/* 9. no session at all */
out.push(
  grab('── Preview: no session ──', () => renderToStaticMarkup(<QuestionPreview data={null} />)),
);

/* 10. lobby — waiting for the teacher to press start */
out.push(
  grab('── Preview: lobby ──', () =>
    renderToStaticMarkup(<QuestionPreview data={payload('lobby', { questionIndex: -1 }, -1)} />),
  ),
);

/* 11. live round — mirror of the student card, countdown running */
out.push(
  grab('── Preview: question ──', () => renderToStaticMarkup(<QuestionPreview data={payload('question')} />)),
);

/* 12. round closed — correct option plus the explanation underneath */
out.push(
  grab('── Preview: reveal ──', () =>
    renderToStaticMarkup(<QuestionPreview data={withReveal(payload('reveal'), 0)} />),
  ),
);

/* 13. finished */
out.push(
  grab('── Preview: finished ──', () =>
    renderToStaticMarkup(<QuestionPreview data={payload('finished', { questionIndex: -1 }, -1)} />),
  ),
);

const html = out.join('\n\n');
console.log(html.length > 3000 ? `${html.slice(0, 1500)}\n\n… [truncated] …\n\n${html.slice(-1500)}` : html);

/* sanity assertions */
const checks: [string, boolean][] = [
  ['curve paths drawn', html.includes('class="cv" pathLength="1"')],
  ['dashed reference curve kept undrawn', html.includes('stroke-dasharray="0.02 0.015"')],
  ['no raw { } braces leaked into a maths chip', !/<b class="m">\{/.test(html)],
  ['superscript rendered', html.includes('<sup>٢</sup>')],
  ['stacked fraction rendered', html.includes('<span class="fr"><i>')],
  ['radical rendered', html.includes('√<span class="rc">')],
  ['minus sign normalised to U+2212', html.includes('−') && !html.includes('<b class="m">-')],
  ['axes labelled س / ص', html.includes('>س<') && html.includes('>ص<')],
  ['arabic-indic digits on ticks', /<text[^>]*>[٠-٩]/.test(html)],
  ['option letters rendered', html.includes('>أ<') && html.includes('>ب<')],
  ['correct option marked ok', html.includes('class="op ok"')],
  ['wrong option marked no', html.includes('class="op no"')],
  ['other options locked (answer never leaks early)', html.includes('class="op locked"')],
  ['timed-out notice present', html.includes('راحت عليك')],
  ['number line rendered', html.includes('class="nl ')],
  ['horizontal guide line drawn', html.includes('stroke-dasharray="5 4"')],
  ['countdown rendered', html.includes('class="timer')],
  ['open (hollow) markers drawn', html.includes('fill="#fff" stroke="#d6336c"')],
  /* teacher preview */
  ['preview names the student screen', html.includes('شاشة الطلاب الآن')],
  ['preview is labelled read-only', html.includes('محاكاة للعرض فقط')],
  ['preview options are all disabled (teacher cannot answer)', /class="op in"[^>]*disabled=""/.test(html)],
  ['preview asks the teacher to start', html.includes('اضغط «ابدأ اللعبة»')],
  [
    'preview carries its own countdown',
    (html.split('الوقت المتبقي').length - 1) >= 3,
  ],
  ['preview reveals the correct option', html.includes('class="op ok"')],
  ['preview prints the explanation under the question', html.includes('— الحل</h3>')],
  [
    'preview prints the explanation body',
    html.includes(fmtLine(QUESTION_BANK[10]!.explanation).replace(/<[^>]+>/g, '').slice(0, 18)),
  ],
];
console.log('\n── checks ──');
let bad = 0;
for (const [name, ok] of checks) {
  if (!ok) bad++;
  console.log(`${ok ? '✔' : '✖'} ${name}`);
}
console.log(bad ? `\n${bad} check(s) failed` : '\nall checks passed');
process.exit(bad ? 1 : 0);