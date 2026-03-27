import test from "node:test";
import assert from "node:assert/strict";

import {
  createRunningProblemOverviewSequenceState,
  isProblemOverviewGroupVisibleForStage,
  resolveNextProblemOverviewSequenceStage,
  shouldRunFullProblemOverviewSequence,
} from "./problem-overview-sequencing.ts";

test("initial running stage only shows the overview card", () => {
  assert.deepEqual(createRunningProblemOverviewSequenceState().stage, "overview");
  assert.equal(isProblemOverviewGroupVisibleForStage("overview", "product-overview"), true);
  assert.equal(isProblemOverviewGroupVisibleForStage("overview", "insights"), false);
  assert.equal(isProblemOverviewGroupVisibleForStage("overview", "jtbd-clusters"), false);
  assert.equal(isProblemOverviewGroupVisibleForStage("overview", "personas"), false);
  assert.equal(isProblemOverviewGroupVisibleForStage("overview", "opportunity-map"), false);
});

test("pain points unlock only after overview block completion and viewport settle", () => {
  const sequence = createRunningProblemOverviewSequenceState();

  sequence.completedBlocks.overview = true;
  assert.equal(resolveNextProblemOverviewSequenceStage(sequence), null);

  sequence.viewportSettled = true;
  assert.equal(resolveNextProblemOverviewSequenceStage(sequence), "pain-points");
});

test("jtbd clusters unlock only after pain points completion and viewport settle", () => {
  const sequence = createRunningProblemOverviewSequenceState();

  sequence.stage = "pain-points";
  sequence.viewportSettled = true;
  assert.equal(resolveNextProblemOverviewSequenceStage(sequence), null);

  sequence.completedBlocks["pain-points"] = true;
  assert.equal(resolveNextProblemOverviewSequenceStage(sequence), "jtbd-clusters");
});

test("personas unlock only after jtbd viewport settle", () => {
  const sequence = createRunningProblemOverviewSequenceState();

  sequence.stage = "jtbd-clusters";
  assert.equal(resolveNextProblemOverviewSequenceStage(sequence), null);

  sequence.viewportSettled = true;
  assert.equal(resolveNextProblemOverviewSequenceStage(sequence), "personas");
});

test("opportunity map unlocks only after personas completion and viewport settle", () => {
  const sequence = createRunningProblemOverviewSequenceState();

  sequence.stage = "personas";
  sequence.completedBlocks.personas = true;
  assert.equal(resolveNextProblemOverviewSequenceStage(sequence), null);

  sequence.viewportSettled = true;
  assert.equal(resolveNextProblemOverviewSequenceStage(sequence), "opportunity-map");
});

test("fit-all is the last step after opportunity map and then completes", () => {
  const sequence = createRunningProblemOverviewSequenceState();

  sequence.stage = "opportunity-map";
  sequence.viewportSettled = true;
  assert.equal(resolveNextProblemOverviewSequenceStage(sequence), "fit-all");

  sequence.stage = "fit-all";
  assert.equal(resolveNextProblemOverviewSequenceStage(sequence), "complete");
});

test("initial generation always uses the full ordered sequence", () => {
  assert.equal(
    shouldRunFullProblemOverviewSequence({
      isInitialGeneration: true,
      explicitArtifactFamilies: [],
    }),
    true,
  );
});

test("full overview plus pain points plus personas refreshes use the full ordered sequence", () => {
  assert.equal(
    shouldRunFullProblemOverviewSequence({
      isInitialGeneration: false,
      explicitArtifactFamilies: ["overview", "insights", "personas"],
    }),
    true,
  );
});

test("partial problem-overview refreshes do not use the full ordered sequence", () => {
  assert.equal(
    shouldRunFullProblemOverviewSequence({
      isInitialGeneration: false,
      explicitArtifactFamilies: ["personas"],
    }),
    false,
  );
});
