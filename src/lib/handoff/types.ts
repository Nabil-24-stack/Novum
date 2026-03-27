import type {
  FlowData,
  IdeaData,
  KeyFeaturesData,
  ManifestoData,
  PersonaData,
  UserFlow,
} from "@/hooks/useStrategyStore";
import type { InsightsCardData } from "@/hooks/useDocumentStore";

export type ProductMode = "handoff-v1";

export type HandoffDirtySection =
  | "product-overview"
  | "insights"
  | "personas"
  | "selected-solution"
  | "key-features"
  | "information-architecture"
  | "user-flows";

export interface HandoffSnapshot {
  productOverview: ManifestoData | null;
  insights: InsightsCardData | null;
  personas: PersonaData[] | null;
  selectedSolution: IdeaData | null;
  keyFeatures: KeyFeaturesData | null;
  informationArchitecture: FlowData | null;
  userFlows: UserFlow[] | null;
}

export interface HandoffState {
  problemMarkdown: string;
  solutionMarkdown: string;
  latestDeltaMarkdown: string | null;
  baselineSnapshot: HandoffSnapshot | null;
  baselineHash: string | null;
  dirtySections: HandoffDirtySection[];
  isOutdated: boolean;
  generatedAt: string | null;
  lastError: string | null;
}

export const HANDOFF_SECTION_LABELS: Record<HandoffDirtySection, string> = {
  "product-overview": "Product Overview",
  insights: "Insights",
  personas: "Personas",
  "selected-solution": "Selected Solution",
  "key-features": "Key Features",
  "information-architecture": "Information Architecture",
  "user-flows": "User Flows",
};

export function createEmptyHandoffState(): HandoffState {
  return {
    problemMarkdown: "",
    solutionMarkdown: "",
    latestDeltaMarkdown: null,
    baselineSnapshot: null,
    baselineHash: null,
    dirtySections: [],
    isOutdated: false,
    generatedAt: null,
    lastError: null,
  };
}

export function normalizeHandoffState(
  value: Partial<HandoffState> | { fullMarkdown?: string } | null | undefined
): HandoffState {
  const fallback = createEmptyHandoffState();
  if (!value) return fallback;

  const fullMarkdown = "fullMarkdown" in value && typeof value.fullMarkdown === "string"
    ? value.fullMarkdown
    : "";

  return {
    ...fallback,
    ...value,
    problemMarkdown:
      "problemMarkdown" in value && typeof value.problemMarkdown === "string"
        ? value.problemMarkdown
        : "",
    solutionMarkdown:
      "solutionMarkdown" in value && typeof value.solutionMarkdown === "string"
        ? value.solutionMarkdown
        : "",
    latestDeltaMarkdown:
      "latestDeltaMarkdown" in value && typeof value.latestDeltaMarkdown === "string"
        ? value.latestDeltaMarkdown
        : null,
    isOutdated:
      ("problemMarkdown" in value || "solutionMarkdown" in value)
        ? Boolean("isOutdated" in value ? value.isOutdated : fallback.isOutdated)
        : Boolean(fullMarkdown) || fallback.isOutdated,
  };
}
