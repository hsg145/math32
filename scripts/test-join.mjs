/**
 * Focused check for the student entry flow:
 *   code screen  →  (read-only code check, NO player row)
 *   identity screen → (name + emoji, creates the seat)
 * Verifies that the code screen never demands a name and that a bad code or a
 * closed door produces a helpful Arabic message instead of a crash.
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

let pass = 0;
let fail = 0;
const ok = (c, label, extra = '') => {
  c ? pass++ : fail++;
  console.log(`  ${c ? '✔' : '✖'} ${label}${extra ? '  ' + extra : ''}`);
};

const admin = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
/* the student browser: publishable key only */
const anon = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
  auth: { persistSession: false },
});

/* mirrors api.resolveCode() exactly */
async function resolveCode(code) {
  const { data, error } = await anon
    .from('session_codes')
    .select('session_id, expires_at, sessions!inner(id, title, is_open, status)')
    .eq('code', code.toUpperCase().trim())
    .eq('revoked', false)
    .gt('expires_at', new Date().toISOString())
    .limit(1)
    .maybeSingle();
  if (error) return { error: error.message };
  if (!data) return null;
  const s = Array.isArray(data.sessions) ? data.sessions[0] : data.sessions;
  return s ? { sessionId: data.session_id, isOpen: s.is_open, title: s.title } : null;
}

/* ── fixture session with a hand-made code (no RPC needed) ─────────── */
console.log('\n── تهيئة جلسة اختبار ──');
const { data: sess, error: sErr } = await admin
  .from('sessions')
  .insert({
    title: 'اختبار بوابة الدخول',
    status: 'lobby',
    is_open: true,
    question_seconds: 20,
    question_index: -1,
    teacher_id: null,
  })
  .select()
  .single();
if (sErr) {
  console.error('✖', sErr.message);
  process.exit(1);
}
const CODE = 'E2E-GATE';
await admin.from('session_codes').insert({
  session_id: sess.id,
  code: CODE,
  expires_at: new Date(Date.now() + 24 * 3600e3).toISOString(),
});

console.log('\n── ١. شاشة الكود ──');
const found = await resolveCode(CODE);
ok(found && found.sessionId === sess.id, 'الكود الصحيح يُقبل', found?.title ?? '');
ok(found?.isOpen === true, 'الباب مفتوح');

const wrong = await resolveCode('ZZZ-ZZZ');
ok(wrong === null, 'كود غير موجود يُرفض بنظافة (لا خطأ، لا اسم مطلوب)');

const { data: playersBefore } = await admin
  .from('players')
  .select('id')
  .eq('session_id', sess.id);
ok((playersBefore ?? []).length === 0, 'فحص الكود لم ينشئ أي طالب (حقل الاسم آمن)');

console.log('\n── ٢. الباب المغلق ──');
await admin.from('sessions').update({ is_open: false }).eq('id', sess.id);
const shut = await resolveCode(CODE);
ok(shut && shut.isOpen === false, 'يُكتشف أن الباب مغلق قبل طلب الاسم');
await admin.from('sessions').update({ is_open: true }).eq('id', sess.id);

console.log('\n── ٣. كود ملغى / منتهٍ ──');
await admin
  .from('session_codes')
  .update({ revoked: true })
  .eq('code', CODE);
ok((await resolveCode(CODE)) === null, 'الكود الملغى يُرفض');

const { data: fresh } = await admin
  .from('session_codes')
  .insert({
    session_id: sess.id,
    code: 'E2E-EXP',
    expires_at: new Date(Date.now() - 1000).toISOString(),
  })
  .select()
  .single();
ok((await resolveCode('E2E-EXP')) === null, 'الكود المنتهي يُرفض');
void fresh;

console.log('\n── ٤. شاشة الهوية (كما تفعل الصفحة) ──');
const { error: jErr } = await anon.rpc('rpc_join', {
  p_code: 'ZZZ-ZZZ',
  p_client_key: 'gate-test-key-0001',
  p_name: '',
  p_avatar: '🦊',
  p_banner: 'b1',
});
ok(!!jErr && /الكود/.test(jErr.message), 'كود خاطئ على شاشة الهوية يعطي رسالة الكود', jErr?.message ?? '');

await admin
  .from('session_codes')
  .update({ revoked: false })
  .eq('code', CODE);

const { data: joined, error: joinErr } = await anon.rpc('rpc_join', {
  p_code: CODE,
  p_client_key: 'gate-test-key-0001',
  p_name: 'طالب تجريبي',
  p_avatar: '🦊',
  p_banner: 'b1',
});
if (joinErr && /gen_random_bytes|relation/.test(joinErr.message)) {
  console.log('  · rpc_join يتطلّب مخطّطاً محدَّثاً (يُتجاوز هنا)');
} else {
  ok(!joinErr && !!joined?.playerId, 'الطالب دخل بالاسم', joined?.name ?? joinErr?.message ?? '');
}

console.log('\n── تنظيف ──');
await admin.from('sessions').delete().eq('id', sess.id);
const { data: gone } = await admin.from('sessions').select('id').eq('id', sess.id);
ok((gone ?? []).length === 0, 'حُذفت جلسة الاختبار');

console.log(`\n  ناجح: ${pass}   ·   فاشل: ${fail}`);
process.exit(fail === 0 ? 0 : 1);