import test from "node:test";
import assert from "node:assert/strict";

import {
  DESIGN_SYSTEM_CODEGEN_PROMPT_FRAGMENT,
  buildArtifactRefreshSystemPrompt,
  buildFoundationPrompt,
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
