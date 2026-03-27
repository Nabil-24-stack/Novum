import test from "node:test";
import assert from "node:assert/strict";

import { finalizeManifestoBlockData } from "./strategy-manifesto-finalization.ts";

test("finalizeManifestoBlockData accepts prompt-valid manifesto blocks without title", () => {
  const result = finalizeManifestoBlockData({
    problemStatement: "Teams lose context between planning and build.",
    targetUser: "Product teams",
    painPoints: [
      { id: "pain-point-1", text: "Plans drift after kickoff" },
    ],
    jtbd: [
      {
        id: "jtbd-1",
        text: "When priorities change, I want to update the plan, so I can keep delivery aligned.",
        painPointIds: ["pain-point-1"],
        personaNames: ["Avery"],
      },
    ],
    hmw: [
      {
        id: "hmw-1",
        text: "How might we keep planning current as work changes?",
        jtbdIds: ["jtbd-1"],
        painPointIds: ["pain-point-1"],
      },
    ],
  });

  assert.ok(result);
  assert.equal(result.title, "");
  assert.equal(result.problemStatement, "Teams lose context between planning and build.");
  assert.equal(result.targetUser, "Product teams");
  assert.equal(result.painPoints?.length, 1);
  assert.equal(result.jtbd.length, 1);
  assert.equal(result.hmw.length, 1);
});

test("finalizeManifestoBlockData preserves title when present", () => {
  const result = finalizeManifestoBlockData({
    title: "Planning sync",
    problemStatement: "Teams lose context between planning and build.",
    targetUser: "Product teams",
    painPoints: [],
    jtbd: [],
    hmw: [],
  });

  assert.ok(result);
  assert.equal(result.title, "Planning sync");
});

test("finalizeManifestoBlockData rejects incomplete manifesto blocks", () => {
  assert.equal(
    finalizeManifestoBlockData({
      problemStatement: "Teams lose context between planning and build.",
      jtbd: [],
      hmw: [],
      painPoints: [],
    }),
    null,
  );
});
