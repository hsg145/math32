import { useCallback, useEffect, useState } from 'react';
import { Icon } from '../lib/icons';
import { ar, arNum, fmtLine, secs } from '../lib/format';
import { Figure } from '../lib/graph';
import { Avatar, Empty, Loading } from '../lib/ui';
import { report } from '../lib/api';
import { errMsg } from '../lib/supabase';
import type { Option } from '../lib/types';

/* ═══════════════════════════════════════════════════════════════════════════
   Post-game report: standings, per-question accuracy, answer histograms,
   and a CSV export.
   ═══════════════════════════════════════════════════════════════════════════ */

interface Row {
  player_id: string;
  name: string;
  avatar: string;
  banner: string;
  total_points: number;
  correct: number;
  answered: number;
  skipped: number;
  best_ms: number | null;
  rank: number;
}

interface QRow {
  slot: number;
  lesson: number;
  body: string;
  correctIndex: number;
  options: Option[];
  answered: number;
  distribution: Record<string, number>;
}

interface Report {
  session: { title: string; status: string; question_seconds: number; total_questions: number };
  code: { code: string; usedCount: number } | null;
  leaderboard: Row[];
  questions: QRow[];
}

const LETTERS = ['أ', 'ب', 'ج', 'د'];

export function ReportPanel({ sessionId }: { sessionId: string | null }) {
  const [data, setData] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!sessionId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      setData((await report(sessionId)) as unknown as Report);
      setErr(null);
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) return <Loading label="جارٍ إعداد التقرير…" />;
  if (!sessionId) return <Empty icon="chart" text="أنشئ جلسة أولاً" />;
  if (err)
    return (
      <section className="card">
        <div className="err">
          <Icon name="alert" size={18} />
          {ar(err)}
        </div>
      </section>
    );
  if (!data) return null;

  const rows = data.leaderboard;
  const top = Math.max(1, ...rows.map((r) => r.total_points));
  const totalQ = data.session.total_questions || data.questions.length;
  const avgCorrect = rows.length
    ? rows.reduce((a, r) => a + r.correct, 0) / rows.length
    : 0;

  const csv = useCallback(() => {
    const head = ['الترتيب', 'الاسم', 'النقاط', 'الصحيحة', 'المجابة', 'لم يجب', 'أسرع (ث)'];
    const lines = [
      head.join(','),
      ...rows.map((r) =>
        [
          r.rank,
          `"${r.name.replace(/"/g, '""')}"`,
          r.total_points,
          r.correct,
          r.answered,
          r.skipped,
          r.best_ms != null ? (r.best_ms / 1000).toFixed(2) : '',
        ].join(','),
      ),
    ];
    const blob = new Blob([`﻿${lines.join('\n')}`], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${data.session.title.replace(/[^\p{L}\p{N}]+/gu, '-')}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }, [data.session.title, rows]);

  return (
    <div>
      <section className="card" style={{ marginBottom: 16 }}>
        <div className="spread" style={{ flexWrap: 'wrap', gap: 10 }}>
          <div>
            <h1 style={{ fontSize: 'clamp(20px,4vw,30px)', margin: 0 }}>{ar(data.session.title)}</h1>
            <p className="mut tiny" style={{ margin: 0 }}>
              {`${ar(totalQ)} سؤال · ${ar(rows.length)} طالب · ${ar(data.session.question_seconds)} ثانية لكل سؤال`}
            </p>
          </div>
          <div className="row" style={{ gap: 8 }}>
            <button className="btn xs alt" onClick={() => void load()}>
              <Icon name="refresh" size={15} />
              تحديث
            </button>
            <button className="btn xs" onClick={csv} disabled={!rows.length}>
              <Icon name="copy" size={15} />
              تصدير CSV
            </button>
          </div>
        </div>

        <div className="stats">
          <div className="stat">
            <b>{ar(rows.length)}</b>
            <span>طالب</span>
          </div>
          <div className="stat">
            <b>{arNum(Math.round(avgCorrect * 10) / 10)}</b>
            <span>متوسط الصواب</span>
          </div>
          <div className="stat">
            <b>{arNum(top)}</b>
            <span>أعلى نقاط</span>
          </div>
          <div className="stat">
            <b>{ar(data.code?.code ?? '—')}</b>
            <span>الكود</span>
          </div>
        </div>
      </section>

      {rows.length === 0 ? (
        <Empty icon="users" text="لا توجد نتائج بعد" />
      ) : (
        <section className="card">
          <h3 style={{ marginTop: 0 }}>
            <Icon name="trophy" size={18} style={{ verticalAlign: '-3px', marginInlineEnd: 6 }} />
            الترتيب النهائي
          </h3>
          <div className="lb">
            {rows.map((r, i) => (
              <div
                key={r.player_id}
                className={`row ${r.rank <= 3 ? `top${r.rank}` : ''}`}
                style={{ '--i': Math.min(i, 20) } as React.CSSProperties}
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
        </section>
      )}

      {data.questions.length > 0 && (
        <section className="card" style={{ marginTop: 16 }}>
          <h3 style={{ marginTop: 0 }}>
            <Icon name="chart" size={18} style={{ verticalAlign: '-3px', marginInlineEnd: 6 }} />
            تحليل الأسئلة
          </h3>
          <div style={{ display: 'grid', gap: 12 }}>
            {data.questions.map((q) => {
              const total = Math.max(1, q.answered);
              const pct = Math.round((q.answered / Math.max(1, rows.length)) * 100);
              const hit = q.options[q.correctIndex];
              return (
                <div key={q.slot} className="qitem" style={{ '--i': 0 } as React.CSSProperties}>
                  <span className="num">{ar(q.slot + 1)}</span>
                  <div className="body">
                    <p dangerouslySetInnerHTML={{ __html: fmtLine(q.body) }} />
                    <div className="dist">
                      {LETTERS.map((L, i) => (
                        <div key={L} className={i === q.correctIndex ? 'hit' : ''}>
                          <span>{ar(L)}</span>
                          <i>
                            <u
                              style={{
                                width: `${((q.distribution[String(i)] ?? 0) / total) * 100}%`,
                              }}
                            />
                          </i>
                          <span style={{ direction: 'ltr' }}>{arNum(q.distribution[String(i)] ?? 0)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div className="stat" style={{ padding: '4px 10px', boxShadow: '2px 2px 0 var(--ink)' }}>
                      <b style={{ fontSize: 18 }}>{arNum(pct)}٪</b>
                      <span>أجابوا</span>
                    </div>
                    {hit?.kind === 'figure' && (
                      <div style={{ width: 120, marginTop: 6 }}>
                        <Figure spec={hit.figure} />
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <p className="tiny mut" style={{ marginBottom: 0 }}>
            {`أسرع زمن إجابة في الجلسة: ${secs(Math.min(...rows.map((r) => r.best_ms ?? Infinity)))}`}
          </p>
        </section>
      )}
    </div>
  );
}