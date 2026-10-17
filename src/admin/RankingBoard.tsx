import type { CSSProperties } from 'react';
import { Icon } from '../lib/icons';
import { ar, arNum } from '../lib/format';
import { Avatar } from '../lib/ui';
import type { SyncPayload } from '../lib/types';

/* ═══════════════════════════════════════════════════════════════════════════
   The full class ranking, first seat to last.

   Deliberately its own module: it is shown on the live-round tab *and* under
   the student-screen mirror, and keeping it free of the api/live layer lets
   the render harness pull it in without dragging `import.meta.env` along.
   ═══════════════════════════════════════════════════════════════════════════ */

export function RankingBoard({ data }: { data: SyncPayload }) {
  const rows = data.leaderboard;
  if (!rows.length) return null;
  const top = Math.max(1, ...rows.map((r) => r.total_points));

  return (
    <section className="card" style={{ marginTop: 16 }}>
      <div className="spread" style={{ marginBottom: 10 }}>
        <h3 style={{ margin: 0 }}>
          <Icon name="trophy" size={18} style={{ verticalAlign: '-3px', marginInlineEnd: 6 }} />
          ترتيب الطلاب
        </h3>
        <span className="badge n">{`${ar(rows.length)} طالب`}</span>
      </div>

      {/* Every seat, first to last. The list scrolls internally so a class of
          200 never pushes the rest of the dashboard off the screen. */}
      <div className="lb-scroll">
        <div className="lb">
          {rows.map((r, i) => (
            <div
              key={r.player_id}
              className={`row ${r.rank <= 3 ? `top${r.rank}` : ''}`}
              style={{ '--i': i } as CSSProperties}
            >
              <span className="who">
                <span className="rk">{ar(r.rank)}</span>
                <Avatar emoji={r.avatar} banner={r.banner} />
                <b>{ar(r.name)}</b>
              </span>
              <i>
                <u style={{ width: `${(r.total_points / top) * 100}%` }} />
              </i>
              <span className="pts">{arNum(r.total_points)}</span>
            </div>
          ))}
        </div>
      </div>

      <p className="center tiny mut" style={{ margin: '10px 0 0' }}>
        {`المتصدر ${ar(rows[0]!.name)} · الأخير ${ar(rows[rows.length - 1]!.name)}`}
      </p>
    </section>
  );
}
