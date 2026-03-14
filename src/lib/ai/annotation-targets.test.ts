import test from "node:test";
import assert from "node:assert/strict";

import { resolveAutoAnnotationTargets } from "./annotation-targets.ts";

const flowPages = [
  { id: "home", name: "Home", route: "/" },
  { id: "dashboard", name: "Dashboard", route: "/dashboard" },
  { id: "settings", name: "Settings", route: "/settings" },
];

test("maps a single page file edit to one target page", () => {
  const result = resolveAutoAnnotationTargets({
    writtenFiles: ["/pages/Home.tsx"],
    flowPages,
    fallbackPageIds: ["dashboard"],
    addedPageIds: [],
    removedPageIds: [],
  });

  assert.deepEqual(result, {
    targetPageIds: ["home"],
    removedPageIds: [],
  });
});

test("maps multiple page file edits to both target pages", () => {
  const result = resolveAutoAnnotationTargets({
    writtenFiles: ["/pages/Dashboard.tsx", "/pages/Settings.tsx"],
    flowPages,
    fallbackPageIds: ["home"],
    addedPageIds: [],
    removedPageIds: [],
  });

  assert.deepEqual(result, {
    targetPageIds: ["dashboard", "settings"],
    removedPageIds: [],
  });
});

test("falls back to edit-scope pages for shared-file-only edits", () => {
  const result = resolveAutoAnnotationTargets({
    writtenFiles: ["/components/layout/AppShell.tsx", "/App.tsx"],
    flowPages,
    fallbackPageIds: ["dashboard", "settings"],
    addedPageIds: [],
    removedPageIds: [],
  });

  assert.deepEqual(result, {
    targetPageIds: ["dashboard", "settings"],
    removedPageIds: [],
  });
});

test("includes added page ids once they exist in the latest manifest", () => {
  const result = resolveAutoAnnotationTargets({
    writtenFiles: ["/components/layout/AppShell.tsx"],
    flowPages: [...flowPages, { id: "reports", name: "Reports", route: "/reports" }],
    fallbackPageIds: ["dashboard"],
    addedPageIds: ["reports"],
    removedPageIds: [],
  });

  assert.deepEqual(result, {
    targetPageIds: ["reports"],
    removedPageIds: [],
  });
});

test("returns removed page ids for cleanup without adding them as targets", () => {
  const result = resolveAutoAnnotationTargets({
    writtenFiles: ["/components/layout/AppShell.tsx"],
    flowPages,
    fallbackPageIds: ["dashboard"],
    addedPageIds: [],
    removedPageIds: ["legacy", "dashboard"],
  });

  assert.deepEqual(result, {
    targetPageIds: ["dashboard"],
    removedPageIds: ["legacy"],
  });
});
