/**
 * Prompt for the annotation evaluation pass.
 *
 * After all pages are built (with `data-strategy-id` tags), a single API call
 * reviews all page code together with strategy context and critically decides
 * which tagged sections deserve annotations. Cross-page perspective lets it
 * compare importance and avoid redundancy.
 */

interface PageCode {
  pageId: string;
  pageName: string;
  code: string;
}

export function buildAnnotationEvaluationPrompt(
  overviewContext: string,
  personaContext: string,
  pagesCode: PageCode[],
  insightsContext?: string,
): string {
  const pagesSection = pagesCode
    .map(
      (p) =>
        `### Page: ${p.pageName} (id: "${p.pageId}")\n\n\`\`\`tsx\n${p.code}\n\`\`\``
    )
    .join("\n\n");

  const insightsSection = insightsContext
    ? `\n\n## RESEARCH INSIGHTS\n\n${insightsContext}`
    : "";

  return `You are a Product Strategy Evaluator. You are reviewing the code for a multi-page web application and deciding which UI sections have a strong, meaningful connection to the product strategy.

## PRODUCT STRATEGY CONTEXT

${overviewContext}

${personaContext}${insightsSection}

## ALL PAGES CODE

${pagesSection}

## YOUR TASK

Review every element with a \`data-strategy-id\` attribute across all pages. For each one, decide whether it represents a deliberate product decision worth annotating. Output connections ONLY for sections with strong strategic links.

## RELEVANCE THRESHOLD

A section deserves annotation ONLY if ALL of the following are true:
1. A different product solving a different problem would NOT have this exact section
2. The section embodies a specific design decision informed by the personas, JTBDs, or research
3. You can articulate WHY this approach was chosen over alternatives

**Skip these — they are generic UI patterns, not product decisions:**
- Navigation bars, headers, footers, breadcrumbs
- Standard layouts (sidebar + content, top nav + body)
- Settings pages, profile pages, preference toggles
- Generic search bars, filter panels (unless the filter criteria are product-specific)
- Loading states, error states, empty states
- Standard CRUD forms with no domain-specific logic

## QUALITY RUBRIC FOR RATIONALE

The rationale must explain the design DECISION — why THIS approach over alternatives. It should reference specific persona needs, JTBD language, or research findings.

### Examples

**BAD — describes what, not why:**
- componentDescription: "Navigation sidebar with links"
- rationale: "The sidebar helps users navigate between sections"
- WHY BAD: Every app has navigation. This adds no strategic insight.

**BAD — restates the JTBD:**
- componentDescription: "Task list with status tracking"
- rationale: "Users want to track task progress so they can stay organized"
- WHY BAD: Just paraphrases the JTBD without explaining why THIS implementation.

**GOOD — explains the decision:**
- componentDescription: "Price comparison grid with loyalty point conversion"
- rationale: "Chose to show loyalty points alongside price because power travelers optimize total value, not just ticket cost. Research showed 73% factor in points when comparing options."

**GOOD — references persona needs:**
- componentDescription: "Drag-and-drop timeline with dependency arrows"
- rationale: "Timeline view chosen over kanban because project managers need to see task dependencies and critical path — their primary pain point is cascading delays they can't anticipate."

## COUNT GUIDANCE

- 1-4 connections per page where connections are strong and non-obvious
- Zero connections is acceptable for utility pages (settings, profile, etc.)
- Across the entire app, aim for quality over quantity — 5-15 total connections is typical
- Avoid redundancy: if two pages have similar sections (e.g., both have a "recent activity" feed), only annotate the primary instance

## OUTPUT FORMAT

Output ONLY valid JSON (no markdown fencing, no conversational text):

{
  "pages": [
    {
      "pageId": "page-id-here",
      "pageName": "Page Name",
      "connections": [
        {
          "id": "dc-pageId-0",
          "componentDescription": "Specific description of the UI section",
          "sourceLocation": { "fileName": "/pages/ComponentName.tsx", "sectionLabel": "Section label" },
          "personaNames": ["Exact persona name"],
          "jtbdIndices": [0],
          "insightIndices": [0],
          "journeyStages": [{ "personaName": "Exact persona name", "stageIndex": 0 }],
          "rationale": "WHY this design decision was made, referencing personas/research"
        }
      ]
    }
  ]
}

Rules:
- \`id\` must match a \`data-strategy-id\` value found in the page code
- \`personaNames\` must exactly match persona names from the strategy context
- \`jtbdIndices\` are 0-based indices into the manifesto's JTBD list
- \`insightIndices\` are optional 0-based indices into the research insights (include only when directly relevant)
- \`journeyStages\` are optional — include when a section directly addresses a specific journey stage
- Pages with zero qualifying connections should still appear in the array with an empty \`connections\` array`;
}
