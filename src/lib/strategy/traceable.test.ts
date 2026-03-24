import test from "node:test";
import assert from "node:assert/strict";

import {
  getTraceableTexts,
  normalizeTraceableTextList,
} from "./traceable.ts";

test("getTraceableTexts ignores malformed legacy entries", () => {
  const values = [
    { id: "jtbd-1", text: " Keep strategy aligned " },
    { id: "jtbd-2" },
    { text: "Missing id" },
    undefined,
    " Ship with confidence ",
  ] as unknown as Array<{ id: string; text: string } | string>;

  assert.deepEqual(getTraceableTexts(values), [
    "Keep strategy aligned",
    "Missing id",
    "Ship with confidence",
  ]);
});

test("normalizeTraceableTextList reuses valid previous ids and skips malformed previous items", () => {
  const previous = [
    { id: "jtbd-1", text: "Keep plans current" },
    { id: "jtbd-2" },
    { text: "Missing id" },
  ] as unknown as Array<{ id: string; text: string }>;

  const normalized = normalizeTraceableTextList({
    values: [
      "Keep plans current",
      { id: "jtbd-3", text: "Reduce drift during handoff" },
      { text: "No id yet" },
    ] as unknown as Array<{ id: string; text: string } | string>,
    prefix: "jtbd",
    previous,
  });

  assert.equal(normalized[0]?.id, "jtbd-1");
  assert.equal(normalized[0]?.text, "Keep plans current");
  assert.equal(normalized[1]?.id, "jtbd-3");
  assert.equal(normalized[1]?.text, "Reduce drift during handoff");
  assert.match(normalized[2]?.id ?? "", /^jtbd-/);
  assert.equal(normalized[2]?.text, "No id yet");
});
