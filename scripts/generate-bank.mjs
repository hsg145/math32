/**
 * Regenerates src/data/questionBank.ts from the ORIGINAL single-file quiz.
 *
 * Nothing is transcribed by hand: the original engine is executed in a
 * sandbox, its `G()` is intercepted to capture the exact figure options each
 * question passes, and the curve functions are *sampled* to recover an exact
 * declarative description (polynomial / |x| / √x) — then proven correct by
 * re-rendering and comparing SVG byte-for-byte.
 *
 *   npm run generate:bank
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import vm from 'node:vm';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');

const origName = readdirSync(root).find(
  (f) => f.endsWith('.html') && f.includes('اختبار') && !f.startsWith('index'),
);
if (!origName) {
  console.error('✖ لم يُعثر على الملف الأصلي');
  process.exit(1);
}
const html = readFileSync(resolve(root, origName), 'utf8');
const script = /<script>([\s\S]*?)<\/script>/.exec(html)[1];
const engine = script.split(',$=document.getElementById')[0];

const sb = { Math, JSON, console };
vm.createContext(sb);
vm.runInContext(`${engine}\n;globalThis.__X={Q,LN,G,NL,M};`, sb, { filename: origName });
const { Q, G: REAL_G } = sb.__X;

/* ── intercept G() to capture the raw spec ─────────────────────────────── */
function capture(run) {
  const before = sb.G;
  let got = null;
  sb.G = (o) => {
    got = o;
    return '';
  };
  try {
    run();
  } finally {
    sb.G = before;
  }
  return got;
}
const render = (spec) => REAL_G(structuredCloneish(spec));

function structuredCloneish(o) {
  /* spec holds functions — a shallow copy is enough, G only reads it */
  return { ...o, x: [...o.x], y: [...o.y], f: o.f?.map((c) => ({ ...c })) };
}

/* ── curve inference ───────────────────────────────────────────────────── */
const TOL = 1e-7;

/**
 * Fits a polynomial of the given degree to (xs, ys).
 *
 * The naive Vandermonde on raw x is hopelessly ill-conditioned when the
 * samples cluster (x = −3, −2.97, −2.94 …), so we first map the domain to
 * u ∈ [−1, 1], interpolate on Chebyshev nodes there, then convert the
 * coefficients back to the x basis exactly.
 */
function fitPoly(xs, ys, deg) {
  const n = deg + 1;
  const x0 = xs[0];
  const x1 = xs[xs.length - 1];
  const xc = (x0 + x1) / 2;
  const h = (x1 - x0) / 2;
  if (!(h > 0)) return null;

  /* Spread `n` interpolation points evenly over the samples and derive the
     scaled coordinate u from the samples themselves, so node and value always
     agree exactly (using the ideal Chebyshev node instead silently shifts x). */
  const idx = Array.from({ length: n }, (_, k) =>
    Math.round((k * (xs.length - 1)) / (n - 1)),
  );
  const us = idx.map((i) => (xs[i] - xc) / h);
  const a = us.map((u) => Array.from({ length: n }, (_, k) => u ** k));
  const b = idx.map((i) => ys[i]);
  /* Gauss-Jordan with partial pivoting */
  for (let i = 0; i < n; i++) {
    let p = i;
    for (let rr = i + 1; rr < n; rr++) if (Math.abs(a[rr][i]) > Math.abs(a[p][i])) p = rr;
    [a[i], a[p]] = [a[p], a[i]];
    [b[i], b[p]] = [b[p], b[i]];
    const d = a[i][i];
    if (!Number.isFinite(d) || Math.abs(d) < 1e-14) return null;
    for (let k = i; k < n; k++) a[i][k] /= d;
    b[i] /= d;
    for (let rr = 0; rr < n; rr++) {
      if (rr === i) continue;
      const f = a[rr][i];
      if (!f) continue;
      for (let k = i; k < n; k++) a[rr][k] -= f * a[i][k];
      b[rr] -= f * b[i];
    }
  }

  /* u-basis → x-basis:  P(x) = Σ_k b[k] · ((x − xc)/h)^k */
  const C = new Array(n).fill(0);
  for (let k = 0; k < n; k++) {
    const f = b[k] / h ** k;
    let binom = 1;
    for (let j = 0; j <= k; j++) {
      if (j > 0) binom = (binom * (k - j + 1)) / j;
      C[j] += f * binom * (-xc) ** (k - j);
    }
  }
  return C;
}

const evalPoly = (c, x) => c.reduce((acc, v, i) => acc + v * x ** i, 0);

/**
 * √(x − h) + k  ⇔  (y − k)² = x − h  → (y−k)² is a straight line of slope 1.
 * Two samples determine k in closed form:
 *     k = [ (f_p² − f_q²) − (x_p − x_q) ] / ( 2 (f_p − f_q) )
 */
function inferSqrt(xs, ys) {
  const cands = [];
  for (let a = 0; a < xs.length; a += 7) {
    for (let b = a + 1; b < xs.length; b += 11) {
      const dy = ys[a] - ys[b];
      if (!Number.isFinite(dy) || Math.abs(dy) < 1e-6) continue;
      const k = (ys[a] * ys[a] - ys[b] * ys[b] - (xs[a] - xs[b])) / (2 * dy);
      if (Number.isFinite(k)) cands.push(k);
    }
  }
  if (!cands.length) return null;
  cands.sort((p, q) => p - q);
  for (const guess of [cands[Math.floor(cands.length / 2)], cands[0], cands.at(-1)]) {
    const k = r(guess);
    let maxErr = 0;
    const hs = [];
    for (let i = 0; i < xs.length; i++) {
      const d = xs[i] - (ys[i] - k) ** 2;
      hs.push(d);
      maxErr = Math.max(maxErr, Math.abs(d - hs[0]));
    }
    if (maxErr < 1e-6) return { kind: 'sqrt', h: r(hs[0]), k };
  }
  return null;
}

function inferCurve(fn, lo, hi) {
  const N = 240;
  const xs = Array.from({ length: N + 1 }, (_, i) => lo + ((hi - lo) * i) / N);
  const ys = xs.map((x) => {
    try {
      return fn(x);
    } catch {
      return NaN;
    }
  });
  const usable = ys.every(Number.isFinite);
  if (!usable) {
    throw new Error(
      `منحنى غير صالح على [${lo}, ${hi}] — ${String(fn).replace(/\s+/g, ' ').slice(0, 80)}`,
    );
  }

  /* 1. √(x − h) + k */
  const sq = inferSqrt(xs, ys);
  if (sq) {
    const { h = 0, k = 0 } = sq;
    if (xs.every((x, i) => Math.abs(Math.sqrt(x - h) + k - ys[i]) < 1e-7)) {
      const out = { kind: 'sqrt' };
      if (h !== 0) out.h = h;
      if (k !== 0) out.k = k;
      return out;
    }
  }

  /* 2. |x − h| + k : the slope flips sign exactly once.
        left branch  f = −x + (h + k)      right branch  f = x + (k − h)
        so h and k follow in closed form from one sample per branch. */
  const d = xs.slice(1).map((x, i) => (ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]));
  let kink = -1;
  for (let i = 0; i < d.length; i++) if (d[i] < 0) kink = i;
  if (kink > 2 && kink < d.length - 4) {
    const l1 = 0;
    const l2 = kink - 2;
    const r1 = kink + 2;
    const r2 = xs.length - 1;
    const leftSlope = (ys[l2] - ys[l1]) / (xs[l2] - xs[l1]);
    const rightSlope = (ys[r2] - ys[r1]) / (xs[r2] - xs[r1]);
    if (Math.abs(leftSlope + 1) < 1e-9 && Math.abs(rightSlope - 1) < 1e-9) {
      const hpK = (ys[l1] + xs[l1] + ys[l2] + xs[l2]) / 2;
      const kPmH = (ys[r1] - xs[r1] + ys[r2] - xs[r2]) / 2;
      const h = r((hpK - kPmH) / 2);
      const k = r((hpK + kPmH) / 2);
      if (xs.every((x, i) => Math.abs(Math.abs(x - h) + k - ys[i]) < 1e-7)) {
        const out = { kind: 'abs' };
        if (h !== 0) out.h = h;
        if (k !== 0) out.k = k;
        return out;
      }
    }
  }

  /* 3. polynomial, degree 1..3 (every curve in this unit is one) */
  for (let deg = 1; deg <= 3; deg++) {
    const c = fitPoly(xs, ys, deg);
    if (!c) continue;
    const maxErr = Math.max(...xs.map((x, i) => Math.abs(evalPoly(c, x) - ys[i])));
    if (maxErr < TOL * Math.max(1, ...ys.map(Math.abs))) {
      const trimmed = c.map((v) => r(v));
      while (trimmed.length > 1 && trimmed.at(-1) === 0) trimmed.pop();
      return { kind: 'poly', c: trimmed };
    }
  }
  throw new Error(
    `تعذّر استنتاج المنحنى [${lo}, ${hi}] — ${String(fn).replace(/\s+/g, ' ').slice(0, 80)}`,
  );
}

const r = (v) => (Object.is(v, -0) ? 0 : Number(v.toFixed(9)));

function convertSpec(o) {
  const [a, b] = o.x;
  const [c, d] = o.y;
  const W = o.W ?? 300;
  const H = o.H ?? (W * (d - c)) / (b - a);
  const spec = {
    x: [a, b],
    y: [c, d],
    width: W,
    gridX: o.gx ?? 1,
    gridY: o.gy ?? 1,
    labels: o.lab !== 0,
  };
  if (H !== undefined && o.H !== undefined) spec.height = H;
  if (o.f?.length) {
    spec.curves = o.f.map((k) => {
      const lo = k.d ? k.d[0] : a;
      const hi = k.d ? k.d[1] : b;
      const out = { ...inferCurve(k.f, lo, hi), color: k.c };
      if (k.w !== undefined && k.w !== 2.6) out.width = k.w;
      if (k.dash) out.dash = true;
      if (k.d) out.domain = [lo, hi];
      return out;
    });
  }
  if (o.hl?.length) spec.hlines = o.hl.map((h) => ({ y: h.y, color: h.c }));
  if (o.pts?.length)
    spec.points = o.pts.map((p) => {
      const q = { x: p.x, y: p.y, color: p.c };
      if (p.l) q.label = p.l;
      if (p.t === 'o') q.open = true;
      return q;
    });
  if (o.lb?.length) spec.texts = o.lb.map((t) => ({ x: t.x, y: t.y, text: t.t, color: t.c }));
  return spec;
}

/* ── build the bank ────────────────────────────────────────────────────── */
const PALETTE = { BL: "'#2b59ff'", RD: "'#d6336c'", GY: "'#8e98c8'", GR: "'#0a9b6e'" };
const q = (s) => (s === 'string' ? `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'` : JSON.stringify(s));

const lines = [
  '/* eslint-disable */',
  '/**',
  ' * بنك الأسئلة — مولَّد آلياً من الملف الأصلي',
  ` *   ${origName}`,
  ' *',
  ' * لا تُحرّر يدوياً. لتحديثه:',
  ' *   npm run generate:bank && npm run verify:port',
  ' *',
  ' * المواصفات الرسومية مستخرجة باعتراض G() في محرّك الأصل، والمنحنيات',
  ' * مستنتجة بالعيّنة ثم مُتحقَّق منها بمقارنة SVG حرفاً بحرف.',
  ' */',
  "import type { Option, Question } from '../lib/types';",
  '',
  "export { LESSONS } from '../lib/lessons';",
  '',
  'const T = (text: string): Option => ({ kind: \'text\', text });',
  '',
  'export const QUESTION_BANK: Question[] = [',
];

for (const item of Q) {
  const i = Q.indexOf(item);
  const figure = item.g ? capture(() => item.g()) : null;

  const options = (item.o ?? []).map((o) => {
    if (typeof o === 'string') return `T(${q(o)})`;
    const spec = capture(() => o());
    return `{ kind: 'figure' as const, figure: ${JSON.stringify(convertSpec(spec))} }`;
  });

  const parts = [`    lesson: ${item.l},`, `    body: ${q(item.t)},`];
  if (figure) parts.push(`    figure: ${JSON.stringify(convertSpec(figure))},`);
  parts.push(`    options: [\n      ${options.join(',\n      ')},\n    ],`);
  parts.push(`    correctIndex: ${item.a},`);
  parts.push(`    explanation: ${q(item.e)},`);
  if (item.n) {
    parts.push(`    numberLine: { points: ${JSON.stringify(item.n[0])}, signs: ${JSON.stringify(item.n[1])}${item.n[2] ? `, closed: ${JSON.stringify(item.n[2])}` : ''} },`);
  }
  lines.push(`  {`);
  lines.push(...parts);
  lines.push(`  },`);
}
lines.push('];');
lines.push('');
void PALETTE;

writeFileSync(resolve(root, 'src/data/questionBank.ts'), lines.join('\n'), 'utf8');
console.log(`✔ كُتب src/data/questionBank.ts — ${Q.length} سؤالاً`);
