import type { InsightsCardData } from "@/hooks/useDocumentStore";
import type {
  FlowData,
  IdeaData,
  JourneyMapData,
  KeyFeatureData,
  KeyFeaturesData,
  ManifestoData,
  PersonaData,
  UserFlow,
} from "@/hooks/useStrategyStore";
import type { HandoffDirtySection, HandoffSnapshot } from "./types.ts";

function stableStringify(value: unknown): string {
  return JSON.stringify(value ?? null);
}

export function isExportableFeature(feature: KeyFeatureData): boolean {
  return feature.jtbdIds.length > 0;
}

export function getExportableFeatures(
  keyFeatures: KeyFeaturesData | null | undefined,
): KeyFeatureData[] {
  return (keyFeatures?.features ?? []).filter(isExportableFeature);
}

export function getParkedFeatures(
  keyFeatures: KeyFeaturesData | null | undefined,
): KeyFeatureData[] {
  return (keyFeatures?.features ?? []).filter((feature) => !isExportableFeature(feature));
}

function serializeKeyFeaturesForExportComparison(
  keyFeatures: KeyFeaturesData | null | undefined,
): Array<Pick<KeyFeatureData, "id" | "name" | "description" | "priority" | "jtbdIds" | "painPointIds">> {
  return getExportableFeatures(keyFeatures).map((feature) => ({
    id: feature.id,
    name: feature.name,
    description: feature.description,
    priority: feature.priority,
    jtbdIds: feature.jtbdIds,
    painPointIds: feature.painPointIds,
  }));
}

export function buildHandoffSnapshot(data: {
  productOverview: ManifestoData | null;
  insights: InsightsCardData | null;
  personas: PersonaData[] | null;
  journeyHighlights: JourneyMapData[] | null;
  selectedSolution: IdeaData | null;
  keyFeatures: KeyFeaturesData | null;
  informationArchitecture: FlowData | null;
  userFlows: UserFlow[] | null;
}): HandoffSnapshot {
  return {
    productOverview: data.productOverview,
    insights: data.insights,
    personas: data.personas,
    journeyHighlights: data.journeyHighlights,
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
    ["journey-highlights", current.journeyHighlights, baseline.journeyHighlights],
    ["selected-solution", current.selectedSolution, baseline.selectedSolution],
    [
      "key-features",
      serializeKeyFeaturesForExportComparison(current.keyFeatures),
      serializeKeyFeaturesForExportComparison(baseline.keyFeatures),
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
      snapshot.journeyHighlights?.length ||
      snapshot.selectedSolution ||
      snapshot.keyFeatures ||
      snapshot.informationArchitecture ||
      snapshot.userFlows?.length
  );
}

export function getParkedFeatureWarning(
  keyFeatures: KeyFeaturesData | null | undefined,
): string | null {
  const parkedFeatures = getParkedFeatures(keyFeatures);

  if (parkedFeatures.length === 0) {
    return null;
  }

  const featureList = parkedFeatures
    .map((feature) => feature.name || feature.id)
    .filter(Boolean)
    .join(", ");

  return `${parkedFeatures.length} parked feature${parkedFeatures.length === 1 ? "" : "s"} will stay in Novum and be excluded from exported build files until linked to a JTBD${featureList ? `: ${featureList}.` : "."}`;
}
