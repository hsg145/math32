import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app';
import { initTheme } from './lib/router';
import './styles/global.css';

initTheme();

const host = document.getElementById('root');
if (!host) throw new Error('#root not found');

createRoot(host).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

/* Keep the wake lock on phones so the countdown screen never sleeps. */
let lock: { release: () => Promise<void> } | null = null;
const grab = async () => {
  try {
    const nav = navigator as Navigator & {
      wakeLock?: { request: (t: 'screen') => Promise<never> };
    };
    if (nav.wakeLock && document.visibilityState === 'visible') lock = await nav.wakeLock.request('screen');
  } catch {
    /* not supported — harmless */
  }
};
void grab();
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    void grab();
  } else {
    void lock?.release().catch(() => {});
    lock = null;
  }
});