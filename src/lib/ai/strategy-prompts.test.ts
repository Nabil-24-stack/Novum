import test from "node:test";
import assert from "node:assert/strict";

import { DESIGN_SYSTEM_CODEGEN_PROMPT_FRAGMENT, buildFoundationPrompt } from "./strategy-prompts.ts";

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
