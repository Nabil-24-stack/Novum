/**
 * Iframe error detection and screenshot capture via postMessage.
 *
 * Protocols used:
 * - `novum:query-errors` / `novum:error-report` — runtime error text
 * - `novum:capture-screenshot` / `novum:screenshot-captured` — PNG screenshot
 */

const DEFAULT_TIMEOUT = 5000;

/** Shared iframe lookup used by all exported functions. */
function findIframe(pageId?: string): HTMLIFrameElement | null {
  if (pageId) {
    return document.querySelector(
      `[data-flow-page-id="${pageId}"] iframe`
    ) as HTMLIFrameElement | null;
  }
  return document.querySelector(
    'iframe[title="Sandpack Preview"]'
  ) as HTMLIFrameElement | null;
}

/**
 * Check if a Sandpack iframe exists in the DOM and has a contentWindow.
 * Used by waitForSandpackSettle to poll for iframe readiness.
 */
export function isIframeAvailable(pageId?: string): boolean {
  return !!(findIframe(pageId)?.contentWindow);
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
    const iframe = findIframe(pageId);

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

/**
 * Capture a PNG screenshot of the Sandpack iframe via the inspector script's
 * `novum:capture-screenshot` / `novum:screenshot-captured` protocol.
 * Returns a base64 data URL, or null if capture times out.
 */
export function captureIframeScreenshot(
  pageId?: string,
  timeout = 3000
): Promise<string | null> {
  return new Promise((resolve) => {
    const iframe = findIframe(pageId);
    if (!iframe?.contentWindow) {
      resolve(null);
      return;
    }

    const timer = setTimeout(() => {
      window.removeEventListener("message", handler);
      resolve(null);
    }, timeout);

    function handler(e: MessageEvent) {
      if (e.data?.type !== "novum:screenshot-captured") return;
      clearTimeout(timer);
      window.removeEventListener("message", handler);
      resolve(e.data.payload?.dataUrl || null);
    }

    window.addEventListener("message", handler);
    iframe.contentWindow.postMessage({ type: "novum:capture-screenshot" }, "*");
  });
}

/**
 * Poll for a visible error in the iframe. Calls `queryIframeErrors` repeatedly
 * until error text is found or the time budget is exhausted.
 *
 * Useful when Sandpack has settled but the error overlay hasn't rendered yet.
 */
export function pollForVisibleError(
  pageId?: string,
  options?: { maxWaitMs?: number; intervalMs?: number; signal?: AbortSignal }
): Promise<string | null> {
  const { maxWaitMs = 2000, intervalMs = 250, signal } = options ?? {};

  return new Promise<string | null>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }

    const start = Date.now();

    const poll = async () => {
      if (signal?.aborted) {
        reject(new DOMException("Aborted", "AbortError"));
        return;
      }

      try {
        const error = await queryIframeErrors(pageId, 500);
        if (error) {
          resolve(error);
          return;
        }
      } catch {
        // Ignore individual poll failures
      }

      if (Date.now() - start >= maxWaitMs) {
        resolve(null);
        return;
      }

      setTimeout(poll, intervalMs);
    };

    poll();

    signal?.addEventListener(
      "abort",
      () => reject(new DOMException("Aborted", "AbortError")),
      { once: true }
    );
  });
}
