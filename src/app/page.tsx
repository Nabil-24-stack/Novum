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
import { useStrategyStore } from "@/hooks/useStrategyStore";
import { useFlowNavigation } from "@/hooks/useFlowNavigation";
import { useCanvasTransition } from "@/hooks/useCanvasTransition";
import { SandpackWrapper } from "@/components/providers/SandpackWrapper";
import { InfiniteCanvas, type ViewportState } from "@/components/canvas/InfiniteCanvas";
import { type FrameState, DEFAULT_FRAME_WIDTH, DEFAULT_FRAME_HEIGHT } from "@/components/canvas/Frame";
import { CanvasOverlay, type FlowFrameDropState } from "@/components/canvas/CanvasOverlay";
import { RightPanel, type RightPanelTab } from "@/components/editor/RightPanel";
import { TokenStudio } from "@/components/editor/TokenStudio";
import { ComponentDialog } from "@/components/canvas/ComponentDialog";
import { InspectorContextMenu } from "@/components/canvas/InspectorContextMenu";
import { FlowFrame } from "@/components/flow/FlowFrame";
import { FlowConnections } from "@/components/flow/FlowConnections";
import { ViewModeToggle, type CanvasMode } from "@/components/flow/ViewModeToggle";
import { ManifestoCard } from "@/components/strategy/ManifestoCard";
import { StrategyFlowCanvas } from "@/components/strategy/StrategyFlowCanvas";
import { initializeTestAPI, updateTestAPI } from "@/lib/ast/test-utils";
import { animateViewport, calculateCenteredViewport, calculateFitAllViewport } from "@/lib/canvas/viewport-animation";
import { calculateFlowLayout } from "@/lib/flow/auto-layout";
import type { CanvasTool, CanvasNode } from "@/lib/canvas/types";
import type { ContextMenuPayload } from "@/lib/inspection/types";
import type { FlowNodePosition } from "@/lib/flow/types";
import type { PreviewMode } from "@/lib/tokens";

type ViewMode = "app" | "design-system";

// Strategy layout defaults (world-space positions)
const DEFAULT_MANIFESTO_X = 100;
const DEFAULT_MANIFESTO_Y = 100;
const MANIFESTO_WIDTH = 600;

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

  // Frame expand state (fullscreen-like preview)
  const [isFrameExpanded, setIsFrameExpanded] = useState(false);
  const expandSavedViewport = useRef<ViewportState | null>(null);

  // Active route for prototype view (navigating from flow view)
  const [activeRoute, setActiveRoute] = useState("/");

  // Strategy state
  const strategyPhase = useStrategyStore((s) => s.phase);
  const manifestoData = useStrategyStore((s) => s.manifestoData);
  const streamingOverview = useStrategyStore((s) => s.streamingOverview);
  const flowData = useStrategyStore((s) => s.flowData);
  const completedPages = useStrategyStore((s) => s.completedPages);
  const currentBuildingPage = useStrategyStore((s) => s.currentBuildingPage);

  // Compute visible page IDs for progressive FlowFrame rendering
  const visiblePageIds = useMemo(() => {
    if (strategyPhase !== "building") return undefined; // Show all pages when not building
    const ids = new Set(completedPages);
    if (currentBuildingPage) ids.add(currentBuildingPage);
    return ids;
  }, [strategyPhase, completedPages, currentBuildingPage]);

  // State for auto-centering viewport on newly built pages
  const [centerOnPageId, setCenterOnPageId] = useState<string | null>(null);

  // Draggable overview card position (world-space)
  const [manifestoPos, setManifestoPos] = useState({ x: DEFAULT_MANIFESTO_X, y: DEFAULT_MANIFESTO_Y });
  // Y offset to push FlowFrames below strategy content during building
  const [flowLayoutOffset, setFlowLayoutOffset] = useState({ x: 0, y: 0 });
  // Derived flow offset — always to the right of the overview card
  const strategyFlowOffsetX = manifestoPos.x + MANIFESTO_WIDTH + 60;
  const strategyFlowOffsetY = manifestoPos.y;
  // Floating chat state (rect managed here for animation control)
  const [chatMode, setChatMode] = useState<"docked" | "floating">("floating");
  const [floatingRect, setFloatingRect] = useState({ x: 0, y: 0, width: 630, height: 720 });
  const [floatingAnimate, setFloatingAnimate] = useState(false);

  // Flow manifest parsed from /flow.json
  const flowManifest = useFlowManifest(files);

  // --- Unified viewport state (single viewport for both modes) ---
  const viewportRef = useRef<ViewportState>({ x: 0, y: 0, scale: 1 });
  const [viewport, setViewportInternal] = useState<ViewportState>({
    x: 0,
    y: 0,
    scale: 1,
  });

  const setViewport = useCallback((update: ViewportState | ((prev: ViewportState) => ViewportState)) => {
    setViewportInternal((prev) => {
      const newValue = typeof update === "function" ? update(prev) : update;
      viewportRef.current = newValue;
      return newValue;
    });
  }, []);

  // --- State absorbed from FlowCanvas ---

  // Store node positions (allows manual repositioning)
  const [nodePositions, setNodePositionsInternal] = useState<Map<string, FlowNodePosition>>(
    () => new Map()
  );
  const nodePositionsRef = useRef<Map<string, FlowNodePosition>>(new Map());
  const setNodePositions: typeof setNodePositionsInternal = useCallback((update) => {
    setNodePositionsInternal((prev) => {
      const newValue = typeof update === "function" ? update(prev) : update;
      nodePositionsRef.current = newValue;
      return newValue;
    });
  }, []);

  // Track which frame is active (receives inspection events, ring highlight)
  const [activeFrameId, setActiveFrameId] = useState<string | null>(null);

  // Track per-frame preview modes (independent light/dark toggle)
  const [framePreviewModes, setFramePreviewModes] = useState<Map<string, PreviewMode>>(
    () => new Map()
  );

  // Canvas dimensions for SVG connections
  const [canvasDimensions, setCanvasDimensions] = useState({ width: 800, height: 600 });

  // Container dimensions for viewport centering calculations
  const [containerDimensions, setContainerDimensions] = useState({ width: 800, height: 600 });

  // Canvas transition animation hook
  const transition = useCanvasTransition();

  // Derive activePageId from activeRoute + manifest
  const activePageId = useMemo(() => {
    const page = flowManifest.pages.find((p) => p.route === activeRoute);
    return page?.id ?? flowManifest.pages[0]?.id ?? null;
  }, [flowManifest.pages, activeRoute]);

  // Sync activeFrameId with activePageId in prototype mode
  useEffect(() => {
    if (canvasMode === "prototype" && activePageId) {
      setActiveFrameId(activePageId);
    }
  }, [canvasMode, activePageId]);

  // Callback to auto-switch to Design tab when element is selected
  // (FlowFrame auto-opens layers internally via selectedPageId prop)
  const handleElementSelected = useCallback(() => {
    setRightPanelTab("design");
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

  // Ref for infinite canvas inner container (for coordinate conversion in CanvasOverlay)
  const canvasContainerRef = useRef<HTMLDivElement>(null);

  // Ref for outer canvas wrapper (for dimension measurement)
  const canvasWrapperRef = useRef<HTMLDivElement>(null);

  // Coordinate canvas tool with inspection mode
  useEffect(() => {
    if (canvasTool.activeTool !== "cursor" && inspection.inspectionMode) {
      inspection.setInspectionMode(false);
    }
  }, [canvasTool.activeTool, inspection]);

  // --- Container dimensions ResizeObserver ---
  useEffect(() => {
    const container = canvasWrapperRef.current;
    if (!container) return;

    const updateDimensions = () => {
      setContainerDimensions({
        width: container.clientWidth,
        height: container.clientHeight,
      });
    };

    updateDimensions();

    const resizeObserver = new ResizeObserver(updateDimensions);
    resizeObserver.observe(container);

    return () => resizeObserver.disconnect();
  }, []);

  // --- Frame expand toggle: sets viewport + expanded state synchronously ---
  // Both state updates are batched by React into a single render, preventing
  // the frame from jumping off-screen (which happens if position overrides
  // before the viewport catches up via an async effect).
  const handleExpandToggle = useCallback(() => {
    if (!isFrameExpanded) {
      // Expanding: save viewport, snap to origin at scale 1
      expandSavedViewport.current = { ...viewportRef.current };
      setViewport({ x: 0, y: 0, scale: 1 });
    } else {
      // Collapsing: restore saved viewport
      if (expandSavedViewport.current) {
        setViewport(expandSavedViewport.current);
        expandSavedViewport.current = null;
      }
    }
    setIsFrameExpanded((prev) => !prev);
  }, [isFrameExpanded, setViewport]);

  // --- Flow navigation interception ---
  useFlowNavigation({
    canvasMode,
    manifest: flowManifest,
    nodePositions,
    viewport,
    onViewportChange: setViewport,
    containerDimensions,
  });

  // --- Calculate flow layout when manifest changes ---
  // Preserve existing positions for nodes the user may have dragged;
  // only auto-layout newly added nodes.
  useEffect(() => {
    const layout = calculateFlowLayout(flowManifest.pages, flowManifest.connections);

    setNodePositions((prev) => {
      const newMap = new Map(prev);
      for (const node of layout.nodes) {
        if (!newMap.has(node.id)) {
          newMap.set(node.id, {
            ...node,
            x: node.x + flowLayoutOffset.x,
            y: node.y + flowLayoutOffset.y,
          });
        }
      }
      // Remove nodes that no longer exist in manifest
      for (const id of newMap.keys()) {
        if (!layout.nodes.some((n) => n.id === id)) {
          newMap.delete(id);
        }
      }
      return newMap;
    });
    setCanvasDimensions({ width: layout.width, height: layout.height });
  }, [flowManifest, flowLayoutOffset]);

  // --- Auto-center on a specific page when centerOnPageId changes ---
  useEffect(() => {
    if (!centerOnPageId) return;

    const pos = nodePositions.get(centerOnPageId);
    if (!pos) return;

    const targetViewport = calculateCenteredViewport(
      { x: pos.x, y: pos.y, width: pos.width, height: pos.height },
      containerDimensions.width,
      containerDimensions.height
    );

    const cancel = animateViewport(viewport, targetViewport, setViewport, { duration: 400 });
    setCenterOnPageId(null);

    return cancel;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [centerOnPageId, nodePositions.size]);

  // --- Node drag handler (updates position in real-time) ---
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
      }

      return newMap;
    });

    // Expand canvas bounds separately (avoid side effects inside state updater)
    setCanvasDimensions((dims) => {
      const pos = nodePositionsRef.current.get(nodeId);
      if (!pos) return dims;
      return {
        width: Math.max(dims.width, pos.x + pos.width + 50),
        height: Math.max(dims.height, pos.y + pos.height + 100),
      };
    });
  }, []);

  // --- Node resize handler ---
  const handleNodeResize = useCallback((nodeId: string, width: number, height: number) => {
    setNodePositions((prev) => {
      const newMap = new Map(prev);
      const node = newMap.get(nodeId);

      if (node) {
        newMap.set(nodeId, { ...node, width, height });
      }

      return newMap;
    });

    // Expand canvas bounds separately (avoid side effects inside state updater)
    setCanvasDimensions((dims) => {
      const pos = nodePositionsRef.current.get(nodeId);
      if (!pos) return dims;
      return {
        width: Math.max(dims.width, pos.x + pos.width + 50),
        height: Math.max(dims.height, pos.y + pos.height + 100),
      };
    });
  }, []);

  // --- Frame activation handler ---
  const handleFrameActivate = useCallback((frameId: string) => {
    setActiveFrameId(frameId);
  }, []);

  // --- Per-frame preview mode change ---
  const handleFramePreviewModeChange = useCallback((frameId: string, mode: PreviewMode) => {
    setFramePreviewModes((prev) => {
      const newMap = new Map(prev);
      newMap.set(frameId, mode);
      return newMap;
    });
  }, []);

  // --- Memoized connections ---
  const connections = useMemo(() => flowManifest.connections, [flowManifest.connections]);

  // --- Flow frame states for multi-frame drop detection ---
  const flowFrameStates: FlowFrameDropState[] = useMemo(() => {
    return flowManifest.pages
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
  }, [flowManifest.pages, nodePositions]);

  // --- Visible pages / connections (progressive rendering during build) ---
  const visiblePages = useMemo(() => {
    if (!visiblePageIds) return flowManifest.pages;
    return flowManifest.pages.filter((p) => visiblePageIds.has(p.id));
  }, [flowManifest.pages, visiblePageIds]);

  const visibleConnections = useMemo(() => {
    if (!visiblePageIds) return connections;
    return connections.filter(
      (c) => visiblePageIds.has(c.from) && visiblePageIds.has(c.to)
    );
  }, [connections, visiblePageIds]);

  const visibleFlowFrameStates = useMemo(() => {
    if (!visiblePageIds) return flowFrameStates;
    return flowFrameStates.filter((s) => visiblePageIds.has(s.pageId));
  }, [flowFrameStates, visiblePageIds]);

  // --- Active frame state for CanvasOverlay (prototype mode drop detection) ---
  const activeFrameState: FrameState | undefined = useMemo(() => {
    if (!activePageId) return undefined;
    const pos = nodePositions.get(activePageId);
    if (!pos) return undefined;
    return { x: pos.x, y: pos.y, width: pos.width, height: pos.height };
  }, [activePageId, nodePositions]);

  // --- Strategy flow offset derived from manifesto position ---
  const manifestoX = manifestoPos.x;
  const manifestoY = manifestoPos.y;
  const buildingFlowOffsetX = manifestoX + 660;
  const buildingFlowOffsetY = manifestoY;

  // Handle component selection from dialog
  const handleComponentSelect = useCallback((componentType: string, defaultWidth: number, defaultHeight: number) => {
    const viewportCenterX = (-viewport.x + window.innerWidth / 2) / viewport.scale;
    const viewportCenterY = (-viewport.y + window.innerHeight / 2) / viewport.scale;

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
    canvasTool.setActiveTool("cursor");
  }, [viewport, canvasStore, canvasTool]);

  // Handle canvas mode change via ViewModeToggle
  const handleCanvasModeChange = useCallback((newMode: CanvasMode) => {
    // Collapse expanded frame and restore viewport if needed
    if (isFrameExpanded && expandSavedViewport.current) {
      setViewport(expandSavedViewport.current);
      expandSavedViewport.current = null;
    }
    setIsFrameExpanded(false);
    if (canvasMode === "flow" && newMode === "prototype") {
      // Flow → Prototype: set active route from currently active frame
      const activePage = flowManifest.pages.find((p) => p.id === activeFrameId);
      if (activePage) {
        setActiveRoute(activePage.route);
      }
    }
    // Animated transition for both directions (collapsing skips viewport animation)
    const currentActiveId = canvasMode === "prototype" ? activePageId : activeFrameId;
    if (currentActiveId) {
      transition.start(canvasMode, newMode, currentActiveId, nodePositions, viewport, setViewport, containerDimensions);
    }
    setCanvasMode(newMode);
  }, [canvasMode, isFrameExpanded, activePageId, activeFrameId, flowManifest.pages, transition, nodePositions, viewport, setViewport, containerDimensions]);

  // Unified materialization handler (works for both modes)
  const handleMaterialize = useCallback(
    async (node: CanvasNode, nodes: Map<string, CanvasNode>, iframeDropPoint: { x: number; y: number }, pageId?: string) => {
      if (!inspection.inspectionMode) return;

      // In prototype mode, always target the active page
      const targetPageId = pageId ?? activePageId ?? undefined;

      const result = await materializeNode(node, nodes, activeFrameState ?? { x: 0, y: 0, width: DEFAULT_FRAME_WIDTH, height: DEFAULT_FRAME_HEIGHT }, iframeDropPoint, targetPageId);

      if (result.success) {
        canvasStore.removeNode(node.id);
        console.log("[Materializer] Node materialized successfully:", node.type, "→ page:", targetPageId);
      } else {
        console.error("[Materializer] Failed to materialize node:", result.error);
      }
    },
    [materializeNode, activeFrameState, activePageId, canvasStore, inspection.inspectionMode]
  );

  // Handle tool change - open component dialog immediately when component tool is selected
  const handleToolChange = useCallback((tool: CanvasTool) => {
    if (tool === "component") {
      setComponentDialogOpen(true);
    } else {
      canvasTool.setActiveTool(tool);
    }
  }, [canvasTool]);

  // Debounced CSS hash to force Design System preview remount when theme changes
  const [cssHash, setCssHash] = useState(0);
  const cssContentRef = useRef(files["/globals.css"]);

  useEffect(() => {
    const currentCss = files["/globals.css"];

    if (currentCss === cssContentRef.current) return;
    cssContentRef.current = currentCss;

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
      if (!payload?.source) return;

      const iframes = document.querySelectorAll("iframe");
      let sourceIframe: HTMLIFrameElement | null = null;
      for (const iframe of iframes) {
        if (iframe.contentWindow === event.source) {
          sourceIframe = iframe;
          break;
        }
      }
      if (!sourceIframe) return;

      const iframeRect = sourceIframe.getBoundingClientRect();
      const scaleX = iframeRect.width / sourceIframe.clientWidth;
      const scaleY = iframeRect.height / sourceIframe.clientHeight;
      const screenX = iframeRect.left + payload.menuX * scaleX;
      const screenY = iframeRect.top + payload.menuY * scaleY;

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

  // --- Strategy Mode Handlers ---

  const handleHeroSubmit = useCallback(() => {
    // Phase transition already handled by ChatTab + strategy store
  }, []);

  // Center the floating chat on mount for hero phase
  useEffect(() => {
    if (strategyPhase === "hero") {
      setFloatingRect({
        x: (window.innerWidth - 630) / 2,
        y: (window.innerHeight - 720) / 2,
        width: 630,
        height: 720,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Mount only

  // Animate viewport when overview starts appearing (streaming or final) + slide floating chat beside it
  const hasAnimatedToOverview = useRef(false);
  useEffect(() => {
    const showOverview = manifestoData || streamingOverview;
    if (strategyPhase === "manifesto" && showOverview && !hasAnimatedToOverview.current) {
      hasAnimatedToOverview.current = true;

      const overviewWidth = 600;
      const chatWidth = 630;
      const chatHeight = 720;
      const gap = 20;
      const combinedWidth = overviewWidth + gap + chatWidth;

      const screenW = window.innerWidth;
      const screenH = window.innerHeight;

      const targetViewport = {
        x: (screenW - combinedWidth) / 2 - manifestoPos.x,
        y: (screenH - chatHeight) / 2 - manifestoPos.y,
        scale: 1,
      };
      animateViewport(viewport, targetViewport, setViewport, { duration: 400 });

      const chatScreenX = (screenW - combinedWidth) / 2 + overviewWidth + gap;
      const chatScreenY = (screenH - chatHeight) / 2;

      setFloatingAnimate(true);
      setFloatingRect((prev) => ({
        ...prev,
        x: chatScreenX,
        y: chatScreenY,
      }));
      const timer = setTimeout(() => setFloatingAnimate(false), 500);
      return () => clearTimeout(timer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manifestoData !== null || streamingOverview !== null, strategyPhase === "manifesto"]);

  // Animate viewport when strategy flow appears + slide floating chat beside flow
  useEffect(() => {
    if (strategyPhase === "flow" && flowData) {
      const nodeCount = flowData.nodes.length;
      const estimatedFlowWidth = Math.max(520, nodeCount * 260);
      const estimatedFlowHeight = Math.max(200, Math.ceil(nodeCount / 3) * 180);
      const chatWidth = 630;
      const chatHeight = 720;
      const gap = 20;

      const totalWorldWidth = (strategyFlowOffsetX - manifestoPos.x) + estimatedFlowWidth;
      const combinedWidth = totalWorldWidth + gap + chatWidth;

      const screenW = window.innerWidth;
      const screenH = window.innerHeight;

      const scale = Math.min(1, (screenW - 80) / combinedWidth);

      const contentHeight = Math.max(estimatedFlowHeight, chatHeight / scale);
      const targetViewport = {
        x: (screenW - combinedWidth * scale) / 2 - manifestoPos.x * scale,
        y: (screenH - contentHeight * scale) / 2 - manifestoPos.y * scale,
        scale,
      };
      animateViewport(viewport, targetViewport, setViewport, { duration: 400 });

      const flowScreenRight =
        (strategyFlowOffsetX + estimatedFlowWidth) * scale + targetViewport.x + gap;
      const chatScreenY = (screenH - chatHeight) / 2;

      setFloatingAnimate(true);
      setFloatingRect((prev) => ({
        ...prev,
        x: flowScreenRight,
        y: chatScreenY,
      }));
      const timer = setTimeout(() => setFloatingAnimate(false), 500);
      return () => clearTimeout(timer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flowData !== null && strategyPhase === "flow"]);

  const handlePhaseAction = useCallback((action: "approve-manifesto" | "approve-flow") => {
    if (action === "approve-manifesto") {
      useStrategyStore.getState().setPhase("flow");
    } else if (action === "approve-flow") {
      const currentFlowData = useStrategyStore.getState().flowData;
      if (currentFlowData) {
        const pageNodes = currentFlowData.nodes.filter((n) => n.type === "page");
        const flowJson = {
          pages: pageNodes.map((node, index) => ({
            id: node.id,
            name: node.label,
            route: index === 0 ? "/" : `/${node.id}`,
          })),
          connections: currentFlowData.connections
            .filter(
              (c) =>
                pageNodes.some((n) => n.id === c.from) &&
                pageNodes.some((n) => n.id === c.to)
            )
            .map((c) => ({
              from: c.from,
              to: c.to,
              label: c.label,
            })),
        };

        writeFile("/flow.json", JSON.stringify(flowJson, null, 2));
      }

      useStrategyStore.getState().setPhase("building");
      setCanvasMode("flow");

      // Position FlowFrames below strategy content (keep manifesto in place)
      const strategyBottom = manifestoPos.y + 700; // generous height estimate for manifesto + strategy flow
      const flowYOffset = strategyBottom + 120;     // 120px gap below strategy content
      setFlowLayoutOffset({ x: manifestoPos.x - 50, y: flowYOffset - 50 }); // subtract auto-layout MARGIN(50)

      // Dock the chat panel to the sidebar for building phase
      setChatMode("docked");

      // Animate viewport to show strategy content + first FlowFrame area
      requestAnimationFrame(() => {
        const rects = [
          { x: manifestoPos.x, y: manifestoPos.y, width: MANIFESTO_WIDTH, height: 600 },
          { x: manifestoPos.x, y: flowYOffset, width: DEFAULT_FRAME_WIDTH, height: DEFAULT_FRAME_HEIGHT },
        ];
        const target = calculateFitAllViewport(rects, containerDimensions.width, containerDimensions.height);
        animateViewport(viewportRef.current, target, setViewport, { duration: 500 });
      });
    }
  }, [writeFile, setViewport, manifestoPos, containerDimensions]);

  // Handle "Approve & Build Next Page" — animate viewport to the next page's FlowFrame
  const handleApproveAndBuildNext = useCallback((nextPageId: string) => {
    setCenterOnPageId(nextPageId);
  }, []);

  // --- Floating Chat Handlers ---

  const handlePopOut = useCallback(() => {
    setChatMode("floating");
    setFloatingRect({
      x: window.innerWidth - 650,
      y: 80,
      width: 630,
      height: 720,
    });
  }, []);

  const handleDock = useCallback(() => {
    setChatMode("docked");
  }, []);

  // Determine if we're in an early strategy phase (no Sandpack needed)
  const isEarlyStrategyPhase = strategyPhase === "hero" || strategyPhase === "manifesto" || strategyPhase === "flow";
  // Hide RightPanel during hero phase, and during early strategy phases when chat is floating (no Design tab)
  const showRightPanel = strategyPhase !== "hero" && !(isEarlyStrategyPhase && chatMode === "floating");
  const showNav = strategyPhase !== "hero";

  // --- Frame visibility helpers ---
  const isFrameVisible = useCallback((pageId: string): boolean => {
    if (transition.isTransitioning) return true; // During transition, opacity is controlled by transitionStyle
    if (canvasMode === "flow") return true;
    // Prototype mode: only active page visible
    return pageId === activePageId;
  }, [transition.isTransitioning, canvasMode, activePageId]);

  const getTransitionStyle = useCallback((pageId: string): React.CSSProperties | undefined => {
    if (!transition.isTransitioning) return undefined;
    const target = transition.frameTargets.get(pageId);
    if (!target) return undefined;
    const isActive = pageId === activePageId;
    return {
      opacity: target.opacity,
      transform: `translate(${target.translateX}px, ${target.translateY}px) scale(${target.scale})`,
      transition: "opacity 300ms ease-out, transform 300ms ease-out",
      pointerEvents: isActive ? "auto" as const : "none" as const,
      transformOrigin: "center center",
    };
  }, [transition.isTransitioning, transition.frameTargets, activePageId]);

  // Determine which frame is "active" (ring highlight + inspection)
  const isFrameActive = useCallback((pageId: string): boolean => {
    if (canvasMode === "prototype") return pageId === activePageId;
    return pageId === activeFrameId;
  }, [canvasMode, activePageId, activeFrameId]);

  // Determine connection opacity (fades in/out during transitions)
  const connectionOpacity = transition.isTransitioning ? transition.connectionOpacity : (canvasMode === "flow" ? 1 : 0);

  return (
    <main className="w-screen h-screen overflow-hidden flex flex-col">
      {/* Top Navigation Bar - hidden during hero phase */}
      {showNav && (
        <nav className="h-12 bg-white border-b border-neutral-200 flex items-center justify-between px-4 shrink-0">
          <div className="flex items-center gap-1">
            <span className="font-semibold text-neutral-800 mr-4">Novum</span>

            {/* Back button when viewing Design System */}
            {viewMode === "design-system" && (
              <button
                onClick={() => setViewMode("app")}
                className="flex items-center gap-1 px-2 py-1.5 text-sm text-neutral-600 hover:text-neutral-900 transition-colors"
              >
                ← Back
              </button>
            )}

            {/* Phase indicator during strategy phases */}
            {isEarlyStrategyPhase && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-neutral-500">
                  {strategyPhase === "manifesto" && "Defining Overview"}
                  {strategyPhase === "flow" && "Designing Architecture"}
                </span>
              </div>
            )}
          </div>

          {/* Design System button on far right */}
          {!isEarlyStrategyPhase && viewMode === "app" && (
            <button
              onClick={() => setViewMode("design-system")}
              className="px-3 py-1.5 text-sm font-medium text-neutral-600 hover:text-neutral-900 border border-neutral-300 rounded-md hover:border-neutral-400 transition-colors"
            >
              Design System
            </button>
          )}
        </nav>
      )}

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Unified Canvas (App mode) — single InfiniteCanvas for all phases */}
        <div
          ref={canvasWrapperRef}
          className={`flex-1 h-full min-h-0 relative isolate ${viewMode !== "app" ? "hidden" : ""}`}
        >
          <InfiniteCanvas
            ref={canvasContainerRef}
            viewport={viewport}
            onViewportChange={setViewport}
            activeTool={isEarlyStrategyPhase ? "cursor" : canvasTool.activeTool}
            onToolChange={isEarlyStrategyPhase ? undefined : handleToolChange}
            isDrawingActive={isEarlyStrategyPhase ? false : canvasTool.drawState.isDrawing}
            onCanvasClick={() => canvasStore.deselectAll()}
            hideChrome={isFrameExpanded}
          >
            {/* Strategy artifacts — always visible once created */}
            {(manifestoData || streamingOverview) && (
              <ManifestoCard
                manifestoData={manifestoData || streamingOverview!}
                x={manifestoPos.x}
                y={manifestoPos.y}
                onMove={(nx, ny) => setManifestoPos({ x: nx, y: ny })}
              />
            )}
            {flowData && (
              <StrategyFlowCanvas
                flowData={flowData}
                offsetX={isEarlyStrategyPhase ? strategyFlowOffsetX : buildingFlowOffsetX}
                offsetY={isEarlyStrategyPhase ? strategyFlowOffsetY : buildingFlowOffsetY}
              />
            )}

            {/* FlowConnections — visible in flow mode, fades in/out during transitions */}
            {!isEarlyStrategyPhase && (connectionOpacity > 0 || transition.isTransitioning) && (
              <FlowConnections
                connections={visibleConnections}
                nodePositions={nodePositions}
                width={canvasDimensions.width}
                height={canvasDimensions.height}
                style={{
                  opacity: connectionOpacity,
                  transition: "opacity 200ms",
                }}
              />
            )}

            {/* All page FlowFrames — always mounted for instant switching */}
            {!isEarlyStrategyPhase && visiblePages.map((page) => {
              const basePosition = nodePositions.get(page.id);
              if (!basePosition) return null;

              const isThisFrameExpanded = isFrameExpanded && canvasMode === "prototype" && page.id === activePageId;
              // When expanded, override position to fill the canvas area at viewport origin
              const position = isThisFrameExpanded
                ? { ...basePosition, x: 0, y: 0, width: containerDimensions.width, height: containerDimensions.height - 36 }
                : basePosition;

              const framePreviewMode = framePreviewModes.get(page.id) ?? tokenState.previewMode;

              return (
                <FlowFrame
                  key={page.id}
                  page={page}
                  position={position}
                  files={shadowFiles}
                  previewMode={framePreviewMode}
                  inspectionMode={inspection.inspectionMode}
                  isActive={isFrameActive(page.id)}
                  onActivate={handleFrameActivate}
                  onDrag={handleNodeDrag}
                  onResize={handleNodeResize}
                  canvasScale={viewport.scale}
                  onPreviewModeChange={handleFramePreviewModeChange}
                  onInspectionModeChange={inspection.setInspectionMode}
                  flowModeActive={canvasMode === "flow"}
                  isVisible={isFrameVisible(page.id)}
                  transitionStyle={getTransitionStyle(page.id)}
                  selectedPageId={inspection.selectedElement?.pageId}
                  selectedSelector={inspection.selectedElement?.selector}
                  animateEntrance={strategyPhase === "building"}
                  isExpanded={isThisFrameExpanded || undefined}
                  onExpandToggle={canvasMode === "prototype" && page.id === activePageId ? handleExpandToggle : undefined}
                  forceStreamingOverlay={canvasMode === "prototype" && page.id === activePageId ? true : undefined}
                />
              );
            })}

            {/* Canvas Overlay — drawing layer for ghost elements */}
            {!isEarlyStrategyPhase && (
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
                frameState={canvasMode === "prototype" ? activeFrameState : undefined}
                flowFrameStates={canvasMode === "flow" ? visibleFlowFrameStates : undefined}
                onMaterialize={handleMaterialize}
                inspectionMode={inspection.inspectionMode}
              />
            )}
          </InfiniteCanvas>

          {/* ViewModeToggle — fixed position in canvas UI layer */}
          {!isEarlyStrategyPhase && !isFrameExpanded && (
            <ViewModeToggle
              mode={canvasMode}
              onModeChange={handleCanvasModeChange}
              className="absolute bottom-4 left-4 z-20"
            />
          )}
        </div>

        {/* Design System: Full-width preview */}
        <div className={`flex-1 h-full ${viewMode !== "design-system" || isEarlyStrategyPhase ? "hidden" : ""}`}>
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

        {/* Right Panel - always mounted to preserve state, hidden during hero phase */}
        <RightPanel
          writeFile={writeFile}
          files={files}
          selectedElement={inspection.selectedElement}
          inspectionMode={inspection.inspectionMode}
          activeTab={rightPanelTab}
          onTabChange={setRightPanelTab}
          onSelectedElementSourceUpdate={inspection.updateSelectedElementSource}
          onClearSelection={inspection.clearSelection}
          canvasMode={canvasMode}
          strategyPhase={strategyPhase}
          onPhaseAction={handlePhaseAction}
          className={`shrink-0 ${
            !showRightPanel || viewMode !== "app"
              ? chatMode === "floating"
                ? "w-0 min-w-0 overflow-hidden"
                : "hidden"
              : ""
          }`}
          chatFloating={chatMode === "floating"}
          onPopOut={handlePopOut}
          onDock={handleDock}
          floatingRect={floatingRect}
          onFloatingMove={(nx, ny) => setFloatingRect((prev) => ({ ...prev, x: nx, y: ny }))}
          onFloatingResize={(nw, nh) => setFloatingRect((prev) => ({ ...prev, width: nw, height: nh }))}
          floatingAnimate={floatingAnimate}
          onHeroSubmit={handleHeroSubmit}
          onApproveAndBuildNext={handleApproveAndBuildNext}
        />

        {/* Token Studio - only shown in design-system mode */}
        {viewMode === "design-system" && !isEarlyStrategyPhase && (
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
