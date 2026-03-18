import type {
  FlowData,
  IdeaData,
  JourneyMapData,
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
  | "journey-highlights"
  | "selected-solution"
  | "key-features"
  | "information-architecture"
  | "user-flows";

export interface HandoffSnapshot {
  productOverview: ManifestoData | null;
  insights: InsightsCardData | null;
  personas: PersonaData[] | null;
  journeyHighlights: JourneyMapData[] | null;
  selectedSolution: IdeaData | null;
  keyFeatures: KeyFeaturesData | null;
  informationArchitecture: FlowData | null;
  userFlows: UserFlow[] | null;
}

export interface HandoffState {
  fullMarkdown: string;
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
  "journey-highlights": "Journey Highlights",
  "selected-solution": "Selected Solution",
  "key-features": "Key Features",
  "information-architecture": "Information Architecture",
  "user-flows": "User Flows",
};

export function createEmptyHandoffState(): HandoffState {
  return {
    fullMarkdown: "",
    latestDeltaMarkdown: null,
    baselineSnapshot: null,
    baselineHash: null,
    dirtySections: [],
    isOutdated: false,
    generatedAt: null,
    lastError: null,
  };
}
