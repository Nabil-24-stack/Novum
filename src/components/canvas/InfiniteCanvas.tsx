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
  hideChrome?: boolean;
}

// Context to share canvas scale with child components (e.g., Frame)
const CanvasScaleContext = createContext<number>(1);

export function useCanvasScale() {
  return useContext(CanvasScaleContext);
}

const MIN_SCALE = 0.1;
const MAX_SCALE = 3;
const ZOOM_SENSITIVITY = 0.01;
const SHOW_CANVAS_TOOLBAR = false;

export const InfiniteCanvas = forwardRef<HTMLDivElement, InfiniteCanvasProps>(function InfiniteCanvas(
  { children, viewport, onViewportChange, activeTool, onToolChange, isDrawingActive, onCanvasClick, hideChrome },
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
    if (!SHOW_CANVAS_TOOLBAR || !onToolChange) return;

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

      // Skip if Cmd/Ctrl is held (allow native shortcuts like Cmd+C, Cmd+V, Cmd+F)
      if (e.metaKey || e.ctrlKey) return;

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
          if (!e.shiftKey) break;
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
      // Skip pan/zoom while drawing or when chrome is hidden (expanded mode)
      if (isDrawingActive || hideChrome) return;
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
      if (hideChrome) return;

      if (e.button === 1) {
        // Middle mouse pan
        e.preventDefault();
        middleMousePan.current = { active: true, lastX: e.clientX, lastY: e.clientY };
        container.setPointerCapture(e.pointerId);
        container.style.cursor = "grabbing";
      } else if (e.button === 0 && activeTool === "cursor") {
        // Left-click pan when cursor tool active (only on canvas background)
        if (e.target !== container) return;
        e.preventDefault();
        middleMousePan.current = { active: true, lastX: e.clientX, lastY: e.clientY };
        container.setPointerCapture(e.pointerId);
        container.style.cursor = "grabbing";
      }
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
      if (e.button !== 1 && e.button !== 0) return;
      if (!middleMousePan.current.active) return;
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
  }, [onViewportChange, isDrawingActive, hideChrome, activeTool]);

  // Listen for wheel events forwarded from Sandpack iframes via postMessage.
  // Iframes capture wheel events (they don't bubble to parent document),
  // so the inspector script forwards ctrl+wheel (pinch-to-zoom) here.
  useEffect(() => {
    const handleIframeWheel = (event: MessageEvent) => {
      if (!event.data || event.data.type !== "novum:wheel-event") return;
      if (isDrawingActive || hideChrome) return;

      const container = containerRef.current;
      if (!container) return;

      // Find the iframe that sent this message
      const iframes = container.querySelectorAll<HTMLIFrameElement>(
        'iframe[title="Sandpack Preview"]'
      );
      let sourceIframe: HTMLIFrameElement | null = null;
      for (const iframe of iframes) {
        if (iframe.contentWindow === event.source) {
          sourceIframe = iframe;
          break;
        }
      }
      if (!sourceIframe) return;

      const { deltaY, clientX, clientY, ctrlKey } = event.data;

      // Convert iframe-local coordinates to container-local coordinates
      const containerRect = container.getBoundingClientRect();
      const iframeRect = sourceIframe.getBoundingClientRect();
      const scaleX = iframeRect.width / sourceIframe.clientWidth;
      const scaleY = iframeRect.height / sourceIframe.clientHeight;
      const mouseX = iframeRect.left + clientX * scaleX - containerRect.left;
      const mouseY = iframeRect.top + clientY * scaleY - containerRect.top;

      if (ctrlKey) {
        // Pinch-to-zoom with focal point preservation
        onViewportChange((prev) => {
          const pointXBefore = (mouseX - prev.x) / prev.scale;
          const pointYBefore = (mouseY - prev.y) / prev.scale;
          const delta = -deltaY * ZOOM_SENSITIVITY;
          const newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, prev.scale * (1 + delta)));
          const pointXAfter = pointXBefore * newScale;
          const pointYAfter = pointYBefore * newScale;
          return {
            x: mouseX - pointXAfter,
            y: mouseY - pointYAfter,
            scale: newScale,
          };
        });
      }
    };

    window.addEventListener("message", handleIframeWheel);
    return () => window.removeEventListener("message", handleIframeWheel);
  }, [onViewportChange, isDrawingActive, hideChrome]);

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
        style={{ contain: "strict", cursor: activeTool === "cursor" ? "grab" : undefined }}
        onClick={handleCanvasClick}
        onScroll={handleScroll}
      >

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
        {!hideChrome && (
          <div className="absolute bottom-4 right-4 bg-white/90 backdrop-blur-sm px-3 py-1.5 rounded-md shadow-sm text-base text-neutral-600 font-mono">
            {Math.round(viewport.scale * 100)}%
          </div>
        )}

        {/* Canvas Toolbar */}
        {!hideChrome && SHOW_CANVAS_TOOLBAR && onToolChange && (
          <CanvasToolbar
            activeTool={activeTool ?? "cursor"}
            onToolChange={onToolChange}
          />
        )}
      </div>
    </CanvasScaleContext.Provider>
  );
});
