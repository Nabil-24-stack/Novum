import { useEffect, useRef } from "react";
import { useAnnotationStore } from "./useAnnotationStore";
import { getPageIdFromMessageSource } from "@/lib/inspection/iframe-messaging";
import type { ProductBrainData } from "@/lib/product-brain/types";

interface UseAnnotationResolutionConfig {
  brainData: ProductBrainData | null;
}

/**
 * Manages continuous annotation tracking lifecycle.
 * Sends `novum:strategy-track-start/stop` to iframes and
 * listens for `novum:strategy-bounds-batch` for real-time updates.
 */
export function useAnnotationResolution({ brainData }: UseAnnotationResolutionConfig) {
  const activeFrames = useAnnotationStore((s) => s.activeFrames);
  const setBoundsBatch = useAnnotationStore((s) => s.setBoundsBatch);
  const clearBounds = useAnnotationStore((s) => s.clearBounds);

  // Track which iframes we've started tracking on
  const trackedFramesRef = useRef<Map<string, HTMLIFrameElement>>(new Map());
  const brainDataRef = useRef(brainData);
  useEffect(() => {
    brainDataRef.current = brainData;
  });

  // Keep a ref of activeFrames for the inspector-ready handler (can't access state in event listener)
  const activeFramesRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    activeFramesRef.current = new Set(activeFrames);
  });

  // Collect strategyIds for a page from brainData
  function getStrategyIdsForPage(pageId: string, bd: ProductBrainData | null): string[] {
    if (!bd) return [];
    const pageDec = bd.pages.find((p) => p.pageId === pageId);
    if (!pageDec) return [];
    return pageDec.connections.map((c) => c.id);
  }

  // Find iframe element for a page
  function getIframeForPage(pageId: string): HTMLIFrameElement | null {
    const container = document.querySelector(`[data-flow-page-id="${pageId}"]`);
    return container?.querySelector<HTMLIFrameElement>('iframe[title="Sandpack Preview"]') ?? null;
  }

  // Send track-start to an iframe
  function sendTrackStart(iframe: HTMLIFrameElement, strategyIds: string[]) {
    if (iframe.contentWindow && strategyIds.length > 0) {
      iframe.contentWindow.postMessage(
        { type: "novum:strategy-track-start", payload: { strategyIds } },
        "*"
      );
    }
  }

  // Send track-stop to an iframe
  function sendTrackStop(iframe: HTMLIFrameElement) {
    if (iframe.contentWindow) {
      iframe.contentWindow.postMessage({ type: "novum:strategy-track-stop" }, "*");
    }
  }

  // Main tracking lifecycle: start/stop tracking when activeFrames changes
  useEffect(() => {
    const tracked = trackedFramesRef.current;
    const currentPageIds = new Set(activeFrames);

    // Stop tracking for frames no longer active
    for (const [pageId, iframe] of tracked) {
      if (!currentPageIds.has(pageId)) {
        sendTrackStop(iframe);
        clearBounds(pageId);
        tracked.delete(pageId);
      }
    }

    // Start tracking for newly active frames
    for (const pageId of currentPageIds) {
      if (!tracked.has(pageId)) {
        const iframe = getIframeForPage(pageId);
        if (iframe) {
          const strategyIds = getStrategyIdsForPage(pageId, brainDataRef.current);
          sendTrackStart(iframe, strategyIds);
          tracked.set(pageId, iframe);
        }
      }
    }
  }, [activeFrames, clearBounds]);

  // Re-send track-start when brainData changes (new evaluation, re-evaluation)
  useEffect(() => {
    if (!brainData) return;
    const tracked = trackedFramesRef.current;
    for (const [pageId, iframe] of tracked) {
      const strategyIds = getStrategyIdsForPage(pageId, brainData);
      sendTrackStart(iframe, strategyIds);
    }
  }, [brainData]);

  // Handle iframe reloads: re-send track-start when inspector-ready fires
  // Handle batch bounds updates from iframes
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      // Batch bounds update
      if (e.data?.type === "novum:strategy-bounds-batch") {
        const pageId = getPageIdFromMessageSource(e);
        if (!pageId) return;
        const { bounds } = e.data.payload ?? {};
        if (!Array.isArray(bounds)) return;

        setBoundsBatch(
          pageId,
          bounds.map((b: { strategyId: string; rect: { x: number; y: number; w: number; h: number } | null; isBelowFold: boolean; iframeWidth: number; iframeHeight: number }) => ({
            connectionId: b.strategyId,
            iframeRect: b.rect ? { x: b.rect.x, y: b.rect.y, width: b.rect.w, height: b.rect.h } : null,
            isBelowFold: b.isBelowFold,
            iframeWidth: b.iframeWidth,
            iframeHeight: b.iframeHeight,
          }))
        );
      }

      // Inspector ready: re-send tracking for reloaded iframes
      // Also handles first-time tracking for active frames whose iframes weren't mounted initially
      if (e.data?.type === "novum:inspector-ready") {
        const pageId = getPageIdFromMessageSource(e);
        if (!pageId) return;
        const tracked = trackedFramesRef.current;
        // Allow tracking if the frame is already tracked OR if it's an active frame that wasn't trackable initially
        if (!tracked.has(pageId) && !activeFramesRef.current.has(pageId)) return;

        // Update iframe reference (may have changed after reload)
        const iframe = getIframeForPage(pageId);
        if (iframe) {
          tracked.set(pageId, iframe);
          const strategyIds = getStrategyIdsForPage(pageId, brainDataRef.current);
          sendTrackStart(iframe, strategyIds);
        }
      }
    };

    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [setBoundsBatch]);

  // Cleanup: stop all tracking on unmount
  useEffect(() => {
    const tracked = trackedFramesRef.current;
    return () => {
      for (const [, iframe] of tracked) {
        sendTrackStop(iframe);
      }
      tracked.clear();
    };
  }, []);
}
