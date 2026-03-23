import type { InsightsCardData } from "@/hooks/useDocumentStore";
import type {
  IdeaData,
  JourneyMapData,
  JourneyStage,
  KeyFeaturesData,
  ManifestoData,
  PersonaData,
  UserFlow,
  UserFlowStep,
} from "@/hooks/useStrategyStore";

export interface StrategyArtifactState {
  manifestoData: ManifestoData | null;
  personaData: PersonaData[] | null;
  journeyMapData: JourneyMapData[] | null;
  ideaData: IdeaData[] | null;
  selectedIdeaId: string | null;
  keyFeaturesData: KeyFeaturesData | null;
  userFlowsData: UserFlow[] | null;
}

function stableStringify(value: unknown): string {
  return JSON.stringify(value ?? null);
}

function trimText(value: string | null | undefined): string {
  return value?.trim() ?? "";
}

function replaceAtIndex<T>(items: T[] | null | undefined, index: number, nextItem: T): T[] {
  const nextItems = [...(items ?? [])];
  nextItems[index] = nextItem;
  return nextItems;
}

function normalizeFeaturePriority(
  priority: KeyFeaturesData["features"][number]["priority"] | undefined
): KeyFeaturesData["features"][number]["priority"] {
  if (priority === "high" || priority === "medium" || priority === "low") {
    return priority;
  }
  return "medium";
}

function normalizeUserFlowStep(step: UserFlowStep): UserFlowStep | null {
  const nodeId = trimText(step.nodeId);
  const action = trimText(step.action);
  if (!nodeId && !action) return null;

  return {
    nodeId,
    action,
  };
}

function normalizeJourneyStage(stage: JourneyStage): JourneyStage | null {
  const normalized: JourneyStage = {
    stage: trimText(stage.stage),
    actions: normalizeStringList(stage.actions ?? []),
    thoughts: normalizeStringList(stage.thoughts ?? []),
    emotion: trimText(stage.emotion),
    painPoints: normalizeStringList(stage.painPoints ?? []),
    opportunities: normalizeStringList(stage.opportunities ?? []),
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

export function normalizeStringList(values: string[] | null | undefined): string[] {
  return (values ?? []).map(trimText).filter(Boolean);
}

export function normalizeInsightsData(data: InsightsCardData): InsightsCardData {
  return {
    documents: data.documents ?? [],
    insights: (data.insights ?? [])
      .map((item) => ({
        insight: trimText(item.insight),
        quote: trimText(item.quote),
        sourceDocument: trimText(item.sourceDocument),
        source: item.source,
      }))
      .filter((item) => item.insight || item.quote || item.sourceDocument),
  };
}

export function normalizeManifestoData(data: ManifestoData): ManifestoData {
  return {
    title: trimText(data.title),
    problemStatement: trimText(data.problemStatement),
    targetUser: trimText(data.targetUser),
    jtbd: normalizeStringList(data.jtbd),
    hmw: normalizeStringList(data.hmw),
  };
}

export function normalizePersonaData(data: PersonaData): PersonaData {
  return {
    name: trimText(data.name),
    role: trimText(data.role),
    bio: trimText(data.bio),
    goals: normalizeStringList(data.goals),
    painPoints: normalizeStringList(data.painPoints),
    quote: trimText(data.quote),
  };
}

export function normalizeJourneyMapData(data: JourneyMapData): JourneyMapData {
  return {
    personaName: trimText(data.personaName),
    stages: (data.stages ?? [])
      .map(normalizeJourneyStage)
      .filter((stage): stage is JourneyStage => Boolean(stage)),
  };
}

export function normalizeIdeaData(data: IdeaData): IdeaData {
  return {
    ...data,
    title: trimText(data.title),
    description: trimText(data.description),
  };
}

export function normalizeKeyFeaturesData(data: KeyFeaturesData): KeyFeaturesData {
  return {
    ideaTitle: trimText(data.ideaTitle),
    features: (data.features ?? [])
      .map((feature) => ({
        name: trimText(feature.name),
        description: trimText(feature.description),
        priority: normalizeFeaturePriority(feature.priority),
      }))
      .filter((feature) => feature.name || feature.description),
  };
}

export function normalizeUserFlowData(data: UserFlow): UserFlow {
  return {
    ...data,
    jtbdText: trimText(data.jtbdText),
    personaNames: normalizeStringList(data.personaNames),
    steps: (data.steps ?? [])
      .map(normalizeUserFlowStep)
      .filter((step): step is UserFlowStep => Boolean(step)),
  };
}

export function resolveArtifactDraftChange<T>(params: {
  baseline: T;
  nextValue: T;
  normalize?: (value: T) => T;
}): {
  normalizedBaseline: T;
  normalizedNextValue: T;
  changed: boolean;
} {
  const { baseline, nextValue, normalize } = params;
  const normalizeValue = normalize ?? ((value: T) => value);
  const normalizedBaseline = normalizeValue(baseline);
  const normalizedNextValue = normalizeValue(nextValue);

  return {
    normalizedBaseline,
    normalizedNextValue,
    changed: stableStringify(normalizedBaseline) !== stableStringify(normalizedNextValue),
  };
}

function buildJtbdIndexMap(previousJtbds: string[], nextJtbds: string[]): Map<number, number> {
  const indexMap = new Map<number, number>();
  const unmatchedOld: number[] = [];
  const unmatchedNew = new Set(nextJtbds.map((_, index) => index));
  const newIndexesByText = new Map<string, number[]>();

  nextJtbds.forEach((text, index) => {
    const queue = newIndexesByText.get(text);
    if (queue) {
      queue.push(index);
    } else {
      newIndexesByText.set(text, [index]);
    }
  });

  previousJtbds.forEach((text, oldIndex) => {
    const queue = newIndexesByText.get(text);
    const nextIndex = queue?.shift();
    if (nextIndex === undefined) {
      unmatchedOld.push(oldIndex);
      return;
    }

    unmatchedNew.delete(nextIndex);
    indexMap.set(oldIndex, nextIndex);
  });

  const unmatchedNewIndexes = [...unmatchedNew].sort((a, b) => a - b);
  if (unmatchedOld.length === unmatchedNewIndexes.length) {
    unmatchedOld.forEach((oldIndex, offset) => {
      indexMap.set(oldIndex, unmatchedNewIndexes[offset]);
    });
  }

  return indexMap;
}

export function applyManualManifestoEdit(
  state: StrategyArtifactState,
  nextManifesto: ManifestoData
): { manifestoData: ManifestoData; userFlowsData: UserFlow[] | null } {
  const manifestoData = normalizeManifestoData(nextManifesto);
  const previousJtbds = state.manifestoData?.jtbd ?? [];
  const nextJtbds = manifestoData.jtbd;

  if (!state.userFlowsData) {
    return { manifestoData, userFlowsData: null };
  }

  const exactIndexMap = buildJtbdIndexMap(previousJtbds, nextJtbds);
  const userFlowsData = state.userFlowsData
    .map((flow) => {
      const exactTextIndex = nextJtbds.findIndex((jtbd) => jtbd === flow.jtbdText);
      if (exactTextIndex >= 0) {
        return normalizeUserFlowData({
          ...flow,
          jtbdIndex: exactTextIndex,
          jtbdText: nextJtbds[exactTextIndex],
        });
      }

      const remappedIndex = exactIndexMap.get(flow.jtbdIndex);
      if (remappedIndex === undefined || !nextJtbds[remappedIndex]) {
        return null;
      }

      return normalizeUserFlowData({
        ...flow,
        jtbdIndex: remappedIndex,
        jtbdText: nextJtbds[remappedIndex],
      });
    })
    .filter((flow): flow is UserFlow => Boolean(flow));

  return {
    manifestoData,
    userFlowsData,
  };
}

export function applyManualPersonaEdit(
  state: StrategyArtifactState,
  personaIndex: number,
  nextPersona: PersonaData
): {
  personaData: PersonaData[];
  journeyMapData: JourneyMapData[] | null;
  userFlowsData: UserFlow[] | null;
} {
  const normalizedPersona = normalizePersonaData(nextPersona);
  const previousName = state.personaData?.[personaIndex]?.name ?? "";
  const nextName = normalizedPersona.name;
  const personaData = replaceAtIndex(state.personaData, personaIndex, normalizedPersona);

  const journeyMapData = state.journeyMapData
    ? state.journeyMapData.map((journeyMap) =>
        journeyMap.personaName === previousName
          ? normalizeJourneyMapData({ ...journeyMap, personaName: nextName })
          : journeyMap
      )
    : null;

  const userFlowsData = state.userFlowsData
    ? state.userFlowsData.map((flow) =>
        normalizeUserFlowData({
          ...flow,
          personaNames: flow.personaNames.map((personaName) =>
            personaName === previousName ? nextName : personaName
          ),
        })
      )
    : null;

  return {
    personaData,
    journeyMapData,
    userFlowsData,
  };
}

export function applyManualJourneyMapEdit(
  state: StrategyArtifactState,
  journeyMapIndex: number,
  nextJourneyMap: JourneyMapData
): JourneyMapData[] {
  return replaceAtIndex(
    state.journeyMapData,
    journeyMapIndex,
    normalizeJourneyMapData(nextJourneyMap)
  );
}

export function applyManualIdeaEdit(
  state: StrategyArtifactState,
  ideaIndex: number,
  nextIdea: IdeaData
): { ideaData: IdeaData[]; keyFeaturesData: KeyFeaturesData | null } {
  const previousIdea = state.ideaData?.[ideaIndex] ?? null;
  const normalizedIdea = normalizeIdeaData(nextIdea);
  const ideaData = replaceAtIndex(state.ideaData, ideaIndex, normalizedIdea);

  const keyFeaturesData =
    previousIdea &&
    state.selectedIdeaId === previousIdea.id &&
    state.keyFeaturesData?.ideaTitle === previousIdea.title
      ? normalizeKeyFeaturesData({
          ...state.keyFeaturesData,
          ideaTitle: normalizedIdea.title,
        })
      : state.keyFeaturesData;

  return {
    ideaData,
    keyFeaturesData,
  };
}

export function applyManualKeyFeaturesEdit(nextKeyFeatures: KeyFeaturesData): KeyFeaturesData {
  return normalizeKeyFeaturesData(nextKeyFeatures);
}

export function applyManualUserFlowEdit(
  state: StrategyArtifactState,
  userFlowIndex: number,
  nextUserFlow: UserFlow
): UserFlow[] {
  return replaceAtIndex(
    state.userFlowsData,
    userFlowIndex,
    normalizeUserFlowData(nextUserFlow)
  );
}
