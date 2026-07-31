/**
 * Scroll position of the shared route container (`main.app-shell__main`).
 *
 * Routes render into one scrolling element, so returning to a page means
 * putting that element back where it was. Content arrives async — budget data,
 * category cards, the income table — so restoring once on mount lands short.
 * `restoreMainScrollY` keeps re-applying until the page is tall enough to hold
 * the position, then stops.
 */

const MAIN_SELECTOR = '.app-shell__main';

/** How long to keep chasing a growing page before giving up. */
const RESTORE_TIMEOUT_MS = 2000;

function mainEl(): HTMLElement | null {
  if (typeof document === 'undefined') return null;
  return document.querySelector(MAIN_SELECTOR);
}

export function readMainScrollY(): number {
  return mainEl()?.scrollTop ?? 0;
}

/**
 * Scroll back to `y`, retrying as the page grows. Returns a cleanup that stops
 * the retries — call it if the view unmounts or the user scrolls away.
 */
export function restoreMainScrollY(y: number): () => void {
  const main = mainEl();
  if (!main || !(y > 0)) return () => {};
  // The scroll container's own box never changes as the page fills in, so watch
  // the route content inside it — that is what actually grows.
  const content = main.firstElementChild;

  let ro: ResizeObserver | null = null;
  let timer: number | undefined;
  let done = false;

  const stop = () => {
    if (done) return;
    done = true;
    ro?.disconnect();
    ro = null;
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }
  };

  const apply = () => {
    if (done) return;
    const max = Math.max(0, main.scrollHeight - main.clientHeight);
    main.scrollTop = Math.min(y, max);
    // Once the page can hold the position, there is nothing left to chase.
    if (max >= y - 1) stop();
  };

  apply();
  requestAnimationFrame(apply);
  ro = new ResizeObserver(apply);
  ro.observe(main);
  if (content) ro.observe(content);
  timer = window.setTimeout(stop, RESTORE_TIMEOUT_MS) as unknown as number;

  return stop;
}
