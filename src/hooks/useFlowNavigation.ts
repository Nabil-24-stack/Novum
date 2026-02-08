"use client";

import { useEffect, useRef, useCallback } from "react";
import { toast } from "sonner";
import type { FlowManifest, FlowNodePosition } from "@/lib/flow/types";
import type { ViewportState } from "@/components/canvas/InfiniteCanvas";
import type { CanvasMode } from "@/components/flow/ViewModeToggle";
import type { NavigationIntentPayload, InspectionMessage } from "@/lib/inspection/types";
import {
  animateViewport,
  calculateCenteredViewport,
} from "@/lib/canvas/viewport-animation";

interface UseFlowNavigationOptions {
  /** Current canvas mode (prototype/flow) */
  canvasMode: CanvasMode;
  /** Flow manifest containing pages and connections */
  manifest: FlowManifest;
  /** Map of node positions by page ID */
  nodePositions: Map<string, FlowNodePosition>;
  /** Current viewport state */
  viewport: ViewportState;
  /** Callback to update viewport state */
  onViewportChange: React.Dispatch<React.SetStateAction<ViewportState>>;
  /** Container dimensions for centering calculations */
  containerDimensions: { width: number; height: number };
}

/**
 * Hook that manages flow mode navigation interception.
 *
 * When in Flow View:
 * - Broadcasts flow mode state to all iframes
 * - Listens for navigation intent messages from iframes
 * - Animates viewport to center on target page frame
 * - Shows toast if target route not found
 */
export function useFlowNavigation({
  canvasMode,
  manifest,
  nodePositions,
  viewport,
  onViewportChange,
  containerDimensions,
}: UseFlowNavigationOptions) {
  const isFlowMode = canvasMode === "flow";
  const cancelAnimationRef = useRef<(() => void) | null>(null);

  // Broadcast flow mode state to all Sandpack iframes
  const broadcastFlowModeState = useCallback((enabled: boolean) => {
    const iframes = document.querySelectorAll<HTMLIFrameElement>(
      'iframe[title="Sandpack Preview"]'
    );
    iframes.forEach((iframe) => {
      try {
        iframe.contentWindow?.postMessage(
          {
            type: "novum:flow-mode-state",
            payload: { enabled },
          } as InspectionMessage,
          "*"
        );
      } catch {
        // Ignore errors (iframe might not be ready)
      }
    });
  }, []);

  // Handle navigation intent from iframe
  const handleNavigationIntent = useCallback(
    (payload: NavigationIntentPayload) => {
      if (!isFlowMode) return;

      const { targetRoute } = payload;

      // Find the page with matching route
      const targetPage = manifest.pages.find((page) => page.route === targetRoute);

      if (!targetPage) {
        toast.error(`Route "${targetRoute}" not found in flow`);
        return;
      }

      // Get the node position for the target page
      const targetPosition = nodePositions.get(targetPage.id);

      if (!targetPosition) {
        toast.error(`No frame found for page "${targetPage.name}"`);
        return;
      }

      // Cancel any ongoing animation
      if (cancelAnimationRef.current) {
        cancelAnimationRef.current();
      }

      // Adjust for FlowFrame's additional height (Frame header + title bar)
      // These match the values in FlowFrame.tsx: height: position.height + 36 + 28
      const FRAME_HEADER_HEIGHT = 36;
      const TITLE_BAR_HEIGHT = 28;

      const adjustedPosition = {
        ...targetPosition,
        height: targetPosition.height + FRAME_HEADER_HEIGHT + TITLE_BAR_HEIGHT,
      };

      // Calculate target viewport state (centered at 100% zoom)
      const targetViewport = calculateCenteredViewport(
        adjustedPosition,
        containerDimensions.width,
        containerDimensions.height
      );

      // Animate to target viewport
      cancelAnimationRef.current = animateViewport(
        viewport,
        targetViewport,
        (interpolatedState) => {
          onViewportChange(interpolatedState);
        },
        { duration: 300 }
      );
    },
    [
      isFlowMode,
      manifest.pages,
      nodePositions,
      viewport,
      onViewportChange,
      containerDimensions,
    ]
  );

  // Broadcast flow mode state when mode changes
  useEffect(() => {
    broadcastFlowModeState(isFlowMode);
  }, [isFlowMode, broadcastFlowModeState]);

  // Listen for navigation intent messages
  useEffect(() => {
    if (!isFlowMode) return;

    const handleMessage = (event: MessageEvent) => {
      if (!event.data || event.data.type !== "novum:navigation-intent") return;

      const payload = event.data.payload as NavigationIntentPayload;
      if (payload && payload.targetRoute) {
        handleNavigationIntent(payload);
      }
    };

    window.addEventListener("message", handleMessage);

    return () => {
      window.removeEventListener("message", handleMessage);
      // Note: Animation cancellation is handled by:
      // - handleNavigationIntent (when starting new animation)
      // - Unmount effect (lines below)
      // Do NOT cancel here - this cleanup runs when handleNavigationIntent
      // changes due to viewport updates during animation, which would
      // prematurely stop the animation after 1-2 frames.
    };
  }, [isFlowMode, handleNavigationIntent]);

  // Cleanup animation on unmount
  useEffect(() => {
    return () => {
      if (cancelAnimationRef.current) {
        cancelAnimationRef.current();
      }
    };
  }, []);

  return {
    /** Broadcast flow mode state to iframes (useful for manual sync) */
    broadcastFlowModeState,
  };
}
