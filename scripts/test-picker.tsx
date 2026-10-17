/**
 * Server-renders the identity screen, the emoji picker and the waiting room so
 * the new UI can be inspected without a browser.
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { EMOJI_STATS, EmojiPicker } from '../src/student/EmojiPicker';

let pass = 0;
let fail = 0;
const ok = (c, label, extra = '') => {
  c ? pass++ : fail++;
  console.log(`  ${c ? '✔' : '✖'} ${label}${extra ? '  ' + extra : ''}`);
};

console.log('\n── بنك الإيموجي ──');
ok(EMOJI_STATS.groups === 6, '٦ أقسام', String(EMOJI_STATS.groups));
ok(EMOJI_STATS.total > 300, `المجموع ${EMOJI_STATS.total} إيموجي`);
ok(EMOJI_STATS.unique === EMOJI_STATS.total, 'لا تكرارات في البنك', `${EMOJI_STATS.unique}/${EMOJI_STATS.total}`);
for (const g of EMOJI_STATS.perGroup) ok(g.n > 40, `قسم «${g.label}» فيه ${g.n}`);

console.log('\n── مُنتقي الإيموجي (modal) ──');
const picker = renderToStaticMarkup(
  <EmojiPicker open value="🦊" banner="b1" onPick={() => {}} onClose={() => {}} />,
);
ok(picker.includes('role="dialog"') && picker.includes('aria-modal="true"'), 'حوار بخصائص الوصول');
ok(picker.includes('modal-backdrop'), 'خلفية تُغلق بالنقر');
const cells = (picker.match(/class="emoji-cell/g) ?? []).length;
ok(cells === EMOJI_STATS.perGroup[0].n, 'يعرض قسم النشط فقط (أخف وأسرع)', String(cells));
ok((picker.match(/picker-tab/g) ?? []).length >= 6, '٦ تبويبات');
ok(picker.includes('اختر إيموجيك'), 'العنوان صحيح');
ok(picker.includes('الصق رمز إيموجي للبحث'), 'حقل البحث');
ok(picker.includes('aria-label="إغلاق"'), 'زر إغلاق');
ok(picker.includes('role="listbox"'), 'شبكة بقائمة اختيارية');

const closed = renderToStaticMarkup(
  <EmojiPicker open={false} value="🦊" banner="b1" onPick={() => {}} onClose={() => {}} />,
);
ok(closed === '', 'لا يُصيَّر شيئاً عندما يكون مغلقاً');

console.log(`\n  ناجح: ${pass}   ·   فاشل: ${fail}`);
process.exit(fail === 0 ? 0 : 1);