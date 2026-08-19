import { useEffect, useRef } from 'react';

const SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY || '';
const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

let scriptPromise = null;

function loadScript() {
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    const el = document.createElement('script');
    el.src = SCRIPT_SRC;
    el.async = true;
    el.onload = resolve;
    el.onerror = reject;
    document.head.appendChild(el);
  });
  return scriptPromise;
}

export const turnstileEnabled = Boolean(SITE_KEY);

/**
 * Renders the Turnstile widget and hands the resulting token to onToken.
 * Without VITE_TURNSTILE_SITE_KEY the component renders nothing and the worker
 * skips verification, so the app also runs with no bot protection at all.
 */
export function Turnstile({ onToken, resetKey }) {
  const container = useRef(null);
  const widgetId = useRef(null);

  useEffect(() => {
    if (!SITE_KEY) return undefined;
    let cancelled = false;

    loadScript()
      .then(() => {
        if (cancelled || !container.current || !window.turnstile) return;
        widgetId.current = window.turnstile.render(container.current, {
          sitekey: SITE_KEY,
          callback: onToken,
          'expired-callback': () => onToken(''),
          'error-callback': () => onToken(''),
        });
      })
      .catch(() => onToken(''));

    return () => {
      cancelled = true;
      if (widgetId.current && window.turnstile) window.turnstile.remove(widgetId.current);
      widgetId.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  if (!SITE_KEY) return null;
  return <div className="turnstile" ref={container} />;
}
