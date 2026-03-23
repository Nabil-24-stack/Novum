import test from "node:test";
import assert from "node:assert/strict";

import {
  detectStrategyRefreshArtifactFamilies,
  isStrategyRefreshRequest,
  resolveStrategyRefreshRequestPhase,
} from "./strategy-refresh.ts";

test("detects explicit cross-artifact refresh targets", () => {
  assert.deepEqual(
    detectStrategyRefreshArtifactFamilies(
      "Add another persona, refresh idea 3, and update the overview card, IA, and user flows accordingly.",
    ),
    ["overview", "personas", "ideas", "ia", "user-flows"],
  );
});

test("does not treat code-edit requests as strategy refreshes", () => {
  assert.equal(
    isStrategyRefreshRequest("Fix the dashboard page layout and update the button spacing."),
    false,
  );
});

test("routes downstream-only refreshes to solution-design semantics", () => {
  assert.equal(
    resolveStrategyRefreshRequestPhase("complete", ["ideas", "features", "ia", "user-flows"]),
    "solution-design",
  );
});

test("preserves handoff semantics for handoff-stage artifact refreshes", () => {
  assert.equal(
    resolveStrategyRefreshRequestPhase("handoff", ["personas"]),
    "handoff",
  );
});
