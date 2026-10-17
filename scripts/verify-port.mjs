/**
 * Fidelity harness — runs the ORIGINAL single-file quiz in a sandbox and
 * compares its output with ours, down to the last path command.
 *
 *   npm run verify:port
 *
 * For every question it checks: the raw text, the answer index, the
 * explanation, the options, the sign line — and, for every figure, the
 * viewBox plus each <path d>, <circle>, <line> and <text> it emits.
 */
import { readFileSync, existsSync } from 'node:fs';
import vm from 'node:vm';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { readdirSync } from 'node:fs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');

/* the original file: pick it by pattern so the Arabic name is never a problem */
const origFile = readdirSync(root).find(
  (f) => f.endsWith('.html') && f.includes('اختبار') && !f.startsWith('index'),
);
if (!origFile) {
  console.error('✖ لم يُعثر على الملف الأصلي __اختبار …html');
  process.exit(1);
}
const ORIG = resolve(root, origFile);
console.log(`المصدر: ${origFile}`);

/* ── 1. the original engine ────────────────────────────────────────────── */
const html = readFileSync(ORIG, 'utf8');
const script = /<script>([\s\S]*?)<\/script>/.exec(html)?.[1] ?? '';
const engine = script.split(',$=document.getElementById')[0];
if (!engine.includes('const Q=[')) {
  console.error('✖ لم يُعثر على بنك الأسئلة داخل الملف الأصلي');
  process.exit(1);
}

const sandbox = { Math, JSON, console };
vm.createContext(sandbox);
vm.runInContext(`${engine}\n;globalThis.__X={Q,G,NL,M};`, sandbox, { filename: origFile });
const O = sandbox.__X;

/* The original's option entries are thunks that call G() internally, so we
   intercept G to obtain the exact spec, then render it with the real G. */
function capture(run) {
  const before = sandbox.G;
  let got = null;
  sandbox.G = (o) => {
    got = o;
    return '';
  };
  try {
    run();
  } finally {
    sandbox.G = before;
  }
  return got;
}
const realG = O.G;
const svgOf = (spec) => realG({ ...spec });

const ORIGINAL = O.Q.map((q, i) => {
  const optionSvgs = {};
  (q.o ?? []).forEach((x, k) => {
    if (typeof x === 'function') optionSvgs[k] = svgOf(capture(() => x()));
  });
  return {
    i,
    l: q.l,
    t: q.t,
    a: q.a,
    e: q.e,
    o: (q.o ?? []).map((x) => (typeof x === 'string' ? x : '[figure]')),
    n: q.n ?? null,
    bodyHtml: O.M(q.t),
    explanationHtml: O.M(q.e),
    figureSvg: q.g ? svgOf(capture(() => q.g())) : null,
    optionSvgs,
    numberLineSvg: q.n ? O.NL(q.n[0], q.n[1], q.n[2]) : null,
  };
});

/* ── 2. our side ───────────────────────────────────────────────────────── */
const bundle = resolve(here, '.port-check.cjs');
await build({
  entryPoints: [resolve(here, 'port-check.tsx')],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  outfile: bundle,
  jsx: 'automatic',
  logLevel: 'error',
});
const MINE = createRequire(import.meta.url)(bundle);

/* ── 3. compare ────────────────────────────────────────────────────────── */
let pass = 0;
const bad = [];
const ok = (c, label, extra = '') => {
  if (c) pass++;
  else bad.push(label + (extra ? `  →  ${extra}` : ''));
  return c;
};

console.log(`\n══ مقارنة ${ORIGINAL.length} سؤالاً مع الملف الأصلي ══\n`);

for (const oq of ORIGINAL) {
  const mq = MINE.QUESTION_BANK[oq.i];
  const tag = `#${String(oq.i).padStart(2, '0')}`;

  if (!ok(!!mq, `${tag} موجود في بنكنا`)) continue;

  ok(mq.body === oq.t, `${tag} نص السؤال`, diff(mq.body, oq.t));
  ok(mq.lesson === oq.l, `${tag} رقم الدرس`, `${oq.l} vs ${mq.lesson}`);
  ok(mq.correctIndex === oq.a, `${tag} الإجابة الصحيحة`, `الأصل ${oq.a} / عندنا ${mq.correctIndex}`);
  ok(mq.explanation === oq.e, `${tag} الشرح`, diff(mq.explanation, oq.e));

  ok(
    JSON.stringify(mq.options.map((o) => (o.kind === 'text' ? o.text : '[figure]'))) ===
      JSON.stringify(oq.o),
    `${tag} الخيارات`,
    JSON.stringify(oq.o) === JSON.stringify(mq.options.map((o) => (o.kind === 'text' ? o.text : '[figure]')))
      ? ''
      : `الأصل ${JSON.stringify(oq.o).slice(0, 80)} / عندنا ${JSON.stringify(mq.options).slice(0, 80)}`,
  );

  const nl = (x) => (x ? JSON.stringify({ p: x[0], s: x[1], c: x[2] ?? null }) : 'null');
  ok(
    nl(mq.numberLine ? [mq.numberLine.points, mq.numberLine.signs, mq.numberLine.closed] : null) === nl(oq.n),
    `${tag} خط الأعداد`,
    `${nl(oq.n)} vs ${nl(mq.numberLine ? [mq.numberLine.points, mq.numberLine.signs, mq.numberLine.closed] : null)}`,
  );

  ok(MINE.fmtLine(mq.body) === oq.bodyHtml, `${tag} تنسيق نص السؤال`, diff(MINE.fmtLine(mq.body), oq.bodyHtml));
  ok(MINE.fmtLine(mq.explanation) === oq.explanationHtml, `${tag} تنسيق الشرح`, diff(MINE.fmtLine(mq.explanation), oq.explanationHtml));
  for (const opt of mq.options) {
    if (opt.kind !== 'text') continue;
    const oi = mq.options.indexOf(opt);
    const src = oq.o[oi];
    if (typeof src !== 'string') continue;
    ok(MINE.fmtLine(opt.text) === O.M(src), `${tag} تنسيق الخيار ${oi}`, diff(MINE.fmtLine(opt.text), O.M(src)));
  }
  if (oq.figureSvg) {
    const cmp = compareSvg(oq.figureSvg, MINE.renderFigure(mq.figure));
    ok(cmp.ok, `${tag} الرسم البياني`, cmp.diff);
  } else {
    ok(!mq.figure, `${tag} لا رسم زائد عندنا`);
  }

  for (const [k, svg] of Object.entries(oq.optionSvgs)) {
    const opt = mq.options[Number(k)];
    const mineSvg = opt?.kind === 'figure' ? MINE.renderFigure(opt.figure) : '';
    const cmp = compareSvg(svg, mineSvg);
    ok(cmp.ok, `${tag} رسم الخيار ${k}`, cmp.diff);
  }

  if (oq.numberLineSvg) {
    const cmp = compareSvg(oq.numberLineSvg, MINE.renderNumberLine(mq.numberLine));
    ok(cmp.ok, `${tag} خط الأعداد (SVG)`, cmp.diff);
  }
}

console.log(`  ناجح: ${pass}   ·   فاشل: ${bad.length}`);
if (bad.length) {
  console.log('\n── الفروقات ──');
  for (const b of bad) console.log('  • ' + b);
}
console.log(
  bad.length === 0
    ? '\n✔ مطابقة تامة مع الملف الأصلي — النصوص والرسوم.'
    : `\n✖ ${bad.length} فرق — يجب إصلاحها.`,
);
process.exit(bad.length === 0 ? 0 : 1);

/* ── helpers ───────────────────────────────────────────────────────────── */
function diff(a = '', b = '') {
  const s = String(a ?? '');
  const t = String(b ?? '');
  if (s === t) return '';
  let i = 0;
  while (i < s.length && i < t.length && s[i] === t[i]) i++;
  return `عند ${i}: «${s.slice(i, i + 46)}» ≠ «${t.slice(i, i + 46)}»`;
}

function sig(svg) {
  if (!svg) return null;
  const all = (re) => [...String(svg).matchAll(re)].map((m) => (m[1] ?? m[0]).replace(/\s+/g, ' ').trim());
  return {
    viewBox: /viewBox="([^"]+)"/.exec(svg)?.[1] ?? '',
    rects: all(/<rect ([^>]*?)\/?>/g).filter((r) => !/\bid=/.test(r)),
    paths: all(/<path ([^>]*?)\/?>/g),
    circles: all(/<circle ([^>]*?)\/?>/g),
    lines: all(/<line ([^>]*?)\/?>/g),
    texts: all(/<text ([^>]*?)\/?>/g),
  };
}

function compareSvg(a, b) {
  const sa = sig(a);
  const sb = sig(b);
  if (!sa) return { ok: true, diff: '' };
  if (!sb) return { ok: false, diff: 'لا يُصيَّر رسم عندنا' };
  for (const k of ['viewBox', 'paths', 'circles', 'lines', 'texts']) {
    const x = JSON.stringify(sa[k]);
    const y = JSON.stringify(sb[k]);
    if (x !== y) return { ok: false, diff: `${k}: ${diff(x, y)}` };
  }
  return { ok: true, diff: '' };
}
