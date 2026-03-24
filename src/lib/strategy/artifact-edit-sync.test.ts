import test from "node:test";
import assert from "node:assert/strict";

import {
  applyManualIdeaEdit,
  applyManualManifestoEdit,
  applyManualPersonaEdit,
  normalizeIdeaData,
  normalizeInsightsData,
  normalizeJourneyMapData,
  normalizeKeyFeaturesData,
  normalizeManifestoData,
  normalizePersonaData,
  normalizeUserFlowData,
  resolveArtifactDraftChange,
} from "./artifact-edit-sync.ts";
import type {
  IdeaData,
  JourneyStage,
  JourneyMapData,
  KeyFeaturesData,
  ManifestoData,
  PersonaData,
  UserFlow,
} from "../../hooks/useStrategyStore.ts";
import type { InsightData } from "../../hooks/useDocumentStore.ts";

const jtbd = (id: string, text: string) => ({ id, text });
const painPoint = (id: string, text: string) => ({ id, text });
const feature = (
  overrides: Partial<KeyFeaturesData["features"][number]> = {}
): KeyFeaturesData["features"][number] => ({
  id: "feature-1",
  name: "Delta export",
  description: "Download changed sections.",
  priority: "high",
  jtbdIds: ["jtbd-1"],
  painPointIds: [],
  ...overrides,
});
const insight = (overrides: Partial<InsightData> = {}): InsightData => ({
  id: "insight-1",
  insight: "Need better collaboration",
  source: "conversation",
  ...overrides,
});

test("persona renames propagate to linked journey maps and user flows", () => {
  const personaData: PersonaData[] = [
    {
      name: "Avery",
      role: "Founder",
      bio: "Leads product direction.",
      goals: ["Ship quickly"],
      painPoints: [painPoint("persona-pain-1", "Context gets lost")],
      quote: "I need strategy to stay in sync.",
    },
  ];
  const journeyMapData: JourneyMapData[] = [
    {
      personaName: "Avery",
      stages: [],
    },
  ];
  const userFlowsData: UserFlow[] = [
    {
      id: "flow-1",
      jtbdIndex: 0,
      jtbdText: "Keep strategy synced with build context.",
      personaNames: ["Avery"],
      steps: [{ nodeId: "home", action: "Reviews the handoff" }],
    },
  ];

  const result = applyManualPersonaEdit(
    {
      manifestoData: null,
      personaData,
      journeyMapData,
      ideaData: null,
      selectedIdeaId: null,
      keyFeaturesData: null,
      userFlowsData,
    },
    0,
    {
      ...personaData[0],
      name: "Morgan",
    }
  );

  assert.equal(result.personaData[0].name, "Morgan");
  assert.equal(result.journeyMapData?.[0].personaName, "Morgan");
  assert.deepEqual(result.userFlowsData?.[0].personaNames, ["Morgan"]);
});

test("manifesto edits reindex exact JTBD matches and prune removed flows", () => {
  const manifestoData: ManifestoData = {
    title: "Novum",
    problemStatement: "Planning gets lost before build.",
    targetUser: "Product teams",
    environmentContext: "Inside product planning and handoff review sessions.",
    jtbd: [jtbd("jtbd-1", "Track strategy changes"), jtbd("jtbd-2", "Ship aligned updates")],
    hmw: ["How might we keep plans current?"],
  };
  const userFlowsData: UserFlow[] = [
    {
      id: "flow-1",
      jtbdIndex: 0,
      jtbdText: "Track strategy changes",
      personaNames: ["Avery"],
      steps: [{ nodeId: "home", action: "Reviews strategy changes" }],
    },
    {
      id: "flow-2",
      jtbdIndex: 1,
      jtbdText: "Ship aligned updates",
      personaNames: ["Avery"],
      steps: [{ nodeId: "editor", action: "Publishes the update" }],
    },
  ];

  const result = applyManualManifestoEdit(
    {
      manifestoData,
      personaData: null,
      journeyMapData: null,
      ideaData: null,
      selectedIdeaId: null,
      keyFeaturesData: null,
      userFlowsData,
    },
    {
      ...manifestoData,
      jtbd: [jtbd("jtbd-2", "Ship aligned updates"), jtbd("jtbd-3", "Keep the handoff current")],
    }
  );

  assert.deepEqual(
    result.userFlowsData?.map((flow) => ({
      id: flow.id,
      jtbdIndex: flow.jtbdIndex,
      jtbdText: flow.jtbdText,
    })),
    [
      {
        id: "flow-1",
        jtbdIndex: 1,
        jtbdText: "Keep the handoff current",
      },
      {
        id: "flow-2",
        jtbdIndex: 0,
        jtbdText: "Ship aligned updates",
      },
    ]
  );

  const pruned = applyManualManifestoEdit(
    {
      manifestoData,
      personaData: null,
      journeyMapData: null,
      ideaData: null,
      selectedIdeaId: null,
      keyFeaturesData: null,
      userFlowsData,
    },
    {
      ...manifestoData,
      jtbd: [jtbd("jtbd-1", "Track strategy changes")],
    }
  );

  assert.deepEqual(pruned.userFlowsData?.map((flow) => flow.id), ["flow-1"]);
});

test("selected idea title edits keep key-features title in sync when it matched", () => {
  const ideaData: IdeaData[] = [
    { id: "idea-1", title: "Living handoff", description: "A canvas-native PRD.", illustration: "" },
    { id: "idea-2", title: "Roadmap board", description: "A planning board.", illustration: "" },
  ];
  const keyFeaturesData: KeyFeaturesData = {
    ideaTitle: "Living handoff",
    features: [feature()],
  };

  const result = applyManualIdeaEdit(
    {
      manifestoData: null,
      personaData: null,
      journeyMapData: null,
      ideaData,
      selectedIdeaId: "idea-1",
      keyFeaturesData,
      userFlowsData: null,
    },
    0,
    {
      ...ideaData[0],
      title: "Living strategy handoff",
    }
  );

  assert.equal(result.ideaData[0].title, "Living strategy handoff");
  assert.equal(result.keyFeaturesData?.ideaTitle, "Living strategy handoff");
});

test("resolveArtifactDraftChange treats cloned manifesto drafts as unchanged", () => {
  const baseline: ManifestoData = {
    title: "Novum",
    problemStatement: "Planning gets lost before build.",
    targetUser: "Product teams",
    environmentContext: "Inside product planning and handoff review sessions.",
    jtbd: [jtbd("jtbd-1", "Keep plans current")],
    hmw: ["How might we reduce stale handoffs?"],
  };

  const result = resolveArtifactDraftChange({
    baseline,
    nextValue: structuredClone(baseline),
    normalize: normalizeManifestoData,
  });

  assert.equal(result.changed, false);
  assert.deepEqual(result.normalizedBaseline, normalizeManifestoData(baseline));
  assert.deepEqual(result.normalizedNextValue, normalizeManifestoData(baseline));
});

test("resolveArtifactDraftChange ignores whitespace-only insight and persona edits", () => {
  const insightResult = resolveArtifactDraftChange({
    baseline: {
      documents: [],
      insights: [insight()],
    },
    nextValue: {
      documents: [],
      insights: [
        insight({
          insight: "  Need better collaboration  ",
          quote: " ",
          sourceDocument: " ",
        }),
      ],
    },
    normalize: normalizeInsightsData,
  });

  assert.equal(insightResult.changed, false);
  assert.deepEqual(insightResult.normalizedNextValue, {
    documents: [],
    insights: [
      {
        id: "insight-1",
        insight: "Need better collaboration",
        quote: "",
        sourceDocument: "",
        source: "conversation",
      },
    ],
  });

  const persona: PersonaData = {
    name: "Avery",
    role: "Founder",
    bio: "Leads the team.",
    goals: ["Ship quickly"],
    painPoints: [painPoint("persona-pain-1", "Context drifts")],
    quote: "I need the plan to stay current.",
  };

  const personaResult = resolveArtifactDraftChange({
    baseline: persona,
    nextValue: {
      ...persona,
      name: "  Avery  ",
      role: " Founder ",
      goals: [" Ship quickly ", " "],
    },
    normalize: normalizePersonaData,
  });

  assert.equal(personaResult.changed, false);
});

test("normalizeInsightsData tolerates malformed insight fields", () => {
  const normalized = normalizeInsightsData({
    documents: [],
    insights: [
      {
        id: undefined as unknown as string,
        insight: undefined as unknown as string,
        quote: " Supporting quote ",
        sourceDocument: undefined as unknown as string,
      },
    ],
  });

  assert.equal(normalized.insights.length, 1);
  assert.equal(normalized.insights[0]?.insight, "");
  assert.equal(normalized.insights[0]?.quote, "Supporting quote");
  assert.equal(normalized.insights[0]?.sourceDocument, "");
  assert.match(normalized.insights[0]?.id ?? "", /^insight-/);
});

test("resolveArtifactDraftChange ignores canonicalized empty journey stages", () => {
  const baseline: JourneyMapData = {
    personaName: "Avery",
    stages: [],
  };

  const emptyStage: JourneyStage = {
    stage: " ",
    actions: [" "],
    thoughts: [],
    emotion: " ",
    painPoints: [],
    opportunities: [],
  };

  const result = resolveArtifactDraftChange({
    baseline,
    nextValue: {
      personaName: " Avery ",
      stages: [emptyStage],
    },
    normalize: normalizeJourneyMapData,
  });

  assert.equal(result.changed, false);
  assert.deepEqual(result.normalizedNextValue, baseline);
});

test("resolveArtifactDraftChange detects real idea text edits", () => {
  const baseline: IdeaData = {
    id: "idea-1",
    title: "Living handoff",
    description: "A canvas-native PRD compiler.",
    illustration: "",
  };

  const result = resolveArtifactDraftChange({
    baseline,
    nextValue: {
      ...baseline,
      description: "A live PRD compiler with editable artifacts.",
    },
    normalize: normalizeIdeaData,
  });

  assert.equal(result.changed, true);
  assert.deepEqual(result.normalizedNextValue, {
    ...baseline,
    description: "A live PRD compiler with editable artifacts.",
  });
});

test("resolveArtifactDraftChange detects real key-feature and user-flow edits", () => {
  const keyFeaturesResult = resolveArtifactDraftChange({
    baseline: {
      ideaTitle: "Living handoff",
      features: [feature()],
    },
    nextValue: {
      ideaTitle: "Living handoff",
      features: [
        feature(),
        feature({
          id: "feature-2",
          name: "Freshness check",
          description: "Detect stale handoffs after strategy changes.",
          priority: "medium" as const,
          jtbdIds: ["jtbd-2"],
        }),
      ],
    },
    normalize: normalizeKeyFeaturesData,
  });

  assert.equal(keyFeaturesResult.changed, true);

  const userFlowResult = resolveArtifactDraftChange({
    baseline: {
      id: "flow-1",
      jtbdIndex: 0,
      jtbdText: "Keep the handoff current.",
      personaNames: ["Avery"],
      steps: [{ nodeId: "home", action: "Reviews the current handoff" }],
    },
    nextValue: {
      id: "flow-1",
      jtbdIndex: 0,
      jtbdText: "Keep the handoff current.",
      personaNames: ["Avery"],
      steps: [{ nodeId: "home", action: "Regenerates the handoff after a change" }],
    },
    normalize: normalizeUserFlowData,
  });

  assert.equal(userFlowResult.changed, true);
});

test("normalizers trim text and remove empty list items", () => {
  assert.deepEqual(
    normalizeManifestoData({
      title: "  Novum  ",
      problemStatement: "  Planning gets lost  ",
      targetUser: " Product teams ",
      environmentContext: " During planning reviews ",
      jtbd: [jtbd("jtbd-1", " Keep context "), jtbd("jtbd-2", " "), jtbd("jtbd-3", "")],
      hmw: [" How might we keep plans current? ", ""],
    }),
    {
      title: "Novum",
      problemStatement: "Planning gets lost",
      targetUser: "Product teams",
      environmentContext: "During planning reviews",
      jtbd: [jtbd("jtbd-1", "Keep context")],
      hmw: ["How might we keep plans current?"],
    }
  );

  assert.deepEqual(
    normalizeKeyFeaturesData({
      ideaTitle: "  Living handoff ",
      features: [
        feature({ name: " Delta export ", description: " Download changed sections. " }),
        feature({ id: "feature-2", name: " ", description: " ", priority: "low", jtbdIds: [] }),
      ],
    }),
    {
      ideaTitle: "Living handoff",
      features: [feature()],
    }
  );
});
