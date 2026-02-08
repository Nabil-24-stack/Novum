"use client";

import { useRef, useState, useCallback, useEffect, PointerEvent } from "react";
import type { GhostElement, CanvasTool, LayoutConfig, CanvasNode } from "@/lib/canvas/types";

interface GhostTextProps {
  ghost: GhostElement;
  isSelected: boolean;
  isPrimary?: boolean;
  onSelect: (e?: React.MouseEvent | React.PointerEvent) => void;
  onUpdate: (updates: Partial<CanvasNode>) => void;
  onRemove: () => void;
  onDragEnd?: () => void;
  onDragMove?: (ghost: GhostElement) => void;
  scale?: number;
  activeTool: CanvasTool;
  hasParent?: boolean;
  layout?: LayoutConfig;
  /** Callback to change the active tool (e.g., switch to cursor when done editing) */
  onToolChange?: (tool: CanvasTool) => void;
  /** Parent's inner width (for Fill mode) - accounts for parent padding */
  parentWidth?: number;
  /** Parent's inner height (for Fill mode) - accounts for parent padding */
  parentHeight?: number;
}

type ResizeHandle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";

const MIN_SIZE = 30;

export function GhostText({
  ghost,
  isSelected,
  isPrimary = true,
  onSelect,
  onUpdate,
  onRemove,
  onDragEnd,
  onDragMove,
  scale = 1,
  activeTool,
  hasParent: _hasParent = false,
  layout,
  onToolChange,
  parentWidth,
  parentHeight,
}: GhostTextProps) {
  void _hasParent;
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [resizeHandle, setResizeHandle] = useState<ResizeHandle | null>(null);
  const [isEditing, setIsEditing] = useState(true);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const dragStartRef = useRef<{
    mouseX: number;
    mouseY: number;
    ghostX: number;
    ghostY: number;
    ghostWidth: number;
    ghostHeight: number;
  } | null>(null);

  const ghostRef = useRef(ghost);
  // eslint-disable-next-line react-hooks/refs
  ghostRef.current = ghost;

  // Track if we should sync size (avoid syncing during resize drag)
  const skipSyncRef = useRef(false);

  const isInteractive = activeTool === "cursor" || isEditing;

  // Sizing modes
  const widthMode = layout?.widthMode || "fixed";
  const heightMode = layout?.heightMode || "fixed";

  // Stable parent dimensions (use -1 as sentinel for "no parent")
  const stableParentWidth = parentWidth ?? -1;
  const stableParentHeight = parentHeight ?? -1;

  // -------------------------------------------------------------------------
  // CSS-driven sizing: Let browser handle layout, sync passively
  // -------------------------------------------------------------------------
  const getContainerStyles = useCallback((): React.CSSProperties => {
    const styles: React.CSSProperties = {
      position: "absolute",
      left: ghost.x,
      top: ghost.y,
    };

    // Width
    if (widthMode === "hug") {
      styles.width = "max-content";
      styles.minWidth = MIN_SIZE;
    } else if (widthMode === "fill" && stableParentWidth > 0) {
      // Fill mode: use parent's inner width (already accounts for padding)
      styles.width = stableParentWidth;
    } else {
      // Fixed mode or fill without parent
      styles.width = ghost.width;
    }

    // Height
    if (heightMode === "hug") {
      styles.height = "auto";
      styles.minHeight = MIN_SIZE;
    } else if (heightMode === "fill" && stableParentHeight > 0) {
      // Fill mode: use parent's inner height (already accounts for padding)
      styles.height = stableParentHeight;
    } else {
      // Fixed mode or fill without parent
      styles.height = ghost.height;
    }

    return styles;
  }, [ghost.x, ghost.y, ghost.width, ghost.height, widthMode, heightMode, stableParentWidth, stableParentHeight]);

  // -------------------------------------------------------------------------
  // ResizeObserver: Passively sync rendered size to store
  // -------------------------------------------------------------------------
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Observe when CSS is driving the size (hug or fill mode)
    const needsWidthSync = widthMode === "hug" || (widthMode === "fill" && stableParentWidth > 0);
    const needsHeightSync = heightMode === "hug" || (heightMode === "fill" && stableParentHeight > 0);

    if (!needsWidthSync && !needsHeightSync) return;

    const observer = new ResizeObserver((entries) => {
      if (skipSyncRef.current) return;

      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        const updates: Partial<GhostElement> = {};

        // Sync width if in hug/fill mode and size changed significantly
        if (needsWidthSync && Math.abs(width - ghost.width) > 1) {
          updates.width = Math.max(MIN_SIZE, width);
        }

        // Sync height if in hug/fill mode and size changed significantly
        if (needsHeightSync && Math.abs(height - ghost.height) > 1) {
          updates.height = Math.max(MIN_SIZE, height);
        }

        if (Object.keys(updates).length > 0) {
          onUpdate(updates);
        }
      }
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, [widthMode, heightMode, ghost.width, ghost.height, onUpdate, stableParentWidth, stableParentHeight]);

  // -------------------------------------------------------------------------
  // Auto-focus textarea on mount and when entering edit mode
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (textareaRef.current && isEditing) {
      textareaRef.current.focus();
      // Move cursor to end
      textareaRef.current.selectionStart = textareaRef.current.value.length;
    }
  }, [isEditing]);

  // -------------------------------------------------------------------------
  // Auto-resize textarea height as user types
  // -------------------------------------------------------------------------
  const adjustTextareaHeight = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    // Reset height to auto to get accurate scrollHeight
    textarea.style.height = "auto";
    textarea.style.height = `${textarea.scrollHeight}px`;
  }, []);

  useEffect(() => {
    if (isEditing) {
      adjustTextareaHeight();
    }
  }, [isEditing, ghost.content, adjustTextareaHeight]);

  // -------------------------------------------------------------------------
  // Interaction handlers
  // -------------------------------------------------------------------------
  const handleClick = useCallback((e: React.MouseEvent) => {
    if (!isInteractive || isEditing) return;
    e.stopPropagation();
    onSelect(e);
  }, [isInteractive, isEditing, onSelect]);

  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    if (activeTool !== "cursor") return;
    e.stopPropagation();
    setIsEditing(true);
  }, [activeTool]);

  const handlePointerDown = useCallback((e: PointerEvent<HTMLDivElement>) => {
    if (!isInteractive || !isSelected || isEditing) return;

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
  }, [isInteractive, isSelected, isEditing, ghost.x, ghost.y, ghost.width, ghost.height]);

  const handlePointerMove = useCallback((e: PointerEvent<HTMLDivElement>) => {
    if (!dragStartRef.current) return;

    const deltaX = (e.clientX - dragStartRef.current.mouseX) / scale;
    const deltaY = (e.clientY - dragStartRef.current.mouseY) / scale;

    if (isDragging && !isResizing) {
      const newX = dragStartRef.current.ghostX + deltaX;
      const newY = dragStartRef.current.ghostY + deltaY;
      onUpdate({ x: newX, y: newY });
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
    skipSyncRef.current = false;

    if (wasDragging && onDragEnd) {
      onDragEnd();
    }
  }, [isDragging, onDragEnd]);

  // -------------------------------------------------------------------------
  // Resize handlers - switches to Fixed mode on manual resize
  // -------------------------------------------------------------------------
  const handleResizePointerDown = useCallback((e: PointerEvent<HTMLDivElement>, handle: ResizeHandle) => {
    if (!isInteractive || isEditing) return;

    e.stopPropagation();
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    setIsResizing(true);
    setResizeHandle(handle);
    skipSyncRef.current = true; // Prevent ResizeObserver from interfering

    dragStartRef.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      ghostX: ghost.x,
      ghostY: ghost.y,
      ghostWidth: ghost.width,
      ghostHeight: ghost.height,
    };

    // Determine which dimensions are being resized and switch to Fixed mode
    const resizesWidth = ["nw", "ne", "sw", "se", "e", "w"].includes(handle);
    const resizesHeight = ["nw", "ne", "sw", "se", "n", "s"].includes(handle);

    const layoutUpdates: Partial<LayoutConfig> = {};
    if (resizesWidth && widthMode !== "fixed") {
      layoutUpdates.widthMode = "fixed";
    }
    if (resizesHeight && heightMode !== "fixed") {
      layoutUpdates.heightMode = "fixed";
    }

    // Update layout if any dimension changed to fixed
    if (Object.keys(layoutUpdates).length > 0) {
      // Ensure we have valid defaults for required LayoutConfig fields
      const baseLayout: LayoutConfig = layout ?? { direction: "row", gap: 0 };
      onUpdate({
        layout: { ...baseLayout, ...layoutUpdates },
      });
    }
  }, [isInteractive, isEditing, ghost.x, ghost.y, ghost.width, ghost.height, widthMode, heightMode, layout, onUpdate]);

  const handleResizePointerMove = useCallback((e: PointerEvent<HTMLDivElement>) => {
    if (!isResizing || !resizeHandle || !dragStartRef.current) return;

    const deltaX = (e.clientX - dragStartRef.current.mouseX) / scale;
    const deltaY = (e.clientY - dragStartRef.current.mouseY) / scale;

    let newX = dragStartRef.current.ghostX;
    let newY = dragStartRef.current.ghostY;
    let newWidth = dragStartRef.current.ghostWidth;
    let newHeight = dragStartRef.current.ghostHeight;

    // Determine which dimensions are being resized
    const resizesWidth = ["nw", "ne", "sw", "se", "e", "w"].includes(resizeHandle);
    const resizesHeight = ["nw", "ne", "sw", "se", "n", "s"].includes(resizeHandle);

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

    // Build update with layout mode switch to "fixed" for resized dimensions
    const updates: Partial<CanvasNode> = {
      x: newX,
      y: newY,
      width: newWidth,
      height: newHeight,
    };

    // Note: We'd need to notify parent to switch to fixed mode
    // For now, just update dimensions - the store will handle mode
    if (resizesWidth && widthMode !== "fixed") {
      // Signal that width should become fixed (parent handles via layout update)
    }
    if (resizesHeight && heightMode !== "fixed") {
      // Signal that height should become fixed
    }

    onUpdate(updates);
  }, [isResizing, resizeHandle, onUpdate, scale, widthMode, heightMode]);

  const handleResizePointerUp = useCallback((e: PointerEvent<HTMLDivElement>) => {
    e.currentTarget.releasePointerCapture(e.pointerId);
    setIsResizing(false);
    setResizeHandle(null);
    dragStartRef.current = null;
    skipSyncRef.current = false;
  }, []);

  // -------------------------------------------------------------------------
  // Input handlers
  // -------------------------------------------------------------------------
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onUpdate({ content: e.target.value });
    adjustTextareaHeight();
  }, [onUpdate, adjustTextareaHeight]);

  const handleInputBlur = useCallback(() => {
    setIsEditing(false);
    // Switch back to cursor tool when done editing
    onToolChange?.("cursor");
    if (!ghost.content?.trim()) {
      onRemove();
    }
  }, [ghost.content, onRemove, onToolChange]);

  const handleInputKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      setIsEditing(false);
      onToolChange?.("cursor");
      if (!ghost.content?.trim()) {
        onRemove();
      }
    } else if (e.key === "Escape") {
      onToolChange?.("cursor");
      onRemove();
    }
  }, [ghost.content, onRemove, onToolChange]);

  // Resize handle configuration
  const resizeHandles: { id: ResizeHandle; cursor: string; style: React.CSSProperties; isEdge?: boolean }[] = [
    { id: "nw", cursor: "nwse-resize", style: { top: -4, left: -4, width: 8, height: 8 } },
    { id: "ne", cursor: "nesw-resize", style: { top: -4, right: -4, width: 8, height: 8 } },
    { id: "sw", cursor: "nesw-resize", style: { bottom: -4, left: -4, width: 8, height: 8 } },
    { id: "se", cursor: "nwse-resize", style: { bottom: -4, right: -4, width: 8, height: 8 } },
    { id: "n", cursor: "ns-resize", style: { top: -3, left: "50%", marginLeft: -12, width: 24, height: 6 }, isEdge: true },
    { id: "s", cursor: "ns-resize", style: { bottom: -3, left: "50%", marginLeft: -12, width: 24, height: 6 }, isEdge: true },
    { id: "e", cursor: "ew-resize", style: { right: -3, top: "50%", marginTop: -12, width: 6, height: 24 }, isEdge: true },
    { id: "w", cursor: "ew-resize", style: { left: -3, top: "50%", marginTop: -12, width: 6, height: 24 }, isEdge: true },
  ];

  return (
    <div
      ref={containerRef}
      className={`${isInteractive ? "pointer-events-auto" : "pointer-events-none"}`}
      style={getContainerStyles()}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      {/* Text body */}
      <div
        className={`w-full h-full px-2 py-1 rounded-sm ${
          isEditing
            ? "border-2 border-blue-500 bg-white"
            : isSelected
            ? isPrimary
              ? "border-2 border-blue-500 bg-white/80"
              : "border-2 border-dashed border-blue-500 bg-white/80"
            : "border border-transparent hover:border-blue-300 bg-transparent"
        }`}
        style={{
          cursor: isEditing ? "text" : isInteractive && isSelected ? "move" : isInteractive ? "pointer" : "default",
        }}
      >
        {isEditing ? (
          <textarea
            ref={textareaRef}
            value={ghost.content || ""}
            onChange={handleInputChange}
            onBlur={handleInputBlur}
            onKeyDown={handleInputKeyDown}
            rows={1}
            className="bg-transparent border-none outline-none text-base text-neutral-800 w-full resize-none overflow-hidden"
            style={{ minHeight: "1.5em" }}
            placeholder="Enter text..."
          />
        ) : (
          <span
            className="text-base text-neutral-800 whitespace-pre-wrap break-words"
            style={{ display: "block" }}
          >
            {ghost.content || "Text"}
          </span>
        )}
      </div>

      {/* Resize handles (only when selected and not editing) */}
      {isSelected && !isEditing && isInteractive && (
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

          {/* Dimensions badge */}
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
