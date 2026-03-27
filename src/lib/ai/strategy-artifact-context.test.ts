import test from "node:test";
import assert from "node:assert/strict";

import { resolveSelectedStrategyArtifactContext } from "./strategy-artifact-context.ts";

const painPoint = (id: string, text: string) => ({ id, text });
const hmw = (id: string, text: string, overrides: { jtbdIds?: string[]; painPointIds?: string[] } = {}) => ({
  id,
  text,
  jtbdIds: [],
  painPointIds: [],
  ...overrides,
});

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
    painPoints: [
      painPoint("pain-point-1", "Missing context"),
      painPoint("pain-point-2", "Scattered docs"),
    ],
    jtbd: [{ id: "jtbd-1", text: "Track decisions", painPointIds: ["pain-point-1"], personaNames: ["Nora"] }],
    hmw: [hmw("hmw-1", "Reduce confusion", { jtbdIds: ["jtbd-1"], painPointIds: ["pain-point-1", "pain-point-2"] })],
  },
  personaData: [
    {
      name: "Nora",
      role: "PM",
      bio: "Runs planning.",
      goals: ["Stay aligned"],
      painPointIds: ["pain-point-1"],
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
          painPointIds: ["pain-point-2"],
          frictionNotes: ["Scattered docs"],
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
        kind: "core" as const,
        supportingJustification: "",
        jtbdIds: ["jtbd-1"],
        painPointIds: ["pain-point-1"],
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
  assert.match(insights?.promptContext ?? "", /Pain Points/);

  assert.equal(overview?.family, "overview");
  assert.match(overview?.promptContext ?? "", /Overview/);
  assert.match(overview?.promptContext ?? "", /Teams lose context/);
  assert.doesNotMatch(overview?.promptContext ?? "", /Clarity Hub/);
  assert.doesNotMatch(overview?.promptContext ?? "", /implementation reviews/);
});

test("resolves indexed artifact cards to the right families", () => {
  const jtbdClusters = resolveSelectedStrategyArtifactContext({
    ...baseInput,
    selectedArtifactId: "jtbd-clusters",
  });
  const personas = resolveSelectedStrategyArtifactContext({
    ...baseInput,
    selectedArtifactId: "personas",
  });
  const opportunityMap = resolveSelectedStrategyArtifactContext({
    ...baseInput,
    selectedArtifactId: "opportunity-map",
  });
  const userFlow = resolveSelectedStrategyArtifactContext({
    ...baseInput,
    selectedArtifactId: "user-flow-flow-1",
  });

  assert.equal(jtbdClusters?.family, "overview");
  assert.match(jtbdClusters?.label ?? "", /JTBD Clusters/);

  assert.equal(personas?.family, "personas");
  assert.match(personas?.label ?? "", /Personas/);

  assert.equal(opportunityMap?.family, "personas");
  assert.match(opportunityMap?.label ?? "", /Opportunity Map/);

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
