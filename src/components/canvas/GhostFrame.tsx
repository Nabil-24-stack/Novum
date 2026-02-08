"use client";

import { useRef, useState, useCallback, PointerEvent } from "react";
import type { GhostElement, CanvasTool, LayoutConfig, NodeStyle } from "@/lib/canvas/types";

// Color map for rendering (Tailwind color name -> CSS color)
const COLOR_MAP: Record<string, string> = {
  "white": "#ffffff",
  "neutral-50": "#fafafa",
  "neutral-100": "#f5f5f5",
  "neutral-200": "#e5e5e5",
  "neutral-300": "#d4d4d4",
  "blue-50": "#eff6ff",
  "blue-100": "#dbeafe",
  "blue-500": "#3b82f6",
  "green-50": "#f0fdf4",
  "green-100": "#dcfce7",
  "green-500": "#22c55e",
  "red-50": "#fef2f2",
  "red-100": "#fee2e2",
  "red-500": "#ef4444",
};

interface GhostFrameProps {
  ghost: GhostElement;
  isSelected: boolean;
  isPrimary?: boolean;         // Primary selection (solid border) vs secondary (dashed)
  onSelect: (e?: React.MouseEvent | React.PointerEvent) => void;
  onUpdate: (updates: Partial<GhostElement>) => void;
  onRemove: () => void;
  onDragEnd?: () => void;
  onDragMove?: (ghost: GhostElement) => void;
  scale?: number;
  activeTool: CanvasTool;
  /** Layout configuration for groups */
  layout?: LayoutConfig;
  /** Style configuration for visual appearance */
  nodeStyle?: NodeStyle;
  /** Whether this frame has children (is a group) */
  isGroup?: boolean;
}

type ResizeHandle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";

const MIN_SIZE = 50;

export function GhostFrame({
  ghost,
  isSelected,
  isPrimary = true,
  onSelect,
  onUpdate,
  onRemove: _onRemove,
  onDragEnd,
  onDragMove,
  scale = 1,
  activeTool,
  layout: _layout,
  nodeStyle,
  isGroup = false,
}: GhostFrameProps) {
  void _layout; // Padding handled via coordinate system in getWorldPosition
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [resizeHandle, setResizeHandle] = useState<ResizeHandle | null>(null);

  const dragStartRef = useRef<{
    mouseX: number;
    mouseY: number;
    ghostX: number;
    ghostY: number;
    ghostWidth: number;
    ghostHeight: number;
  } | null>(null);

  // Keep a ref to the current ghost for use in callbacks without causing re-renders
  const ghostRef = useRef(ghost);
  // Sync ref with current ghost value
  // eslint-disable-next-line react-hooks/refs
  ghostRef.current = ghost;
  void _onRemove; // Reserved for future use

  // Only allow interactions with cursor tool
  const isInteractive = activeTool === "cursor";

  const handleClick = useCallback((e: React.MouseEvent) => {
    if (!isInteractive) return;
    e.stopPropagation();
    onSelect(e);
  }, [isInteractive, onSelect]);

  const handlePointerDown = useCallback((e: PointerEvent<HTMLDivElement>) => {
    if (!isInteractive || !isSelected) return;

    e.stopPropagation();
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    setIsDragging(true);
    dragStartRef.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      ghostX: ghost.x,
      ghostY: ghost.y,
      ghostWidth: ghost.width,
      ghostHeight: ghost.height,
    };
  }, [isInteractive, isSelected, ghost.x, ghost.y, ghost.width, ghost.height]);

  const handlePointerMove = useCallback((e: PointerEvent<HTMLDivElement>) => {
    if (!dragStartRef.current) return;

    const deltaX = (e.clientX - dragStartRef.current.mouseX) / scale;
    const deltaY = (e.clientY - dragStartRef.current.mouseY) / scale;

    if (isDragging && !isResizing) {
      const newX = dragStartRef.current.ghostX + deltaX;
      const newY = dragStartRef.current.ghostY + deltaY;
      onUpdate({ x: newX, y: newY });
      // Use ref to avoid ghost in deps (prevents infinite update loop)
      onDragMove?.({ ...ghostRef.current, x: newX, y: newY });
    }
  }, [isDragging, isResizing, onUpdate, onDragMove, scale]);

  const handlePointerUp = useCallback((e: PointerEvent<HTMLDivElement>) => {
    const wasDragging = isDragging;
    e.currentTarget.releasePointerCapture(e.pointerId);
    setIsDragging(false);
    setIsResizing(false);
    setResizeHandle(null);
    dragStartRef.current = null;

    // Notify parent when drag ends (for materialization)
    if (wasDragging && onDragEnd) {
      onDragEnd();
    }
  }, [isDragging, onDragEnd]);

  // Resize handle pointer handlers
  const handleResizePointerDown = useCallback((e: PointerEvent<HTMLDivElement>, handle: ResizeHandle) => {
    if (!isInteractive) return;

    e.stopPropagation();
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    setIsResizing(true);
    setResizeHandle(handle);
    dragStartRef.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      ghostX: ghost.x,
      ghostY: ghost.y,
      ghostWidth: ghost.width,
      ghostHeight: ghost.height,
    };
  }, [isInteractive, ghost.x, ghost.y, ghost.width, ghost.height]);

  const handleResizePointerMove = useCallback((e: PointerEvent<HTMLDivElement>) => {
    if (!isResizing || !resizeHandle || !dragStartRef.current) return;

    const deltaX = (e.clientX - dragStartRef.current.mouseX) / scale;
    const deltaY = (e.clientY - dragStartRef.current.mouseY) / scale;

    let newX = dragStartRef.current.ghostX;
    let newY = dragStartRef.current.ghostY;
    let newWidth = dragStartRef.current.ghostWidth;
    let newHeight = dragStartRef.current.ghostHeight;

    switch (resizeHandle) {
      case "nw":
        newX = dragStartRef.current.ghostX + deltaX;
        newY = dragStartRef.current.ghostY + deltaY;
        newWidth = dragStartRef.current.ghostWidth - deltaX;
        newHeight = dragStartRef.current.ghostHeight - deltaY;
        break;
      case "n":
        newY = dragStartRef.current.ghostY + deltaY;
        newHeight = dragStartRef.current.ghostHeight - deltaY;
        break;
      case "ne":
        newY = dragStartRef.current.ghostY + deltaY;
        newWidth = dragStartRef.current.ghostWidth + deltaX;
        newHeight = dragStartRef.current.ghostHeight - deltaY;
        break;
      case "e":
        newWidth = dragStartRef.current.ghostWidth + deltaX;
        break;
      case "se":
        newWidth = dragStartRef.current.ghostWidth + deltaX;
        newHeight = dragStartRef.current.ghostHeight + deltaY;
        break;
      case "s":
        newHeight = dragStartRef.current.ghostHeight + deltaY;
        break;
      case "sw":
        newX = dragStartRef.current.ghostX + deltaX;
        newWidth = dragStartRef.current.ghostWidth - deltaX;
        newHeight = dragStartRef.current.ghostHeight + deltaY;
        break;
      case "w":
        newX = dragStartRef.current.ghostX + deltaX;
        newWidth = dragStartRef.current.ghostWidth - deltaX;
        break;
    }

    // Enforce minimum size
    if (newWidth < MIN_SIZE) {
      if (resizeHandle === "nw" || resizeHandle === "sw" || resizeHandle === "w") {
        newX = dragStartRef.current.ghostX + dragStartRef.current.ghostWidth - MIN_SIZE;
      }
      newWidth = MIN_SIZE;
    }
    if (newHeight < MIN_SIZE) {
      if (resizeHandle === "nw" || resizeHandle === "ne" || resizeHandle === "n") {
        newY = dragStartRef.current.ghostY + dragStartRef.current.ghostHeight - MIN_SIZE;
      }
      newHeight = MIN_SIZE;
    }

    onUpdate({ x: newX, y: newY, width: newWidth, height: newHeight });
  }, [isResizing, resizeHandle, onUpdate, scale]);

  const handleResizePointerUp = useCallback((e: PointerEvent<HTMLDivElement>) => {
    e.currentTarget.releasePointerCapture(e.pointerId);
    setIsResizing(false);
    setResizeHandle(null);
    dragStartRef.current = null;
  }, []);

  // Resize handle configuration - corners and edges
  const resizeHandles: { id: ResizeHandle; cursor: string; style: React.CSSProperties; isEdge?: boolean }[] = [
    // Corners
    { id: "nw", cursor: "nwse-resize", style: { top: -4, left: -4, width: 8, height: 8 } },
    { id: "ne", cursor: "nesw-resize", style: { top: -4, right: -4, width: 8, height: 8 } },
    { id: "sw", cursor: "nesw-resize", style: { bottom: -4, left: -4, width: 8, height: 8 } },
    { id: "se", cursor: "nwse-resize", style: { bottom: -4, right: -4, width: 8, height: 8 } },
    // Edges
    { id: "n", cursor: "ns-resize", style: { top: -3, left: "50%", marginLeft: -12, width: 24, height: 6 }, isEdge: true },
    { id: "s", cursor: "ns-resize", style: { bottom: -3, left: "50%", marginLeft: -12, width: 24, height: 6 }, isEdge: true },
    { id: "e", cursor: "ew-resize", style: { right: -3, top: "50%", marginTop: -12, width: 6, height: 24 }, isEdge: true },
    { id: "w", cursor: "ew-resize", style: { left: -3, top: "50%", marginTop: -12, width: 6, height: 24 }, isEdge: true },
  ];

  return (
    <div
      className={`absolute ${isInteractive ? "pointer-events-auto" : "pointer-events-none"}`}
      style={{
        left: ghost.x,
        top: ghost.y,
        width: ghost.width,
        height: ghost.height,
      }}
      onClick={handleClick}
      // For non-groups, the whole container is draggable
      // For groups, only the header is draggable
      onPointerDown={!isGroup ? handlePointerDown : undefined}
      onPointerMove={!isGroup ? handlePointerMove : undefined}
      onPointerUp={!isGroup ? handlePointerUp : undefined}
    >
      {/* Frame/Group label (above) - for groups this is the drag handle */}
      <div
        className={`absolute -top-6 left-0 text-sm font-medium whitespace-nowrap ${
          isGroup
            ? `px-2 py-0.5 bg-white/90 border border-blue-300 rounded text-blue-600 ${
                isInteractive ? "hover:bg-blue-50" : ""
              } ${isInteractive && isSelected ? "cursor-grab" : isInteractive ? "cursor-pointer" : ""} ${
                isDragging ? "!cursor-grabbing" : ""
              }`
            : "text-blue-600"
        }`}
        style={{ pointerEvents: isGroup && isInteractive ? "auto" : "none" }}
        onClick={isGroup ? handleClick : undefined}
        onPointerDown={isGroup ? handlePointerDown : undefined}
        onPointerMove={isGroup ? handlePointerMove : undefined}
        onPointerUp={isGroup ? handlePointerUp : undefined}
      >
        {ghost.name || (isGroup ? "Group" : "Frame")}
      </div>

      {/* Frame body */}
      <div
        className="w-full h-full"
        style={{
          // For groups, body is not draggable (children are clickable inside)
          cursor: isGroup
            ? isInteractive ? "default" : "default"
            : isInteractive && isSelected ? "move" : isInteractive ? "pointer" : "default",
          // Apply node styles
          backgroundColor: nodeStyle?.backgroundColor
            ? COLOR_MAP[nodeStyle.backgroundColor] || nodeStyle.backgroundColor
            : "#ffffff",
          borderWidth: isSelected
            ? 2
            : nodeStyle?.borderWidth || 1,
          borderStyle: isSelected && !isPrimary ? "dashed" : "solid",
          borderColor: isSelected
            ? "#3b82f6"
            : nodeStyle?.borderColor
              ? COLOR_MAP[nodeStyle.borderColor] || nodeStyle.borderColor
              : "#60a5fa",
          borderRadius: nodeStyle?.borderRadius || 2,
          // Note: Padding is handled via coordinate system in getWorldPosition
          // Children are offset inward by the padding amount
        }}
      />

      {/* Resize handles (only when selected) */}
      {isSelected && isInteractive && (
        <>
          {resizeHandles.map((handle) => (
            <div
              key={handle.id}
              className={`absolute bg-white border border-blue-500 ${
                handle.isEdge ? "rounded-full" : "rounded-sm"
              }`}
              style={{
                ...handle.style,
                cursor: handle.cursor,
                touchAction: "none",
              }}
              onPointerDown={(e) => handleResizePointerDown(e, handle.id)}
              onPointerMove={handleResizePointerMove}
              onPointerUp={handleResizePointerUp}
            />
          ))}

          {/* Dimensions badge (below, only when selected) */}
          <div
            className="absolute -bottom-6 left-1/2 -translate-x-1/2 px-2 py-0.5 bg-blue-500 text-white text-xs font-mono rounded whitespace-nowrap"
            style={{ pointerEvents: "none" }}
          >
            {Math.round(ghost.width)} x {Math.round(ghost.height)}
          </div>
        </>
      )}
    </div>
  );
}
