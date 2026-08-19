import { useEffect } from 'react';

/**
 * TYPO3 embeds this app in an iframe, and an iframe does not grow with its
 * content. We measure the document after every render and post the height to
 * the parent page, which resizes the iframe. See docs/typo3-embed.md for the
 * snippet that belongs on the TYPO3 side.
 */
export function useIframeHeight(deps = []) {
  useEffect(() => {
    if (window.parent === window) return undefined;

    let last = 0;
    const post = () => {
      const height = Math.ceil(document.documentElement.getBoundingClientRect().height);
      if (height && Math.abs(height - last) > 2) {
        last = height;
        window.parent.postMessage({ type: 'iwi7-registration:height', height }, '*');
      }
    };

    post();
    const observer = new ResizeObserver(post);
    observer.observe(document.documentElement);
    window.addEventListener('load', post);

    return () => {
      observer.disconnect();
      window.removeEventListener('load', post);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
