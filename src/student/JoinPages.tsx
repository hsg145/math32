import { useCallback, useEffect, useRef, useState } from 'react';
import { BrandMark, Icon } from '../lib/icons';
import { ar, arNum } from '../lib/format';
import { BANNERS, Avatar, Loading, avatarStyle } from '../lib/ui';
import { useOnline } from '../lib/live';
import { clientKey, load, navigate, save } from '../lib/router';
import { joinSession, resolveCode } from '../lib/api';
import { CodeInput, extractCode, filled, withHyphen } from './CodeInput';
import { EmojiPicker } from './EmojiPicker';
import { isConfigured } from '../lib/supabase';

/* ═══════════════════════════════════════════════════════════════════════════
   Step 1 — the door. A short, readable code or a link from the teacher.
   ═══════════════════════════════════════════════════════════════════════════ */

/** Default glyph for a student who has never picked one. */
const DEFAULT_EMOJI = '🦊';

export function JoinPage({ initialCode = '' }: { initialCode?: string }) {
  const [six, setSix] = useState(() =>
    extractCode(initialCode || load('lastCode', '')).padEnd(6, ''),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = useCallback(async () => {
    if (busy) return;
    if (filled(six) !== 6) {
      setError('أدخل الكود كاملاً المكوّن من ٦ خانات');
      return;
    }
    const code = withHyphen(six);
    setBusy(true);
    setError('');
    save('lastCode', code);

    /* Step 1 is a read-only check only — the seat (and the name) come next. */
    try {
      const found = await resolveCode(code);
      if (!found) throw new Error('الكود غير صحيح أو انتهت صلاحيته');
      if (!found.isOpen) throw new Error('الباب مغلق حالياً — انتظر أن يفتحه المعلّم');
      save('sessionId', found.sessionId);
      save('sessionTitle', found.title);
      navigate('/play', true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذّر الدخول');
      setBusy(false);
      setSix('');
    }
  }, [busy, six]);

  const onType = useCallback((v: string) => {
    setSix(v);
    setError('');
  }, []);

  if (!isConfigured) return <ConfigNotice />;

  const complete = filled(six) === 6;

  return (
    <main className="shell">
      <section className="card">
        <div className="row" style={{ gap: 12, marginBottom: 6 }}>
          <BrandMark size={40} />
          <div>
            <h1 style={{ margin: 0, fontSize: 'clamp(22px,5vw,30px)' }}>انضم إلى الاختبار</h1>
            <p className="mut tiny" style={{ margin: 0 }}>
              الخطوة ١ من ٢ — أدخل الكود الذي أرسله لك المعلّم
            </p>
          </div>
        </div>

        <div className="chips">
          <span className="badge i">
            <Icon name="shield" size={13} style={{ verticalAlign: '-2px', marginInlineEnd: 4 }} />
            دخول آمن
          </span>
          <span className="badge n">اختبار لحظي</span>
        </div>

        <div className="field">
          <label htmlFor="code-0">كود الدخول</label>
          <CodeInput
            value={six}
            onChange={onType}
            onComplete={() => void submit()}
            invalid={Boolean(error)}
            disabled={busy}
          />
        </div>

        {error ? (
          <div className="err" style={{ marginTop: 12 }}>
            <Icon name="alert" size={18} />
            {ar(error)}
          </div>
        ) : (
          <p className="center mut tiny" style={{ marginTop: 10, marginBottom: 0 }}>
            {complete
              ? 'ممتاز — جارٍ التحقق…'
              : 'اكتب الحروف، السطر يظهر تلقائياً بعد ٣ خانات'}
          </p>
        )}

        <button className="btn block" style={{ marginTop: 16 }} onClick={submit} disabled={busy || !complete}>
          {busy ? <Icon name="refresh" size={20} className="spin" /> : <Icon name="next" size={20} />}
          {busy ? 'جارٍ التحقق…' : complete ? 'متابعة' : 'أكمل الكود'}
        </button>

        <div className="join-tips">
          <p>
            <Icon name="info" size={14} style={{ verticalAlign: '-2px' }} /> الكود من ٦ خانات مثل{' '}
            <span className="kbd">ABC-DEF</span>، ويتغيّر كل ٢٤ ساعة.
          </p>
          <p>
            <Icon name="copy" size={14} style={{ verticalAlign: '-2px' }} /> يمكنك لصق الكود أو
            رابط المعلّم مباشرة في أي خانة.
          </p>
          <p>
            <Icon name="next" size={14} style={{ verticalAlign: '-2px' }} /> بعد الكود ستختار
            ايموجيك واسمك.
          </p>
        </div>
      </section>
    </main>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   Step 2 — pick an emoji, tap the circle to cycle the banner, type your name.
   ═══════════════════════════════════════════════════════════════════════════ */

export function IdentityPage({ code }: { code: string }) {
  const [emoji, setEmoji] = useState<string>(load('avatar', DEFAULT_EMOJI));
  const [banner, setBanner] = useState<string>(load('banner', 'b0'));
  const [name, setName] = useState<string>(load('name', ''));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [picker, setPicker] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    document.title = 'اختر هويتك';
  }, []);

  const cycleBanner = useCallback(() => {
    setBanner((b) => {
      const i = BANNERS.findIndex((x) => x.id === b);
      return BANNERS[(i + 1) % BANNERS.length].id;
    });
  }, []);

  const submit = useCallback(async () => {
    const n = name.trim();
    if (n.length < 1) {
      setError('اكتب اسمك أولاً');
      nameRef.current?.focus();
      return;
    }
    if (n.length > 24) {
      setError('الاسم طويل جداً (٢٤ حرفاً كحد أقصى)');
      return;
    }
    setBusy(true);
    setError('');
    save('name', n);
    save('avatar', emoji);
    save('banner', banner);
    try {
      const r = await joinSession(code, n, emoji, banner);
      save('sessionId', r.sessionId);
      save('playerId', r.playerId);
      navigate('/play', true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذّر الدخول');
      setBusy(false);
    }
  }, [banner, code, emoji, name]);

return (
    <main className="shell">
      <section className="card identity">
        <div className="center" style={{ marginBottom: 4 }}>
          <span className="badge i">
            <Icon name="shield" size={13} style={{ verticalAlign: '-2px', marginInlineEnd: 5 }} />
            الخطوة ٢ من ٢
          </span>
          <h1 style={{ fontSize: 'clamp(24px,5.4vw,34px)', margin: '10px 0 2px' }}>اختر هويتك</h1>
          <p className="mut tiny" style={{ margin: 0 }}>
            سيظهر اسمك وإيموجيك لبقية الطلاب في غرفة الانتظار
          </p>
        </div>

        {/* ── the big circle: tap to cycle the banner ─────────────────── */}
        <div className="id-hero">
          <button
            type="button"
            className="id-avatar-btn"
            onClick={cycleBanner}
            aria-label="تغيير البانر الخاص بك"
            title="اضغط لتغيير البانر"
          >
            <Avatar emoji={emoji} banner={banner} size="xl" ring pulse />
            <span className="id-avatar-badge">
              <Icon name="refresh" size={16} />
            </span>
          </button>
          <p className="id-hint">
            <Icon name="refresh" size={13} style={{ verticalAlign: '-2px' }} />
            اضغط على الدائرة لتغيير <b>البانر</b> الخاص بك
          </p>
        </div>

        {/* ── banner swatches: direct pick ────────────────────────────── */}
        <div className="id-section">
          <span className="id-label">
            <Icon name="sparkle" size={14} />
            البانر
          </span>
          <div className="swatches">
            {BANNERS.map((b) => (
              <button
                key={b.id}
                type="button"
                className={`swatch${b.id === banner ? ' on' : ''}`}
                style={{ backgroundImage: `linear-gradient(135deg, ${b.from}, ${b.to})` }}
                onClick={() => setBanner(b.id)}
                aria-label={`بانر ${b.id}`}
                aria-pressed={b.id === banner}
              >
                {b.id === banner && <Icon name="check" size={17} />}
              </button>
            ))}
          </div>
        </div>

        {/* ── emoji: opens the modal keyboard ─────────────────────────── */}
        <div className="id-section">
          <span className="id-label">
            <Icon name="grid" size={14} />
            الإيموجي
          </span>
          <button type="button" className="emoji-open" onClick={() => setPicker(true)}>
            <span className="emoji-open-glyph">{emoji}</span>
            <span className="emoji-open-text">
              <b>اضغط لاختيار إيموجي</b>
              <small>يفتح قائمة فيها كل الإيموجي</small>
            </span>
            <Icon name="chevron" size={20} className="emoji-open-arrow" />
          </button>
        </div>

        {/* ── name ─────────────────────────────────────────────────────── */}
        <div className="id-section">
          <span className="id-label">
            <Icon name="user" size={14} />
            اسمك
            <em className={`id-count${name.trim().length ? '' : ' warn'}`}>
              {ar(`${name.trim().length} / ٢٤`)}
            </em>
          </span>
          <div className="name-field">
            <span className="name-field-ava" aria-hidden="true">
              {emoji}
            </span>
            <input
              id="nm"
              ref={nameRef}
              type="text"
              maxLength={24}
              autoComplete="off"
              placeholder="اكتب اسمك الأول واسم العائلة"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submit()}
              aria-label="اسمك"
            />
            {name.trim() && (
              <button
                type="button"
                className="name-field-clear"
                onClick={() => {
                  setName('');
                  nameRef.current?.focus();
                }}
                aria-label="مسح الاسم"
              >
                <Icon name="x" size={16} />
              </button>
            )}
          </div>
        </div>

        {/* ── live preview ─────────────────────────────────────────────── */}
        <div className="id-preview">
          <span className="id-label">
            <Icon name="eye" size={14} />
            هكذا سيظهر اسمك
          </span>
          <div className="id-preview-card">
            <Avatar emoji={emoji} banner={banner} />
            <div style={{ minWidth: 0 }}>
              <div className="id-preview-name">
                {name.trim() ? ar(name.trim()) : <span className="mut">اسمك سيظهر هنا</span>}
              </div>
              <div className="tiny mut">في غرفة الانتظار</div>
            </div>
          </div>
        </div>

        {error && (
          <div className="err" style={{ marginTop: 14 }}>
            <Icon name="alert" size={18} />
            {ar(error)}
          </div>
        )}

        <button className="btn block" style={{ marginTop: 18 }} onClick={submit} disabled={busy}>
          {busy ? <Icon name="refresh" size={20} className="spin" /> : <Icon name="send" size={20} />}
          {busy ? 'جارٍ الدخول…' : 'انضم إلى غرفة الانتظار'}
        </button>
      </section>

      <EmojiPicker
        open={picker}
        value={emoji}
        banner={banner}
        onPick={setEmoji}
        onClose={() => setPicker(false)}
      />
    </main>
  );
}

export function ConfigNotice() {
  return (
    <main className="shell">
      <section className="card center">
        <BrandMark size={52} />
        <h2>الإعدادات غير مكتملة</h2>
        <div className="err" style={{ marginTop: 10, textAlign: 'start' }}>
          <Icon name="alert" size={18} />
          <div>
            أضف القيم التالية إلى ملف <span className="kbd">.env.local</span> ثم أعد التشغيل:
            <br />
            <span className="kbd">VITE_SUPABASE_URL</span> و<span className="kbd">VITE_SUPABASE_ANON_KEY</span>
          </div>
        </div>
      </section>
    </main>
  );
}

/* ── Footer shared by student screens ──────────────────────────────────── */
export function StudentFooter() {
  const online = useOnline();
  return (
    <p className="center mut tiny" style={{ marginTop: 22 }}>
      <Icon name={online ? 'shield' : 'signalOff'} size={13} style={{ verticalAlign: '-2px' }} />{' '}
      {online ? 'اتصالك آمن ومشفّر' : 'لا يوجد اتصال — أعد المحاولة'} · معرّف جهازك{' '}
      {clientKey().slice(0, 6)}
    </p>
  );
}

export { Loading, avatarStyle, arNum };