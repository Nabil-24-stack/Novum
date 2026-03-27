import type { InsightsCardData } from "@/hooks/useDocumentStore";
import type {
  HmwData,
  IdeaData,
  JtbdData,
  JourneyMapData,
  JourneyStage,
  KeyFeatureData,
  KeyFeaturesData,
  ManifestoData,
  PersonaData,
  UserFlow,
  UserFlowStep,
} from "@/hooks/useStrategyStore";
import {
  createDeterministicTraceableId,
  getTraceableText,
  normalizeTraceableTextList,
  type PartialTraceableTextItem,
  type TraceableTextItem,
} from "./traceable.ts";
import {
  deriveHmwIdsFromJtbds,
  derivePersonaNamesFromJtbds,
  getResolvedFeaturePainPointIds,
} from "./feature-traceability.ts";

type ManifestoNormalizationInput = Omit<ManifestoData, "painPoints" | "jtbd" | "hmw"> & {
  painPoints?: Array<TraceableTextItem | PartialTraceableTextItem | string>;
  jtbd?: Array<(PartialTraceableTextItem & Partial<Pick<JtbdData, "painPointIds" | "personaNames">>) | string>;
  hmw?: Array<(PartialTraceableTextItem & Partial<Pick<HmwData, "painPointIds" | "jtbdIds">>) | string>;
};

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

function normalizeFeatureKind(
  kind: KeyFeatureData["kind"] | undefined
): KeyFeatureData["kind"] {
  return kind === "supporting" ? "supporting" : "core";
}

function normalizeIdList(values: string[] | null | undefined): string[] {
  return (values ?? []).map(trimText).filter(Boolean);
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
  return normalizeTraceableTextList({
    values: (personas ?? []).flatMap((persona) => getLegacyPainPointValues(persona)),
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

function buildLinkedItemMap<T extends { id: string }>(
  values: Array<T | string> | null | undefined,
): Map<string, T> {
  const map = new Map<string, T>();
  for (const value of values ?? []) {
    if (value && typeof value === "object" && "id" in value && typeof value.id === "string") {
      map.set(value.id, value as T);
    }
  }
  return map;
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

function normalizeJourneyStage(
  stage: JourneyStage,
  painPointRegistry: TraceableTextItem[]
): JourneyStage | null {
  const validPainPointIds = new Set(painPointRegistry.map((painPoint) => painPoint.id));
  const explicitPainPointIds = normalizeIdList((stage as { painPointIds?: string[] }).painPointIds).filter(
    (id) => validPainPointIds.has(id)
  );
  const legacyPainPoints = getLegacyPainPointValues(stage);
  const migratedPainPointIds = getPainPointIdsFromLegacyValues(legacyPainPoints, painPointRegistry).filter(
    (id) => validPainPointIds.has(id)
  );
  const registryByText = buildTextMatchIndex(painPointRegistry);
  const migratedFrictionNotes = legacyPainPoints
    .map((value) => getTraceableText(value))
    .map(trimText)
    .filter((text) => text && !registryByText.has(normalizeTextKey(text)));

  const normalized: JourneyStage = {
    stage: trimText(stage.stage),
    actions: normalizeStringList(stage.actions ?? []),
    thoughts: normalizeStringList(stage.thoughts ?? []),
    emotion: trimText(stage.emotion),
    painPointIds: explicitPainPointIds.length > 0 ? explicitPainPointIds : migratedPainPointIds,
    frictionNotes: [
      ...normalizeStringList((stage as { frictionNotes?: string[] }).frictionNotes),
      ...migratedFrictionNotes,
    ].filter((value, index, items) => items.indexOf(value) === index),
    opportunities: normalizeStringList(stage.opportunities ?? []),
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

export function normalizeStringList(values: string[] | null | undefined): string[] {
  return (values ?? []).map(trimText).filter(Boolean);
}

export function normalizeInsightsData(data: InsightsCardData): InsightsCardData {
  return {
    documents: data.documents ?? [],
    insights: (data.insights ?? [])
      .map((item) => ({
        id: trimText(item.id) || createDeterministicTraceableId(
          "insight",
          `${trimText(item.insight)}:${trimText(item.sourceDocument)}:${trimText(item.quote)}`
        ),
        insight: trimText(item.insight),
        quote: trimText(item.quote),
        sourceDocument: trimText(item.sourceDocument),
        source: item.source,
      }))
      .filter((item) => item.insight || item.quote || item.sourceDocument),
  };
}

export function normalizeManifestoData(
  data: ManifestoNormalizationInput,
  options?: {
    fallbackPainPoints?: TraceableTextItem[] | null | undefined;
    validPersonaNames?: string[] | null | undefined;
  }
): ManifestoData {
  const fallbackPainPoints = options?.fallbackPainPoints ?? [];
  const validPersonaNames = new Set(normalizeStringList(options?.validPersonaNames));
  const painPoints = normalizeTraceableTextList({
    values:
      Array.isArray((data as { painPoints?: unknown }).painPoints) &&
      (data as { painPoints?: unknown[] }).painPoints!.length > 0
        ? ((data as { painPoints?: Array<TraceableTextItem | string> }).painPoints ?? [])
        : fallbackPainPoints,
    prefix: "pain-point",
    previous:
      (Array.isArray((data as { painPoints?: unknown }).painPoints)
        ? ((data as { painPoints?: TraceableTextItem[] }).painPoints ?? [])
        : fallbackPainPoints),
  });
  const validPainPointIds = new Set(painPoints.map((painPoint) => painPoint.id));
  const jtbdValues = data.jtbd ?? [];
  const previousJtbds = buildLinkedItemMap<JtbdData>(jtbdValues as Array<JtbdData | string>);
  const jtbdBase = normalizeTraceableTextList({
    values: jtbdValues,
    prefix: "jtbd",
    previous: jtbdValues,
  });
  const jtbd = jtbdBase.map((item, index) => {
    const current = jtbdValues[index] as Partial<JtbdData> | string | undefined;
    const previous = previousJtbds.get(item.id);
    return {
      id: item.id,
      text: item.text,
      painPointIds: normalizeIdList(
        typeof current === "string" ? previous?.painPointIds : Array.isArray(current?.painPointIds) ? current.painPointIds : previous?.painPointIds
      ).filter((id) => validPainPointIds.has(id)),
      personaNames: normalizeStringList(
        typeof current === "string" ? previous?.personaNames : Array.isArray(current?.personaNames) ? current.personaNames : previous?.personaNames
      ).filter((name) => validPersonaNames.size === 0 || validPersonaNames.has(name)),
    };
  });
  const validJtbdIds = new Set(jtbd.map((item) => item.id));
  const hmwValues = data.hmw ?? [];
  const previousHmw = buildLinkedItemMap<HmwData>(hmwValues as Array<HmwData | string>);
  const hmwBase = normalizeTraceableTextList({
    values: hmwValues,
    prefix: "hmw",
    previous: hmwValues,
  });
  const hmw = hmwBase.map((item, index) => {
    const current = hmwValues[index] as Partial<HmwData> | string | undefined;
    const previous = previousHmw.get(item.id);
    return {
      id: item.id,
      text: item.text,
      jtbdIds: normalizeIdList(
        typeof current === "string" ? previous?.jtbdIds : Array.isArray(current?.jtbdIds) ? current.jtbdIds : previous?.jtbdIds
      ).filter((id) => validJtbdIds.has(id)),
      painPointIds: normalizeIdList(
        typeof current === "string" ? previous?.painPointIds : Array.isArray(current?.painPointIds) ? current.painPointIds : previous?.painPointIds
      ).filter((id) => validPainPointIds.has(id)),
    };
  });

  return {
    title: trimText(data.title),
    problemStatement: trimText(data.problemStatement),
    targetUser: trimText(data.targetUser),
    environmentContext: trimText(data.environmentContext),
    painPoints,
    jtbd,
    hmw,
  };
}

export function normalizePersonaData(
  data: PersonaData,
  painPointRegistry: TraceableTextItem[] = []
): PersonaData {
  const explicitPainPointIds = normalizeIdList((data as { painPointIds?: string[] }).painPointIds);
  const validPainPointIds = new Set(painPointRegistry.map((painPoint) => painPoint.id));
  return {
    name: trimText(data.name),
    role: trimText(data.role),
    bio: trimText(data.bio),
    goals: normalizeStringList(data.goals),
    painPointIds: (explicitPainPointIds.length > 0
      ? explicitPainPointIds
      : getPainPointIdsFromLegacyValues(getLegacyPainPointValues(data), painPointRegistry)
    ).filter((id) => validPainPointIds.size === 0 || validPainPointIds.has(id)),
    quote: trimText(data.quote),
  };
}

export function normalizeJourneyMapData(
  data: JourneyMapData,
  painPointRegistry: TraceableTextItem[] = []
): JourneyMapData {
  return {
    personaName: trimText(data.personaName),
    stages: (data.stages ?? [])
      .map((stage) => normalizeJourneyStage(stage, painPointRegistry))
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

export function normalizeKeyFeaturesData(
  data: KeyFeaturesData,
  manifestoData: ManifestoData | null = null,
  personaData: PersonaData[] | null = null
): KeyFeaturesData {
  const validJtbdIds = new Set((manifestoData?.jtbd ?? []).map((jtbd) => jtbd.id));
  const validHmwIds = new Set((manifestoData?.hmw ?? []).map((hmw) => hmw.id));
  const validPersonaNames = new Set((personaData ?? []).map((persona) => trimText(persona.name)).filter(Boolean));

  return {
    ideaTitle: trimText(data.ideaTitle),
    features: (data.features ?? [])
      .map((feature, index): KeyFeatureData => {
        const jtbdIds = normalizeIdList(feature.jtbdIds).filter((id) => validJtbdIds.size === 0 || validJtbdIds.has(id));
        const hmwIds = normalizeIdList(
          feature.hmwIds?.length ? feature.hmwIds : deriveHmwIdsFromJtbds(jtbdIds, manifestoData)
        ).filter((id) => validHmwIds.size === 0 || validHmwIds.has(id));
        const personaNames = normalizeStringList(
          feature.personaNames?.length ? feature.personaNames : derivePersonaNamesFromJtbds(jtbdIds, manifestoData)
        ).filter((name) => validPersonaNames.size === 0 || validPersonaNames.has(name));
        const painPointIds = getResolvedFeaturePainPointIds(
          {
            ...feature,
            hmwIds,
            jtbdIds,
            painPointIds: normalizeIdList(feature.painPointIds),
          },
          manifestoData
        );

        return {
          id:
            trimText(feature.id) ||
            createDeterministicTraceableId(
              "feature",
              `${index}:${trimText(feature.name)}:${trimText(feature.description)}`
            ),
          name: trimText(feature.name),
          description: trimText(feature.description),
          priority: normalizeFeaturePriority(feature.priority),
          kind: normalizeFeatureKind(feature.kind),
          supportingJustification: trimText(feature.supportingJustification),
          hmwIds,
          jtbdIds,
          personaNames,
          painPointIds,
        };
      })
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

function buildJtbdIndexMap(previousJtbds: ManifestoData["jtbd"], nextJtbds: ManifestoData["jtbd"]): Map<number, number> {
  const indexMap = new Map<number, number>();
  const unmatchedOld: number[] = [];
  const unmatchedNew = new Set(nextJtbds.map((_, index) => index));
  const newIndexesByText = new Map<string, number[]>();
  const newIndexesById = new Map<string, number>();

  nextJtbds.forEach((jtbd, index) => {
    newIndexesById.set(jtbd.id, index);
    const queue = newIndexesByText.get(jtbd.text);
    if (queue) {
      queue.push(index);
    } else {
      newIndexesByText.set(jtbd.text, [index]);
    }
  });

  previousJtbds.forEach((jtbd, oldIndex) => {
    const exactIdIndex = newIndexesById.get(jtbd.id);
    if (exactIdIndex !== undefined) {
      unmatchedNew.delete(exactIdIndex);
      indexMap.set(oldIndex, exactIdIndex);
      return;
    }

    const queue = newIndexesByText.get(jtbd.text);
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

function isMeaningfulPersona(persona: PersonaData): boolean {
  return Boolean(
    trimText(persona.name) ||
    trimText(persona.role) ||
    trimText(persona.bio) ||
    trimText(persona.quote) ||
    persona.goals.length > 0 ||
    persona.painPointIds.length > 0
  );
}

function normalizePersonaDraftEntries(
  personas: PersonaData[],
  painPointRegistry: TraceableTextItem[]
): Array<{
  persona: PersonaData;
  draftId: string | null;
}> {
  return personas
    .map((persona) => {
      const draftId = typeof (persona as { __draftId?: unknown }).__draftId === "string"
        ? (persona as { __draftId?: string }).__draftId ?? null
        : null;

      return {
        persona: normalizePersonaData(persona, painPointRegistry),
        draftId,
      };
    })
    .filter((entry) => isMeaningfulPersona(entry.persona));
}

function getMappedPreviousPersonaIndex(
  draftId: string | null,
  fallbackIndex: number,
  previousCount: number,
  usedPreviousIndexes: Set<number>
): number | null {
  if (draftId !== null) {
    const draftIdMatch = draftId.match(/^existing-(\d+)$/);
    if (!draftIdMatch) {
      return null;
    }

    const parsedIndex = Number.parseInt(draftIdMatch[1] ?? "", 10);
    if (
      Number.isInteger(parsedIndex) &&
      parsedIndex >= 0 &&
      parsedIndex < previousCount &&
        !usedPreviousIndexes.has(parsedIndex)
    ) {
      return parsedIndex;
    }

    return null;
  }

  if (fallbackIndex >= 0 && fallbackIndex < previousCount && !usedPreviousIndexes.has(fallbackIndex)) {
    return fallbackIndex;
  }

  return null;
}

function remapPersonaNameList(
  names: string[] | null | undefined,
  renameMap: Map<string, string>,
  validPersonaNames: Set<string>
): string[] {
  return [...new Set(
    normalizeStringList(names)
      .map((name) => renameMap.get(name) ?? name)
      .filter((name) => validPersonaNames.has(name))
  )];
}

export function applyManualManifestoEdit(
  state: StrategyArtifactState,
  nextManifesto: ManifestoData
): {
  manifestoData: ManifestoData;
  personaData: PersonaData[] | null;
  journeyMapData: JourneyMapData[] | null;
  keyFeaturesData: KeyFeaturesData | null;
  userFlowsData: UserFlow[] | null;
} {
  const manifestoData = normalizeManifestoData(nextManifesto, {
    fallbackPainPoints: buildFallbackPainPointsFromLegacyPersonas(state.personaData as unknown[]),
    validPersonaNames: (state.personaData ?? []).map((persona) => persona.name),
  });
  const previousJtbds = state.manifestoData?.jtbd ?? [];
  const nextJtbds = manifestoData.jtbd;
  const validPainPointIds = new Set((manifestoData.painPoints ?? []).map((painPoint) => painPoint.id));
  const validJtbdIds = new Set(nextJtbds.map((jtbd) => jtbd.id));

  const personaData = state.personaData
    ? state.personaData.map((persona) =>
        normalizePersonaData(
          {
            ...persona,
            painPointIds: persona.painPointIds.filter((id) => validPainPointIds.has(id)),
          },
          manifestoData.painPoints
        )
      )
    : null;

  const journeyMapData = state.journeyMapData
    ? state.journeyMapData.map((journeyMap) =>
        normalizeJourneyMapData(
          {
            ...journeyMap,
            stages: journeyMap.stages.map((stage) => ({
              ...stage,
              painPointIds: stage.painPointIds.filter((id) => validPainPointIds.has(id)),
            })),
          },
          manifestoData.painPoints
        )
      )
    : null;

  const keyFeaturesData = state.keyFeaturesData
    ? normalizeKeyFeaturesData(
        {
          ...state.keyFeaturesData,
          features: state.keyFeaturesData.features.map((feature) => ({
            ...feature,
            hmwIds: (feature.hmwIds ?? []).filter((id) => manifestoData.hmw.some((hmw) => hmw.id === id)),
            jtbdIds: feature.jtbdIds.filter((id) => validJtbdIds.has(id)),
            painPointIds: feature.painPointIds.filter((id) => validPainPointIds.has(id)),
            personaNames: (feature.personaNames ?? []).filter((name) =>
              (personaData ?? []).some((persona) => persona.name === name)
            ),
          })),
        },
        manifestoData,
        personaData
      )
    : null;

  if (!state.userFlowsData) {
    return { manifestoData, personaData, journeyMapData, keyFeaturesData, userFlowsData: null };
  }

  const exactIndexMap = buildJtbdIndexMap(previousJtbds, nextJtbds);
  const userFlowsData = state.userFlowsData
    .map((flow) => {
      const exactTextIndex = nextJtbds.findIndex((jtbd) => jtbd.text === flow.jtbdText);
      if (exactTextIndex >= 0) {
        return normalizeUserFlowData({
          ...flow,
          jtbdIndex: exactTextIndex,
          jtbdText: nextJtbds[exactTextIndex].text,
        });
      }

      const remappedIndex = exactIndexMap.get(flow.jtbdIndex);
      if (remappedIndex === undefined || !nextJtbds[remappedIndex]) {
        return null;
      }

      return normalizeUserFlowData({
        ...flow,
        jtbdIndex: remappedIndex,
        jtbdText: nextJtbds[remappedIndex].text,
      });
    })
    .filter((flow): flow is UserFlow => Boolean(flow));

  return {
    manifestoData,
    personaData,
    journeyMapData,
    keyFeaturesData,
    userFlowsData,
  };
}

export function applyManualPersonaEdit(
  state: StrategyArtifactState,
  personaIndex: number,
  nextPersona: PersonaData
): {
  manifestoData: ManifestoData | null;
  personaData: PersonaData[];
  journeyMapData: JourneyMapData[] | null;
  keyFeaturesData: KeyFeaturesData | null;
  userFlowsData: UserFlow[] | null;
} {
  return applyManualPersonasEdit(
    state,
    replaceAtIndex(state.personaData, personaIndex, nextPersona)
  );
}

export function applyManualPersonasEdit(
  state: StrategyArtifactState,
  nextPersonas: PersonaData[]
): {
  manifestoData: ManifestoData | null;
  personaData: PersonaData[];
  journeyMapData: JourneyMapData[] | null;
  keyFeaturesData: KeyFeaturesData | null;
  userFlowsData: UserFlow[] | null;
} {
  const previousPersonas = state.personaData ?? [];
  const normalizedEntries = normalizePersonaDraftEntries(
    nextPersonas,
    state.manifestoData?.painPoints ?? []
  );
  const personaData = normalizedEntries.map((entry) => entry.persona);
  const validPersonaNames = new Set(
    personaData.map((persona) => trimText(persona.name)).filter(Boolean)
  );
  const usedPreviousIndexes = new Set<number>();
  const renameMap = new Map<string, string>();

  normalizedEntries.forEach((entry, nextIndex) => {
    const previousIndex = getMappedPreviousPersonaIndex(
      entry.draftId,
      nextIndex,
      previousPersonas.length,
      usedPreviousIndexes
    );
    if (previousIndex === null) return;

    usedPreviousIndexes.add(previousIndex);
    const previousName = trimText(previousPersonas[previousIndex]?.name);
    const nextName = trimText(entry.persona.name);
    if (!previousName || !nextName) return;
    renameMap.set(previousName, nextName);
  });

  const manifestoData = state.manifestoData
    ? normalizeManifestoData(
        {
          ...state.manifestoData,
          jtbd: state.manifestoData.jtbd.map((jtbd) => ({
            ...jtbd,
            personaNames: remapPersonaNameList(jtbd.personaNames, renameMap, validPersonaNames),
          })),
        },
        {
          fallbackPainPoints: buildFallbackPainPointsFromLegacyPersonas(personaData as unknown[]),
          validPersonaNames: [...validPersonaNames],
        }
      )
    : null;

  const journeyMapData = state.journeyMapData
    ? state.journeyMapData
        .map((journeyMap) => {
          const nextName = renameMap.get(journeyMap.personaName) ?? journeyMap.personaName;
          if (!validPersonaNames.has(nextName)) return null;
          return normalizeJourneyMapData(
            { ...journeyMap, personaName: nextName },
            manifestoData?.painPoints ?? state.manifestoData?.painPoints ?? []
          );
        })
        .filter((journeyMap): journeyMap is JourneyMapData => Boolean(journeyMap))
    : null;

  const userFlowsData = state.userFlowsData
    ? state.userFlowsData.map((flow) =>
        normalizeUserFlowData({
          ...flow,
          personaNames: remapPersonaNameList(flow.personaNames, renameMap, validPersonaNames),
        })
      )
    : null;

  const keyFeaturesData = state.keyFeaturesData
    ? normalizeKeyFeaturesData(
        {
          ...state.keyFeaturesData,
          features: state.keyFeaturesData.features.map((feature) => ({
            ...feature,
            personaNames: remapPersonaNameList(feature.personaNames, renameMap, validPersonaNames),
          })),
        },
        manifestoData ?? state.manifestoData,
        personaData
      )
    : null;

  return {
    manifestoData,
    personaData,
    journeyMapData,
    keyFeaturesData,
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
    normalizeJourneyMapData(nextJourneyMap, state.manifestoData?.painPoints ?? [])
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
      ? normalizeKeyFeaturesData(
          {
            ...state.keyFeaturesData,
            ideaTitle: normalizedIdea.title,
          },
          state.manifestoData,
          state.personaData
        )
      : state.keyFeaturesData;

  return {
    ideaData,
    keyFeaturesData,
  };
}

export function applyManualKeyFeaturesEdit(
  nextKeyFeatures: KeyFeaturesData,
  manifestoData: ManifestoData | null,
  personaData: PersonaData[] | null = null
): KeyFeaturesData {
  return normalizeKeyFeaturesData(nextKeyFeatures, manifestoData, personaData);
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
