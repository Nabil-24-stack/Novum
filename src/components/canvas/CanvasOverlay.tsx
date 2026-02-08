"use client";

import { useCallback, useRef, PointerEvent, RefObject } from "react";
import type { CanvasTool, GhostElement, DrawState, CanvasNode } from "@/lib/canvas/types";
import type { ViewportState } from "./InfiniteCanvas";
import type { FrameState } from "./Frame";
import type { InspectionMessage } from "@/lib/inspection/types";
import { useCanvasStore } from "@/hooks/useCanvasStore";
import { GhostTreeRenderer } from "./GhostRenderer";
import { MultiSelectBox } from "./MultiSelectBox";
import { AutoLayoutToolbar } from "./AutoLayoutToolbar";

/** Flow View frame state for multi-frame drop detection */
export interface FlowFrameDropState {
  pageId: string;
  route: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface CanvasOverlayProps {
  activeTool: CanvasTool;
  drawState: DrawState;
  onStartDrawing: (x: number, y: number) => void;
  onUpdateDrawing: (x: number, y: number) => void;
  onStopDrawing: () => void;
  onOpenComponentDialog: () => void;
  onToolChange?: (tool: CanvasTool) => void;
  viewport: ViewportState;
  containerRef: RefObject<HTMLDivElement | null>;
  // VFS files for design system styling in component ghosts
  files: Record<string, string>;
  // Frame state for drop detection (Prototype View)
  frameState?: FrameState;
  // Flow mode: array of all frame states for multi-frame drop detection
  flowFrameStates?: FlowFrameDropState[];
  // Callback when a node is dropped on the Frame
  onMaterialize?: (node: CanvasNode, nodes: Map<string, CanvasNode>, iframeDropPoint: { x: number; y: number }, pageId?: string) => void;
  // Inspection mode - drops only work when this is ON
  inspectionMode?: boolean;
}

const MIN_DRAW_SIZE = 20;

// Large virtual size to cover all drawing area in world space
const VIRTUAL_SIZE = 20000;
const VIRTUAL_OFFSET = VIRTUAL_SIZE / 2;

// Frame header height (matches Frame.tsx HEADER_HEIGHT)
const FRAME_HEADER_HEIGHT = 36;

function generateId(): string {
  return `ghost-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Check if a node's center point is inside the Frame's content area.
 * Returns the drop point in iframe coordinates if inside, null otherwise.
 */
function getDropPointInFrame(
  node: { x: number; y: number; width: number; height: number },
  frameState: FrameState | undefined
): { x: number; y: number } | null {
  if (!frameState) return null;

  // Node center in world coordinates
  const nodeCenterX = node.x + node.width / 2;
  const nodeCenterY = node.y + node.height / 2;

  // Frame content area (excluding header)
  const frameContentTop = frameState.y + FRAME_HEADER_HEIGHT;
  const frameContentBottom = frameState.y + FRAME_HEADER_HEIGHT + frameState.height;
  const frameContentLeft = frameState.x;
  const frameContentRight = frameState.x + frameState.width;

  // Check if node center is inside frame content area
  if (
    nodeCenterX >= frameContentLeft &&
    nodeCenterX <= frameContentRight &&
    nodeCenterY >= frameContentTop &&
    nodeCenterY <= frameContentBottom
  ) {
    // Calculate drop point relative to iframe (0,0 at top-left of iframe content)
    const iframeX = nodeCenterX - frameState.x;
    const iframeY = nodeCenterY - frameState.y - FRAME_HEADER_HEIGHT;

    return { x: iframeX, y: iframeY };
  }

  return null;
}

/**
 * Send a message to the Sandpack iframe (Prototype View - first match).
 */
function sendToIframe(message: InspectionMessage): boolean {
  const iframe = document.querySelector<HTMLIFrameElement>('iframe[title="Sandpack Preview"]');
  if (iframe?.contentWindow) {
    iframe.contentWindow.postMessage(message, "*");
    return true;
  }
  return false;
}

/**
 * Send a message to a specific FlowFrame's iframe by pageId.
 */
function sendToTargetIframe(pageId: string, message: InspectionMessage): boolean {
  const iframe = document.querySelector<HTMLIFrameElement>(
    `[data-flow-page-id="${pageId}"] iframe[title="Sandpack Preview"]`
  );
  if (iframe?.contentWindow) {
    iframe.contentWindow.postMessage(message, "*");
    return true;
  }
  return false;
}

/**
 * Send a message to ALL FlowFrame iframes.
 */
function sendToAllFlowIframes(message: InspectionMessage): void {
  const iframes = document.querySelectorAll<HTMLIFrameElement>(
    '[data-flow-page-id] iframe[title="Sandpack Preview"]'
  );
  iframes.forEach((iframe) => {
    iframe.contentWindow?.postMessage(message, "*");
  });
}

/**
 * Check if a node's center point is inside any of the Flow View frames.
 * Returns the drop point in iframe coordinates and the matching pageId.
 */
function getDropPointInFlowFrames(
  node: { x: number; y: number; width: number; height: number },
  flowFrameStates: FlowFrameDropState[]
): { x: number; y: number; pageId: string } | null {
  const nodeCenterX = node.x + node.width / 2;
  const nodeCenterY = node.y + node.height / 2;

  for (const frame of flowFrameStates) {
    // Frame content area (excluding the title bar above and Frame header)
    const contentTop = frame.y + FRAME_HEADER_HEIGHT;
    const contentBottom = frame.y + FRAME_HEADER_HEIGHT + frame.height;
    const contentLeft = frame.x;
    const contentRight = frame.x + frame.width;

    if (
      nodeCenterX >= contentLeft &&
      nodeCenterX <= contentRight &&
      nodeCenterY >= contentTop &&
      nodeCenterY <= contentBottom
    ) {
      const iframeX = nodeCenterX - frame.x;
      const iframeY = nodeCenterY - frame.y - FRAME_HEADER_HEIGHT;
      return { x: iframeX, y: iframeY, pageId: frame.pageId };
    }
  }

  return null;
}

/**
 * Throttle function to limit how often a callback is invoked.
 */
function throttle<T extends (...args: Parameters<T>) => ReturnType<T>>(
  func: T,
  limit: number
): (...args: Parameters<T>) => void {
  let lastCall = 0;
  return (...args: Parameters<T>) => {
    const now = Date.now();
    if (now - lastCall >= limit) {
      lastCall = now;
      func(...args);
    }
  };
}

export function CanvasOverlay({
  activeTool,
  drawState,
  onStartDrawing,
  onUpdateDrawing,
  onStopDrawing,
  onOpenComponentDialog,
  onToolChange,
  viewport,
  containerRef,
  files,
  frameState,
  flowFrameStates,
  onMaterialize,
  inspectionMode,
}: CanvasOverlayProps) {
  const overlayRef = useRef<HTMLDivElement>(null);

  // Access the canvas store
  const {
    nodes,
    selection,
    frameCounter,
    addNode,
    selectNode,
    deselectAll,
    incrementFrameCounter,
    getSelectionBoundingBox,
    getWorldPosition,
  } = useCanvasStore();

  // Calculate draw preview rect (in world coordinates)
  const getDrawRect = useCallback(() => {
    if (!drawState.isDrawing) return null;
    const x = Math.min(drawState.startX, drawState.currentX);
    const y = Math.min(drawState.startY, drawState.currentY);
    const width = Math.abs(drawState.currentX - drawState.startX);
    const height = Math.abs(drawState.currentY - drawState.startY);
    return { x, y, width, height };
  }, [drawState]);

  // Convert screen coordinates to world coordinates
  const getWorldCoords = useCallback((e: PointerEvent<HTMLDivElement>) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };

    // Screen → World conversion (reverse the CSS transform)
    const worldX = (e.clientX - rect.left - viewport.x) / viewport.scale;
    const worldY = (e.clientY - rect.top - viewport.y) / viewport.scale;
    return { x: worldX, y: worldY };
  }, [viewport, containerRef]);

  const handlePointerDown = useCallback((e: PointerEvent<HTMLDivElement>) => {
    // Only handle direct clicks on overlay (not on ghosts)
    if (e.target !== overlayRef.current) return;

    const coords = getWorldCoords(e);

    if (activeTool === "frame") {
      e.preventDefault();
      e.stopPropagation();
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      onStartDrawing(coords.x, coords.y);
    } else if (activeTool === "text") {
      e.preventDefault();
      e.stopPropagation();
      // Create text node at click position
      const newNode: CanvasNode = {
        id: generateId(),
        type: "text",
        x: coords.x,
        y: coords.y,
        width: 150,
        height: 28,
        content: "",
      };
      addNode(newNode);
      selectNode(newNode.id);
    } else if (activeTool === "component") {
      e.preventDefault();
      e.stopPropagation();
      onOpenComponentDialog();
    } else if (activeTool === "cursor") {
      // Click on empty canvas area - deselect all
      deselectAll();
    }
  }, [activeTool, getWorldCoords, onStartDrawing, addNode, selectNode, deselectAll, onOpenComponentDialog]);

  const handlePointerMove = useCallback((e: PointerEvent<HTMLDivElement>) => {
    if (!drawState.isDrawing) return;
    const coords = getWorldCoords(e);
    onUpdateDrawing(coords.x, coords.y);
  }, [drawState.isDrawing, getWorldCoords, onUpdateDrawing]);

  const handlePointerUp = useCallback((e: PointerEvent<HTMLDivElement>) => {
    if (!drawState.isDrawing) return;

    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    const rect = getDrawRect();

    if (rect && rect.width >= MIN_DRAW_SIZE && rect.height >= MIN_DRAW_SIZE) {
      const newNode: CanvasNode = {
        id: generateId(),
        type: "frame",
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        name: `Frame ${frameCounter}`,
      };
      addNode(newNode);
      selectNode(newNode.id);
      incrementFrameCounter();
    }

    onStopDrawing();
  }, [drawState.isDrawing, getDrawRect, addNode, selectNode, incrementFrameCounter, onStopDrawing, frameCounter]);

  // Handle node drag end - check if it should be materialized
  const handleNodeDragEnd = useCallback((nodeId: string) => {
    // Hide drop zone indicator when drag ends
    if (flowFrameStates && flowFrameStates.length > 0) {
      sendToAllFlowIframes({ type: "novum:hide-drop-zone" });
    } else {
      sendToIframe({ type: "novum:hide-drop-zone" });
    }

    // Only allow drops when inspection mode is ON
    if (!inspectionMode || !onMaterialize) return;

    const node = nodes.get(nodeId);
    if (!node) return;

    // Get world position for the node
    const worldPos = getWorldPosition(nodeId);
    const nodeWithWorldPos = { ...node, x: worldPos.x, y: worldPos.y };

    // Flow View: check against multiple frames
    if (flowFrameStates && flowFrameStates.length > 0) {
      const flowDrop = getDropPointInFlowFrames(nodeWithWorldPos, flowFrameStates);
      if (flowDrop) {
        onMaterialize(node, nodes, { x: flowDrop.x, y: flowDrop.y }, flowDrop.pageId);
      }
      return;
    }

    // Prototype View: check against single frame
    if (!frameState) return;
    const dropPoint = getDropPointInFrame(nodeWithWorldPos, frameState);
    if (dropPoint) {
      onMaterialize(node, nodes, dropPoint);
    }
  }, [inspectionMode, frameState, flowFrameStates, onMaterialize, nodes, getWorldPosition]);

  // Throttled function to send drop zone updates to iframe (50ms throttle)
  const sendDropZoneUpdateRef = useRef(
    throttle((iframeX: number, iframeY: number) => {
      sendToIframe({
        type: "novum:show-drop-zone",
        payload: { x: iframeX, y: iframeY },
      });
    }, 50)
  );

  // Throttled function to send drop zone updates to a specific FlowFrame's iframe
  const sendFlowDropZoneUpdateRef = useRef(
    throttle((pageId: string, iframeX: number, iframeY: number) => {
      sendToTargetIframe(pageId, {
        type: "novum:show-drop-zone",
        payload: { x: iframeX, y: iframeY },
      });
    }, 50)
  );

  // Handle node drag move - show drop zone indicator in iframe
  const handleNodeDragMove = useCallback((ghost: GhostElement) => {
    // Only show drop zone when inspection mode is ON (drops are allowed)
    if (!inspectionMode) {
      if (flowFrameStates && flowFrameStates.length > 0) {
        sendToAllFlowIframes({ type: "novum:hide-drop-zone" });
      } else {
        sendToIframe({ type: "novum:hide-drop-zone" });
      }
      return;
    }

    // Flow View: check against multiple frames
    if (flowFrameStates && flowFrameStates.length > 0) {
      const flowDrop = getDropPointInFlowFrames(ghost, flowFrameStates);

      // Hide drop zone on ALL flow iframes first (clears previous frame's indicator)
      sendToAllFlowIframes({ type: "novum:hide-drop-zone" });

      if (flowDrop) {
        // Show drop zone on the specific hovered frame
        sendFlowDropZoneUpdateRef.current(flowDrop.pageId, flowDrop.x, flowDrop.y);
      }
      return;
    }

    // Prototype View: check against single frame
    if (!frameState) {
      sendToIframe({ type: "novum:hide-drop-zone" });
      return;
    }

    const dropPoint = getDropPointInFrame(ghost, frameState);

    if (dropPoint) {
      sendDropZoneUpdateRef.current(dropPoint.x, dropPoint.y);
    } else {
      sendToIframe({ type: "novum:hide-drop-zone" });
    }
  }, [inspectionMode, frameState, flowFrameStates]);

  const drawRect = getDrawRect();
  const isCursorTool = activeTool === "cursor";

  // Get selection bounding box for multi-select visualization
  const selectionBbox = selection.selectedIds.size > 1 ? getSelectionBoundingBox() : null;

  // Check if a group is selected (for auto-layout toolbar)
  const primaryNode = selection.primaryId ? nodes.get(selection.primaryId) : null;
  const isGroupSelected = primaryNode?.children && primaryNode.children.length > 0;

  // Get position for auto-layout toolbar (below the selected group)
  const autoLayoutToolbarPosition = isGroupSelected && primaryNode ? {
    x: getWorldPosition(primaryNode.id).x + VIRTUAL_OFFSET,
    y: getWorldPosition(primaryNode.id).y + primaryNode.height + VIRTUAL_OFFSET,
  } : null;

  return (
    <div
      ref={overlayRef}
      className={isCursorTool ? "pointer-events-none" : "pointer-events-auto"}
      style={{
        position: "absolute",
        left: -VIRTUAL_OFFSET,
        top: -VIRTUAL_OFFSET,
        width: VIRTUAL_SIZE,
        height: VIRTUAL_SIZE,
        zIndex: 50,
        cursor: activeTool === "frame" ? "crosshair" :
                activeTool === "text" ? "text" :
                activeTool === "component" ? "pointer" : "default",
        touchAction: "none",
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      {/* Drawing preview rect - offset by VIRTUAL_OFFSET since overlay is offset */}
      {drawRect && drawState.isDrawing && (
        <div
          className="absolute border-2 border-dashed border-blue-500 bg-blue-100/30 rounded pointer-events-none"
          style={{
            left: drawRect.x + VIRTUAL_OFFSET,
            top: drawRect.y + VIRTUAL_OFFSET,
            width: drawRect.width,
            height: drawRect.height,
          }}
        />
      )}

      {/* Multi-select bounding box */}
      {selectionBbox && (
        <MultiSelectBox boundingBox={selectionBbox} offset={VIRTUAL_OFFSET} />
      )}

      {/* Render all nodes recursively using the GhostTreeRenderer */}
      <GhostTreeRenderer
        offset={VIRTUAL_OFFSET}
        scale={viewport.scale}
        activeTool={activeTool}
        files={files}
        onDragEnd={handleNodeDragEnd}
        onDragMove={handleNodeDragMove}
        onToolChange={onToolChange}
      />

      {/* Auto-layout toolbar for groups */}
      {isGroupSelected && autoLayoutToolbarPosition && selection.primaryId && (
        <AutoLayoutToolbar
          groupId={selection.primaryId}
          position={autoLayoutToolbarPosition}
          scale={viewport.scale}
        />
      )}
    </div>
  );
}
