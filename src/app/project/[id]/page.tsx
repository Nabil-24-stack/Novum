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
import type { CoverageDisplayState } from "@/lib/product-brain/types";
import {
  buildProductBrainFromEvaluation,
  normalizeProductBrainSnapshot,
} from "@/lib/product-brain/snapshot";
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
import { StrategyAnnotations } from "@/components/flow/StrategyAnnotations";
import { useAnnotationStore } from "@/hooks/useAnnotationStore";
import { useAnnotationResolution } from "@/hooks/useAnnotationResolution";
import { InsightsCard } from "@/components/strategy/InsightsCard";
import { useDocumentStore, type InsightsCardData } from "@/hooks/useDocumentStore";
import { PersonaCard } from "@/components/strategy/PersonaCard";
import { JourneyMapCard } from "@/components/strategy/JourneyMapCard";
import { IdeaCard } from "@/components/strategy/IdeaCard";
import {
  HandoffMarkdownCard,
  HANDOFF_CARD_HEIGHT,
  HANDOFF_CARD_WIDTH,
} from "@/components/strategy/HandoffMarkdownCard";
import { KeyFeaturesCard, KEY_FEATURES_CARD_WIDTH } from "@/components/strategy/KeyFeaturesCard";
import { UserFlowCard, USER_FLOW_CARD_WIDTH, USER_FLOW_CARD_HEIGHT } from "@/components/strategy/UserFlowCard";
import { StrategyFlowCanvas } from "@/components/strategy/StrategyFlowCanvas";
import { calculateHorizontalLayout, type GroupId, type GroupConfig, type GroupOrigin } from "@/lib/strategy/section-layout";
import { calculateStrategyLayout } from "@/lib/strategy/strategy-layout";
import {
  applyManualIdeaEdit,
  applyManualJourneyMapEdit,
  applyManualKeyFeaturesEdit,
  applyManualManifestoEdit,
  applyManualPersonaEdit,
  applyManualUserFlowEdit,
} from "@/lib/strategy/artifact-edit-sync";
import { initializeTestAPI, updateTestAPI } from "@/lib/ast/test-utils";
import { PublishDialog } from "@/components/editor/PublishDialog";
import { AccountMenu } from "@/components/billing/AccountMenu";
import { BillingLimitModal } from "@/components/billing/BillingLimitModal";
import { AnnotatedDeleteModal, type AnnotatedDeleteInfo } from "@/components/canvas/AnnotatedDeleteModal";
import { evaluateAnnotationsStandalone } from "@/hooks/useParallelBuild";
import { useStreamingStore } from "@/hooks/useStreamingStore";
import { useProjectPersistence } from "@/hooks/useProjectPersistence";
import {
  resolveAutoAnnotationTargets,
  type AutoAnnotationRequest,
} from "@/lib/ai/annotation-targets";
import { useParams, useRouter } from "next/navigation";
import { Monitor, GitBranch, Share, RefreshCw, ChevronLeft, ChevronDown, Loader2 as LoaderIcon, Lock } from "lucide-react";
import { useBillingStatus } from "@/hooks/useBillingStatus";
import { toast } from "sonner";
import { toPascalCase } from "@/lib/vfs/app-generator";
import { animateViewport, calculateCenteredViewport, calculateFitAllViewport } from "@/lib/canvas/viewport-animation";
import { calculateFlowLayout } from "@/lib/flow/auto-layout";
import type { CanvasTool, CanvasNode } from "@/lib/canvas/types";
import type { ContextMenuPayload } from "@/lib/inspection/types";
import type { FlowNodePosition } from "@/lib/flow/types";
import type { PreviewMode } from "@/lib/tokens";
import { serializeCanvasLayout, deserializeCanvasLayout } from "@/lib/canvas/canvas-layout-types";
import type { RepairChatDraft } from "@/components/editor/ChatTab";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { buildHandoffSnapshot, getDirtyHandoffSections, hasMeaningfulHandoffSnapshot } from "@/lib/handoff/snapshot";

type ViewMode = "app" | "design-system";

// Merge streaming partial data onto existing data by a key field (e.g., "name" for personas)
function mergeByKey<T extends object>(
  existing: T[],
  streaming: Partial<T>[],
  key: keyof T
): Partial<T>[] {
  const result: Partial<T>[] = [...existing];
  const indexByKey = new Map(existing.map((item, i) => [item[key], i]));

  for (const item of streaming) {
    const k = item[key];
    if (k !== undefined && indexByKey.has(k)) {
      const idx = indexByKey.get(k)!;
      result[idx] = { ...result[idx], ...item };
    } else if (k !== undefined) {
      result.push(item);
    }
  }

  return result;
}

function mergeUniqueStrings(existing: string[], incoming: string[]): string[] {
  return [...new Set([...existing, ...incoming])];
}

// Inline editable title component
function EditableTitle({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setDraft(value); }, [value]);
  useEffect(() => { if (editing) inputRef.current?.select(); }, [editing]);

  const commit = () => {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== value) onSave(trimmed);
    setEditing(false);
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") setEditing(false); }}
        className="font-semibold text-neutral-800 bg-transparent border-b border-blue-500 outline-none px-0 py-0 text-sm w-48"
      />
    );
  }
  return (
    <button
      onClick={() => setEditing(true)}
      className="font-semibold text-neutral-800 text-sm hover:text-blue-600 transition-colors truncate max-w-[200px]"
      title="Click to rename"
    >
      {value}
    </button>
  );
}

// Strategy layout defaults (world-space positions)
const STRATEGY_ORIGIN = { x: 100, y: 100 };
const PERSONA_CARD_WIDTH = 320;
const IDEA_CARD_ESTIMATED_HEIGHT = 360;
const IDEA_CARD_COL_WIDTH = 320;
const IDEA_CARD_ROW_GAP = 40;
const JOURNEY_CARD_ESTIMATED_HEIGHT = 520;
const JOURNEY_CARD_GAP = 30;

export default function ProjectEditor() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;

  // Project loading + hydration state
  const [isProjectLoading, setIsProjectLoading] = useState(true);
  const [projectName, setProjectName] = useState("Untitled Project");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [initialMessages, setInitialMessages] = useState<any[] | undefined>(undefined);
  const [initialInput, setInitialInput] = useState<string | undefined>(undefined);
  const [autoSubmit, setAutoSubmit] = useState(false);
  const [pendingRepairDraft, setPendingRepairDraft] = useState<RepairChatDraft | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [chatMessages, setChatMessages] = useState<any[] | null>(null);
  const didHydrateRef = useRef(false);

  const { status: billingStatus } = useBillingStatus();
  const isPro = billingStatus?.planTier === "pro";

  const { files, writeFile, getLatestFile, resetFiles } = useVirtualFiles();

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

  // Project hydration on mount
  useEffect(() => {
    if (didHydrateRef.current) return;
    didHydrateRef.current = true;

    // Reset all global stores to prevent stale data from a previous project
    useStrategyStore.getState().reset();
    useProductBrainStore.getState().clearBrain();
    useDocumentStore.getState().reset();
    useCanvasStore.getState().clearNodes();
    useChatContextStore.getState().clearPinnedElements();
    useAnnotationStore.getState().closeAll();
    useStreamingStore.getState().resetTransientState();

    (async () => {
      try {
        const res = await fetch(`/api/projects/${projectId}`);
        if (!res.ok) {
          toast.error("Project not found");
          router.push("/");
          return;
        }
        const project = await res.json();
        setProjectName(project.name);
        setSelectedArtifactId(null);

        // Hydrate VFS files
        if (project.files && Object.keys(project.files).length > 0) {
          resetFiles(project.files);
        }

        // Hydrate strategy store
        if (project.strategy && Object.keys(project.strategy).length > 0) {
          useStrategyStore.getState().hydrate(project.strategy);
        }

        // Hydrate product brain
        if (project.product_brain) {
          const brain = project.product_brain;
          const normalized = normalizeProductBrainSnapshot(brain);
          if (normalized) {
            useProductBrainStore.getState().setBrainData(normalized);
          }
          // Restore insightsData into document store (persisted under product_brain)
          if (brain.insightsData) {
            useDocumentStore.getState().setInsightsData(brain.insightsData);
          }
        }

        // Hydrate documents
        if (project.documents && project.documents.length > 0) {
          useDocumentStore.getState().setDocuments(project.documents);
        }

        // Hydrate chat messages
        if (project.chat_messages && project.chat_messages.length > 0) {
          setInitialMessages(project.chat_messages);
        }

        // Hydrate canvas layout (positions)
        if (project.canvas_layout) {
          try {
            const layout = deserializeCanvasLayout(project.canvas_layout);
            setNodePositions(layout.nodePositions);
            nodePositionsRef.current = layout.nodePositions;
            setGroupPositions(layout.groupPositions);
            setFlowLayoutOffset(layout.flowLayoutOffset);
            setPersonaPositions(layout.personaPositions);
            setJourneyMapPositions(layout.journeyMapPositions);
            setIdeaPositions(layout.ideaPositions);
            setUserFlowPositions(layout.userFlowPositions);
            setKeyFeaturesPosition(layout.keyFeaturesPosition);
          } catch (err) {
            console.error("Failed to restore canvas layout:", err);
          }
        }

        // Check for initial message from dashboard (new project flow)
        const initData = sessionStorage.getItem(`novum-init-${projectId}`);
        if (initData) {
          sessionStorage.removeItem(`novum-init-${projectId}`);
          const { message, documents } = JSON.parse(initData);
          if (documents?.length) {
            useDocumentStore.getState().setDocuments(documents);
          }
          // Pre-fill the chat input and auto-submit — keep in "hero" phase
          // so ChatTab's handleSubmit does the normal hero → problem-overview transition
          if (message) {
            setInitialInput(message);
            setAutoSubmit(true);
          }
          // New project: float the chat centered on canvas during hero/questioning phase
          setChatMode("floating");
        }
      } catch (err) {
        console.error("Failed to load project:", err);
        toast.error("Failed to load project");
      } finally {
        setIsProjectLoading(false);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- setNodePositions is stable (useCallback with [] deps) and defined later in the file
  }, [projectId, resetFiles, router]);

  // Handle messages change from ChatTab
  const handleMessagesChange = useCallback((msgs: unknown[]) => {
    setChatMessages(msgs as typeof chatMessages);
  }, []);

  // Rename project
  const handleRename = useCallback(async (name: string) => {
    setProjectName(name);
    await fetch(`/api/projects/${projectId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
  }, [projectId]);

  // Strategy state
  const strategyPhase = useStrategyStore((s) => s.phase);
  const isDeepDive = useStrategyStore((s) => s.isDeepDive);
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
  const keyFeaturesData = useStrategyStore((s) => s.keyFeaturesData);
  const streamingKeyFeatures = useStrategyStore((s) => s.streamingKeyFeatures);
  const activeKeyFeatures = keyFeaturesData || streamingKeyFeatures;
  const userFlowsData = useStrategyStore((s) => s.userFlowsData);
  const streamingUserFlows = useStrategyStore((s) => s.streamingUserFlows);
  const activeUserFlows = userFlowsData || streamingUserFlows;
  const completedPages = useStrategyStore((s) => s.completedPages);
  const currentBuildingPage = useStrategyStore((s) => s.currentBuildingPage);
  const currentBuildingPages = useStrategyStore((s) => s.currentBuildingPages);
  const strategyUpdatedAfterBuild = useStrategyStore((s) => s.strategyUpdatedAfterBuild);
  const persistedCoverageDisplayState = useStrategyStore((s) => s.coverageDisplayState);
  const productMode = useStrategyStore((s) => s.productMode);
  const handoffState = useStrategyStore((s) => s.handoff);
  const repairChatIntent = useStreamingStore((s) => s.repairChatIntent);
  const verificationPausedErrorText = useStreamingStore((s) => s.verificationPausedErrorText);
  const verificationPausedErrorPath = useStreamingStore((s) => s.verificationPausedErrorPath);
  const annotationEvaluation = useStreamingStore((s) => s.annotationEvaluation);
  const isHandoffProject = productMode === "handoff-v1";

  // Document/Insights state
  const insightsData = useDocumentStore((s) => s.insightsData);
  const streamingInsights = useDocumentStore((s) => s.streamingInsights);
  const isDocUploading = useDocumentStore((s) => s.isUploading);
  const documentInputRef = useRef<HTMLInputElement>(null);
  const [handoffGenerationStatus, setHandoffGenerationStatus] = useState<"idle" | "generating">("idle");
  // Re-evaluate annotations state
  const [isReEvaluating, setIsReEvaluating] = useState(false);
  const [isAnnotationsMenuOpen, setIsAnnotationsMenuOpen] = useState(false);
  const reEvaluateTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reEvaluateRunTokenRef = useRef(0);
  const pendingAutoAnnotationRequestRef = useRef<AutoAnnotationRequest | null>(null);
  const isProjectPageMountedRef = useRef(true);

  // Product Brain state
  const brainData = useProductBrainStore((s) => s.brainData);
  const coverageSummary = useMemo(() => {
    if (!brainData || !manifestoData || !personaData) return null;
    return computeCoverage(brainData, manifestoData, personaData, journeyMapData ?? []);
  }, [brainData, manifestoData, personaData, journeyMapData]);
  const coverageDisplayState = useMemo<CoverageDisplayState>(() => {
    if (annotationEvaluation.status === "error" && annotationEvaluation.completedPages === 0) {
      return "unavailable";
    }
    if (
      (isReEvaluating || annotationEvaluation.status === "evaluating") &&
      annotationEvaluation.completedPages === 0
    ) {
      return "pending";
    }
    if (brainData) return "ready";
    if (
      currentBuildingPages.length > 0 ||
      isReEvaluating ||
      annotationEvaluation.status === "evaluating"
    ) {
      return "pending";
    }
    if (annotationEvaluation.status === "error") return "unavailable";
    if (persistedCoverageDisplayState === "unavailable") return "unavailable";
    if (completedPages.length > 0 && strategyPhase !== "building") return "unavailable";
    return "pending";
  }, [
    annotationEvaluation.completedPages,
    annotationEvaluation.status,
    brainData,
    completedPages.length,
    currentBuildingPages.length,
    isReEvaluating,
    persistedCoverageDisplayState,
    strategyPhase,
  ]);
  const coverageProgressNote = useMemo(() => {
    if (!brainData || annotationEvaluation.status !== "evaluating" || annotationEvaluation.totalPages === 0) {
      return null;
    }

    const finishedPages = annotationEvaluation.completedPages + annotationEvaluation.failedPages;
    if (finishedPages >= annotationEvaluation.totalPages) return null;

    return `Still annotating remaining screens (${finishedPages} of ${annotationEvaluation.totalPages} finished).`;
  }, [
    annotationEvaluation.completedPages,
    annotationEvaluation.failedPages,
    annotationEvaluation.status,
    annotationEvaluation.totalPages,
    brainData,
  ]);
  const selectedSolution = useMemo(
    () => ideaData?.find((idea) => idea.id === selectedIdeaId) ?? null,
    [ideaData, selectedIdeaId]
  );
  const handoffSnapshot = useMemo(
    () =>
      buildHandoffSnapshot({
        productOverview: manifestoData,
        insights: insightsData,
        personas: personaData,
        journeyHighlights: journeyMapData,
        selectedSolution,
        keyFeatures: keyFeaturesData,
        informationArchitecture: flowData,
        userFlows: userFlowsData,
      }),
    [
      flowData,
      insightsData,
      journeyMapData,
      keyFeaturesData,
      manifestoData,
      personaData,
      selectedSolution,
      userFlowsData,
    ]
  );
  const handoffDirtySections = useMemo(
    () => getDirtyHandoffSections(handoffSnapshot, handoffState.baselineSnapshot),
    [handoffSnapshot, handoffState.baselineSnapshot]
  );

  const markStrategyEditedAfterBuild = useCallback(() => {
    if (completedPages.length > 0) {
      useStrategyStore.getState().setStrategyUpdatedAfterBuild(true);
    }
  }, [completedPages.length]);

  const handleInsightsCommit = useCallback((nextInsights: InsightsCardData) => {
    if (!nextInsights) return;
    useDocumentStore.getState().setInsightsData(nextInsights);
    markStrategyEditedAfterBuild();
  }, [markStrategyEditedAfterBuild]);

  const handleManifestoCommit = useCallback((nextManifesto: NonNullable<typeof manifestoData>) => {
    const result = applyManualManifestoEdit(
      {
        manifestoData,
        personaData,
        journeyMapData,
        ideaData,
        selectedIdeaId,
        keyFeaturesData,
        userFlowsData,
      },
      nextManifesto
    );

    useStrategyStore.getState().setManifestoData(result.manifestoData);
    if (result.userFlowsData !== null) {
      useStrategyStore.getState().setUserFlowsData(result.userFlowsData);
    }
  }, [
    ideaData,
    journeyMapData,
    keyFeaturesData,
    manifestoData,
    personaData,
    selectedIdeaId,
    userFlowsData,
  ]);

  const handlePersonaCommit = useCallback((personaIndex: number, nextPersona: NonNullable<typeof personaData>[number]) => {
    const result = applyManualPersonaEdit(
      {
        manifestoData,
        personaData,
        journeyMapData,
        ideaData,
        selectedIdeaId,
        keyFeaturesData,
        userFlowsData,
      },
      personaIndex,
      nextPersona
    );

    useStrategyStore.getState().setPersonaData(result.personaData);
    if (result.journeyMapData !== null) {
      useStrategyStore.getState().setJourneyMapData(result.journeyMapData);
    }
    if (result.userFlowsData !== null) {
      useStrategyStore.getState().setUserFlowsData(result.userFlowsData);
    }
  }, [
    ideaData,
    journeyMapData,
    keyFeaturesData,
    manifestoData,
    personaData,
    selectedIdeaId,
    userFlowsData,
  ]);

  const handleJourneyMapCommit = useCallback((journeyMapIndex: number, nextJourneyMap: NonNullable<typeof journeyMapData>[number]) => {
    const nextJourneyMaps = applyManualJourneyMapEdit(
      {
        manifestoData,
        personaData,
        journeyMapData,
        ideaData,
        selectedIdeaId,
        keyFeaturesData,
        userFlowsData,
      },
      journeyMapIndex,
      nextJourneyMap
    );

    useStrategyStore.getState().setJourneyMapData(nextJourneyMaps);
  }, [
    ideaData,
    journeyMapData,
    keyFeaturesData,
    manifestoData,
    personaData,
    selectedIdeaId,
    userFlowsData,
  ]);

  const handleIdeaCommit = useCallback((ideaIndex: number, nextIdea: NonNullable<typeof ideaData>[number]) => {
    const result = applyManualIdeaEdit(
      {
        manifestoData,
        personaData,
        journeyMapData,
        ideaData,
        selectedIdeaId,
        keyFeaturesData,
        userFlowsData,
      },
      ideaIndex,
      nextIdea
    );

    useStrategyStore.getState().setIdeaData(result.ideaData);
    if (result.keyFeaturesData) {
      useStrategyStore.getState().setKeyFeaturesData(result.keyFeaturesData);
    }

    if (ideaData?.[ideaIndex]?.id === selectedIdeaId) {
      markStrategyEditedAfterBuild();
    }
  }, [
    ideaData,
    journeyMapData,
    keyFeaturesData,
    manifestoData,
    markStrategyEditedAfterBuild,
    personaData,
    selectedIdeaId,
    userFlowsData,
  ]);

  const handleSelectedIdeaChange = useCallback((nextSelectedIdeaId: string | null) => {
    if (selectedIdeaId === nextSelectedIdeaId) return;
    useStrategyStore.getState().setSelectedIdeaId(nextSelectedIdeaId);
    markStrategyEditedAfterBuild();
  }, [markStrategyEditedAfterBuild, selectedIdeaId]);

  const handleKeyFeaturesCommit = useCallback((nextKeyFeatures: NonNullable<typeof keyFeaturesData>) => {
    const result = applyManualKeyFeaturesEdit(nextKeyFeatures);

    useStrategyStore.getState().setKeyFeaturesData(result);
  }, []);

  const handleUserFlowCommit = useCallback((userFlowIndex: number, nextUserFlow: NonNullable<typeof userFlowsData>[number]) => {
    const nextUserFlows = applyManualUserFlowEdit(
      {
        manifestoData,
        personaData,
        journeyMapData,
        ideaData,
        selectedIdeaId,
        keyFeaturesData,
        userFlowsData,
      },
      userFlowIndex,
      nextUserFlow
    );

    useStrategyStore.getState().setUserFlowsData(nextUserFlows);
  }, [
    ideaData,
    journeyMapData,
    keyFeaturesData,
    manifestoData,
    personaData,
    selectedIdeaId,
    userFlowsData,
  ]);

  // Annotation store + resolution
  const annotationActiveFrames = useAnnotationStore((s) => s.activeFrames);
  const annotationBounds = useAnnotationStore((s) => s.frameBounds);
  const toggleAnnotationFrame = useAnnotationStore((s) => s.toggleFrame);
  const openAllAnnotations = useAnnotationStore((s) => s.openAll);
  const closeAllAnnotations = useAnnotationStore((s) => s.closeAll);
  useAnnotationResolution({ brainData });

  useEffect(() => {
    isProjectPageMountedRef.current = true;
    setIsReEvaluating(false);

    return () => {
      isProjectPageMountedRef.current = false;
      reEvaluateRunTokenRef.current += 1;
      pendingAutoAnnotationRequestRef.current = null;
      if (reEvaluateTimeoutRef.current) {
        clearTimeout(reEvaluateTimeoutRef.current);
        reEvaluateTimeoutRef.current = null;
      }
    };
  }, [projectId]);

  // Toast notification when strategy artifacts are updated after build
  useEffect(() => {
    if (strategyUpdatedAfterBuild && completedPages.length > 0) {
      import("sonner").then(({ toast }) => {
        toast.info("Strategy artifacts updated. Existing annotations may be outdated.", {
          duration: 5000,
        });
      });
    }
  }, [strategyUpdatedAfterBuild, completedPages.length]);

  // Compute visible page IDs for progressive FlowFrame rendering
  const visiblePageIds = useMemo(() => {
    if (strategyPhase !== "building") return undefined; // Show all pages when not building
    const ids = new Set(completedPages);
    if (currentBuildingPage) ids.add(currentBuildingPage);
    for (const pid of currentBuildingPages) ids.add(pid);
    return ids;
  }, [strategyPhase, completedPages, currentBuildingPage, currentBuildingPages]);

  // State for annotated element delete confirmation modal
  const [pendingAnnotatedDelete, setPendingAnnotatedDelete] = useState<AnnotatedDeleteInfo | null>(null);

  // State for auto-centering viewport on newly built pages
  const [centerOnPageId, setCenterOnPageId] = useState<string | null>(null);

  // --- Horizontal group layout state ---
  // Group origin positions (top-left of each group in world-space).
  // Set once when a group first becomes visible, then preserved if user drags cards.
  const [groupPositions, setGroupPositions] = useState<Map<GroupId, { x: number; y: number }>>(
    () => new Map()
  );
  const [selectedArtifactId, setSelectedArtifactId] = useState<string | null>(null);
  // Y offset to push FlowFrames below strategy content during building
  const [flowLayoutOffset, setFlowLayoutOffset] = useState({ x: 0, y: 0 });

  // Dynamic idea card height tracking (declared before buildGroupConfigs which reads it)
  const ideaCardHeightsRef = useRef<number[]>([]);

  // --- Build group configs from current strategy data ---
  const buildGroupConfigs = useCallback((): GroupConfig[] => {
    const configs: GroupConfig[] = [];

    // Insights group (first, left of product-overview)
    configs.push({
      id: "insights",
      width: 600,
      height: 500,
      visible: !!(insightsData || streamingInsights || manifestoData || streamingOverview),
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
      height: ideaCount > 0 ? (() => {
        let total = 0;
        for (let r = 0; r < ideaRows; r++) {
          const start = r * 4;
          const rowHeights = ideaCardHeightsRef.current.slice(start, start + 4).filter(h => h > 0);
          total += rowHeights.length > 0 ? Math.max(...rowHeights) : IDEA_CARD_ESTIMATED_HEIGHT;
        }
        return total + (ideaRows - 1) * IDEA_CARD_ROW_GAP;
      })() : 0,
      visible: ideaCount > 0,
    });

    // Key features group (between ideas and architecture)
    const KEY_FEATURES_ESTIMATED_HEIGHT = 500;
    configs.push({
      id: "key-features",
      width: KEY_FEATURES_CARD_WIDTH,
      height: KEY_FEATURES_ESTIMATED_HEIGHT,
      visible: !!(activeKeyFeatures),
    });

    if (flowData) {
      const layout = calculateStrategyLayout(flowData.nodes, flowData.connections);
      configs.push({ id: "architecture", width: layout.width, height: layout.height, visible: true });
    } else {
      configs.push({ id: "architecture", width: 0, height: 0, visible: false });
    }

    // User flows group (after architecture)
    const userFlowCount = activeUserFlows?.length ?? 0;
    const USER_FLOW_GAP = 40;
    configs.push({
      id: "user-flows",
      width: userFlowCount > 0 ? USER_FLOW_CARD_WIDTH : 0,
      height: userFlowCount > 0 ? userFlowCount * (USER_FLOW_CARD_HEIGHT + USER_FLOW_GAP) - USER_FLOW_GAP : 0,
      visible: userFlowCount > 0,
    });

    configs.push({
      id: "handoff",
      width: HANDOFF_CARD_WIDTH,
      height: HANDOFF_CARD_HEIGHT,
      visible: isHandoffProject && strategyPhase === "handoff",
    });

    return configs;
  }, [
    activeKeyFeatures,
    activeUserFlows,
    flowData,
    ideaData,
    insightsData,
    isHandoffProject,
    manifestoData,
    personaData,
    strategyPhase,
    streamingIdeas,
    streamingInsights,
    streamingJourneyMaps,
    streamingOverview,
    streamingPersonas,
    journeyMapData,
  ]);

  // Derived layout rects (for viewport animations) — useMemo avoids state-update
  // render loops that useState+useEffect would cause with cascading effects.
  const groupRects = useMemo<GroupOrigin[]>(() => {
    if (isProjectLoading) return [];
    const configs = buildGroupConfigs();
    return calculateHorizontalLayout(configs, STRATEGY_ORIGIN);
  }, [isProjectLoading, buildGroupConfigs]);

  // --- Seed group positions when new groups appear ---
  // groupRects is now a useMemo (no state update needed). This effect only
  // initialises drag-positions for groups that don't have one yet.
  useEffect(() => {
    if (groupRects.length === 0) return;
    setGroupPositions((prev) => {
      const next = new Map(prev);
      let changed = false;
      for (const o of groupRects) {
        if (!next.has(o.id)) {
          next.set(o.id, { x: o.x, y: o.y });
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [groupRects]);

  // Helper: get effective position for a group (user-dragged or computed)
  const getGroupOrigin = useCallback((id: GroupId) => {
    return groupPositions.get(id) ?? groupRects.find((r) => r.id === id) ?? null;
  }, [groupPositions, groupRects]);

  // --- Per-card positions for individually draggable cards ---
  const [personaPositions, setPersonaPositions] = useState<{ x: number; y: number }[]>([]);
  const [journeyMapPositions, setJourneyMapPositions] = useState<{ x: number; y: number }[]>([]);
  const [ideaPositions, setIdeaPositions] = useState<{ x: number; y: number }[]>([]);
  const [userFlowPositions, setUserFlowPositions] = useState<{ x: number; y: number }[]>([]);
  const [keyFeaturesPosition, setKeyFeaturesPosition] = useState<{ x: number; y: number } | null>(null);

  // Dynamic idea card height tracking — measures actual card heights to position rows accurately
  const ideaDraggedRef = useRef<Set<number>>(new Set());
  const [ideaHeightTick, setIdeaHeightTick] = useState(0);
  const heightTickTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const handleIdeaHeightMeasured = useCallback((index: number, height: number) => {
    const prev = ideaCardHeightsRef.current[index];
    if (prev && Math.abs(height - prev) <= 1) return;
    ideaCardHeightsRef.current[index] = height;
    clearTimeout(heightTickTimerRef.current);
    heightTickTimerRef.current = setTimeout(() => setIdeaHeightTick(t => t + 1), 50);
  }, []);

  // Compute row Y offset using measured heights (falls back to estimate)
  const getIdeaRowY = useCallback((row: number, groupY: number) => {
    let y = groupY;
    for (let r = 0; r < row; r++) {
      const start = r * 4;
      const rowHeights = ideaCardHeightsRef.current.slice(start, start + 4).filter(h => h > 0);
      const maxH = rowHeights.length > 0 ? Math.max(...rowHeights) : IDEA_CARD_ESTIMATED_HEIGHT;
      y += maxH + IDEA_CARD_ROW_GAP;
    }
    return y;
  }, []);

  // Pre-compute counts for dependency arrays
  const personaCount = (personaData || streamingPersonas)?.length ?? 0;
  const journeyMapCount = (journeyMapData || streamingJourneyMaps)?.length ?? 0;
  const ideaCount = (ideaData || streamingIdeas)?.length ?? 0;

  // Initialize persona positions from group origin when persona count changes
  useEffect(() => {
    if (isProjectLoading) return;
    if (personaCount === 0) return;
    const g = getGroupOrigin("personas");
    if (!g) return;

    setPersonaPositions((prev) => {
      if (prev.length === personaCount) return prev;
      return Array.from({ length: personaCount }, (_, i) =>
        prev[i] ?? { x: g.x + i * (PERSONA_CARD_WIDTH + 20), y: g.y }
      );
    });
  }, [isProjectLoading, personaCount, getGroupOrigin]);

  // Initialize journey map positions from group origin when count changes
  useEffect(() => {
    if (isProjectLoading) return;
    if (journeyMapCount === 0) return;
    const g = getGroupOrigin("journey-maps");
    if (!g) return;

    setJourneyMapPositions((prev) => {
      if (prev.length === journeyMapCount) return prev;
      return Array.from({ length: journeyMapCount }, (_, i) =>
        prev[i] ?? { x: g.x, y: g.y + i * (JOURNEY_CARD_ESTIMATED_HEIGHT + JOURNEY_CARD_GAP) }
      );
    });
  }, [isProjectLoading, journeyMapCount, getGroupOrigin]);

  // Initialize idea positions from group origin when count changes (2x4 grid layout)
  useEffect(() => {
    if (isProjectLoading) return;
    if (ideaCount === 0) return;
    const g = getGroupOrigin("ideas");
    if (!g) return;

    setIdeaPositions((prev) => {
      if (prev.length === ideaCount) return prev;
      ideaDraggedRef.current.clear();
      return Array.from({ length: ideaCount }, (_, i) =>
        prev[i] ?? {
          x: g.x + (i % 4) * IDEA_CARD_COL_WIDTH,
          y: getIdeaRowY(Math.floor(i / 4), g.y),
        }
      );
    });
  }, [isProjectLoading, ideaCount, getGroupOrigin, getIdeaRowY]);

  // Correct row 2+ positions when measured heights differ from estimates
  useEffect(() => {
    if (ideaHeightTick === 0) return;
    const g = getGroupOrigin("ideas");
    if (!g) return;

    setIdeaPositions(prev => {
      if (prev.length <= 4) return prev; // Only 1 row, nothing to adjust
      let changed = false;
      const updated = prev.map((pos, i) => {
        const row = Math.floor(i / 4);
        if (row === 0) return pos; // Row 0 positions are always correct
        if (ideaDraggedRef.current.has(i)) return pos; // User dragged this card
        const targetY = getIdeaRowY(row, g.y);
        if (Math.abs(pos.y - targetY) > 2) {
          changed = true;
          return { ...pos, y: targetY };
        }
        return pos;
      });
      return changed ? updated : prev;
    });
  }, [ideaHeightTick, getGroupOrigin, getIdeaRowY]);

  // Initialize user flow positions from group origin when count changes (vertical stack)
  const USER_FLOW_CARD_GAP = 40;
  useEffect(() => {
    if (isProjectLoading) return;
    const count = activeUserFlows?.length ?? 0;
    if (count === 0) return;
    const g = getGroupOrigin("user-flows");
    if (!g) return;

    setUserFlowPositions((prev) => {
      if (prev.length === count) return prev;
      return Array.from({ length: count }, (_, i) =>
        prev[i] ?? {
          x: g.x,
          y: g.y + i * (USER_FLOW_CARD_HEIGHT + USER_FLOW_CARD_GAP),
        }
      );
    });
  }, [isProjectLoading, activeUserFlows?.length, getGroupOrigin]);

  // Initialize product brain from VFS on mount
  useEffect(() => {
    const brainJson = files["/product-brain.json"];
    if (brainJson && !useProductBrainStore.getState().brainData) {
      try {
        const parsed = normalizeProductBrainSnapshot(JSON.parse(brainJson));
        if (parsed) {
          useProductBrainStore.getState().setBrainData(parsed);
        }
      } catch { /* ignore malformed brain data */ }
    }
  }, [files]);

  // Floating chat state (rect managed here for animation control)
  const [chatMode, setChatMode] = useState<"docked" | "floating">("docked");
  const [floatingRect, setFloatingRect] = useState({ x: 0, y: 0, width: 630, height: 720 });
  const [floatingAnimate, setFloatingAnimate] = useState(false);

  // Flow manifest parsed from /flow.json
  const flowManifest = useFlowManifest(files);

  useEffect(() => {
    if (!repairChatIntent) return;

    const page = flowManifest.pages.find((item) => item.id === repairChatIntent.pageId);
    setRightPanelTab("chat");
    setPendingRepairDraft({
      pageId: repairChatIntent.pageId,
      pageName: page?.name || repairChatIntent.pageId,
      route: page?.route || `/${repairChatIntent.pageId}`,
      errorText: verificationPausedErrorText || "Preview error detected",
      errorPath: verificationPausedErrorPath || undefined,
      nonce: repairChatIntent.nonce,
    });
    useStreamingStore.getState().clearRepairChatIntent();
  }, [repairChatIntent, flowManifest.pages, verificationPausedErrorPath, verificationPausedErrorText]);

  // Orphan detection: clean up product-brain connections that reference deleted pages/personas/JTBDs
  useEffect(() => {
    if (!brainData || !manifestoData || !personaData || !flowManifest) return;
    const validPageIds = flowManifest.pages.map((p: { id: string }) => p.id);
    const validPersonaNames = personaData.map((p) => p.name);
    const jtbdCount = manifestoData.jtbd.length;

    const removed = useProductBrainStore.getState().removeOrphanedConnections(
      validPageIds,
      jtbdCount,
      validPersonaNames
    );

    if (removed > 0) {
      import("sonner").then(({ toast }) => {
        toast.info(`Cleaned ${removed} orphaned annotation(s) from product brain`);
      });
    }
  }, [brainData, manifestoData, personaData, flowManifest]);

  // Re-evaluate annotations handler (placed after flowManifest is available)
  const handleReEvaluateAnnotations = useCallback(async (autoRequest?: AutoAnnotationRequest) => {
    if (isReEvaluating || !manifestoData || !personaData || !flowManifest) return;

    if (reEvaluateTimeoutRef.current) {
      clearTimeout(reEvaluateTimeoutRef.current);
      reEvaluateTimeoutRef.current = null;
    }
    pendingAutoAnnotationRequestRef.current = null;

    const resolvedTargets = autoRequest
      ? resolveAutoAnnotationTargets({
          ...autoRequest,
          flowPages: flowManifest.pages,
        })
      : {
          targetPageIds: flowManifest.pages.map((page) => page.id),
          removedPageIds: [] as string[],
        };

    const flowPageById = new Map(flowManifest.pages.map((page) => [page.id, page]));
    const pagesToEvaluate = autoRequest
      ? resolvedTargets.targetPageIds
          .map((pageId) => flowPageById.get(pageId))
          .filter((page): page is (typeof flowManifest.pages)[number] => Boolean(page))
      : flowManifest.pages;
    const removedPageIds = autoRequest ? resolvedTargets.removedPageIds : [];
    const shouldShowProgress = pagesToEvaluate.length > 0;

    if (!shouldShowProgress && removedPageIds.length === 0) return;

    const runToken = reEvaluateRunTokenRef.current + 1;
    reEvaluateRunTokenRef.current = runToken;
    const isRunActive = () =>
      isProjectPageMountedRef.current && reEvaluateRunTokenRef.current === runToken;

    setIsReEvaluating(true);
    if (shouldShowProgress) {
      useStrategyStore.getState().setCoverageDisplayState("pending");
      useStreamingStore.getState().setAnnotationEvaluating({
        connectionCount: brainData?.pages.reduce((sum, page) => sum + page.connections.length, 0) ?? 0,
        activePageId: null,
        activePageName: null,
        completedPages: 0,
        failedPages: 0,
        failedPageIds: [],
        totalPages: pagesToEvaluate.length,
        errorMessage: undefined,
      });
    }

    const mCtx = `Title: ${manifestoData.title}\nProblem: ${manifestoData.problemStatement}\nTarget User: ${manifestoData.targetUser}\nJTBDs:\n${manifestoData.jtbd.map((j, i) => `${i + 1}. ${j}`).join("\n")}`;
    const pCtx = personaData.map((p, i) => `Persona ${i + 1}: ${p.name} — ${p.role}\nGoals: ${p.goals.join("; ")}\nPain Points: ${p.painPoints.join("; ")}`).join("\n\n");

    const insData = useDocumentStore.getState().insightsData;
    const insCtx = insData
      ? insData.insights.map((ins, i) => {
          const parts = [`${i}. ${ins.insight}`];
          if (ins.sourceDocument) parts.push(`Source: ${ins.sourceDocument}`);
          if (ins.quote) parts.push(`Quote: "${ins.quote}"`);
          return parts.join(" — ");
        }).join("\n")
      : undefined;

    const oldBrain = useProductBrainStore.getState().brainData;
    const oldCount = oldBrain?.pages.reduce((sum, p) => sum + p.connections.length, 0) ?? 0;
    const failedPageIds: string[] = [];
    let completedPageCount = 0;
    let lastErrorMessage: string | undefined;

    try {
      if (removedPageIds.length > 0) {
        const brainStore = useProductBrainStore.getState();
        for (const removedPageId of removedPageIds) {
          brainStore.removePageConnections(removedPageId);
        }
        const pendingBrain = brainStore.brainData;
        if (pendingBrain) {
          writeFile("/product-brain.json", JSON.stringify(pendingBrain, null, 2));
        }
      }

      for (const page of pagesToEvaluate) {
        if (!isRunActive()) return;

        const pagePath = `/pages/${toPascalCase(page.name)}.tsx`;
        const pageCode = getLatestFile(pagePath) || files[pagePath];

        useProductBrainStore.getState().removePageConnections(page.id);
        const pendingBrain = useProductBrainStore.getState().brainData;
        if (pendingBrain) {
          writeFile("/product-brain.json", JSON.stringify(pendingBrain, null, 2));
        }

        useStreamingStore.getState().setAnnotationEvaluating({
          activePageId: page.id,
          activePageName: page.name,
          completedPages: completedPageCount,
          failedPages: failedPageIds.length,
          failedPageIds,
          totalPages: pagesToEvaluate.length,
          errorMessage: undefined,
        });

        if (!pageCode?.trim()) {
          failedPageIds.push(page.id);
          lastErrorMessage = "No generated page code was available to annotate";
          continue;
        }

        const result = await evaluateAnnotationsStandalone(
          { [pagePath]: pageCode },
          mCtx,
          pCtx,
          insCtx,
          [{ id: page.id, name: page.name, route: page.route }],
          { initialDelayMs: completedPageCount + failedPageIds.length === 0 ? 500 : 0 }
        );

        if (!isRunActive()) return;

        if (result.ok) {
          const nextBrain = buildProductBrainFromEvaluation(result.pages, [
            {
              pageId: page.id,
              pageName: page.name,
            },
          ]);
          const nextPage = nextBrain.pages[0];
          if (nextPage) {
            useProductBrainStore.getState().addPageDecisions(nextPage);
            const currentBrain = useProductBrainStore.getState().brainData ?? nextBrain;
            const totalConnections = currentBrain.pages.reduce((sum, p) => sum + p.connections.length, 0);
            writeFile("/product-brain.json", JSON.stringify(currentBrain, null, 2));
            useStrategyStore.getState().setCoverageDisplayState("ready");
            completedPageCount += 1;
            useStreamingStore.getState().setAnnotationEvaluating({
              connectionCount: totalConnections,
              activePageId: null,
              activePageName: null,
              completedPages: completedPageCount,
              failedPages: failedPageIds.length,
              failedPageIds,
              totalPages: pagesToEvaluate.length,
              errorMessage: undefined,
            });
          }
        } else {
          failedPageIds.push(page.id);
          lastErrorMessage = result.errorMessage;
        }
      }

      if (!isRunActive()) return;

      // Auto-clean orphans in case the evaluator returned invalid persona/JTBD refs.
      const validPageIds = flowManifest.pages.map((p: { id: string }) => p.id);
      useProductBrainStore.getState().removeOrphanedConnections(
        validPageIds,
        manifestoData.jtbd.length,
        personaData.map((p) => p.name),
      );

      const finalBrain = useProductBrainStore.getState().brainData;
      if (finalBrain) {
        writeFile("/product-brain.json", JSON.stringify(finalBrain, null, 2));
      }
      const totalNew = finalBrain?.pages.reduce((sum, page) => sum + page.connections.length, 0) ?? 0;
      const delta = totalNew - oldCount;

      if (failedPageIds.length > 0) {
        useStreamingStore.getState().setAnnotationError(
          lastErrorMessage || "Some pages could not be re-annotated",
          {
            connectionCount: totalNew,
            activePageId: null,
            activePageName: null,
            completedPages: completedPageCount,
            failedPages: failedPageIds.length,
            failedPageIds,
            totalPages: pagesToEvaluate.length,
          }
        );
        if (completedPageCount === 0 && totalNew === 0) {
          useStrategyStore.getState().setCoverageDisplayState("unavailable");
        }
        toast.error(
          completedPageCount > 0
            ? `Re-evaluated ${completedPageCount} page${completedPageCount === 1 ? "" : "s"}, but ${failedPageIds.length} still need annotation retry`
            : "Failed to re-evaluate annotations"
        );
      } else {
        if (shouldShowProgress) {
          useStreamingStore.getState().setAnnotationDone(totalNew, {
            activePageId: null,
            activePageName: null,
            completedPages: completedPageCount,
            failedPages: 0,
            failedPageIds: [],
            totalPages: pagesToEvaluate.length,
          });
        } else {
          useStreamingStore.getState().setAnnotationEvaluation({
            status: "idle",
            connectionCount: totalNew,
            activePageId: null,
            activePageName: null,
            completedPages: 0,
            failedPages: 0,
            failedPageIds: [],
            totalPages: 0,
            errorMessage: undefined,
          });
        }

        if (!autoRequest) {
          useStrategyStore.getState().setStrategyUpdatedAfterBuild(false);
        }

        if (delta > 0) toast.success(`Annotations updated: ${totalNew} total (+${delta} new)`);
        else if (delta < 0) toast.success(`Annotations updated: ${totalNew} total (${delta} removed)`);
        else if (shouldShowProgress) toast.success(`Annotations re-evaluated: ${totalNew} total (no changes)`);
      }
    } finally {
      if (isRunActive()) {
        setIsReEvaluating(false);
      }
    }
  }, [brainData, files, flowManifest, getLatestFile, isReEvaluating, manifestoData, personaData, writeFile]);

  // --- Auto re-evaluate annotations after AI writes code ---
  const reEvaluateRef = useRef(handleReEvaluateAnnotations);
  reEvaluateRef.current = handleReEvaluateAnnotations;

  const handleAutoReEvaluateAnnotations = useCallback((request: AutoAnnotationRequest) => {
    // Defer by 1s to ensure all VFS writes from code blocks have propagated
    // through React state so handleReEvaluateAnnotations reads latest files
    const pendingRequest = pendingAutoAnnotationRequestRef.current;
    pendingAutoAnnotationRequestRef.current = pendingRequest
      ? {
          writtenFiles: mergeUniqueStrings(pendingRequest.writtenFiles, request.writtenFiles),
          fallbackPageIds: mergeUniqueStrings(pendingRequest.fallbackPageIds, request.fallbackPageIds),
          addedPageIds: mergeUniqueStrings(pendingRequest.addedPageIds, request.addedPageIds),
          removedPageIds: mergeUniqueStrings(pendingRequest.removedPageIds, request.removedPageIds),
        }
      : {
          writtenFiles: [...request.writtenFiles],
          fallbackPageIds: [...request.fallbackPageIds],
          addedPageIds: [...request.addedPageIds],
          removedPageIds: [...request.removedPageIds],
        };

    if (reEvaluateTimeoutRef.current) {
      clearTimeout(reEvaluateTimeoutRef.current);
    }

    reEvaluateTimeoutRef.current = setTimeout(() => {
      reEvaluateTimeoutRef.current = null;
      if (!isProjectPageMountedRef.current) return;
      const nextRequest = pendingAutoAnnotationRequestRef.current;
      pendingAutoAnnotationRequestRef.current = null;
      if (!nextRequest) return;
      reEvaluateRef.current(nextRequest);
    }, 1000);
  }, []);

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

  // Canvas dimensions for SVG connections
  const [canvasDimensions, setCanvasDimensions] = useState({ width: 800, height: 600 });

  // Compute canvas layout for persistence (all position state serialized)
  const canvasLayout = useMemo(() => {
    if (isProjectLoading) return null;
    if (nodePositions.size === 0 && groupPositions.size === 0) return null;
    return serializeCanvasLayout(
      nodePositions,
      groupPositions,
      flowLayoutOffset,
      personaPositions,
      journeyMapPositions,
      ideaPositions,
      userFlowPositions,
      keyFeaturesPosition
    );
  }, [
    isProjectLoading,
    nodePositions,
    groupPositions,
    flowLayoutOffset,
    personaPositions,
    journeyMapPositions,
    ideaPositions,
    userFlowPositions,
    keyFeaturesPosition,
  ]);

  // Auto-save hook
  const { saveStatus } = useProjectPersistence(projectId, {
    files,
    chatMessages,
    canvasLayout,
  });

  const generateHandoffMarkdown = useCallback(
    async (mode: "initial" | "regenerate") => {
      if (!isHandoffProject) return;

      setHandoffGenerationStatus("generating");
      useStrategyStore.getState().updateHandoffState({ lastError: null });

      try {
        const res = await fetch("/api/generate-handoff", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            snapshot: handoffSnapshot,
            previousSnapshot: handoffState.baselineSnapshot,
            mode,
            projectId,
          }),
        });

        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || "Failed to generate markdown handoff");
        }

        useStrategyStore.getState().updateHandoffState({
          fullMarkdown: data.fullMarkdown,
          latestDeltaMarkdown: data.deltaMarkdown ?? null,
          baselineSnapshot: handoffSnapshot,
          baselineHash: data.baselineHash,
          dirtySections: [],
          isOutdated: false,
          generatedAt: data.generatedAt,
          lastError: null,
        });

        toast.success(
          mode === "initial"
            ? "Markdown handoff generated."
            : "Markdown handoff regenerated."
        );
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to generate markdown handoff";
        useStrategyStore.getState().updateHandoffState({ lastError: message });
        toast.error(message);
      } finally {
        setHandoffGenerationStatus("idle");
      }
    },
    [handoffSnapshot, handoffState.baselineSnapshot, isHandoffProject, projectId]
  );

  useEffect(() => {
    if (!isHandoffProject) return;

    const nextIsOutdated = handoffDirtySections.length > 0;
    const currentDirty = handoffState.dirtySections.join("|");
    const nextDirty = handoffDirtySections.join("|");
    if (
      handoffState.isOutdated !== nextIsOutdated ||
      currentDirty !== nextDirty
    ) {
      useStrategyStore.getState().updateHandoffState({
        dirtySections: handoffDirtySections,
        isOutdated: nextIsOutdated,
      });
    }
  }, [
    handoffDirtySections,
    handoffState.dirtySections,
    handoffState.isOutdated,
    isHandoffProject,
  ]);

  useEffect(() => {
    if (!isHandoffProject || strategyPhase !== "handoff") return;
    if (handoffGenerationStatus === "generating") return;
    if (handoffState.fullMarkdown || handoffState.lastError) return;
    if (!hasMeaningfulHandoffSnapshot(handoffSnapshot)) return;

    void generateHandoffMarkdown("initial");
  }, [
    generateHandoffMarkdown,
    handoffGenerationStatus,
    handoffSnapshot,
    handoffState.fullMarkdown,
    handoffState.lastError,
    isHandoffProject,
    strategyPhase,
  ]);

  // Container dimensions for viewport centering calculations
  const [containerDimensions, setContainerDimensions] = useState({ width: 800, height: 600 });

  // Derive activePageId from activeRoute + manifest
  const activePageId = useMemo(() => {
    const page = flowManifest.pages.find((p) => p.route === activeRoute);
    return page?.id ?? flowManifest.pages[0]?.id ?? null;
  }, [flowManifest.pages, activeRoute]);

  const activeContextPage = useMemo(() => {
    const pageId = activeFrameId ?? activePageId;
    return flowManifest.pages.find((page) => page.id === pageId) ?? null;
  }, [flowManifest.pages, activeFrameId, activePageId]);

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

  // Canvas store — use targeted selectors to avoid full-store subscription
  const canvasPrimaryId = useCanvasStore((s) => s.selection.primaryId);
  const canvasAddNode = useCanvasStore((s) => s.addNode);
  const canvasSelectNode = useCanvasStore((s) => s.selectNode);
  const canvasRemoveNode = useCanvasStore((s) => s.removeNode);
  const canvasDeselectAll = useCanvasStore((s) => s.deselectAll);
  const handleCanvasBackgroundClick = useCallback(() => {
    canvasDeselectAll();
    setSelectedArtifactId(null);
  }, [canvasDeselectAll]);
  const selectArtifact = useCallback((artifactId: string) => {
    canvasDeselectAll();
    setSelectedArtifactId(artifactId);
  }, [canvasDeselectAll]);

  // Auto-switch to Design tab when canvas node is selected
  useEffect(() => {
    if (canvasPrimaryId) {
      setRightPanelTab("design");
    }
  }, [canvasPrimaryId]);

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
  // Use specific properties instead of the whole `inspection` object to prevent
  // re-running this effect every render (useInspection returns a new object each time).
  useEffect(() => {
    if (canvasTool.activeTool !== "cursor" && inspection.inspectionMode) {
      inspection.setInspectionMode(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvasTool.activeTool, inspection.inspectionMode, inspection.setInspectionMode]);

  // --- Container dimensions ResizeObserver ---
  // Depends on isProjectLoading because the canvas wrapper div is not rendered
  // during the loading phase (early return). Without this dependency, the effect
  // runs once on mount when canvasWrapperRef.current is null and never re-runs,
  // leaving containerDimensions stuck at the initial {800, 600} default.
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
  }, [isProjectLoading]);

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

  // --- Recompute flowLayoutOffset on project restore ---
  // If flowLayoutOffset was restored from canvas_layout persistence, this is a no-op
  // (the guard checks flowLayoutOffset !== 0). Otherwise recomputes from strategy card positions.
  useEffect(() => {
    if (isProjectLoading) return;
    const needsOffset = strategyPhase === "building" || strategyPhase === "editing" || strategyPhase === "complete";
    if (!needsOffset) return;
    if (flowLayoutOffset.x !== 0 || flowLayoutOffset.y !== 0) return;
    if (groupPositions.size === 0) return;
    if (flowManifest.pages.length === 0) return;

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
    setNodePositions(new Map());
    architecturePositionsRef.current = null;
  }, [isProjectLoading, strategyPhase, flowLayoutOffset, groupPositions, groupRects, flowManifest.pages.length, setNodePositions]);

  // --- Calculate flow layout when manifest changes ---
  // Preserve existing positions for nodes the user may have dragged;
  // only auto-layout newly added nodes.
  useEffect(() => {
    if (isProjectLoading) return;
    const layout = calculateFlowLayout(flowManifest.pages, flowManifest.connections);

    setNodePositions((prev) => {
      let changed = false;
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
          changed = true;
        }
      }
      // Remove nodes that no longer exist in manifest — skip during building phase
      // because visiblePageIds already controls rendering and AI may temporarily
      // overwrite flow.json with fewer pages
      if (strategyPhase !== "building") {
        for (const id of newMap.keys()) {
          if (!layout.nodes.some((n) => n.id === id)) {
            newMap.delete(id);
            changed = true;
          }
        }
      }
      return changed ? newMap : prev;
    });
    setCanvasDimensions({ width: layout.width, height: layout.height });
  }, [isProjectLoading, flowManifest, flowLayoutOffset, strategyPhase, setNodePositions]);

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

    // Account for FlowFrame header height (36px) to center the full frame
    const FRAME_HEADER_HEIGHT = 36;
    const targetViewport = calculateCenteredViewport(
      { x: pos.x, y: pos.y, width: pos.width, height: pos.height + FRAME_HEADER_HEIGHT },
      containerDimensions.width,
      containerDimensions.height
    );

    const cancel = animateViewport(viewport, targetViewport, setViewport, { duration: 400 });
    setCenterOnPageId(null);

    return cancel;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [centerOnPageId, nodePositions.size]);

  // --- Track completed pages during building phase (no auto-centering) ---
  const prevCompletedPagesRef = useRef<string[]>([]);
  useEffect(() => {
    if (strategyPhase !== "building") {
      prevCompletedPagesRef.current = [];
      return;
    }
    // Track completed pages but don't auto-center — the fit-all viewport
    // from approve-solution-design already shows all frames, and viewport
    // jumps during active building are disorienting.
    prevCompletedPagesRef.current = completedPages;
  }, [strategyPhase, completedPages]);

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

  }, [setNodePositions]);

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

  }, [setNodePositions]);

  // --- Frame activation handler ---
  const handleFrameActivate = useCallback((frameId: string) => {
    setActiveFrameId(frameId);
  }, []);

  // --- Shared preview mode change across all frames and the design system ---
  const handleFramePreviewModeChange = useCallback((mode: PreviewMode) => {
    tokenState.setPreviewMode(mode);
  }, [tokenState]);

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

    canvasAddNode(newNode);
    canvasSelectNode(newNode.id);
    canvasTool.setActiveTool("cursor");
  }, [viewport, canvasAddNode, canvasSelectNode, canvasTool]);

  // Unified materialization handler (works for both modes)
  const handleMaterialize = useCallback(
    async (node: CanvasNode, nodes: Map<string, CanvasNode>, iframeDropPoint: { x: number; y: number }, pageId?: string) => {
      if (!inspection.inspectionMode) return;

      // In prototype mode, always target the active page
      const targetPageId = pageId ?? activePageId ?? undefined;

      const result = await materializeNode(node, nodes, activeFrameState ?? { x: 0, y: 0, width: DEFAULT_FRAME_WIDTH, height: DEFAULT_FRAME_HEIGHT }, iframeDropPoint, targetPageId);

      if (result.success) {
        canvasRemoveNode(node.id);
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
    [materializeNode, activeFrameState, activePageId, canvasRemoveNode, inspection.inspectionMode]
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
    // Chat stays floating during the questioning phase for a centered, focused UX.
    // Docking happens later when artifact generation begins (see effect below).
  }, []);

  // --- Auto-dock chat when AI starts generating strategy artifacts ---
  // The chat stays floating/centered during the questioning phase (hero + early problem-overview).
  // Once the AI begins streaming any artifact (insights, product overview, etc.), dock to the
  // right panel so the viewport can properly center the artifacts on canvas.
  useEffect(() => {
    if (chatMode === "floating" && strategyPhase === "problem-overview" && (streamingInsights || insightsData || streamingOverview || manifestoData)) {
      setChatMode("docked");
    }
  }, [chatMode, strategyPhase, streamingInsights, insightsData, streamingOverview, manifestoData]);

  // Document upload handler (for InsightsCard "Upload More" and hidden input)
  const handleCanvasDocumentUpload = useCallback(async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;

    const validFiles = Array.from(fileList).filter((f) => {
      const ext = f.name.split(".").pop()?.toLowerCase();
      return ext === "pdf" || ext === "docx";
    });

    if (validFiles.length === 0) return;

    const { toast } = await import("sonner");

    // Deduplicate: skip files that were already uploaded (by name)
    const existingNames = new Set(useDocumentStore.getState().documents.map((d) => d.name));
    const newFiles = validFiles.filter((f) => !existingNames.has(f.name));
    if (newFiles.length === 0) {
      toast.info("These documents have already been uploaded");
      return;
    }
    if (newFiles.length < validFiles.length) {
      toast.info(`${validFiles.length - newFiles.length} duplicate${validFiles.length - newFiles.length > 1 ? "s" : ""} skipped`);
    }

    useDocumentStore.getState().setUploading(true);

    try {
      const formData = new FormData();
      newFiles.forEach((f) => formData.append("files", f));

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

      // Trigger re-analysis — always trigger after uploading new docs
      useDocumentStore.getState().setPendingReanalysis(true);
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

  // --- Compute which section to focus the viewport on during AI strategy phases ---
  const focusSection = useMemo((): GroupId | null => {
    // problem-overview: focus on whichever section is currently streaming/just appeared
    if (strategyPhase === "problem-overview") {
      if (streamingJourneyMaps) return "journey-maps";
      if (journeyMapData) return "journey-maps";
      if (streamingPersonas) return "personas";
      if (personaData) return "personas";
      if (streamingOverview) return "product-overview";
      if (manifestoData) return "product-overview";
      return null;
    }
    // ideation: focus on ideas
    if (strategyPhase === "ideation") return "ideas";
    // solution-design: features → architecture → user-flows
    if (strategyPhase === "solution-design") {
      if (streamingUserFlows) return "user-flows";
      if (userFlowsData) return "user-flows";
      if (flowData && !userFlowsData && !streamingUserFlows) return "architecture";
      if (streamingKeyFeatures) return "key-features";
      if (activeKeyFeatures && !flowData) return "key-features";
      return null;
    }
    if (strategyPhase === "handoff") return "handoff";
    return null;
  }, [strategyPhase, streamingOverview, manifestoData, streamingPersonas, personaData,
      streamingJourneyMaps, journeyMapData, streamingKeyFeatures, activeKeyFeatures,
      flowData, streamingUserFlows, userFlowsData]);

  // --- Unified viewport animation: fit all visible groups + floating chat ---
  const prevLayoutKeyRef = useRef<string>("");
  const cancelViewportAnimRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    const visibleIds = Array.from(groupPositions.keys()).sort().join(",");
    if (visibleIds === "") return;

    // Build world-space rects from group positions + computed dimensions
    const allRects: { x: number; y: number; width: number; height: number }[] = [];
    for (const gr of groupRects) {
      const pos = groupPositions.get(gr.id);
      if (pos) {
        allRects.push({ x: pos.x, y: pos.y, width: gr.width, height: gr.height });
      }
    }
    if (allRects.length === 0) return;

    // Focus viewport on the active section during AI strategy phases
    let focusRects = allRects;
    if (focusSection && focusSection !== "ideas") {
      // For group-level sections (product-overview, key-features, architecture)
      const g = groupPositions.get(focusSection);
      const r = groupRects.find((gr) => gr.id === focusSection);
      if (g && r) {
        focusRects = [{ x: g.x, y: g.y, width: r.width, height: r.height }];
      }

      // For per-card sections, override with individual card positions
      if (focusSection === "personas" && personaPositions.length > 0) {
        focusRects = personaPositions.map((pos) => ({
          x: pos.x, y: pos.y, width: PERSONA_CARD_WIDTH, height: 420,
        }));
      } else if (focusSection === "journey-maps" && journeyMapPositions.length > 0) {
        focusRects = journeyMapPositions.map((pos) => ({
          x: pos.x, y: pos.y, width: 900, height: JOURNEY_CARD_ESTIMATED_HEIGHT,
        }));
      } else if (focusSection === "user-flows" && userFlowPositions.length > 0) {
        focusRects = userFlowPositions.map((pos) => ({
          x: pos.x, y: pos.y,
          width: USER_FLOW_CARD_WIDTH,
          height: USER_FLOW_CARD_HEIGHT,
        }));
      } else if (focusSection === "key-features" && keyFeaturesPosition) {
        const kfr = groupRects.find((gr) => gr.id === "key-features");
        if (kfr) focusRects = [{ x: keyFeaturesPosition.x, y: keyFeaturesPosition.y, width: kfr.width, height: kfr.height }];
      }
    } else if (focusSection === "ideas" && ideaPositions.length > 0) {
      // Existing ideation behavior (unchanged)
      focusRects = ideaPositions.map((pos) => ({
        x: pos.x,
        y: pos.y,
        width: IDEA_CARD_COL_WIDTH - 20,
        height: IDEA_CARD_ESTIMATED_HEIGHT,
      }));
    }

    // Compute bounding box for change detection
    const bboxW = Math.max(...focusRects.map((r) => r.x + r.width)) - Math.min(...focusRects.map((r) => r.x));
    const bboxH = Math.max(...focusRects.map((r) => r.y + r.height)) - Math.min(...focusRects.map((r) => r.y));

    // State key includes visible groups, chat mode, container size, phase, focus section,
    // item count in focused section, and content bounding box (rounded to avoid micro-jitter).
    const focusCount = focusSection === "personas" ? personaPositions.length
      : focusSection === "journey-maps" ? journeyMapPositions.length
      : focusSection === "user-flows" ? userFlowPositions.length
      : focusSection === "ideas" ? ideaPositions.length
      : 0;
    const layoutKey = `${visibleIds}:${chatMode}:${strategyPhase}:${focusSection ?? "all"}:${focusCount}:${Math.round(containerDimensions.width)}:${Math.round(bboxW / 50)}x${Math.round(bboxH / 50)}`;
    // Prototype view owns the viewport, so container resizes there should not
    // re-run the canvas auto-fit animation. Keep the key in sync so collapsing
    // prototype restores the saved viewport instead of immediately re-fitting.
    if (isFrameExpanded) {
      prevLayoutKeyRef.current = layoutKey;
      cancelViewportAnimRef.current?.();
      cancelViewportAnimRef.current = null;
      return;
    }
    if (layoutKey === prevLayoutKeyRef.current) return;
    prevLayoutKeyRef.current = layoutKey;

    // Use actual canvas container dimensions (accounts for right panel, nav bar)
    const screenW = containerDimensions.width;
    const screenH = containerDimensions.height;
    const chatWidth = 630;
    const chatHeight = 720;
    const gap = 20;

    // Cancel any in-progress viewport animation
    cancelViewportAnimRef.current?.();

    if (chatMode === "floating") {
      const worldLeft = Math.min(...focusRects.map((r) => r.x));
      const worldRight = Math.max(...focusRects.map((r) => r.x + r.width));
      const worldTop = Math.min(...focusRects.map((r) => r.y));
      const worldBottom = Math.max(...focusRects.map((r) => r.y + r.height));
      const totalWorldWidth = worldRight - worldLeft;
      const totalWorldHeight = worldBottom - worldTop;

      // Only world content scales with canvas zoom — subtract fixed-size
      // elements (chat panel + gap + padding) before computing scale.
      const availableForWorld = screenW - 80 - gap - chatWidth;
      const scaleX = availableForWorld > 0 ? availableForWorld / totalWorldWidth : 0.1;
      const scaleY = (screenH - 80) / totalWorldHeight;
      const scale = Math.min(1, Math.max(0.1, scaleX), scaleY);

      // Total rendered width: scaled world content + fixed gap + fixed chat
      const actualScreenWidth = totalWorldWidth * scale + gap + chatWidth;
      const leftMargin = (screenW - actualScreenWidth) / 2;

      const targetViewport = {
        x: leftMargin - worldLeft * scale,
        y: (screenH - totalWorldHeight * scale) / 2 - worldTop * scale,
        scale,
      };
      cancelViewportAnimRef.current = animateViewport(viewportRef.current, targetViewport, setViewport, { duration: 400 });

      // Floating chat uses position:fixed (viewport-relative), so add the
      // canvas wrapper's offset from the browser viewport origin.
      const canvasRect = canvasWrapperRef.current?.getBoundingClientRect();
      const offsetLeft = canvasRect?.left ?? 0;
      const offsetTop = canvasRect?.top ?? 0;

      const chatScreenX = offsetLeft + leftMargin + totalWorldWidth * scale + gap;
      const chatScreenY = offsetTop + (screenH - chatHeight) / 2;

      setFloatingAnimate(true);
      setFloatingRect((prev) => ({ ...prev, x: chatScreenX, y: chatScreenY }));
      const timer = setTimeout(() => setFloatingAnimate(false), 500);
      return () => clearTimeout(timer);
    } else {
      const target = calculateFitAllViewport(focusRects, screenW, screenH);
      // Nudge content rightward when right panel is visible to visually center
      // relative to the full window (compensate for panel's visual weight)
      if (showRightPanel && isEarlyStrategyPhase) {
        target.x += 40;
      }
      cancelViewportAnimRef.current = animateViewport(viewportRef.current, target, setViewport, { duration: 400 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupPositions, groupRects, chatMode, containerDimensions, strategyPhase,
      isFrameExpanded,
      focusSection, ideaPositions, personaPositions, journeyMapPositions,
      keyFeaturesPosition, userFlowPositions]);

  const handlePhaseAction = useCallback((action: "approve-problem-overview" | "approve-ideation" | "approve-solution-design") => {
    if (action === "approve-problem-overview") {
      useStrategyStore.getState().setPhase("ideation");
      // Dock the chat panel to the sidebar before ideation begins
      setChatMode("docked");
    } else if (action === "approve-ideation") {
      useStrategyStore.getState().setPhase("solution-design");
    } else if (action === "approve-solution-design") {
      if (isHandoffProject) {
        useStrategyStore.getState().updateHandoffState({
          lastError: null,
        });
        useStrategyStore.getState().setPhase("handoff");
        return;
      }

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

      // Compute flow layout offset so FlowFrames appear below strategy content (including user flows)
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

      // Clear stale node positions so ALL nodes (including "home" from the
      // initial VFS template) get fresh positions with the new flowLayoutOffset.
      setNodePositions(new Map());

      // Transition to building phase
      useStrategyStore.getState().setPhase("building");

      // Architecture snapshot is empty now (we just cleared nodePositions);
      // the flow layout useEffect will repopulate with offset-adjusted positions,
      // and the snapshot effect (line ~603) will capture them via requestAnimationFrame.
      architecturePositionsRef.current = null;

      // Animate viewport to center on all FlowFrames (not strategy content).
      // Use setTimeout to let the flow layout useEffect populate nodePositionsRef
      // before we read them. The 36px accounts for the FlowFrame header.
      const FRAME_HEADER_HEIGHT = 36;
      setTimeout(() => {
        const positions = Array.from(nodePositionsRef.current.values());
        if (positions.length > 0) {
          const rects = positions.map((pos) => ({
            x: pos.x,
            y: pos.y,
            width: pos.width,
            height: pos.height + FRAME_HEADER_HEIGHT,
          }));
          const target = calculateFitAllViewport(rects, containerDimensions.width, containerDimensions.height);
          animateViewport(viewportRef.current, target, setViewport, { duration: 500 });
        } else {
          // Fallback: use computed offset as estimated position for a single frame
          const fallbackRect = {
            x: overviewPosForOffset.x - 50,
            y: flowYOffset - 50,
            width: DEFAULT_FRAME_WIDTH,
            height: DEFAULT_FRAME_HEIGHT + FRAME_HEADER_HEIGHT,
          };
          const target = calculateFitAllViewport([fallbackRect], containerDimensions.width, containerDimensions.height);
          animateViewport(viewportRef.current, target, setViewport, { duration: 500 });
        }
      }, 50);
    }
  }, [containerDimensions, groupPositions, groupRects, isHandoffProject, setNodePositions, setViewport, writeFile]);

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
  const isEarlyStrategyPhase =
    strategyPhase === "hero" ||
    strategyPhase === "problem-overview" ||
    strategyPhase === "ideation" ||
    strategyPhase === "solution-design" ||
    strategyPhase === "handoff";
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

  if (isProjectLoading) {
    return (
      <main className="w-screen h-screen flex items-center justify-center bg-neutral-50">
        <div className="flex flex-col items-center gap-3">
          <LoaderIcon className="w-6 h-6 animate-spin text-neutral-400" />
          <p className="text-sm text-neutral-500">Loading project...</p>
        </div>
      </main>
    );
  }

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
            <button
              onClick={() => router.push("/")}
              className="p-1.5 text-neutral-500 hover:text-neutral-900 transition-colors rounded-md hover:bg-neutral-100"
              title="Back to dashboard"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <EditableTitle value={projectName} onSave={handleRename} />
            {saveStatus === "saving" && (
              <span className="ml-2 text-xs text-neutral-400">Saving...</span>
            )}
            {saveStatus === "saved" && (
              <span className="ml-2 text-xs text-emerald-500">Saved</span>
            )}

            {/* Phase indicator during strategy phases */}
            {isEarlyStrategyPhase && (
              <div className="flex items-center gap-2 ml-2">
                <span className="text-sm text-neutral-500">
                  {strategyPhase === "problem-overview" && "Defining Problem"}
                  {strategyPhase === "ideation" && "Exploring Ideas"}
                  {strategyPhase === "solution-design" && "Designing Solution"}
                  {strategyPhase === "handoff" && "Preparing Handoff"}
                </span>
              </div>
            )}
          </div>

          {/* Action buttons on far right */}
          {!isEarlyStrategyPhase && viewMode === "app" && (
            <div className="flex items-center gap-2">
              <div className="relative group">
                <button
                  onClick={() => setGlobalRefreshCounter((c) => c + 1)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-neutral-600 hover:text-neutral-900 border border-neutral-300 rounded-md hover:border-neutral-400 transition-colors"
                >
                  <RefreshCw className="w-4 h-4" />
                </button>
                <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 px-2 py-1 bg-neutral-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50">
                  Refresh all frames
                </div>
              </div>
              {/* Annotations split button — toggle + action menu */}
              {!isFrameExpanded && manifestoData && personaData && completedPages.length > 0 && (() => {
                const hasConnections = brainData?.pages?.some((p) => p.connections.length > 0) ?? false;
                const annotationsActive = annotationActiveFrames.size > 0;
                const splitButtonBorderClass = annotationsActive
                  ? "border-amber-300"
                  : strategyUpdatedAfterBuild
                    ? "border-blue-300"
                    : "border-neutral-300";
                const splitButtonDividerClass = annotationsActive
                  ? "bg-amber-300"
                  : strategyUpdatedAfterBuild
                    ? "bg-blue-300"
                    : "bg-neutral-300";
                return (
                  <div className={`flex items-stretch rounded-md border bg-white transition-colors ${
                    splitButtonBorderClass
                  } ${strategyUpdatedAfterBuild ? "animate-pulse" : ""}`}>
                    <button
                      type="button"
                      onClick={() => {
                        if (!hasConnections || !brainData) return;
                        const pagesWithConnections = brainData.pages
                          .filter((p) => p.connections.length > 0)
                          .map((p) => p.pageId);
                        if (annotationsActive) {
                          closeAllAnnotations();
                        } else {
                          openAllAnnotations(pagesWithConnections);
                        }
                      }}
                      className={`relative flex items-center px-3 py-1.5 text-sm font-medium transition-colors group/ann ${
                        !hasConnections
                          ? "text-neutral-400 cursor-default"
                          : annotationsActive
                            ? "bg-amber-50 text-amber-700 hover:bg-amber-100"
                            : "text-neutral-900 hover:bg-neutral-50"
                      }`}
                    >
                      Annotations
                      <div className="absolute top-full left-0 mt-2 px-2 py-1 bg-neutral-900 text-white text-xs rounded opacity-0 group-hover/ann:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50">
                        {!hasConnections ? "No annotations available — open the menu to generate" : annotationsActive ? "Hide all annotations" : "Show all annotations"}
                      </div>
                    </button>
                    <div className={`w-px ${splitButtonDividerClass}`} />
                    <Popover open={isAnnotationsMenuOpen} onOpenChange={setIsAnnotationsMenuOpen}>
                      <PopoverTrigger
                        type="button"
                        disabled={isReEvaluating}
                        className={`relative flex items-center px-2.5 py-1.5 transition-colors group/chevron ${
                          strategyUpdatedAfterBuild || (!hasConnections && !isReEvaluating)
                            ? "bg-blue-50 text-blue-700 hover:bg-blue-100"
                            : isReEvaluating
                              ? "cursor-not-allowed text-neutral-400"
                              : "text-neutral-900 hover:bg-neutral-50"
                        }`}
                      >
                        <ChevronDown className="h-4 w-4" />
                        <div className="absolute top-full right-0 mt-2 px-2 py-1 bg-neutral-900 text-white text-xs rounded opacity-0 group-hover/chevron:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50">
                          {!hasConnections ? "Generate annotations" : strategyUpdatedAfterBuild ? "Strategy changed — re-evaluate annotations" : isReEvaluating ? "Evaluating annotations…" : "Annotation actions"}
                        </div>
                      </PopoverTrigger>
                      <PopoverContent
                        align="end"
                        side="bottom"
                        sideOffset={8}
                        className="w-52 rounded-2xl border border-neutral-200 bg-white p-1.5 shadow-lg"
                      >
                        <button
                          type="button"
                          onClick={() => {
                            setIsAnnotationsMenuOpen(false);
                            void handleReEvaluateAnnotations();
                          }}
                          disabled={isReEvaluating}
                          className={`flex w-full items-center rounded-xl px-3 py-2 text-left text-sm font-medium transition-colors ${
                            isReEvaluating
                              ? "cursor-not-allowed text-neutral-400"
                              : "text-neutral-900 hover:bg-neutral-100"
                          }`}
                        >
                          Refresh annotation
                        </button>
                      </PopoverContent>
                    </Popover>
                  </div>
                );
              })()}
              {/* View mode segmented control */}
              <div className="relative flex items-center bg-neutral-100 border border-neutral-200 rounded-lg p-0.5">
                {/* Sliding active indicator */}
                <div
                  className="absolute top-0.5 left-0.5 w-8 h-7 bg-white rounded-md shadow-sm transition-transform duration-200 ease-out"
                  style={{ transform: isFrameExpanded ? "translateX(100%)" : "translateX(0)" }}
                />
                <button
                  onClick={isFrameExpanded ? handlePrototypeToggle : undefined}
                  className={`relative z-10 flex items-center justify-center w-8 h-7 rounded-md transition-colors duration-200 group/canvas ${
                    !isFrameExpanded
                      ? "text-neutral-900"
                      : "text-neutral-500 hover:text-neutral-700"
                  }`}
                >
                  <GitBranch className="w-4 h-4" />
                  <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 px-2 py-1 bg-neutral-900 text-white text-xs rounded opacity-0 group-hover/canvas:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50">
                    Canvas View
                  </div>
                </button>
                <button
                  onClick={!isFrameExpanded ? handlePrototypeToggle : undefined}
                  className={`relative z-10 flex items-center justify-center w-8 h-7 rounded-md transition-colors duration-200 group/proto ${
                    isFrameExpanded
                      ? "text-neutral-900"
                      : "text-neutral-500 hover:text-neutral-700"
                  }`}
                >
                  <Monitor className="w-4 h-4" />
                  <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 px-2 py-1 bg-neutral-900 text-white text-xs rounded opacity-0 group-hover/proto:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50">
                    Prototype View
                  </div>
                </button>
              </div>
              <div className="relative group">
                <button
                  onClick={isPro ? () => setViewMode("design-system") : undefined}
                  className={`px-3 py-1.5 text-sm font-medium border rounded-md transition-colors flex items-center gap-1.5 ${
                    isPro
                      ? "text-neutral-600 hover:text-neutral-900 border-neutral-300 hover:border-neutral-400 cursor-pointer"
                      : "text-neutral-400 border-neutral-200 cursor-default"
                  }`}
                >
                  {!isPro && <Lock className="w-3.5 h-3.5" />}
                  Design System
                </button>
                {!isPro && (
                  <div className="absolute top-full right-0 mt-2 px-2 py-1 bg-neutral-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50">
                    Access prebuilt styles and custom design systems on the Pro plan.
                  </div>
                )}
              </div>
              <button
                onClick={() => setPublishDialogOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-neutral-600 hover:text-neutral-900 border border-neutral-300 rounded-md hover:border-neutral-400 transition-colors"
              >
                <Share className="w-4 h-4" />
                Publish
              </button>
              <AccountMenu className="relative flex items-center gap-2" showUpgradePill={false} />
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
            onCanvasClick={handleCanvasBackgroundClick}
            hideChrome={isFrameExpanded}
          >
            {/* Strategy artifacts — placed directly on canvas, left to right */}

            {/* Insights Card — first group, left of manifesto */}
            {(() => {
              const g = getGroupOrigin("insights");
              if (!g) return null;
              const data = (isDeepDive && streamingInsights && insightsData)
                ? { ...insightsData, ...streamingInsights }
                : (insightsData || streamingInsights || { insights: [], documents: [] });
              return (
                <InsightsCard
                  data={data}
                  x={g.x}
                  y={g.y}
                  onMove={(nx, ny) => setGroupPositions((prev) => new Map(prev).set("insights", { x: nx, y: ny }))}
                  onUploadMore={() => documentInputRef.current?.click()}
                  isUploading={isDocUploading}
                  onCommit={insightsData ? handleInsightsCommit : undefined}
                  isSelected={selectedArtifactId === "insights"}
                  onSelect={() => selectArtifact("insights")}
                />
              );
            })()}

            {(manifestoData || streamingOverview) && (() => {
              const g = getGroupOrigin("product-overview");
              if (!g) return null;
              return (
                <ManifestoCard
                  manifestoData={(isDeepDive && streamingOverview && manifestoData)
                    ? { ...manifestoData, ...streamingOverview }
                    : (manifestoData || streamingOverview!)}
                  x={g.x}
                  y={g.y}
                  onMove={(nx, ny) => {
                    setGroupPositions((prev) => new Map(prev).set("product-overview", { x: nx, y: ny }));
                  }}
                  jtbdCoverage={coverageSummary?.jtbdCoverage}
                  coverageSummary={coverageSummary}
                  coverageDisplayState={coverageDisplayState}
                  coverageProgressNote={coverageProgressNote}
                  onAddressGaps={() => {
                    if (!coverageSummary || coverageSummary.gaps.length === 0) return;
                    // Globally unaddressed JTBDs (for backward compat)
                    const unaddressedJtbds = coverageSummary.jtbdCoverage
                      .filter((j) => !j.addressed)
                      .map((j) => ({ index: j.index, text: j.text }));
                    useChatContextStore.getState().setPendingAddressGaps({
                      unaddressedJtbds,
                      gaps: coverageSummary.gaps,
                    });
                    setRightPanelTab("chat");
                  }}
                  onCommit={manifestoData ? handleManifestoCommit : undefined}
                  isSelected={selectedArtifactId === "product-overview"}
                  onSelect={() => selectArtifact("product-overview")}
                />
              );
            })()}

            {(() => {
              const effectivePersonas = (isDeepDive && streamingPersonas && personaData)
                ? mergeByKey(personaData, streamingPersonas, "name")
                : (personaData || streamingPersonas);
              return effectivePersonas && effectivePersonas.map((persona, index) => {
              const g = getGroupOrigin("personas");
              if (!g) return null;
              const pos = personaPositions[index];
              const artifactId = `persona-${index}`;
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
                  onCommit={personaData ? (nextPersona) => handlePersonaCommit(index, nextPersona) : undefined}
                  isSelected={selectedArtifactId === artifactId}
                  onSelect={() => selectArtifact(artifactId)}
                />
              );
            });
            })()}

            {(() => {
              const effectiveJourneyMaps = (isDeepDive && streamingJourneyMaps && journeyMapData)
                ? mergeByKey(journeyMapData, streamingJourneyMaps, "personaName")
                : (journeyMapData || streamingJourneyMaps);
              return effectiveJourneyMaps && effectiveJourneyMaps.map((map, index) => {
              const g = getGroupOrigin("journey-maps");
              if (!g) return null;
              const pos = journeyMapPositions[index];
              const artifactId = `journey-${index}`;
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
                  onCommit={journeyMapData ? (nextJourneyMap) => handleJourneyMapCommit(index, nextJourneyMap) : undefined}
                  isSelected={selectedArtifactId === artifactId}
                  onSelect={() => selectArtifact(artifactId)}
                />
              );
            });
            })()}

            {(() => {
              const effectiveIdeas = (ideaData && streamingIdeas)
                ? mergeByKey(ideaData, streamingIdeas, "id")
                : (ideaData || streamingIdeas);
              return effectiveIdeas && effectiveIdeas.map((idea, index) => {
              const g = getGroupOrigin("ideas");
              if (!g) return null;
              const pos = ideaPositions[index];
              const artifactId = `idea-${idea.id ?? index}`;
              return (
                <IdeaCard
                  key={idea.id ?? index}
                  idea={idea}
                  x={pos?.x ?? g.x + (index % 4) * IDEA_CARD_COL_WIDTH}
                  y={pos?.y ?? getIdeaRowY(Math.floor(index / 4), g.y)}
                  index={index}
                  isActive={selectedArtifactId === artifactId}
                  onSelectArtifact={() => selectArtifact(artifactId)}
                  isSelectedIdea={idea.id === selectedIdeaId}
                  onToggleSelectedIdea={() => {
                    if (idea.id) {
                      handleSelectedIdeaChange(idea.id === selectedIdeaId ? null : idea.id);
                    }
                  }}
                  onMove={(nx, ny) => {
                    ideaDraggedRef.current.add(index);
                    setIdeaPositions((prev) => {
                      const updated = [...prev];
                      updated[index] = { x: nx, y: ny };
                      return updated;
                    });
                  }}
                  onHeightMeasured={(h) => handleIdeaHeightMeasured(index, h)}
                  onCommit={ideaData ? (nextIdea) => handleIdeaCommit(index, nextIdea) : undefined}
                />
              );
            });
            })()}

            {activeKeyFeatures && (() => {
              const g = getGroupOrigin("key-features");
              if (!g) return null;
              return (
                <KeyFeaturesCard
                  data={activeKeyFeatures}
                  x={keyFeaturesPosition?.x ?? g.x}
                  y={keyFeaturesPosition?.y ?? g.y}
                  onMove={(nx, ny) => setKeyFeaturesPosition({ x: nx, y: ny })}
                  onCommit={keyFeaturesData ? handleKeyFeaturesCommit : undefined}
                  isSelected={selectedArtifactId === "key-features"}
                  onSelect={() => selectArtifact("key-features")}
                />
              );
            })()}

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

            {/* User Flow Cards — visible during solution-design phase */}
            {activeUserFlows && activeUserFlows.map((flow, index) => {
              const g = getGroupOrigin("user-flows");
              if (!g) return null;
              const pos = userFlowPositions[index];
              const artifactId = `user-flow-${flow.id ?? index}`;
              return (
                <UserFlowCard
                  key={flow.id ?? `flow-${index}`}
                  flow={flow}
                  flowData={flowData}
                  personas={personaData}
                  x={pos?.x ?? g.x}
                  y={pos?.y ?? g.y + index * (USER_FLOW_CARD_HEIGHT + USER_FLOW_CARD_GAP)}
                  onMove={(nx, ny) => setUserFlowPositions((prev) => {
                    const updated = [...prev];
                    updated[index] = { x: nx, y: ny };
                    return updated;
                  })}
                  onCommit={userFlowsData ? (nextUserFlow) => handleUserFlowCommit(index, nextUserFlow) : undefined}
                  isSelected={selectedArtifactId === artifactId}
                  onSelect={() => selectArtifact(artifactId)}
                />
              );
            })}

            {isHandoffProject && strategyPhase === "handoff" && (() => {
              const g = getGroupOrigin("handoff");
              if (!g) return null;

              return (
                <HandoffMarkdownCard
                  projectName={projectName}
                  x={g.x}
                  y={g.y}
                  fullMarkdown={handoffState.fullMarkdown}
                  latestDeltaMarkdown={handoffState.latestDeltaMarkdown}
                  dirtySections={handoffState.dirtySections}
                  isOutdated={handoffState.isOutdated}
                  generatedAt={handoffState.generatedAt}
                  lastError={handoffState.lastError}
                  isGenerating={handoffGenerationStatus === "generating"}
                  onMove={(nx, ny) =>
                    setGroupPositions((prev) => new Map(prev).set("handoff", { x: nx, y: ny }))
                  }
                  onRegenerate={() => {
                    void generateHandoffMarkdown(
                      handoffState.baselineSnapshot ? "regenerate" : "initial"
                    );
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

              const pageDec = brainData?.pages?.find((p) => p.pageId === page.id);

              return (
                <FlowFrame
                  key={page.id}
                  page={page}
                  position={position}
                  files={shadowFiles}
                  previewMode={tokenState.previewMode}
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
                  annotationsAvailable={!!pageDec?.connections.length}
                  annotationsOpen={annotationActiveFrames.has(page.id)}
                  onAnnotationsOpenChange={() => toggleAnnotationFrame(page.id)}
                />
              );
            })}

            {/* Strategy Annotations — per-frame annotation cards */}
            {!isEarlyStrategyPhase && !isFrameExpanded && manifestoData && personaData && visiblePages.map((page) => {
              if (!annotationActiveFrames.has(page.id)) return null;
              const pos = nodePositions.get(page.id);
              if (!pos) return null;
              const pageDec = brainData?.pages?.find((p) => p.pageId === page.id);
              if (!pageDec || pageDec.connections.length === 0) return null;
              return (
                <StrategyAnnotations
                  key={`annot-${page.id}`}
                  pageId={page.id}
                  position={pos}
                  connections={pageDec.connections}
                  bounds={annotationBounds.get(page.id) ?? new Map()}
                  manifestoData={manifestoData}
                  personaData={personaData}
                  insightsData={insightsData}
                  isFrameActive={isFrameActive(page.id)}
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

        {/* Design System: Full-width preview — unmounted during early strategy phases
            to avoid SandpackProvider re-render cascades from rapid Zustand updates */}
        {!isEarlyStrategyPhase && isPro && (
          <div className={`flex-1 flex flex-col h-full ${viewMode !== "design-system" ? "hidden" : ""}`}>
            <div className="flex items-center gap-2 px-4 py-2 border-b border-neutral-200 bg-white shrink-0">
              <button
                onClick={() => setViewMode("app")}
                className="p-1 hover:bg-neutral-100 rounded transition-colors"
                title="Back to app"
              >
                <ChevronLeft className="w-4 h-4 text-neutral-500" />
              </button>
              <h2 className="text-sm font-medium text-neutral-700">Design System</h2>
            </div>
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
        )}

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
          getLatestFile={getLatestFile}
          activePageId={activeContextPage?.id ?? null}
          activePageName={activeContextPage?.name ?? null}
          activeRoute={activeContextPage?.route ?? activeRoute}
          initialMessages={initialMessages}
          onMessagesChange={handleMessagesChange}
          initialInput={initialInput}
          autoSubmit={autoSubmit}
          pendingRepairDraft={pendingRepairDraft}
          onBuildingResponseComplete={handleAutoReEvaluateAnnotations}
          onAnnotatedDeleteRequest={setPendingAnnotatedDelete}
          projectId={projectId}
        />

        {/* Token Studio - only shown in design-system mode */}
        {viewMode === "design-system" && !isEarlyStrategyPhase && isPro && (
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

      {/* Annotated element delete confirmation modal */}
      {pendingAnnotatedDelete && (
        <AnnotatedDeleteModal
          info={pendingAnnotatedDelete}
          onClose={() => setPendingAnnotatedDelete(null)}
          manifestoJtbd={manifestoData?.jtbd}
        />
      )}

      {/* Billing limit modal */}
      <BillingLimitModal />
    </main>
  );
}
