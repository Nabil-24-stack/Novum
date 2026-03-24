import test from "node:test";
import assert from "node:assert/strict";
import {
  buildDeltaMarkdown,
  buildProblemMarkdown,
  buildSolutionMarkdown,
} from "./markdown.ts";
import { getHandoffWarningMessage } from "./validation.ts";
import {
  buildHandoffSnapshot,
  getDirtyHandoffSections,
} from "./snapshot.ts";

const jtbd = (id: string, text: string) => ({ id, text });
const painPoint = (id: string, text: string) => ({ id, text });
const feature = (overrides: Partial<NonNullable<ReturnType<typeof buildHandoffSnapshot>["keyFeatures"]>["features"][number]> = {}) => ({
  id: "feature-1",
  name: "Regenerate markdown",
  description: "Refresh the exported handoff after strategy changes.",
  priority: "high" as const,
  jtbdIds: ["jtbd-1"],
  painPointIds: ["persona-pain-1"],
  ...overrides,
});

test("detects dirty handoff sections", () => {
  const baseline = buildHandoffSnapshot({
    productOverview: {
      title: "Novum",
      problemStatement: "Teams lose context between planning and build.",
      targetUser: "Product teams",
      environmentContext: "During handoff and review workflows.",
      jtbd: [jtbd("jtbd-1", "Translate strategy into build-ready artifacts.")],
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
      features: [feature()],
    },
  });

  assert.deepEqual(getDirtyHandoffSections(current, baseline), ["key-features"]);
});

test("builds deterministic problem and solution markdown", () => {
  const snapshot = buildHandoffSnapshot({
    productOverview: {
      title: "Novum",
      problemStatement: "Planning gets lost before build.",
      targetUser: "Product teams",
      environmentContext: "During product planning and implementation handoff.",
      jtbd: [jtbd("jtbd-1", "Keep strategy synced with build context.")],
      hmw: ["How might we generate living handoffs?"],
    },
    insights: {
      insights: [{ id: "insight-1", insight: "Users value strategy more than generation." }],
      documents: [],
    },
    personas: [
      {
        name: "Avery",
        role: "Founder",
        bio: "Leads product direction.",
        goals: ["Ship quickly"],
        painPoints: [painPoint("persona-pain-1", "Context gets lost")],
        quote: "I need strategy to stay in sync.",
      },
    ],
    journeyHighlights: [
      {
        personaName: "Avery",
        stages: [
          {
            stage: "Review",
            actions: ["Checks latest plan"],
            thoughts: ["Did anything drift?"],
            emotion: "anxious",
            painPoints: [painPoint("journey-pain-1", "Changes are scattered")],
            opportunities: ["Centralize updates"],
          },
        ],
      },
    ],
    selectedSolution: {
      id: "idea-1",
      title: "Living handoff",
      description: "A canvas-native handoff compiler.",
      illustration: "",
    },
    keyFeatures: {
      ideaTitle: "Living handoff",
      features: [feature()],
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

  const problemMarkdown = buildProblemMarkdown({ snapshot });
  const solutionMarkdown = buildSolutionMarkdown({ snapshot });

  assert.match(problemMarkdown, /# problem\.md/);
  assert.match(problemMarkdown, /Environment \/ Usage Context: During product planning and implementation handoff\./);
  assert.match(problemMarkdown, /jtbd-1: Keep strategy synced with build context\./);
  assert.match(problemMarkdown, /persona-pain-1: Context gets lost/);
  assert.match(problemMarkdown, /journey-pain-1: Changes are scattered/);

  assert.match(solutionMarkdown, /# solution\.md/);
  assert.match(solutionMarkdown, /feature-1: Regenerate markdown/);
  assert.match(solutionMarkdown, /Solves For: jtbd-1: Keep strategy synced with build context\. \(Personas: Avery\)/);
  assert.match(solutionMarkdown, /### home: Home/);
  assert.match(solutionMarkdown, /Supports JTBDs: jtbd-1: Keep strategy synced with build context\./);
  assert.match(solutionMarkdown, /Anchoring Features: feature-1: Regenerate markdown/);
});

test("screen descriptions prefer explicit page linkage when present", () => {
  const snapshot = buildHandoffSnapshot({
    productOverview: {
      title: "TrimLog",
      problemStatement: "Users need fast nutrition planning.",
      targetUser: "Weight-loss users",
      environmentContext: "During meal planning and review.",
      jtbd: [jtbd("jtbd-1", "Set goals without friction.")],
      hmw: [],
    },
    insights: null,
    personas: null,
    journeyHighlights: null,
    selectedSolution: {
      id: "idea-1",
      title: "Guided setup",
      description: "A guided setup flow for goal creation.",
      illustration: "",
    },
    keyFeatures: {
      ideaTitle: "Guided setup",
      features: [feature({ id: "feature-setup", name: "Goal Setup", jtbdIds: ["jtbd-1"] })],
    },
    informationArchitecture: {
      nodes: [
        {
          id: "onboarding",
          label: "Onboarding",
          type: "page",
          description: "Set calorie goal and macro targets",
          jtbdIds: ["jtbd-1"],
          featureIds: ["feature-setup"],
        },
      ],
      connections: [],
    },
    userFlows: null,
  });

  const solutionMarkdown = buildSolutionMarkdown({ snapshot });

  assert.match(solutionMarkdown, /### onboarding: Onboarding/);
  assert.match(solutionMarkdown, /Supports JTBDs: jtbd-1: Set goals without friction\./);
  assert.match(solutionMarkdown, /Anchoring Features: feature-setup: Goal Setup/);
});

test("legacy screen descriptions fall back to text-matched features when flow links are missing", () => {
  const snapshot = buildHandoffSnapshot({
    productOverview: {
      title: "TrimLog",
      problemStatement: "Users need setup guidance.",
      targetUser: "Weight-loss users",
      environmentContext: "During onboarding and account maintenance.",
      jtbd: [jtbd("jtbd-1", "Set goals without friction.")],
      hmw: [],
    },
    insights: null,
    personas: null,
    journeyHighlights: null,
    selectedSolution: {
      id: "idea-1",
      title: "Guided setup",
      description: "A guided setup flow for goal creation.",
      illustration: "",
    },
    keyFeatures: {
      ideaTitle: "Guided setup",
      features: [
        feature({
          id: "feature-setup",
          name: "Goal Setup & Onboarding",
          description: "Set calorie goal, macro targets, and goal weight with smart defaults.",
          jtbdIds: ["jtbd-1"],
        }),
      ],
    },
    informationArchitecture: {
      nodes: [
        {
          id: "settings",
          label: "Settings",
          type: "page",
          description: "Edit goals, macro targets, and account preferences",
        },
      ],
      connections: [],
    },
    userFlows: null,
  });

  const solutionMarkdown = buildSolutionMarkdown({ snapshot });

  assert.match(solutionMarkdown, /### settings: Settings/);
  assert.match(solutionMarkdown, /Supports JTBDs: jtbd-1: Set goals without friction\./);
  assert.match(solutionMarkdown, /Anchoring Features: feature-setup: Goal Setup & Onboarding/);
});

test("unresolved page linkage is flagged in solution markdown and warning state", () => {
  const snapshot = buildHandoffSnapshot({
    productOverview: {
      title: "TrimLog",
      problemStatement: "Users need reporting context.",
      targetUser: "Weight-loss users",
      environmentContext: "During weekly review.",
      jtbd: [jtbd("jtbd-1", "Review weekly performance.")],
      hmw: [],
    },
    insights: null,
    personas: null,
    journeyHighlights: null,
    selectedSolution: {
      id: "idea-1",
      title: "Reporting workspace",
      description: "A reporting workspace with multiple report actions.",
      illustration: "",
    },
    keyFeatures: {
      ideaTitle: "Reporting workspace",
      features: [
        feature({
          id: "feature-overview",
          name: "Reports Review",
          description: "Review performance reports and history.",
          jtbdIds: ["jtbd-1"],
          painPointIds: [],
        }),
        feature({
          id: "feature-history",
          name: "Reports History",
          description: "Review performance reports and history.",
          jtbdIds: ["jtbd-1"],
          painPointIds: [],
        }),
      ],
    },
    informationArchitecture: {
      nodes: [
        {
          id: "reports",
          label: "Reports",
          type: "page",
          description: "Review performance reports and history",
        },
      ],
      connections: [],
    },
    userFlows: null,
  });

  const solutionMarkdown = buildSolutionMarkdown({ snapshot });
  const warningMessage = getHandoffWarningMessage(snapshot);

  assert.match(solutionMarkdown, /Supports JTBDs: Unresolved linkage: no JTBD mapping could be derived for this page\./);
  assert.match(solutionMarkdown, /Anchoring Features: Unresolved linkage: no feature mapping could be derived for this page\./);
  assert.doesNotMatch(solutionMarkdown, /No JTBDs linked yet\./);
  assert.doesNotMatch(solutionMarkdown, /No features linked yet\./);
  assert.equal(
    warningMessage,
    "1 screen still has unresolved linkage: reports (JTBDs, features)."
  );
});

test("solution markdown compacts pain point references while problem markdown keeps full pain detail", () => {
  const fullPainPointText =
    "Food search in other apps returns 50 results for chicken breast -- she never knows which one is right";
  const snapshot = buildHandoffSnapshot({
    productOverview: {
      title: "TrimLog",
      problemStatement: "Meal logging takes too long.",
      targetUser: "Weight-loss users",
      environmentContext: "During daily meal logging.",
      jtbd: [jtbd("jtbd-1", "Log meals quickly.")],
      hmw: [],
    },
    insights: null,
    personas: [
      {
        name: "Maya",
        role: "Office administrator",
        bio: "Needs fast logging.",
        goals: ["Log meals quickly"],
        painPoints: [painPoint("persona-pain-1", fullPainPointText)],
        quote: "I need food search to be faster.",
      },
    ],
    journeyHighlights: null,
    selectedSolution: {
      id: "idea-1",
      title: "Fast search",
      description: "A fast search-driven logging flow.",
      illustration: "",
    },
    keyFeatures: {
      ideaTitle: "Fast search",
      features: [feature({ painPointIds: ["persona-pain-1"] })],
    },
    informationArchitecture: {
      nodes: [{ id: "search", label: "Search", type: "page", description: "Search and log food" }],
      connections: [],
    },
    userFlows: [
      {
        id: "flow-1",
        jtbdIndex: 0,
        jtbdText: "Log meals quickly.",
        personaNames: ["Maya"],
        steps: [{ nodeId: "search", action: "Searches for a meal" }],
      },
    ],
  });

  const problemMarkdown = buildProblemMarkdown({ snapshot });
  const solutionMarkdown = buildSolutionMarkdown({ snapshot });

  assert.match(problemMarkdown, /Food search in other apps returns 50 results for chicken breast -- she never knows which one is right/);
  assert.match(solutionMarkdown, /Resolves Pain Points: persona-pain-1 \(food search in other apps returns 50 results.../);
  assert.doesNotMatch(solutionMarkdown, /Persona: Maya/);
  assert.doesNotMatch(solutionMarkdown, /she never knows which one is right/);
});

test("builds actionable delta markdown for changed sections only", () => {
  const previousSnapshot = buildHandoffSnapshot({
    productOverview: {
      title: "Novum",
      problemStatement: "Planning gets lost before build.",
      targetUser: "Product teams",
      environmentContext: "During product planning and implementation handoff.",
      jtbd: [jtbd("jtbd-1", "Keep strategy synced with build context.")],
      hmw: [],
    },
    insights: null,
    personas: null,
    journeyHighlights: null,
    selectedSolution: null,
    keyFeatures: {
      ideaTitle: "Living handoff",
      features: [feature()],
    },
    informationArchitecture: {
      nodes: [{ id: "home", label: "Home", type: "page", description: "Overview" }],
      connections: [],
    },
    userFlows: [
      {
        id: "flow-1",
        jtbdIndex: 0,
        jtbdText: "Keep strategy synced with build context.",
        personaNames: ["Avery"],
        steps: [{ nodeId: "home", action: "Reviews the handoff" }],
      },
    ],
  });

  const currentSnapshot = buildHandoffSnapshot({
    ...previousSnapshot,
    keyFeatures: {
      ideaTitle: "Living handoff",
      features: [
        feature({ description: "Refresh the exported handoff and highlight what changed." }),
      ],
    },
  });

  const markdown = buildDeltaMarkdown({
    currentSnapshot,
    previousSnapshot,
    dirtySections: ["key-features"],
  });

  assert.match(markdown, /# delta\.md/);
  assert.match(markdown, /## Feature Changes/);
  assert.match(markdown, /Updated feature feature-1: Regenerate markdown/);
  assert.match(markdown, /## Build Impact/);
  assert.match(markdown, /Revisit JTBD coverage for: jtbd-1/);
});

test("parked features are excluded from solution output and do not dirty exports on parked-only edits", () => {
  const baseline = buildHandoffSnapshot({
    productOverview: {
      title: "Novum",
      problemStatement: "Planning gets lost before build.",
      targetUser: "Product teams",
      environmentContext: "During product planning and implementation handoff.",
      jtbd: [jtbd("jtbd-1", "Keep strategy synced with build context.")],
      hmw: [],
    },
    insights: null,
    personas: null,
    journeyHighlights: null,
    selectedSolution: null,
    keyFeatures: {
      ideaTitle: "Living handoff",
      features: [feature({ id: "feature-parked", name: "Parking lot", jtbdIds: [] })],
    },
    informationArchitecture: null,
    userFlows: null,
  });

  const current = buildHandoffSnapshot({
    ...baseline,
    keyFeatures: {
      ideaTitle: "Living handoff",
      features: [
        feature({
          id: "feature-parked",
          name: "Parking lot",
          description: "Still not ready for export.",
          jtbdIds: [],
        }),
      ],
    },
  });

  const solutionMarkdown = buildSolutionMarkdown({ snapshot: current });

  assert.match(solutionMarkdown, /No linked features are ready for build yet\./);
  assert.doesNotMatch(solutionMarkdown, /feature-parked/);
  assert.deepEqual(getDirtyHandoffSections(current, baseline), []);
});

test("delta treats linked to parked features as removed from exported scope", () => {
  const previousSnapshot = buildHandoffSnapshot({
    productOverview: {
      title: "Novum",
      problemStatement: "Planning gets lost before build.",
      targetUser: "Product teams",
      environmentContext: "During product planning and implementation handoff.",
      jtbd: [jtbd("jtbd-1", "Keep strategy synced with build context.")],
      hmw: [],
    },
    insights: null,
    personas: null,
    journeyHighlights: null,
    selectedSolution: null,
    keyFeatures: {
      ideaTitle: "Living handoff",
      features: [feature()],
    },
    informationArchitecture: null,
    userFlows: null,
  });

  const currentSnapshot = buildHandoffSnapshot({
    ...previousSnapshot,
    keyFeatures: {
      ideaTitle: "Living handoff",
      features: [feature({ jtbdIds: [] })],
    },
  });

  const dirtySections = getDirtyHandoffSections(currentSnapshot, previousSnapshot);
  const markdown = buildDeltaMarkdown({
    currentSnapshot,
    previousSnapshot,
    dirtySections,
  });

  assert.deepEqual(dirtySections, ["key-features"]);
  assert.match(markdown, /Removed feature feature-1: Regenerate markdown/);
});

test("legacy baseline feature snapshots without link arrays do not crash dirty-section detection", () => {
  const baseline = buildHandoffSnapshot({
    productOverview: {
      title: "Novum",
      problemStatement: "Planning gets lost before build.",
      targetUser: "Product teams",
      environmentContext: "During product planning and implementation handoff.",
      jtbd: [jtbd("jtbd-1", "Keep strategy synced with build context.")],
      hmw: [],
    },
    insights: null,
    personas: null,
    journeyHighlights: null,
    selectedSolution: null,
    keyFeatures: {
      ideaTitle: "Living handoff",
      features: [
        {
          id: "feature-legacy",
          name: "Legacy feature",
          description: "Stored before traceability arrays existed.",
          priority: "high",
        } as unknown as NonNullable<ReturnType<typeof buildHandoffSnapshot>["keyFeatures"]>["features"][number],
      ],
    },
    informationArchitecture: null,
    userFlows: null,
  });

  const current = buildHandoffSnapshot({
    ...baseline,
    keyFeatures: {
      ideaTitle: "Living handoff",
      features: [feature({ id: "feature-legacy", name: "Legacy feature" })],
    },
  });

  assert.deepEqual(getDirtyHandoffSections(current, baseline), ["key-features"]);
});

test("non-selected idea edits do not dirty the handoff snapshot", () => {
  const selectedIdeaId = "idea-1";
  const baselineIdeas = [
    { id: "idea-1", title: "Living handoff", description: "A canvas-native PRD compiler.", illustration: "" },
    { id: "idea-2", title: "Roadmap board", description: "A planning board.", illustration: "" },
  ];
  const currentIdeas = [
    baselineIdeas[0],
    { ...baselineIdeas[1], description: "A planning board with release tracking." },
  ];

  const baseline = buildHandoffSnapshot({
    productOverview: null,
    insights: null,
    personas: null,
    journeyHighlights: null,
    selectedSolution: baselineIdeas.find((idea) => idea.id === selectedIdeaId) ?? null,
    keyFeatures: null,
    informationArchitecture: null,
    userFlows: null,
  });

  const current = buildHandoffSnapshot({
    productOverview: null,
    insights: null,
    personas: null,
    journeyHighlights: null,
    selectedSolution: currentIdeas.find((idea) => idea.id === selectedIdeaId) ?? null,
    keyFeatures: null,
    informationArchitecture: null,
    userFlows: null,
  });

  assert.deepEqual(getDirtyHandoffSections(current, baseline), []);
});

test("selected idea edits dirty the selected-solution handoff section", () => {
  const baseline = buildHandoffSnapshot({
    productOverview: null,
    insights: null,
    personas: null,
    journeyHighlights: null,
    selectedSolution: {
      id: "idea-1",
      title: "Living handoff",
      description: "A canvas-native PRD compiler.",
      illustration: "",
    },
    keyFeatures: null,
    informationArchitecture: null,
    userFlows: null,
  });

  const current = buildHandoffSnapshot({
    productOverview: null,
    insights: null,
    personas: null,
    journeyHighlights: null,
    selectedSolution: {
      id: "idea-1",
      title: "Living handoff",
      description: "A live PRD compiler with editable artifacts.",
      illustration: "",
    },
    keyFeatures: null,
    informationArchitecture: null,
    userFlows: null,
  });

  assert.deepEqual(getDirtyHandoffSections(current, baseline), ["selected-solution"]);
});
