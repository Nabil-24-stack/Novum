"use client";

import { useRef, useCallback, useEffect, PointerEvent, useState } from "react";
import { SandpackWrapper } from "@/components/providers/SandpackWrapper";
import { Frame, type FrameState } from "@/components/canvas/Frame";
import { DEFAULT_FRAME_WIDTH, DEFAULT_FRAME_HEIGHT } from "@/lib/constants";
import { ViewModeToggle, type CanvasMode } from "./ViewModeToggle";
import type { FlowPage, FlowNodePosition } from "@/lib/flow/types";
import type { PreviewMode } from "@/lib/tokens";

// Threshold to distinguish click from drag (in pixels)
const DRAG_THRESHOLD = 5;

// Re-export for backwards compatibility
export const DEFAULT_FLOW_FRAME_WIDTH = DEFAULT_FRAME_WIDTH;
export const DEFAULT_FLOW_FRAME_HEIGHT = DEFAULT_FRAME_HEIGHT;

interface FlowFrameProps {
  page: FlowPage;
  position: FlowNodePosition;
  files: Record<string, string>;
  previewMode: PreviewMode;
  inspectionMode: boolean;
  isActive: boolean;
  onActivate: (frameId: string) => void;
  onDrag: (id: string, deltaX: number, deltaY: number) => void;
  onResize: (id: string, width: number, height: number) => void;
  canvasScale: number;
  onPreviewModeChange?: (frameId: string, mode: PreviewMode) => void;
  onInspectionModeChange?: (enabled: boolean) => void;
  onClick: (route: string) => void;
  /** Whether flow mode is active (navigation interception) */
  flowModeActive?: boolean;
  /** Canvas mode toggle (Prototype/Flow) */
  canvasMode?: CanvasMode;
  onCanvasModeChange?: (mode: CanvasMode) => void;
  /** Page ID of the currently selected element (for auto-opening layers) */
  selectedPageId?: string;
  /** Selector of the currently selected element */
  selectedSelector?: string;
}

export function FlowFrame({
  page,
  position,
  files,
  previewMode,
  inspectionMode,
  isActive,
  onActivate,
  onDrag,
  onResize,
  canvasScale,
  onPreviewModeChange,
  onInspectionModeChange,
  onClick,
  flowModeActive = false,
  canvasMode,
  onCanvasModeChange,
  selectedPageId,
  selectedSelector,
}: FlowFrameProps) {
  const [isDragging, setIsDragging] = useState(false);
  const frameRef = useRef<HTMLDivElement>(null);
  const dragOverlayRef = useRef<HTMLDivElement>(null);
  const startPosRef = useRef({ x: 0, y: 0 });
  const totalDistanceRef = useRef(0);

  // Local preview mode state (independent per-frame)
  const [localPreviewMode, setLocalPreviewMode] = useState<PreviewMode>(previewMode);

  // Layers panel state (local to each frame)
  const [layersOpen, setLayersOpen] = useState(false);

  // Refresh key for forcing SandpackWrapper remount
  const [refreshKey, setRefreshKey] = useState(0);

  // Auto-open layers panel when this frame's page is selected
  useEffect(() => {
    if (selectedPageId === page.id) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Deriving state from props
      setLayersOpen(true);
    }
  }, [selectedPageId, page.id]);

  // Handle local preview mode change
  const handleLocalPreviewModeChange = useCallback((mode: PreviewMode) => {
    setLocalPreviewMode(mode);
    onPreviewModeChange?.(page.id, mode);
  }, [page.id, onPreviewModeChange]);

  // Handle frame state changes (resize only - position managed externally)
  const handleFrameChange = useCallback((state: FrameState) => {
    // Only propagate width/height changes (position is managed by drag)
    if (state.width !== position.width || state.height !== position.height) {
      onResize(page.id, state.width, state.height);
    }
  }, [page.id, position.width, position.height, onResize]);

  // --- Drag Handlers (for repositioning frame on canvas) ---
  const handlePointerDown = useCallback((e: PointerEvent<HTMLDivElement>) => {
    // Activate this frame
    onActivate(page.id);

    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);

    setIsDragging(true);
    startPosRef.current = { x: e.clientX, y: e.clientY };
    totalDistanceRef.current = 0;
  }, [page.id, onActivate]);

  const handlePointerMove = useCallback((e: PointerEvent<HTMLDivElement>) => {
    if (!isDragging) return;

    // Calculate delta (accounting for canvas zoom)
    const deltaX = (e.clientX - startPosRef.current.x) / canvasScale;
    const deltaY = (e.clientY - startPosRef.current.y) / canvasScale;

    // Track total distance for click vs drag detection
    totalDistanceRef.current += Math.sqrt(
      Math.pow(e.clientX - startPosRef.current.x, 2) +
      Math.pow(e.clientY - startPosRef.current.y, 2)
    );

    // Update start position for next frame
    startPosRef.current = { x: e.clientX, y: e.clientY };

    // Notify parent of drag
    onDrag(page.id, deltaX, deltaY);
  }, [isDragging, page.id, onDrag, canvasScale]);

  const handlePointerUp = useCallback((e: PointerEvent<HTMLDivElement>) => {
    e.currentTarget.releasePointerCapture(e.pointerId);

    const wasDragging = isDragging;
    setIsDragging(false);

    // If moved less than threshold, treat as click (navigate)
    if (wasDragging && totalDistanceRef.current < DRAG_THRESHOLD) {
      onClick(page.route);
    }

    totalDistanceRef.current = 0;
  }, [isDragging, page.route, onClick]);

  // Handle click on frame content (activate without navigation)
  const handleFrameClick = useCallback(() => {
    onActivate(page.id);
  }, [page.id, onActivate]);

  return (
    <div
      ref={frameRef}
      data-flow-page-id={page.id}
      className={`absolute select-none ${
        isActive ? "ring-2 ring-blue-500 ring-offset-2 z-10" : ""
      }`}
      style={{
        left: position.x,
        top: position.y,
        width: position.width,
        height: position.height + 36 + 28, // +36 for Frame header, +28 for title bar
      }}
      onClick={handleFrameClick}
    >
      {/* Title bar (page name + route) */}
      <div
        ref={dragOverlayRef}
        className="absolute -top-7 left-0 right-0 flex items-center justify-between px-2 cursor-grab active:cursor-grabbing z-20"
        style={{ touchAction: "none" }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <span className="text-base font-medium text-neutral-700 bg-white/80 backdrop-blur-sm px-2 py-0.5 rounded shadow-sm">
          {page.name}
        </span>
        <span className="text-sm text-neutral-400 font-mono bg-white/60 px-1.5 py-0.5 rounded">
          {page.route}
        </span>
      </div>

      {/* View Mode Toggle - attached to left side of frame */}
      {canvasMode && onCanvasModeChange && (
        <div className="absolute top-3 -left-12 z-10">
          <ViewModeToggle
            mode={canvasMode}
            onModeChange={onCanvasModeChange}
          />
        </div>
      )}

      {/* Frame content - always mounted to avoid reload delays */}
      <SandpackWrapper
        files={files}
        previewMode={localPreviewMode}
        inspectionMode={isActive && inspectionMode}
        flowModeActive={flowModeActive}
        key={`flow-frame-${page.id}-${localPreviewMode}-${refreshKey}`}
      >
        <Frame
          x={0}
          y={0}
          width={position.width}
          height={position.height}
          onFrameChange={handleFrameChange}
          startRoute={page.route}
          previewMode={localPreviewMode}
          onPreviewModeChange={handleLocalPreviewModeChange}
          inspectionMode={isActive && inspectionMode}
          onInspectionModeChange={onInspectionModeChange}
          layersOpen={isActive && layersOpen}
          onLayersOpenChange={setLayersOpen}
          selectedSelector={selectedPageId === page.id ? selectedSelector : undefined}
          onRefresh={() => setRefreshKey((k) => k + 1)}
        />
      </SandpackWrapper>
    </div>
  );
}
