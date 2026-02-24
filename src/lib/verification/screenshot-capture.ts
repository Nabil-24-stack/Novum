/**
 * Captures a screenshot from a Sandpack iframe via postMessage.
 * Sends `novum:capture-screenshot` and waits for `novum:screenshot-captured`.
 */

const DEFAULT_TIMEOUT = 5000;

export function captureIframeScreenshot(
  pageId?: string,
  timeout = DEFAULT_TIMEOUT
): Promise<string> {
  return new Promise((resolve, reject) => {
    // Find the target iframe
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
      reject(new Error("No Sandpack iframe found"));
      return;
    }

    const timer = setTimeout(() => {
      window.removeEventListener("message", handler);
      reject(new Error("Screenshot capture timed out"));
    }, timeout);

    function handler(e: MessageEvent) {
      if (e.data?.type !== "novum:screenshot-captured") return;

      clearTimeout(timer);
      window.removeEventListener("message", handler);

      const { dataUrl, error } = e.data.payload || {};
      if (dataUrl) {
        resolve(dataUrl);
      } else {
        reject(new Error(error || "Screenshot capture returned null"));
      }
    }

    window.addEventListener("message", handler);
    iframe.contentWindow.postMessage({ type: "novum:capture-screenshot" }, "*");
  });
}
