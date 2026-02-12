"use client";

import { useState, useCallback, useRef, useEffect, MouseEvent, PointerEvent } from "react";
import { SandpackPreview, SandpackCodeViewer } from "@codesandbox/sandpack-react";
import { GripHorizontal, Sun, Moon, Pencil, Layers, Eye, Code, RefreshCw, Maximize2, Minimize2 } from "lucide-react";
import { useCanvasScale } from "./InfiniteCanvas";
import { LayersPanel } from "./LayersPanel";
import { StreamingOverlay } from "./StreamingOverlay";
import type { PreviewMode } from "@/lib/tokens";
import type { DOMTreeNode, InspectionMessage } from "@/lib/inspection/types";
import { DEFAULT_FRAME_WIDTH, DEFAULT_FRAME_HEIGHT } from "@/lib/constants";

export { DEFAULT_FRAME_WIDTH, DEFAULT_FRAME_HEIGHT };

export interface FrameState {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface FrameProps {
  x: number;
  y: number;
  width: number;
  height: number;
  onFrameChange: (state: FrameState) => void;
  startRoute?: string;
  previewMode?: PreviewMode;
  onPreviewModeChange?: (mode: PreviewMode) => void;
  inspectionMode?: boolean;
  onInspectionModeChange?: (enabled: boolean) => void;
  // Layers panel props (Frame handles its own DOM tree, expand state, and messaging)
  layersOpen?: boolean;
  onLayersOpenChange?: (open: boolean) => void;
  selectedSelector?: string;
  // Refresh callback to remount SandpackWrapper
  onRefresh?: () => void;
  // VFS hash for auto-refresh when files change
  vfsHash?: number;
  // Page ID for scoping streaming overlay in Flow View
  pageId?: string;
  // External drag delegation (used by FlowFrame to handle repositioning)
  pageInfo?: { name: string; route: string };
  onExternalDragMove?: (deltaX: number, deltaY: number) => void;
  onExternalDragStart?: () => void;
  onExternalDragEnd?: () => void;
  // Expand/collapse for fullscreen-like prototype preview
  isExpanded?: boolean;
  onExpandToggle?: () => void;
  // Force streaming overlay to show (active frame in Prototype View)
  forceStreamingOverlay?: boolean;
}

type ResizeDirection = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

const MIN_WIDTH = 200;
const MIN_HEIGHT = 150;
const HEADER_HEIGHT = 36;

/** Find path of ancestor node keys from root to the node matching targetSelector */
function findNodePath(
  tree: DOMTreeNode,
  targetSelector: string,
  getNodeKey: (n: DOMTreeNode) => string
): string[] | null {
  if (tree.selector === targetSelector) return [getNodeKey(tree)];
  for (const child of tree.children) {
    const path = findNodePath(child, targetSelector, getNodeKey);
    if (path) return [getNodeKey(tree), ...path];
  }
  return null;
}

export function Frame({
  x,
  y,
  width,
  height,
  onFrameChange,
  startRoute = "/",
  previewMode,
  onPreviewModeChange,
  inspectionMode,
  onInspectionModeChange,
  layersOpen,
  onLayersOpenChange,
  selectedSelector,
  onRefresh,
  vfsHash,
  pageId,
  pageInfo,
  onExternalDragMove,
  onExternalDragStart,
  onExternalDragEnd,
  isExpanded,
  onExpandToggle,
  forceStreamingOverlay,
}: FrameProps) {

  type FrameViewMode = "preview" | "code";
  const [viewMode, setViewMode] = useState<FrameViewMode>("preview");
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const resizeStartRef = useRef<{ x: number; y: number; frame: FrameState } | null>(null);
  const resizeDirectionRef = useRef<ResizeDirection | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasScale = useCanvasScale();

  // Escape key to collapse expanded frame
  useEffect(() => {
    if (!isExpanded) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onExpandToggle?.();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isExpanded, onExpandToggle]);

  // Local DOM tree state for this Frame's layers panel
  const [localDomTree, setLocalDomTree] = useState<DOMTreeNode | null>(null);
  const [localExpandedNodes, setLocalExpandedNodes] = useState<Set<string>>(new Set());
  const [localHoveredNodeId, setLocalHoveredNodeId] = useState<string | null>(null);

  // Get stable key for expansion state (source-based, falls back to selector)
  const getNodeKey = useCallback((node: DOMTreeNode): string => {
    if (node.source) {
      return `${node.source.fileName}:${node.source.line}:${node.source.column}`;
    }
    return node.selector;
  }, []);

  // Get the iframe inside this specific Frame container
  const getFrameIframe = useCallback((): HTMLIFrameElement | null => {
    if (!containerRef.current) return null;
    return containerRef.current.querySelector<HTMLIFrameElement>('iframe[title="Sandpack Preview"]');
  }, []);

  // Send message to only this Frame's iframe
  const sendToIframe = useCallback((message: InspectionMessage) => {
    const iframe = getFrameIframe();
    if (iframe?.contentWindow) {
      try {
        iframe.contentWindow.postMessage(message, "*");
      } catch (err) {
        console.warn("Failed to send message to iframe:", err);
      }
    }
  }, [getFrameIframe]);

  // Targeted refresh function for this Frame's DOM tree
  const handleLayersRefresh = useCallback(() => {
    sendToIframe({ type: "novum:request-dom-tree" });
  }, [sendToIframe]);

  // Targeted highlight function
  const handleLayersHighlight = useCallback((selector: string) => {
    sendToIframe({ type: "novum:highlight-element", payload: { selector } });
  }, [sendToIframe]);

  // Targeted clear highlight function
  const handleLayersClearHighlight = useCallback(() => {
    sendToIframe({ type: "novum:clear-highlight" });
  }, [sendToIframe]);

  // Targeted select function
  const handleLayersSelect = useCallback((selector: string) => {
    sendToIframe({ type: "novum:select-element", payload: { selector } });
  }, [sendToIframe]);

  // Toggle expanded state for a node (using stable source-based key)
  const handleLayersToggleExpanded = useCallback((node: DOMTreeNode) => {
    const key = getNodeKey(node);
    setLocalExpandedNodes((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, [getNodeKey]);

  // Expand all nodes (using stable source-based keys)
  const handleLayersExpandAll = useCallback(() => {
    if (localDomTree) {
      const collectNodeKeys = (node: DOMTreeNode, keys: string[] = []): string[] => {
        keys.push(getNodeKey(node));
        node.children.forEach((child) => collectNodeKeys(child, keys));
        return keys;
      };
      const allKeys = collectNodeKeys(localDomTree);
      setLocalExpandedNodes(new Set(allKeys));
    }
  }, [localDomTree, getNodeKey]);

  // Collapse all nodes
  const handleLayersCollapseAll = useCallback(() => {
    setLocalExpandedNodes(new Set());
  }, []);

  // Auto-expand ancestors and scroll selected element into view
  useEffect(() => {
    if (!layersOpen || !selectedSelector || !localDomTree) return;

    const ancestorKeys = findNodePath(localDomTree, selectedSelector, getNodeKey);
    if (!ancestorKeys) return;

    // Expand all ancestors (additive — doesn't collapse other nodes)
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Deriving expanded state from selected element
    setLocalExpandedNodes(prev => {
      const next = new Set(prev);
      ancestorKeys.forEach(k => next.add(k));
      return next;
    });

    // Scroll into view after React renders expanded nodes
    requestAnimationFrame(() => {
      const target = containerRef.current?.querySelector(`[data-layer-selector="${CSS.escape(selectedSelector)}"]`);
      target?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    });
  }, [layersOpen, selectedSelector, localDomTree, getNodeKey]);

  // Auto-expand first 2 levels when DOM tree loads (preserve user expansions on refresh)
  const autoExpandFirstLevels = useCallback((tree: DOMTreeNode, isRefresh: boolean = false) => {
    // If refreshing and user has expanded nodes, preserve their state
    if (isRefresh && localExpandedNodes.size > 0) {
      return;
    }

    const keysToExpand: string[] = [];
    const traverse = (node: DOMTreeNode, depth: number) => {
      if (depth < 2) {
        keysToExpand.push(getNodeKey(node));
        node.children.forEach((child) => traverse(child, depth + 1));
      }
    };
    traverse(tree, 0);
    setLocalExpandedNodes(new Set(keysToExpand));
  }, [getNodeKey, localExpandedNodes.size]);

  // Wrapper for hover that uses targeted highlight
  const handleLayersHoverNode = useCallback((nodeId: string | null, selector?: string) => {
    setLocalHoveredNodeId(nodeId);
    if (nodeId && selector) {
      handleLayersHighlight(selector);
    } else {
      handleLayersClearHighlight();
    }
  }, [handleLayersHighlight, handleLayersClearHighlight]);

  // Listen for DOM tree response from this Frame's iframe
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      // Check if the message is from our iframe
      const iframe = getFrameIframe();
      if (!iframe || event.source !== iframe.contentWindow) return;

      const data = event.data as InspectionMessage;
      if (data?.type === "novum:dom-tree-response" && data.payload) {
        const tree = data.payload as DOMTreeNode;
        const isRefresh = localDomTree !== null;
        setLocalDomTree(tree);
        autoExpandFirstLevels(tree, isRefresh);
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [getFrameIframe, autoExpandFirstLevels, localDomTree]);

  // Request DOM tree when layers panel opens (using targeted function)
  useEffect(() => {
    if (layersOpen && inspectionMode) {
      // Small delay to ensure iframe is ready
      const timer = setTimeout(() => {
        handleLayersRefresh();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [layersOpen, inspectionMode, handleLayersRefresh]);

  // Auto-refresh DOM tree when VFS changes while layers panel is open
  const prevVfsHashRef = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (!layersOpen || !inspectionMode) return;

    // Skip initial render
    if (prevVfsHashRef.current === undefined) {
      prevVfsHashRef.current = vfsHash;
      return;
    }

    // Skip if hash hasn't changed
    if (prevVfsHashRef.current === vfsHash) return;
    prevVfsHashRef.current = vfsHash;

    // Debounce to let Sandpack finish re-rendering
    const timer = setTimeout(() => {
      handleLayersRefresh();
    }, 500);

    return () => clearTimeout(timer);
  }, [layersOpen, inspectionMode, vfsHash, handleLayersRefresh]);

  // Reset inspection mode when switching to code view
  useEffect(() => {
    if (viewMode === "code" && inspectionMode && onInspectionModeChange) {
      onInspectionModeChange(false);
    }
  }, [viewMode, inspectionMode, onInspectionModeChange]);

  // Ref for tracking external drag start position
  const externalDragStartRef = useRef<{ x: number; y: number } | null>(null);

  // --- Native Pointer Event Drag Handlers ---
  const handleDragPointerDown = useCallback((e: PointerEvent<HTMLDivElement>) => {
    if (isResizing || isExpanded) return;
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    setIsDragging(true);
    if (onExternalDragMove) {
      externalDragStartRef.current = { x: e.clientX, y: e.clientY };
      onExternalDragStart?.();
    }
  }, [isResizing, isExpanded, onExternalDragMove, onExternalDragStart]);

  const handleDragPointerMove = useCallback((e: PointerEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    if (onExternalDragMove) {
      // External drag: compute deltas and forward to parent
      const deltaX = e.clientX - externalDragStartRef.current!.x;
      const deltaY = e.clientY - externalDragStartRef.current!.y;
      externalDragStartRef.current = { x: e.clientX, y: e.clientY };
      onExternalDragMove(deltaX, deltaY);
    } else {
      // Internal drag: update own position
      onFrameChange({
        x: x + e.movementX / canvasScale,
        y: y + e.movementY / canvasScale,
        width,
        height,
      });
    }
  }, [isDragging, onExternalDragMove, canvasScale, x, y, width, height, onFrameChange]);

  const handleDragPointerUp = useCallback((e: PointerEvent<HTMLDivElement>) => {
    e.currentTarget.releasePointerCapture(e.pointerId);
    setIsDragging(false);
    if (onExternalDragMove) {
      externalDragStartRef.current = null;
      onExternalDragEnd?.();
    }
  }, [onExternalDragMove, onExternalDragEnd]);

  // --- Resize Handlers ---
  const handleResizeStart = useCallback(
    (e: MouseEvent, direction: ResizeDirection) => {
      e.stopPropagation();
      e.preventDefault();
      setIsResizing(true);
      resizeDirectionRef.current = direction;
      resizeStartRef.current = {
        x: e.clientX,
        y: e.clientY,
        frame: { x, y, width, height },
      };

      const handleMouseMove = (moveEvent: globalThis.MouseEvent) => {
        if (!resizeStartRef.current || !resizeDirectionRef.current) return;

        // Divide delta by canvas scale to account for zoom level
        const deltaX = (moveEvent.clientX - resizeStartRef.current.x) / canvasScale;
        const deltaY = (moveEvent.clientY - resizeStartRef.current.y) / canvasScale;
        const dir = resizeDirectionRef.current;
        const startFrame = resizeStartRef.current.frame;

        let newX = startFrame.x;
        let newY = startFrame.y;
        let newWidth = startFrame.width;
        let newHeight = startFrame.height;

        // Handle horizontal resizing
        if (dir.includes("e")) {
          newWidth = Math.max(MIN_WIDTH, startFrame.width + deltaX);
        }
        if (dir.includes("w")) {
          const widthDelta = Math.min(deltaX, startFrame.width - MIN_WIDTH);
          newWidth = startFrame.width - widthDelta;
          newX = startFrame.x + widthDelta;
        }

        // Handle vertical resizing
        if (dir.includes("s")) {
          newHeight = Math.max(MIN_HEIGHT, startFrame.height + deltaY);
        }
        if (dir.includes("n")) {
          const heightDelta = Math.min(deltaY, startFrame.height - MIN_HEIGHT);
          newHeight = startFrame.height - heightDelta;
          newY = startFrame.y + heightDelta;
        }

        onFrameChange({
          x: newX,
          y: newY,
          width: newWidth,
          height: newHeight,
        });
      };

      const handleMouseUp = () => {
        setIsResizing(false);
        resizeStartRef.current = null;
        resizeDirectionRef.current = null;
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
      };

      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    },
    [x, y, width, height, canvasScale, onFrameChange]
  );

  const resizeHandleClass =
    "absolute bg-transparent hover:bg-blue-500/30 transition-colors z-10";

  return (
    <div
      ref={containerRef}
      className={`absolute bg-white select-none ${
        isExpanded
          ? "border border-neutral-200"
          : inspectionMode && viewMode === "preview"
            ? "rounded-lg shadow-xl border-2 border-blue-400 ring-2 ring-blue-100"
            : "rounded-lg shadow-xl border border-neutral-200"
      }`}
      style={{
        left: x,
        top: y,
        width: width,
        height: height + HEADER_HEIGHT,
        overflow: isExpanded ? 'hidden' : 'visible',
      }}
    >
      {/* Header / Title Bar - acts as drag handle */}
      <div
        className={`h-9 bg-neutral-50 border-b border-neutral-200 flex items-center px-3 gap-2 overflow-hidden ${
          isExpanded ? "cursor-default" : isDragging ? "cursor-grabbing" : "cursor-grab"
        } ${isExpanded ? "" : "rounded-t-lg"}`}
        style={{ touchAction: "none" }}
        onPointerDown={handleDragPointerDown}
        onPointerMove={handleDragPointerMove}
        onPointerUp={handleDragPointerUp}
      >
        {!isExpanded && <GripHorizontal className="w-4 h-4 text-neutral-400 pointer-events-none" />}

        {/* Preview/Code Toggle - labels hidden when frame is narrow */}
        <div
          className="flex items-center bg-neutral-100 rounded p-0.5 pointer-events-auto"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <button
            onClick={(e) => {
              e.stopPropagation();
              setViewMode("preview");
            }}
            className={`px-2 py-1 text-sm font-medium rounded transition-colors flex items-center gap-1 ${
              viewMode === "preview"
                ? "bg-white shadow-sm text-neutral-700"
                : "text-neutral-400 hover:text-neutral-600"
            }`}
            title="Preview"
          >
            <Eye className="w-3 h-3" />
            {width >= 400 && <span>Preview</span>}
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setViewMode("code");
            }}
            className={`px-2 py-1 text-sm font-medium rounded transition-colors flex items-center gap-1 ${
              viewMode === "code"
                ? "bg-white shadow-sm text-neutral-700"
                : "text-neutral-400 hover:text-neutral-600"
            }`}
            title="Code"
          >
            <Code className="w-3 h-3" />
            {width >= 400 && <span>Code</span>}
          </button>
        </div>

        <span className="flex-1" /> {/* Spacer */}

        {/* Page info (Flow View) */}
        {pageInfo && (
          <span className="text-sm text-neutral-500 pointer-events-none truncate max-w-[200px]">
            <span className="font-medium text-neutral-700">{pageInfo.name}</span>
            <span className="mx-1.5 text-neutral-300">·</span>
            <span className="font-mono text-neutral-400">{pageInfo.route}</span>
          </span>
        )}

        {!isExpanded && (
          <span className="text-sm text-neutral-400 font-mono pointer-events-none">
            {Math.round(width)} × {Math.round(height)}
          </span>
        )}

        {/* Inspection mode toggle - only visible in preview mode */}
        {onInspectionModeChange && viewMode === "preview" && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onInspectionModeChange(!inspectionMode);
            }}
            onPointerDown={(e) => e.stopPropagation()}
            className={`p-1.5 rounded transition-colors pointer-events-auto ${
              inspectionMode
                ? "bg-blue-100 text-blue-600"
                : "bg-neutral-100 text-neutral-400 hover:text-neutral-600"
            }`}
            title={inspectionMode ? "Disable inspection" : "Enable inspection"}
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
        )}

        {/* Layers panel toggle - only visible when inspection mode is on and in preview mode */}
        {inspectionMode && onLayersOpenChange && viewMode === "preview" && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onLayersOpenChange(!layersOpen);
            }}
            onPointerDown={(e) => e.stopPropagation()}
            className={`p-1.5 rounded transition-colors pointer-events-auto ${
              layersOpen
                ? "bg-blue-100 text-blue-600"
                : "bg-neutral-100 text-neutral-400 hover:text-neutral-600"
            }`}
            title={layersOpen ? "Hide layers" : "Show layers"}
          >
            <Layers className="w-3.5 h-3.5" />
          </button>
        )}

        {/* Refresh button - forces SandpackWrapper remount */}
        {onRefresh && viewMode === "preview" && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onRefresh();
            }}
            onPointerDown={(e) => e.stopPropagation()}
            className="p-1.5 rounded transition-colors pointer-events-auto bg-neutral-100 text-neutral-400 hover:text-neutral-600"
            title="Refresh preview"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        )}

        {/* Expand/Collapse toggle */}
        {onExpandToggle && viewMode === "preview" && (
          <button
            onClick={(e) => { e.stopPropagation(); onExpandToggle(); }}
            onPointerDown={(e) => e.stopPropagation()}
            className="p-1.5 rounded transition-colors pointer-events-auto bg-neutral-100 text-neutral-400 hover:text-neutral-600"
            title={isExpanded ? "Collapse frame" : "Expand frame"}
          >
            {isExpanded ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
        )}

        {/* Mode toggle (only show if callback provided) */}
        {onPreviewModeChange && (
          <div
            className="flex items-center bg-neutral-100 rounded p-0.5 pointer-events-auto"
            onPointerDown={(e) => e.stopPropagation()}
          >
            <button
              onClick={(e) => {
                e.stopPropagation();
                onPreviewModeChange("light");
              }}
              className={`p-1 rounded transition-colors ${
                previewMode === "light"
                  ? "bg-white shadow-sm text-amber-500"
                  : "text-neutral-400 hover:text-neutral-600"
              }`}
              title="Light mode"
            >
              <Sun className="w-3 h-3" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onPreviewModeChange("dark");
              }}
              className={`p-1 rounded transition-colors ${
                previewMode === "dark"
                  ? "bg-white shadow-sm text-indigo-500"
                  : "text-neutral-400 hover:text-neutral-600"
              }`}
              title="Dark mode"
            >
              <Moon className="w-3 h-3" />
            </button>
          </div>
        )}
      </div>

      {/* Sandpack Content - Preview and Code Viewer (both mounted, one hidden) */}
      <div
        className={`overflow-hidden bg-white relative ${isExpanded ? "" : "rounded-b-lg"}`}
        style={isExpanded
          ? { position: 'absolute', top: HEADER_HEIGHT, left: 0, right: 0, bottom: 0 }
          : { height: height }
        }
      >
        {/* Streaming code overlay */}
        <StreamingOverlay pageId={pageId} forceShow={forceStreamingOverlay} />

        {/* Preview - always mounted to preserve iframe state */}
        <div
          className={`absolute inset-0 ${viewMode === "preview" ? "visible" : "invisible"}`}
        >
          <SandpackPreview
            key={startRoute}
            showNavigator={false}
            showOpenInCodeSandbox={false}
            showRefreshButton={false}
            startRoute={startRoute}
            style={{ height: "100%" }}
          />
        </div>
        {/* Code Viewer - always mounted for instant switching */}
        <div
          className={`absolute inset-0 overflow-auto ${viewMode === "code" ? "visible" : "invisible"}`}
        >
          <SandpackCodeViewer
            showTabs={true}
            showLineNumbers={true}
            wrapContent={false}
          />
        </div>
      </div>

      {/* Layers Panel - positioned on the outside right edge of the frame (only in preview mode, hidden when expanded) */}
      {!isExpanded && inspectionMode && viewMode === "preview" && (
        <LayersPanel
          isOpen={layersOpen ?? false}
          onClose={() => {
            handleLayersClearHighlight();
            onLayersOpenChange?.(false);
          }}
          domTree={localDomTree}
          expandedNodes={localExpandedNodes}
          onToggleExpanded={handleLayersToggleExpanded}
          onExpandAll={handleLayersExpandAll}
          onCollapseAll={handleLayersCollapseAll}
          onRefresh={handleLayersRefresh}
          hoveredNodeId={localHoveredNodeId}
          onHoverNode={handleLayersHoverNode}
          onSelectNode={handleLayersSelect}
          selectedSelector={selectedSelector}
          frameHeight={height}
        />
      )}

      {/* Resize Handles (hidden when expanded) */}
      {!isExpanded && (
        <>
          {/* Edges */}
          <div
            className={`${resizeHandleClass} top-0 left-2 right-2 h-1 cursor-n-resize`}
            onMouseDown={(e) => handleResizeStart(e, "n")}
          />
          <div
            className={`${resizeHandleClass} bottom-0 left-2 right-2 h-1 cursor-s-resize`}
            onMouseDown={(e) => handleResizeStart(e, "s")}
          />
          <div
            className={`${resizeHandleClass} left-0 top-2 bottom-2 w-1 cursor-w-resize`}
            onMouseDown={(e) => handleResizeStart(e, "w")}
          />
          <div
            className={`${resizeHandleClass} right-0 top-2 bottom-2 w-1 cursor-e-resize`}
            onMouseDown={(e) => handleResizeStart(e, "e")}
          />

          {/* Corners */}
          <div
            className={`${resizeHandleClass} top-0 left-0 w-3 h-3 cursor-nw-resize`}
            onMouseDown={(e) => handleResizeStart(e, "nw")}
          />
          <div
            className={`${resizeHandleClass} top-0 right-0 w-3 h-3 cursor-ne-resize`}
            onMouseDown={(e) => handleResizeStart(e, "ne")}
          />
          <div
            className={`${resizeHandleClass} bottom-0 left-0 w-3 h-3 cursor-sw-resize`}
            onMouseDown={(e) => handleResizeStart(e, "sw")}
          />
          <div
            className={`${resizeHandleClass} bottom-0 right-0 w-3 h-3 cursor-se-resize`}
            onMouseDown={(e) => handleResizeStart(e, "se")}
          />
        </>
      )}
    </div>
  );
}
