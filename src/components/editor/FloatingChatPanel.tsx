"use client";

import { useRef, useCallback, useState, useEffect, type ReactNode } from "react";
import { PanelRightClose, GripHorizontal } from "lucide-react";

interface FloatingChatPanelProps {
  children: ReactNode;
  /** When true, renders as a fixed-position floating panel. When false, renders as a simple passthrough container. */
  floating: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
  onMove: (x: number, y: number) => void;
  onResize: (width: number, height: number) => void;
  onDock: () => void;
  /** Class applied to the outer div when not floating (docked mode) */
  dockedClassName?: string;
  /** When true, applies CSS transition on position changes (for programmatic animations). Disabled during drag/resize. */
  animate?: boolean;
}

const MIN_WIDTH = 320;
const MIN_HEIGHT = 300;

/**
 * Wrapper component that toggles between docked (passthrough) and floating (fixed-position) modes.
 *
 * CRITICAL: The header, content, and resize handle divs are ALWAYS in the DOM at the same
 * positions [0], [1], [2]. When docked, they use `display: none` (via "hidden" class).
 * This ensures React never remounts children when toggling modes.
 */
export function FloatingChatPanel({
  children,
  floating,
  x,
  y,
  width,
  height,
  onMove,
  onResize,
  onDock,
  dockedClassName,
  animate,
}: FloatingChatPanelProps) {
  const dragRef = useRef<{ offsetX: number; offsetY: number } | null>(null);
  const resizeRef = useRef<{
    startX: number;
    startY: number;
    startW: number;
    startH: number;
  } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);

  // Stable refs for callbacks to avoid re-running the clamping effect on every render
  const onMoveRef = useRef(onMove);
  const onResizeRef = useRef(onResize);
  onMoveRef.current = onMove;
  onResizeRef.current = onResize;

  // Clamp panel to stay fully within the viewport on any position/size change and window resize
  useEffect(() => {
    if (!floating) return;

    const clamp = () => {
      const vw = window.innerWidth;
      const vh = window.innerHeight;

      // Shrink dimensions if they exceed the viewport
      const clampedW = Math.min(width, Math.max(MIN_WIDTH, vw));
      const clampedH = Math.min(height, Math.max(MIN_HEIGHT, vh));

      // Keep the panel fully on-screen
      const maxX = Math.max(0, vw - clampedW);
      const maxY = Math.max(0, vh - clampedH);
      const clampedX = Math.max(0, Math.min(x, maxX));
      const clampedY = Math.max(0, Math.min(y, maxY));

      if (clampedW !== width || clampedH !== height) {
        onResizeRef.current(clampedW, clampedH);
      }
      if (clampedX !== x || clampedY !== y) {
        onMoveRef.current(clampedX, clampedY);
      }
    };

    clamp();
    window.addEventListener("resize", clamp);
    return () => window.removeEventListener("resize", clamp);
  }, [floating, x, y, width, height]);

  // --- Drag via title bar ---

  const handleDragPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if ((e.target as HTMLElement).closest("button")) return;
      e.preventDefault();
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      setIsDragging(true);
      dragRef.current = { offsetX: e.clientX - x, offsetY: e.clientY - y };
    },
    [x, y]
  );

  const handleDragPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragRef.current) return;
      const rawX = e.clientX - dragRef.current.offsetX;
      const rawY = e.clientY - dragRef.current.offsetY;
      // Clamp so the panel stays within the viewport
      const clampedX = Math.max(0, Math.min(rawX, window.innerWidth - width));
      const clampedY = Math.max(0, Math.min(rawY, window.innerHeight - height));
      onMove(clampedX, clampedY);
    },
    [onMove, width, height]
  );

  const handleDragPointerUp = useCallback(() => {
    dragRef.current = null;
    setIsDragging(false);
  }, []);

  // --- Resize via bottom-right corner ---

  const handleResizePointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      setIsResizing(true);
      resizeRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        startW: width,
        startH: height,
      };
    },
    [width, height]
  );

  const handleResizePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!resizeRef.current) return;
      // Clamp so the panel doesn't extend past the viewport
      const maxW = window.innerWidth - x;
      const maxH = window.innerHeight - y;
      const newW = Math.min(
        maxW,
        Math.max(
          MIN_WIDTH,
          resizeRef.current.startW + (e.clientX - resizeRef.current.startX)
        )
      );
      const newH = Math.min(
        maxH,
        Math.max(
          MIN_HEIGHT,
          resizeRef.current.startH + (e.clientY - resizeRef.current.startY)
        )
      );
      onResize(newW, newH);
    },
    [onResize, x, y]
  );

  const handleResizePointerUp = useCallback(() => {
    resizeRef.current = null;
    setIsResizing(false);
  }, []);

  return (
    <div
      className={
        floating
          ? "fixed bg-white border border-neutral-200 rounded-xl shadow-2xl flex flex-col overflow-hidden"
          : dockedClassName ?? ""
      }
      style={
        floating
          ? {
              left: x,
              top: y,
              width,
              height,
              zIndex: 99998,
              transition:
                animate && !isDragging && !isResizing
                  ? "left 0.4s ease-out, top 0.4s ease-out"
                  : "none",
            }
          : undefined
      }
    >
      {/* Position [0]: Header / drag handle - always in DOM, hidden when docked */}
      <div
        className={
          floating
            ? "flex items-center justify-between px-3 py-2 border-b border-neutral-200 bg-neutral-50 cursor-grab active:cursor-grabbing select-none shrink-0"
            : "hidden"
        }
        onPointerDown={handleDragPointerDown}
        onPointerMove={handleDragPointerMove}
        onPointerUp={handleDragPointerUp}
      >
        <div className="flex items-center gap-2 text-sm font-medium text-neutral-700">
          <GripHorizontal className="w-4 h-4 text-neutral-400" />
          Chat
        </div>
        <button
          onClick={onDock}
          className="p-1 hover:bg-neutral-200 rounded transition-colors"
          title="Dock to sidebar"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <PanelRightClose className="w-4 h-4 text-neutral-500" />
        </button>
      </div>

      {/* Position [1]: Content - always at same position, children never remount */}
      <div className={floating ? "flex-1 overflow-hidden" : "h-full"}>
        {children}
      </div>

      {/* Position [2]: Resize handle - always in DOM, hidden when docked */}
      <div
        className={
          floating
            ? "absolute bottom-0 right-0 w-4 h-4 cursor-se-resize"
            : "hidden"
        }
        onPointerDown={handleResizePointerDown}
        onPointerMove={handleResizePointerMove}
        onPointerUp={handleResizePointerUp}
      >
        <svg
          viewBox="0 0 16 16"
          fill="none"
          className="w-full h-full text-neutral-400"
        >
          <line
            x1="14"
            y1="4"
            x2="4"
            y2="14"
            stroke="currentColor"
            strokeWidth="1.5"
          />
          <line
            x1="14"
            y1="9"
            x2="9"
            y2="14"
            stroke="currentColor"
            strokeWidth="1.5"
          />
        </svg>
      </div>
    </div>
  );
}
