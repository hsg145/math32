import { useCallback, useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../lib/icons';
import { ar, fmtLine } from '../lib/format';
import { Figure, NumberLine } from '../lib/graph';
import { Empty, Loading, Toast } from '../lib/ui';
import { deleteQuestion, listQuestions, saveQuestion } from '../lib/api';
import { errMsg } from '../lib/supabase';
import { LESSONS } from '../lib/lessons';
import type { Option, Question, StoredQuestion } from '../lib/types';

/* ═══════════════════════════════════════════════════════════════════════════
   Question bank CRUD. Everything the teacher edits here is what the live game
   serves — including the figures, which are stored as declarative JSON.
   ═══════════════════════════════════════════════════════════════════════════ */

type Draft = Question & { id?: string; position: number; isActive?: boolean };

const emptyDraft = (position: number): Draft => ({
  lesson: 0,
  body: '',
  options: [
    { kind: 'text', text: '' },
    { kind: 'text', text: '' },
    { kind: 'text', text: '' },
    { kind: 'text', text: '' },
  ],
  correctIndex: 0,
  explanation: '',
  position,
});

export function QuestionManager({ sessionId, onChanged }: { sessionId: string | null; onChanged: () => void }) {
  const [rows, setRows] = useState<StoredQuestion[] | null>(null);
  const [editing, setEditing] = useState<Draft | null>(null);
  const [filter, setFilter] = useState<'all' | 'on' | 'off'>('all');
  const [toast, setToast] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setRows(await listQuestions());
      setErr(null);
    } catch (e) {
      setErr(errMsg(e));
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const flash = useCallback((t: string) => {
    setToast(t);
    window.setTimeout(() => setToast(null), 2400);
  }, []);

  const shown = useMemo(() => {
    if (!rows) return [];
    if (filter === 'on') return rows.filter((r) => r.isActive);
    if (filter === 'off') return rows.filter((r) => !r.isActive);
    return rows;
  }, [filter, rows]);

  const move = useCallback(
    async (q: StoredQuestion, dir: -1 | 1) => {
      if (!rows || busy) return;
      const list = [...rows];
      const i = list.findIndex((r) => r.id === q.id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= list.length) return;

      setBusy(true);
      try {
        [list[i], list[j]] = [list[j]!, list[i]!];
        const a = list[i]!;
        const b = list[j]!;
        await saveQuestion({ ...a, position: i });
        await saveQuestion({ ...b, position: j });
        setRows(list.map((r) => (r.id === a.id ? a : r.id === b.id ? b : r)));
        onChanged();
      } catch (e) {
        setErr(errMsg(e));
        await refresh();
      } finally {
        setBusy(false);
      }
    },
    [busy, onChanged, refresh, rows],
  );

  const toggle = useCallback(
    async (q: StoredQuestion) => {
      setBusy(true);
      try {
        await saveQuestion({ ...q, isActive: !q.isActive });
        await refresh();
        onChanged();
        flash(q.isActive ? 'أُوقف السؤال' : 'فُعّل السؤال');
      } catch (e) {
        setErr(errMsg(e));
      } finally {
        setBusy(false);
      }
    },
    [flash, onChanged, refresh],
  );

  const remove = useCallback(
    async (q: StoredQuestion) => {
      if (!confirm(`حذف السؤال؟\n${q.body.slice(0, 60)}…`)) return;
      setBusy(true);
      try {
        await deleteQuestion(q.id);
        await refresh();
        onChanged();
        flash('حُذف السؤال');
      } catch (e) {
        setErr(errMsg(e));
      } finally {
        setBusy(false);
      }
    },
    [flash, onChanged, refresh],
  );

  const importBank = useCallback(async () => {
    setBusy(true);
    try {
      const { QUESTION_BANK } = await import('../data/questionBank');
      const existing = await listQuestions();
      const known = new Set(existing.map((e) => e.body));
      let added = 0;
      for (let i = 0; i < QUESTION_BANK.length; i++) {
        const q = QUESTION_BANK[i]!;
        if (known.has(q.body)) continue;
        await saveQuestion({ ...q, position: existing.length + added, isActive: true });
        added++;
      }
      await refresh();
      onChanged();
      flash(added > 0 ? `أُضيف ${ar(added)} سؤالاً` : 'كل الأسئلة موجودة مسبقاً');
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setBusy(false);
    }
  }, [flash, onChanged, refresh]);

  const save = useCallback(
    async (draft: Draft) => {
      setBusy(true);
      try {
        await saveQuestion({ ...draft, id: draft.id } as never);
        await refresh();
        onChanged();
        setEditing(null);
        flash('حُفظ السؤال');
      } catch (e) {
        setErr(errMsg(e));
      } finally {
        setBusy(false);
      }
    },
    [flash, onChanged, refresh],
  );

  if (!rows) return <Loading label="جارٍ تحميل بنك الأسئلة…" />;

  return (
    <div>
      <section className="card" style={{ marginBottom: 16 }}>
        <div className="spread" style={{ flexWrap: 'wrap', gap: 10 }}>
          <div>
            <h1 style={{ fontSize: 'clamp(20px,4vw,30px)', margin: 0 }}>بنك الأسئلة</h1>
            <p className="mut tiny" style={{ margin: 0 }}>
              {`${ar(rows.length)} سؤال · ${ar(rows.filter((r) => r.isActive).length)} مفعّل`}
              {sessionId ? ' · اضغط «تحديث الأسئلة» في لوحة التحكم لتطبيق الترتيب' : ''}
            </p>
          </div>
          <div className="row" style={{ gap: 8 }}>
            <button className="btn xs alt" onClick={() => void importBank()} disabled={busy}>
              <Icon name="book" size={15} />
              استيراد بنك الوحدة الثانية
            </button>
            <button
              className="btn xs"
              onClick={() => setEditing(emptyDraft(rows.length))}
              disabled={busy}
            >
              <Icon name="plus" size={15} />
              سؤال جديد
            </button>
          </div>
        </div>

        <div className="row" style={{ marginTop: 12, gap: 6 }}>
          {(['all', 'on', 'off'] as const).map((f) => (
            <button
              key={f}
              className="btn xs alt"
              style={filter === f ? { background: 'var(--ink)', color: 'var(--card)' } : undefined}
              onClick={() => setFilter(f)}
            >
              {f === 'all' ? 'الكل' : f === 'on' ? 'المفعّلة' : 'الموقوفة'}
            </button>
          ))}
        </div>
      </section>

      {err && (
        <div className="err" style={{ marginBottom: 14 }}>
          <Icon name="alert" size={18} />
          {ar(err)}
        </div>
      )}

      {editing && (
        <QuestionEditor draft={editing} busy={busy} onCancel={() => setEditing(null)} onSave={save} />
      )}

      {shown.length === 0 ? (
        <Empty icon="list" text="لا توجد أسئلة هنا — استورد البنك أو أضف سؤالاً" />
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {shown.map((q, i) => (
            <div
              key={q.id}
              className={`qitem ${q.isActive ? '' : 'off'}`}
              style={{ '--i': Math.min(i, 20) } as CSSProperties}
            >
              <span className="num">{ar(q.position + 1)}</span>

              <div className="body">
                <p dangerouslySetInnerHTML={{ __html: fmtLine(q.body) }} />
                <div className="row tiny" style={{ gap: 6 }}>
                  <span className="badge n">{ar(LESSONS[q.lesson] ?? '')}</span>
                  <span className="badge g">{ar('أبجد'[q.correctIndex] ?? '?')}</span>
                  {q.figure && <span className="badge n">رسم بياني</span>}
                  {q.numberLine && <span className="badge n">خط أعداد</span>}
                </div>
                <details style={{ marginTop: 6 }}>
                  <summary className="tiny mut" style={{ cursor: 'pointer' }}>
                    معاينة
                  </summary>
                  <div style={{ marginTop: 8 }}>
                    {q.figure && (
                      <div className="pan">
                        <Figure spec={q.figure} />
                      </div>
                    )}
                    <div className="ops gr">
                      {q.options.map((o, j) => (
                        <div key={j} className={`op ${j === q.correctIndex ? 'ok' : 'locked'}`} style={{ cursor: 'default' }}>
                          <b>{ar('أبجد'[j] ?? '?')}</b>
                          <span>
                            {o.kind === 'figure' ? (
                              <Figure spec={o.figure} />
                            ) : (
                              <span dangerouslySetInnerHTML={{ __html: fmtLine(o.text) }} />
                            )}
                          </span>
                        </div>
                      ))}
                    </div>
                    {q.numberLine && <NumberLine spec={q.numberLine} />}
                    {q.explanation && (
                      <div className="ex good" style={{ marginTop: 10 }}>
                        <p dangerouslySetInnerHTML={{ __html: fmtLine(q.explanation) }} />
                      </div>
                    )}
                  </div>
                </details>
              </div>

              <div className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
                <button
                  className="btn xs alt"
                  onClick={() => void move(q, -1)}
                  disabled={busy || i === 0}
                  title="أعلى"
                >
                  <Icon name="arrowUp" size={15} />
                </button>
                <button className="btn xs alt" onClick={() => void move(q, 1)} disabled={busy} title="أسفل">
                  <Icon name="arrowUp" size={15} style={{ transform: 'rotate(180deg)' }} />
                </button>
                <button
                  className={`btn xs ${q.isActive ? 'warn' : 'ok'}`}
                  onClick={() => void toggle(q)}
                  disabled={busy}
                  title={q.isActive ? 'إيقاف' : 'تفعيل'}
                >
                  <Icon name={q.isActive ? 'x' : 'check'} size={15} />
                </button>
                <button className="btn xs alt" onClick={() => setEditing({ ...q } as Draft)} disabled={busy}>
                  <Icon name="edit" size={15} />
                </button>
                <button className="btn xs no" onClick={() => void remove(q)} disabled={busy}>
                  <Icon name="trash" size={15} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {toast && <Toast text={toast} />}
    </div>
  );
}

/* ── editor ─────────────────────────────────────────────────────────────── */
function QuestionEditor({
  draft,
  busy,
  onCancel,
  onSave,
}: {
  draft: Draft;
  busy: boolean;
  onCancel: () => void;
  onSave: (d: Draft) => void;
}) {
  const [d, setD] = useState<Draft>(draft);
  const [err, setErr] = useState('');

  useEffect(() => setD(draft), [draft]);

  const setOption = (i: number, text: string) => {
    const options = [...d.options] as Option[];
    const cur = options[i]!;
    options[i] = { kind: 'text', text };
    void cur;
    setD({ ...d, options });
  };

  const valid = d.body.trim().length > 2 && d.options.filter((o) => o.kind === 'text' && o.text.trim()).length >= 2;

  return (
    <section className="card" style={{ marginBottom: 16 }}>
      <div className="spread">
        <h3 style={{ margin: 0 }}>{d.id ? 'تعديل السؤال' : 'سؤال جديد'}</h3>
        <button className="btn xs alt" onClick={onCancel}>
          <Icon name="x" size={15} />
          إغلاق
        </button>
      </div>

      <div className="grid2" style={{ marginTop: 12 }}>
        <div className="field">
          <label htmlFor="ql">الدرس</label>
          <select id="ql" value={d.lesson} onChange={(e) => setD({ ...d, lesson: Number(e.target.value) })}>
            {LESSONS.map((l, i) => (
              <option key={l} value={i}>
                {ar(`${i + 1} — ${l}`)}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="qc">الإجابة الصحيحة</label>
          <select id="qc" value={d.correctIndex} onChange={(e) => setD({ ...d, correctIndex: Number(e.target.value) })}>
            {(d.options as Option[]).map((_, i) => (
              <option key={i} value={i}>
                {ar(`الخيار ${'أبجد'[i] ?? i}`)}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="field" style={{ marginTop: 12 }}>
        <label htmlFor="qb">نص السؤال</label>
        <textarea
          id="qb"
          value={d.body}
          onChange={(e) => setD({ ...d, body: e.target.value })}
          placeholder="مثال: ما مجموعة حل المتباينة {س^2 + 3س < 4}؟"
        />
        <span className="tiny mut">استخدم {`{ … }`} لكتابة الرموز الرياضية بالخط العادي.</span>
      </div>

      <div className="grid2" style={{ marginTop: 12 }}>
        {(d.options as Option[]).map((o, i) => (
          <div className="field" key={i}>
            <label htmlFor={`qo${i}`}>{`الخيار ${'أبجد'[i] ?? i}`}</label>
            {o.kind === 'figure' ? (
              <span className="badge n">خيار رسومي — عدّله منQuestionBank</span>
            ) : (
              <input
                id={`qo${i}`}
                type="text"
                value={o.text}
                onChange={(e) => setOption(i, e.target.value)}
              />
            )}
          </div>
        ))}
      </div>

      <div className="field" style={{ marginTop: 12 }}>
        <label htmlFor="qe">شرح الحل</label>
        <textarea id="qe" value={d.explanation} onChange={(e) => setD({ ...d, explanation: e.target.value })} />
      </div>

      {err && <div className="err" style={{ marginTop: 10 }}>{ar(err)}</div>}

      <div className="row" style={{ marginTop: 14 }}>
        <button
          className="btn ok"
          disabled={!valid || busy}
          onClick={() => {
            if (!valid) return setErr('اكتب نص السؤال وخيارين على الأقل');
            onSave(d);
          }}
        >
          <Icon name="check" size={18} />
          حفظ
        </button>
        <button className="btn alt" onClick={onCancel}>
          إلغاء
        </button>
      </div>
    </section>
  );
}