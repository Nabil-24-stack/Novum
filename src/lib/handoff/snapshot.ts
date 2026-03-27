import type { InsightsCardData } from "@/hooks/useDocumentStore";
import type {
  FlowData,
  IdeaData,
  KeyFeatureData,
  KeyFeaturesData,
  ManifestoData,
  PersonaData,
  UserFlow,
} from "@/hooks/useStrategyStore";
import {
  deriveHmwIdsFromJtbds,
  derivePersonaNamesFromJtbds,
  getResolvedFeaturePainPointIds,
  isFeatureExportableForManifesto,
} from "../strategy/feature-traceability.ts";
import type { HandoffDirtySection, HandoffSnapshot } from "./types.ts";

function stableStringify(value: unknown): string {
  return JSON.stringify(value ?? null);
}

function normalizeFeatureRefs(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function normalizeFeatureForExport(
  feature: unknown,
  manifestoData: ManifestoData | null | undefined,
): KeyFeatureData | null {
  if (!feature || typeof feature !== "object") return null;

  const candidate = feature as Partial<KeyFeatureData>;
  const jtbdIds = normalizeFeatureRefs(candidate.jtbdIds);
  const hmwIds = normalizeFeatureRefs(candidate.hmwIds).length > 0
    ? normalizeFeatureRefs(candidate.hmwIds)
    : deriveHmwIdsFromJtbds(jtbdIds, manifestoData);
  const personaNames = normalizeFeatureRefs(candidate.personaNames).length > 0
    ? normalizeFeatureRefs(candidate.personaNames)
    : derivePersonaNamesFromJtbds(jtbdIds, manifestoData);

  return {
    id: typeof candidate.id === "string" ? candidate.id : "",
    name: typeof candidate.name === "string" ? candidate.name : "",
    description: typeof candidate.description === "string" ? candidate.description : "",
    priority:
      candidate.priority === "high" || candidate.priority === "medium" || candidate.priority === "low"
        ? candidate.priority
        : "medium",
    kind: candidate.kind === "supporting" ? "supporting" : "core",
    supportingJustification:
      typeof candidate.supportingJustification === "string" ? candidate.supportingJustification : "",
    hmwIds,
    jtbdIds,
    personaNames,
    painPointIds: getResolvedFeaturePainPointIds(
      {
        ...candidate,
        hmwIds,
        jtbdIds,
        personaNames,
      },
      manifestoData,
    ),
  };
}

function getNormalizedFeatures(
  keyFeatures: KeyFeaturesData | null | undefined,
  manifestoData: ManifestoData | null | undefined,
): KeyFeatureData[] {
  if (!Array.isArray(keyFeatures?.features)) return [];
  return keyFeatures.features
    .map((feature) => normalizeFeatureForExport(feature, manifestoData))
    .filter((feature): feature is KeyFeatureData => Boolean(feature));
}

export function isExportableFeature(
  feature: KeyFeatureData | null | undefined,
  manifestoData: ManifestoData | null | undefined,
  keyFeaturesData?: KeyFeaturesData | null | undefined,
): boolean {
  return isFeatureExportableForManifesto(feature, manifestoData, keyFeaturesData);
}

export function getExportableFeatures(
  keyFeatures: KeyFeaturesData | null | undefined,
  manifestoData: ManifestoData | null | undefined = null,
): KeyFeatureData[] {
  return getNormalizedFeatures(keyFeatures, manifestoData).filter((feature) =>
    isExportableFeature(feature, manifestoData, keyFeatures),
  );
}

export function getParkedFeatures(
  keyFeatures: KeyFeaturesData | null | undefined,
  manifestoData: ManifestoData | null | undefined = null,
): KeyFeatureData[] {
  return getNormalizedFeatures(keyFeatures, manifestoData).filter((feature) =>
    !isExportableFeature(feature, manifestoData, keyFeatures),
  );
}

function serializeKeyFeaturesForExportComparison(
  keyFeatures: KeyFeaturesData | null | undefined,
  manifestoData: ManifestoData | null | undefined,
): Array<Pick<KeyFeatureData, "id" | "name" | "description" | "priority" | "kind" | "supportingJustification" | "hmwIds" | "jtbdIds" | "personaNames" | "painPointIds">> {
  return getExportableFeatures(keyFeatures, manifestoData).map((feature) => ({
    id: feature.id,
    name: feature.name,
    description: feature.description,
    priority: feature.priority,
    kind: feature.kind,
    supportingJustification: feature.supportingJustification,
    hmwIds: feature.hmwIds,
    jtbdIds: feature.jtbdIds,
    personaNames: feature.personaNames,
    painPointIds: feature.painPointIds,
  }));
}

export function buildHandoffSnapshot(data: {
  productOverview: ManifestoData | null;
  insights: InsightsCardData | null;
  personas: PersonaData[] | null;
  journeyHighlights?: unknown;
  selectedSolution: IdeaData | null;
  keyFeatures: KeyFeaturesData | null;
  informationArchitecture: FlowData | null;
  userFlows: UserFlow[] | null;
}): HandoffSnapshot {
  return {
    productOverview: data.productOverview,
    insights: data.insights,
    personas: data.personas,
    selectedSolution: data.selectedSolution,
    keyFeatures: data.keyFeatures,
    informationArchitecture: data.informationArchitecture,
    userFlows: data.userFlows,
  };
}

export function getDirtyHandoffSections(
  current: HandoffSnapshot,
  baseline: HandoffSnapshot | null
): HandoffDirtySection[] {
  if (!baseline) return [];

  const dirtySections: HandoffDirtySection[] = [];
  const sectionMap: Array<[HandoffDirtySection, unknown, unknown]> = [
    ["product-overview", current.productOverview, baseline.productOverview],
    ["insights", current.insights, baseline.insights],
    ["personas", current.personas, baseline.personas],
    ["selected-solution", current.selectedSolution, baseline.selectedSolution],
    [
      "key-features",
      serializeKeyFeaturesForExportComparison(current.keyFeatures, current.productOverview),
      serializeKeyFeaturesForExportComparison(baseline.keyFeatures, baseline.productOverview),
    ],
    [
      "information-architecture",
      current.informationArchitecture,
      baseline.informationArchitecture,
    ],
    ["user-flows", current.userFlows, baseline.userFlows],
  ];

  for (const [section, currentValue, baselineValue] of sectionMap) {
    if (stableStringify(currentValue) !== stableStringify(baselineValue)) {
      dirtySections.push(section);
    }
  }

  return dirtySections;
}

export function hasMeaningfulHandoffSnapshot(snapshot: HandoffSnapshot): boolean {
  return Boolean(
    snapshot.productOverview ||
      snapshot.insights ||
      snapshot.personas?.length ||
      snapshot.selectedSolution ||
      snapshot.keyFeatures ||
      snapshot.informationArchitecture ||
      snapshot.userFlows?.length
  );
}

export function getParkedFeatureWarning(
  keyFeatures: KeyFeaturesData | null | undefined,
  manifestoData: ManifestoData | null | undefined = null,
): string | null {
  const parkedFeatures = getParkedFeatures(keyFeatures, manifestoData);

  if (parkedFeatures.length === 0) {
    return null;
  }

  const featureList = parkedFeatures
    .map((feature) => feature.name || feature.id)
    .filter(Boolean)
    .join(", ");

  return `${parkedFeatures.length} parked feature${parkedFeatures.length === 1 ? "" : "s"} will stay in Novum and be excluded from exported build files until fully linked or justified${featureList ? `: ${featureList}.` : "."}`;
}
