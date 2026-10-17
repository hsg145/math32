/**
 * The avatar once rendered as an ellipse: its size came from a CSS custom
 * property, so any flex/grid context could collapse `width/height` back to
 * `auto` (content size) and squash the 50 % border-radius.
 *
 * The component now emits the pixel size inline, and the stylesheet clamps it
 * with min and max bounds. This test locks that contract in.
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { Avatar, BANNERS, avatarStyle } from '../src/lib/ui';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

/* esbuild bundles this to CJS, so resolve the stylesheet from disk directly */
const CSS_CANDIDATES = [
  resolve(process.cwd(), 'src/styles/global.css'),
  resolve(dirname(new URL(import.meta.url ?? 'file:///scripts/').pathname.replace(/^\/([A-Za-z]:)/, '$1')), '../src/styles/global.css'),
  'src/styles/global.css',
];
const cssPath = CSS_CANDIDATES.find((p) => existsSync(p));
if (!cssPath) {
  console.error('✖ لم يُعثر على src/styles/global.css');
  process.exit(1);
}
const css = readFileSync(cssPath, 'utf8');

let pass = 0;
let fail = 0;
const ok = (c, label, extra = '') => {
  c ? pass++ : fail++;
  console.log(`  ${c ? '✔' : '✖'} ${label}${extra ? '  ' + extra : ''}`);
};

const html = (p: React.ComponentProps<typeof Avatar>) => renderToStaticMarkup(<Avatar {...p} />);

console.log('\n── sizes are emitted inline ──');
for (const [size, px] of [
  [undefined, 46],
  ['sm', 46],
  ['md', 60],
  ['lg', 86],
  ['xl', 132],
] as const) {
  const h = html({ emoji: '🦊', banner: 'b0', size });
  ok(
    h.includes(`width:${px}`) &&
      h.includes(`height:${px}`) &&
      h.includes(`min-width:${px}`) &&
      h.includes(`min-height:${px}`) &&
      h.includes(`max-width:${px}`) &&
      h.includes(`max-height:${px}`),
    `الحجم ${size ?? 'افتراضي'} = ${px}px مقفل inline`,
  );
  ok(h.includes(`--s:${px}px`), `المتغيّر --s = ${px}px`);
}

console.log('\n── structural ──');
const lg = html({ emoji: '🦊', banner: 'b1', size: 'lg', ring: true });
ok(lg.includes('class="ava ring"'), 'فئة ring تعمل بلا فئات حجم');
ok(!/class="ava (lg|xl|sm|md)/.test(lg), 'لا فئات حجم ميتة');
ok(lg.includes('background-image:linear-gradient(135deg'), 'البانر (التدرّج) يعمل');
ok(lg.includes('ava-in') && lg.includes('ava-glyph'), 'البنية الداخلية نظيفة');
ok(html({ emoji: '🦊', banner: 'b0', name: 'أنت' }).includes('class="name"'), 'الاسم داخل الأفاتار');
ok(html({ emoji: '🦊', banner: 'b0', pulse: true }).includes('animation:pulse'), 'نبض اختياري');
ok(!html({ emoji: '🦊', banner: 'b0' }).includes('animation'), 'لا نبض افتراضياً');

console.log('\n── banners ──');
ok(BANNERS.length === 8, `${BANNERS.length} بانرات`);
ok(avatarStyle('b0').backgroundImage.includes('gradient'), 'بانر غير معروف يعود للأول');
ok(BANNERS.every((b) => /^#[0-9a-f]{6}$/i.test(b.from) && /^#[0-9a-f]{6}$/i.test(b.to)), 'ألوان البانرات صالحة');

console.log('\n── stylesheet contract ──');
const block = /\.ava\s*\{([\s\S]*?)\n\}/.exec(css)?.[1] ?? '';
for (const prop of ['aspect-ratio', 'min-width', 'min-height', 'max-width', 'max-height', 'flex: 0 0 auto', 'border-radius: 50%', 'place-items: center']) {
  ok(block.includes(prop), `.ava يضمن ${prop}`);
}
ok(!/^\s*\.ava\.(lg|xl|sm|md)\s*\{/m.test(css), 'لا فئات حجم في CSS (الحجم من المكوّن)');

console.log(`\n  ناجح: ${pass}   ·   فاشل: ${fail}`);
process.exit(fail === 0 ? 0 : 1);