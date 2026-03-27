import test from "node:test";
import assert from "node:assert/strict";

import {
  PROBLEM_OVERVIEW_STAGE_REVEAL_MIN_STAGE_MS,
  PROBLEM_OVERVIEW_STAGE_REVEAL_STEP_MS,
  type ProblemOverviewStageRevealData,
  getProblemOverviewStageRevealTotal,
  isProblemOverviewStageRevealComplete,
} from "./problem-overview-stage-reveal.ts";

const revealData: ProblemOverviewStageRevealData = {
  overview: {
    problemStatement: "Teams lose context between planning and build.",
    targetUser: "Product teams",
    painPoints: [
      { id: "pain-point-1", text: "Plans drift after kickoff" },
      { id: "pain-point-2", text: "Artifacts go stale" },
    ],
    jtbd: [
      {
        id: "jtbd-1",
        text: "Keep the plan aligned with current work.",
        painPointIds: ["pain-point-1"],
        personaNames: ["Avery"],
      },
      {
        id: "jtbd-2",
        text: "Spot changes before they create delivery risk.",
        painPointIds: ["pain-point-2"],
        personaNames: ["Morgan"],
      },
    ],
    hmw: [
      {
        id: "hmw-1",
        text: "How might we keep plans current?",
        jtbdIds: ["jtbd-1"],
        painPointIds: ["pain-point-1"],
      },
    ],
  },
  painPoints: {
    insights: [
      { id: "insight-1", insight: "Plans drift after kickoff" },
      { id: "insight-2", insight: "Artifacts go stale" },
      { id: "insight-3", insight: "Reviews happen too late" },
    ],
    documents: [],
  },
  personas: [
    {
      name: "Avery",
      role: "Product manager",
    },
    {
      name: "Morgan",
      role: "Engineering lead",
    },
  ],
};

const completedBlocks = {
  overview: true,
  "pain-points": true,
  personas: true,
} as const;

test("overview reveal always has two ordered units", () => {
  assert.equal(getProblemOverviewStageRevealTotal("overview", revealData), 2);
});

test("pain-point reveal prefers canonical pain points over surfaced evidence count", () => {
  assert.equal(getProblemOverviewStageRevealTotal("pain-points", revealData), 2);
});

test("pain-point reveal falls back to surfaced evidence when canonical pain points are absent", () => {
  assert.equal(
    getProblemOverviewStageRevealTotal("pain-points", {
      ...revealData,
      overview: {
        ...revealData.overview,
        painPoints: [],
      },
    }),
    3,
  );
});

test("jtbd, persona, and opportunity reveal totals match top-level rendered items", () => {
  assert.equal(getProblemOverviewStageRevealTotal("jtbd-clusters", revealData), 2);
  assert.equal(getProblemOverviewStageRevealTotal("personas", revealData), 2);
  assert.equal(getProblemOverviewStageRevealTotal("opportunity-map", revealData), 2);
});

test("AI-backed stages do not complete before their source block closes", () => {
  assert.equal(
    isProblemOverviewStageRevealComplete({
      stage: "overview",
      data: revealData,
      visibleUnits: 2,
      elapsedMs: PROBLEM_OVERVIEW_STAGE_REVEAL_MIN_STAGE_MS,
      completedBlocks: {
        overview: false,
        "pain-points": true,
        personas: true,
      },
    }),
    false,
  );
});

test("derived stages complete once all units are revealed and the minimum duration has elapsed", () => {
  assert.equal(
    isProblemOverviewStageRevealComplete({
      stage: "jtbd-clusters",
      data: revealData,
      visibleUnits: 2,
      elapsedMs: 2 * PROBLEM_OVERVIEW_STAGE_REVEAL_STEP_MS,
      completedBlocks,
    }),
    true,
  );
});
