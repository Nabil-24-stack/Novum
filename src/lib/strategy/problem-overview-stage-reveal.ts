import type { InsightsCardData } from "../../hooks/useDocumentStore.ts";
import type { ManifestoData, PersonaData } from "../../hooks/useStrategyStore.ts";
import type {
  ProblemOverviewSequenceStage,
  ProblemOverviewSourceBlock,
} from "./problem-overview-sequencing.ts";

export const PROBLEM_OVERVIEW_STAGE_REVEAL_STEP_MS = 150;
export const PROBLEM_OVERVIEW_STAGE_REVEAL_MIN_STAGE_MS = 300;

export interface ProblemOverviewStageRevealData {
  overview: Partial<ManifestoData> | null;
  painPoints: Partial<InsightsCardData> | null;
  personas: Array<Partial<PersonaData>> | null;
}

interface ProblemOverviewStageRevealCompletionParams {
  stage: ProblemOverviewSequenceStage;
  data: ProblemOverviewStageRevealData;
  visibleUnits: number;
  elapsedMs: number;
  completedBlocks: Record<ProblemOverviewSourceBlock, boolean>;
}

function getPainPointRevealTotal(data: ProblemOverviewStageRevealData): number {
  const canonicalPainPointCount = data.overview?.painPoints?.length ?? 0;
  if (canonicalPainPointCount > 0) {
    return canonicalPainPointCount;
  }

  const surfacedInsightCount = data.painPoints?.insights?.length ?? 0;
  return Math.max(1, surfacedInsightCount);
}

function getPersonaRevealTotal(data: ProblemOverviewStageRevealData): number {
  return Math.max(1, data.personas?.length ?? 0);
}

export function getProblemOverviewStageRevealTotal(
  stage: ProblemOverviewSequenceStage,
  data: ProblemOverviewStageRevealData,
): number {
  switch (stage) {
    case "overview":
      return 2;
    case "pain-points":
      return getPainPointRevealTotal(data);
    case "jtbd-clusters":
      return Math.max(1, data.overview?.jtbd?.length ?? 0);
    case "personas":
      return getPersonaRevealTotal(data);
    case "opportunity-map":
      return getPersonaRevealTotal(data);
    case "fit-all":
      return 0;
    default:
      return 0;
  }
}

export function getProblemOverviewStageRequiredElapsedMs(
  stage: ProblemOverviewSequenceStage,
  data: ProblemOverviewStageRevealData,
): number {
  if (stage === "fit-all") {
    return 0;
  }

  const total = getProblemOverviewStageRevealTotal(stage, data);
  return Math.max(
    PROBLEM_OVERVIEW_STAGE_REVEAL_MIN_STAGE_MS,
    total * PROBLEM_OVERVIEW_STAGE_REVEAL_STEP_MS,
  );
}

export function getProblemOverviewStageSourceBlock(
  stage: ProblemOverviewSequenceStage,
): ProblemOverviewSourceBlock | null {
  switch (stage) {
    case "overview":
      return "overview";
    case "pain-points":
      return "pain-points";
    case "personas":
      return "personas";
    default:
      return null;
  }
}

export function isProblemOverviewStageRevealComplete(
  params: ProblemOverviewStageRevealCompletionParams,
): boolean {
  if (params.stage === "fit-all") {
    return true;
  }

  const total = getProblemOverviewStageRevealTotal(params.stage, params.data);
  const requiredElapsedMs = getProblemOverviewStageRequiredElapsedMs(params.stage, params.data);
  const hasFullyRevealedVisibleUnits = params.visibleUnits >= total;
  const hasSatisfiedMinimumDuration = params.elapsedMs >= requiredElapsedMs;
  const requiredSourceBlock = getProblemOverviewStageSourceBlock(params.stage);
  const sourceBlockCompleted = requiredSourceBlock
    ? params.completedBlocks[requiredSourceBlock]
    : true;

  return hasFullyRevealedVisibleUnits && hasSatisfiedMinimumDuration && sourceBlockCompleted;
}
