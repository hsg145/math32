/**
 * Confirms the *database* (not just the source bank) matches the original HTML
 * file — figures, options, answer keys and explanations.
 *
 *   node scripts/verify-db.mjs
 */
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { loadQuestionBank } from './_bank.mjs';

const env = {};
for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const admin = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const { QUESTION_BANK } = await loadQuestionBank();
const { data } = await admin
  .from('questions')
  .select('body, options, correct_index, explanation, figure, number_line, lesson, is_active')
  .order('position');

let pass = 0;
let fail = 0;
const ok = (c, label, extra = '') => {
  if (c) pass++;
  else fail++;
  console.log(`  ${c ? '✔' : '✖'} ${label}${extra ? '  ' + extra : ''}`);
  return c;
};

/** Postgres jsonb reorders object keys, so compare canonically. */
const canon = (v) => {
  if (Array.isArray(v)) return `[${v.map(canon).join(',')}]`;
  if (v && typeof v === 'object') {
    return `{${Object.keys(v)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canon(v[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(v);
};

console.log(`\n══ القاعدة مقابل الملف الأصلي (${data?.length ?? 0} سؤالاً) ══\n`);

const dbByBody = new Map((data ?? []).map((r) => [r.body, r]));

for (const q of QUESTION_BANK) {
  const i = QUESTION_BANK.indexOf(q);
  const tag = `#${String(i).padStart(2, '0')}`;
  const r = dbByBody.get(q.body);
  if (!ok(!!r, `${tag} موجود`)) continue;

  ok(r.correct_index === q.correctIndex, `${tag} الإجابة`, `${r.correct_index} vs ${q.correctIndex}`);
  ok(r.explanation === q.explanation, `${tag} الشرح`);
  ok(r.lesson === q.lesson, `${tag} الدرس`);

  const wantOpts = q.options.map((o) => (o.kind === 'text' ? o.text : '[figure]'));
  const gotOpts = (r.options ?? []).map((o) => (o?.kind === 'text' ? o.text : '[figure]'));
  ok(JSON.stringify(wantOpts) === JSON.stringify(gotOpts), `${tag} الخيارات`, JSON.stringify(gotOpts).slice(0, 70));

  ok(
    canon(q.figure ?? null) === canon(r.figure ?? null),
    `${tag} الرسم البياني`,
    canon(r.figure ?? null) === canon(q.figure ?? null)
      ? ''
      : `عندنا ${canon(q.figure?.curves ?? q.figure?.points ?? null).slice(0, 100)}`,
  );
  ok(
    canon(q.numberLine ?? null) === canon(r.number_line ?? null),
    `${tag} خط الأعداد`,
  );
}

console.log(`\n  ناجح: ${pass}   ·   فاشل: ${fail}`);
process.exit(fail === 0 ? 0 : 1);