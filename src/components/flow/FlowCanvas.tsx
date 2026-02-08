"use client";

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { InfiniteCanvas, type ViewportState } from "@/components/canvas/InfiniteCanvas";
import { CanvasOverlay, type FlowFrameDropState } from "@/components/canvas/CanvasOverlay";
import { FlowFrame } from "./FlowFrame";
import { FlowConnections } from "./FlowConnections";
import type { CanvasMode } from "./ViewModeToggle";
import { calculateFlowLayout } from "@/lib/flow/auto-layout";
import { useFlowNavigation } from "@/hooks/useFlowNavigation";
import { useCanvasStore } from "@/hooks/useCanvasStore";
import type { FlowManifest, FlowNodePosition } from "@/lib/flow/types";
import type { PreviewMode } from "@/lib/tokens";
import type { CanvasTool, DrawState, CanvasNode } from "@/lib/canvas/types";

interface FlowCanvasProps {
  manifest: FlowManifest;
  viewport: ViewportState;
  onViewportChange: React.Dispatch<React.SetStateAction<ViewportState>>;
  onPageSelect: (route: string) => void;
  selectedRoute?: string;
  files: Record<string, string>;
  previewMode?: PreviewMode;
  // Canvas mode toggle (Prototype/Flow)
  canvasMode?: CanvasMode;
  onCanvasModeChange?: (mode: CanvasMode) => void;
  // Inspection mode (global toggle)
  inspectionMode?: boolean;
  onInspectionModeChange?: (enabled: boolean) => void;
  // Drawing tools
  activeTool?: CanvasTool;
  onToolChange?: (tool: CanvasTool) => void;
  drawState?: DrawState;
  onStartDrawing?: (x: number, y: number) => void;
  onUpdateDrawing?: (x: number, y: number) => void;
  onStopDrawing?: () => void;
  onOpenComponentDialog?: () => void;
  // Clean (non-shadow) files for ghost component rendering
  cleanFiles?: Record<string, string>;
  // Materialization callback
  onMaterialize?: (node: CanvasNode, nodes: Map<string, CanvasNode>, iframeDropPoint: { x: number; y: number }, pageId?: string) => void;
  // Auto-open layers panel: page ID + selector of selected element
  selectedPageId?: string;
  selectedSelector?: string;
}

export function FlowCanvas({
  manifest,
  viewport,
  onViewportChange,
  onPageSelect,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  selectedRoute, // Kept for API compatibility, active frame determined by clicks now
  files,
  previewMode = "light",
  canvasMode,
  onCanvasModeChange,
  inspectionMode = false,
  onInspectionModeChange,
  activeTool,
  onToolChange,
  drawState,
  onStartDrawing,
  onUpdateDrawing,
  onStopDrawing,
  onOpenComponentDialog,
  cleanFiles,
  onMaterialize,
  selectedPageId,
  selectedSelector,
}: FlowCanvasProps) {
  // Container ref for measuring dimensions
  const containerRef = useRef<HTMLDivElement>(null);

  // Ref for InfiniteCanvas inner container (for coordinate conversion in CanvasOverlay)
  const canvasInnerRef = useRef<HTMLDivElement>(null);

  // Access canvas store for deselecting ghosts on empty canvas click
  const deselectAll = useCanvasStore((s) => s.deselectAll);

  // Store node positions in state (allows manual repositioning)
  const [nodePositions, setNodePositions] = useState<Map<string, FlowNodePosition>>(
    () => new Map()
  );

  // Track which frame is currently active (receives inspection events)
  const [activeFrameId, setActiveFrameId] = useState<string | null>(null);

  // Track per-frame preview modes (independent light/dark toggle)
  const [framePreviewModes, setFramePreviewModes] = useState<Map<string, PreviewMode>>(
    () => new Map()
  );

  // Track canvas dimensions for SVG
  const [canvasDimensions, setCanvasDimensions] = useState({ width: 800, height: 600 });

  // Track container dimensions for viewport centering
  const [containerDimensions, setContainerDimensions] = useState({ width: 800, height: 600 });

  // Update container dimensions on resize
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateDimensions = () => {
      setContainerDimensions({
        width: container.clientWidth,
        height: container.clientHeight,
      });
    };

    // Initial measurement
    updateDimensions();

    // Observe resize
    const resizeObserver = new ResizeObserver(updateDimensions);
    resizeObserver.observe(container);

    return () => resizeObserver.disconnect();
  }, []);

  // Use flow navigation hook for navigation interception
  useFlowNavigation({
    canvasMode: canvasMode ?? "prototype",
    manifest,
    nodePositions,
    viewport,
    onViewportChange,
    containerDimensions,
  });

  // Calculate initial layout when manifest changes
  useEffect(() => {
    const layout = calculateFlowLayout(manifest.pages, manifest.connections);

    // Create position map from layout
    const positionMap = new Map<string, FlowNodePosition>();
    for (const node of layout.nodes) {
      positionMap.set(node.id, node);
    }

    // eslint-disable-next-line react-hooks/set-state-in-effect -- Deriving state from props
    setNodePositions(positionMap);
     
    setCanvasDimensions({ width: layout.width, height: layout.height });
  }, [manifest]);

  // Handle node drag - update position in real-time
  const handleNodeDrag = useCallback((nodeId: string, deltaX: number, deltaY: number) => {
    setNodePositions((prev) => {
      const newMap = new Map(prev);
      const node = newMap.get(nodeId);

      if (node) {
        newMap.set(nodeId, {
          ...node,
          x: node.x + deltaX,
          y: node.y + deltaY,
        });

        // Update canvas dimensions if node moves outside bounds
        const newX = node.x + deltaX + node.width + 50;
        const newY = node.y + deltaY + node.height + 100;

        setCanvasDimensions((dims) => ({
          width: Math.max(dims.width, newX),
          height: Math.max(dims.height, newY),
        }));
      }

      return newMap;
    });
  }, []);

  // Handle node resize - update dimensions
  const handleNodeResize = useCallback((nodeId: string, width: number, height: number) => {
    setNodePositions((prev) => {
      const newMap = new Map(prev);
      const node = newMap.get(nodeId);

      if (node) {
        newMap.set(nodeId, {
          ...node,
          width,
          height,
        });

        // Update canvas dimensions if resize extends outside bounds
        const newX = node.x + width + 50;
        const newY = node.y + height + 100;

        setCanvasDimensions((dims) => ({
          width: Math.max(dims.width, newX),
          height: Math.max(dims.height, newY),
        }));
      }

      return newMap;
    });
  }, []);

  // Handle frame activation
  const handleFrameActivate = useCallback((frameId: string) => {
    setActiveFrameId(frameId);
  }, []);

  // Handle per-frame preview mode change
  const handleFramePreviewModeChange = useCallback((frameId: string, mode: PreviewMode) => {
    setFramePreviewModes((prev) => {
      const newMap = new Map(prev);
      newMap.set(frameId, mode);
      return newMap;
    });
  }, []);

  // Memoize the connections to avoid unnecessary re-renders
  const connections = useMemo(() => manifest.connections, [manifest.connections]);

  // Determine if flow mode is active
  const isFlowMode = canvasMode === "flow";

  // Compute flow frame states for multi-frame drop detection in CanvasOverlay
  const flowFrameStates: FlowFrameDropState[] = useMemo(() => {
    return manifest.pages
      .map((page) => {
        const pos = nodePositions.get(page.id);
        if (!pos) return null;
        return {
          pageId: page.id,
          route: page.route,
          x: pos.x,
          y: pos.y,
          width: pos.width,
          height: pos.height,
        };
      })
      .filter((s): s is FlowFrameDropState => s !== null);
  }, [manifest.pages, nodePositions]);

  // Default draw state for when no external draw state is provided
  const defaultDrawState: DrawState = useMemo(() => ({
    isDrawing: false,
    startX: 0,
    startY: 0,
    currentX: 0,
    currentY: 0,
  }), []);

  return (
    <div ref={containerRef} className="relative w-full h-full">
      <InfiniteCanvas
        ref={canvasInnerRef}
        viewport={viewport}
        onViewportChange={onViewportChange}
        activeTool={activeTool}
        onToolChange={onToolChange}
        isDrawingActive={drawState?.isDrawing}
        onCanvasClick={() => deselectAll()}
      >
        {/* Connection lines (rendered below nodes) */}
        <FlowConnections
          connections={connections}
          nodePositions={nodePositions}
          width={canvasDimensions.width}
          height={canvasDimensions.height}
        />

        {/* Full-featured FlowFrame nodes (draggable, resizable, with editing capabilities) */}
        {manifest.pages.map((page) => {
          const position = nodePositions.get(page.id);
          if (!position) return null;

          // Get per-frame preview mode, falling back to global
          const framePreviewMode = framePreviewModes.get(page.id) ?? previewMode;

          return (
            <FlowFrame
              key={page.id}
              page={page}
              position={position}
              files={files}
              previewMode={framePreviewMode}
              inspectionMode={inspectionMode}
              isActive={activeFrameId === page.id}
              onActivate={handleFrameActivate}
              onDrag={handleNodeDrag}
              onResize={handleNodeResize}
              canvasScale={viewport.scale}
              onPreviewModeChange={handleFramePreviewModeChange}
              onInspectionModeChange={onInspectionModeChange}
              onClick={onPageSelect}
              flowModeActive={isFlowMode}
              canvasMode={canvasMode}
              onCanvasModeChange={onCanvasModeChange}
              selectedPageId={selectedPageId}
              selectedSelector={selectedSelector}
            />
          );
        })}

        {/* Canvas Overlay - Drawing layer for ghost elements in Flow View */}
        <CanvasOverlay
          activeTool={activeTool ?? "cursor"}
          drawState={drawState ?? defaultDrawState}
          onStartDrawing={onStartDrawing ?? (() => {})}
          onUpdateDrawing={onUpdateDrawing ?? (() => {})}
          onStopDrawing={onStopDrawing ?? (() => {})}
          onOpenComponentDialog={onOpenComponentDialog ?? (() => {})}
          onToolChange={onToolChange}
          viewport={viewport}
          containerRef={canvasInnerRef}
          files={cleanFiles ?? {}}
          flowFrameStates={flowFrameStates}
          onMaterialize={onMaterialize}
          inspectionMode={inspectionMode}
        />
      </InfiniteCanvas>

    </div>
  );
}
