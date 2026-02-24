/**
 * Shared utility for sending messages to Sandpack iframes.
 * Page-aware: in Flow View, targets a specific iframe via data-flow-page-id.
 * In Prototype View (pageId undefined), broadcasts to all iframes.
 */

export function sendToIframe(
  message: { type: string; payload?: unknown },
  pageId?: string
): void {
  if (pageId) {
    // Flow View: target specific iframe via data-flow-page-id
    const iframe = document.querySelector<HTMLIFrameElement>(
      `[data-flow-page-id="${pageId}"] iframe[title="Sandpack Preview"]`
    );
    iframe?.contentWindow?.postMessage(message, "*");
  } else {
    // Prototype View: broadcast to all (only one iframe exists)
    const iframes = document.querySelectorAll<HTMLIFrameElement>(
      'iframe[title="Sandpack Preview"]'
    );
    iframes.forEach((iframe) => iframe.contentWindow?.postMessage(message, "*"));
  }
}

/**
 * Identifies which FlowFrame page an iframe message came from.
 * Returns the pageId if the event.source matches a FlowFrame iframe, undefined otherwise.
 */
export function getPageIdFromMessageSource(event: MessageEvent): string | undefined {
  const flowFrames = document.querySelectorAll<HTMLElement>('[data-flow-page-id]');
  for (const frame of flowFrames) {
    const iframe = frame.querySelector<HTMLIFrameElement>('iframe[title="Sandpack Preview"]');
    if (iframe?.contentWindow === event.source) {
      return frame.getAttribute('data-flow-page-id') ?? undefined;
    }
  }
  return undefined;
}
