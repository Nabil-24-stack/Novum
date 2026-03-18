import test from "node:test";
import assert from "node:assert/strict";
import {
  buildFullHandoffMarkdown,
  buildDeltaMarkdown,
} from "./markdown.ts";
import {
  buildHandoffSnapshot,
  getDirtyHandoffSections,
} from "./snapshot.ts";

test("detects dirty handoff sections", () => {
  const baseline = buildHandoffSnapshot({
    productOverview: {
      title: "Novum",
      problemStatement: "Teams lose context between planning and build.",
      targetUser: "Product teams",
      jtbd: ["Translate strategy into build-ready artifacts."],
      hmw: ["How might we keep strategy alive as requirements change?"],
    },
    insights: null,
    personas: null,
    journeyHighlights: null,
    selectedSolution: null,
    keyFeatures: null,
    informationArchitecture: null,
    userFlows: null,
  });

  const current = buildHandoffSnapshot({
    ...baseline,
    keyFeatures: {
      ideaTitle: "Living strategy handoff",
      features: [
        {
          name: "Markdown handoff",
          description: "Generate a PRD-style markdown handoff.",
          priority: "high",
        },
      ],
    },
  });

  assert.deepEqual(getDirtyHandoffSections(current, baseline), ["key-features"]);
});

test("builds full handoff markdown with core sections", () => {
  const snapshot = buildHandoffSnapshot({
    productOverview: {
      title: "Novum",
      problemStatement: "Planning gets lost before build.",
      targetUser: "Product teams",
      jtbd: ["Keep strategy synced with build context."],
      hmw: ["How might we generate living handoffs?"],
    },
    insights: {
      insights: [{ insight: "Users value strategy more than generation." }],
      documents: [],
    },
    personas: [
      {
        name: "Avery",
        role: "Founder",
        bio: "Leads product direction.",
        goals: ["Ship quickly"],
        painPoints: ["Context gets lost"],
        quote: "I need strategy to stay in sync.",
      },
    ],
    journeyHighlights: [],
    selectedSolution: {
      id: "idea-1",
      title: "Living handoff",
      description: "A canvas-native PRD compiler.",
      illustration: "",
    },
    keyFeatures: {
      ideaTitle: "Living handoff",
      features: [
        {
          name: "Regenerate markdown",
          description: "Refresh the exported PRD after strategy changes.",
          priority: "high",
        },
      ],
    },
    informationArchitecture: {
      nodes: [{ id: "home", label: "Home", type: "page", description: "Overview and exports" }],
      connections: [],
    },
    userFlows: [
      {
        id: "flow-1",
        jtbdIndex: 0,
        jtbdText: "Keep strategy synced with build context.",
        personaNames: ["Avery"],
        steps: [{ nodeId: "home", action: "Reviews the updated markdown handoff" }],
      },
    ],
  });

  const markdown = buildFullHandoffMarkdown({
    snapshot,
    executiveSummary: "Novum compiles product strategy into a living PRD.",
  });

  assert.match(markdown, /# Novum PRD/);
  assert.match(markdown, /## Executive Summary/);
  assert.match(markdown, /## Key Features/);
  assert.match(markdown, /## Open Questions/);
});

test("builds delta markdown for changed sections only", () => {
  const snapshot = buildHandoffSnapshot({
    productOverview: null,
    insights: null,
    personas: null,
    journeyHighlights: null,
    selectedSolution: null,
    keyFeatures: {
      ideaTitle: "Living handoff",
      features: [
        {
          name: "Delta export",
          description: "Download only the changed sections.",
          priority: "high",
        },
      ],
    },
    informationArchitecture: null,
    userFlows: null,
  });

  const markdown = buildDeltaMarkdown({
    currentSnapshot: snapshot,
    dirtySections: ["key-features"],
    deltaSummary: "The product now supports exporting only changed sections.",
  });

  assert.match(markdown, /# Strategy Delta/);
  assert.match(markdown, /## Change Summary/);
  assert.match(markdown, /## Key Features/);
  assert.doesNotMatch(markdown, /## Personas/);
});
