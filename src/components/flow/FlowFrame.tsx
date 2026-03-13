"use client";

import React, { useRef, useCallback, useEffect, useState } from "react";
import { SandpackWrapper } from "@/components/providers/SandpackWrapper";
import { Frame, type FrameState } from "@/components/canvas/Frame";
import { DEFAULT_FRAME_WIDTH, DEFAULT_FRAME_HEIGHT } from "@/lib/constants";
import type { FlowPage, FlowNodePosition } from "@/lib/flow/types";
import type { PreviewMode } from "@/lib/tokens";
import { useStrategyStore } from "@/hooks/useStrategyStore";

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
  onPreviewModeChange?: (mode: PreviewMode) => void;
  onInspectionModeChange?: (enabled: boolean) => void;
  /** Whether flow mode is active (navigation interception) */
  flowModeActive?: boolean;
  /** Whether this frame is rendered visually (iframes stay mounted even when hidden) */
  isVisible?: boolean;
  /** Page ID of the currently selected element (for auto-opening layers) */
  selectedPageId?: string;
  /** Selector of the currently selected element */
  selectedSelector?: string;
  /** Whether to play dissolve-in animation on first appearance */
  animateEntrance?: boolean;
  /** Whether this frame is expanded (fullscreen-like) */
  isExpanded?: boolean;
  /** Force streaming overlay to show (active frame in Prototype View) */
  forceStreamingOverlay?: boolean;
  /** Signal to force iframe refresh (increment to trigger) */
  refreshSignal?: number;
  /** Whether strategy annotations are available for this frame */
  annotationsAvailable?: boolean;
  /** Whether annotations are currently shown */
  annotationsOpen?: boolean;
  /** Callback when annotation visibility changes */
  onAnnotationsOpenChange?: (open: boolean) => void;
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
  flowModeActive = false,
  isVisible = true,
  selectedPageId,
  selectedSelector,
  animateEntrance = false,
  isExpanded,
  forceStreamingOverlay,
  refreshSignal,
  annotationsAvailable,
  annotationsOpen,
  onAnnotationsOpenChange,
}: FlowFrameProps) {
  const frameRef = useRef<HTMLDivElement>(null);

  // Layers panel state (local to each frame)
  const [layersOpen, setLayersOpen] = useState(false);

  // Refresh key for forcing SandpackWrapper remount
  const [refreshKey, setRefreshKey] = useState(0);

  // External refresh signal (materialization only — verification no longer triggers remounts)
  const combinedSignal = refreshSignal ?? 0;

  const refreshSignalMountRef = useRef(true);
  useEffect(() => {
    if (refreshSignalMountRef.current) {
      refreshSignalMountRef.current = false;
      return;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- External signal triggers refresh
    setRefreshKey((k) => k + 1);
  }, [combinedSignal]);

  // Auto-refresh after AI finishes building this page
  const completedPages = useStrategyStore((s) => s.completedPages);
  const lastRefreshedPageRef = useRef<string | null>(null);

  useEffect(() => {
    if (completedPages.includes(page.id) && lastRefreshedPageRef.current !== page.id) {
      const timer = setTimeout(() => {
        lastRefreshedPageRef.current = page.id;
        setRefreshKey((k) => k + 1);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [completedPages, page.id]);

  // Auto-open layers panel when this frame's page is selected
  useEffect(() => {
    if (selectedPageId === page.id) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Deriving state from props
      setLayersOpen(true);
    }
  }, [selectedPageId, page.id]);

  // Handle frame state changes (resize only - position managed externally)
  const handleFrameChange = useCallback((state: FrameState) => {
    // Only propagate width/height changes (position is managed by drag)
    if (state.width !== position.width || state.height !== position.height) {
      onResize(page.id, state.width, state.height);
    }
  }, [page.id, position.width, position.height, onResize]);

  // --- External drag handlers (delegated to Frame header) ---
  const handleHeaderDragMove = useCallback((deltaX: number, deltaY: number) => {
    onDrag(page.id, deltaX / canvasScale, deltaY / canvasScale);
  }, [page.id, onDrag, canvasScale]);

  const handleHeaderDragStart = useCallback(() => {
    onActivate(page.id);
  }, [page.id, onActivate]);

  // Handle click on frame content (activate without navigation)
  const handleFrameClick = useCallback(() => {
    onActivate(page.id);
  }, [page.id, onActivate]);

  // Wrap inspection mode change to also activate frame
  // (the button's stopPropagation prevents handleFrameClick from firing)
  const handleInspectionModeChange = useCallback((enabled: boolean) => {
    onActivate(page.id);
    onInspectionModeChange?.(enabled);
  }, [page.id, onActivate, onInspectionModeChange]);

  return (
    <div
      ref={frameRef}
      data-flow-page-id={page.id}
      className={`absolute select-none ${
        isActive ? "shadow-lg z-10" : ""
      }`}
      style={{
        left: position.x,
        top: position.y,
        width: position.width,
        height: position.height + 36, // +36 for Frame header
        opacity: isVisible ? 1 : 0,
        visibility: isVisible ? "visible" : "hidden",
        pointerEvents: isVisible ? "auto" : "none",
        animation: animateEntrance && isVisible ? 'dissolveIn 700ms ease-out both' : undefined,
      }}
      onClick={handleFrameClick}
    >
      {/* Dissolve-in animation keyframes */}
      {animateEntrance && (
        <style>{`
          @keyframes dissolveIn {
            from { opacity: 0; filter: blur(8px); transform: scale(0.97); }
            to { opacity: 1; filter: blur(0px); transform: scale(1); }
          }
        `}</style>
      )}

      {/* Frame content - always mounted to avoid reload delays */}
      <SandpackWrapper
        files={files}
        previewMode={previewMode}
        inspectionMode={isActive && inspectionMode}
        flowModeActive={flowModeActive}
        pageId={page.id}
        key={`flow-frame-${page.id}-${refreshKey}`}
      >
        <Frame
          x={0}
          y={0}
          width={position.width}
          height={position.height}
          onFrameChange={handleFrameChange}
          startRoute={page.route}
          pageId={page.id}
          previewMode={previewMode}
          onPreviewModeChange={onPreviewModeChange}
          inspectionMode={isActive && inspectionMode}
          onInspectionModeChange={handleInspectionModeChange}
          layersOpen={isActive && layersOpen}
          onLayersOpenChange={setLayersOpen}
          selectedSelector={selectedPageId === page.id ? selectedSelector : undefined}
          onRefresh={() => setRefreshKey((k) => k + 1)}
          pageInfo={{ name: page.name, route: page.route }}
          onExternalDragMove={handleHeaderDragMove}
          onExternalDragStart={handleHeaderDragStart}
          isExpanded={isExpanded}
          forceStreamingOverlay={forceStreamingOverlay}
          annotationsAvailable={annotationsAvailable}
          annotationsOpen={annotationsOpen}
          onAnnotationsOpenChange={onAnnotationsOpenChange}
        />
      </SandpackWrapper>
    </div>
  );
}
