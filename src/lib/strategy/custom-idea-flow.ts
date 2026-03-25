import type {
  CustomIdeaFlowMode,
  CustomIdeaFlowState,
  IdeaData,
} from "../../hooks/useStrategyStore.ts";

export interface UserIdeaBlockData {
  status: "clarifying" | "ready";
  ideaId: string | null;
  confirmationSummary: string;
  clarificationQuestions: string[];
  idea: IdeaData | null;
}

function trimText(value: string | null | undefined): string {
  return value?.trim() ?? "";
}

export function createIdleCustomIdeaFlow(): CustomIdeaFlowState {
  return {
    mode: "idle",
    draftText: "",
    awaiting: "none",
    confirmationSummary: "",
    clarificationQuestions: [],
    readyIdeaId: null,
  };
}

export function normalizeUserIdeaBlockData(
  value: Partial<UserIdeaBlockData> | null | undefined
): UserIdeaBlockData | null {
  if (!value) return null;

  const status = value.status === "ready" ? "ready" : value.status === "clarifying" ? "clarifying" : null;
  if (!status) return null;

  return {
    status,
    ideaId: trimText(value.ideaId) || null,
    confirmationSummary: trimText(value.confirmationSummary),
    clarificationQuestions: (value.clarificationQuestions ?? []).map(trimText).filter(Boolean),
    idea:
      value.idea &&
      typeof value.idea === "object" &&
      trimText((value.idea as Partial<IdeaData>).id) &&
      trimText((value.idea as Partial<IdeaData>).title)
        ? {
            id: trimText((value.idea as Partial<IdeaData>).id),
            title: trimText((value.idea as Partial<IdeaData>).title),
            description: trimText((value.idea as Partial<IdeaData>).description),
            illustration: trimText((value.idea as Partial<IdeaData>).illustration),
          }
        : null,
  };
}

export function applyUserIdeaBlockToFlow(
  current: CustomIdeaFlowState,
  block: UserIdeaBlockData
): CustomIdeaFlowState {
  if (block.status === "ready") {
    return {
      ...createIdleCustomIdeaFlow(),
      readyIdeaId: block.idea?.id ?? block.ideaId,
    };
  }

  return {
    ...current,
    mode: "clarifying",
    draftText: "",
    awaiting: "user",
    confirmationSummary: block.confirmationSummary,
    clarificationQuestions: block.clarificationQuestions,
    readyIdeaId: null,
  };
}

export function resolveResumedCustomIdeaMode(flow: CustomIdeaFlowState): CustomIdeaFlowMode {
  if (flow.clarificationQuestions.length > 0 || flow.awaiting === "user") {
    return "clarifying";
  }
  return "collecting";
}

export function getNextIdeaId(
  ideas: Array<Pick<IdeaData, "id"> | Partial<IdeaData>> | null | undefined
): string {
  const maxIdeaNumber = (ideas ?? []).reduce((max, idea) => {
    const match = trimText(idea.id).match(/^idea-(\d+)$/i);
    if (!match) return max;
    return Math.max(max, Number.parseInt(match[1], 10));
  }, 0);

  return `idea-${Math.max(1, maxIdeaNumber + 1)}`;
}

export function isCustomIdeaFlowActive(flow: CustomIdeaFlowState): boolean {
  return flow.mode === "collecting" || flow.mode === "clarifying";
}

export function appendOrReplaceIdea(
  existingIdeas: IdeaData[] | null | undefined,
  nextIdea: IdeaData
): IdeaData[] {
  const ideas = existingIdeas ?? [];
  const existingIndex = ideas.findIndex((idea) => idea.id === nextIdea.id);

  if (existingIndex === -1) {
    return [...ideas, nextIdea];
  }

  const updated = [...ideas];
  updated[existingIndex] = nextIdea;
  return updated;
}
