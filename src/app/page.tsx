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
import { ManifestoCard } from "@/components/strategy/ManifestoCard";
import { PersonaCard } from "@/components/strategy/PersonaCard";
import { WireframeCard, WIREFRAME_CARD_WIDTH, WIREFRAME_CARD_HEIGHT } from "@/components/strategy/WireframeCard";
import { StrategyFlowCanvas } from "@/components/strategy/StrategyFlowCanvas";
import { initializeTestAPI, updateTestAPI } from "@/lib/ast/test-utils";
import { PublishDialog } from "@/components/editor/PublishDialog";
import { Smartphone, GitBranch, Share } from "lucide-react";
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
const PERSONA_CARD_WIDTH = 320;
const PERSONA_GAP = 20;

export default function Home() {
  const { files, writeFile } = useVirtualFiles();

  // Generate shadow files with data-source-loc attributes for Sandpack
  // Clean files remain pristine for editing in RightPanel
  const { shadowFiles } = useInstrumentedFiles(files);

  const tokenState = useTokens({ files, writeFile });
  const [viewMode, setViewMode] = useState<ViewMode>("app");
  const [rightPanelTab, setRightPanelTab] = useState<RightPanelTab>("chat");

  // Frame expand state (fullscreen-like preview)
  const [isFrameExpanded, setIsFrameExpanded] = useState(false);
  const expandSavedViewport = useRef<ViewportState | null>(null);

  // Active route for prototype view (navigating from flow view)
  const [activeRoute, setActiveRoute] = useState("/");

  // Strategy state
  const strategyPhase = useStrategyStore((s) => s.phase);
  const manifestoData = useStrategyStore((s) => s.manifestoData);
  const streamingOverview = useStrategyStore((s) => s.streamingOverview);
  const personaData = useStrategyStore((s) => s.personaData);
  const streamingPersonas = useStrategyStore((s) => s.streamingPersonas);
  const flowData = useStrategyStore((s) => s.flowData);
  const wireframeData = useStrategyStore((s) => s.wireframeData);
  const streamingWireframes = useStrategyStore((s) => s.streamingWireframes);
  const completedPages = useStrategyStore((s) => s.completedPages);
  const currentBuildingPage = useStrategyStore((s) => s.currentBuildingPage);

  // Compute visible page IDs for progressive FlowFrame rendering
  const visiblePageIds = useMemo(() => {
    if (strategyPhase !== "building") return undefined; // Show all pages when not building (including wireframe)
    const ids = new Set(completedPages);
    if (currentBuildingPage) ids.add(currentBuildingPage);
    return ids;
  }, [strategyPhase, completedPages, currentBuildingPage]);

  // State for auto-centering viewport on newly built pages
  const [centerOnPageId, setCenterOnPageId] = useState<string | null>(null);

  // Draggable overview card position (world-space)
  const [manifestoPos, setManifestoPos] = useState({ x: DEFAULT_MANIFESTO_X, y: DEFAULT_MANIFESTO_Y });
  // Persona card positions (world-space, to the right of manifesto)
  const defaultPersonaX = DEFAULT_MANIFESTO_X + MANIFESTO_WIDTH + 40;
  const [personaPositions, setPersonaPositions] = useState([
    { x: defaultPersonaX, y: DEFAULT_MANIFESTO_Y },
    { x: defaultPersonaX + PERSONA_CARD_WIDTH + PERSONA_GAP, y: DEFAULT_MANIFESTO_Y },
  ]);
  // Active wireframe data (streaming or final)
  const activeWireframeData = wireframeData || streamingWireframes;

  // Wireframe card positions (world-space, below strategy flow)
  const WIREFRAME_GAP = 20;
  const [wireframePositions, setWireframePositions] = useState<{ x: number; y: number }[]>([]);

  // Y offset to push FlowFrames below strategy content during building
  const [flowLayoutOffset, setFlowLayoutOffset] = useState({ x: 0, y: 0 });
  // Derived flow offset — always to the right of the overview card (accounting for persona cards)
  const personasRightEdge = personaPositions[1].x + PERSONA_CARD_WIDTH;
  const strategyFlowOffsetX = Math.max(manifestoPos.x + MANIFESTO_WIDTH + 60, personasRightEdge + 40);
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
  const architecturePositionsRef = useRef<Map<string, FlowNodePosition> | null>(null);
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

  // Derive activePageId from activeRoute + manifest
  const activePageId = useMemo(() => {
    const page = flowManifest.pages.find((p) => p.route === activeRoute);
    return page?.id ?? flowManifest.pages[0]?.id ?? null;
  }, [flowManifest.pages, activeRoute]);

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
  const [publishDialogOpen, setPublishDialogOpen] = useState(false);

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

  // --- Prototype toggle: expands active frame to fill canvas (or collapses back to flow) ---
  const handlePrototypeToggle = useCallback(() => {
    if (isFrameExpanded) {
      // Collapsing: restore saved viewport
      if (expandSavedViewport.current) {
        setViewport(expandSavedViewport.current);
        expandSavedViewport.current = null;
      }
      setIsFrameExpanded(false);

      // Reset all iframes to their correct start routes.
      // Navigation in Prototype View changes the active iframe's hash,
      // and Sandpack's shared bundler can propagate this to all iframes.
      setTimeout(() => {
        flowManifest.pages.forEach((page) => {
          const container = document.querySelector(`[data-flow-page-id="${page.id}"]`);
          const iframe = container?.querySelector<HTMLIFrameElement>('iframe[title="Sandpack Preview"]');
          if (iframe?.contentWindow) {
            iframe.contentWindow.postMessage(
              { type: "novum:navigate-to", payload: { route: page.route } },
              "*"
            );
          }
        });
      }, 150);
    } else {
      // Expanding: determine which frame to expand
      const targetId = activeFrameId ?? flowManifest.pages.find(p => p.route === "/")?.id ?? flowManifest.pages[0]?.id;
      if (targetId) {
        setActiveFrameId(targetId);
        const page = flowManifest.pages.find(p => p.id === targetId);
        if (page) setActiveRoute(page.route);
        expandSavedViewport.current = { ...viewportRef.current };
        setViewport({ x: 0, y: 0, scale: 1 });
        setIsFrameExpanded(true);
      }
    }
  }, [isFrameExpanded, activeFrameId, flowManifest.pages, setViewport]);

  // --- Global Escape key to collapse expanded frame ---
  useEffect(() => {
    if (!isFrameExpanded) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        handlePrototypeToggle();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isFrameExpanded, handlePrototypeToggle]);

  // --- Flow navigation interception ---
  useFlowNavigation({
    isExpanded: isFrameExpanded,
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
          // During building, prefer the architecture snapshot position (preserves full-layout positioning)
          const snapshotPos = architecturePositionsRef.current?.get(node.id);
          if (snapshotPos) {
            newMap.set(node.id, snapshotPos);
          } else {
            newMap.set(node.id, {
              ...node,
              x: node.x + flowLayoutOffset.x,
              y: node.y + flowLayoutOffset.y,
            });
          }
        }
      }
      // Remove nodes that no longer exist in manifest — skip during building phase
      // because visiblePageIds already controls rendering and AI may temporarily
      // overwrite flow.json with fewer pages
      if (strategyPhase !== "building") {
        for (const id of newMap.keys()) {
          if (!layout.nodes.some((n) => n.id === id)) {
            newMap.delete(id);
          }
        }
      }
      return newMap;
    });
    setCanvasDimensions({ width: layout.width, height: layout.height });
  }, [flowManifest, flowLayoutOffset, strategyPhase]);

  // Snapshot architecture positions when entering building phase so that
  // partial flow.json rewrites don't cause position recalculation.
  useEffect(() => {
    if (strategyPhase === "building" && !architecturePositionsRef.current) {
      const id = requestAnimationFrame(() => {
        architecturePositionsRef.current = new Map(nodePositionsRef.current);
      });
      return () => cancelAnimationFrame(id);
    }
    if (strategyPhase !== "building") {
      architecturePositionsRef.current = null;
    }
  }, [strategyPhase]);

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

  // Handle navigation in Prototype View.
  // When the iframe's Router intercepts a navigation (because __novumFlowModeActive
  // may still be true due to broadcast timing), it posts novum:navigation-intent.
  // We forward this to the active iframe via novum:navigate-to so navigation
  // happens within the same frame — no FlowFrame switch, no dissolve effect.
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (!event.data) return;

      if (event.data.type === "novum:navigation-intent" && isFrameExpanded) {
        const { targetRoute } = event.data.payload as { targetRoute: string };
        if (!targetRoute) return;

        // Send navigate-to message to the active iframe
        const frameId = activeFrameId ?? activePageId;
        const container = document.querySelector(`[data-flow-page-id="${frameId}"]`);
        const iframe = container?.querySelector<HTMLIFrameElement>('iframe[title="Sandpack Preview"]');
        if (iframe?.contentWindow) {
          iframe.contentWindow.postMessage(
            { type: "novum:navigate-to", payload: { route: targetRoute } },
            "*"
          );
        }
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [isFrameExpanded, activeFrameId, activePageId]);

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

  // Animate viewport when personas appear + slide floating chat beside them
  const hasAnimatedToPersonas = useRef(false);
  useEffect(() => {
    const showPersonas = personaData || streamingPersonas;
    if (strategyPhase === "persona" && showPersonas && !hasAnimatedToPersonas.current) {
      hasAnimatedToPersonas.current = true;

      const chatWidth = 630;
      const chatHeight = 720;
      const gap = 20;

      // Total world width: manifesto + gap + two persona cards
      const personasWorldRight = personaPositions[1].x + PERSONA_CARD_WIDTH;
      const totalWorldWidth = personasWorldRight - manifestoPos.x;
      const combinedWidth = totalWorldWidth + gap + chatWidth;

      const screenW = window.innerWidth;
      const screenH = window.innerHeight;

      const scale = Math.min(1, (screenW - 80) / combinedWidth);

      const targetViewport = {
        x: (screenW - combinedWidth * scale) / 2 - manifestoPos.x * scale,
        y: (screenH - chatHeight) / 2 - manifestoPos.y * scale,
        scale,
      };
      animateViewport(viewport, targetViewport, setViewport, { duration: 400 });

      const chatScreenX = (screenW - combinedWidth * scale) / 2 + totalWorldWidth * scale + gap;
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
  }, [personaData !== null || streamingPersonas !== null, strategyPhase === "persona"]);

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

  // Incrementally position wireframe cards as they stream in
  useEffect(() => {
    if (strategyPhase !== "wireframe" || !activeWireframeData) return;

    const pageCount = activeWireframeData.pages.length;
    const startX = strategyFlowOffsetX;
    const startY = strategyFlowOffsetY + 300; // below strategy flow

    setWireframePositions((prev) => {
      if (prev.length >= pageCount) return prev;
      const positions = [...prev];
      for (let i = prev.length; i < pageCount; i++) {
        positions.push({
          x: startX + i * (WIREFRAME_CARD_WIDTH + WIREFRAME_GAP),
          y: startY,
        });
      }
      return positions;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeWireframeData?.pages.length, strategyPhase]);

  // Animate viewport on first wireframe appearance (streaming or final)
  const hasAnimatedToWireframes = useRef(false);
  useEffect(() => {
    if (strategyPhase !== "wireframe" || !activeWireframeData || hasAnimatedToWireframes.current) return;
    hasAnimatedToWireframes.current = true;

    const startX = strategyFlowOffsetX;
    const startY = strategyFlowOffsetY + 300;
    const cardTotalHeight = WIREFRAME_CARD_HEIGHT + 36;
    // Estimate width for the number of pages we expect (at least what we have so far)
    const estWidth = Math.max(1, activeWireframeData.pages.length) * WIREFRAME_CARD_WIDTH
      + Math.max(0, activeWireframeData.pages.length - 1) * WIREFRAME_GAP;
    const rects = [
      { x: manifestoPos.x, y: manifestoPos.y, width: MANIFESTO_WIDTH, height: 400 },
      { x: startX, y: startY, width: estWidth, height: cardTotalHeight },
    ];
    const target = calculateFitAllViewport(rects, containerDimensions.width, containerDimensions.height);
    animateViewport(viewportRef.current, target, setViewport, { duration: 400 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeWireframeData !== null && strategyPhase === "wireframe"]);

  // Final fit-all animation when all wireframes are complete
  useEffect(() => {
    if (strategyPhase !== "wireframe" || !wireframeData) return;

    const pageCount = wireframeData.pages.length;
    const startX = strategyFlowOffsetX;
    const startY = strategyFlowOffsetY + 300;
    const totalWidth = pageCount * WIREFRAME_CARD_WIDTH + (pageCount - 1) * WIREFRAME_GAP;
    const cardTotalHeight = WIREFRAME_CARD_HEIGHT + 36;
    const rects = [
      { x: manifestoPos.x, y: manifestoPos.y, width: MANIFESTO_WIDTH, height: 400 },
      { x: startX, y: startY, width: totalWidth, height: cardTotalHeight },
    ];
    const target = calculateFitAllViewport(rects, containerDimensions.width, containerDimensions.height);
    animateViewport(viewportRef.current, target, setViewport, { duration: 400 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wireframeData !== null && strategyPhase === "wireframe"]);

  const handlePhaseAction = useCallback((action: "approve-manifesto" | "approve-persona" | "approve-flow" | "approve-wireframe") => {
    if (action === "approve-manifesto") {
      useStrategyStore.getState().setPhase("persona");
    } else if (action === "approve-persona") {
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

      // Transition to wireframe phase (not building)
      useStrategyStore.getState().setPhase("wireframe");

      // Dock the chat panel to the sidebar for wireframe phase
      setChatMode("docked");
    } else if (action === "approve-wireframe") {
      // Wireframe data is already in the store (set by ChatTab's JSON extraction)
      // ChatTab will serialize it as text context when sending the first build message
      useStrategyStore.getState().setPhase("building");

      // Step 1: Compute strategyBottom dynamically from all strategy elements
      const strategyBottom = Math.max(
        manifestoPos.y + 500,
        ...personaPositions.map(p => p.y + 500),
        strategyFlowOffsetY + 400,
        ...(wireframePositions.length > 0
          ? wireframePositions.map(p => p.y + WIREFRAME_CARD_HEIGHT + 36)
          : [0]),
      );

      const flowYOffset = strategyBottom + 120;
      const offsetX = manifestoPos.x - 50;
      const offsetY = flowYOffset - 50;
      setFlowLayoutOffset({ x: offsetX, y: offsetY });

      // Step 2: Apply offset to ALL existing node positions
      // The layout effect skips nodes already in nodePositions, so we must
      // offset them directly here.
      const offsetPositions = new Map<string, FlowNodePosition>();
      for (const [id, pos] of nodePositionsRef.current) {
        offsetPositions.set(id, {
          ...pos,
          x: pos.x + offsetX,
          y: pos.y + offsetY,
        });
      }
      setNodePositions(offsetPositions);

      // Step 3: Eagerly set the architecture snapshot so that subsequent pages
      // added during building get correctly-offset positions from this snapshot.
      // The existing effect's `!architecturePositionsRef.current` guard prevents overwrite.
      architecturePositionsRef.current = offsetPositions;

      // Step 4: Animate viewport to show strategy content + first FlowFrame area
      requestAnimationFrame(() => {
        const rects = [
          { x: manifestoPos.x, y: manifestoPos.y, width: MANIFESTO_WIDTH, height: strategyBottom - manifestoPos.y },
          { x: offsetX, y: flowYOffset, width: DEFAULT_FRAME_WIDTH, height: DEFAULT_FRAME_HEIGHT },
        ];
        const target = calculateFitAllViewport(rects, containerDimensions.width, containerDimensions.height);
        animateViewport(viewportRef.current, target, setViewport, { duration: 500 });
      });
    }
  }, [writeFile, setViewport, manifestoPos, containerDimensions, wireframePositions, personaPositions, strategyFlowOffsetY, setNodePositions]);

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
  const isEarlyStrategyPhase = strategyPhase === "hero" || strategyPhase === "manifesto" || strategyPhase === "persona" || strategyPhase === "flow" || strategyPhase === "wireframe";
  // Hide RightPanel during hero phase, and during early strategy phases when chat is floating (no Design tab)
  const showRightPanel = strategyPhase !== "hero" && !(isEarlyStrategyPhase && chatMode === "floating");
  const showNav = strategyPhase !== "hero";

  // --- Frame visibility helpers ---
  // Use activeFrameId (not activePageId) so that in-iframe navigation
  // doesn't switch the visible FlowFrame (avoids dissolve effect).
  const expandedFrameId = activeFrameId ?? activePageId;
  const isFrameVisible = useCallback((pageId: string): boolean => {
    if (isFrameExpanded) return pageId === expandedFrameId;
    return true; // All frames always visible in flow mode
  }, [isFrameExpanded, expandedFrameId]);

  // Determine which frame is "active" (ring highlight + inspection)
  const isFrameActive = useCallback((pageId: string): boolean => {
    return pageId === activeFrameId;
  }, [activeFrameId]);

  // Connections hidden when a frame is expanded
  const connectionOpacity = isFrameExpanded ? 0 : 1;

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
                  {strategyPhase === "persona" && "Defining Personas"}
                  {strategyPhase === "flow" && "Designing Architecture"}
                  {strategyPhase === "wireframe" && "Creating Wireframes"}
                </span>
              </div>
            )}
          </div>

          {/* Action buttons on far right */}
          {!isEarlyStrategyPhase && viewMode === "app" && (
            <div className="flex items-center gap-2">
              <button
                onClick={handlePrototypeToggle}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-neutral-600 hover:text-neutral-900 border border-neutral-300 rounded-md hover:border-neutral-400 transition-colors"
              >
                {isFrameExpanded ? (
                  <>
                    <GitBranch className="w-4 h-4" />
                    Flow
                  </>
                ) : (
                  <>
                    <Smartphone className="w-4 h-4" />
                    Prototype
                  </>
                )}
              </button>
              <button
                onClick={() => setViewMode("design-system")}
                className="px-3 py-1.5 text-sm font-medium text-neutral-600 hover:text-neutral-900 border border-neutral-300 rounded-md hover:border-neutral-400 transition-colors"
              >
                Design System
              </button>
              <button
                onClick={() => setPublishDialogOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-neutral-600 hover:text-neutral-900 border border-neutral-300 rounded-md hover:border-neutral-400 transition-colors"
              >
                <Share className="w-4 h-4" />
                Publish
              </button>
            </div>
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
            {(personaData || streamingPersonas) && (personaData || streamingPersonas)!.map((persona, index) => (
              <PersonaCard
                key={index}
                persona={persona}
                x={personaPositions[index]?.x ?? defaultPersonaX + index * (PERSONA_CARD_WIDTH + PERSONA_GAP)}
                y={personaPositions[index]?.y ?? DEFAULT_MANIFESTO_Y}
                index={index}
                onMove={(nx, ny) => setPersonaPositions((prev) => {
                  const updated = [...prev];
                  updated[index] = { x: nx, y: ny };
                  return updated;
                })}
              />
            ))}
            {flowData && (
              <StrategyFlowCanvas
                flowData={flowData}
                offsetX={isEarlyStrategyPhase ? strategyFlowOffsetX : buildingFlowOffsetX}
                offsetY={isEarlyStrategyPhase ? strategyFlowOffsetY : buildingFlowOffsetY}
              />
            )}

            {/* Wireframe Cards — rendered during wireframe phase (streaming or final) */}
            {activeWireframeData && wireframePositions.length > 0 && activeWireframeData.pages.map((page, index) => (
              <WireframeCard
                key={page.id}
                page={page}
                x={wireframePositions[index]?.x ?? 0}
                y={wireframePositions[index]?.y ?? 0}
                onMove={(nx, ny) => setWireframePositions((prev) => {
                  const updated = [...prev];
                  updated[index] = { x: nx, y: ny };
                  return updated;
                })}
              />
            ))}

            {/* FlowConnections — visible when not expanded */}
            {!isEarlyStrategyPhase && connectionOpacity > 0 && (
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

              const isThisFrameExpanded = isFrameExpanded && page.id === expandedFrameId;
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
                  flowModeActive={!isFrameExpanded}
                  isVisible={isFrameVisible(page.id)}
                  selectedPageId={inspection.selectedElement?.pageId}
                  selectedSelector={inspection.selectedElement?.selector}
                  animateEntrance={strategyPhase === "building"}
                  isExpanded={isThisFrameExpanded || undefined}
                  forceStreamingOverlay={isThisFrameExpanded || undefined}
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
                frameState={isFrameExpanded ? activeFrameState : undefined}
                flowFrameStates={!isFrameExpanded ? visibleFlowFrameStates : undefined}
                onMaterialize={handleMaterialize}
                inspectionMode={inspection.inspectionMode}
              />
            )}
          </InfiniteCanvas>

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
          isFrameExpanded={isFrameExpanded}
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

      {/* Publish dialog */}
      <PublishDialog
        isOpen={publishDialogOpen}
        onClose={() => setPublishDialogOpen(false)}
        files={files}
        defaultName={manifestoData?.title ?? "My App"}
      />

      {/* Inspector context menu (right-click "Add to AI Chat") */}
      <InspectorContextMenu onAddToChat={() => setRightPanelTab("chat")} />
    </main>
  );
}
