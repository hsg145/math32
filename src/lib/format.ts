/* ═══════════════════════════════════════════════════════════════════════════
   Arabic maths typesetter — a faithful port of the original single-file quiz.
   Produces HTML strings; every input is HTML-escaped first so question bodies
   coming from the database can never inject markup.
   ═══════════════════════════════════════════════════════════════════════════ */

const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';

/** 0-9 → ٠-٩ */
export const ar = (s: unknown): string =>
  String(s).replace(/\d/g, (d) => AR_DIGITS[Number(d)] as string);

/** Digit grouping + Arabic digits, for numeric UI values. */
export const arNum = (v: unknown): string => ar(String(v).replace('-', '−'));

/** Arabic-Indic digits only (no sign replacement). */
/**
 * Neutralises tag starts only.
 *
 * The original quiz interpolates its maths straight into innerHTML, and the
 * browser renders `< 3` as literal text because `<` is followed by a space.
 * We keep that byte-for-byte, and escape `<` *only* when it would actually
 * open a tag — so the output matches the original exactly while `<script>`
 * or `<img onerror=…` in a question body can never execute.
 */
const esc = (s: string): string =>
  s.replace(/</g, (_m, i: number, src: string) =>
    /[a-zA-Z/]/.test(src[i + 1] ?? '') ? '&lt;' : '<',
  );

/** Renders math notation inside a `{…}` group:
 *  ‹a|b› → stacked fraction · √(x) → radical with vinculum · x^2 → superscript
 *  "-"  → true minus sign U+2212 */
export function fmtMath(src: string): string {
  return esc(src)
    .replace(/‹([^|›]*)\|([^›]*)›/g, '<span class="fr"><i>$1</i><i>$2</i></span>')
    .replace(/√\(([^()]*(?:\([^()]*\)[^()]*)*)\)/g, '√<span class="rc">$1</span>')
    .replace(/√([\u0600-\u06FFA-Za-z0-9]+)/g, '√<span class="rc">$1</span>')
    .replace(/\^(\d)/g, '<sup>$1</sup>')
    .replace(/-/g, '−');
}

/** Renders a full question line: `{…}` groups become monospaced maths chips. */
export function fmtLine(src: string): string {
  return ar(String(src).replace(/\{([^}]*)\}/g, (_, inner: string) => `<b class="m">${fmtMath(inner)}</b>`));
}

/** Seconds → m:ss */
export const mmss = (totalSeconds: number): string => {
  const s = Math.max(0, Math.round(totalSeconds));
  const m = Math.floor(s / 60);
  return `${ar(m)}:${ar(String(s % 60).padStart(2, '0'))}`;
};

/** Milliseconds → "٣٫٤ ث" */
export const secs = (ms: number | null | undefined): string =>
  ms == null ? '—' : `${ar((ms / 1000).toFixed(1))} ث`;