/** A single connection from a code element to a strategy artifact */
export interface DecisionConnection {
  id: string;
  pageId: string;
  componentDescription: string;
  sourceLocation?: { fileName: string; sectionLabel?: string };
  personaNames: string[]; // Must match PersonaData.name exactly
  jtbdIndices: number[]; // 0-based into ManifestoData.jtbd[]
  journeyStages?: { personaName: string; stageIndex: number }[];
  rationale: string;
  insightIndices?: number[]; // 0-based into InsightsCardData.insights[]
  isUntracked?: boolean; // true when built via "Build Anyway" override
}

/** All connections for a single page */
export interface PageDecisions {
  pageId: string;
  pageName: string;
  connections: DecisionConnection[];
}

/** The full product brain state — persisted as /product-brain.json in VFS */
export interface ProductBrainData {
  version: 1;
  pages: PageDecisions[];
}

export type CoverageDisplayState = "pending" | "ready" | "unavailable";

// --- Computed coverage types ---

export interface JtbdCoverage {
  index: number;
  text: string;
  addressed: boolean;
  addressedBy: { pageId: string; componentDescription: string; connectionId: string; personaNames: string[]; rationale: string; insightIndices?: number[] }[];
}

export interface PersonaCoverage {
  personaName: string;
  coveragePercent: number; // 0-100
  addressedJtbds: number;
  totalJtbds: number;
}

export interface JourneyStageCoverage {
  personaName: string;
  stageIndex: number;
  stageName: string;
  covered: boolean;
}

export interface CoverageSummary {
  overallPercent: number; // 0-100
  jtbdCoverage: JtbdCoverage[];
  personaCoverage: PersonaCoverage[];
  journeyStageCoverage: JourneyStageCoverage[];
  gaps: string[]; // Human-readable gap descriptions
}
