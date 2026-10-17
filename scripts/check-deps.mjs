/**
 * Guards the "relation does not exist" failure mode: PostgreSQL validates the
 * SQL inside a plpgsql body at CREATE time, so a function may only reference
 * tables that were declared EARLIER in the script.
 *
 * Strategy: first record where every `create table` lands, then check each
 * function's body for references to those exact names and compare positions.
 * Names that are not declared tables (CTEs, plpgsql variables, function calls)
 * are ignored by construction.
 *
 *   node scripts/check-deps.mjs [file]
 */
import { readFileSync } from 'node:fs';

const file = process.argv[2] ?? 'supabase/schema.sql';
const sql = readFileSync(file, 'utf8');

/** Split on statement-terminating `;`, skipping dollar-quoted bodies. */
function statements(text) {
  const out = [];
  let buf = '';
  let tag = null;
  for (let i = 0; i < text.length; i++) {
    if (tag) {
      if (text.startsWith(tag, i)) {
        buf += tag;
        i += tag.length - 1;
        tag = null;
      } else {
        buf += text[i]; // keep the body — it is what we must audit
      }
      continue;
    }
    if (text[i] === '$') {
      const m = /^\$[A-Za-z_]*\$/.exec(text.slice(i, i + 40));
      if (m) {
        tag = m[0];
        buf += m[0];
        i += m[0].length - 1;
        continue;
      }
    }
    if (text[i] === ';') {
      out.push({ sql: buf.trim(), at: buf.length });
      buf = '';
      continue;
    }
    buf += text[i];
  }
  if (buf.trim()) out.push({ sql: buf.trim(), at: buf.length });
  return out.filter((s) => s.sql.length > 0);
}

/** Strip SQL comments so statement matching is reliable. */
const clean = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\n]*/g, ' ').trim();

const stmts = statements(sql).map((s) => ({ ...s, sql: clean(s.sql) }));
const TABLE_RE = /create table (?:if not exists )?(?:public\.)?"?([a-z_][a-z0-9_]*)"?/i;
const FUNC_RE = /create (?:or replace )?function (?:public\.)?"?([a-z_][a-z0-9_]*)"?\s*\(/i;
const TRIG_RE = /create trigger \S+[\s\S]*?\bon (?:public\.)?"?([a-z_][a-z0-9_]*)"?/i;
const REF_RE = /\b(?:from|join|into|update|delete from|exists)\s+(?:public\.)?"?([a-z_][a-z0-9_]*)"?/gi;
const CALL_RE = /public\."?([a-z_][a-z0-9_]*)"?\s*\(/gi;

/* pass 1 — where is each table / function declared? */
const tableAt = new Map();
const funcAt = new Map();
stmts.forEach((s, i) => {
  const t = TABLE_RE.exec(s.sql);
  if (t && !tableAt.has(t[1].toLowerCase())) tableAt.set(t[1].toLowerCase(), i);
  const f = FUNC_RE.exec(s.sql);
  if (f && !funcAt.has(f[1].toLowerCase())) funcAt.set(f[1].toLowerCase(), i);
});

/* pass 2 — forward-reference audit */
const problems = [];
const label = (s) => s.sql.replace(/\s+/g, ' ').slice(0, 78);

stmts.forEach((s, i) => {
  const f = FUNC_RE.exec(s.sql);
  if (f) {
    const name = f[1].toLowerCase();
    const seen = new Set();
    for (const m of s.sql.matchAll(REF_RE)) {
      const rel = m[1].toLowerCase();
      if (!tableAt.has(rel) || seen.has(rel)) continue;
      seen.add(rel);
      if (tableAt.get(rel) > i) {
        problems.push(`function ${name}() uses table "${rel}" declared LATER\n    → ${label(s)}`);
      }
    }
    for (const m of s.sql.matchAll(CALL_RE)) {
      const fn = m[1].toLowerCase();
      if (fn === name || !funcAt.has(fn) || seen.has(`fn:${fn}`)) continue;
      seen.add(`fn:${fn}`);
      if (funcAt.get(fn) > i) {
        problems.push(`function ${name}() calls public.${fn}() declared LATER\n    → ${label(s)}`);
      }
    }
  }

  const tr = TRIG_RE.exec(s.sql);
  if (tr && tableAt.has(tr[1].toLowerCase()) && tableAt.get(tr[1].toLowerCase()) > i) {
    problems.push(`trigger on "${tr[1]}" created before the table\n    → ${label(s)}`);
  }
});

if (problems.length) {
  console.error(`✖ ${file}: ${problems.length} forward reference(s)\n`);
  for (const p of problems) console.error('  • ' + p);
  process.exit(1);
}
console.log(
  `✔ ${file}: declaration order ok — ${tableAt.size} tables, ${funcAt.size} functions, ${stmts.length} statements`,
);