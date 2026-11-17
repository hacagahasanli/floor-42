'use client';

import { useEffect, useState } from 'react';

const KEY = 'floor42:install-hint';

/** iPhone or iPad in the browser (not already opened from the home screen). */
const iosBrowser = () => {
  if (typeof window === 'undefined') return false;
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone = window.matchMedia('(display-mode: standalone)').matches || window.matchMedia('(display-mode: fullscreen)').matches
    || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return ios && !standalone;
};

/**
 * iPhone browsers can't hide their bars for a web page. Installed on the home screen, Floor 42
 * opens full screen: say how, once, and let it be dismissed.
 */
export const InstallHint = ({ className = '' }: { className?: string }) => {
  const [show, setShow] = useState(false);
  useEffect(() => {
    try {
      setShow(iosBrowser() && window.localStorage.getItem(KEY) !== 'done');
    } catch {
      setShow(iosBrowser());
    }
  }, []);
  if (!show) return null;
  const close = () => {
    setShow(false);
    try {
      window.localStorage.setItem(KEY, 'done');
    } catch {
      /* ignore */
    }
  };
  return (
    <div className={`panel-cut flex max-w-md items-start gap-3 bg-ink p-4 text-left text-sm text-cream/85 ${className}`} role="note">
      <div className="flex-1">
        <b className="text-gold">Full screen on iPhone:</b> tap <b>Share</b> (the square with the arrow), then{' '}
        <b>Add to Home Screen</b>, and open Floor 42 from your home screen. It opens with no browser bars. To join a
        friend from there, paste their link on the Play online page.
      </div>
      <button type="button" onClick={close} aria-label="Got it" className="panel-cut bg-cream/10 px-3 py-1 text-xs font-bold uppercase">
        Got it
      </button>
    </div>
  );
};
