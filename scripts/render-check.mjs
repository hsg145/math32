/**
 * Builds + runs scripts/render-check.tsx (SSR smoke test of the question UI).
 *   npm run render:check
 */
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const entry = resolve(here, 'render-check.tsx');
const out = resolve(here, '.render-check.cjs');

await build({
  entryPoints: [entry],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  outfile: out,
  jsx: 'automatic',
  loader: { '.css': 'empty' },
  logLevel: 'error',
});

const run = spawnSync(process.execPath, [out], { stdio: 'inherit' });

/* the segmented code input + the emoji picker are separate entries */
for (const entry of ['test-codeinput.tsx', 'test-picker.tsx', 'test-avatar.tsx', 'test-optionbox.tsx', 'test-badge.tsx']) {
  const outN = resolve(here, `.${entry.replace('.tsx', '')}.cjs`);
  await build({
    entryPoints: [resolve(here, entry)],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    outfile: outN,
    jsx: 'automatic',
    logLevel: 'error',
  });
  const r = spawnSync(process.execPath, [outN], { stdio: 'inherit' });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

process.exit(run.status ?? 1);