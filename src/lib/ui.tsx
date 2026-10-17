import { memo, useCallback, useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon, type IconName } from './icons';
import { ar, arNum, mmss } from './format';
import { serverNow } from './clock';

/* ═══════════════════════════════════════════════════════════════════════════
   Shared presentational pieces.
   ═══════════════════════════════════════════════════════════════════════════ */

/* ── Avatar gradients ("البانر") ───────────────────────────────────────── */
export const BANNERS = [
  { id: 'b0', from: '#7c5cff', to: '#2b59ff' },
  { id: 'b1', from: '#ff7a3d', to: '#e0367e' },
  { id: 'b2', from: '#12b3a8', to: '#17a34a' },
  { id: 'b3', from: '#f59e0b', to: '#ffc933' },
  { id: 'b4', from: '#0ea5e9', to: '#12b3a8' },
  { id: 'b5', from: '#e0367e', to: '#7c5cff' },
  { id: 'b6', from: '#17a34a', to: '#0a9b6e' },
  { id: 'b7', from: '#2b59ff', to: '#12b3a8' },
] as const;

export function bannerOf(id: string) {
  return BANNERS.find((b) => b.id === id) ?? BANNERS[0];
}

export function avatarStyle(id: string): React.CSSProperties {
  const b = bannerOf(id);
  return { backgroundImage: `linear-gradient(135deg, ${b.from}, ${b.to})` };
}

/* ── Avatar ────────────────────────────────────────────────────────────── */
const AVA_SIZES = { sm: 46, md: 60, lg: 86, xl: 132 } as const;

/**
 * The pixel size is emitted by the component (not derived from a CSS variable
 * in the stylesheet) so the box can never collapse to content size and render
 * as an ellipse inside flex/grid parents.
 */
export const Avatar = memo(function Avatar({
  emoji,
  banner,
  name,
  size,
  ring,
  pulse,
}: {
  emoji: string;
  banner: string;
  name?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  ring?: boolean;
  pulse?: boolean;
}) {
  const px = AVA_SIZES[size ?? 'sm'];
  return (
    <div
      className={`ava${ring ? ' ring' : ''}`}
      style={
        {
          ...avatarStyle(banner),
          '--s': `${px}px`,
          width: px,
          height: px,
          minWidth: px,
          minHeight: px,
          maxWidth: px,
          maxHeight: px,
          fontSize: Math.round(px * 0.5),
          animation: pulse ? 'pulse 1.6s ease-in-out infinite' : undefined,
        } as CSSProperties
      }
      aria-hidden={name ? undefined : true}
    >
      <span className="ava-in">
        <span className="ava-glyph">{emoji}</span>
        {name && <span className="name">{name}</span>}
      </span>
    </div>
  );
});

/* ── Countdown ring ────────────────────────────────────────────────────── */
export function Timer({
  secondsLeft,
  total,
  mini,
  onDone,
}: {
  secondsLeft: number;
  total: number;
  mini?: boolean;
  onDone?: () => void;
}) {
  const fired = useRef(false);
  const R = mini ? 22 : 37;
  const C = 2 * Math.PI * R;
  const ratio = total > 0 ? Math.max(0, Math.min(1, secondsLeft / total)) : 0;
  const secs = Math.max(0, secondsLeft);
  const tone = secs <= 5 ? 'danger' : secs <= 10 ? 'warn' : '';

  useEffect(() => {
    if (secs <= 0 && !fired.current) {
      fired.current = true;
      onDone?.();
    }
    if (secs > 0) fired.current = false;
  }, [secs, onDone]);

  return (
    <div className={`timer ${mini ? 'mini' : ''} ${tone}`} role="timer" aria-label={`الوقت المتبقي ${mmss(secs)}`}>
      <svg width="100%" height="100%" viewBox="0 0 86 86">
        <circle cx="43" cy="43" r={R} fill="none" stroke="var(--gl)" strokeWidth={mini ? 7 : 9} />
        <circle
          cx="43"
          cy="43"
          r={R}
          fill="none"
          stroke={secs <= 5 ? 'var(--no)' : secs <= 10 ? 'var(--gold)' : 'var(--ink)'}
          strokeWidth={mini ? 7 : 9}
          strokeLinecap="round"
          strokeDasharray={C}
          strokeDashoffset={C * (1 - ratio)}
          style={{ transition: 'stroke-dashoffset .3s linear, stroke .3s' }}
        />
      </svg>
      <span className="tk">{mmss(secs)}</span>
    </div>
  );
}

/** Re-renders on a timer derived from server time. */
export function useTick(active: boolean, hz = 4) {
  const bump = useReducerLike();
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(bump, 1000 / hz);
    return () => window.clearInterval(id);
  }, [active, hz, bump]);
  return serverNow();
}

function useReducerLike(): () => void {
  const [, set] = useState(0);
  return useCallback(() => set((n) => n + 1), [set]);
}

/* ── Score ring ────────────────────────────────────────────────────────── */
export function ScoreRing({ correct, total }: { correct: number; total: number }) {
  const p = total > 0 ? correct / total : 0;
  const C = 2 * Math.PI * 52;
  return (
    <svg viewBox="0 0 120 120" className="ring" role="img" aria-label={`نتيجتك ${ar(correct)} من ${ar(total)}`}>
      <circle cx="60" cy="60" r="52" fill="none" stroke="var(--gl)" strokeWidth="12" />
      <circle
        className="ring-c"
        cx="60"
        cy="60"
        r="52"
        fill="none"
        stroke={p >= 0.6 ? 'var(--ok)' : 'var(--no)'}
        strokeWidth="12"
        strokeLinecap="round"
        strokeDasharray={`${p * C} ${C}`}
        transform="rotate(-90 60 60)"
      />
      <text x="60" y="68" textAnchor="middle" fontSize="26" fontWeight="800" fill="currentColor">
        {`${ar(correct)}/${ar(total)}`}
      </text>
    </svg>
  );
}

/* ── Confetti (original effect) ────────────────────────────────────────── */
export function confetti(count = 44) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const colors = ['#ffc933', '#0a9b6e', '#d6336c', '#2b59ff'];
  for (let k = 0; k < count; k++) {
    const el = document.createElement('i');
    el.className = 'cf';
    el.style.cssText = `left:${Math.random() * 100}vw;background:${colors[k % 4]};animation-duration:${
      2 + Math.random() * 2
    }s;animation-delay:${Math.random() * 0.6}s`;
    document.body.appendChild(el);
    window.setTimeout(() => el.remove(), 5000);
  }
}

/* ── Loading page ──────────────────────────────────────────────────────── */
export function Loading({ label = 'جاري التحميل…' }: { label?: string }) {
  return (
    <div className="loading">
      <div className="orb" />
      <div>{ar(label)}</div>
    </div>
  );
}

/* ── Empty state ───────────────────────────────────────────────────────── */
export function Empty({ icon = 'info', text }: { icon?: IconName; text: string }) {
  return (
    <div className="empty">
      <Icon name={icon} size={30} />
      <div style={{ marginTop: 6 }}>{ar(text)}</div>
    </div>
  );
}

/* ── Toast ─────────────────────────────────────────────────────────────── */
export function Toast({ text, tone = 'ok' }: { text: string; tone?: 'ok' | 'no' }) {
  return (
    <div className="toast" role="status" style={tone === 'no' ? { background: 'var(--no)' } : undefined}>
      <Icon name={tone === 'no' ? 'alert' : 'checkCircle'} size={18} />
      {ar(text)}
    </div>
  );
}

/* ── Stat tile ─────────────────────────────────────────────────────────── */
export function Stat({ icon, value, label }: { icon: IconName; value: string | number; label: string }) {
  return (
    <div className="stat">
      <span className="row" style={{ gap: 6, fontSize: 12, color: 'var(--mut)', fontWeight: 700 }}>
        <Icon name={icon} size={15} />
        {ar(label)}
      </span>
      <b>{typeof value === 'number' ? arNum(value) : ar(value)}</b>
    </div>
  );
}

/* ── Round badge (icon-only, never an emoji) ───────────────────────────── */
export function Badge({
  icon,
  tone = 'muted',
  size = 62,
}: {
  icon: IconName;
  tone?: 'good' | 'bad' | 'warn' | 'muted';
  size?: number;
}) {
  const bg =
    tone === 'good' ? 'var(--okb)' : tone === 'bad' ? 'var(--nob)' : tone === 'warn' ? 'var(--warnb)' : 'var(--gl)';
  const fg =
    tone === 'good' ? 'var(--ok)' : tone === 'bad' ? 'var(--no)' : tone === 'warn' ? 'var(--warn)' : 'var(--mut)';
  return (
    <span
      className="float"
      style={{
        width: size,
        height: size,
        flex: 'none',
        /* inline-grid, not grid: a block-level box ignores the parent's
           `text-align: center` and hugs the inline-start edge (the right side
           in RTL), which is why "أنهى الجميع الإجابة!" had its icon stuck in
           the corner. Flex/grid parents still blockify it, so those are fine. */
        display: 'inline-grid',
        placeItems: 'center',
        borderRadius: '50%',
        border: '2.5px solid var(--ink)',
        background: bg,
        color: fg,
        verticalAlign: 'middle',
      }}
      aria-hidden="true"
    >
      <Icon name={icon} size={Math.round(size * 0.46)} strokeWidth={2.1} />
    </span>
  );
}

/* ── Status chip ────────────────────────────────────────────────────────── */
const STATUS: Record<string, { t: string; c: string; i: IconName }> = {
  lobby: { t: 'بانتظار المعلّم', c: 'n', i: 'hourglass' },
  question: { t: 'جارية', c: '', i: 'play' },
  reveal: { t: 'نتيجة', c: 'g', i: 'eye' },
  between: { t: 'استراحة', c: '', i: 'pause' },
  finished: { t: 'انتهت', c: 'r', i: 'stop' },
};

export function StatusChip({ status }: { status: string }) {
  const m = STATUS[status] ?? STATUS.lobby!;
  return (
    <span className={`badge ${m.c}`}>
      <Icon name={m.i} size={12} style={{ verticalAlign: '-2px', marginInlineEnd: 3 }} />
      {ar(m.t)}
    </span>
  );
}

/* ── Progress bar ──────────────────────────────────────────────────────── */
export function Progress({ value, total, tone }: { value: number; total: number; tone?: 'hot' | 'warm' }) {
  const pct = total > 0 ? Math.min(100, Math.round((value / total) * 100)) : 0;
  return (
    <div className="bar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
      <i className={tone} style={{ width: `${pct}%` }} />
    </div>
  );
}