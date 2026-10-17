import { useEffect, useMemo, useRef } from 'react';
import { BrandMark, Icon } from '../lib/icons';
import { ar, arNum, secs } from '../lib/format';
import { Avatar, ScoreRing, confetti } from '../lib/ui';
import type { SyncPayload } from '../lib/types';
import { navigate } from '../lib/router';

/* ═══════════════════════════════════════════════════════════════════════════
   End-of-game board: podium, personal score card, and the 24-question map.
   ═══════════════════════════════════════════════════════════════════════════ */

/* 1st / 2nd / 3rd are drawn as numbered discs — no emoji in the chrome. */
const PODIUM = { 1: 'p1', 2: 'p2', 3: 'p3' } as const;

export function FinalBoard({ data }: { data: SyncPayload }) {
  const meId = data.me?.playerId ?? '';
  const rows = data.leaderboard;
  const my = rows.find((r) => r.player_id === meId);
  const celebrated = useRef(false);

  const total = data.session.totalQuestions;
  const settled = data.myResults.length;
  const correct = data.myResults.filter((r) => r.correct).length;
  const answered = data.myResults.filter((r) => r.answered).length;
  const points = my?.total_points ?? 0;
  const rank = my?.rank ?? 0;

  useEffect(() => {
    if (celebrated.current) return;
    celebrated.current = true;
    if (rank === 1 || rank > 0) confetti(rank <= 3 ? 70 : 40);
  }, [rank]);

  const message = useMemo(() => {
    if (!rank) return 'شكراً لمشاركتك';
    if (rank === 1) return 'المركز الأول — أداء رائع!';
    if (rank <= 3) return 'على منصة التتويج، أحسنت!';
    const p = total ? correct / total : 0;
    if (p >= 0.8) return 'أداء ممتاز، واصل تميّزك.';
    if (p >= 0.6) return 'نتيجة جيدة جداً، بخطوات بسيطة للكمال.';
    if (p >= 0.4) return 'نتيجة مقبولة — راجع الأخطاء وحاول مرة أخرى.';
    return 'راجع الدروس الستة ثم أعد المحاولة.';
  }, [rank, correct, total]);

  const top = rows.slice(0, 3);
  const order = [top[1], top[0], top[2]].filter(Boolean);

  return (
    <>
      <section className="card res">
        <div className="row" style={{ justifyContent: 'center', gap: 10 }}>
          <BrandMark size={38} />
          <h1 style={{ margin: 0, fontSize: 'clamp(22px,5vw,32px)' }}>نتيجتك النهائية</h1>
        </div>

        <p className="mut tiny" style={{ margin: '4px 0 0' }}>{ar(data.session.title)}</p>

        <ScoreRing correct={correct} total={total} />

        <div className="row" style={{ justifyContent: 'center', gap: 12, margin: '6px 0 14px' }}>
          <div className="stat" style={{ boxShadow: '3px 3px 0 var(--ink)' }}>
            <b>{arNum(points)}</b>
            <span>نقاطك</span>
          </div>
          <div className="stat" style={{ boxShadow: '3px 3px 0 var(--ink)' }}>
            <b>{rank ? ar(rank) : '—'}</b>
            <span>ترتيبك</span>
          </div>
          <div className="stat" style={{ boxShadow: '3px 3px 0 var(--ink)' }}>
            <b>{arNum(correct)}</b>
            <span>صحيح</span>
          </div>
          <div className="stat" style={{ boxShadow: '3px 3px 0 var(--ink)' }}>
            <b>{arNum(total - answered)}</b>
            <span>لم تُجب</span>
          </div>
        </div>

        <h2>{ar(message)}</h2>

        {top.length > 1 && (
          <div className="podium">
            {order.map((r, i) => {
              const place = r!.rank;
              const cls = PODIUM[place as 1 | 2 | 3] ?? 'p3';
              return (
                <div key={r!.player_id} className={`pod ${cls}`} style={{ '--i': i } as React.CSSProperties}>
                  <span style={{ position: 'relative', display: 'grid', placeItems: 'center' }}>
                    <Avatar emoji={r!.avatar} banner={r!.banner} size="lg" />
                    <span
                      style={{
                        position: 'absolute',
                        insetInlineStart: -4,
                        bottom: -6,
                        display: 'grid',
                        placeItems: 'center',
                        width: 30,
                        height: 30,
                        borderRadius: '50%',
                        border: '2px solid var(--ink)',
                        background: place === 1 ? 'var(--gold)' : place === 2 ? '#cfd9f4' : '#e0a06a',
                        color: '#16204f',
                        fontWeight: 800,
                        fontSize: 15,
                        direction: 'ltr',
                      }}
                    >
                      {ar(place)}
                    </span>
                  </span>
                  <span className="cap">{ar(r!.player_id === meId ? 'أنت' : r!.name)}</span>
                  <div className="plinth">{arNum(r!.total_points)}</div>
                </div>
              );
            })}
          </div>
        )}

        {my && (
          <p className="tiny mut">
            {`أسرع إجابة: ${secs(my.best_ms)} · أجبت ${ar(my.answered)} من ${ar(total)}`}
          </p>
        )}

        <h3 className="mut tiny" style={{ marginTop: 16 }}>
          خريطة الأسئلة
        </h3>
        <div className="cs">
          {Array.from({ length: total }, (_, i) => {
            const r = data.myResults.find((x) => x.slot === i);
            const cls = !r ? '' : r.correct ? 'ok' : r.answered ? 'no' : '';
            return (
              <button
                key={i}
                type="button"
                className={cls}
                title={`السؤال ${ar(i + 1)}${r ? (r.correct ? ' — صحيح' : r.answered ? ' — خطأ' : ' — لم تُجب') : ' — لم يُسأل بعد'}`}
                onClick={() => {
                  const el = document.getElementById(`qmap-${i}`);
                  el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }}
              >
                {ar(i + 1)}
              </button>
            );
          })}
        </div>

        <div className="row" style={{ justifyContent: 'center', marginTop: 8 }}>
          <button className="btn alt" onClick={() => navigate('/join')}>
            <Icon name="refresh" size={18} />
            دخول بجولة جديدة
          </button>
        </div>
      </section>

      {/* full per-question review */}
      {settled > 0 && (
        <section className="card" style={{ marginTop: 16 }}>
          <h3 className="mut tiny">ملخص كل جولة</h3>
          <div className="lb">
            {data.myResults.map((r, i) => (
              <div
                key={r.slot}
                id={`qmap-${r.slot}`}
                className="row"
                style={{ gridTemplateColumns: '78px 1fr 54px', '--i': i } as React.CSSProperties}
              >
                <span className="who">
                  <b>{`السؤال ${ar(r.slot + 1)}`}</b>
                </span>
                <i>
                  <u
                    style={{
                      width: `${total ? Math.max(6, (r.points / 1000) * 100) : 0}%`,
                      background: r.correct ? 'var(--ok)' : r.answered ? 'var(--no)' : 'var(--gl)',
                    }}
                  />
                </i>
                <span className="pts">{arNum(r.points)}</span>
              </div>
            ))}
          </div>
          <p className="center mut tiny">
            {`النقاط تعتمد على الصواب وسرعة الإجابة — الحد الأقصى ١٠٠٠ نقطة لكل سؤال`}
          </p>
        </section>
      )}

      <FullLeaderboard rows={rows} meId={meId} />
    </>
  );
}

function FullLeaderboard({ rows, meId }: { rows: SyncPayload['leaderboard']; meId: string }) {
  if (rows.length < 2) return null;
  const top = Math.max(1, ...rows.map((r) => r.total_points));
  return (
    <section className="card" style={{ marginTop: 16 }}>
      <h3 style={{ marginTop: 0 }}>
        <Icon name="trophy" size={18} style={{ verticalAlign: '-3px', marginInlineEnd: 6 }} />
        لوحة الترتيب الكاملة
      </h3>
      <div className="lb">
        {rows.map((r, i) => (
          <div
            key={r.player_id}
            className={`row ${r.player_id === meId ? 'me' : ''} ${r.rank <= 3 ? `top${r.rank}` : ''}`}
            style={{ '--i': Math.min(i, 20) } as React.CSSProperties}
          >
            <span className="who">
              <span className="rk">{ar(r.rank)}</span>
              <Avatar emoji={r.avatar} banner={r.banner} />
              <b>{ar(r.player_id === meId ? 'أنت' : r.name)}</b>
            </span>
            <i>
              <u style={{ width: `${(r.total_points / top) * 100}%` }} />
            </i>
            <span className="pts">{arNum(r.total_points)}</span>
          </div>
        ))}
      </div>
    </section>
  );
}