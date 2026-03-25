"use client";

import { create } from "zustand";
import type { CoverageDisplayState } from "../lib/product-brain/types.ts";
import type { HandoffState, ProductMode } from "../lib/handoff/types.ts";
import { createEmptyHandoffState, normalizeHandoffState } from "../lib/handoff/types.ts";
import {
  createDeterministicTraceableId,
  normalizeTraceableTextList,
  type TraceableTextItem,
} from "../lib/strategy/traceable.ts";

export type StrategyPhase =
  | "hero"
  | "problem-overview"
  | "ideation"
  | "solution-design"
  | "handoff"
  | "building"
  | "editing"
  | "complete";

export type EditContextSource = "follow-up-edit" | "address-gaps" | "repair";

export type EditChangeMode =
  | "follow-up-edit"
  | "address-gaps"
  | "strategy-rebuild"
  | "untracked";

export interface EditContext {
  source: EditContextSource;
  activePageId: string | null;
  activePageName: string | null;
  activeRoute: string | null;
  pinnedPageIds: string[];
  gapContext?: string;
}

export interface EditScope {
  aligned: boolean;
  targetPageIds: string[];
  unchangedPageIds: string[];
  addedPageIds: string[];
  removedPageIds: string[];
  requiresClarification: boolean;
  requiresArtifactUpdateDecision: boolean;
  concerns: string[];
  changeMode: EditChangeMode;
}

export interface ConfidenceDimension {
  score: number;    // 0-100
  summary: string;  // What the AI knows so far
}

export interface ConfidenceData {
  overall: number;  // 0-100
  dimensions: {
    targetUser: ConfidenceDimension;
    coreProblem: ConfidenceDimension;
    currentWorkflow: ConfidenceDimension;
    domainContext: ConfidenceDimension;
    stakesAndImpact: ConfidenceDimension;
  };
}

export interface PersonaData {
  name: string;
  role: string;        // e.g. "Marketing Manager at SaaS startup"
  bio: string;         // 1-2 sentence bio
  goals: string[];     // 2-3 goals
  painPoints: TraceableTextItem[];// 2-3 pain points
  quote: string;       // First-person key quote
}

export interface JourneyStage {
  stage: string;         // AI-decided stage name (e.g. "Awareness", "Onboarding")
  actions: string[];     // What the user does
  thoughts: string[];    // What the user thinks
  emotion: string;       // Single emoji or short word (e.g. "frustrated", "hopeful")
  painPoints: TraceableTextItem[];  // Friction points
  opportunities: string[]; // Design opportunities
}

export interface JourneyMapData {
  personaName: string;   // Links to which persona this map belongs to
  stages: JourneyStage[];
}

export interface IdeaData {
  id: string;
  title: string;
  description: string;
  illustration: string; // single SVG string
}

export type CustomIdeaFlowMode = "idle" | "collecting" | "clarifying" | "paused";
export type CustomIdeaFlowAwaiting = "none" | "user" | "assistant";

export interface CustomIdeaFlowState {
  mode: CustomIdeaFlowMode;
  draftText: string;
  awaiting: CustomIdeaFlowAwaiting;
  confirmationSummary: string;
  clarificationQuestions: string[];
  readyIdeaId: string | null;
}

export interface KeyFeatureData {
  id: string;
  name: string;
  description: string;
  priority: "high" | "medium" | "low";
  jtbdIds: string[];
  painPointIds: string[];
}

export interface KeyFeaturesData {
  ideaTitle: string;
  features: KeyFeatureData[];
}

export interface UserFlowStep {
  nodeId: string;         // References a StrategyNode.id from the IA
  action: string;         // Brief action annotation (e.g., "Reviews analytics")
}

export interface UserFlow {
  id: string;
  jtbdIndex: number;      // 0-based index into ManifestoData.jtbd[]
  jtbdText: string;       // Full JTBD text for display
  personaNames: string[]; // Must match PersonaData.name exactly
  steps: UserFlowStep[];
}

export interface ManifestoData {
  title: string;
  problemStatement: string;
  targetUser: string;
  environmentContext: string;
  jtbd: TraceableTextItem[];
  hmw: string[];
}

export interface StrategyNode {
  id: string;
  label: string;
  type: "page" | "action" | "decision" | "data";
  description?: string;
  jtbdIds?: string[];    // Optional page-level JTBD traceability for exports
  featureIds?: string[]; // Optional page-level feature traceability for exports
}

export interface StrategyConnection {
  from: string;
  to: string;
  label?: string;
}

export interface FlowData {
  nodes: StrategyNode[];
  connections: StrategyConnection[];
}

function trimText(value: string | null | undefined): string {
  return value?.trim() ?? "";
}

function normalizeStringList(values: string[] | null | undefined): string[] {
  return (values ?? []).map(trimText).filter(Boolean);
}

function normalizeIdList(values: string[] | null | undefined): string[] {
  return normalizeStringList(values);
}

function normalizeManifestoState(
  data: ManifestoData,
  previous: ManifestoData | null | undefined
): ManifestoData {
  return {
    title: trimText(data.title),
    problemStatement: trimText(data.problemStatement),
    targetUser: trimText(data.targetUser),
    environmentContext: trimText(data.environmentContext),
    jtbd: normalizeTraceableTextList({
      values: data.jtbd,
      prefix: "jtbd",
      previous: previous?.jtbd,
    }),
    hmw: normalizeStringList(data.hmw),
  };
}

function normalizePersonaState(
  data: PersonaData,
  previous: PersonaData | null | undefined
): PersonaData {
  return {
    name: trimText(data.name),
    role: trimText(data.role),
    bio: trimText(data.bio),
    goals: normalizeStringList(data.goals),
    painPoints: normalizeTraceableTextList({
      values: data.painPoints,
      prefix: "persona-pain",
      previous: previous?.painPoints,
    }),
    quote: trimText(data.quote),
  };
}

function normalizeJourneyStageState(
  data: JourneyStage,
  previous: JourneyStage | null | undefined
): JourneyStage | null {
  const normalized: JourneyStage = {
    stage: trimText(data.stage),
    actions: normalizeStringList(data.actions),
    thoughts: normalizeStringList(data.thoughts),
    emotion: trimText(data.emotion),
    painPoints: normalizeTraceableTextList({
      values: data.painPoints,
      prefix: "journey-pain",
      previous: previous?.painPoints,
    }),
    opportunities: normalizeStringList(data.opportunities),
  };

  if (
    !normalized.stage &&
    normalized.actions.length === 0 &&
    normalized.thoughts.length === 0 &&
    !normalized.emotion &&
    normalized.painPoints.length === 0 &&
    normalized.opportunities.length === 0
  ) {
    return null;
  }

  return normalized;
}

function normalizeJourneyMapState(
  data: JourneyMapData,
  previous: JourneyMapData | null | undefined
): JourneyMapData {
  return {
    personaName: trimText(data.personaName),
    stages: (data.stages ?? [])
      .map((stage, index) => normalizeJourneyStageState(stage, previous?.stages?.[index] ?? null))
      .filter((stage): stage is JourneyStage => Boolean(stage)),
  };
}

function normalizeCustomIdeaFlowState(
  data: CustomIdeaFlowState | null | undefined
): CustomIdeaFlowState {
  return {
    mode:
      data?.mode === "collecting" ||
      data?.mode === "clarifying" ||
      data?.mode === "paused"
        ? data.mode
        : "idle",
    draftText: trimText(data?.draftText),
    awaiting:
      data?.awaiting === "user" || data?.awaiting === "assistant"
        ? data.awaiting
        : "none",
    confirmationSummary: trimText(data?.confirmationSummary),
    clarificationQuestions: normalizeStringList(data?.clarificationQuestions),
    readyIdeaId: trimText(data?.readyIdeaId) || null,
  };
}

function normalizeFeatureState(
  feature: KeyFeatureData,
  index: number,
  previousFeatures: KeyFeatureData[]
): KeyFeatureData {
  const nextName = trimText(feature.name);
  const nextDescription = trimText(feature.description);
  const previousBySignature = previousFeatures.find(
    (item) =>
      trimText(item?.name).toLowerCase() === nextName.toLowerCase() &&
      trimText(item?.description).toLowerCase() === nextDescription.toLowerCase()
  );
  const previousByName = previousFeatures.find(
    (item) => trimText(item?.name).toLowerCase() === nextName.toLowerCase()
  );
  const sameIndex = previousFeatures[index];

  return {
    id:
      trimText(feature.id) ||
      sameIndex?.id ||
      previousBySignature?.id ||
      previousByName?.id ||
      createDeterministicTraceableId("feature", `${index}:${nextName}:${nextDescription}`),
    name: nextName,
    description: nextDescription,
    priority:
      feature.priority === "high" || feature.priority === "medium" || feature.priority === "low"
        ? feature.priority
        : "medium",
    jtbdIds: normalizeIdList(feature.jtbdIds),
    painPointIds: normalizeIdList(feature.painPointIds),
  };
}

function normalizeKeyFeaturesState(
  data: KeyFeaturesData,
  previous: KeyFeaturesData | null | undefined
): KeyFeaturesData {
  const previousFeatures = previous?.features ?? [];
  return {
    ideaTitle: trimText(data.ideaTitle),
    features: (data.features ?? [])
      .map((feature, index) => normalizeFeatureState(feature, index, previousFeatures))
      .filter((feature) => feature.name || feature.description),
  };
}

function normalizeUserFlowState(data: UserFlow): UserFlow {
  return {
    ...data,
    id: trimText(data.id),
    jtbdText: trimText(data.jtbdText),
    personaNames: normalizeStringList(data.personaNames),
    steps: (data.steps ?? [])
      .map((step) => {
        const nodeId = trimText(step.nodeId);
        const action = trimText(step.action);
        if (!nodeId && !action) return null;
        return { nodeId, action };
      })
      .filter((step): step is UserFlowStep => Boolean(step)),
  };
}

function normalizeStrategyNodeState(node: StrategyNode): StrategyNode | null {
  const id = trimText(node.id);
  const label = trimText(node.label);
  const description = trimText(node.description);

  if (!id && !label && !description) {
    return null;
  }

  return {
    id,
    label,
    type: node.type,
    ...(description ? { description } : {}),
    ...(node.type === "page"
      ? {
          ...(Array.isArray(node.jtbdIds)
            ? { jtbdIds: normalizeIdList(node.jtbdIds) }
            : {}),
          ...(Array.isArray(node.featureIds)
            ? { featureIds: normalizeIdList(node.featureIds) }
            : {}),
        }
      : {}),
  };
}

function normalizeFlowState(data: FlowData): FlowData {
  return {
    nodes: (data.nodes ?? [])
      .map(normalizeStrategyNodeState)
      .filter((node): node is StrategyNode => Boolean(node)),
    connections: (data.connections ?? [])
      .map((connection) => ({
        from: trimText(connection.from),
        to: trimText(connection.to),
        label: trimText(connection.label),
      }))
      .filter((connection) => connection.from && connection.to)
      .map((connection) => ({
        from: connection.from,
        to: connection.to,
        ...(connection.label ? { label: connection.label } : {}),
      })),
  };
}

interface StrategyState {
  phase: StrategyPhase;
  userPrompt: string;
  manifestoData: ManifestoData | null;
  streamingOverview: Partial<ManifestoData> | null;
  personaData: PersonaData[] | null;
  streamingPersonas: Partial<PersonaData>[] | null;
  flowData: FlowData | null;
  confidenceData: ConfidenceData | null;
  journeyMapData: JourneyMapData[] | null;
  streamingJourneyMaps: Partial<JourneyMapData>[] | null;
  ideaData: IdeaData[] | null;
  streamingIdeas: Partial<IdeaData>[] | null;
  selectedIdeaId: string | null;
  customIdeaFlow: CustomIdeaFlowState;
  completedPages: string[];
  currentBuildingPage: string | null;
  currentBuildingPages: string[];
  editContext: EditContext | null;
  editScope: EditScope | null;
  activeEditingPageIds: string[];
  // Deep-dive mode (re-enter questioning phase after initial overview generation)
  isDeepDive: boolean;

  // Key features data (from solution-design phase)
  keyFeaturesData: KeyFeaturesData | null;
  streamingKeyFeatures: Partial<KeyFeaturesData> | null;

  // User flow data (JTBD-based flows through the IA, from solution-design phase)
  userFlowsData: UserFlow[] | null;
  streamingUserFlows: Partial<UserFlow>[] | null;

  // Flag: strategy artifacts were updated after pages were already built (triggers re-evaluation prompt)
  strategyUpdatedAfterBuild: boolean;

  // Coverage card state when no product-brain snapshot is available
  coverageDisplayState: CoverageDisplayState;

  // Journey map auto-continuation (for incomplete multi-persona generations)
  journeyMapContinueAttempts: number;
  isJourneyMapContinuing: boolean;

  // Pages that passed verification in parallel build
  verifiedPages: string[];
  productMode: ProductMode | null;
  handoff: HandoffState;

  // Actions
  setPhase: (phase: StrategyPhase) => void;
  setProductMode: (mode: ProductMode | null) => void;
  setHandoffState: (handoff: HandoffState) => void;
  updateHandoffState: (patch: Partial<HandoffState>) => void;
  setUserPrompt: (prompt: string) => void;
  setManifestoData: (data: ManifestoData) => void;
  setStreamingOverview: (data: Partial<ManifestoData> | null) => void;
  setPersonaData: (data: PersonaData[]) => void;
  setStreamingPersonas: (data: Partial<PersonaData>[] | null) => void;
  setFlowData: (data: FlowData) => void;
  setConfidenceData: (data: ConfidenceData) => void;
  setJourneyMapData: (data: JourneyMapData[]) => void;
  setStreamingJourneyMaps: (data: Partial<JourneyMapData>[] | null) => void;
  setIdeaData: (data: IdeaData[]) => void;
  setStreamingIdeas: (data: Partial<IdeaData>[] | null) => void;
  setSelectedIdeaId: (id: string | null) => void;
  setCustomIdeaFlow: (data: Partial<CustomIdeaFlowState>) => void;
  resetCustomIdeaFlow: () => void;
  addCompletedPage: (pageId: string) => void;
  setBuildingPage: (pageId: string | null) => void;
  setBuildingPages: (pageIds: string[]) => void;
  setEditContext: (context: EditContext | null) => void;
  setEditScope: (scope: EditScope | null) => void;
  setActiveEditingPageIds: (pageIds: string[]) => void;
  clearEditSession: () => void;
  setDeepDive: (v: boolean) => void;
  setKeyFeaturesData: (data: KeyFeaturesData) => void;
  setStreamingKeyFeatures: (data: Partial<KeyFeaturesData> | null) => void;
  setUserFlowsData: (data: UserFlow[]) => void;
  setStreamingUserFlows: (data: Partial<UserFlow>[] | null) => void;
  setStrategyUpdatedAfterBuild: (v: boolean) => void;
  setCoverageDisplayState: (state: CoverageDisplayState) => void;
  setJourneyMapContinueAttempts: (n: number) => void;
  setIsJourneyMapContinuing: (v: boolean) => void;
  addVerifiedPage: (pageId: string) => void;
  hydrate: (data: Partial<typeof initialState>) => void;
  reset: () => void;
}

const initialState = {
  phase: "hero" as StrategyPhase,
  userPrompt: "",
  manifestoData: null as ManifestoData | null,
  streamingOverview: null as Partial<ManifestoData> | null,
  personaData: null as PersonaData[] | null,
  streamingPersonas: null as Partial<PersonaData>[] | null,
  flowData: null as FlowData | null,
  confidenceData: null as ConfidenceData | null,
  journeyMapData: null as JourneyMapData[] | null,
  streamingJourneyMaps: null as Partial<JourneyMapData>[] | null,
  ideaData: null as IdeaData[] | null,
  streamingIdeas: null as Partial<IdeaData>[] | null,
  selectedIdeaId: null as string | null,
  customIdeaFlow: {
    mode: "idle",
    draftText: "",
    awaiting: "none",
    confirmationSummary: "",
    clarificationQuestions: [],
    readyIdeaId: null,
  } as CustomIdeaFlowState,
  completedPages: [] as string[],
  currentBuildingPage: null as string | null,
  currentBuildingPages: [] as string[],
  editContext: null as EditContext | null,
  editScope: null as EditScope | null,
  activeEditingPageIds: [] as string[],
  isDeepDive: false,
  keyFeaturesData: null as KeyFeaturesData | null,
  streamingKeyFeatures: null as Partial<KeyFeaturesData> | null,
  userFlowsData: null as UserFlow[] | null,
  streamingUserFlows: null as Partial<UserFlow>[] | null,
  strategyUpdatedAfterBuild: false,
  coverageDisplayState: "pending" as CoverageDisplayState,
  journeyMapContinueAttempts: 0,
  isJourneyMapContinuing: false,
  verifiedPages: [] as string[],
  productMode: null as ProductMode | null,
  handoff: createEmptyHandoffState(),
};

export const useStrategyStore = create<StrategyState>((set, get) => ({
  ...initialState,

  setPhase: (phase) => set({ phase }),

  setProductMode: (productMode) => set({ productMode }),

  setHandoffState: (handoff) => set({ handoff }),

  updateHandoffState: (patch) =>
    set((state) => ({
      handoff: {
        ...state.handoff,
        ...patch,
      },
    })),

  setUserPrompt: (prompt) => set({ userPrompt: prompt }),

  setManifestoData: (data) => {
    const afterBuild = get().completedPages.length > 0;
    set({
      manifestoData: normalizeManifestoState(data, get().manifestoData),
      streamingOverview: null,
      ...(afterBuild ? { strategyUpdatedAfterBuild: true } : {}),
    });
  },

  setStreamingOverview: (data) => set({ streamingOverview: data }),

  setPersonaData: (data) => {
    const afterBuild = get().completedPages.length > 0;
    const previous = get().personaData ?? [];
    set({
      personaData: data.map((persona, index) => normalizePersonaState(persona, previous[index] ?? null)),
      streamingPersonas: null,
      journeyMapContinueAttempts: 0,
      isJourneyMapContinuing: false,
      ...(afterBuild ? { strategyUpdatedAfterBuild: true } : {}),
    });
  },

  setStreamingPersonas: (data) => set({ streamingPersonas: data }),

  setFlowData: (data) => {
    const afterBuild = get().completedPages.length > 0;
    set({
      flowData: normalizeFlowState(data),
      ...(afterBuild ? { strategyUpdatedAfterBuild: true } : {}),
    });
  },

  setConfidenceData: (data) =>
    set((state) => {
      // Confidence ratchet: during deep-dive, scores can only go up
      if (state.isDeepDive && state.confidenceData) {
        const prev = state.confidenceData.dimensions;
        const ratcheted: ConfidenceData = {
          overall: 0,
          dimensions: {
            targetUser: {
              score: Math.max(prev.targetUser.score, data.dimensions.targetUser.score),
              summary: data.dimensions.targetUser.summary,
            },
            coreProblem: {
              score: Math.max(prev.coreProblem.score, data.dimensions.coreProblem.score),
              summary: data.dimensions.coreProblem.summary,
            },
            currentWorkflow: {
              score: Math.max(prev.currentWorkflow.score, data.dimensions.currentWorkflow.score),
              summary: data.dimensions.currentWorkflow.summary,
            },
            domainContext: {
              score: Math.max(prev.domainContext.score, data.dimensions.domainContext.score),
              summary: data.dimensions.domainContext.summary,
            },
            stakesAndImpact: {
              score: Math.max(prev.stakesAndImpact.score, data.dimensions.stakesAndImpact.score),
              summary: data.dimensions.stakesAndImpact.summary,
            },
          },
        };
        const scores = Object.values(ratcheted.dimensions).map((d) => d.score);
        ratcheted.overall = Math.min(100, Math.round(scores.reduce((a, b) => a + b, 0) / scores.length));
        return { confidenceData: ratcheted };
      }
      return { confidenceData: data };
    }),

  setJourneyMapData: (data) => {
    const afterBuild = get().completedPages.length > 0;
    const previous = get().journeyMapData ?? [];
    set({
      journeyMapData: data.map((journeyMap, index) => normalizeJourneyMapState(journeyMap, previous[index] ?? null)),
      streamingJourneyMaps: null,
      ...(afterBuild ? { strategyUpdatedAfterBuild: true } : {}),
    });
  },

  setStreamingJourneyMaps: (data) => set({ streamingJourneyMaps: data }),

  setIdeaData: (data) => set({ ideaData: data, streamingIdeas: null }),

  setStreamingIdeas: (data) => set({ streamingIdeas: data }),

  setSelectedIdeaId: (id) => set({ selectedIdeaId: id }),

  setCustomIdeaFlow: (data) =>
    set((state) => ({
      customIdeaFlow: normalizeCustomIdeaFlowState({
        ...state.customIdeaFlow,
        ...data,
      }),
    })),

  resetCustomIdeaFlow: () => set({ customIdeaFlow: initialState.customIdeaFlow }),

  addCompletedPage: (pageId) =>
    set((state) => ({
      completedPages: state.completedPages.includes(pageId)
        ? state.completedPages
        : [...state.completedPages, pageId],
    })),

  setBuildingPage: (pageId) => set({ currentBuildingPage: pageId }),

  setBuildingPages: (pageIds) => set({ currentBuildingPages: pageIds, currentBuildingPage: null }),

  setEditContext: (context) => set({ editContext: context }),

  setEditScope: (scope) =>
    set({
      editScope: scope,
      activeEditingPageIds: scope?.targetPageIds ?? [],
    }),

  setActiveEditingPageIds: (pageIds) => set({ activeEditingPageIds: pageIds }),

  clearEditSession: () =>
    set({
      editContext: null,
      editScope: null,
      activeEditingPageIds: [],
    }),

  setDeepDive: (v) => set({ isDeepDive: v }),

  setKeyFeaturesData: (data) => {
    const afterBuild = get().completedPages.length > 0;
    set({
      keyFeaturesData: normalizeKeyFeaturesState(data, get().keyFeaturesData),
      streamingKeyFeatures: null,
      ...(afterBuild ? { strategyUpdatedAfterBuild: true } : {}),
    });
  },

  setStreamingKeyFeatures: (data) => set({ streamingKeyFeatures: data }),

  setUserFlowsData: (data) => {
    const afterBuild = get().completedPages.length > 0;
    set({
      userFlowsData: data.map(normalizeUserFlowState),
      streamingUserFlows: null,
      ...(afterBuild ? { strategyUpdatedAfterBuild: true } : {}),
    });
  },

  setStreamingUserFlows: (data) => set({ streamingUserFlows: data }),

  setStrategyUpdatedAfterBuild: (v) => set({ strategyUpdatedAfterBuild: v }),

  setCoverageDisplayState: (coverageDisplayState) => set({ coverageDisplayState }),

  setJourneyMapContinueAttempts: (n) => set({ journeyMapContinueAttempts: n }),

  setIsJourneyMapContinuing: (v) => set({ isJourneyMapContinuing: v }),

  addVerifiedPage: (pageId) =>
    set((state) => ({
      verifiedPages: state.verifiedPages.includes(pageId)
        ? state.verifiedPages
        : [...state.verifiedPages, pageId],
    })),

  hydrate: (data: Partial<typeof initialState>) =>
    set({
      ...initialState,
      ...data,
      manifestoData: data.manifestoData
        ? normalizeManifestoState(data.manifestoData, null)
        : initialState.manifestoData,
      personaData: data.personaData
        ? data.personaData.map((persona) => normalizePersonaState(persona, null))
        : initialState.personaData,
      journeyMapData: data.journeyMapData
        ? data.journeyMapData.map((journeyMap) => normalizeJourneyMapState(journeyMap, null))
        : initialState.journeyMapData,
      customIdeaFlow: normalizeCustomIdeaFlowState(data.customIdeaFlow),
      flowData: data.flowData
        ? normalizeFlowState(data.flowData)
        : initialState.flowData,
      keyFeaturesData: data.keyFeaturesData
        ? normalizeKeyFeaturesState(data.keyFeaturesData, null)
        : initialState.keyFeaturesData,
      userFlowsData: data.userFlowsData
        ? data.userFlowsData.map(normalizeUserFlowState)
        : initialState.userFlowsData,
      handoff: normalizeHandoffState(data.handoff),
    }),

  reset: () => set(initialState),
}));
