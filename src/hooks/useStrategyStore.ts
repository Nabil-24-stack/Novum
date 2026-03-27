"use client";

import { create } from "zustand";
import type { CoverageDisplayState } from "../lib/product-brain/types.ts";
import type { HandoffState, ProductMode } from "../lib/handoff/types.ts";
import { createEmptyHandoffState, normalizeHandoffState } from "../lib/handoff/types.ts";
import {
  createDeterministicTraceableId,
  getTraceableText,
  normalizeTraceableTextList,
  type TraceableTextItem,
} from "../lib/strategy/traceable.ts";
import {
  deriveHmwIdsFromJtbds,
  derivePainPointIdsFromJtbds,
  derivePersonaNamesFromJtbds,
  getResolvedFeaturePainPointIds,
} from "../lib/strategy/feature-traceability.ts";
import {
  createIdleProblemOverviewSequenceState,
  type ProblemOverviewSequenceStage,
  type ProblemOverviewSequenceState,
  type ProblemOverviewSourceBlock,
} from "../lib/strategy/problem-overview-sequencing.ts";

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
  painPointIds: string[];// References canonical manifesto pain points
  painPoints?: TraceableTextItem[];// Legacy compatibility during migration
  quote: string;       // First-person key quote
}

export interface JourneyStage {
  stage: string;         // AI-decided stage name (e.g. "Awareness", "Onboarding")
  actions: string[];     // What the user does
  thoughts: string[];    // What the user thinks
  emotion: string;       // Single emoji or short word (e.g. "frustrated", "hopeful")
  painPointIds: string[];  // Optional references to canonical manifesto pain points
  frictionNotes: string[]; // Stage-specific friction wording that stays local to the journey
  painPoints?: TraceableTextItem[]; // Legacy compatibility during migration
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
  kind?: "core" | "supporting";
  supportingJustification?: string;
  hmwIds?: string[];
  jtbdIds: string[];
  personaNames?: string[];
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
  painPoints?: TraceableTextItem[];
  jtbd: JtbdData[];
  hmw: HmwData[];
}

export interface JtbdData extends TraceableTextItem {
  painPointIds?: string[];
  personaNames?: string[];
}

export interface HmwData extends TraceableTextItem {
  jtbdIds?: string[];
  painPointIds?: string[];
}

export interface StrategyNode {
  id: string;
  label: string;
  type: "page" | "action" | "decision" | "data";
  description?: string;
  traceabilityMode?: "core" | "supporting";
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

function normalizeTextKey(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function buildTextMatchIndex(items: TraceableTextItem[]): Map<string, string> {
  const index = new Map<string, string>();
  for (const item of items) {
    const key = normalizeTextKey(item.text);
    if (key && !index.has(key)) {
      index.set(key, item.id);
    }
  }
  return index;
}

function getLegacyPainPointValues(value: unknown): Array<TraceableTextItem | string> {
  if (!value || typeof value !== "object") return [];
  const painPoints = (value as { painPoints?: unknown }).painPoints;
  return Array.isArray(painPoints)
    ? painPoints.filter(
        (item): item is TraceableTextItem | string =>
          typeof item === "string" || (Boolean(item) && typeof item === "object")
      )
    : [];
}

function buildFallbackPainPointsFromLegacyPersonas(personas: unknown[] | null | undefined): TraceableTextItem[] {
  const painPoints = (personas ?? []).flatMap((persona) => getLegacyPainPointValues(persona));
  return normalizeTraceableTextList({
    values: painPoints,
    prefix: "pain-point",
  });
}

function getPainPointIdsFromLegacyValues(
  values: Array<TraceableTextItem | string>,
  registry: TraceableTextItem[],
): string[] {
  const registryByText = buildTextMatchIndex(registry);
  return [...new Set(
    values
      .map((value) => registryByText.get(normalizeTextKey(getTraceableText(value))))
      .filter((id): id is string => typeof id === "string" && id.length > 0)
  )];
}

function normalizeFeatureKind(
  kind: KeyFeatureData["kind"] | undefined,
): KeyFeatureData["kind"] {
  return kind === "supporting" ? "supporting" : "core";
}

function normalizeTraceabilityMode(
  mode: StrategyNode["traceabilityMode"] | undefined,
): NonNullable<StrategyNode["traceabilityMode"]> {
  return mode === "supporting" ? "supporting" : "core";
}

function normalizeManifestoPainPoints(
  data: ManifestoData,
  previous: ManifestoData | null | undefined,
  fallbackPainPoints: TraceableTextItem[],
): TraceableTextItem[] {
  const candidateValues =
    Array.isArray((data as { painPoints?: unknown }).painPoints) &&
    (data as { painPoints?: unknown[] }).painPoints!.length > 0
      ? ((data as { painPoints?: Array<TraceableTextItem | string> }).painPoints ?? [])
      : fallbackPainPoints;

  return normalizeTraceableTextList({
    values: candidateValues,
    prefix: "pain-point",
    previous: previous?.painPoints ?? fallbackPainPoints,
  });
}

function normalizeJtbdState(
  values: ManifestoData["jtbd"],
  previous: ManifestoData["jtbd"] | null | undefined,
  validPainPointIds: Set<string>,
  validPersonaNames?: Set<string> | null,
): JtbdData[] {
  const previousItems = previous ?? [];
  const baseItems = normalizeTraceableTextList({
    values,
    prefix: "jtbd",
    previous: previousItems,
  });
  const previousById = new Map(previousItems.map((item) => [item.id, item]));

  return baseItems.map((item, index) => {
    const current = values[index] as Partial<JtbdData> | string | undefined;
    const previousItem = previousById.get(item.id);
    const painPointIds = normalizeIdList(
      typeof current === "string"
        ? previousItem?.painPointIds
        : Array.isArray(current?.painPointIds)
          ? current.painPointIds
          : previousItem?.painPointIds
    ).filter((id) => validPainPointIds.has(id));
    const personaNames = normalizeStringList(
      typeof current === "string"
        ? previousItem?.personaNames
        : Array.isArray(current?.personaNames)
          ? current.personaNames
          : previousItem?.personaNames
    ).filter((name) => !validPersonaNames || validPersonaNames.size === 0 || validPersonaNames.has(name));

    return {
      id: item.id,
      text: item.text,
      painPointIds,
      personaNames,
    };
  });
}

function normalizeHmwState(
  values: ManifestoData["hmw"],
  previous: ManifestoData["hmw"] | null | undefined,
  validJtbdIds: Set<string>,
  validPainPointIds: Set<string>,
): HmwData[] {
  const previousItems = previous ?? [];
  const baseItems = normalizeTraceableTextList({
    values,
    prefix: "hmw",
    previous: previousItems,
  });
  const previousById = new Map(previousItems.map((item) => [item.id, item]));

  return baseItems.map((item, index) => {
    const current = values[index] as Partial<HmwData> | string | undefined;
    const previousItem = previousById.get(item.id);

    return {
      id: item.id,
      text: item.text,
      jtbdIds: normalizeIdList(
        typeof current === "string" ? previousItem?.jtbdIds : Array.isArray(current?.jtbdIds) ? current.jtbdIds : previousItem?.jtbdIds
      ).filter((id) => validJtbdIds.has(id)),
      painPointIds: normalizeIdList(
        typeof current === "string" ? previousItem?.painPointIds : Array.isArray(current?.painPointIds) ? current.painPointIds : previousItem?.painPointIds
      ).filter((id) => validPainPointIds.has(id)),
    };
  });
}

function normalizeManifestoState(
  data: ManifestoData,
  previous: ManifestoData | null | undefined,
  options?: {
    fallbackPainPoints?: TraceableTextItem[] | null | undefined;
    validPersonaNames?: string[] | null | undefined;
  }
): ManifestoData {
  const painPoints = normalizeManifestoPainPoints(
    data,
    previous,
    options?.fallbackPainPoints ?? []
  );
  const validPainPointIds = new Set(painPoints.map((painPoint) => painPoint.id));
  const validPersonaNames = new Set(normalizeStringList(options?.validPersonaNames));
  const jtbd = normalizeJtbdState(
    data.jtbd,
    previous?.jtbd,
    validPainPointIds,
    validPersonaNames
  );
  const validJtbdIds = new Set(jtbd.map((item) => item.id));

  return {
    title: trimText(data.title),
    problemStatement: trimText(data.problemStatement),
    targetUser: trimText(data.targetUser),
    environmentContext: trimText(data.environmentContext),
    painPoints,
    jtbd,
    hmw: normalizeHmwState(data.hmw, previous?.hmw, validJtbdIds, validPainPointIds),
  };
}

function normalizePersonaState(
  data: PersonaData,
  previous: PersonaData | null | undefined,
  painPointRegistry: TraceableTextItem[]
): PersonaData {
  const explicitPainPointIds = normalizeIdList((data as { painPointIds?: string[] }).painPointIds);
  const legacyPainPointIds =
    explicitPainPointIds.length > 0
      ? explicitPainPointIds
      : getPainPointIdsFromLegacyValues(getLegacyPainPointValues(data), painPointRegistry);
  const validPainPointIds = new Set(painPointRegistry.map((painPoint) => painPoint.id));

  return {
    name: trimText(data.name),
    role: trimText(data.role),
    bio: trimText(data.bio),
    goals: normalizeStringList(data.goals),
    painPointIds: (legacyPainPointIds.length > 0 ? legacyPainPointIds : previous?.painPointIds ?? []).filter(
      (id) => validPainPointIds.has(id)
    ),
    quote: trimText(data.quote),
  };
}

function normalizeJourneyStageState(
  data: JourneyStage,
  previous: JourneyStage | null | undefined,
  painPointRegistry: TraceableTextItem[]
): JourneyStage | null {
  const validPainPointIds = new Set(painPointRegistry.map((painPoint) => painPoint.id));
  const explicitPainPointIds = normalizeIdList((data as { painPointIds?: string[] }).painPointIds).filter(
    (id) => validPainPointIds.has(id)
  );
  const frictionNotes = normalizeStringList((data as { frictionNotes?: string[] }).frictionNotes);
  const legacyPainPoints = getLegacyPainPointValues(data);
  const migratedPainPointIds = getPainPointIdsFromLegacyValues(legacyPainPoints, painPointRegistry).filter(
    (id) => validPainPointIds.has(id)
  );
  const registryByText = buildTextMatchIndex(painPointRegistry);
  const migratedFrictionNotes = legacyPainPoints
    .map((value) => getTraceableText(value))
    .map(trimText)
    .filter((text) => text && !registryByText.has(normalizeTextKey(text)));

  const normalized: JourneyStage = {
    stage: trimText(data.stage),
    actions: normalizeStringList(data.actions),
    thoughts: normalizeStringList(data.thoughts),
    emotion: trimText(data.emotion),
    painPointIds:
      explicitPainPointIds.length > 0
        ? explicitPainPointIds
        : migratedPainPointIds.length > 0
          ? migratedPainPointIds
          : (previous?.painPointIds ?? []).filter((id) => validPainPointIds.has(id)),
    frictionNotes: frictionNotes.length > 0 ? frictionNotes : [...(previous?.frictionNotes ?? []), ...migratedFrictionNotes],
    opportunities: normalizeStringList(data.opportunities),
  };

  if (
    !normalized.stage &&
    normalized.actions.length === 0 &&
    normalized.thoughts.length === 0 &&
    !normalized.emotion &&
    normalized.painPointIds.length === 0 &&
    normalized.frictionNotes.length === 0 &&
    normalized.opportunities.length === 0
  ) {
    return null;
  }

  return normalized;
}

function normalizeJourneyMapState(
  data: JourneyMapData,
  previous: JourneyMapData | null | undefined,
  painPointRegistry: TraceableTextItem[]
): JourneyMapData {
  return {
    personaName: trimText(data.personaName),
    stages: (data.stages ?? [])
      .map((stage, index) => normalizeJourneyStageState(stage, previous?.stages?.[index] ?? null, painPointRegistry))
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
  previousFeatures: KeyFeatureData[],
  manifestoData: ManifestoData | null | undefined,
  personaData: PersonaData[] | null | undefined
): KeyFeatureData {
  const nextName = trimText(feature.name);
  const nextDescription = trimText(feature.description);
  const validJtbdIds = new Set((manifestoData?.jtbd ?? []).map((jtbd) => jtbd.id));
  const validHmwIds = new Set((manifestoData?.hmw ?? []).map((hmw) => hmw.id));
  const validPersonaNames = new Set((personaData ?? []).map((persona) => trimText(persona.name)).filter(Boolean));
  const previousBySignature = previousFeatures.find(
    (item) =>
      trimText(item?.name).toLowerCase() === nextName.toLowerCase() &&
      trimText(item?.description).toLowerCase() === nextDescription.toLowerCase()
  );
  const previousByName = previousFeatures.find(
    (item) => trimText(item?.name).toLowerCase() === nextName.toLowerCase()
  );
  const sameIndex = previousFeatures[index];
  const jtbdIds = normalizeIdList(feature.jtbdIds).filter((id) => validJtbdIds.has(id));
  const hmwIds = normalizeIdList(
    feature.hmwIds?.length
      ? feature.hmwIds
      : sameIndex?.hmwIds?.length
        ? sameIndex.hmwIds
        : previousBySignature?.hmwIds?.length
          ? previousBySignature.hmwIds
          : previousByName?.hmwIds?.length
            ? previousByName.hmwIds
            : deriveHmwIdsFromJtbds(jtbdIds, manifestoData)
  ).filter((id) => validHmwIds.size === 0 || validHmwIds.has(id));
  const personaNames = normalizeStringList(
    feature.personaNames?.length
      ? feature.personaNames
      : sameIndex?.personaNames?.length
        ? sameIndex.personaNames
        : previousBySignature?.personaNames?.length
          ? previousBySignature.personaNames
          : previousByName?.personaNames?.length
            ? previousByName.personaNames
            : derivePersonaNamesFromJtbds(jtbdIds, manifestoData)
  ).filter((name) => validPersonaNames.size === 0 || validPersonaNames.has(name));
  const resolvedPainPointIds = getResolvedFeaturePainPointIds(
    {
      ...feature,
      hmwIds,
      jtbdIds,
      painPointIds: normalizeIdList(
        feature.painPointIds?.length
          ? feature.painPointIds
          : sameIndex?.painPointIds?.length
            ? sameIndex.painPointIds
            : previousBySignature?.painPointIds?.length
              ? previousBySignature.painPointIds
              : previousByName?.painPointIds
      ),
    },
    manifestoData
  );

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
    kind: normalizeFeatureKind(
      (feature as Partial<KeyFeatureData>).kind ?? sameIndex?.kind ?? previousBySignature?.kind ?? previousByName?.kind
    ),
    supportingJustification: trimText(
      (feature as Partial<KeyFeatureData>).supportingJustification ??
      sameIndex?.supportingJustification ??
      previousBySignature?.supportingJustification ??
      previousByName?.supportingJustification
    ),
    hmwIds,
    jtbdIds,
    personaNames,
    painPointIds: resolvedPainPointIds,
  };
}

function normalizeKeyFeaturesState(
  data: KeyFeaturesData,
  previous: KeyFeaturesData | null | undefined,
  manifestoData: ManifestoData | null | undefined,
  personaData: PersonaData[] | null | undefined
): KeyFeaturesData {
  const previousFeatures = previous?.features ?? [];
  return {
    ideaTitle: trimText(data.ideaTitle),
    features: (data.features ?? [])
      .map((feature, index) => normalizeFeatureState(feature, index, previousFeatures, manifestoData, personaData))
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
          traceabilityMode: normalizeTraceabilityMode(node.traceabilityMode),
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
  problemOverviewSequence: ProblemOverviewSequenceState;

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
  startProblemOverviewSequence: () => void;
  setProblemOverviewSequenceStage: (stage: ProblemOverviewSequenceStage) => void;
  setProblemOverviewSequenceViewportSettled: (settled: boolean) => void;
  setProblemOverviewSequenceStageRevealCompleted: (completed: boolean) => void;
  setProblemOverviewSourceBlockCompleted: (block: ProblemOverviewSourceBlock, completed: boolean) => void;
  completeProblemOverviewSequence: () => void;
  clearProblemOverviewSequence: () => void;
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
  problemOverviewSequence: createIdleProblemOverviewSequenceState(),
};

export const useStrategyStore = create<StrategyState>((set, get) => ({
  ...initialState,

  setPhase: (phase) =>
    set((state) => ({
      phase,
      ...(phase !== "problem-overview" && state.problemOverviewSequence.status !== "idle"
        ? { problemOverviewSequence: createIdleProblemOverviewSequenceState() }
        : {}),
    })),

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
    const fallbackPainPoints = buildFallbackPainPointsFromLegacyPersonas(get().personaData as unknown[]);
    set({
      manifestoData: normalizeManifestoState(data, get().manifestoData, {
        fallbackPainPoints,
        validPersonaNames: (get().personaData ?? []).map((persona) => persona.name),
      }),
      streamingOverview: null,
      ...(afterBuild ? { strategyUpdatedAfterBuild: true } : {}),
    });
  },

  setStreamingOverview: (data) => set({ streamingOverview: data }),

  setPersonaData: (data) => {
    const afterBuild = get().completedPages.length > 0;
    const previous = get().personaData ?? [];
    const currentManifesto = get().manifestoData;
    const fallbackPainPoints = buildFallbackPainPointsFromLegacyPersonas(data as unknown[]);
    const draftManifesto =
      currentManifesto && (currentManifesto.painPoints?.length ?? 0) === 0 && fallbackPainPoints.length > 0
        ? normalizeManifestoState(currentManifesto, currentManifesto, { fallbackPainPoints })
        : currentManifesto;
    const painPointRegistry = draftManifesto?.painPoints ?? currentManifesto?.painPoints ?? [];
    const normalizedPersonas = data.map((persona, index) =>
      normalizePersonaState(persona, previous[index] ?? null, painPointRegistry)
    );
    const nextManifesto = draftManifesto
      ? normalizeManifestoState(draftManifesto, draftManifesto, {
          validPersonaNames: normalizedPersonas.map((persona) => persona.name),
        })
      : draftManifesto;
    set({
      ...(nextManifesto ? { manifestoData: nextManifesto } : {}),
      personaData: normalizedPersonas,
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
    const painPointRegistry = get().manifestoData?.painPoints ?? [];
    set({
      journeyMapData: data.map((journeyMap, index) =>
        normalizeJourneyMapState(journeyMap, previous[index] ?? null, painPointRegistry)
      ),
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
      keyFeaturesData: normalizeKeyFeaturesState(
        data,
        get().keyFeaturesData,
        get().manifestoData,
        get().personaData
      ),
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

  startProblemOverviewSequence: () =>
    set({
      problemOverviewSequence: {
        status: "running",
        stage: "overview",
        completedBlocks: {
          overview: false,
          "pain-points": false,
          personas: false,
        },
        viewportSettled: false,
        stageRevealCompleted: false,
      },
    }),

  setProblemOverviewSequenceStage: (stage) =>
    set((state) => {
      if (state.problemOverviewSequence.status !== "running") {
        return state;
      }

      if (state.problemOverviewSequence.stage === stage) {
        return state;
      }

      return {
        problemOverviewSequence: {
          ...state.problemOverviewSequence,
          stage,
          viewportSettled: false,
          stageRevealCompleted: false,
        },
      };
    }),

  setProblemOverviewSequenceViewportSettled: (settled) =>
    set((state) => {
      if (state.problemOverviewSequence.status === "idle") {
        return state;
      }

      if (state.problemOverviewSequence.viewportSettled === settled) {
        return state;
      }

      return {
        problemOverviewSequence: {
          ...state.problemOverviewSequence,
          viewportSettled: settled,
        },
      };
    }),

  setProblemOverviewSequenceStageRevealCompleted: (completed) =>
    set((state) => {
      if (state.problemOverviewSequence.status === "idle") {
        return state;
      }

      if (state.problemOverviewSequence.stageRevealCompleted === completed) {
        return state;
      }

      return {
        problemOverviewSequence: {
          ...state.problemOverviewSequence,
          stageRevealCompleted: completed,
        },
      };
    }),

  setProblemOverviewSourceBlockCompleted: (block, completed) =>
    set((state) => {
      if (state.problemOverviewSequence.status === "idle") {
        return state;
      }

      if (state.problemOverviewSequence.completedBlocks[block] === completed) {
        return state;
      }

      return {
        problemOverviewSequence: {
          ...state.problemOverviewSequence,
          completedBlocks: {
            ...state.problemOverviewSequence.completedBlocks,
            [block]: completed,
          },
        },
      };
    }),

  completeProblemOverviewSequence: () =>
    set((state) => {
      if (state.problemOverviewSequence.status !== "running") {
        return state;
      }

      return {
        problemOverviewSequence: {
          ...state.problemOverviewSequence,
          status: "completed",
          stage: "fit-all",
          viewportSettled: true,
          stageRevealCompleted: true,
        },
      };
    }),

  clearProblemOverviewSequence: () =>
    set((state) => {
      if (state.problemOverviewSequence.status === "idle") {
        return state;
      }

      return {
        problemOverviewSequence: createIdleProblemOverviewSequenceState(),
      };
    }),

  hydrate: (data: Partial<typeof initialState>) =>
    set(() => {
      const fallbackPainPoints = buildFallbackPainPointsFromLegacyPersonas(data.personaData as unknown[]);
      const draftManifestoData = data.manifestoData
        ? normalizeManifestoState(data.manifestoData, null, { fallbackPainPoints })
        : initialState.manifestoData;
      const painPointRegistry = draftManifestoData?.painPoints ?? [];
      const personaData = data.personaData
        ? data.personaData.map((persona) => normalizePersonaState(persona, null, painPointRegistry))
        : initialState.personaData;
      const manifestoData = draftManifestoData
        ? normalizeManifestoState(draftManifestoData, draftManifestoData, {
            validPersonaNames: (personaData ?? []).map((persona) => persona.name),
          })
        : draftManifestoData;

      return {
        ...initialState,
        ...data,
        manifestoData,
        personaData,
        journeyMapData: data.journeyMapData
          ? data.journeyMapData.map((journeyMap) => normalizeJourneyMapState(journeyMap, null, painPointRegistry))
          : initialState.journeyMapData,
        customIdeaFlow: normalizeCustomIdeaFlowState(data.customIdeaFlow),
        flowData: data.flowData
          ? normalizeFlowState(data.flowData)
          : initialState.flowData,
        keyFeaturesData: data.keyFeaturesData
          ? normalizeKeyFeaturesState(data.keyFeaturesData, null, manifestoData, personaData)
          : initialState.keyFeaturesData,
        userFlowsData: data.userFlowsData
          ? data.userFlowsData.map(normalizeUserFlowState)
          : initialState.userFlowsData,
        handoff: normalizeHandoffState(data.handoff),
        problemOverviewSequence: createIdleProblemOverviewSequenceState(),
      };
    }),

  reset: () => set(initialState),
}));
