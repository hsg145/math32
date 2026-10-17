/**
 * End-to-end test of the live-quiz engine against the real Supabase project.
 * Plays one full round the way the browser does: teacher starts it, three
 * students join with the rotating code, two answer and one runs out of time,
 * the round closes, points + standings are verified, then the session is
 * removed again.
 *
 *   npm run test:e2e
 */
import { readFileSync, existsSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

function loadEnv(file = '.env.local') {
  if (!existsSync(file)) return {};
  const out = {};
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
    if (!m) continue;
    out[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return out;
}
const env = { ...loadEnv(), ...process.env };
const U = env.VITE_SUPABASE_URL;
const PUB = env.VITE_SUPABASE_ANON_KEY;
const SR = env.SUPABASE_SERVICE_ROLE_KEY ?? env.SUPABASE_SECRET_KEY;

let pass = 0;
let fail = 0;
const ok = (cond, label, extra = '') => {
  if (cond) {
    pass++;
    console.log(`  ✔ ${label}${extra ? '  ' + extra : ''}`);
  } else {
    fail++;
    console.log(`  ✖ ${label}${extra ? '  ' + extra : ''}`);
  }
};
const section = (t) => console.log(`\n── ${t} ──`);

if (!U || !PUB || !SR || !env.TEACHER_PASSWORD) {
  console.error('✖ ناقص: املأ .env.local (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, TEACHER_*)');
  process.exit(1);
}

const admin = createClient(U, SR, { auth: { persistSession: false } });
const anon = createClient(U, PUB, { auth: { persistSession: false } });
const rpc = async (client, fn, args = {}) => {
  const { data, error } = await client.rpc(fn, args);
  if (error) {
    if (/gen_random_bytes|gen_random_uuid|relation .* does not exist/i.test(error.message)) {
      console.error('\n╔══════════════════════════════════════════════════════╗');
      console.error('║  قاعدة البيانات مُحدَّثة بقديم — طبّق المخطّط من جديد  ║');
      console.error('╚══════════════════════════════════════════════════════╝');
      console.error('  Supabase → SQL Editor → الصق supabase/schema.sql → Run');
      console.error('  (الملف آمن للإعادة) ثم أعد:  npm run test:e2e\n');
    }
    throw Object.assign(new Error(error.message), { rpc: fn });
  }
  return data;
};
const tryRpc = async (client, fn, args = {}) => {
  const { error } = await client.rpc(fn, args);
  return error ? error.message : null;
};

/* ── 0. questions must exist ─────────────────────────────────────────── */
section('0. بنك الأسئلة');
let qCount = 0;
{
  const { data, error } = await admin.from('questions').select('id');
  if (error) {
    console.error('✖ لا يمكن قراءة جدول questions:', error.message);
    process.exit(1);
  }
  qCount = data?.length ?? 0;
}
if (qCount === 0) {
  const { loadQuestionBank, toRow } = await import('./_bank.mjs');
  const { QUESTION_BANK } = await loadQuestionBank();
  const { error } = await admin
    .from('questions')
    .upsert(QUESTION_BANK.map((q, i) => toRow(q, i)));
  if (error) {
    console.error('✖ فشل استيراد الأسئلة:', error.message);
    process.exit(1);
  }
  qCount = QUESTION_BANK.length;
  console.log(`  · استُورد ${qCount} سؤالاً`);
}
ok(qCount >= 26, `${qCount} سؤالاً في القاعدة`);

/* ── 1. teacher signs in ─────────────────────────────────────────────── */
section('1. دخول المعلّم');
const { data: auth, error: authErr } = await anon.auth.signInWithPassword({
  email: env.TEACHER_EMAIL,
  password: env.TEACHER_PASSWORD,
});
if (authErr) {
  console.error('✖ فشل الدخول:', authErr.message);
  process.exit(1);
}
ok(!!auth.session, `جلسة معلّم: ${auth.user.email}`);

/* ── 2. session + rotating code ──────────────────────────────────────── */
section('2. إنشاء الجلسة وكود الدخول');
const sessionId = await rpc(anon, 'rpc_create_session', {
  p_title: 'E2E — اختبار تلقائي',
  p_seconds: 90,
});
ok(typeof sessionId === 'string', 'الجلسة أُنشئت', sessionId);

const codeInfo = await rpc(anon, 'rpc_active_code', { p_session: sessionId });
ok(/^[A-Z]{3}-[A-Z]{3}$/.test(codeInfo.code), 'الكود بصيغة ABC-DEF', codeInfo.code);
ok(new Date(codeInfo.expiresAt) > new Date(Date.now() + 23 * 3600e3), 'صالح ~٢٤ ساعة');

/* ── 3. students join ────────────────────────────────────────────────── */
section('3. دخول ٣ طلاب بالكود');
const students = [
  { key: 'e2e-student-key-0001', name: 'سلمى', avatar: '🦊', banner: 'b1' },
  { key: 'e2e-student-key-0002', name: 'عمر', avatar: '🚀', banner: 'b3' },
  { key: 'e2e-student-key-0003', name: 'مريم', avatar: '🐧', banner: 'b5' },
];
const joined = [];
for (const s of students) {
  const r = await rpc(anon, 'rpc_join', {
    p_code: codeInfo.code,
    p_client_key: s.key,
    p_name: s.name,
    p_avatar: s.avatar,
    p_banner: s.banner,
  });
  joined.push({ ...s, id: r?.playerId });
}
ok(joined.every((j) => typeof j.id === 'string'), 'الثلاثة دخلوا (كلهم حصلوا على مقعد)');
console.log('    ·', joined.map((j) => `${j.name}=${String(j.id).slice(0, 8)}`).join('  '));

/* rejoin with the same device key keeps the same seat */
const again = await rpc(anon, 'rpc_join', {
  p_code: codeInfo.code,
  p_client_key: students[0].key,
  p_name: 'سلمى',
  p_avatar: '🦊',
  p_banner: 'b1',
});
ok(again.playerId === joined[0].id, 'إعادة الدخول لا تُنشئ مقعداً جديداً');

/* wrong code is refused */
const badCode = await tryRpc(anon, 'rpc_join', {
  p_code: 'ZZZ-ZZZ',
  p_client_key: 'e2e-stranger-key-99',
  p_name: 'دخيل',
  p_avatar: '🙂',
  p_banner: 'b0',
});
ok(!!badCode && /الكود/.test(badCode), 'كود خاطئ يُرفض', badCode ?? '');

/* ── 4. waiting room ─────────────────────────────────────────────────── */
section('4. غرفة الانتظار');
let s0 = await rpc(anon, 'rpc_sync', { p_session: sessionId, p_client_key: students[0].key });
ok(s0.session.status === 'lobby', 'الحالة = lobby');
ok(s0.session.playerCount === 3, 'عدد الطلاب = ٣', String(s0.session.playerCount));
ok(s0.me?.name === 'سلمى', 'الطالب يرى نفسه');
ok(s0.leaderboard.length === 3, 'لوحة الترتيب فيها ٣');
ok(s0.question === null, 'لا يوجد سؤال قبل البداية');

/* ── 5. teacher starts ───────────────────────────────────────────────── */
section('5. بدء اللعبة');
await rpc(anon, 'rpc_teacher_action', { p_session: sessionId, p_action: 'start' });
s0 = await rpc(anon, 'rpc_sync', { p_session: sessionId, p_client_key: students[0].key });
ok(s0.session.status === 'question', 'الحالة = question');
ok(s0.session.questionIndex === 0, 'السؤال الأول');
ok(!!s0.question, 'نص السؤال وصل');
ok((s0.question?.options?.length ?? 0) === 4, '٤ خيارات');
ok(s0.question?.figure !== undefined, 'مُخرَج الرسم البياني وصل');

/* the answer key must not be anywhere in the payload */
const leaked = JSON.stringify(s0).match(/correct_?[Ii]ndex/i);
ok(!leaked, 'الإجابة الصحيحة غير موجودة في حمولة الطالب');

/* ── 6. answers ──────────────────────────────────────────────────────── */
section('6. الإجابات');

/* the teacher-side view of the key (students never get this) */
const correctIdx = await (async () => {
  const { data: sess } = await admin
    .from('sessions')
    .select('question_ids')
    .eq('id', sessionId)
    .single();
  const { data: q } = await admin
    .from('questions')
    .select('correct_index')
    .eq('id', sess.question_ids[0])
    .single();
  return q.correct_index;
})();

await rpc(anon, 'rpc_answer', {
  p_session: sessionId,
  p_client_key: students[0].key,
  p_slot: 0,
  p_option: correctIdx,
});
await rpc(anon, 'rpc_answer', {
  p_session: sessionId,
  p_client_key: students[1].key,
  p_slot: 0,
  p_option: (correctIdx + 1) % 4,
});
ok(true, 'طالبان أجابا (الثالث لم يجب)');

/* a student may not answer twice */
const dupe = await tryRpc(anon, 'rpc_answer', {
  p_session: sessionId,
  p_client_key: students[0].key,
  p_slot: 0,
  p_option: (correctIdx + 2) % 4,
});
ok(!dupe, 'الإجابة المكرّرة تُتجاهل بصمت (أول واحدة تُحتسب)');

/* answering a foreign session slot must fail */
const wrongSlot = await tryRpc(anon, 'rpc_answer', {
  p_session: sessionId,
  p_client_key: students[0].key,
  p_slot: 99,
  p_option: 0,
});
ok(!!wrongSlot, 'لا يمكن الإجابة على جولة غير حالية', wrongSlot ?? '');

/* ── 7. the answer cannot be settled early ───────────────────────────── */
section('7. منع الكشف المبكر');
/* must be an ANONYMOUS client — the teacher is allowed to force it */
const stranger = createClient(U, PUB, { auth: { persistSession: false } });
const early = await tryRpc(stranger, 'rpc_settle', { p_session: sessionId });
ok(!!early && /الوقت/.test(early), 'rpc_settle مرفوض قبل انتهاء الوقت', early ?? 'نجح?!');

/* …while the student's own payload still carries no key */
const stillNoKey = await (async () => {
  const s = await rpc(stranger, 'rpc_sync', { p_session: sessionId, p_client_key: students[2].key });
  return /correctIndex/i.test(JSON.stringify(s));
})();
ok(!stillNoKey, 'لا حل في حمولة الطالب أثناء الجولة');

/* …while the teacher MAY force it */
const forced = await tryRpc(anon, 'rpc_settle', { p_session: sessionId });
ok(forced === null, 'المعلّم يستطيع الكشف القسري', forced ?? '');

/* ── 8. teacher forces the reveal ────────────────────────────────────── */
section('8. كشف الحل');
await rpc(anon, 'rpc_teacher_action', { p_session: sessionId, p_action: 'skip' });
ok(true, 'المعلّم كشف الحل');

const rev = await rpc(anon, 'rpc_sync', { p_session: sessionId, p_client_key: students[0].key });
ok(rev.session.status === 'reveal', 'الحالة = reveal');
ok(rev.reveal?.correctIndex === correctIdx, 'الإجابة الصحيحة ظهرت الآن فقط', String(rev.reveal?.correctIndex));
ok(!!rev.reveal?.explanation, 'الشرح وصل');

const r0 = rev.myResults.find((r) => r.slot === 0);
ok(r0?.correct === true, 'الطالب الأول: صحيح');
ok(r0?.points >= 500 && r0?.points <= 1000, 'النقاط ضمن المجال', String(r0?.points));
ok(typeof r0?.msTaken === 'number' && r0.msTaken >= 0, 'زمن الإجابة محسوب على الخادم', `${r0?.msTaken}ms`);
ok(r0?.chosen === correctIdx, 'الخيار المُختار مسجَّل للطالب');

const s1 = await rpc(anon, 'rpc_sync', { p_session: sessionId, p_client_key: students[1].key });
const wrongRow = s1.myResults.find((r) => r.slot === 0);
ok(wrongRow?.correct === false && wrongRow?.points === 0, 'الطالب الثاني: خطأ = صفر نقاط');

const s2 = await rpc(anon, 'rpc_sync', { p_session: sessionId, p_client_key: students[2].key });
const missed = s2.myResults.find((r) => r.slot === 0);
ok(missed?.answered === false && missed?.points === 0, 'الطالب الثالث: لم يجب = صفر نقاط');

/* ── 9. standings ────────────────────────────────────────────────────── */
section('9. الترتيب');
const board = rev.leaderboard;
ok(board.length === 3, 'اللوحة فيها ٣ طلاب');
console.log(
  '    ·',
  board.map((r) => `#${r.rank} ${r.name} ${r.total_points}p ${String(r.player_id).slice(0, 8)}`).join('  |  '),
);
ok(
  board[0].player_id === joined[0].id,
  'الأول = صاحب الإجابة الصحيحة',
  `${board[0].name} / ${joined[0].name}`,
);
ok(board[0].total_points > 0 && board[1].total_points === 0, 'الفارق في النقاط واضح');
ok(
  board.every((r, i) => i === 0 || board[i - 1].total_points >= r.total_points),
  'الترتيب تنازلي',
);
ok(
  board.find((r) => r.player_id === joined[2].id)?.skipped >= 1,
  'الطالب الذي لم يجب مُسجَّل بين المتخطّين',
);

/* ── 10. teacher-only data ───────────────────────────────────────────── */
section('١٠. بيانات المعلّم الحصرية');
const detail = await rpc(anon, 'rpc_live_detail', { p_session: sessionId });
ok(detail.answers.length === 2, 'رصد إجابتين (من أجاب)');
ok(Object.values(detail.distribution).reduce((a, b) => a + b, 0) === 2, 'توزيع الإجابات');

const rep = await rpc(anon, 'rpc_report', { p_session: sessionId });
ok(rep.questions.length >= 26, `التقرير يغطي ${rep.questions.length} سؤالاً`);
ok(rep.questions[0].distribution[String(correctIdx)] === 1, 'تقرير السؤال الأول صحيح');

/* a STUDENT must not be able to read teacher-only data */
const s3 = createClient(U, PUB, { auth: { persistSession: false } });
const asStudent = await tryRpc(s3, 'rpc_report', { p_session: sessionId });
ok(!!asStudent && /غير مصرّح/.test(asStudent), 'الطالب لا يستطيع قراءة التقرير', asStudent ?? '');

const directResults = await fetch(`${U}/rest/v1/results?session_id=eq.${sessionId}`, {
  headers: { apikey: PUB, Authorization: `Bearer ${PUB}` },
});
const body = await directResults.json();
ok(directResults.status !== 200 || (Array.isArray(body) && body.length === 0), 'جدول results محميّ من القراءة المباشرة');

/* ── 11. the door ────────────────────────────────────────────────────── */
section('١١. فتح وإغلاق الباب');
await rpc(anon, 'rpc_teacher_action', { p_session: sessionId, p_action: 'close' });
const lockedOut = await tryRpc(anon, 'rpc_join', {
  p_code: codeInfo.code,
  p_client_key: 'e2e-late-key-00004',
  p_name: 'متأخر',
  p_avatar: '🙂',
  p_banner: 'b0',
});
ok(!!lockedOut && /مغلق/.test(lockedOut), 'الباب المغلق يمنع الدخول', lockedOut ?? '');
await rpc(anon, 'rpc_teacher_action', { p_session: sessionId, p_action: 'open' });

/* ── 12. next question & finish ──────────────────────────────────────── */
section('١٢. السؤال التالي والإنهاء');
await rpc(anon, 'rpc_teacher_action', { p_session: sessionId, p_action: 'next' });
const nxt = await rpc(anon, 'rpc_sync', { p_session: sessionId, p_client_key: students[0].key });
ok(nxt.session.status === 'question' && nxt.session.questionIndex === 1, 'انتقل للسؤال الثاني');

await rpc(anon, 'rpc_teacher_action', { p_session: sessionId, p_action: 'finish' });
const fin = await rpc(anon, 'rpc_sync', { p_session: sessionId, p_client_key: students[0].key });
ok(fin.session.status === 'finished', 'انتهت اللعبة');
ok(
  fin.myResults.length >= 1 && fin.myResults.every((r) => r.slot < fin.session.totalQuestions),
  'سجلّ الطالب محصور بالجولات الفعلية',
  `${fin.myResults.length} جولة`,
);

/* ── cleanup ─────────────────────────────────────────────────────────── */
section('١٣. تنظيف');
await admin.from('sessions').delete().eq('id', sessionId);
const gone = await admin.from('sessions').select('id').eq('id', sessionId);
ok((gone.data ?? []).length === 0, 'حُذفت جلسة الاختبار');

/* ── done ────────────────────────────────────────────────────────────── */
console.log(`\n${'═'.repeat(46)}`);
console.log(`  ${fail === 0 ? '✔ نجحت كل الاختبارات' : '✖ فشل ' + fail + ' اختبار'}`);
console.log(`  ناجح: ${pass}   ·   فاشل: ${fail}`);
console.log('═'.repeat(46));
process.exit(fail === 0 ? 0 : 1);