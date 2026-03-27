import test from "node:test";
import assert from "node:assert/strict";

import {
  buildJtbdClusterViewModels,
  JTBD_CLUSTER_EMPTY_PAIN_POINTS_TEXT,
} from "./jtbd-clusters.ts";

test("buildJtbdClusterViewModels groups linked pain points into the matching JTBD card", () => {
  const models = buildJtbdClusterViewModels({
    painPoints: [
      { id: "pain-point-1", text: "Plans drift after kickoff" },
      { id: "pain-point-2", text: "Handoffs go stale before implementation" },
    ],
    jtbd: [
      {
        id: "jtbd-1",
        text: "When priorities change, I want to update the strategy, so I can keep delivery aligned.",
        painPointIds: ["pain-point-1", "pain-point-2"],
        personaNames: ["Avery"],
      },
    ],
  } as never);

  assert.equal(models.length, 1);
  assert.equal(models[0].label, "jtbd-1");
  assert.deepEqual(
    models[0].painPoints.map((painPoint) => painPoint.text),
    ["Plans drift after kickoff", "Handoffs go stale before implementation"],
  );
});

test("buildJtbdClusterViewModels leaves JTBD cards visible when no pain points are linked", () => {
  const models = buildJtbdClusterViewModels({
    painPoints: [{ id: "pain-point-1", text: "Plans drift after kickoff" }],
    jtbd: [
      {
        id: "jtbd-1",
        text: "When priorities change, I want to update the strategy, so I can keep delivery aligned.",
        painPointIds: [],
        personaNames: ["Avery"],
      },
    ],
  } as never);

  assert.equal(models.length, 1);
  assert.deepEqual(models[0].painPoints, []);
  assert.equal(JTBD_CLUSTER_EMPTY_PAIN_POINTS_TEXT, "No linked pain points yet.");
});
