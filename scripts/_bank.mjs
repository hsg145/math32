/**
 * Loads src/data/questionBank.ts from a plain Node script by bundling it with
 * esbuild first (Node cannot import a .ts module with an extensionless import).
 */
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { existsSync } from 'node:fs';

const here = dirname(fileURLToPath(import.meta.url));
const entry = resolve(here, '../src/data/questionBank.ts');
const out = resolve(here, '.question-bank.cjs');

let cached = null;

export async function loadQuestionBank() {
  if (cached) return cached;
  if (!existsSync(entry)) throw new Error(`missing ${entry}`);
  await build({
    entryPoints: [entry],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    outfile: out,
    logLevel: 'error',
  });
  const mod = createRequire(import.meta.url)(out);
  cached = { QUESTION_BANK: mod.QUESTION_BANK, LESSONS: mod.LESSONS };
  return cached;
}

/** Maps a domain question into the `public.questions` row shape. */
export function toRow(q, position, isActive = true) {
  const { figure, numberLine, ...rest } = q;
  return {
    lesson: rest.lesson,
    body: rest.body,
    figure: figure ?? null,
    options: rest.options,
    correct_index: rest.correctIndex,
    explanation: rest.explanation,
    number_line: numberLine ?? null,
    position,
    is_active: isActive,
  };
}