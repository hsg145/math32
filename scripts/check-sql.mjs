/**
 * Static validation of supabase/schema.sql with the real PostgreSQL parser.
 *   • toplevel → parse()        DDL, DO blocks, triggers, policies
 *   • plpgsql  → parsePlPgSQL() every function / DO body (grammar)
 *
 *   npm run check:sql
 */
import { readFileSync } from 'node:fs';
import { parse, parsePlPgSQL } from 'libpg-query';

const file = process.argv[2] ?? 'supabase/schema.sql';
const sql = readFileSync(file, 'utf8');

const show = (pos, span = 220) =>
  [`  …${sql.slice(Math.max(0, pos - span), pos)}`, `  ▶▶▶${sql.slice(pos, pos + span)}`].join('\n');

let failed = false;

try {
  const r = await parse(sql);
  console.log(`✔ toplevel : ${r.stmts.length} statements parsed`);
} catch (e) {
  failed = true;
  console.error(`✖ toplevel : ${e.message}`);
  const p = e.sqlDetails?.cursorPosition;
  if (p) console.error(show(p));
}

try {
  const r = await parsePlPgSQL(sql);
  const funcs = r.plpgsql_funcs ?? [];
  const named = funcs
    .map((f) => f.PLpgSQL_function?.funcname)
    .filter(Boolean)
    .map((n) => n.map((p) => p.string ?? p).join('.'));
  console.log(`✔ plpgsql  : ${funcs.length} bodies analysed`);
  if (named.length) console.log(`             ${named.sort().join(', ')}`);
} catch (e) {
  failed = true;
  console.error(`✖ plpgsql  : ${e.message}`);
  const p = e.sqlDetails?.cursorPosition;
  if (p) console.error(show(p));
}

process.exit(failed ? 1 : 0);