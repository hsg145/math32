import { useId, useMemo } from 'react';
import type { FigureCurve, FigureSpec, NumberLineSpec } from './types';
import { arNum } from './format';

/* ═══════════════════════════════════════════════════════════════════════════
   Cartesian-plot renderer — a port of the original `G()` function, driven by a
   declarative JSON spec so figures can live in Postgres and be shipped to any
   client. Output markup is byte-for-byte equivalent to the source design.
   ═══════════════════════════════════════════════════════════════════════════ */

const PAD = 20;
const GRID = '#dbe3f7';
const AXIS = '#16204f';

function evalCurve(k: FigureCurve, x: number): number {
  switch (k.kind) {
    case 'poly':
      return k.c.reduce<number>((acc, cf, i) => acc + cf * x ** i, 0);
    case 'sqrt':
      return Math.sqrt(x - (k.h ?? 0)) + (k.k ?? 0);
    case 'abs':
      return Math.abs(x - (k.h ?? 0)) + (k.k ?? 0);
  }
}

function curveDomain(k: FigureCurve, x: [number, number]): [number, number] {
  return k.domain ?? x;
}

export function Figure({ spec, className = '' }: { spec: FigureSpec; className?: string }) {
  const rawId = useId();
  const clipId = `k${rawId.replace(/[^a-zA-Z0-9]/g, '')}`;

  const geo = useMemo(() => {
    const [a, b] = spec.x;
    const [c, d] = spec.y;
    const W = spec.width ?? 300;
    const H = spec.height ?? (W * (d - c)) / (b - a);
    const ux = W / (b - a);
    const uy = H / (d - c);
    const gx = spec.gridX ?? 1;
    const gy = spec.gridY ?? 1;
    const X = (x: number) => PAD + (x - a) * ux;
    const Y = (y: number) => PAD + (d - y) * uy;

    const ticksX: number[] = [];
    for (let x = Math.ceil(a / gx) * gx; x <= b + 1e-9; x += gx) ticksX.push(x);
    const ticksY: number[] = [];
    for (let y = Math.ceil(c / gy) * gy; y <= d + 1e-9; y += gy) ticksY.push(y);

    const ax = Math.min(Math.max(0, a), b);
    const ay = Math.min(Math.max(0, c), d);

    const paths = (spec.curves ?? []).map((k) => {
      const [lo, hi] = curveDomain(k, spec.x);
      let path = '';
      let started = false;
      const STEPS = 240;
      for (let i = 0; i <= STEPS; i++) {
        const x = lo + ((hi - lo) * i) / STEPS;
        const y = evalCurve(k, x);
        if (!Number.isFinite(y)) {
          started = false;
          continue;
        }
        path += `${started ? 'L' : 'M'}${X(x).toFixed(1)} ${Y(y).toFixed(1)}`;
        started = true;
      }
      return { k, path };
    });

    return { a, b, c, d, W, H, gx, gy, X, Y, ticksX, ticksY, ax, ay, paths };
  }, [spec]);

  const { a, b, c, d, W, H, X, Y, ticksX, ticksY, ax, ay, paths } = geo;
  const showLabels = spec.labels !== false;

  return (
    <svg
      viewBox={`0 0 ${W + 2 * PAD} ${H + 2 * PAD}`}
      className={`fig ${className}`}
      role="img"
      aria-label="رسم بياني في المستوى الديكارتي"
    >
      <defs>
        <clipPath id={clipId}>
          <rect x={PAD} y={PAD} width={W} height={H} />
        </clipPath>
      </defs>

      <rect x={PAD} y={PAD} width={W} height={H} fill="#fff" />

      {ticksX.map((x) => (
        <line key={`vx${x}`} x1={X(x)} x2={X(x)} y1={PAD} y2={PAD + H} stroke={GRID} strokeWidth={1} />
      ))}
      {ticksY.map((y) => (
        <line key={`vy${y}`} y1={Y(y)} y2={Y(y)} x1={PAD} x2={PAD + W} stroke={GRID} strokeWidth={1} />
      ))}

      <g stroke={AXIS} strokeWidth={1.6} fill={AXIS}>
        <line x1={PAD} x2={PAD + W} y1={Y(ay)} y2={Y(ay)} />
        <line y1={PAD} y2={PAD + H} x1={X(ax)} x2={X(ax)} />
        <path
          stroke="none"
          d={`M${PAD + W + 2} ${Y(ay)}l-8-4v8zM${X(ax)} ${PAD - 2}l-4 8h8z`}
        />
      </g>

      {showLabels && (
        <>
          <g fontSize={10} fill={AXIS} textAnchor="middle" fontFamily="sans-serif">
            {ticksX.map((x) =>
              Math.abs(x) > 1e-9 ? (
                <text key={`lx${x}`} x={X(x)} y={Y(ay) + (ay > c + 1e-9 ? 12 : -4)}>
                  {arNum(Number(x.toFixed(2)))}
                </text>
              ) : null,
            )}
            {ticksY.map((y) =>
              Math.abs(y) > 1e-9 ? (
                <text key={`ly${y}`} x={X(ax) - 4} y={Y(y) + 3} textAnchor="end">
                  {arNum(Number(y.toFixed(2)))}
                </text>
              ) : null,
            )}
          </g>
          <text x={PAD + W - 2} y={Y(ay) - 8} fontSize={13} fontWeight={700} textAnchor="end" fill={AXIS}>
            س
          </text>
          <text x={X(ax) + 8} y={PAD + 11} fontSize={13} fontWeight={700} fill={AXIS}>
            ص
          </text>
        </>
      )}

      <g clipPath={`url(#${clipId})`} fill="none">
        {(spec.hlines ?? []).map((h, i) => (
          <line
            key={`h${i}`}
            x1={PAD}
            x2={PAD + W}
            y1={Y(h.y)}
            y2={Y(h.y)}
            stroke={h.color}
            strokeWidth={1.5}
            strokeDasharray="5 4"
          />
        ))}

        {paths.map(({ k, path }, i) => (
          <path
            key={`c${i}`}
            className="cv"
            pathLength={1}
            d={path}
            stroke={k.color}
            strokeWidth={k.width ?? 2.6}
            strokeDasharray={k.dash ? '0.02 0.015' : undefined}
            strokeLinecap="round"
          />
        ))}
      </g>

      {(spec.points ?? []).map((p, i) => (
        <g key={`p${i}`}>
          <circle
            cx={X(p.x)}
            cy={Y(p.y)}
            r={4.6}
            fill={p.open ? '#fff' : (p.color ?? AXIS)}
            stroke={p.color ?? AXIS}
            strokeWidth={2}
          />
          {p.label && (
            <text
              x={X(p.x) + 7}
              y={Y(p.y) - 7}
              fontSize={13}
              fontWeight={700}
              fill={p.color ?? AXIS}
            >
              {p.label}
            </text>
          )}
        </g>
      ))}

      {(spec.texts ?? []).map((t, i) => (
        <text key={`t${i}`} x={X(t.x)} y={Y(t.y)} fontSize={15} fontWeight={800} fill={t.color}>
          {t.text}
        </text>
      ))}

      <desc>{`المستوى من ${a} إلى ${b} على محور السينات، ومن ${c} إلى ${d} على محور الصادات.`}</desc>
      <rect x={PAD} y={PAD} width={W} height={H} fill="none" stroke="none" data-range={`${a},${b},${c},${d}`} />
    </svg>
  );
}

/* ── Sign line (خط الأعداد) ────────────────────────────────────────────── */
export function NumberLine({
  spec,
  className = '',
}: {
  spec: NumberLineSpec;
  className?: string;
}) {
  const n = spec.points.length;
  const W = 320;
  const step = W / (n + 1);

  return (
    <svg viewBox={`0 0 ${W + 40} 62`} className={`nl ${className}`} role="img" aria-label="خط الأعداد">
      <g stroke="currentColor" strokeWidth={2} fill="currentColor">
        <line x1={8} x2={W + 32} y1={32} y2={32} />
        <path stroke="none" d={`M6 32l9-5v10zM${W + 34} 32l-9-5v10z`} />
      </g>
      {/* n roots divide the line into n+1 intervals — the original draws them all */}
      {Array.from({ length: spec.points.length + 1 }, (_, i) => (
        <text
          key={`s${i}`}
          x={20 + step * (i + 0.5)}
          y={22}
          textAnchor="middle"
          fontSize={22}
          fontWeight={800}
          fill={spec.signs[i] === '+' ? '#0a9b6e' : '#d6336c'}
        >
          {spec.signs[i]}
        </text>
      ))}
      {spec.points.map((v, i) => (
        <g key={`v${i}`}>
          <circle
            cx={20 + step * (i + 1)}
            cy={32}
            r={5}
            fill={spec.closed?.[i] ? 'currentColor' : '#fff'}
            stroke="currentColor"
            strokeWidth={2}
          />
          <text x={20 + step * (i + 1)} y={55} textAnchor="middle" fontSize={13} fill="currentColor">
            {arNum(v)}
          </text>
        </g>
      ))}    </svg>
  );
}