import type {
  HandoffDirtySection,
  HandoffSnapshot,
} from "./types.ts";
import { getExportableFeatures } from "./snapshot.ts";
import { HANDOFF_SECTION_LABELS } from "./types.ts";
import {
  resolvePageTraceability,
  UNRESOLVED_FEATURE_LINKAGE_TEXT,
  UNRESOLVED_JTBD_LINKAGE_TEXT,
} from "./validation.ts";

function bulletList(items: string[]): string {
  if (items.length === 0) return "- None captured yet.";
  return items.map((item) => `- ${item}`).join("\n");
}

function numberedList(items: string[]): string {
  if (items.length === 0) return "1. None captured yet.";
  return items.map((item, index) => `${index + 1}. ${item}`).join("\n");
}

function formatText(value: string | undefined | null): string {
  return value?.trim() || "Not specified yet.";
}

function stableStringify(value: unknown): string {
  return JSON.stringify(value ?? null);
}

function getJtbdRegistry(snapshot: HandoffSnapshot) {
  return new Map((snapshot.productOverview?.jtbd ?? []).map((jtbd) => [jtbd.id, jtbd.text]));
}

function getPainPointRegistry(snapshot: HandoffSnapshot) {
  const registry = new Map<string, string>();

  for (const persona of snapshot.personas ?? []) {
    for (const painPoint of persona.painPoints) {
      registry.set(painPoint.id, painPoint.text);
    }
  }

  for (const journeyMap of snapshot.journeyHighlights ?? []) {
    for (const stage of journeyMap.stages) {
      for (const painPoint of stage.painPoints) {
        registry.set(painPoint.id, painPoint.text);
      }
    }
  }

  return registry;
}

function buildPainPointShortLabel(text: string): string {
  const firstClause =
    text
      .split(/\s(?:-|--|---)\s|\s[–—]\s|[;|]/)
      .map((part) => part.trim())
      .find(Boolean) ?? text.trim();
  const normalized = firstClause.replace(/["']/g, "").replace(/\s+/g, " ").trim().toLowerCase();
  if (!normalized) return "unknown pain point";
  if (normalized.length <= 48) return normalized;

  const truncated = normalized.slice(0, 48);
  const lastSpace = truncated.lastIndexOf(" ");
  return `${(lastSpace > 24 ? truncated.slice(0, lastSpace) : truncated).trim()}...`;
}

function formatInsightLine(insight: NonNullable<HandoffSnapshot["insights"]>["insights"][number]): string {
  const parts = [`${insight.id}: ${insight.insight}`];
  if (insight.sourceDocument) parts.push(`Source: ${insight.sourceDocument}`);
  if (insight.quote) parts.push(`Quote: "${insight.quote}"`);
  return parts.join(" | ");
}

function buildProblemStatement(snapshot: HandoffSnapshot): string {
  return [
    `- Title: ${formatText(snapshot.productOverview?.title)}`,
    `- Core Problem: ${formatText(snapshot.productOverview?.problemStatement)}`,
    `- Target User: ${formatText(snapshot.productOverview?.targetUser)}`,
    `- Environment / Usage Context: ${formatText(snapshot.productOverview?.environmentContext)}`,
  ].join("\n");
}

function buildJobsToBeDone(snapshot: HandoffSnapshot): string {
  return bulletList(
    (snapshot.productOverview?.jtbd ?? []).map((jtbd) => `${jtbd.id}: ${jtbd.text}`)
  );
}

function buildPersonas(snapshot: HandoffSnapshot): string {
  const personas = snapshot.personas ?? [];
  if (personas.length === 0) {
    return "- Personas have not been finalized yet.";
  }

  return personas
    .map((persona) =>
      [
        `### ${persona.name}`,
        `- Role: ${formatText(persona.role)}`,
        `- Bio: ${formatText(persona.bio)}`,
        `- Goals: ${persona.goals.length > 0 ? persona.goals.join("; ") : "Not specified yet."}`,
        `- Pain Points: ${
          persona.painPoints.length > 0
            ? persona.painPoints.map((painPoint) => `${painPoint.id}: ${painPoint.text}`).join("; ")
            : "Not specified yet."
        }`,
        `- Quote: ${formatText(persona.quote)}`,
      ].join("\n")
    )
    .join("\n\n");
}

function buildJourneyBreakpoints(snapshot: HandoffSnapshot): string {
  const journeyMaps = snapshot.journeyHighlights ?? [];
  if (journeyMaps.length === 0) {
    return "- Journey breakpoints have not been captured yet.";
  }

  return journeyMaps
    .map((journeyMap) => {
      const lines = journeyMap.stages.map((stage) => {
        const painPoints =
          stage.painPoints.length > 0
            ? stage.painPoints.map((painPoint) => `${painPoint.id}: ${painPoint.text}`).join("; ")
            : "No pain points captured.";
        const opportunities =
          stage.opportunities.length > 0 ? stage.opportunities.join("; ") : "No opportunities captured.";
        return `- ${stage.stage}: Pain Points: ${painPoints} | Opportunities: ${opportunities}`;
      });
      return [`### ${journeyMap.personaName}`, ...lines].join("\n");
    })
    .join("\n\n");
}

function buildResearchInsights(snapshot: HandoffSnapshot): string {
  const insights = snapshot.insights?.insights ?? [];
  if (insights.length === 0) {
    return "- No validated insights have been captured yet.";
  }

  return numberedList(insights.map(formatInsightLine));
}

function buildConstraints(snapshot: HandoffSnapshot): string {
  const insights = snapshot.insights?.insights ?? [];
  if (insights.length === 0) {
    return "- No explicit constraints have been captured yet.";
  }

  return bulletList(
    insights.slice(0, 5).map((insight) => `${insight.id}: Design must respect "${insight.insight}".`)
  );
}

function buildSelectedSolution(snapshot: HandoffSnapshot): string {
  const solution = snapshot.selectedSolution;
  if (!solution) {
    return "- A final solution direction has not been selected yet.";
  }

  return [
    `- Idea ID: ${solution.id}`,
    `- Title: ${solution.title}`,
    `- Why This Direction: ${formatText(solution.description)}`,
  ].join("\n");
}

function getJtbdPersonaRegistry(snapshot: HandoffSnapshot) {
  const jtbdItems = snapshot.productOverview?.jtbd ?? [];
  const registry = new Map<string, string[]>();

  for (const flow of snapshot.userFlows ?? []) {
    const jtbdId = jtbdItems[flow.jtbdIndex]?.id;
    if (!jtbdId) continue;

    const existing = registry.get(jtbdId) ?? [];
    for (const personaName of flow.personaNames) {
      if (!existing.includes(personaName)) {
        existing.push(personaName);
      }
    }
    registry.set(jtbdId, existing);
  }

  return registry;
}

function buildFeatures(snapshot: HandoffSnapshot): string {
  const features = getExportableFeatures(snapshot.keyFeatures);
  if (features.length === 0) {
    return "- No linked features are ready for build yet.";
  }

  const jtbdRegistry = getJtbdRegistry(snapshot);
  const painPointRegistry = getPainPointRegistry(snapshot);
  const jtbdPersonaRegistry = getJtbdPersonaRegistry(snapshot);

  return features
    .map((feature) => {
      const jtbdRefs =
        feature.jtbdIds
          .map((jtbdId) => {
            const personaNames = jtbdPersonaRegistry.get(jtbdId) ?? [];
            const personaSuffix =
              personaNames.length > 0 ? ` (Personas: ${personaNames.join(", ")})` : "";
            return `${jtbdId}: ${jtbdRegistry.get(jtbdId) ?? "Unknown JTBD"}${personaSuffix}`;
          })
          .join("; ");
      const painPointRefs =
        feature.painPointIds.length > 0
          ? feature.painPointIds
              .map((painPointId) => {
                const painPointText = painPointRegistry.get(painPointId);
                return painPointText
                  ? `${painPointId} (${buildPainPointShortLabel(painPointText)})`
                  : `${painPointId} (unknown pain point)`;
              })
              .join("; ")
          : "None linked.";

      return [
        `### ${feature.id}: ${feature.name}`,
        `- Priority: ${feature.priority}`,
        `- Why It Exists: ${formatText(feature.description)}`,
        `- Solves For: ${jtbdRefs}`,
        `- Resolves Pain Points: ${painPointRefs}`,
      ].join("\n");
    })
    .join("\n\n");
}

function buildInformationArchitecture(snapshot: HandoffSnapshot): string {
  const flow = snapshot.informationArchitecture;
  if (!flow) {
    return "- Information architecture has not been defined yet.";
  }

  const pageNodes = flow.nodes.filter((node) => node.type === "page");
  if (pageNodes.length === 0) {
    return "- No page-level architecture has been captured yet.";
  }

  const pageIds = new Set(pageNodes.map((node) => node.id));
  const pageLines = pageNodes.map(
    (node) => `- ${node.id}: ${node.label}${node.description ? ` | ${node.description}` : ""}`
  );
  const connections = flow.connections
    .filter((connection) => pageIds.has(connection.from) && pageIds.has(connection.to))
    .map(
      (connection) =>
        `- ${connection.from} -> ${connection.to}${connection.label ? ` | ${connection.label}` : ""}`
    );

  return [
    "### Pages",
    ...pageLines,
    "",
    "### Connections",
    ...(connections.length > 0 ? connections : ["- No page-to-page connections captured."]),
  ].join("\n");
}

function buildUserFlows(snapshot: HandoffSnapshot): string {
  const flows = snapshot.userFlows ?? [];
  if (flows.length === 0) {
    return "- User flows have not been defined yet.";
  }

  const jtbdItems = snapshot.productOverview?.jtbd ?? [];

  return flows
    .map((flow) => {
      const jtbd = jtbdItems[flow.jtbdIndex];
      const steps = flow.steps.map((step, index) => `${index + 1}. [${step.nodeId}] ${step.action}`);
      return [
        `### ${flow.id}`,
        `- JTBD: ${jtbd ? `${jtbd.id}: ${jtbd.text}` : flow.jtbdText}`,
        `- Personas: ${flow.personaNames.join(", ") || "Not specified yet."}`,
        "- Steps:",
        ...steps,
      ].join("\n");
    })
    .join("\n\n");
}

function buildScreenDescriptions(snapshot: HandoffSnapshot): string {
  const architecture = snapshot.informationArchitecture;
  if (!architecture) {
    return "- Screen descriptions are not available until the information architecture is defined.";
  }

  const pageNodes = architecture.nodes.filter((node) => node.type === "page");
  if (pageNodes.length === 0) {
    return "- No page nodes are available for screen descriptions.";
  }

  const jtbdRegistry = getJtbdRegistry(snapshot);
  const featureRegistry = new Map(
    getExportableFeatures(snapshot.keyFeatures).map((feature) => [feature.id, feature])
  );
  const pageTraceability = resolvePageTraceability(snapshot);

  return pageTraceability
    .map((page) => {
      return [
        `### ${page.pageId}: ${page.pageLabel}`,
        `- Purpose: ${formatText(page.pageDescription)}`,
        `- Supports JTBDs: ${
          page.jtbdIds.length > 0
            ? page.jtbdIds
                .map((jtbdId) => `${jtbdId}: ${jtbdRegistry.get(jtbdId) ?? "Unknown JTBD"}`)
                .join("; ")
            : UNRESOLVED_JTBD_LINKAGE_TEXT
        }`,
        `- Anchoring Features: ${
          page.featureIds.length > 0
            ? page.featureIds
                .map((featureId) => {
                  const feature = featureRegistry.get(featureId);
                  return feature ? `${feature.id}: ${feature.name}` : `${featureId}: Unknown feature`;
                })
                .join("; ")
            : UNRESOLVED_FEATURE_LINKAGE_TEXT
        }`,
      ].join("\n");
    })
    .join("\n\n");
}

type DiffEntry<T> = {
  added: T[];
  removed: T[];
  updated: T[];
};

function diffById<T extends { id: string }>(
  currentItems: T[],
  previousItems: T[],
  isEqual: (current: T, previous: T) => boolean
): DiffEntry<T> {
  const previousById = new Map(previousItems.map((item) => [item.id, item]));
  const currentById = new Map(currentItems.map((item) => [item.id, item]));

  return {
    added: currentItems.filter((item) => !previousById.has(item.id)),
    removed: previousItems.filter((item) => !currentById.has(item.id)),
    updated: currentItems.filter((item) => {
      const previous = previousById.get(item.id);
      return previous ? !isEqual(item, previous) : false;
    }),
  };
}

function getChangedPageIds(snapshot: HandoffSnapshot, previousSnapshot: HandoffSnapshot | null): string[] {
  const changedPageIds = new Set<string>();
  const currentArchitecture = snapshot.informationArchitecture;
  const previousArchitecture = previousSnapshot?.informationArchitecture ?? null;
  const currentFlows = snapshot.userFlows ?? [];
  const previousFlows = previousSnapshot?.userFlows ?? [];

  if (currentArchitecture) {
    const currentPages = currentArchitecture.nodes.filter((node) => node.type === "page");
    const previousPageMap = new Map(
      (previousArchitecture?.nodes ?? [])
        .filter((node) => node.type === "page")
        .map((node) => [node.id, node])
    );

    for (const page of currentPages) {
      const previous = previousPageMap.get(page.id);
      if (!previous || stableStringify(previous) !== stableStringify(page)) {
        changedPageIds.add(page.id);
      }
    }
  }

  const previousFlowMap = new Map(previousFlows.map((flow) => [flow.id, flow]));
  for (const flow of currentFlows) {
    const previous = previousFlowMap.get(flow.id);
    if (!previous || stableStringify(previous) !== stableStringify(flow)) {
      for (const step of flow.steps) {
        changedPageIds.add(step.nodeId);
      }
    }
  }

  return [...changedPageIds];
}

export function buildProblemMarkdown(params: { snapshot: HandoffSnapshot }): string {
  const { snapshot } = params;

  return [
    "# problem.md",
    "",
    "## Problem Statement",
    buildProblemStatement(snapshot),
    "",
    "## Jobs To Be Done",
    buildJobsToBeDone(snapshot),
    "",
    "## Target Users",
    buildPersonas(snapshot),
    "",
    "## Journey Breakpoints",
    buildJourneyBreakpoints(snapshot),
    "",
    "## Research Insights",
    buildResearchInsights(snapshot),
    "",
    "## Constraints",
    buildConstraints(snapshot),
  ].join("\n");
}

export function buildSolutionMarkdown(params: { snapshot: HandoffSnapshot }): string {
  const { snapshot } = params;

  return [
    "# solution.md",
    "",
    "## Solution Concept",
    buildSelectedSolution(snapshot),
    "",
    "## Features",
    buildFeatures(snapshot),
    "",
    "## Information Architecture",
    buildInformationArchitecture(snapshot),
    "",
    "## User Flows",
    buildUserFlows(snapshot),
    "",
    "## Screen Descriptions",
    buildScreenDescriptions(snapshot),
  ].join("\n");
}

export function buildDeltaMarkdown(params: {
  currentSnapshot: HandoffSnapshot;
  previousSnapshot: HandoffSnapshot | null;
  dirtySections: HandoffDirtySection[];
}): string {
  const { currentSnapshot, previousSnapshot, dirtySections } = params;
  const sections: string[] = [];

  if (!previousSnapshot) {
    return [
      "# delta.md",
      "",
      "## Change Summary",
      "- No baseline export exists yet. Generate `problem.md` and `solution.md` first.",
    ].join("\n");
  }

  if (dirtySections.includes("product-overview")) {
    const diff = diffById(
      currentSnapshot.productOverview?.jtbd ?? [],
      previousSnapshot.productOverview?.jtbd ?? [],
      (current, previous) => current.text === previous.text
    );
    sections.push(
      [
        "## Problem Changes",
        ...[
          ...diff.added.map((item) => `- Added JTBD ${item.id}: ${item.text}`),
          ...diff.updated.map((item) => `- Updated JTBD ${item.id}: ${item.text}`),
          ...diff.removed.map((item) => `- Removed JTBD ${item.id}: ${item.text}`),
        ],
        `- Problem statement: ${formatText(currentSnapshot.productOverview?.problemStatement)}`,
        `- Target user: ${formatText(currentSnapshot.productOverview?.targetUser)}`,
        `- Environment / usage context: ${formatText(currentSnapshot.productOverview?.environmentContext)}`,
      ].join("\n")
    );
  }

  if (dirtySections.includes("insights")) {
    const diff = diffById(
      currentSnapshot.insights?.insights ?? [],
      previousSnapshot.insights?.insights ?? [],
      (current, previous) =>
        current.insight === previous.insight &&
        current.quote === previous.quote &&
        current.sourceDocument === previous.sourceDocument
    );
    sections.push(
      [
        "## Insight Changes",
        ...[
          ...diff.added.map((item) => `- Added insight ${item.id}: ${item.insight}`),
          ...diff.updated.map((item) => `- Updated insight ${item.id}: ${item.insight}`),
          ...diff.removed.map((item) => `- Removed insight ${item.id}: ${item.insight}`),
        ],
      ].join("\n")
    );
  }

  if (dirtySections.includes("personas")) {
    const currentPainPoints = (currentSnapshot.personas ?? []).flatMap((persona) => persona.painPoints);
    const previousPainPoints = (previousSnapshot.personas ?? []).flatMap((persona) => persona.painPoints);
    const diff = diffById(
      currentPainPoints,
      previousPainPoints,
      (current, previous) => current.text === previous.text
    );
    sections.push(
      [
        "## Persona Changes",
        ...[
          ...diff.added.map((item) => `- Added persona pain point ${item.id}: ${item.text}`),
          ...diff.updated.map((item) => `- Updated persona pain point ${item.id}: ${item.text}`),
          ...diff.removed.map((item) => `- Removed persona pain point ${item.id}: ${item.text}`),
        ],
      ].join("\n")
    );
  }

  if (dirtySections.includes("journey-highlights")) {
    const currentPainPoints = (currentSnapshot.journeyHighlights ?? []).flatMap((journeyMap) =>
      journeyMap.stages.flatMap((stage) => stage.painPoints)
    );
    const previousPainPoints = (previousSnapshot.journeyHighlights ?? []).flatMap((journeyMap) =>
      journeyMap.stages.flatMap((stage) => stage.painPoints)
    );
    const diff = diffById(
      currentPainPoints,
      previousPainPoints,
      (current, previous) => current.text === previous.text
    );
    sections.push(
      [
        "## Journey Changes",
        ...[
          ...diff.added.map((item) => `- Added journey pain point ${item.id}: ${item.text}`),
          ...diff.updated.map((item) => `- Updated journey pain point ${item.id}: ${item.text}`),
          ...diff.removed.map((item) => `- Removed journey pain point ${item.id}: ${item.text}`),
        ],
      ].join("\n")
    );
  }

  if (dirtySections.includes("selected-solution") && currentSnapshot.selectedSolution) {
    sections.push(
      [
        "## Solution Direction Changes",
        `- Selected idea: ${currentSnapshot.selectedSolution.id}: ${currentSnapshot.selectedSolution.title}`,
        `- Why this changed: ${formatText(currentSnapshot.selectedSolution.description)}`,
      ].join("\n")
    );
  }

  if (dirtySections.includes("key-features")) {
    const diff = diffById(
      getExportableFeatures(currentSnapshot.keyFeatures),
      getExportableFeatures(previousSnapshot.keyFeatures),
      (current, previous) =>
        current.name === previous.name &&
        current.description === previous.description &&
        current.priority === previous.priority &&
        stableStringify(current.jtbdIds) === stableStringify(previous.jtbdIds) &&
        stableStringify(current.painPointIds) === stableStringify(previous.painPointIds)
    );
    const featureChangeLines = [
      ...diff.added.map((item) => `- Added feature ${item.id}: ${item.name}`),
      ...diff.updated.map((item) => `- Updated feature ${item.id}: ${item.name}`),
      ...diff.removed.map((item) => `- Removed feature ${item.id}: ${item.name}`),
    ];
    if (featureChangeLines.length > 0) {
      sections.push(
        [
          "## Feature Changes",
          ...featureChangeLines,
        ].join("\n")
      );
    }
  }

  if (dirtySections.includes("information-architecture")) {
    const currentPages = (currentSnapshot.informationArchitecture?.nodes ?? []).filter(
      (node) => node.type === "page"
    );
    const previousPages = (previousSnapshot.informationArchitecture?.nodes ?? []).filter(
      (node) => node.type === "page"
    );
    const diff = diffById(
      currentPages,
      previousPages,
      (current, previous) =>
        current.label === previous.label &&
        current.type === previous.type &&
        current.description === previous.description
    );
    sections.push(
      [
        "## Architecture Changes",
        ...[
          ...diff.added.map((item) => `- Added page ${item.id}: ${item.label}`),
          ...diff.updated.map((item) => `- Updated page ${item.id}: ${item.label}`),
          ...diff.removed.map((item) => `- Removed page ${item.id}: ${item.label}`),
        ],
      ].join("\n")
    );
  }

  if (dirtySections.includes("user-flows")) {
    const diff = diffById(
      currentSnapshot.userFlows ?? [],
      previousSnapshot.userFlows ?? [],
      (current, previous) =>
        current.jtbdIndex === previous.jtbdIndex &&
        current.jtbdText === previous.jtbdText &&
        stableStringify(current.personaNames) === stableStringify(previous.personaNames) &&
        stableStringify(current.steps) === stableStringify(previous.steps)
    );
    sections.push(
      [
        "## Flow Changes",
        ...[
          ...diff.added.map((item) => `- Added flow ${item.id}: ${item.jtbdText}`),
          ...diff.updated.map((item) => `- Updated flow ${item.id}: ${item.jtbdText}`),
          ...diff.removed.map((item) => `- Removed flow ${item.id}: ${item.jtbdText}`),
        ],
      ].join("\n")
    );
  }

  const changedPageIds = getChangedPageIds(currentSnapshot, previousSnapshot);
  const affectedJtbdIds = new Set<string>();
  const currentJtbds = currentSnapshot.productOverview?.jtbd ?? [];

  for (const feature of getExportableFeatures(currentSnapshot.keyFeatures)) {
    for (const jtbdId of feature.jtbdIds) affectedJtbdIds.add(jtbdId);
  }

  for (const flow of currentSnapshot.userFlows ?? []) {
    const jtbdId = currentJtbds[flow.jtbdIndex]?.id;
    if (jtbdId) affectedJtbdIds.add(jtbdId);
  }

  sections.push(
    [
      "## Build Impact",
      `- Changed sections: ${dirtySections.map((section) => HANDOFF_SECTION_LABELS[section]).join(", ") || "None"}.`,
      `- Revisit JTBD coverage for: ${
        affectedJtbdIds.size > 0 ? [...affectedJtbdIds].join(", ") : "No JTBD refs available."
      }`,
      `- Update implementation for pages: ${
        changedPageIds.length > 0 ? changedPageIds.join(", ") : "No page-specific impact derived."
      }`,
      `- Regenerate or adjust features and flows before building against the updated export.`,
    ].join("\n")
  );

  return [
    "# delta.md",
    "",
    "## Change Summary",
    bulletList(dirtySections.map((section) => HANDOFF_SECTION_LABELS[section])),
    "",
    ...sections,
  ].join("\n");
}
