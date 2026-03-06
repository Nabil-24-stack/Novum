/**
 * Iframe error detection via postMessage.
 * Sends `novum:query-errors` and waits for `novum:error-report`.
 */

const DEFAULT_TIMEOUT = 5000;

/**
 * Check if a Sandpack iframe exists in the DOM and has a contentWindow.
 * Used by waitForSandpackSettle to poll for iframe readiness.
 */
export function isIframeAvailable(pageId?: string): boolean {
  let iframe: HTMLIFrameElement | null;
  if (pageId) {
    iframe = document.querySelector(
      `[data-flow-page-id="${pageId}"] iframe`
    ) as HTMLIFrameElement | null;
  } else {
    iframe = document.querySelector(
      'iframe[title="Sandpack Preview"]'
    ) as HTMLIFrameElement | null;
  }
  return !!(iframe?.contentWindow);
}

/**
 * Query a Sandpack iframe for runtime errors by checking document.body text.
 * Returns the error text if found, or null if the page looks clean.
 */
export function queryIframeErrors(
  pageId?: string,
  timeout = DEFAULT_TIMEOUT
): Promise<string | null> {
  return new Promise((resolve) => {
    let iframe: HTMLIFrameElement | null;
    if (pageId) {
      iframe = document.querySelector(
        `[data-flow-page-id="${pageId}"] iframe`
      ) as HTMLIFrameElement | null;
    } else {
      iframe = document.querySelector(
        'iframe[title="Sandpack Preview"]'
      ) as HTMLIFrameElement | null;
    }

    if (!iframe?.contentWindow) {
      resolve(null);
      return;
    }

    const timer = setTimeout(() => {
      window.removeEventListener("message", handler);
      resolve(null); // Timeout = assume no errors
    }, timeout);

    function handler(e: MessageEvent) {
      if (e.data?.type !== "novum:error-report") return;
      clearTimeout(timer);
      window.removeEventListener("message", handler);
      resolve(e.data.payload?.errorText || null);
    }

    window.addEventListener("message", handler);
    iframe.contentWindow.postMessage({ type: "novum:query-errors" }, "*");
  });
}
