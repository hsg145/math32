/**
 * Creates (or resets) the single teacher account and registers it in
 * public.teachers.  Run once:
 *
 *     $env:TEACHER_EMAIL="you@school.edu"; $env:TEACHER_PASSWORD="…"; npm run create-teacher
 *
 * The secret key is read from .env.local and NEVER bundled into the site.
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
const url = env.VITE_SUPABASE_URL ?? env.SUPABASE_URL;
const secret = env.SUPABASE_SERVICE_ROLE_KEY ?? env.SUPABASE_SECRET_KEY;
const email = (env.TEACHER_EMAIL ?? '').trim();
const password = env.TEACHER_PASSWORD ?? '';
const fullName = (env.TEACHER_NAME ?? 'المعلّم').trim();

if (!url || !secret) {
  console.error('✖  أضف VITE_SUPABASE_URL و SUPABASE_SERVICE_ROLE_KEY إلى .env.local');
  process.exit(1);
}
if (!email || password.length < 8) {
  console.error('✖  عيّن TEACHER_EMAIL و TEACHER_PASSWORD (٨ أحرف على الأقل) في .env.local');
  process.exit(1);
}

const admin = createClient(url, secret, { auth: { persistSession: false } });

const { data: created, error: createErr } = await admin.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
  user_metadata: { full_name: fullName },
});
let userId = created?.user?.id;

if (createErr) {
  if (/already|registered|exists/i.test(createErr.message)) {
    console.log('•  الحساب موجود مسبقاً — جارٍ تحديث كلمة المرور…');
    const { data: list, error: listErr } = await admin.auth.admin.listUsers({ perPage: 200 });
    if (listErr) throw listErr;
    const found = list.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (!found) throw new Error(`تعذّر العثور على ${email}`);
    const { error: updErr } = await admin.auth.admin.updateUserById(found.id, {
      password,
      email_confirm: true,
    });
    if (updErr) throw updErr;
    userId = found.id;
  } else {
    throw createErr;
  }
}

const { error: upErr } = await admin
  .from('teachers')
  .upsert({ id: userId, email, full_name: fullName }, { onConflict: 'id' });
if (upErr) throw upErr;

console.log(`
✔  تم إنشاء حساب المعلّم
   البريد    : ${email}
   الاسم     : ${fullName}
   المعرّف   : ${userId}

   سجّل الدخول من  /#/admin
`);