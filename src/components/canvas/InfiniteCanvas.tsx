"use client";

import React, { ReactNode, useRef, useEffect, createContext, useContext, forwardRef, useImperativeHandle } from "react";
import { CanvasToolbar } from "./CanvasToolbar";
import type { CanvasTool } from "@/lib/canvas/types";

export interface ViewportState {
  x: number;
  y: number;
  scale: number;
}

interface InfiniteCanvasProps {
  children: ReactNode;
  viewport: ViewportState;
  onViewportChange: React.Dispatch<React.SetStateAction<ViewportState>>;
  activeTool?: CanvasTool;
  onToolChange?: (tool: CanvasTool) => void;
  isDrawingActive?: boolean;
  onCanvasClick?: () => void;
}

// Context to share canvas scale with child components (e.g., Frame)
const CanvasScaleContext = createContext<number>(1);

export function useCanvasScale() {
  return useContext(CanvasScaleContext);
}

const MIN_SCALE = 0.1;
const MAX_SCALE = 3;
const ZOOM_SENSITIVITY = 0.01;

export const InfiniteCanvas = forwardRef<HTMLDivElement, InfiniteCanvasProps>(function InfiniteCanvas(
  { children, viewport, onViewportChange, activeTool, onToolChange, isDrawingActive, onCanvasClick },
  ref
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const middleMousePan = useRef<{ active: boolean; lastX: number; lastY: number }>({
    active: false,
    lastX: 0,
    lastY: 0,
  });

  // Expose container ref to parent via forwardRef
  useImperativeHandle(ref, () => containerRef.current!, []);

  // Keyboard shortcuts for tool switching
  useEffect(() => {
    if (!onToolChange) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger shortcuts when typing in input fields
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      ) {
        return;
      }

      const key = e.key.toLowerCase();

      switch (key) {
        case "v":
          e.preventDefault();
          onToolChange("cursor");
          break;
        case "f":
          e.preventDefault();
          onToolChange("frame");
          break;
        case "t":
          e.preventDefault();
          onToolChange("text");
          break;
        case "c":
          e.preventDefault();
          onToolChange("component");
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onToolChange]);

  // Use native event listener with { passive: false } to allow preventDefault()
  // This prevents the browser's native pinch-to-zoom from triggering
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      // Skip pan/zoom while drawing to prevent accidental canvas movement
      if (isDrawingActive) return;
      e.preventDefault();

      // Pinch-to-zoom: browsers report pinch gestures as wheel events with ctrlKey
      if (e.ctrlKey) {
        const rect = container.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        // Functional update - prev is always current state (fixes stale closure bug)
        onViewportChange((prev) => {
          // Calculate the point in canvas space before zoom
          const pointXBefore = (mouseX - prev.x) / prev.scale;
          const pointYBefore = (mouseY - prev.y) / prev.scale;

          // Calculate new scale (deltaY is negative when pinching out/zooming in)
          const delta = -e.deltaY * ZOOM_SENSITIVITY;
          const newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, prev.scale * (1 + delta)));

          // Calculate new position to keep the point under the mouse
          const pointXAfter = pointXBefore * newScale;
          const pointYAfter = pointYBefore * newScale;

          return {
            x: mouseX - pointXAfter,
            y: mouseY - pointYAfter,
            scale: newScale,
          };
        });
      } else {
        // Two-finger scroll: pan the canvas (functional update)
        onViewportChange((prev) => ({
          ...prev,
          x: prev.x - e.deltaX,
          y: prev.y - e.deltaY,
        }));
      }
    };

    // Prevent browser auto-scroll on middle-click
    const handleAuxClick = (e: MouseEvent) => {
      if (e.button === 1) e.preventDefault();
    };

    // Middle-mouse drag pan
    const handlePointerDown = (e: PointerEvent) => {
      if (e.button !== 1) return; // Middle mouse button only
      e.preventDefault();
      middleMousePan.current = { active: true, lastX: e.clientX, lastY: e.clientY };
      container.setPointerCapture(e.pointerId);
      container.style.cursor = "grabbing";
    };

    const handlePointerMove = (e: PointerEvent) => {
      if (!middleMousePan.current.active) return;
      const dx = e.clientX - middleMousePan.current.lastX;
      const dy = e.clientY - middleMousePan.current.lastY;
      middleMousePan.current.lastX = e.clientX;
      middleMousePan.current.lastY = e.clientY;
      onViewportChange((prev) => ({ ...prev, x: prev.x + dx, y: prev.y + dy }));
    };

    const handlePointerUp = (e: PointerEvent) => {
      if (e.button !== 1) return;
      middleMousePan.current.active = false;
      container.releasePointerCapture(e.pointerId);
      container.style.cursor = "";
    };

    // Attach with { passive: false } to enable preventDefault()
    container.addEventListener("wheel", handleWheel, { passive: false });
    container.addEventListener("pointerdown", handlePointerDown);
    container.addEventListener("pointermove", handlePointerMove);
    container.addEventListener("pointerup", handlePointerUp);
    // Prevent browser auto-scroll icon on middle-click (mousedown fires before pointerdown)
    const handleMouseDown = (e: MouseEvent) => {
      if (e.button === 1) e.preventDefault();
    };

    container.addEventListener("auxclick", handleAuxClick);
    container.addEventListener("mousedown", handleMouseDown);

    return () => {
      container.removeEventListener("wheel", handleWheel);
      container.removeEventListener("pointerdown", handlePointerDown);
      container.removeEventListener("pointermove", handlePointerMove);
      container.removeEventListener("pointerup", handlePointerUp);
      container.removeEventListener("auxclick", handleAuxClick);
      container.removeEventListener("mousedown", handleMouseDown);
    };
  }, [onViewportChange, isDrawingActive]);

  // Handle canvas background click to deselect
  const handleCanvasClick = (e: React.MouseEvent) => {
    // Only trigger if clicking directly on the canvas container (not on children)
    if (e.target === e.currentTarget && onCanvasClick) {
      onCanvasClick();
    }
  };

  // Scroll Guard: Prevent browser hash navigation from scrolling the canvas
  // The canvas uses CSS transforms for positioning, assuming scrollTop/scrollLeft are always 0.
  // When the generated app uses <a href="#..."> links, the browser's native "scroll to anchor"
  // behavior can scroll this container, breaking the coordinate system.
  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    if (target.scrollTop !== 0 || target.scrollLeft !== 0) {
      target.scrollTop = 0;
      target.scrollLeft = 0;
    }
  };

  return (
    <CanvasScaleContext.Provider value={viewport.scale}>
      <div
        ref={containerRef}
        className="w-full h-full min-h-0 overflow-hidden bg-neutral-100 relative isolate"
        style={{ contain: "strict" }}
        onClick={handleCanvasClick}
        onScroll={handleScroll}
      >
        {/* Grid pattern background */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage: `
              radial-gradient(circle, #d4d4d4 1px, transparent 1px)
            `,
            backgroundSize: `${20 * viewport.scale}px ${20 * viewport.scale}px`,
            backgroundPosition: `${viewport.x}px ${viewport.y}px`,
          }}
        />

        {/* Canvas content with pan/zoom transform */}
        <div
          className="absolute origin-top-left"
          style={{
            transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.scale})`,
          }}
        >
          {children}
        </div>

        {/* Zoom indicator */}
        <div className="absolute bottom-4 right-4 bg-white/90 backdrop-blur-sm px-3 py-1.5 rounded-md shadow-sm text-base text-neutral-600 font-mono">
          {Math.round(viewport.scale * 100)}%
        </div>

        {/* Canvas Toolbar */}
        {onToolChange && (
          <CanvasToolbar
            activeTool={activeTool ?? "cursor"}
            onToolChange={onToolChange}
          />
        )}
      </div>
    </CanvasScaleContext.Provider>
  );
});
