"use client";

import { useState, useCallback, useRef } from "react";
import type { ViewportState } from "@/components/canvas/InfiniteCanvas";
import type { FlowNodePosition } from "@/lib/flow/types";
import type { CanvasMode } from "@/components/flow/ViewModeToggle";
import {
  animateViewport,
  calculateCenteredViewport,
  calculateFitAllViewport,
} from "@/lib/canvas/viewport-animation";

/** Per-frame transition target during animation */
export interface FrameTransitionTarget {
  opacity: number;
  translateX: number;  // Offset from natural position
  translateY: number;
  scale: number;       // 1 = normal, 0.85 = slightly smaller
}

export interface CanvasTransitionState {
  /** Whether a transition animation is currently in progress */
  isTransitioning: boolean;
  /** Current transition phase */
  phase: "idle" | "spreading" | "collapsing";
  /** Per-frame transition targets (opacity values during animation) */
  frameTargets: Map<string, FrameTransitionTarget>;
  /** Opacity for FlowConnections during transition */
  connectionOpacity: number;
  /** Start a transition between modes */
  start: (
    fromMode: CanvasMode,
    toMode: CanvasMode,
    activePageId: string,
    nodePositions: Map<string, FlowNodePosition>,
    viewport: ViewportState,
    setViewport: (v: ViewportState | ((prev: ViewportState) => ViewportState)) => void,
    containerDimensions: { width: number; height: number }
  ) => void;
}

const TRANSITION_DURATION = 300;

/**
 * Hook that coordinates animated transitions between prototype and flow modes.
 *
 * Prototype -> Flow ("spreading"):
 * 1. Make all non-active frames visible at opacity 0
 * 2. Animate them to opacity 1 via CSS transitions
 * 3. Animate viewport to fit all nodes
 * 4. Fade in FlowConnections
 *
 * Flow -> Prototype ("collapsing"):
 * 1. Fade out FlowConnections
 * 2. Animate non-active frames to opacity 0
 * 3. Animate viewport to center on active node
 * 4. After animation: hide non-active frames
 */
export function useCanvasTransition(): CanvasTransitionState {
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [phase, setPhase] = useState<"idle" | "spreading" | "collapsing">("idle");
  const [frameTargets, setFrameTargets] = useState<Map<string, FrameTransitionTarget>>(
    () => new Map()
  );
  const [connectionOpacity, setConnectionOpacity] = useState(1);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelAnimRef = useRef<(() => void) | null>(null);

  const cleanup = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (cancelAnimRef.current) {
      cancelAnimRef.current();
      cancelAnimRef.current = null;
    }
  }, []);

  const start = useCallback(
    (
      fromMode: CanvasMode,
      toMode: CanvasMode,
      activePageId: string,
      nodePositions: Map<string, FlowNodePosition>,
      viewport: ViewportState,
      setViewport: (v: ViewportState | ((prev: ViewportState) => ViewportState)) => void,
      containerDimensions: { width: number; height: number }
    ) => {
      cleanup();

      // Get active frame position for delta calculations
      const activePos = nodePositions.get(activePageId);

      if (fromMode === "prototype" && toMode === "flow") {
        // --- Spreading: Prototype -> Flow ---
        setIsTransitioning(true);
        setPhase("spreading");
        setConnectionOpacity(0);

        // Start with non-active frames stacked behind active (translated to active position, scaled down, opacity 0)
        const targets = new Map<string, FrameTransitionTarget>();
        for (const [id] of nodePositions) {
          if (id === activePageId) {
            targets.set(id, { opacity: 1, translateX: 0, translateY: 0, scale: 1 });
          } else {
            const pos = nodePositions.get(id);
            const deltaX = activePos && pos ? activePos.x - pos.x : 0;
            const deltaY = activePos && pos ? activePos.y - pos.y : 0;
            targets.set(id, { opacity: 0, translateX: deltaX, translateY: deltaY, scale: 0.85 });
          }
        }
        setFrameTargets(targets);

        // After double-rAF, animate to final positions (CSS transition handles the animation)
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            const finalTargets = new Map<string, FrameTransitionTarget>();
            for (const [id] of nodePositions) {
              finalTargets.set(id, { opacity: 1, translateX: 0, translateY: 0, scale: 1 });
            }
            setFrameTargets(finalTargets);
          });
        });

        // Animate viewport to fit all nodes
        // Account for FlowFrame header (36px)
        const EXTRA_HEIGHT = 36;
        const allRects = Array.from(nodePositions.values()).map((pos) => ({
          x: pos.x,
          y: pos.y,
          width: pos.width,
          height: pos.height + EXTRA_HEIGHT,
        }));

        const targetViewport = calculateFitAllViewport(
          allRects,
          containerDimensions.width,
          containerDimensions.height
        );

        cancelAnimRef.current = animateViewport(
          viewport,
          targetViewport,
          setViewport,
          { duration: TRANSITION_DURATION }
        );

        // After transition: fade in connections, end transition
        timeoutRef.current = setTimeout(() => {
          setConnectionOpacity(1);
          setIsTransitioning(false);
          setPhase("idle");
          setFrameTargets(new Map());
        }, TRANSITION_DURATION + 50);
      } else if (fromMode === "flow" && toMode === "prototype") {
        // --- Collapsing: Flow -> Prototype ---
        setIsTransitioning(true);
        setPhase("collapsing");
        setConnectionOpacity(0); // Fade out connections immediately

        // Start with all frames at their natural positions
        const targets = new Map<string, FrameTransitionTarget>();
        for (const [id] of nodePositions) {
          targets.set(id, { opacity: 1, translateX: 0, translateY: 0, scale: 1 });
        }
        setFrameTargets(targets);

        // After double-rAF, animate non-active frames toward and behind the active frame
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            const finalTargets = new Map<string, FrameTransitionTarget>();
            for (const [id] of nodePositions) {
              if (id === activePageId) {
                finalTargets.set(id, { opacity: 1, translateX: 0, translateY: 0, scale: 1 });
              } else {
                const pos = nodePositions.get(id);
                const deltaX = activePos && pos ? activePos.x - pos.x : 0;
                const deltaY = activePos && pos ? activePos.y - pos.y : 0;
                finalTargets.set(id, { opacity: 0, translateX: deltaX, translateY: deltaY, scale: 0.85 });
              }
            }
            setFrameTargets(finalTargets);
          });
        });

        // Animate viewport to center on the active frame
        if (activePos) {
          const EXTRA_HEIGHT = 36;
          const targetViewport = calculateCenteredViewport(
            { x: activePos.x, y: activePos.y, width: activePos.width, height: activePos.height + EXTRA_HEIGHT },
            containerDimensions.width,
            containerDimensions.height
          );
          cancelAnimRef.current = animateViewport(
            viewport,
            targetViewport,
            setViewport,
            { duration: TRANSITION_DURATION }
          );
        }

        // After transition: end
        timeoutRef.current = setTimeout(() => {
          setIsTransitioning(false);
          setPhase("idle");
          setFrameTargets(new Map());
        }, TRANSITION_DURATION + 50);
      }
    },
    [cleanup]
  );

  return {
    isTransitioning,
    phase,
    frameTargets,
    connectionOpacity,
    start,
  };
}
