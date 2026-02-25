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
import { useProductBrainStore } from "@/hooks/useProductBrainStore";
import { computeCoverage } from "@/lib/product-brain/coverage";
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
import { InsightsCard } from "@/components/strategy/InsightsCard";
import { useDocumentStore } from "@/hooks/useDocumentStore";
import { PersonaCard } from "@/components/strategy/PersonaCard";
import { JourneyMapCard } from "@/components/strategy/JourneyMapCard";
import { CoverageCard } from "@/components/strategy/CoverageCard";
import { IdeaCard } from "@/components/strategy/IdeaCard";
import { WireframeCard, WIREFRAME_CARD_WIDTH, WIREFRAME_CARD_HEIGHT } from "@/components/strategy/WireframeCard";
import { StrategyFlowCanvas } from "@/components/strategy/StrategyFlowCanvas";
import { calculateHorizontalLayout, type GroupId, type GroupConfig, type GroupOrigin } from "@/lib/strategy/section-layout";
import { calculateStrategyLayout } from "@/lib/strategy/strategy-layout";
import { initializeTestAPI, updateTestAPI } from "@/lib/ast/test-utils";
import { PublishDialog } from "@/components/editor/PublishDialog";
import { Smartphone, GitBranch, Share, RefreshCw } from "lucide-react";
import { animateViewport, calculateCenteredViewport, calculateFitAllViewport } from "@/lib/canvas/viewport-animation";
import { calculateFlowLayout } from "@/lib/flow/auto-layout";
import type { CanvasTool, CanvasNode } from "@/lib/canvas/types";
import type { ContextMenuPayload } from "@/lib/inspection/types";
import type { FlowNodePosition } from "@/lib/flow/types";
import type { PreviewMode } from "@/lib/tokens";

type ViewMode = "app" | "design-system";

// Strategy layout defaults (world-space positions)
const STRATEGY_ORIGIN = { x: 100, y: 100 };
const PERSONA_CARD_WIDTH = 320;

export default function Home() {
  const { files, writeFile, getLatestFile } = useVirtualFiles();

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
  const journeyMapData = useStrategyStore((s) => s.journeyMapData);
  const streamingJourneyMaps = useStrategyStore((s) => s.streamingJourneyMaps);
  const ideaData = useStrategyStore((s) => s.ideaData);
  const streamingIdeas = useStrategyStore((s) => s.streamingIdeas);
  const selectedIdeaId = useStrategyStore((s) => s.selectedIdeaId);
  const wireframeData = useStrategyStore((s) => s.wireframeData);
  const streamingWireframes = useStrategyStore((s) => s.streamingWireframes);
  const activeWireframeData = wireframeData || streamingWireframes;
  const completedPages = useStrategyStore((s) => s.completedPages);
  const currentBuildingPage = useStrategyStore((s) => s.currentBuildingPage);
  const currentBuildingPages = useStrategyStore((s) => s.currentBuildingPages);

  // Document/Insights state
  const insightsData = useDocumentStore((s) => s.insightsData);
  const streamingInsights = useDocumentStore((s) => s.streamingInsights);
  const isDocUploading = useDocumentStore((s) => s.isUploading);
  const documentInputRef = useRef<HTMLInputElement>(null);

  // Product Brain state
  const brainData = useProductBrainStore((s) => s.brainData);
  const coverageSummary = useMemo(() => {
    if (!brainData || !manifestoData || !personaData) return null;
    return computeCoverage(brainData, manifestoData, personaData, journeyMapData ?? []);
  }, [brainData, manifestoData, personaData, journeyMapData]);

  // Compute visible page IDs for progressive FlowFrame rendering
  const visiblePageIds = useMemo(() => {
    if (strategyPhase !== "building") return undefined; // Show all pages when not building
    const ids = new Set(completedPages);
    if (currentBuildingPage) ids.add(currentBuildingPage);
    for (const pid of currentBuildingPages) ids.add(pid);
    return ids;
  }, [strategyPhase, completedPages, currentBuildingPage, currentBuildingPages]);

  // State for auto-centering viewport on newly built pages
  const [centerOnPageId, setCenterOnPageId] = useState<string | null>(null);

  // --- Horizontal group layout state ---
  // Group origin positions (top-left of each group in world-space).
  // Set once when a group first becomes visible, then preserved if user drags cards.
  const [groupPositions, setGroupPositions] = useState<Map<GroupId, { x: number; y: number }>>(
    () => new Map()
  );
  // Cached layout rects (for viewport animations)
  const [groupRects, setGroupRects] = useState<GroupOrigin[]>([]);

  // Y offset to push FlowFrames below strategy content during building
  const [flowLayoutOffset, setFlowLayoutOffset] = useState({ x: 0, y: 0 });

  // --- Build group configs from current strategy data ---
  const buildGroupConfigs = useCallback((): GroupConfig[] => {
    const configs: GroupConfig[] = [];

    // Insights group (first, left of product-overview)
    configs.push({
      id: "insights",
      width: 600,
      height: 500,
      visible: !!(insightsData || streamingInsights),
    });

    configs.push({
      id: "product-overview",
      width: 600,
      height: 450,
      visible: !!(manifestoData || streamingOverview),
    });

    const personaCount = (personaData || streamingPersonas)?.length ?? 0;
    configs.push({
      id: "personas",
      width: personaCount > 0 ? personaCount * (PERSONA_CARD_WIDTH + 20) - 20 : 0,
      height: 420,
      visible: personaCount > 0,
    });

    const journeyCount = (journeyMapData || streamingJourneyMaps)?.length ?? 0;
    configs.push({
      id: "journey-maps",
      width: 900,
      height: journeyCount > 0 ? journeyCount * 550 - 30 : 0,
      visible: journeyCount > 0,
    });

    const ideaCount = (ideaData || streamingIdeas)?.length ?? 0;
    const ideaRows = Math.ceil(ideaCount / 4);
    configs.push({
      id: "ideas",
      width: ideaCount > 0 ? Math.min(ideaCount, 4) * IDEA_CARD_COL_WIDTH - 20 : 0,
      height: ideaCount > 0 ? ideaRows * IDEA_CARD_ESTIMATED_HEIGHT + (ideaRows - 1) * IDEA_CARD_ROW_GAP : 0,
      visible: ideaCount > 0,
    });

    if (flowData) {
      const layout = calculateStrategyLayout(flowData.nodes, flowData.connections);
      configs.push({ id: "architecture", width: layout.width, height: layout.height, visible: true });
    } else {
      configs.push({ id: "architecture", width: 0, height: 0, visible: false });
    }

    // Wireframes group (below architecture)
    const wireframePageCount = activeWireframeData?.pages?.length ?? 0;
    const WIREFRAME_HEADER = 36;
    configs.push({
      id: "wireframes",
      width: wireframePageCount > 0 ? Math.min(wireframePageCount, 3) * (WIREFRAME_CARD_WIDTH + 40) - 40 : 0,
      height: wireframePageCount > 0 ? Math.ceil(wireframePageCount / 3) * (WIREFRAME_CARD_HEIGHT + WIREFRAME_HEADER + 40) - 40 : 0,
      visible: wireframePageCount > 0,
    });

    return configs;
  }, [insightsData, streamingInsights, manifestoData, streamingOverview, personaData, streamingPersonas, journeyMapData, streamingJourneyMaps, ideaData, streamingIdeas, flowData, activeWireframeData]);

  // --- Layout effect: compute horizontal group origins when groups appear ---
  useEffect(() => {
    const configs = buildGroupConfigs();
    const origins = calculateHorizontalLayout(configs, STRATEGY_ORIGIN);
    if (origins.length === 0) return;

    setGroupRects(origins);
    setGroupPositions((prev) => {
      const next = new Map(prev);
      let changed = false;
      for (const o of origins) {
        if (!next.has(o.id)) {
          next.set(o.id, { x: o.x, y: o.y });
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [buildGroupConfigs]);

  // Helper: get effective position for a group (user-dragged or computed)
  const getGroupOrigin = useCallback((id: GroupId) => {
    return groupPositions.get(id) ?? groupRects.find((r) => r.id === id) ?? null;
  }, [groupPositions, groupRects]);

  // --- Per-card positions for individually draggable cards ---
  const [personaPositions, setPersonaPositions] = useState<{ x: number; y: number }[]>([]);
  const [journeyMapPositions, setJourneyMapPositions] = useState<{ x: number; y: number }[]>([]);
  const [ideaPositions, setIdeaPositions] = useState<{ x: number; y: number }[]>([]);
  const [wireframePositions, setWireframePositions] = useState<{ x: number; y: number }[]>([]);
  const [coverageCardPos, setCoverageCardPos] = useState<{ x: number; y: number } | null>(null);

  // Estimated height per journey map card (accounts for table with 5+ rows)
  const JOURNEY_CARD_ESTIMATED_HEIGHT = 520;
  const JOURNEY_CARD_GAP = 30;

  // Estimated height per idea card row (cards have illustrations + title + description + features + pros/cons)
  const IDEA_CARD_ESTIMATED_HEIGHT = 620;
  const IDEA_CARD_COL_WIDTH = 320;
  const IDEA_CARD_ROW_GAP = 40;

  // Initialize persona positions from group origin when persona count changes
  useEffect(() => {
    const count = (personaData || streamingPersonas)?.length ?? 0;
    if (count === 0) return;
    const g = getGroupOrigin("personas");
    if (!g) return;

    setPersonaPositions((prev) => {
      if (prev.length === count) return prev;
      return Array.from({ length: count }, (_, i) =>
        prev[i] ?? { x: g.x + i * (PERSONA_CARD_WIDTH + 20), y: g.y }
      );
    });
  }, [(personaData || streamingPersonas)?.length, getGroupOrigin]);

  // Initialize journey map positions from group origin when count changes
  useEffect(() => {
    const count = (journeyMapData || streamingJourneyMaps)?.length ?? 0;
    if (count === 0) return;
    const g = getGroupOrigin("journey-maps");
    if (!g) return;

    setJourneyMapPositions((prev) => {
      if (prev.length === count) return prev;
      return Array.from({ length: count }, (_, i) =>
        prev[i] ?? { x: g.x, y: g.y + i * (JOURNEY_CARD_ESTIMATED_HEIGHT + JOURNEY_CARD_GAP) }
      );
    });
  }, [(journeyMapData || streamingJourneyMaps)?.length, getGroupOrigin]);

  // Initialize idea positions from group origin when count changes (2x4 grid layout)
  useEffect(() => {
    const count = (ideaData || streamingIdeas)?.length ?? 0;
    if (count === 0) return;
    const g = getGroupOrigin("ideas");
    if (!g) return;

    setIdeaPositions((prev) => {
      if (prev.length === count) return prev;
      return Array.from({ length: count }, (_, i) =>
        prev[i] ?? {
          x: g.x + (i % 4) * IDEA_CARD_COL_WIDTH,
          y: g.y + Math.floor(i / 4) * (IDEA_CARD_ESTIMATED_HEIGHT + IDEA_CARD_ROW_GAP),
        }
      );
    });
  }, [(ideaData || streamingIdeas)?.length, getGroupOrigin]);

  // Initialize wireframe positions from group origin when count changes (3-column grid)
  const WIREFRAME_HEADER_HEIGHT = 36;
  const WIREFRAME_COL_GAP = 40;
  useEffect(() => {
    const count = activeWireframeData?.pages?.length ?? 0;
    if (count === 0) return;
    const g = getGroupOrigin("wireframes");
    if (!g) return;

    setWireframePositions((prev) => {
      if (prev.length === count) return prev;
      return Array.from({ length: count }, (_, i) =>
        prev[i] ?? {
          x: g.x + (i % 3) * (WIREFRAME_CARD_WIDTH + WIREFRAME_COL_GAP),
          y: g.y + Math.floor(i / 3) * (WIREFRAME_CARD_HEIGHT + WIREFRAME_HEADER_HEIGHT + WIREFRAME_COL_GAP),
        }
      );
    });
  }, [activeWireframeData?.pages?.length, getGroupOrigin]);

  // Initialize product brain from VFS on mount
  useEffect(() => {
    const brainJson = files["/product-brain.json"];
    if (brainJson && !useProductBrainStore.getState().brainData) {
      try {
        const parsed = JSON.parse(brainJson);
        if (parsed.version === 1 && Array.isArray(parsed.pages)) {
          useProductBrainStore.getState().setBrainData(parsed);
        }
      } catch { /* ignore malformed brain data */ }
    }
  }, [files]);

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
    viewportRef,
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

  // --- Materialization refresh signals (per-page counter to force iframe refresh after drop) ---
  const [materializeRefreshMap, setMaterializeRefreshMap] = useState<Map<string, number>>(() => new Map());
  const [globalRefreshCounter, setGlobalRefreshCounter] = useState(0);

  // --- Active frame state for CanvasOverlay (prototype mode drop detection) ---
  const activeFrameState: FrameState | undefined = useMemo(() => {
    if (!activePageId) return undefined;
    const pos = nodePositions.get(activePageId);
    if (!pos) return undefined;
    return { x: pos.x, y: pos.y, width: pos.width, height: pos.height };
  }, [activePageId, nodePositions]);

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

        // Safety net: schedule a forced refresh on the target FlowFrame after 600ms
        // This guarantees the iframe updates even if HMR and SandpackFileSync fallback both fail
        const refreshPageId = result.targetPageId ?? targetPageId;
        if (refreshPageId) {
          setTimeout(() => {
            setMaterializeRefreshMap((prev) => {
              const next = new Map(prev);
              next.set(refreshPageId, (prev.get(refreshPageId) ?? 0) + 1);
              return next;
            });
          }, 600);
        }
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

  // Document upload handler (for InsightsCard "Upload More" and hidden input)
  const handleCanvasDocumentUpload = useCallback(async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;

    const validFiles = Array.from(fileList).filter((f) => {
      const ext = f.name.split(".").pop()?.toLowerCase();
      return ext === "pdf" || ext === "docx";
    });

    if (validFiles.length === 0) return;

    const { toast } = await import("sonner");
    useDocumentStore.getState().setUploading(true);

    try {
      const formData = new FormData();
      validFiles.forEach((f) => formData.append("files", f));

      const res = await fetch("/api/extract-document", { method: "POST", body: formData });
      if (!res.ok) throw new Error("Upload failed");

      const data = await res.json();
      const docs = (data.documents as { name: string; text: string }[]).map((d) => ({
        id: crypto.randomUUID(),
        name: d.name,
        text: d.text,
        uploadedAt: new Date().toISOString(),
      }));

      useDocumentStore.getState().addDocuments(docs);
      toast.success(`${docs.length} document${docs.length > 1 ? "s" : ""} uploaded`);

      // Trigger re-analysis if insights already exist
      if (useDocumentStore.getState().insightsData) {
        useDocumentStore.getState().setPendingReanalysis(true);
      }
    } catch (err) {
      console.error("[DocumentUpload]", err);
      const { toast: t } = await import("sonner");
      t.error("Failed to extract document text");
    } finally {
      useDocumentStore.getState().setUploading(false);
      if (documentInputRef.current) documentInputRef.current.value = "";
    }
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

  // --- Unified viewport animation: fit all visible groups + floating chat ---
  const prevVisibleGroupsRef = useRef<string>("");
  useEffect(() => {
    const visibleIds = Array.from(groupPositions.keys()).sort().join(",");
    if (visibleIds === prevVisibleGroupsRef.current || visibleIds === "") return;
    prevVisibleGroupsRef.current = visibleIds;

    // Build world-space rects from group positions + computed dimensions
    const rects: { x: number; y: number; width: number; height: number }[] = [];
    for (const gr of groupRects) {
      const pos = groupPositions.get(gr.id);
      if (pos) {
        rects.push({ x: pos.x, y: pos.y, width: gr.width, height: gr.height });
      }
    }
    if (rects.length === 0) return;

    const screenW = window.innerWidth;
    const screenH = window.innerHeight;
    const chatWidth = 630;
    const chatHeight = 720;
    const gap = 20;

    if (chatMode === "floating") {
      const worldLeft = Math.min(...rects.map((r) => r.x));
      const worldRight = Math.max(...rects.map((r) => r.x + r.width));
      const worldTop = Math.min(...rects.map((r) => r.y));
      const worldBottom = Math.max(...rects.map((r) => r.y + r.height));
      const totalWorldWidth = worldRight - worldLeft;
      const totalWorldHeight = worldBottom - worldTop;
      const combinedWidth = totalWorldWidth + gap + chatWidth;

      const scaleX = (screenW - 80) / combinedWidth;
      const scaleY = (screenH - 80) / totalWorldHeight;
      const scale = Math.min(1, scaleX, scaleY);

      const targetViewport = {
        x: (screenW - combinedWidth * scale) / 2 - worldLeft * scale,
        y: (screenH - totalWorldHeight * scale) / 2 - worldTop * scale,
        scale,
      };
      animateViewport(viewportRef.current, targetViewport, setViewport, { duration: 400 });

      const chatScreenX = (screenW - combinedWidth * scale) / 2 + totalWorldWidth * scale + gap;
      const chatScreenY = (screenH - chatHeight) / 2;

      setFloatingAnimate(true);
      setFloatingRect((prev) => ({ ...prev, x: chatScreenX, y: chatScreenY }));
      const timer = setTimeout(() => setFloatingAnimate(false), 500);
      return () => clearTimeout(timer);
    } else {
      const target = calculateFitAllViewport(rects, screenW, screenH);
      animateViewport(viewportRef.current, target, setViewport, { duration: 400 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupPositions, groupRects, chatMode]);

  const handlePhaseAction = useCallback((action: "approve-problem-overview" | "approve-ideation" | "approve-solution-design") => {
    if (action === "approve-problem-overview") {
      useStrategyStore.getState().setPhase("ideation");
      // Chat stays floating during ideation
    } else if (action === "approve-ideation") {
      useStrategyStore.getState().setPhase("solution-design");

      // Dock the chat panel to the sidebar for solution-design phase
      setChatMode("docked");
    } else if (action === "approve-solution-design") {
      // Write /flow.json from the approved flow data
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

      // Compute flow layout offset so FlowFrames appear below strategy content (including wireframes)
      const strategyBottomForOffset = Math.max(
        ...Array.from(groupPositions.entries()).map(([id, pos]) => {
          const rect = groupRects.find((r) => r.id === id);
          return pos.y + (rect?.height ?? 0);
        }),
        STRATEGY_ORIGIN.y + 500,
      );
      const overviewPosForOffset = groupPositions.get("product-overview") ?? STRATEGY_ORIGIN;
      const flowYOffset = strategyBottomForOffset + 120;
      setFlowLayoutOffset({ x: overviewPosForOffset.x - 50, y: flowYOffset - 50 });

      // Transition to building phase
      useStrategyStore.getState().setPhase("building");

      // Snapshot current node positions as architecture reference
      // (positions already include flowLayoutOffset from approve-ideation)
      architecturePositionsRef.current = new Map(nodePositionsRef.current);

      // Animate viewport to show strategy content + first FlowFrame area
      const overviewPos = groupPositions.get("product-overview") ?? STRATEGY_ORIGIN;
      const strategyBottom = Math.max(
        ...Array.from(groupPositions.entries()).map(([id, pos]) => {
          const rect = groupRects.find((r) => r.id === id);
          return pos.y + (rect?.height ?? 0);
        }),
        STRATEGY_ORIGIN.y + 500,
      );
      requestAnimationFrame(() => {
        const firstNodePos = nodePositionsRef.current.values().next().value;
        const flowFrameY = firstNodePos?.y ?? (strategyBottom + 120);
        const flowFrameX = firstNodePos?.x ?? (overviewPos.x - 50);
        const rects = [
          { x: overviewPos.x, y: overviewPos.y, width: 600, height: strategyBottom - overviewPos.y },
          { x: flowFrameX, y: flowFrameY, width: DEFAULT_FRAME_WIDTH, height: DEFAULT_FRAME_HEIGHT },
        ];
        const target = calculateFitAllViewport(rects, containerDimensions.width, containerDimensions.height);
        animateViewport(viewportRef.current, target, setViewport, { duration: 500 });
      });
    }
  }, [writeFile, setViewport, containerDimensions, groupPositions, groupRects]);

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
  const isEarlyStrategyPhase = strategyPhase === "hero" || strategyPhase === "problem-overview" || strategyPhase === "ideation" || strategyPhase === "solution-design";
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
      {/* Hidden document upload input for InsightsCard "Upload More" */}
      <input
        ref={documentInputRef}
        type="file"
        accept=".pdf,.docx"
        multiple
        className="hidden"
        onChange={(e) => handleCanvasDocumentUpload(e.target.files)}
      />

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
                  {strategyPhase === "problem-overview" && "Defining Problem"}
                  {strategyPhase === "ideation" && "Exploring Ideas"}
                  {strategyPhase === "solution-design" && "Designing Solution"}
                </span>
              </div>
            )}
          </div>

          {/* Action buttons on far right */}
          {!isEarlyStrategyPhase && viewMode === "app" && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setGlobalRefreshCounter((c) => c + 1)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-neutral-600 hover:text-neutral-900 border border-neutral-300 rounded-md hover:border-neutral-400 transition-colors"
                title="Refresh all frames"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
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
            {/* Strategy artifacts — placed directly on canvas, left to right */}

            {/* Insights Card — first group, left of manifesto */}
            {(insightsData || streamingInsights) && (() => {
              const g = getGroupOrigin("insights");
              if (!g) return null;
              return (
                <InsightsCard
                  data={insightsData || streamingInsights!}
                  x={g.x}
                  y={g.y}
                  onMove={(nx, ny) => setGroupPositions((prev) => new Map(prev).set("insights", { x: nx, y: ny }))}
                  onUploadMore={() => documentInputRef.current?.click()}
                  isUploading={isDocUploading}
                />
              );
            })()}

            {(manifestoData || streamingOverview) && (() => {
              const g = getGroupOrigin("product-overview");
              if (!g) return null;
              return (
                <ManifestoCard
                  manifestoData={manifestoData || streamingOverview!}
                  x={g.x}
                  y={g.y}
                  onMove={(nx, ny) => setGroupPositions((prev) => new Map(prev).set("product-overview", { x: nx, y: ny }))}
                  jtbdCoverage={coverageSummary?.jtbdCoverage}
                />
              );
            })()}

            {(personaData || streamingPersonas) && (personaData || streamingPersonas)!.map((persona, index) => {
              const g = getGroupOrigin("personas");
              if (!g) return null;
              const pos = personaPositions[index];
              return (
                <PersonaCard
                  key={index}
                  persona={persona}
                  x={pos?.x ?? g.x + index * (PERSONA_CARD_WIDTH + 20)}
                  y={pos?.y ?? g.y}
                  index={index}
                  onMove={(nx, ny) => setPersonaPositions((prev) => {
                    const updated = [...prev];
                    updated[index] = { x: nx, y: ny };
                    return updated;
                  })}
                  coveragePercent={coverageSummary?.personaCoverage.find(
                    (p) => p.personaName === (persona as { name?: string }).name
                  )?.coveragePercent}
                />
              );
            })}

            {(journeyMapData || streamingJourneyMaps) && (journeyMapData || streamingJourneyMaps)!.map((map, index) => {
              const g = getGroupOrigin("journey-maps");
              if (!g) return null;
              const pos = journeyMapPositions[index];
              return (
                <JourneyMapCard
                  key={index}
                  journeyMap={map}
                  x={pos?.x ?? g.x}
                  y={pos?.y ?? g.y + index * (JOURNEY_CARD_ESTIMATED_HEIGHT + JOURNEY_CARD_GAP)}
                  index={index}
                  onMove={(nx, ny) => setJourneyMapPositions((prev) => {
                    const updated = [...prev];
                    updated[index] = { x: nx, y: ny };
                    return updated;
                  })}
                  coveredStageIndices={
                    coverageSummary
                      ? new Set(
                          coverageSummary.journeyStageCoverage
                            .filter((c) => c.personaName === (map as { personaName?: string }).personaName && c.covered)
                            .map((c) => c.stageIndex)
                        )
                      : undefined
                  }
                />
              );
            })}

            {(ideaData || streamingIdeas) && (ideaData || streamingIdeas)!.map((idea, index) => {
              const g = getGroupOrigin("ideas");
              if (!g) return null;
              const pos = ideaPositions[index];
              return (
                <IdeaCard
                  key={idea.id ?? index}
                  idea={idea}
                  x={pos?.x ?? g.x + (index % 4) * IDEA_CARD_COL_WIDTH}
                  y={pos?.y ?? g.y + Math.floor(index / 4) * (IDEA_CARD_ESTIMATED_HEIGHT + IDEA_CARD_ROW_GAP)}
                  index={index}
                  isSelected={idea.id === selectedIdeaId}
                  onClick={() => {
                    if (idea.id) {
                      useStrategyStore.getState().setSelectedIdeaId(
                        idea.id === selectedIdeaId ? null : idea.id
                      );
                    }
                  }}
                  onMove={(nx, ny) => setIdeaPositions((prev) => {
                    const updated = [...prev];
                    updated[index] = { x: nx, y: ny };
                    return updated;
                  })}
                />
              );
            })}

            {flowData && (() => {
              const g = getGroupOrigin("architecture");
              if (!g) return null;
              return (
                <StrategyFlowCanvas
                  flowData={flowData}
                  offsetX={g.x}
                  offsetY={g.y}
                />
              );
            })()}

            {/* Wireframe Cards — visible during solution-design phase */}
            {activeWireframeData && activeWireframeData.pages.map((page, index) => {
              const g = getGroupOrigin("wireframes");
              if (!g) return null;
              const pos = wireframePositions[index];
              return (
                <WireframeCard
                  key={page.id ?? index}
                  page={page}
                  x={pos?.x ?? g.x + (index % 3) * (WIREFRAME_CARD_WIDTH + WIREFRAME_COL_GAP)}
                  y={pos?.y ?? g.y + Math.floor(index / 3) * (WIREFRAME_CARD_HEIGHT + WIREFRAME_HEADER_HEIGHT + WIREFRAME_COL_GAP)}
                  onMove={(nx, ny) => setWireframePositions((prev) => {
                    const updated = [...prev];
                    updated[index] = { x: nx, y: ny };
                    return updated;
                  })}
                />
              );
            })}

            {/* Coverage Card — visible after building phase when brain data exists */}
            {coverageSummary && (strategyPhase === "building" || strategyPhase === "complete") && (() => {
              // Position to the right of the manifesto card
              const manifestoPos = getGroupOrigin("product-overview");
              const defaultX = (manifestoPos?.x ?? STRATEGY_ORIGIN.x) + 640;
              const defaultY = manifestoPos?.y ?? STRATEGY_ORIGIN.y;
              const pos = coverageCardPos ?? { x: defaultX, y: defaultY };
              return (
                <CoverageCard
                  summary={coverageSummary}
                  x={pos.x}
                  y={pos.y}
                  onMove={(nx, ny) => setCoverageCardPos({ x: nx, y: ny })}
                  onAddressGaps={() => {
                    setRightPanelTab("chat");
                  }}
                />
              );
            })()}

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
                  refreshSignal={(materializeRefreshMap.get(page.id) ?? 0) + globalRefreshCounter}
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
            key={`design-system-${cssHash}`}
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
          getLatestFile={getLatestFile}
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
