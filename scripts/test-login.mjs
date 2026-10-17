/**
 * Reproduces the teacher's browser sign-in against the real Supabase project
 * and asserts every step the UI depends on:
 *   1. signInWithPassword returns a session
 *   2. the JWT resolves auth.uid() on the server
 *   3. the teachers row exists (RLS gate for every admin RPC)
 *   4. a teacher-only RPC succeeds with that JWT
 *   5. the same RPC is refused for an anonymous client
 *
 *   node scripts/test-login.mjs
 */
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const env = {};
for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}

let pass = 0;
let fail = 0;
const ok = (c, label, extra = '') => {
  if (c) pass++;
  else fail++;
  console.log(`  ${c ? '✔' : '✖'} ${label}${extra ? '  ' + extra : ''}`);
};

/* a fresh client per step mirrors a fresh browser tab */
const fresh = () =>
  createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } });

console.log('\n── ١. كلمة مرور خاطئة ──');
{
  const c = fresh();
  const { data, error } = await c.auth.signInWithPassword({
    email: env.TEACHER_EMAIL,
    password: 'definitely-not-the-password',
  });
  ok(!!error && !data?.session, 'كلمة مرور خاطئة → خطأ بلا جلسة');
  ok(/invalid/i.test(error?.message ?? ''), 'رسالة الخطأ واضحة', error?.message ?? '');
}

console.log('\n── ٢. بريد غير موجود ──');
{
  const c = fresh();
  const { error } = await c.auth.signInWithPassword({
    email: 'nobody@nowhere.test',
    password: 'whatever-123',
  });
  ok(!!error, 'بريد غير مسجّل مرفوض');
}

console.log('\n── ٣. الدخول الصحيح ──');
const client = fresh();
const { data, error } = await client.auth.signInWithPassword({
  email: env.TEACHER_EMAIL,
  password: env.TEACHER_PASSWORD,
});
if (error || !data?.session) {
  console.error(`✖ فشل الدخول: ${error?.message ?? 'لا جلسة'}`);
  process.exit(1);
}
ok(true, `جلسة صالحة: ${data.user.email}`);
ok(!!data.session.access_token, 'رمز الوصول استُلم');
ok(data.user.email_confirmed_at != null, 'البريد مُؤكَّد (لا يطلب بريد تحقق)');

/* what onAuthStateChange hands the app */
const { data: back } = await client.auth.getSession();
ok(back.session?.user?.id === data.user.id, 'getSession يُعيد نفس المستخدم فوراً');

console.log('\n── ٤. صلاحيات ──');
{
  const admin = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  const { data: t } = await admin
    .from('teachers')
    .select('id, email, full_name')
    .eq('id', data.user.id)
    .maybeSingle();
  ok(!!t, 'صف teachers موجود', t?.full_name ?? '');
}

{
  const { data: code, error: e } = await client.rpc('rpc_active_code', {
    p_session: '00000000-0000-0000-0000-000000000000',
  });
  const refused = !!e && /غير موجود/.test(e.message);
  ok(refused, 'RPC المعلّم يمرّ التفويض (رفض，對جلسة وهمية، لا "غير مصرّح")', e?.message ?? '');
  void code;
}

{
  const anon = fresh();
  const { error: e } = await anon.rpc('rpc_active_code', {
    p_session: '00000000-0000-0000-0000-000000000000',
  });
  ok(!!e && /غير مصرّح/.test(e.message), 'زائر بلا حساب مرفوض', e?.message ?? '');
}

console.log('\n── ٥. الخروج ──');
{
  const { error: e } = await client.auth.signOut();
  ok(!e, 'الخروج يعمل');
  const { data: after } = await client.auth.getSession();
  ok(!after.session, 'الجلسة أُبطلت بعد الخروج');
}

console.log(`\n  ناجح: ${pass}   ·   فاشل: ${fail}`);
process.exit(fail === 0 ? 0 : 1);