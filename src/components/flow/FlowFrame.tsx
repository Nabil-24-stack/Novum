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
  onPreviewModeChange?: (frameId: string, mode: PreviewMode) => void;
  onInspectionModeChange?: (enabled: boolean) => void;
  /** Whether flow mode is active (navigation interception) */
  flowModeActive?: boolean;
  /** Whether this frame is rendered visually (iframes stay mounted even when hidden) */
  isVisible?: boolean;
  /** CSS transition overrides during mode animation */
  transitionStyle?: React.CSSProperties;
  /** Page ID of the currently selected element (for auto-opening layers) */
  selectedPageId?: string;
  /** Selector of the currently selected element */
  selectedSelector?: string;
  /** Whether to play dissolve-in animation on first appearance */
  animateEntrance?: boolean;
  /** Whether this frame is expanded (fullscreen-like) */
  isExpanded?: boolean;
  /** Toggle expand/collapse */
  onExpandToggle?: () => void;
  /** Force streaming overlay to show (active frame in Prototype View) */
  forceStreamingOverlay?: boolean;
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
  transitionStyle,
  selectedPageId,
  selectedSelector,
  animateEntrance = false,
  isExpanded,
  onExpandToggle,
  forceStreamingOverlay,
}: FlowFrameProps) {
  const frameRef = useRef<HTMLDivElement>(null);

  // Local preview mode state (independent per-frame)
  const [localPreviewMode, setLocalPreviewMode] = useState<PreviewMode>(previewMode);

  // Layers panel state (local to each frame)
  const [layersOpen, setLayersOpen] = useState(false);

  // Refresh key for forcing SandpackWrapper remount
  const [refreshKey, setRefreshKey] = useState(0);

  // Auto-refresh after AI finishes building this page
  const pendingApprovalPage = useStrategyStore((s) => s.pendingApprovalPage);
  const lastRefreshedPageRef = useRef<string | null>(null);

  useEffect(() => {
    if (pendingApprovalPage === page.id && lastRefreshedPageRef.current !== page.id) {
      const timer = setTimeout(() => {
        lastRefreshedPageRef.current = page.id;
        setRefreshKey((k) => k + 1);
      }, 500);
      return () => clearTimeout(timer);
    }
    if (pendingApprovalPage !== page.id) {
      lastRefreshedPageRef.current = null;
    }
  }, [pendingApprovalPage, page.id]);

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
        visibility: isVisible || transitionStyle ? "visible" : "hidden",
        pointerEvents: isVisible ? "auto" : "none",
        animation: animateEntrance && isVisible ? 'dissolveIn 700ms ease-out both' : undefined,
        willChange: transitionStyle ? "transform, opacity" : undefined,
        ...transitionStyle, // Must remain LAST to override opacity, pointerEvents
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
          pageId={page.id}
          previewMode={localPreviewMode}
          onPreviewModeChange={handleLocalPreviewModeChange}
          inspectionMode={isActive && inspectionMode}
          onInspectionModeChange={onInspectionModeChange}
          layersOpen={isActive && layersOpen}
          onLayersOpenChange={setLayersOpen}
          selectedSelector={selectedPageId === page.id ? selectedSelector : undefined}
          onRefresh={() => setRefreshKey((k) => k + 1)}
          pageInfo={{ name: page.name, route: page.route }}
          onExternalDragMove={handleHeaderDragMove}
          onExternalDragStart={handleHeaderDragStart}
          isExpanded={isExpanded}
          onExpandToggle={onExpandToggle}
          forceStreamingOverlay={forceStreamingOverlay}
        />
      </SandpackWrapper>
    </div>
  );
}
