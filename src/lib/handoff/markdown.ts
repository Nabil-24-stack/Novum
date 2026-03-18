import type {
  HandoffDirtySection,
  HandoffSnapshot,
} from "./types.ts";
import { HANDOFF_SECTION_LABELS } from "./types.ts";

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

function formatInsights(snapshot: HandoffSnapshot): string {
  const insights = snapshot.insights?.insights ?? [];
  if (insights.length === 0) {
    return "- No validated insights have been captured yet.";
  }

  return insights
    .map((item, index) => {
      const parts = [`${index + 1}. ${item.insight}`];
      if (item.quote) parts.push(`Quote: "${item.quote}"`);
      if (item.sourceDocument) parts.push(`Source: ${item.sourceDocument}`);
      return parts.join("  \n");
    })
    .join("\n\n");
}

function formatPersonas(snapshot: HandoffSnapshot): string {
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
        `- Pain Points: ${persona.painPoints.length > 0 ? persona.painPoints.join("; ") : "Not specified yet."}`,
        `- Quote: ${formatText(persona.quote)}`,
      ].join("\n")
    )
    .join("\n\n");
}

function formatJourneyHighlights(snapshot: HandoffSnapshot): string {
  const journeyMaps = snapshot.journeyHighlights ?? [];
  if (journeyMaps.length === 0) {
    return "- Journey highlights have not been captured yet.";
  }

  return journeyMaps
    .map((journeyMap) => {
      const highlightLines = journeyMap.stages.map((stage) => {
        const painPoints = stage.painPoints.length > 0 ? stage.painPoints.join("; ") : "No pain points captured.";
        const opportunities =
          stage.opportunities.length > 0 ? stage.opportunities.join("; ") : "No opportunities captured.";
        return `- **${stage.stage}**: ${painPoints} Opportunities: ${opportunities}`;
      });

      return [`### ${journeyMap.personaName}`, ...highlightLines].join("\n");
    })
    .join("\n\n");
}

function formatSelectedSolution(snapshot: HandoffSnapshot): string {
  const idea = snapshot.selectedSolution;
  if (!idea) {
    return "- A final solution direction has not been selected yet.";
  }

  return [`### ${idea.title}`, formatText(idea.description)].join("\n\n");
}

function formatKeyFeatures(snapshot: HandoffSnapshot): string {
  const features = snapshot.keyFeatures?.features ?? [];
  if (features.length === 0) {
    return "- Key features have not been defined yet.";
  }

  return features
    .map(
      (feature) =>
        `- **${feature.name}** (${feature.priority} priority): ${formatText(feature.description)}`
    )
    .join("\n");
}

function formatArchitecture(snapshot: HandoffSnapshot): string {
  const flow = snapshot.informationArchitecture;
  if (!flow) {
    return "- Information architecture has not been defined yet.";
  }

  const pageNodes = flow.nodes.filter((node) => node.type === "page");
  if (pageNodes.length === 0) {
    return "- No page-level architecture has been captured yet.";
  }

  const connections = flow.connections
    .filter((connection) => {
      const pageIds = new Set(pageNodes.map((node) => node.id));
      return pageIds.has(connection.from) && pageIds.has(connection.to);
    })
    .map((connection) =>
      `- ${connection.from} -> ${connection.to}${connection.label ? ` (${connection.label})` : ""}`
    );

  const pageLines = pageNodes.map(
    (node, index) =>
      `${index + 1}. ${node.label}${node.description ? `: ${node.description}` : ""}`
  );

  const parts = ["### Pages", ...pageLines];
  if (connections.length > 0) {
    parts.push("", "### Connections", ...connections);
  }

  return parts.join("\n");
}

function formatUserFlows(snapshot: HandoffSnapshot): string {
  const flows = snapshot.userFlows ?? [];
  if (flows.length === 0) {
    return "- User flows have not been defined yet.";
  }

  return flows
    .map((flow) => {
      const steps = flow.steps.map((step, index) => `${index + 1}. [${step.nodeId}] ${step.action}`);
      return [
        `### JTBD ${flow.jtbdIndex + 1}: ${flow.jtbdText}`,
        `- Personas: ${flow.personaNames.join(", ") || "Not specified yet."}`,
        "#### Steps",
        ...steps,
      ].join("\n");
    })
    .join("\n\n");
}

function buildRequirementsAndConstraints(snapshot: HandoffSnapshot): string {
  const requirementLines: string[] = [];
  const constraintLines: string[] = [];

  for (const feature of snapshot.keyFeatures?.features ?? []) {
    requirementLines.push(
      `${feature.name}: ${formatText(feature.description)} (${feature.priority} priority)`
    );
  }

  for (const flow of snapshot.userFlows ?? []) {
    requirementLines.push(
      `${flow.jtbdText}: support a path for ${flow.personaNames.join(", ") || "the target persona"} across ${flow.steps.length} steps.`
    );
  }

  const insightConstraints = (snapshot.insights?.insights ?? []).slice(0, 5);
  for (const insight of insightConstraints) {
    constraintLines.push(insight.insight);
  }

  const parts = ["### Functional Requirements", bulletList(requirementLines)];
  parts.push("", "### Constraints", bulletList(constraintLines));
  return parts.join("\n");
}

function buildOpenQuestions(snapshot: HandoffSnapshot): string {
  const questions: string[] = [];

  if (!snapshot.insights?.insights?.length) {
    questions.push("What additional research or documents should validate this strategy before build?");
  }

  if (!snapshot.selectedSolution) {
    questions.push("Which idea should be considered the final solution direction?");
  }

  if (!snapshot.keyFeatures?.features?.length) {
    questions.push("Which features are must-have for v1 versus future iterations?");
  }

  const personaNames = new Set((snapshot.personas ?? []).map((persona) => persona.name));
  const journeyPersonaNames = new Set(
    (snapshot.journeyHighlights ?? []).map((journeyMap) => journeyMap.personaName)
  );
  const missingJourneys = [...personaNames].filter((name) => !journeyPersonaNames.has(name));
  if (missingJourneys.length > 0) {
    questions.push(`Journey maps are still missing for: ${missingJourneys.join(", ")}.`);
  }

  if (!snapshot.userFlows?.length) {
    questions.push("What are the canonical end-to-end user flows the build tool should preserve?");
  }

  if (!snapshot.informationArchitecture?.nodes?.length) {
    questions.push("What pages or surfaces should exist in the initial release?");
  }

  return numberedList(
    questions.length > 0
      ? questions
      : ["No open questions are currently captured in the strategy artifacts."]
  );
}

export function buildFullHandoffMarkdown(params: {
  snapshot: HandoffSnapshot;
  executiveSummary: string;
}): string {
  const { snapshot, executiveSummary } = params;
  const title = snapshot.productOverview?.title || "Untitled Product";
  const targetUser = snapshot.productOverview?.targetUser || "Target user not specified yet.";
  const jtbd = snapshot.productOverview?.jtbd ?? [];

  return [
    `# ${title} PRD`,
    "",
    "## Executive Summary",
    executiveSummary.trim() || "This document summarizes the approved strategy and solution direction for the product.",
    "",
    "## Product Overview",
    `- Problem Statement: ${formatText(snapshot.productOverview?.problemStatement)}`,
    `- Target User: ${targetUser}`,
    "- Jobs To Be Done:",
    jtbd.length > 0 ? bulletList(jtbd) : "- None captured yet.",
    "",
    "## Key Insights",
    formatInsights(snapshot),
    "",
    "## Personas",
    formatPersonas(snapshot),
    "",
    "## Journey Highlights",
    formatJourneyHighlights(snapshot),
    "",
    "## Selected Solution",
    formatSelectedSolution(snapshot),
    "",
    "## Key Features",
    formatKeyFeatures(snapshot),
    "",
    "## Information Architecture",
    formatArchitecture(snapshot),
    "",
    "## User Flows",
    formatUserFlows(snapshot),
    "",
    "## Requirements / Constraints",
    buildRequirementsAndConstraints(snapshot),
    "",
    "## Open Questions",
    buildOpenQuestions(snapshot),
  ].join("\n");
}

export function buildDeltaMarkdown(params: {
  currentSnapshot: HandoffSnapshot;
  dirtySections: HandoffDirtySection[];
  deltaSummary: string;
}): string {
  const { currentSnapshot, dirtySections, deltaSummary } = params;

  const sections = dirtySections.map((section) => {
    switch (section) {
      case "product-overview":
        return ["## Product Overview", `### ${HANDOFF_SECTION_LABELS[section]}`, `- Problem Statement: ${formatText(currentSnapshot.productOverview?.problemStatement)}`, `- Target User: ${formatText(currentSnapshot.productOverview?.targetUser)}`, "- Jobs To Be Done:", currentSnapshot.productOverview?.jtbd?.length ? bulletList(currentSnapshot.productOverview.jtbd) : "- None captured yet."].join("\n");
      case "insights":
        return ["## Key Insights", formatInsights(currentSnapshot)].join("\n");
      case "personas":
        return ["## Personas", formatPersonas(currentSnapshot)].join("\n");
      case "journey-highlights":
        return ["## Journey Highlights", formatJourneyHighlights(currentSnapshot)].join("\n");
      case "selected-solution":
        return ["## Selected Solution", formatSelectedSolution(currentSnapshot)].join("\n");
      case "key-features":
        return ["## Key Features", formatKeyFeatures(currentSnapshot)].join("\n");
      case "information-architecture":
        return ["## Information Architecture", formatArchitecture(currentSnapshot)].join("\n");
      case "user-flows":
        return ["## User Flows", formatUserFlows(currentSnapshot)].join("\n");
      default:
        return null;
    }
  }).filter((section): section is string => Boolean(section));

  return [
    "# Strategy Delta",
    "",
    "## Change Summary",
    deltaSummary.trim() || "The strategy artifacts changed since the last generated handoff.",
    "",
    "## Changed Sections",
    bulletList(dirtySections.map((section) => HANDOFF_SECTION_LABELS[section])),
    "",
    ...sections,
  ].join("\n");
}
