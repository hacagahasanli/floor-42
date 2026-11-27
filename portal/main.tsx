/// <reference types="vite/client" />
/**
 * The portal build's entry. The platform adapter is chosen first and told that loading has started; the first screen ends it.
 * The main menu is the first screen: solo play against the bot works with nothing else (the online lobby is the only part
 * that talks to a server).
 */
import { createRoot } from 'react-dom/client';

import { detectPlatform, setPlatform } from '~/platform';

import { App } from './App';

import './portal.css';

declare global {
  interface Window {
    /** Set by the boot screen's inline script (portal/index.html). */
    __boot?: (pct: number) => void;
  }
}

void detectPlatform().then((platform) => {
  setPlatform(platform);
  platform.loadingStart();
  // Boot screen progress (portal/index.html): the code is loaded and the platform is chosen; the first screen is rendering.
  window.__boot?.(70);
  createRoot(document.getElementById('root')!).render(<App />);
  window.__boot?.(90);
});
