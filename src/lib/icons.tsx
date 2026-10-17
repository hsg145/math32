import type { SVGProps } from 'react';

/* ═══════════════════════════════════════════════════════════════════════════
   Line-icon set (no emoji anywhere in the UI chrome).
   ═══════════════════════════════════════════════════════════════════════════ */

export type IconName =
  | 'logo'
  | 'users'
  | 'user'
  | 'crown'
  | 'trophy'
  | 'clock'
  | 'play'
  | 'pause'
  | 'stop'
  | 'skip'
  | 'next'
  | 'refresh'
  | 'lock'
  | 'unlock'
  | 'key'
  | 'link'
  | 'copy'
  | 'check'
  | 'checkCircle'
  | 'x'
  | 'xCircle'
  | 'alert'
  | 'info'
  | 'hourglass'
  | 'sparkle'
  | 'eye'
  | 'trash'
  | 'edit'
  | 'plus'
  | 'minus'
  | 'grid'
  | 'list'
  | 'logout'
  | 'sun'
  | 'moon'
  | 'settings'
  | 'chart'
  | 'signal'
  | 'signalOff'
  | 'door'
  | 'dice'
  | 'flame'
  | 'bolt'
  | 'send'
  | 'shield'
  | 'book'
  | 'arrowUp'
  | 'chevron';

const P: Record<IconName, string> = {
  logo: 'M4 12.5 9.2 18 20 6.5',
  users:
    'M16 19v-1.6a3.4 3.4 0 0 0-3.4-3.4H6.4A3.4 3.4 0 0 0 3 17.4V19M9.5 10.6a3.6 3.6 0 1 0 0-7.2 3.6 3.6 0 0 0 0 7.2M21 19v-1.6a3.4 3.4 0 0 0-2.6-3.3M15.6 3.6a3.6 3.6 0 0 1 0 6.9',
  user: 'M19 20v-1.8a3.8 3.8 0 0 0-3.8-3.8H8.8A3.8 3.8 0 0 0 5 18.2V20M12 10.6a3.8 3.8 0 1 0 0-7.6 3.8 3.8 0 0 0 0 7.6',
  crown: 'M3 17.5 4.6 6.8l5.1 3.6L12 4.6l2.3 5.8 5.1-3.6L21 17.5zM3 20.4h18',
  trophy:
    'M7 4h10v5a5 5 0 0 1-10 0zM7 6H4.5v1.6A3.4 3.4 0 0 0 7.9 11M17 6h2.5v1.6A3.4 3.4 0 0 1 16.1 11M12 14v3.6M8.4 20.4h7.2M9.6 17.6h4.8l.9 2.8H8.7z',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18M12 7.2V12l3.2 1.9',
  play: 'M7.5 4.8 19 12 7.5 19.2z',
  pause: 'M9 4.8v14.4M15 4.8v14.4',
  stop: 'M6.4 6.4h11.2v11.2H6.4z',
  skip: 'M5.5 4.8 15 12 5.5 19.2zM18.6 4.8v14.4',
  next: 'M9 5.5 15.5 12 9 18.5M18.5 5v14',
  refresh: 'M20 11.5A8 8 0 1 0 18.4 17M20 4.8v6.7h-6.7',
  lock: 'M6.6 10.6h10.8v9.2H6.6zM8.8 10.6V7.4a3.2 3.2 0 0 1 6.4 0v3.2',
  unlock: 'M6.6 10.6h10.8v9.2H6.6zM8.8 10.6V7.4a3.2 3.2 0 0 1 6.1-1.3',
  key: 'M14.6 3.6a5 5 0 1 0-4.1 8.3L3.6 18.8v2.2h2.2l1.1-1.1v-1.7h1.7l1-1v-1.7h1.6l1.1-1.1a5 5 0 0 0 3.3-9.8M16.4 7.8h.01',
  link: 'M9.6 13.2a3.8 3.8 0 0 0 5.7.4l2.5-2.5a3.8 3.8 0 0 0-5.4-5.4l-1.4 1.4M14.4 10.8a3.8 3.8 0 0 0-5.7-.4l-2.5 2.5a3.8 3.8 0 0 0 5.4 5.4l1.4-1.4',
  copy: 'M9 9.2h9.4a1 1 0 0 1 1 1v9.4a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1v-9.4a1 1 0 0 1 1-1M5.4 15.2a1 1 0 0 1-1-1V4.8a1 1 0 0 1 1-1h9.4a1 1 0 0 1 1 1',
  check: 'M4.8 12.6 9.8 17.6 19.4 7',
  checkCircle: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18M8.4 12.2 11 14.8 16 9.4',
  x: 'M6 6l12 12M18 6 6 18',
  xCircle: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18M9.4 9.4l5.2 5.2M14.6 9.4l-5.2 5.2',
  alert: 'M12 4.2 21 19.4H3zM12 10v4M12 16.6h.01',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18M12 11v5.2M12 7.9h.01',
  hourglass: 'M6.6 3.4h10.8M6.6 20.6h10.8M7.4 3.4v3.4c0 2.2 4.6 3.6 4.6 5.2s-4.6 3-4.6 5.2v3.4M16.6 3.4v3.4c0 2.2-4.6 3.6-4.6 5.2s4.6 3 4.6 5.2v3.4',
  sparkle: 'M12 3.2 13.9 9 19.8 10.9 13.9 12.8 12 18.6 10.1 12.8 4.2 10.9 10.1 9zM18.4 3v3M16.9 4.5h3',
  eye: 'M2.4 12S6 5.4 12 5.4 21.6 12 21.6 12 18 18.6 12 18.6 2.4 12 2.4 12M12 14.8a2.8 2.8 0 1 0 0-5.6 2.8 2.8 0 0 0 0 5.6',
  trash: 'M4.6 6.6h14.8M9.4 6.6V4.4h5.2v2.2M6.6 6.6l.9 13h9l.9-13M10.2 10.2v5.6M13.8 10.2v5.6',
  edit: 'M15.6 4.6l3.8 3.8M4.6 19.4l.9-3.8L15.9 5.2a1.6 1.6 0 0 1 2.3 0l1.4 1.4a1.6 1.6 0 0 1 0 2.3L9.2 19.3l-4.6 1.1',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  grid: 'M4 4h6.4v6.4H4zM13.6 4H20v6.4h-6.4zM4 13.6h6.4V20H4zM13.6 13.6H20V20h-6.4z',
  list: 'M8.6 6.4H20M8.6 12H20M8.6 17.6H20M4 6.4h.01M4 12h.01M4 17.6h.01',
  logout: 'M9.4 20.4H5.6a1.6 1.6 0 0 1-1.6-1.6V5.2A1.6 1.6 0 0 1 5.6 3.6h3.8M15.4 16.6l4.6-4.6-4.6-4.6M20 12H9.4',
  sun: 'M12 16.4a4.4 4.4 0 1 0 0-8.8 4.4 4.4 0 0 0 0 8.8M12 2.6v2M12 19.4v2M4.4 12h-2M21.6 12h-2M6.6 6.6 5.2 5.2M18.8 18.8l-1.4-1.4M6.6 17.4l-1.4 1.4M18.8 5.2l-1.4 1.4',
  moon: 'M20.4 14.2A8.6 8.6 0 1 1 9.8 3.6a6.8 6.8 0 0 0 10.6 10.6',
  settings:
    'M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4M19.2 14.6a1.5 1.5 0 0 0 .3 1.7l.1.1a1.8 1.8 0 1 1-2.6 2.6l-.1-.1a1.5 1.5 0 0 0-1.7-.3 1.5 1.5 0 0 0-.9 1.4v.2a1.8 1.8 0 1 1-3.6 0v-.1a1.5 1.5 0 0 0-1-1.4 1.5 1.5 0 0 0-1.7.3l-.1.1a1.8 1.8 0 1 1-2.6-2.6l.1-.1a1.5 1.5 0 0 0 .3-1.7 1.5 1.5 0 0 0-1.4-.9h-.2a1.8 1.8 0 0 1 0-3.6h.1a1.5 1.5 0 0 0 1.4-1 1.5 1.5 0 0 0-.3-1.7l-.1-.1a1.8 1.8 0 1 1 2.6-2.6l.1.1a1.5 1.5 0 0 0 1.7.3h.1a1.5 1.5 0 0 0 .9-1.4v-.2a1.8 1.8 0 0 1 3.6 0v.1a1.5 1.5 0 0 0 .9 1.4 1.5 1.5 0 0 0 1.7-.3l.1-.1a1.8 1.8 0 1 1 2.6 2.6l-.1.1a1.5 1.5 0 0 0-.3 1.7v.1a1.5 1.5 0 0 0 1.4.9h.2a1.8 1.8 0 0 1 0 3.6h-.1a1.5 1.5 0 0 0-1.4.9',
  chart: 'M4.4 20V4.4M4.4 20h15.2M8 16.4v-4.2M12 16.4V8M16 16.4v-6.2',
  signal: 'M4 20v-3.6M9.4 20v-7.2M14.8 20v-11M20.2 20V5',
  signalOff: 'M3 3l18 18M9.4 20v-7.2M14.8 20v-11M20.2 20V9M4 20v-3.6',
  door: 'M6.4 20.8V4.6a1.2 1.2 0 0 1 1.4-1.2l8.8 1.6a1.2 1.2 0 0 1 1 1.2v14.6M6.4 20.8h12.8M13.8 12.6h.01',
  dice: 'M4.6 4.6h14.8v14.8H4.6zM9 9h.01M15 9h.01M12 12h.01M9 15h.01M15 15h.01',
  flame: 'M12 21c3.3 0 6-2.4 6-5.6 0-4-4.4-5.4-3.4-10.4-2.6.8-4 3-4 5.2 0 1.2.4 2 .4 2.6 0 1-.8 1.6-1.6 1.6-1 0-1.8-.8-1.8-2.2-1 1.2-1.6 2.6-1.6 3.2C6 18.6 8.7 21 12 21',
  bolt: 'M13.4 2.6 4 13.8h6.6L10.6 21.4 20 10.2h-6.6z',
  send: 'M21 3 3 10.6l7.2 2.8L13 21zM10.2 13.4 21 3',
  shield: 'M12 21s7.4-3.4 7.4-9.4V5.6L12 3 4.6 5.6v6C4.6 17.6 12 21 12 21M9.4 12.2l1.8 1.8 3.6-3.6',
  book: 'M4 4.6h6a3 3 0 0 1 3 3v12a2.4 2.4 0 0 0-2.4-2.4H4zM20 4.6h-6a3 3 0 0 0-3 3v12a2.4 2.4 0 0 1 2.4-2.4H20z',
  arrowUp: 'M12 19V5M5.6 11.4 12 5l6.4 6.4',
  chevron: 'M9 5.5 15.5 12 9 18.5',
};

/** Icons that read better as a filled shape than a stroked outline. */
const FILLED: Partial<Record<IconName, boolean>> = {
  logo: false,
  play: true,
  stop: true,
  skip: true,
  crown: false,
  bolt: true,
  sparkle: true,
  sun: true,
  moon: true,
  door: false,
};

export function Icon({
  name,
  size = 20,
  className = '',
  strokeWidth = 1.9,
  ...rest
}: { name: IconName; size?: number; className?: string; strokeWidth?: number } & Omit<
  SVGProps<SVGSVGElement>,
  'name' | 'size'
>) {
  const d = P[name];
  const filled = FILLED[name] ?? false;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={`ic ${className}`}
      fill="none"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      <path
        d={d}
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill={filled ? 'currentColor' : 'none'}
      />
    </svg>
  );
}

export function BrandMark({ size = 34 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" className="brand" aria-hidden="true">
      <rect width="40" height="40" rx="11" fill="var(--ink)" />
      <path
        d="M11 21l6 6 12-14"
        stroke="var(--gold)"
        strokeWidth="4"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}