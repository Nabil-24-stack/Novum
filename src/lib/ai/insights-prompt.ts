/**
 * Prompt fragment and helpers for document-based insights generation.
 */

import type { UploadedDocument } from "@/hooks/useDocumentStore";

/**
 * Format uploaded document texts for inclusion in the system prompt.
 */
export function buildInsightsContext(documents: UploadedDocument[]): string {
  if (documents.length === 0) return "";

  const parts = documents.map(
    (doc, i) =>
      `### Document ${i + 1}: "${doc.name}"\n\n${doc.text}`
  );

  return `## Uploaded Research Documents\n\nThe user has uploaded ${documents.length} research document(s) (interview transcripts, notes, etc.). Analyze them carefully for patterns, pain points, user quotes, and insights that should inform the product strategy.\n\n${parts.join("\n\n---\n\n")}`;
}

/**
 * Prompt fragment appended to problem-overview system prompt.
 * Instructs the AI to ALWAYS output a `type="insights"` block FIRST.
 */
export const INSIGHTS_PROMPT_FRAGMENT = `

## INSIGHTS REQUIREMENT (MANDATORY — ALWAYS)

You MUST output a \`type="insights"\` block as your FIRST artifact when generating final artifacts. This is mandatory regardless of whether research documents are present.

**When research documents ARE present:**
- Extract 4-8 insights from documents AND the Q&A conversation
- Document insights: set \`"source": "document"\` with a direct \`quote\` and \`sourceDocument\`
- Conversation insights: set \`"source": "conversation"\`, omit quote/sourceDocument

**When NO documents are uploaded:**
- Extract 4-6 insights synthesized from the Q&A conversation
- Each insight captures a key understanding about the user's problem, audience, workflow, or domain
- Set \`"source": "conversation"\` on all insights
- The \`documents\` array must be empty: \`[]\`

Output order: insights → persona rationale → manifesto → personas → journey-maps. Omitting the insights block is treated as an incomplete response.
`;
