import test from "node:test";
import assert from "node:assert/strict";

import {
  appendOrReplaceIdea,
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
      idea: null,
    }
  );

  assert.deepEqual(
    normalizeUserIdeaBlockData({
      status: "ready",
      ideaId: " idea-9 ",
      confirmationSummary: "Polished idea",
      clarificationQuestions: [],
      idea: {
        id: " idea-9 ",
        title: " Shift exchange concierge ",
        description: " Makes coverage swaps easy. ",
        illustration: " <svg /> ",
      },
    }),
    {
      status: "ready",
      ideaId: "idea-9",
      confirmationSummary: "Polished idea",
      clarificationQuestions: [],
      idea: {
        id: "idea-9",
        title: "Shift exchange concierge",
        description: "Makes coverage swaps easy.",
        illustration: "<svg />",
      },
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
      idea: null,
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
      idea: {
        id: "idea-9",
        title: "Ritual planning workspace",
        description: "Create a weekly plan from recurring rituals.",
        illustration: "<svg />",
      },
    }),
    {
      ...createIdleCustomIdeaFlow(),
      readyIdeaId: "idea-9",
    }
  );
});

test("appendOrReplaceIdea appends new ideas and replaces matching ids only", () => {
  assert.deepEqual(
    appendOrReplaceIdea(
      [
        { id: "idea-1", title: "Daily pulse", description: "", illustration: "" },
        { id: "idea-2", title: "Coach mode", description: "", illustration: "" },
      ],
      { id: "idea-3", title: "Field notebook", description: "Offline capture", illustration: "<svg />" }
    ),
    [
      { id: "idea-1", title: "Daily pulse", description: "", illustration: "" },
      { id: "idea-2", title: "Coach mode", description: "", illustration: "" },
      { id: "idea-3", title: "Field notebook", description: "Offline capture", illustration: "<svg />" },
    ]
  );

  assert.deepEqual(
    appendOrReplaceIdea(
      [
        { id: "idea-1", title: "Daily pulse", description: "", illustration: "" },
        { id: "idea-2", title: "Coach mode", description: "", illustration: "" },
      ],
      { id: "idea-2", title: "Coach mode", description: "Guided planning", illustration: "<svg />" }
    ),
    [
      { id: "idea-1", title: "Daily pulse", description: "", illustration: "" },
      { id: "idea-2", title: "Coach mode", description: "Guided planning", illustration: "<svg />" },
    ]
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
