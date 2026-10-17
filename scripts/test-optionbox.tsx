/**
 * Guards the two option-box defects that the original stylesheet carried and
 * that verify:port could never catch (it only diffs text and SVG paths):
 *
 *   1. an option painted in --card is invisible on the white card
 *   2. `.op b` used to match every <b class="m"> maths chip, squeezing each
 *      formula into a 34×34 navy circle so the text escaped the option frame
 *
 *   npm run test:optionbox
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';

const CSS_CANDIDATES = [
  resolve(process.cwd(), 'src/styles/global.css'),
  'src/styles/global.css',
];
const cssPath = CSS_CANDIDATES.find((p) => existsSync(p));
if (!cssPath) {
  console.error('? لم يُعثر على src/styles/global.css');
  process.exit(1);
}
const css = readFileSync(cssPath, 'utf8');

/* the body of one rule, e.g. rule('.op {') → "…" */
function rule(selector: string): string {
  const i = css.indexOf(selector);
  if (i < 0) return '';
  const open = css.indexOf('{', i);
  const close = css.indexOf('}', open);
  return css.slice(open + 1, close);
}

/* every value assigned to a custom property anywhere in the sheet */
function tokens(name: string): string[] {
  const out: string[] = [];
  const re = new RegExp(`${name}\\s*:\\s*([^;}]+)`, 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(css))) out.push(m[1]!.trim());
  return out;
}

const op = rule('.op {');
const opHover = rule('.op:hover:not(:disabled) {');
const grid = rule('.ops.gr {');
const rootVars = rule(':root {');
const darkBlocks = css.match(/--card:\s*([^;}]+)/g) ?? [];

const checks: [string, boolean][] = [
  /* ── 1. the option must not share the card's fill ─────────────────────── */
  ['option fill is not --card', /background:\s*var\(--opt\)/.test(op)],
  ['an --opt token exists in :root', /--opt\s*:/.test(rootVars)],
  ['--opt differs from --card', !/--opt\s*:\s*[^;]*\bvar\(--card\)/.test(css)],
  ['dark theme also overrides --opt', (css.match(/--opt\s*:/g) ?? []).length >= 3],
  ['hover uses its own token, not --gl', /background:\s*var\(--opt-h\)/.test(opHover)],
  ['--opt-h differs from --opt', !/--opt-h\s*:\s*var\(--opt\)/.test(css)],

  /* ── 2. the letter badge must not capture the maths chips ─────────────── */
  ['badge rule is scoped to the direct child', /\.op\s*>\s*b\s*\{/.test(css)],
  ['no unscoped `.op b {` rule remains', !/\.op\s+b\s*\{/.test(css)],
  ['no unscoped `.op.ok b` / `.op.no b` rule remains', !/\.op\.(ok|no)\s+b\s*\{/.test(css)],
  ['badge sets the 34px circle', /width:\s*34px/.test(rule('.op > b {')) && /border-radius:\s*50%/.test(rule('.op > b {'))],
  ['option text wrapper keeps min-width:0', /min-width:\s*0/.test(rule('.op > span {'))],

  /* ── 3. long text stays inside the frame ──────────────────────────────── */
  ['options wrap long words', /overflow-wrap:\s*anywhere/.test(op)],
  ['maths chips may wrap inside an option', /\.op\s+\.m\s*\{[\s\S]*?overflow-wrap/.test(css)],
  ['figure grid columns cannot blow out', /minmax\(0,\s*1fr\)/.test(grid)],
  ['no bare `1fr 1fr` grid columns left', !/grid-template-columns:\s*1fr\s+1fr/.test(css)],
];

console.log('── option box contract ──');
let bad = 0;
for (const [name, ok] of checks) {
  if (!ok) bad++;
  console.log(`${ok ? '✔' : '✖'} ${name}`);
}

console.log(`\n  --card declared ${darkBlocks.length}× · --opt declared ${(css.match(/--opt\s*:/g) ?? []).length}×`);
console.log(bad ? `\n  ${bad} check(s) failed` : '\n  all checks passed');
void dirname;
process.exit(bad ? 1 : 0);
