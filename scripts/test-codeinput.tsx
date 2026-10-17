/**
 * Server-renders the join screen and the segmented code input so the markup
 * (and the auto-hyphen formatting) can be inspected without a browser.
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { CodeInput, extractCode, filled, withHyphen, cleanCode } from '../src/student/CodeInput';

let pass = 0;
let fail = 0;
const ok = (c, label, extra = '') => {
  c ? pass++ : fail++;
  console.log(`  ${c ? '✔' : '✖'} ${label}${extra ? '  ' + extra : ''}`);
};

console.log('\n── تنسيق الكود ──');
ok(withHyphen('ABC') === 'ABC', '٣ خانات فقط بلا شرطة');
ok(withHyphen('ABCDEF') === 'ABC-DEF', '٦ خانات → ABC-DEF');
ok(withHyphen('ABCDEFGH').slice(0, 7) === 'ABC-DEF', 'النمو الزائد يُقتطع');
ok(cleanCode('gkj-fbr') === 'GKJFBR', 'تحويل لحروف كبيرة + إزالة الشرطة');
ok(filled('ABCDEF') === 6 && filled('ABC') === 3, 'عدّ الخانات المملوءة');

console.log('\n── لصق ──');
ok(extractCode('https://site.com/#/j/GKJ-FBR') === 'GKJFBR', 'من رابط #/j/');
ok(extractCode('https://site.com/?code=GKJ-FBR') === 'GKJFBR', 'من رابط ?code=');
ok(extractCode('gkj fbr') === 'GKJFBR', 'من نصّ فيه مسافة');
ok(extractCode('لا يوجد كود هنا') === '', 'نصّ بلا كود → فارغ');

console.log('\n── الواجهة ──');
const html = renderToStaticMarkup(
  <CodeInput value={'GKJ'} onChange={() => {}} />,
);
const cells = html.match(/class="code-cell/g) ?? [];
const low = html.toLowerCase();
ok(cells.length === 6, '٦ خانات مُصيَّرة', String(cells.length));
ok(html.includes('code-dash'), 'الشرطة المنقّطة ظاهرة بين المجموعتين');
ok((low.match(/maxlength="1"/g) ?? []).length === 6, 'كل خانة حرف واحد فقط');
ok(html.includes('dir="ltr"'), 'الاتجاه LTR للكود');
ok(html.includes('aria-label="الحرف 3 من 6"'), 'aria-label لكل خانة');
ok(low.includes('autocomplete="one-time-code"'), 'دعم لصق رمز التحقق من المتصفح');
ok(low.includes('inputmode="text"'), 'inputMode مضبوط للهاتف');
ok(html.includes('الحرف 4 من 6') && html.includes('الحرف 6 من 6'), 'ترقيم الخانات ١..٦');

const filledHtml = renderToStaticMarkup(<CodeInput value={'GKJFBR'} onChange={() => {}} />);
ok((filledHtml.match(/code-cell on/g) ?? []).length === 6, 'كل الخانات ممتلئة = active');

console.log(`\n  ناجح: ${pass}   ·   فاشل: ${fail}`);
process.exit(fail === 0 ? 0 : 1);