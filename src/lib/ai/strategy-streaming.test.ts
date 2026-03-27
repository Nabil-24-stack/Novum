import test from "node:test";
import assert from "node:assert/strict";

import {
  extractPartialOverview,
  shapeStreamingOverview,
} from "./strategy-streaming.ts";

test("extractPartialOverview parses object-based pain points and linked JTBD ids", () => {
  const partial = extractPartialOverview(`Before the block
\`\`\`json type="manifesto"
{
  "problemStatement": "Planning gets lost before build.",
  "targetUser": "Product teams",
  "painPoints": [
    { "id": "pain-point-1", "text": "Plans drift after kickoff" },
    { "id": "pain-point-2", "text": "Handoffs go stale before implementation" }
  ],
  "jtbd": [
    {
      "id": "jtbd-1",
      "text": "When priorities change, I want to update the strategy, so I can keep delivery aligned.",
      "painPointIds": ["pain-point-1", "pain-point-2"],
      "personaNames": ["Avery"]
    }
  ],
  "hmw": [
    {
      "id": "hmw-1",
      "text": "How might we keep plans current?",
      "jtbdIds": ["jtbd-1"],
      "painPointIds": ["pain-point-2"]
    }
  ]
}`);

  assert.deepEqual(partial?.painPoints, [
    { id: "pain-point-1", text: "Plans drift after kickoff" },
    { id: "pain-point-2", text: "Handoffs go stale before implementation" },
  ]);
  assert.deepEqual(partial?.jtbd, [
    {
      id: "jtbd-1",
      text: "When priorities change, I want to update the strategy, so I can keep delivery aligned.",
      painPointIds: ["pain-point-1", "pain-point-2"],
      personaNames: ["Avery"],
    },
  ]);
  assert.deepEqual(partial?.hmw, [
    {
      id: "hmw-1",
      text: "How might we keep plans current?",
      jtbdIds: ["jtbd-1"],
      painPointIds: ["pain-point-2"],
    },
  ]);
});

test("shapeStreamingOverview preserves JTBD pain-point links during streaming", () => {
  const shaped = shapeStreamingOverview(
    {
      problemStatement: "Planning gets lost before build.",
      targetUser: "Product teams",
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
    },
    null,
  );

  assert.deepEqual(shaped.painPoints, [
    { id: "pain-point-1", text: "Plans drift after kickoff" },
    { id: "pain-point-2", text: "Handoffs go stale before implementation" },
  ]);
  assert.deepEqual(shaped.jtbd, [
    {
      id: "jtbd-1",
      text: "When priorities change, I want to update the strategy, so I can keep delivery aligned.",
      painPointIds: ["pain-point-1", "pain-point-2"],
      personaNames: ["Avery"],
    },
  ]);
});

test("extractPartialOverview keeps incomplete trailing pain point objects typed for streaming", () => {
  const partial = extractPartialOverview(`\`\`\`json type="manifesto"
{
  "painPoints": [
    {
      "text": "Plans drift after kickoff"
`);

  assert.deepEqual(partial?.painPoints, [
    { text: "Plans drift after kickoff" },
  ]);
});

test("extractPartialOverview keeps incomplete trailing JTBD objects with linked fields", () => {
  const partial = extractPartialOverview(`\`\`\`json type="manifesto"
{
  "jtbd": [
    {
      "id": "jtbd-1",
      "text": "Keep strategy aligned",
      "painPointIds": ["pain-point-1"],
      "personaNames": ["Avery"]
`);

  assert.deepEqual(partial?.jtbd, [
    {
      id: "jtbd-1",
      text: "Keep strategy aligned",
      painPointIds: ["pain-point-1"],
      personaNames: ["Avery"],
    },
  ]);
});

test("extractPartialOverview keeps incomplete trailing HMW objects with linked ids", () => {
  const partial = extractPartialOverview(`\`\`\`json type="manifesto"
{
  "hmw": [
    {
      "id": "hmw-1",
      "text": "Reduce planning drift",
      "jtbdIds": ["jtbd-1"],
      "painPointIds": ["pain-point-2"]
`);

  assert.deepEqual(partial?.hmw, [
    {
      id: "hmw-1",
      text: "Reduce planning drift",
      jtbdIds: ["jtbd-1"],
      painPointIds: ["pain-point-2"],
    },
  ]);
});
