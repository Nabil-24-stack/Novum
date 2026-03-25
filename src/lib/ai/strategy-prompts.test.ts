import test from "node:test";
import assert from "node:assert/strict";

import {
  DESIGN_SYSTEM_CODEGEN_PROMPT_FRAGMENT,
  SOLUTION_DESIGN_SYSTEM_PROMPT,
  buildArtifactRefreshSystemPrompt,
  buildFoundationPrompt,
  buildIdeationSystemPrompt,
} from "./strategy-prompts.ts";

test("design system prompt forbids using Button for logos and wordmarks", () => {
  assert.match(
    DESIGN_SYSTEM_CODEGEN_PROMPT_FRAGMENT,
    /Do NOT use the `Button` component for logos, wordmarks, or decorative brand badges/,
  );
});

test("foundation prompt defines a non-button navbar brand area", () => {
  const prompt = buildFoundationPrompt(
    "Overview",
    "Flow",
    "Persona",
    [{ pageName: "Dashboard", pageRoute: "/" }],
  );

  assert.match(prompt, /Brand area based on the product name/);
  assert.match(prompt, /Do NOT use the `Button` component for the logo, wordmark, or brand badge/);
});

test("artifact refresh prompt requires Updated and Unchanged summaries", () => {
  const prompt = buildArtifactRefreshSystemPrompt({
    explicitArtifacts: ["personas"],
    sourcePhase: "handoff",
  });

  assert.match(prompt, /Every bullet MUST begin with either `Updated:` or `Unchanged:`/);
  assert.match(prompt, /Ask one concise clarification question in plain text/);
});

test("artifact refresh prompt limits allowed blocks and encodes dependency rules", () => {
  const prompt = buildArtifactRefreshSystemPrompt({
    explicitArtifacts: ["personas", "ideas", "ia"],
    sourcePhase: "handoff",
  });

  assert.match(prompt, /type="manifesto"/);
  assert.match(prompt, /type="personas"/);
  assert.match(prompt, /type="journey-maps"/);
  assert.match(prompt, /type="ideas"/);
  assert.match(prompt, /type="features"/);
  assert.match(prompt, /type="ia"/);
  assert.match(prompt, /type="user-flows"/);
  assert.match(prompt, /Persona changes: ALWAYS re-evaluate journey maps plus downstream solution artifacts/);
  assert.match(prompt, /Idea changes: re-evaluate the selected ideas first/);
  assert.match(prompt, /IA and user-flow changes: re-evaluate each other/);
});

test("solution design prompt requires page-level IA traceability fields", () => {
  assert.match(SOLUTION_DESIGN_SYSTEM_PROMPT, /"jtbdIds": \["JTBD-1"\]/);
  assert.match(SOLUTION_DESIGN_SYSTEM_PROMPT, /"featureIds": \["feature-1", "feature-2"\]/);
  assert.match(SOLUTION_DESIGN_SYSTEM_PROMPT, /Every `page` node MUST include `jtbdIds`/);
  assert.match(SOLUTION_DESIGN_SYSTEM_PROMPT, /Non-page nodes MUST omit `jtbdIds` and `featureIds`/);
});

test("ideation prompt encodes active user-authored idea mode contract", () => {
  const prompt = buildIdeationSystemPrompt({
    customIdeaFlow: {
      mode: "clarifying",
      awaiting: "user",
      nextIdeaId: "idea-9",
    },
  });

  assert.match(prompt, /USER-AUTHORED IDEA MODE \(ACTIVE\)/);
  assert.match(prompt, /type="user-idea"/);
  assert.match(prompt, /type="options"/);
  assert.match(prompt, /Allowed `status` values in this mode are only `"clarifying"` or `"ready"`/);
  assert.match(prompt, /Do NOT output a `type="ideas"` block yet/);
  assert.match(prompt, /output 1-3 `type="options"` blocks/);
  assert.match(prompt, /2-4 concise answer options/);
  assert.match(prompt, /ideaId: "idea-9"/);
  assert.match(prompt, /fully-populated `idea` object/);
  assert.match(prompt, /Do NOT output a `type="ideas"` block when completing a custom idea/);
  assert.match(prompt, /"idea": null/);
});

test("ideation prompt documents dormant user-authored idea mode when inactive", () => {
  const prompt = buildIdeationSystemPrompt();

  assert.match(prompt, /## USER-AUTHORED IDEA MODE/);
  assert.match(prompt, /If the UI activates a user-authored idea flow/);
  assert.doesNotMatch(prompt, /USER-AUTHORED IDEA MODE \(ACTIVE\)/);
});
