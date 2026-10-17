import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Icon, type IconName } from '../lib/icons';
import { Avatar } from '../lib/ui';

/* ═══════════════════════════════════════════════════════════════════════════
   Emoji picker — a real modal "keyboard": categories, search, recent picks,
   arrow-key navigation, Esc / backdrop to close, focus trapped.
   ═══════════════════════════════════════════════════════════════════════════ */

interface Group {
  id: string;
  label: string;
  icon: IconName;
  items: string[];
}

const GROUPS: Group[] = [
  {
    id: 'faces',
    label: 'وجوه',
    icon: 'sparkle',
    items:
      '😀 😃 😄 😁 😆 😅 🤣 😂 🙂 🙃 😉 😊 😇 🥰 😍 🤩 😘 😗 😚 😙 🥲 😋 😛 😜 🤪 😝 🤑 🤗 🤭 🤫 🤔 🤐 🤨 😐 😑 😶 😏 😒 🙄 😬 🤥 😌 😔 😪 🤤 😴 😷 🤒 🤕 🤢 🤮 🤧 🥵 🥶 🥴 😵 🤯 🤠 🥳 🥸 😎 🤓 🧐 😕 😟 🙁 😮 😯 😲 😳 🥺 😦 😧 😨 😰 😥 😢 😭 😱 😖 😣 😞 😓 😩 😫 🥱 😤 😡 😠 🤬 😈 👿 💀 👻 👽 🤖 👾'.split(
        ' ',
      ),
  },
  {
    id: 'animals',
    label: 'حيوانات',
    icon: 'bolt',
    items:
      '🐶 🐱 🐭 🐹 🐰 🦊 🐻 🐼 🐨 🐯 🦁 🐮 🐷 🐸 🐵 🙈 🙉 🙊 🐒 🐔 🐧 🐦 🐤 🦆 🦅 🦉 🦇 🐺 🐗 🐴 🦄 🐝 🐛 🦋 🐌 🐞 🐜 🐢 🐍 🦎 🦖 🦕 🐙 🦑 🦐 🦞 🦀 🐡 🐠 🐟 🐬 🐳 🐋 🦈 🐊 🐅 🐆 🦓 🦍 🦧 🐘 🦛 🦏 🐪 🐫 🦒 🐐 🦌 🐎 🐑 🦙 🐕 🐈 🐓 🦃 🦚 🦜 🦢'.split(
        ' ',
      ),
  },
  {
    id: 'food',
    label: 'طعام',
    icon: 'trophy',
    items:
      '🍏 🍎 🍐 🍊 🍋 🍌 🍉 🍇 🍓 🫐 🍈 🍒 🍑 🥭 🍍 🥥 🥝 🍅 🍆 🥑 🥦 🥬 🥒 🌶 🌽 🥕 🧄 🧅 🥔 🍠 🥐 🥯 🍞 🥖 🥨 🧀 🥚 🍳 🧈 🥞 🧇 🥓 🍗 🍖 🌭 🍔 🍟 🍕 🍝 🍜 🍲 🍛 🍣 🍱 🥟 🍤 🍙 🍚 🍥 🥠 🥮 🍢 🍡 🍧 🍨 🍦 🥧 🧁 🍰 🎂 🍮 🍭 🍬 🍫 🍿 🍩 🍪 🌰 🥜 🍯 🥛 🍼 ☕ 🍵 🧃 🥤 🧋 🍺 🍻 🥂 🍷 🍸 🍹 🧉 🍾'.split(
        ' ',
      ),
  },
  {
    id: 'sport',
    label: 'رياضة',
    icon: 'grid',
    items:
      '⚽ 🏀 🏈 ⚾ 🥎 🎾 🏐 🏉 🥏 🎱 🏓 🏸 🏒 🏑 🥍 🏏 ⛳ 🏹 🎣 🤿 🥊 🥋 🎽 🛹 🛼 🛷 ⛸️ 🥌 🎿 ⛷️ 🏂 🏋️ 🤼 🤸 ⛹️ 🤺 🤾 🏌️ 🏇 🧘 🏄 🏊 🤽 🚣 🧗 🚴 🚵 🎯 🎳 🎮 🧩 🎲 🎸 🎹 🥁 🎺 🎻 🎤 🎧 🎬 🎨 🎭'.split(
        ' ',
      ),
  },
  {
    id: 'things',
    label: 'أشياء',
    icon: 'book',
    items:
      '⌚ 📱 💻 ⌨️ 🖥️ 🖨️ 🖱️ 💽 💾 💿 📀 📷 📸 📹 🎥 📞 ☎️ 📟 📺 📻 🎙️ ⏱️ ⏰ ⌛ ⏳ 📡 🔋 🔌 💡 🔦 🕯️ 🧯 💸 💵 💴 💶 💷 💰 💳 💎 ⚖️ 🧰 🔧 🔨 ⚒️ 🛠️ ⛏️ 🔩 ⚙️ 🧱 ⛓️ 🧲 🔫 💣 🧨 🪓 🔪 🗡️ ⚔️ 🛡️ 🔑 🗝️ 🚪 🪑 🛋️ 🛏️ 🧸 🖼️ 🪞 🛍️ 🛒 🎁 🎈 🎏 🎀 🎊 🎉 🚀 🛸 🛶 ⛵ 🚤 🛳️ ✈️ 🚁 🛰️'.split(
        ' ',
      ),
  },
  {
    id: 'symbols',
    label: 'رموز',
    icon: 'eye',
    items:
      '❤️ 🧡 💛 💚 💙 💜 🖤 🤍 🤎 💔 ❣️ 💕 💞 💓 💗 💖 💘 💝 💟 ⭐ 🌟 ✨ ⚡ 🔥 💥 ☄️ 🌈 ☀️ 🌤 ⛅ ☁️ 🌦️ 🌧️ ⛈️ ❄️ ☃️ ⛄ 🌬️ 💨 🌪️ 🌫️ 🌊 💧 💦 ☔ ⚓️ 💫 🌙 🌛 🌜 🌚 🌝 🌞 🪐 🔔 🎵 🎶 🏆 🥇 🥈 🥉 ✅ ❌ ❓ ❗ 💯 🆗 🆕'.split(
        ' ',
      ),
  },
];

const ALL = GROUPS.flatMap((g) => g.items);
const COLS = 8;
const RECENT_KEY = 'qlive.recentEmoji';

/** Exposed for the render tests. */
export const EMOJI_STATS = {
  groups: GROUPS.length,
  total: ALL.length,
  perGroup: GROUPS.map((g) => ({ id: g.id, label: g.label, n: g.items.length })),
  unique: new Set(ALL).size,
};

const loadRecent = (): string[] => {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]');
    return Array.isArray(v) ? (v as string[]).filter((x) => typeof x === 'string').slice(0, 8) : [];
  } catch {
    return [];
  }
};

const saveRecent = (list: string[]) => {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, 8)));
  } catch {
    /* private mode */
  }
};

export function EmojiPicker({
  open,
  value,
  banner,
  onPick,
  onClose,
}: {
  open: boolean;
  value: string;
  banner: string;
  onPick: (e: string) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState(GROUPS[0]!.id);
  const [query, setQuery] = useState('');
  const [recent, setRecent] = useState<string[]>(loadRecent);
  const [cursor, setCursor] = useState(0);
  const panel = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);

  /* ── Esc closes, Tab is trapped, focus starts in the search box ─────── */
  useEffect(() => {
    if (!open) return;
    setQuery('');
    setCursor(0);
    const t = window.setTimeout(() => search.current?.focus(), 60);

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;
      const nodes = Array.from(
        panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled)') ?? [],
      );
      if (!nodes.length) return;
      const i = nodes.indexOf(document.activeElement as HTMLElement);
      if (i < 0) return;
      e.preventDefault();
      nodes[(i + (e.shiftKey ? -1 : 1) + nodes.length) % nodes.length]?.focus();
    };

    document.addEventListener('keydown', onKey, true);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [open, onClose]);

  /* ── the currently chosen glyph scrolls into view when opened ──────── */
  useEffect(() => {
    if (!open) return;
    const id = window.requestAnimationFrame(() => {
      const el = panel.current?.querySelector<HTMLElement>(`[data-emoji="${CSS.escape(value)}"]`);
      el?.scrollIntoView({ block: 'nearest' });
    });
    return () => window.cancelAnimationFrame(id);
  }, [open, value]);

  const shown = useMemo(() => {
    const q = query.trim();
    if (!q) return GROUPS.find((g) => g.id === tab)?.items ?? [];
    /* no emoji names offline — a query matches the glyph itself */
    const hits = ALL.filter((e) => e.includes(q));
    return hits.length ? hits : [];
  }, [query, tab]);

  const choose = useCallback(
    (e: string) => {
      onPick(e);
      const next = [e, ...recent.filter((r) => r !== e)].slice(0, 8);
      setRecent(next);
      saveRecent(next);
      onClose();
    },
    [onClose, onPick, recent],
  );

  const onGridKey = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      const n = shown.length;
      if (!n) return;
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        setCursor((c) => (c + 1) % n);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setCursor((c) => (c - 1 + n) % n);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setCursor((c) => (c + COLS) % n);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setCursor((c) => (c - COLS + n) % n);
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        const pick = shown[cursor];
        if (pick) choose(pick);
      }
    },
    [choose, cursor, shown],
  );

  if (!open) return null;

  return (
    <div className="modal-root" role="dialog" aria-modal="true" aria-label="اختر الإيموجي">
      <div className="modal-backdrop" onClick={onClose} />

      <div className="modal-card picker" ref={panel}>
        <header className="picker-head">
          <div className="row" style={{ gap: 12, minWidth: 0 }}>
            <Avatar emoji={value} banner={banner} size="lg" ring />
            <div style={{ minWidth: 0 }}>
              <div className="picker-title">اختر إيموجيك</div>
              <div className="tiny mut">سيظهر لأصدقائك في غرفة الانتظار</div>
            </div>
          </div>
          <button className="btn xs alt" onClick={onClose} aria-label="إغلاق">
            <Icon name="x" size={16} />
          </button>
        </header>

        <div className="picker-search">
          <Icon name="eye" size={17} />
          <input
            ref={search}
            type="text"
            value={query}
            placeholder="الصق رمز إيموجي للبحث…"
            onChange={(e) => {
              setQuery(e.target.value);
              setCursor(0);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && shown[cursor]) choose(shown[cursor]!);
            }}
            aria-label="بحث عن إيموجي"
          />
          {query && (
            <button className="btn xs alt" onClick={() => setQuery('')} aria-label="مسح البحث">
              <Icon name="x" size={14} />
            </button>
          )}
        </div>

        {recent.length > 0 && !query && (
          <div className="picker-strip">
            <span className="picker-label">مستخدمة مؤخراً</span>
            <div className="picker-row">
              {recent.map((e) => (
                <button key={e} className="emoji-cell" onClick={() => choose(e)} title={e}>
                  {e}
                </button>
              ))}
            </div>
          </div>
        )}

        <nav className="picker-tabs" aria-label="أقسام الإيموجي">
          {GROUPS.map((g) => (
            <button
              key={g.id}
              className={`picker-tab${tab === g.id && !query ? ' on' : ''}`}
              onClick={() => {
                setTab(g.id);
                setQuery('');
                setCursor(0);
              }}
              aria-pressed={tab === g.id && !query}
            >
              <Icon name={g.icon} size={16} />
              {g.label}
            </button>
          ))}
        </nav>

        <div
          className="picker-grid"
          onKeyDown={onGridKey}
          tabIndex={0}
          role="listbox"
          aria-label="الإيموجي المتاحة"
        >
          {shown.map((e, i) => (
            <button
              key={`${e}-${i}`}
              data-emoji={e}
              className={`emoji-cell${e === value ? ' on' : ''}${i === cursor ? ' cursor' : ''}`}
              onClick={() => choose(e)}
              onMouseEnter={() => setCursor(i)}
              aria-selected={e === value}
              title={e}
            >
              {e}
            </button>
          ))}
          {shown.length === 0 && <div className="empty">لا نتائج</div>}
        </div>

        <footer className="picker-foot">
          <span className="tiny mut">استخدم الأسهم للتنقل</span>
          <button className="btn sm" onClick={onClose}>
            <Icon name="check" size={17} />
            تم
          </button>
        </footer>
      </div>
    </div>
  );
}