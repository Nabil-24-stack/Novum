"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { SelectedElement, InspectionMessage } from "@/lib/inspection/types";

export interface UseInspectionOptions {
  /** Callback triggered when an element is selected */
  onElementSelected?: (element: SelectedElement) => void;
}

export interface UseInspectionReturn {
  inspectionMode: boolean;
  setInspectionMode: (enabled: boolean) => void;
  toggleInspectionMode: () => void;
  selectedElement: SelectedElement | null;
  clearSelection: () => void;
  /** Update the source location of the selected element (used after keyboard reordering) */
  updateSelectedElementSource: (source: SelectedElement["source"]) => void;
}

export function useInspection(options: UseInspectionOptions = {}): UseInspectionReturn {
  const { onElementSelected } = options;
  const [inspectionMode, setInspectionModeState] = useState(false);
  const [selectedElement, setSelectedElement] = useState<SelectedElement | null>(null);
  const iframesRef = useRef<Set<HTMLIFrameElement>>(new Set());

  // Broadcast inspection mode changes to all Sandpack iframes
  const broadcastInspectionMode = useCallback((enabled: boolean) => {
    // Find all Sandpack preview iframes
    const iframes = document.querySelectorAll<HTMLIFrameElement>('iframe[title="Sandpack Preview"]');

    iframes.forEach((iframe) => {
      try {
        iframe.contentWindow?.postMessage(
          {
            type: "novum:inspection-mode",
            payload: { enabled },
          } as InspectionMessage,
          "*"
        );
      } catch (err) {
        console.warn("Failed to send inspection mode to iframe:", err);
      }
    });
  }, []);

  const setInspectionMode = useCallback((enabled: boolean) => {
    setInspectionModeState(enabled);
    broadcastInspectionMode(enabled);

    // Clear selection when disabling inspection mode
    if (!enabled) {
      setSelectedElement(null);
    }
  }, [broadcastInspectionMode]);

  const toggleInspectionMode = useCallback(() => {
    setInspectionMode(!inspectionMode);
  }, [inspectionMode, setInspectionMode]);

  const clearSelection = useCallback(() => {
    setSelectedElement(null);
  }, []);

  const updateSelectedElementSource = useCallback((source: SelectedElement["source"]) => {
    setSelectedElement((prev) => prev ? { ...prev, source } : null);
  }, []);

  // Listen for element selection messages and inspector ready signals from iframe
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const data = event.data as InspectionMessage;

      if ((data?.type === "novum:element-selected" || data?.type === "novum:selection-revalidated") && data.payload) {
        const element = data.payload as SelectedElement;

        // Determine which FlowFrame this selection came from (Flow View)
        const flowFrames = document.querySelectorAll<HTMLElement>('[data-flow-page-id]');
        for (const frame of flowFrames) {
          const iframe = frame.querySelector<HTMLIFrameElement>('iframe[title="Sandpack Preview"]');
          if (iframe?.contentWindow === event.source) {
            element.pageId = frame.getAttribute('data-flow-page-id') ?? undefined;
            break;
          }
        }

        setSelectedElement(element);
        if (data.type === "novum:element-selected") {
          onElementSelected?.(element);
        }
      }

      // Handle inspector ready signal (iframe just loaded/reloaded)
      // Re-broadcast current inspection mode to sync state
      if (data?.type === "novum:inspector-ready") {
        broadcastInspectionMode(inspectionMode);
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [onElementSelected, inspectionMode, broadcastInspectionMode]);

  // Re-broadcast inspection mode when new iframes appear (e.g., after Sandpack remount)
  useEffect(() => {
    if (!inspectionMode) return;

    const currentIframesRef = iframesRef.current;

    const observer = new MutationObserver(() => {
      const iframes = document.querySelectorAll<HTMLIFrameElement>('iframe[title="Sandpack Preview"]');

      iframes.forEach((iframe) => {
        if (!currentIframesRef.has(iframe)) {
          currentIframesRef.add(iframe);

          // Wait a bit for the iframe to be ready
          setTimeout(() => {
            try {
              iframe.contentWindow?.postMessage(
                {
                  type: "novum:inspection-mode",
                  payload: { enabled: true },
                } as InspectionMessage,
                "*"
              );
            } catch {
              // Ignore errors
            }
          }, 500);
        }
      });
    });

    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      currentIframesRef.clear();
    };
  }, [inspectionMode]);

  return {
    inspectionMode,
    setInspectionMode,
    toggleInspectionMode,
    selectedElement,
    clearSelection,
    updateSelectedElementSource,
  };
}
