import { Suspense, lazy, useEffect } from 'react';
import { navigate, parseRoute, useRoute } from './lib/router';
import { Icon } from './lib/icons';
import { Loading } from './lib/ui';
import { JoinPage } from './student/JoinPages';
import { PlayPage } from './student/PlayPage';

/* The teacher console ships as its own chunk — students never download it. */
const AdminApp = lazy(() => import('./admin/AdminApp').then((m) => ({ default: m.AdminApp })));

export function App() {
  const route = useRoute();
  const { head, arg } = parseRoute(route);

  useEffect(() => {
    document.title =
      head === 'admin'
        ? 'لوحة المعلّم'
        : head === 'j' || head === 'play'
          ? 'الاختبار اللحظي'
          : 'منصة الاختبار اللحظي';
  }, [head]);

  if (head === 'admin') {
    return (
      <Suspense fallback={<Loading label="جارٍ تحميل لوحة المعلّم…" />}>
        <AdminApp />
      </Suspense>
    );
  }

  if (head === 'play') return <PlayPage sessionId={storedSessionId()} code={storedCode()} />;

  // /#/j/ABC-DEF is a deep link straight to the door
  return (
    <>
      <JoinPage initialCode={head === 'j' ? arg : ''} />
      <p className="center" style={{ margin: '0 0 30px' }}>
        <a
          className="btn xs alt"
          href="#/admin"
          onClick={(e) => {
            e.preventDefault();
            navigate('/admin');
          }}
        >
          <Icon name="shield" size={15} />
          دخول المعلّم
        </a>
      </p>
    </>
  );
}

function storedSessionId(): string | null {
  try {
    return (JSON.parse(localStorage.getItem('qlive.sessionId') ?? 'null') as string | null) ?? null;
  } catch {
    return null;
  }
}

function storedCode(): string {
  try {
    return (JSON.parse(localStorage.getItem('qlive.lastCode') ?? '""') as string) || '';
  } catch {
    return '';
  }
}