import test from "node:test";
import assert from "node:assert/strict";

import { resolveSelectedStrategyArtifactContext } from "./strategy-artifact-context.ts";

const baseInput = {
  insightsData: {
    insights: [{ id: "insight-1", insight: "Users need clarity", source: "conversation" as const }],
    documents: [{ name: "Research.pdf", uploadedAt: "2026-03-20T00:00:00.000Z" }],
  },
  manifestoData: {
    title: "Clarity Hub",
    problemStatement: "Teams lose context.",
    targetUser: "Product teams",
    environmentContext: "Inside product planning and implementation reviews.",
    jtbd: [{ id: "jtbd-1", text: "Track decisions" }],
    hmw: ["Reduce confusion"],
  },
  personaData: [
    {
      name: "Nora",
      role: "PM",
      bio: "Runs planning.",
      goals: ["Stay aligned"],
      painPoints: [{ id: "persona-pain-1", text: "Missing context" }],
      quote: "I need one source of truth.",
    },
  ],
  journeyMapData: [
    {
      personaName: "Nora",
      stages: [
        {
          stage: "Plan",
          actions: ["Collect notes"],
          thoughts: ["What changed?"],
          emotion: "anxious",
          painPoints: [{ id: "journey-pain-1", text: "Scattered docs" }],
          opportunities: ["Summarize changes"],
        },
      ],
    },
  ],
  ideaData: [
    {
      id: "idea-1",
      title: "Decision Timeline",
      description: "A chronological view of changes.",
      illustration: "<svg></svg>",
    },
  ],
  keyFeaturesData: {
    ideaTitle: "Decision Timeline",
    features: [
      {
        id: "feature-1",
        name: "Timeline",
        description: "Chronological updates",
        priority: "high" as const,
        jtbdIds: ["jtbd-1"],
        painPointIds: ["persona-pain-1"],
      },
    ],
  },
  userFlowsData: [
    {
      id: "flow-1",
      jtbdIndex: 0,
      jtbdText: "Track decisions",
      personaNames: ["Nora"],
      steps: [{ nodeId: "home", action: "Open dashboard" }],
    },
  ],
};

test("resolves overview and insights artifact context", () => {
  const insights = resolveSelectedStrategyArtifactContext({
    ...baseInput,
    selectedArtifactId: "insights",
  });
  const overview = resolveSelectedStrategyArtifactContext({
    ...baseInput,
    selectedArtifactId: "product-overview",
  });

  assert.equal(insights?.family, "insights");
  assert.match(insights?.promptContext ?? "", /Key Insights/);

  assert.equal(overview?.family, "overview");
  assert.match(overview?.promptContext ?? "", /Clarity Hub/);
});

test("resolves indexed artifact cards to the right families", () => {
  const persona = resolveSelectedStrategyArtifactContext({
    ...baseInput,
    selectedArtifactId: "persona-0",
  });
  const journey = resolveSelectedStrategyArtifactContext({
    ...baseInput,
    selectedArtifactId: "journey-0",
  });
  const userFlow = resolveSelectedStrategyArtifactContext({
    ...baseInput,
    selectedArtifactId: "user-flow-flow-1",
  });

  assert.equal(persona?.family, "personas");
  assert.match(persona?.label ?? "", /Nora/);

  assert.equal(journey?.family, "journey-maps");
  assert.match(journey?.label ?? "", /Nora/);

  assert.equal(userFlow?.family, "user-flows");
  assert.match(userFlow?.promptContext ?? "", /Track decisions/);
});

test("does not resolve idea cards into chat-scoped context", () => {
  const idea = resolveSelectedStrategyArtifactContext({
    ...baseInput,
    selectedArtifactId: "idea-idea-1",
  });

  assert.equal(idea, null);
});

test("resolves key features context and returns null for missing artifacts", () => {
  const keyFeatures = resolveSelectedStrategyArtifactContext({
    ...baseInput,
    selectedArtifactId: "key-features",
  });
  const missing = resolveSelectedStrategyArtifactContext({
    ...baseInput,
    selectedArtifactId: "persona-4",
  });

  assert.equal(keyFeatures?.family, "features");
  assert.equal(keyFeatures?.phaseHint, "solution-design");
  assert.equal(missing, null);
});
