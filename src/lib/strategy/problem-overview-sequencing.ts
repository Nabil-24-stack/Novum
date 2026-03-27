import type { StrategyRefreshArtifactFamily } from "../ai/strategy-refresh.ts";
import type { GroupId } from "./section-layout.ts";

export const FULL_PROBLEM_OVERVIEW_REFRESH_FAMILIES = [
  "overview",
  "insights",
  "personas",
] as const satisfies readonly StrategyRefreshArtifactFamily[];

export type ProblemOverviewSourceBlock = "overview" | "pain-points" | "personas";

export type ProblemOverviewSequenceStage =
  | "overview"
  | "pain-points"
  | "jtbd-clusters"
  | "personas"
  | "opportunity-map"
  | "fit-all";

export type ProblemOverviewSequenceStatus = "idle" | "running" | "completed";

export interface ProblemOverviewSequenceState {
  status: ProblemOverviewSequenceStatus;
  stage: ProblemOverviewSequenceStage | null;
  completedBlocks: Record<ProblemOverviewSourceBlock, boolean>;
  viewportSettled: boolean;
  stageRevealCompleted: boolean;
}

export type ProblemOverviewFocusTarget = GroupId | "fit-all";

const PROBLEM_OVERVIEW_GROUP_ORDER: GroupId[] = [
  "product-overview",
  "insights",
  "jtbd-clusters",
  "personas",
  "opportunity-map",
];

const STAGE_TO_FOCUS_TARGET: Record<ProblemOverviewSequenceStage, ProblemOverviewFocusTarget> = {
  overview: "product-overview",
  "pain-points": "insights",
  "jtbd-clusters": "jtbd-clusters",
  personas: "personas",
  "opportunity-map": "opportunity-map",
  "fit-all": "fit-all",
};

const STAGE_TO_VISIBLE_GROUP_COUNT: Record<Exclude<ProblemOverviewSequenceStage, "fit-all">, number> = {
  overview: 1,
  "pain-points": 2,
  "jtbd-clusters": 3,
  personas: 4,
  "opportunity-map": 5,
};

export function createIdleProblemOverviewSequenceState(): ProblemOverviewSequenceState {
  return {
    status: "idle",
    stage: null,
    completedBlocks: {
      overview: false,
      "pain-points": false,
      personas: false,
    },
    viewportSettled: false,
    stageRevealCompleted: false,
  };
}

export function createRunningProblemOverviewSequenceState(): ProblemOverviewSequenceState {
  return {
    status: "running",
    stage: "overview",
    completedBlocks: {
      overview: false,
      "pain-points": false,
      personas: false,
    },
    viewportSettled: false,
    stageRevealCompleted: false,
  };
}

export function shouldRunFullProblemOverviewSequence(params: {
  isInitialGeneration: boolean;
  explicitArtifactFamilies: StrategyRefreshArtifactFamily[];
}): boolean {
  if (params.isInitialGeneration) {
    return true;
  }

  const explicitFamilies = new Set(params.explicitArtifactFamilies);
  return FULL_PROBLEM_OVERVIEW_REFRESH_FAMILIES.every((family) => explicitFamilies.has(family));
}

export function getProblemOverviewFocusTarget(
  sequence: ProblemOverviewSequenceState,
): ProblemOverviewFocusTarget | null {
  if (sequence.status === "idle" || sequence.stage === null) {
    return null;
  }

  if (sequence.status === "completed") {
    return "fit-all";
  }

  return STAGE_TO_FOCUS_TARGET[sequence.stage];
}

export function isProblemOverviewGroupVisibleForStage(
  stage: ProblemOverviewSequenceStage,
  groupId: GroupId,
): boolean {
  if (stage === "fit-all") {
    return true;
  }

  const orderedGroupIndex = PROBLEM_OVERVIEW_GROUP_ORDER.indexOf(groupId);
  if (orderedGroupIndex === -1) {
    return true;
  }

  return orderedGroupIndex < STAGE_TO_VISIBLE_GROUP_COUNT[stage];
}

export function resolveNextProblemOverviewSequenceStage(
  sequence: ProblemOverviewSequenceState,
): ProblemOverviewSequenceStage | "complete" | null {
  if (sequence.status !== "running" || sequence.stage === null) {
    return null;
  }

  if (!sequence.viewportSettled || !sequence.stageRevealCompleted) {
    return null;
  }

  switch (sequence.stage) {
    case "overview":
      return "pain-points";
    case "pain-points":
      return "jtbd-clusters";
    case "jtbd-clusters":
      return "personas";
    case "personas":
      return "opportunity-map";
    case "opportunity-map":
      return "fit-all";
    case "fit-all":
      return "complete";
    default:
      return null;
  }
}
