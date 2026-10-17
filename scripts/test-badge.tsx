/**
 * Guards two regressions that verify:port cannot see (it diffs text and SVG
 * paths, never CSS layout):
 *
 *   1. the round Badge was `display: grid`, a block-level box, so the
 *      parent's `text-align: center` did nothing and "أنهى الجميع الإجابة!"
 *      parked its icon in the RTL inline-start corner
 *   2. the teacher's ranking was capped at 15 seats, so the bottom of the
 *      class never appeared
 *
 *   npm run render:check
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (p: string[]): string => {
  const hit = p.find((x) => existsSync(x));
  return hit ? readFileSync(hit, 'utf8') : '';
};

const css = read([resolve(process.cwd(), 'src/styles/global.css'), 'src/styles/global.css']);
const ui = read([resolve(process.cwd(), 'src/lib/ui.tsx'), 'src/lib/ui.tsx']);
const board = read([
  resolve(process.cwd(), 'src/admin/RankingBoard.tsx'),
  'src/admin/RankingBoard.tsx',
]);
const control = read([
  resolve(process.cwd(), 'src/admin/ControlPanel.tsx'),
  'src/admin/ControlPanel.tsx',
]);
const preview = read([
  resolve(process.cwd(), 'src/admin/QuestionPreview.tsx'),
  'src/admin/QuestionPreview.tsx',
]);

function rule(selector: string): string {
  const i = css.indexOf(selector);
  if (i < 0) return '';
  const open = css.indexOf('{', i);
  const close = css.indexOf('}', open);
  return css.slice(open + 1, close);
}

const badge = ui.slice(ui.indexOf('export function Badge'), ui.indexOf('export function StatusChip'));

const checks: [string, boolean][] = [
  /* ── badge centring ──────────────────────────────────────────────────── */
  ['Badge renders as inline-grid', /display:\s*'inline-grid'/.test(badge)],
  ['Badge is not block-level grid again', !/display:\s*'grid'/.test(badge)],
  ['Badge keeps place-items: center', /placeItems:\s*'center'/.test(badge)],
  ['Badge still shrinks as a flex item', /flex:\s*'none'/.test(badge)],

  /* ── full ranking ────────────────────────────────────────────────────── */
  ['ranking is no longer capped at 15', !/slice\(0,\s*15\)/.test(board)],
  ['the "N more students" note is gone', !/طالباً آخر/.test(board)],
  ['every seat is mapped', /\.map\(\(r, i\)\s*=>/.test(board) && !/\.slice\(/.test(board)],
  ['the last student is called out', /rows\[rows\.length\s*-\s*1\]/.test(board)],
  ['the class size is shown', /\$\{ar\(rows\.length\)\}\s*طالب/.test(board)],
  ['the live tab shows the ranking', /<RankingBoard\s+data=\{data\}/.test(control)],
  ['the student-screen tab shows it too', /<RankingBoard\s+data=\{data\}/.test(preview)],

  /* ── the scroll container ────────────────────────────────────────────── */
  ['.lb-scroll exists', /\.lb-scroll\s*\{/.test(css)],
  ['.lb-scroll caps its height', /max-height/.test(rule('.lb-scroll {'))],
  ['.lb-scroll scrolls vertically', /overflow-y:\s*auto/.test(rule('.lb-scroll {'))],
  ['.lb-scroll contains overscroll', /overscroll-behavior/.test(rule('.lb-scroll {'))],
];

console.log('── badge + ranking contract ──');
let bad = 0;
for (const [name, ok] of checks) {
  if (!ok) bad++;
  console.log(`${ok ? '✔' : '✖'} ${name}`);
}
console.log(bad ? `\n  ${bad} check(s) failed` : '\n  all checks passed');
process.exit(bad ? 1 : 0);
