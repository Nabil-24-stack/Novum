"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { SandpackPreview } from "@codesandbox/sandpack-react";
import { useVirtualFiles } from "@/hooks/useVirtualFiles";
import { useInstrumentedFiles } from "@/hooks/useInstrumentedFiles";
import { useTokens } from "@/hooks/useTokens";
import { useInspection } from "@/hooks/useInspection";
import { useCanvasTool } from "@/hooks/useCanvasTool";
import { useFlowManifest } from "@/hooks/useFlowManifest";
import { useWriter } from "@/hooks/useWriter";
import { useMaterializer } from "@/hooks/useMaterializer";
import { useCanvasStore } from "@/hooks/useCanvasStore";
import { useCanvasKeyboard } from "@/hooks/useCanvasKeyboard";
import { useChatContextStore, type PinnedElement } from "@/hooks/useChatContextStore";
import { SandpackWrapper } from "@/components/providers/SandpackWrapper";
import { InfiniteCanvas, type ViewportState } from "@/components/canvas/InfiniteCanvas";
import { Frame, type FrameState, DEFAULT_FRAME_WIDTH, DEFAULT_FRAME_HEIGHT } from "@/components/canvas/Frame";
import { CanvasOverlay } from "@/components/canvas/CanvasOverlay";
import { RightPanel, type RightPanelTab } from "@/components/editor/RightPanel";
import { TokenStudio } from "@/components/editor/TokenStudio";
import { ComponentDialog } from "@/components/canvas/ComponentDialog";
import { InspectorContextMenu } from "@/components/canvas/InspectorContextMenu";
import { FlowCanvas, type CanvasMode } from "@/components/flow";
import { initializeTestAPI, updateTestAPI } from "@/lib/ast/test-utils";
import type { CanvasTool, CanvasNode } from "@/lib/canvas/types";
import type { ContextMenuPayload } from "@/lib/inspection/types";

type ViewMode = "app" | "design-system";

export default function Home() {
  const { files, writeFile } = useVirtualFiles();

  // Generate shadow files with data-source-loc attributes for Sandpack
  // Clean files remain pristine for editing in RightPanel
  const { shadowFiles } = useInstrumentedFiles(files);

  const tokenState = useTokens({ files, writeFile });
  const [viewMode, setViewMode] = useState<ViewMode>("app");
  const [rightPanelTab, setRightPanelTab] = useState<RightPanelTab>("chat");

  // Canvas mode: prototype (single frame) or flow (multi-page flow diagram)
  const [canvasMode, setCanvasMode] = useState<CanvasMode>("prototype");

  // Active route for prototype view (navigating from flow view)
  const [activeRoute, setActiveRoute] = useState("/");

  // Refresh counter to force SandpackWrapper remount
  const [refreshKey, setRefreshKey] = useState(0);

  // Flow manifest parsed from /flow.json
  const flowManifest = useFlowManifest(files);

  // Compute hash of VFS files for change detection (layers panel auto-refresh)
  const vfsHash = useMemo(() => {
    const entries = Object.entries(files);
    return entries.reduce((acc, [path, content]) =>
      acc + path.length + content.length, entries.length);
  }, [files]);

  // Frame state lifted here to persist across SandpackWrapper remounts (light/dark mode toggle)
  const [frameState, setFrameState] = useState<FrameState>({
    x: 100,
    y: 100,
    width: DEFAULT_FRAME_WIDTH,
    height: DEFAULT_FRAME_HEIGHT,
  });

  // Canvas viewport state for prototype view
  // Use a ref to track the "real" viewport to detect unexpected resets
  const viewportRef = useRef<ViewportState>({ x: 0, y: 0, scale: 1 });
  const [viewport, setViewportInternal] = useState<ViewportState>({
    x: 0,
    y: 0,
    scale: 1,
  });

  // Wrapped setViewport that updates both state and ref
  const setViewport = useCallback((update: ViewportState | ((prev: ViewportState) => ViewportState)) => {
    setViewportInternal((prev) => {
      const newValue = typeof update === "function" ? update(prev) : update;
      viewportRef.current = newValue;
      return newValue;
    });
  }, []);

  // Separate viewport state for flow view (preserve pan/zoom independently)
  const [flowViewport, setFlowViewport] = useState<ViewportState>({
    x: 50,
    y: 80,
    scale: 1,
  });

  // Callback to auto-switch to Design tab and open Layers when element is selected
  const handleElementSelected = useCallback(() => {
    setRightPanelTab("design");
    setLayersOpen(true);
  }, []);

  const inspection = useInspection({ onElementSelected: handleElementSelected });

  // Writer hook for AST-based and regex-based code editing
  const writer = useWriter({ files, writeFile });

  // Materializer hook for converting ghosts to actual code
  const { materializeNode } = useMaterializer({ files, writeFile });

  // Canvas store for hierarchical ghost nodes
  const canvasStore = useCanvasStore();

  // Auto-switch to Design tab when canvas node is selected
  useEffect(() => {
    if (canvasStore.selection.primaryId) {
      setRightPanelTab("design");
    }
  }, [canvasStore.selection.primaryId]);

  // Refs for test API to avoid stale closures
  const writerRef = useRef(writer);
  const inspectionRef = useRef(inspection);
  writerRef.current = writer;
  inspectionRef.current = inspection;

  // Initialize test API for console-based testing (window.novum.testEdit())
  useEffect(() => {
    initializeTestAPI({
      files,
      writeFile,
      selectedElement: inspection.selectedElement,
      setSelectedElement: () => {}, // Read-only from test API
      updateClasses: (newClassName, sourceLocation) => {
        const selected = inspectionRef.current.selectedElement;
        if (!selected) {
          return { success: false, error: "No element selected" };
        }
        return writerRef.current.updateElementClasses(
          selected.selector || "",
          selected.className,
          newClassName,
          sourceLocation || selected.source
        );
      },
      updateText: (newText, sourceLocation) => {
        const selected = inspectionRef.current.selectedElement;
        if (!selected) {
          return { success: false, error: "No element selected" };
        }
        return writerRef.current.updateElementText(
          selected.textContent || "",
          newText,
          selected.className,
          sourceLocation || selected.source
        );
      },
      deleteElement: (sourceLocation) => writerRef.current.deleteElement(sourceLocation),
      insertChild: (sourceLocation, childCode, position) =>
        writerRef.current.insertChildElement(sourceLocation, childCode, position),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only initialize once - refs ensure latest values

  // Keep test API updated with current state
  useEffect(() => {
    updateTestAPI({
      files,
      selectedElement: inspection.selectedElement,
    });
  }, [files, inspection.selectedElement]);

  // Canvas tool state (toolbar, drawing state only - ghosts managed by useCanvasStore)
  const canvasTool = useCanvasTool();
  const [componentDialogOpen, setComponentDialogOpen] = useState(false);

  // Canvas keyboard shortcuts (Cmd+G for grouping, etc.)
  useCanvasKeyboard();

  // Ref for infinite canvas container (for coordinate conversion in CanvasOverlay)
  const canvasContainerRef = useRef<HTMLDivElement>(null);

  // Coordinate canvas tool with inspection mode
  useEffect(() => {
    if (canvasTool.activeTool !== "cursor" && inspection.inspectionMode) {
      inspection.setInspectionMode(false);
    }
  }, [canvasTool.activeTool, inspection]);

  // Handle component selection from dialog
  const handleComponentSelect = useCallback((componentType: string, defaultWidth: number, defaultHeight: number) => {
    // Calculate viewport center in world coordinates (use flow viewport when in flow mode)
    const currentViewport = canvasMode === "flow" ? flowViewport : viewport;
    const viewportCenterX = (-currentViewport.x + window.innerWidth / 2) / currentViewport.scale;
    const viewportCenterY = (-currentViewport.y + window.innerHeight / 2) / currentViewport.scale;

    const newNode: CanvasNode = {
      id: `ghost-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      type: "component",
      x: viewportCenterX - defaultWidth / 2,
      y: viewportCenterY - defaultHeight / 2,
      width: defaultWidth,
      height: defaultHeight,
      componentType,
    };

    canvasStore.addNode(newNode);
    canvasStore.selectNode(newNode.id);
    canvasTool.setActiveTool("cursor"); // Auto-switch to cursor for immediate manipulation
  }, [viewport, flowViewport, canvasMode, canvasStore, canvasTool]);

  // Handle flow page selection: navigate to that page in prototype view
  const handleFlowPageSelect = useCallback((route: string) => {
    setActiveRoute(route);
    setCanvasMode("prototype");
  }, []);

  // Handle node materialization: convert canvas node to actual code (Prototype View)
  const handleMaterialize = useCallback(
    async (node: CanvasNode, nodes: Map<string, CanvasNode>, iframeDropPoint: { x: number; y: number }) => {
      // Extra safety check: only allow drops when inspection mode is ON
      if (!inspection.inspectionMode) return;

      const result = await materializeNode(node, nodes, frameState, iframeDropPoint);

      if (result.success) {
        // Remove the node from canvas (it's now real code)
        canvasStore.removeNode(node.id);
        // HMR handles the update instantly thanks to warmup pre-compilation
        console.log("[Materializer] Node materialized successfully:", node.type);
      } else {
        console.error("[Materializer] Failed to materialize node:", result.error);
      }
    },
    [materializeNode, frameState, canvasStore, inspection.inspectionMode]
  );

  // Handle node materialization in Flow View: convert canvas node to actual code in targeted page
  const handleFlowMaterialize = useCallback(
    async (node: CanvasNode, nodes: Map<string, CanvasNode>, iframeDropPoint: { x: number; y: number }, pageId?: string) => {
      if (!inspection.inspectionMode) return;

      const result = await materializeNode(node, nodes, frameState, iframeDropPoint, pageId);

      if (result.success) {
        canvasStore.removeNode(node.id);
        console.log("[Materializer] Flow node materialized successfully:", node.type, "→ page:", pageId);
      } else {
        console.error("[Materializer] Failed to materialize flow node:", result.error);
      }
    },
    [materializeNode, frameState, canvasStore, inspection.inspectionMode]
  );

  // Handle tool change - open component dialog immediately when component tool is selected
  const handleToolChange = useCallback((tool: CanvasTool) => {
    if (tool === "component") {
      setComponentDialogOpen(true);
      // Don't change the active tool - keep cursor active
    } else {
      canvasTool.setActiveTool(tool);
    }
  }, [canvasTool]);

  // Layers panel open state (Frame handles its own DOM tree and messaging)
  const [layersOpen, setLayersOpen] = useState(false);

  // Close layers panel when inspection mode is disabled
  const derivedLayersOpen = inspection.inspectionMode && layersOpen;

  // Debounced CSS hash to force Design System preview remount when theme changes
  const [cssHash, setCssHash] = useState(0);
  const cssContentRef = useRef(files["/globals.css"]);

  useEffect(() => {
    const currentCss = files["/globals.css"];

    // Only trigger if CSS actually changed
    if (currentCss === cssContentRef.current) return;
    cssContentRef.current = currentCss;

    // Debounce by 1000ms so we don't reload while dragging sliders
    const timer = setTimeout(() => {
      console.log("[ThemeSync] CSS changed, triggering preview refresh");
      setCssHash((prev) => prev + 1);
    }, 1000);

    return () => clearTimeout(timer);
  }, [files]);

  // Listen for novum:context-menu postMessage from iframe
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (!event.data || event.data.type !== "novum:context-menu") return;

      const payload = event.data.payload as ContextMenuPayload;
      if (!payload?.source) return; // Only show if element has AST source location

      // Find the source iframe via event.source
      const iframes = document.querySelectorAll("iframe");
      let sourceIframe: HTMLIFrameElement | null = null;
      for (const iframe of iframes) {
        if (iframe.contentWindow === event.source) {
          sourceIframe = iframe;
          break;
        }
      }
      if (!sourceIframe) return;

      // Convert iframe-local coords to screen-space with scale correction
      const iframeRect = sourceIframe.getBoundingClientRect();
      const scaleX = iframeRect.width / sourceIframe.clientWidth;
      const scaleY = iframeRect.height / sourceIframe.clientHeight;
      const screenX = iframeRect.left + payload.menuX * scaleX;
      const screenY = iframeRect.top + payload.menuY * scaleY;

      // Build display label: "<tagName.firstClass>" or "<TagName>"
      const tag = payload.tagName;
      const firstClass = payload.className
        ? payload.className.split(/\s+/)[0]
        : "";
      const displayLabel = firstClass
        ? `<${tag}.${firstClass}>`
        : `<${tag}>`;

      const pinnedElement: PinnedElement = {
        id: `${payload.source.fileName}:${payload.source.line}:${payload.source.column}`,
        tagName: payload.tagName,
        displayLabel,
        source: payload.source,
        className: payload.className || undefined,
        textContent: payload.textContent,
      };

      useChatContextStore.getState().showContextMenu(screenX, screenY, pinnedElement);
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  // Dismiss context menu when inspection mode is turned off
  useEffect(() => {
    if (!inspection.inspectionMode) {
      useChatContextStore.getState().hideContextMenu();
    }
  }, [inspection.inspectionMode]);

  return (
    <main className="w-screen h-screen overflow-hidden flex flex-col">
      {/* Top Navigation Bar */}
      <nav className="h-12 bg-white border-b border-neutral-200 flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center gap-1">
          <span className="font-semibold text-neutral-800 mr-4">Novum</span>

          {/* View Mode Toggle */}
          <div className="flex bg-neutral-100 rounded-lg p-0.5">
            <button
              onClick={() => setViewMode("app")}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                viewMode === "app"
                  ? "bg-white text-neutral-900 shadow-sm"
                  : "text-neutral-600 hover:text-neutral-900"
              }`}
            >
              App Preview
            </button>
            <button
              onClick={() => setViewMode("design-system")}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                viewMode === "design-system"
                  ? "bg-white text-neutral-900 shadow-sm"
                  : "text-neutral-600 hover:text-neutral-900"
              }`}
            >
              Design System
            </button>
          </div>
        </div>

      </nav>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* App Preview: Canvas + Right panel */}
        <div className={`flex-1 h-full min-h-0 relative isolate ${viewMode !== "app" ? "hidden" : ""}`}>
          <SandpackWrapper
            files={shadowFiles}
            previewMode={tokenState.previewMode}
            inspectionMode={inspection.inspectionMode}
            flowModeActive={canvasMode === "flow"}
            key={`app-${tokenState.previewMode}-${activeRoute}-${refreshKey}`}
          >
            {/* Prototype View: Single Frame */}
            <div className={canvasMode !== "prototype" ? "hidden" : "absolute inset-0"}>
              <InfiniteCanvas
                ref={canvasContainerRef}
                viewport={viewport}
                onViewportChange={setViewport}
                activeTool={canvasTool.activeTool}
                onToolChange={handleToolChange}
                isDrawingActive={canvasTool.drawState.isDrawing}
                onCanvasClick={() => canvasStore.deselectAll()}
              >
                <Frame
                  x={frameState.x}
                  y={frameState.y}
                  width={frameState.width}
                  height={frameState.height}
                  onFrameChange={setFrameState}
                  startRoute={activeRoute}
                  previewMode={tokenState.previewMode}
                  onPreviewModeChange={tokenState.setPreviewMode}
                  inspectionMode={inspection.inspectionMode}
                  onInspectionModeChange={inspection.setInspectionMode}
                  // Layers panel props (Frame handles its own DOM tree and messaging)
                  layersOpen={derivedLayersOpen}
                  onLayersOpenChange={setLayersOpen}
                  selectedSelector={inspection.selectedElement?.selector}
                  // Canvas mode toggle (Prototype/Flow)
                  canvasMode={canvasMode}
                  onCanvasModeChange={setCanvasMode}
                  // Refresh to remount SandpackWrapper
                  onRefresh={() => setRefreshKey((k) => k + 1)}
                  // VFS hash for auto-refresh when files change
                  vfsHash={vfsHash}
                />

                {/* Canvas Overlay - Global drawing layer for ghost elements (always rendered to preserve ghosts) */}
                <CanvasOverlay
                  activeTool={canvasTool.activeTool}
                  drawState={canvasTool.drawState}
                  onStartDrawing={canvasTool.startDrawing}
                  onUpdateDrawing={canvasTool.updateDrawing}
                  onStopDrawing={canvasTool.stopDrawing}
                  onOpenComponentDialog={() => setComponentDialogOpen(true)}
                  onToolChange={canvasTool.setActiveTool}
                  viewport={viewport}
                  containerRef={canvasContainerRef}
                  files={files}
                  frameState={frameState}
                  onMaterialize={handleMaterialize}
                  inspectionMode={inspection.inspectionMode}
                />
              </InfiniteCanvas>
            </div>

            {/* Flow View: Multi-page flow diagram with full editing capabilities */}
            <div className={canvasMode !== "flow" ? "hidden" : "absolute inset-0"}>
              <FlowCanvas
                manifest={flowManifest}
                viewport={flowViewport}
                onViewportChange={setFlowViewport}
                onPageSelect={handleFlowPageSelect}
                selectedRoute={activeRoute}
                files={shadowFiles}
                previewMode={tokenState.previewMode}
                canvasMode={canvasMode}
                onCanvasModeChange={setCanvasMode}
                inspectionMode={inspection.inspectionMode}
                onInspectionModeChange={inspection.setInspectionMode}
                activeTool={canvasTool.activeTool}
                onToolChange={handleToolChange}
                drawState={canvasTool.drawState}
                onStartDrawing={canvasTool.startDrawing}
                onUpdateDrawing={canvasTool.updateDrawing}
                onStopDrawing={canvasTool.stopDrawing}
                onOpenComponentDialog={() => setComponentDialogOpen(true)}
                cleanFiles={files}
                onMaterialize={handleFlowMaterialize}
                selectedPageId={inspection.selectedElement?.pageId}
                selectedSelector={inspection.selectedElement?.selector}
              />
            </div>
          </SandpackWrapper>

        </div>

        {/* Design System: Full-width preview */}
        <div className={`flex-1 h-full ${viewMode !== "design-system" ? "hidden" : ""}`}>
          <SandpackWrapper
            files={shadowFiles}
            previewMode={tokenState.previewMode}
            key={`design-system-${cssHash}-${tokenState.previewMode}`}
          >
            <SandpackPreview
              showNavigator={false}
              showOpenInCodeSandbox={false}
              startRoute="/design-system"
              style={{ height: "100%" }}
            />
          </SandpackWrapper>
        </div>

        {/* Right Panel - always mounted to preserve state */}
        <RightPanel
          writeFile={writeFile}
          files={files}
          selectedElement={inspection.selectedElement}
          inspectionMode={inspection.inspectionMode}
          activeTab={rightPanelTab}
          onTabChange={setRightPanelTab}
          onSelectedElementSourceUpdate={inspection.updateSelectedElementSource}
          onClearSelection={inspection.clearSelection}
          className={`shrink-0 ${viewMode !== "app" ? "hidden" : ""}`}
        />

        {/* Token Studio - only shown in design-system mode */}
        {viewMode === "design-system" && (
          <TokenStudio tokenState={tokenState} />
        )}
      </div>

      {/* Component Dialog (portal) */}
      <ComponentDialog
        isOpen={componentDialogOpen}
        onClose={() => setComponentDialogOpen(false)}
        onSelect={handleComponentSelect}
        files={files}
      />

      {/* Inspector context menu (right-click "Add to AI Chat") */}
      <InspectorContextMenu onAddToChat={() => setRightPanelTab("chat")} />
    </main>
  );
}
