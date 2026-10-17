import { useCallback, useRef } from 'react';

/* ═══════════════════════════════════════════════════════════════════════════
   Segmented join-code entry — 3 + 3 boxes with an automatic hyphen.

   • typing the 3rd letter hops to the second group on its own
   • pasting a full code, a link, or anything in between fills every box
   • backspace / arrows behave like a native one-time-code field
   • the value is always exactly 6 slots; an empty slot is ''
   ═══════════════════════════════════════════════════════════════════════════ */

const SLOTS = 6;
const GROUP_START = [0, 3];
const GROUP_SIZE = [3, 3];

export const CODE_LENGTH = SLOTS;

/** Keeps only A–Z and 0–9, upper-cased. */
export function cleanCode(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/** Pulls the code out of a pasted link: …/#/j/ABC-DEF  or  …?code=ABC-DEF */
export function extractCode(raw: string): string {
  const m = /(?:\/j\/|code=)([A-Za-z0-9-]{4,10})/.exec(raw);
  return cleanCode(m?.[1] ?? raw).slice(0, SLOTS);
}

/** "ABCDEF" → "ABC-DEF" (the exact form the database stores) */
export const withHyphen = (six: string): string => {
  const c = six.slice(0, SLOTS);
  return c.length <= 3 ? c : `${c.slice(0, 3)}-${c.slice(3, 6)}`;
};

/** How many boxes are filled. */
export const filled = (v: string): number => v.replace(/[^A-Z0-9]/g, '').length;

export function CodeInput({
  value,
  onChange,
  onComplete,
  invalid,
  disabled,
}: {
  value: string;
  onChange: (six: string) => void;
  onComplete?: () => void;
  invalid?: boolean;
  disabled?: boolean;
}) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const at = (i: number) => value[i] ?? '';

  const focus = useCallback((i: number) => {
    const el = refs.current[Math.max(0, Math.min(SLOTS - 1, i))];
    el?.focus();
    el?.select();
  }, []);

  /** Replace slot `i` without shifting anything else. */
  const put = useCallback(
    (i: number, ch: string, caret: number) => {
      const next = (value.slice(0, i) + ch + value.slice(i + 1)).slice(0, SLOTS);
      onChange(next);
      if (caret >= 0) requestAnimationFrame(() => focus(caret));
    },
    [focus, onChange, value],
  );

  const finish = useCallback(() => {
    if (filled(value) === SLOTS) {
      requestAnimationFrame(() => onComplete?.());
    }
  }, [onComplete, value]);

  const onKeyDown = useCallback(
    (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
      switch (e.key) {
        case 'Backspace': {
          e.preventDefault();
          if (at(i)) put(i, '', i);
          else if (i > 0) {
            put(i - 1, '', i - 1);
          }
          return;
        }
        case 'Delete': {
          e.preventDefault();
          put(i, '', i);
          return;
        }
        case 'ArrowLeft':
          e.preventDefault();
          focus(i - 1);
          return;
        case 'ArrowRight':
          e.preventDefault();
          focus(i + 1);
          return;
        case 'Home':
          e.preventDefault();
          focus(0);
          return;
        case 'End':
          e.preventDefault();
          focus(SLOTS - 1);
          return;
        case 'Enter':
          e.preventDefault();
          finish();
          return;
        default:
          break;
      }

      if (/^[a-zA-Z0-9]$/.test(e.key)) {
        e.preventDefault();
        put(i, e.key.toUpperCase(), i + 1);
        if (i + 1 === SLOTS) finish();
      } else if (e.key.length === 1) {
        /* dashes/spaces are produced by the layout — never typed */
        e.preventDefault();
      }
    },
    [at, finish, focus, put],
  );

  const onPaste = useCallback(
    (e: React.ClipboardEvent<HTMLInputElement>) => {
      e.preventDefault();
      const text = extractCode(e.clipboardData.getData('text'));
      if (!text) return;
      const next = text.padEnd(SLOTS, '');
      onChange(next);
      if (text.length >= SLOTS) {
        onComplete?.();
      } else {
        requestAnimationFrame(() => focus(text.length));
      }
    },
    [focus, onChange, onComplete],
  );

  return (
    <div className="code-input" dir="ltr" role="group" aria-label="كود الدخول">
      {GROUP_SIZE.map((size, g) => (
        <div className="code-group" key={g}>
          {Array.from({ length: size }, (_, k) => {
            const i = (GROUP_START[g] ?? 0) + k;
            const ch = at(i);
            return (
              <input
                key={i}
                ref={(el) => {
                  refs.current[i] = el;
                }}
                className={`code-cell${ch ? ' on' : ''}${invalid ? ' bad' : ''}`}
                type="text"
                inputMode="text"
                autoComplete={i === 0 ? 'one-time-code' : 'off'}
                autoCorrect="off"
                autoCapitalize="characters"
                spellCheck={false}
                maxLength={1}
                disabled={disabled}
                value={ch}
                aria-label={`الحرف ${i + 1} من ${SLOTS}`}
                onKeyDown={(e) => onKeyDown(i, e)}
                onPaste={onPaste}
                onFocus={(e) => e.currentTarget.select()}
                onChange={(e) => {
                  const c = e.target.value.replace(/[^A-Za-z0-9]/g, '').slice(-1).toUpperCase();
                  if (!c) {
                    put(i, '', i);
                    return;
                  }
                  put(i, c, i + 1);
                  if (i + 1 === SLOTS) finish();
                }}
              />
            );
          })}
          {g === 0 && <span className="code-dash">–</span>}
        </div>
      ))}
    </div>
  );
}