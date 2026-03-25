import test from "node:test";
import assert from "node:assert/strict";

import {
  applyUserIdeaBlockToFlow,
  createIdleCustomIdeaFlow,
  getNextIdeaId,
  normalizeUserIdeaBlockData,
  resolveResumedCustomIdeaMode,
} from "./custom-idea-flow.ts";
import { useStrategyStore } from "../../hooks/useStrategyStore.ts";

test("normalizeUserIdeaBlockData accepts clarifying and ready blocks", () => {
  assert.deepEqual(
    normalizeUserIdeaBlockData({
      status: "clarifying",
      confirmationSummary: "  Smart intake for shift swaps. ",
      clarificationQuestions: [" Which teams need it first? ", " "],
    }),
    {
      status: "clarifying",
      ideaId: null,
      confirmationSummary: "Smart intake for shift swaps.",
      clarificationQuestions: ["Which teams need it first?"],
    }
  );

  assert.deepEqual(
    normalizeUserIdeaBlockData({
      status: "ready",
      ideaId: " idea-9 ",
      confirmationSummary: "Polished idea",
      clarificationQuestions: [],
    }),
    {
      status: "ready",
      ideaId: "idea-9",
      confirmationSummary: "Polished idea",
      clarificationQuestions: [],
    }
  );
});

test("applyUserIdeaBlockToFlow moves custom idea flow into clarifying or ready states", () => {
  const base = {
    ...createIdleCustomIdeaFlow(),
    mode: "collecting" as const,
    draftText: "Let users assemble a weekly plan from recurring rituals.",
    awaiting: "assistant" as const,
  };

  assert.deepEqual(
    applyUserIdeaBlockToFlow(base, {
      status: "clarifying",
      ideaId: null,
      confirmationSummary: "A ritual-based planning workspace.",
      clarificationQuestions: ["Should it support teams or just individuals?"],
    }),
    {
      ...base,
      mode: "clarifying",
      draftText: "",
      awaiting: "user",
      confirmationSummary: "A ritual-based planning workspace.",
      clarificationQuestions: ["Should it support teams or just individuals?"],
      readyIdeaId: null,
    }
  );

  assert.deepEqual(
    applyUserIdeaBlockToFlow(base, {
      status: "ready",
      ideaId: "idea-9",
      confirmationSummary: "A ritual-based planning workspace.",
      clarificationQuestions: [],
    }),
    {
      ...createIdleCustomIdeaFlow(),
      readyIdeaId: "idea-9",
    }
  );
});

test("getNextIdeaId advances from the highest numeric idea id", () => {
  assert.equal(
    getNextIdeaId([
      { id: "idea-1" },
      { id: "idea-8" },
      { id: "idea-12" },
      { id: "custom" },
    ]),
    "idea-13"
  );
});

test("resolveResumedCustomIdeaMode restores clarifying drafts when questions remain", () => {
  assert.equal(
    resolveResumedCustomIdeaMode({
      ...createIdleCustomIdeaFlow(),
      mode: "paused",
      awaiting: "user",
      clarificationQuestions: ["What data sources should it ingest?"],
    }),
    "clarifying"
  );

  assert.equal(
    resolveResumedCustomIdeaMode({
      ...createIdleCustomIdeaFlow(),
      mode: "paused",
      draftText: "An offline-first field checklist workspace.",
      awaiting: "none",
      clarificationQuestions: [],
    }),
    "collecting"
  );
});

test("strategy store hydrates persisted customIdeaFlow state", () => {
  useStrategyStore.getState().reset();
  useStrategyStore.getState().hydrate({
    customIdeaFlow: {
      mode: "paused",
      draftText: "  Community-maintained shift swapping ",
      awaiting: "user",
      confirmationSummary: "  A shared swap board ",
      clarificationQuestions: [" Which departments use it? ", " "],
      readyIdeaId: " idea-9 ",
    },
  });

  assert.deepEqual(useStrategyStore.getState().customIdeaFlow, {
    mode: "paused",
    draftText: "Community-maintained shift swapping",
    awaiting: "user",
    confirmationSummary: "A shared swap board",
    clarificationQuestions: ["Which departments use it?"],
    readyIdeaId: "idea-9",
  });

  useStrategyStore.getState().reset();
});
