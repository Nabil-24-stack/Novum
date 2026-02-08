"use client";

import { useRef, useState, useCallback, useMemo, PointerEvent } from "react";
import { Component } from "lucide-react";
import type { GhostElement, CanvasTool } from "@/lib/canvas/types";
import { KNOWN_COMPONENTS } from "@/lib/canvas/component-registry";

interface GhostComponentProps {
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
  files: Record<string, string>;
  /** Whether this component is inside a group (hides label) */
  hasParent?: boolean;
}

type ResizeHandle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";

const MIN_SIZE = 50;

/**
 * Extract CSS custom properties from VFS globals.css
 * Returns an object that can be spread as inline styles
 */
function extractCssVariables(globalsCss: string): React.CSSProperties {
  const cssVars: Record<string, string> = {};

  // Match CSS variable declarations in :root block
  const rootMatch = globalsCss.match(/:root\s*\{([\s\S]*?)\}/);
  if (rootMatch) {
    const rootContent = rootMatch[1];
    const varRegex = /(--[\w-]+):\s*([^;]+);/g;
    let match;
    while ((match = varRegex.exec(rootContent)) !== null) {
      const [, varName, varValue] = match;
      cssVars[varName] = varValue.trim();
    }
  }

  return cssVars as unknown as React.CSSProperties;
}

/**
 * Generic placeholder preview for unknown components.
 */
function GenericComponentPreview({ name }: { name: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 p-4 rounded-lg border border-dashed border-neutral-300 bg-neutral-50/50 w-full h-full min-h-[60px]">
      <Component className="w-5 h-5 text-neutral-400" />
      <span className="text-sm text-neutral-500">{name}</span>
    </div>
  );
}

export function GhostComponent({
  ghost,
  isSelected,
  isPrimary = true,
  onSelect,
  onUpdate,
  // onRemove is passed by parent but not used yet (future: right-click menu)
  onDragEnd,
  onDragMove,
  scale = 1,
  activeTool,
  files,
  hasParent = false,
}: GhostComponentProps) {
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

  // Extract design system CSS variables for styling previews
  const designSystemStyles = useMemo(() => {
    const globalsCss = files["/globals.css"] || "";
    return extractCssVariables(globalsCss);
  }, [files]);

  // Get the component preview from the registry
  const componentPreview = useMemo(() => {
    const componentType = ghost.componentType || "";
    // Convert display name back to key format (e.g., "Date Picker" -> "date-picker")
    const key = componentType.toLowerCase().replace(/\s+/g, "-");
    const knownConfig = KNOWN_COMPONENTS[key];

    if (knownConfig) {
      return knownConfig.preview;
    }

    // Return generic placeholder for unknown components
    return <GenericComponentPreview name={componentType || "Component"} />;
  }, [ghost.componentType]);

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
      className="absolute"
      style={{
        left: ghost.x,
        top: ghost.y,
        width: ghost.width,
        height: ghost.height,
      }}
    >
      {/* Component label (above) - hidden when inside a group */}
      {!hasParent && (
        <div
          className={`absolute -top-6 left-0 px-2 py-0.5 text-sm font-medium text-blue-600
            bg-white/90 border border-blue-300 rounded whitespace-nowrap
            ${isInteractive ? "hover:bg-blue-50" : ""}
            ${isInteractive && isSelected ? "cursor-grab" : isInteractive ? "cursor-pointer" : ""}
            ${isDragging ? "!cursor-grabbing" : ""}`}
          style={{ pointerEvents: isInteractive ? "auto" : "none" }}
          onClick={handleClick}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
        >
          {ghost.componentType || "Component"}
        </div>
      )}

      {/* Component body - renders actual component preview with design system styling */}
      <div
        className="w-full h-full flex items-center justify-center"
        style={{
          ...designSystemStyles,
          pointerEvents: isInteractive ? "auto" : "none",
          cursor: hasParent && isInteractive ? "pointer" : undefined,
        }}
        onClick={hasParent ? handleClick : undefined}
      >
        {/* Selection border - rendered separately so it doesn't clip component */}
        <div
          className={`absolute inset-0 pointer-events-none rounded-sm ${
            isSelected
              ? isPrimary
                ? "border-2 border-blue-500"
                : "border-2 border-dashed border-blue-500"
              : ""
          }`}
          style={{ margin: -1 }}
        />
        {/* Component preview - no container, fills space */}
        <div className="w-full h-full flex items-center justify-center [&>*]:w-full [&>*]:max-w-full">
          {componentPreview}
        </div>
      </div>

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
                pointerEvents: "auto",
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
