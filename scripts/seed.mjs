/**
 * Imports the 26-question bank (Unit 2 — Lessons 1-6) into public.questions.
 * Safe to re-run: questions whose body already exists are skipped.
 *
 *     npm run seed
 */
import { readFileSync, existsSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { loadQuestionBank, toRow } from './_bank.mjs';

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

if (!url || !secret) {
  console.error('✖  أضف VITE_SUPABASE_URL و SUPABASE_SERVICE_ROLE_KEY إلى .env.local');
  process.exit(1);
}

const admin = createClient(url, secret, { auth: { persistSession: false } });
const { QUESTION_BANK } = await loadQuestionBank();

const { data: existing, error: readErr } = await admin.from('questions').select('id, body, position');
if (readErr) throw readErr;

const byBody = new Map((existing ?? []).map((r) => [r.body, r]));
let position =
  (existing ?? []).reduce((m, r) => Math.max(m, r.position ?? 0), -1) + 1;

const inserted = [];
const updated = [];
for (const q of QUESTION_BANK) {
  const row = toRow(q, 0);
  const hit = byBody.get(q.body);
  if (hit) {
    /* keep the same row (and its id) but refresh everything the generator owns */
    updated.push({ ...row, id: hit.id, position: hit.position ?? 0 });
  } else {
    inserted.push({ ...row, position: position++ });
  }
}

if (inserted.length) {
  const { error } = await admin.from('questions').insert(inserted);
  if (error) throw error;
}
if (updated.length) {
  const { error } = await admin.from('questions').upsert(updated);
  if (error) throw error;
}

console.log(
  `✔ ${inserted.length} سؤالاً جديداً · ${updated.length} سؤالاً محدَّثاً → ${url}`,
);

const { count } = await admin.from('questions').select('id', { count: 'exact', head: true });
console.log(`   إجمالي الأسئلة في القاعدة: ${count ?? '?'}`);