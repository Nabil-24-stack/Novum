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
 * Prompt fragment appended to problem-overview system prompt when documents are uploaded.
 * Instructs the AI to output a `type="insights"` block FIRST.
 */
export const INSIGHTS_PROMPT_FRAGMENT = `

## REMINDER: DOCUMENT INSIGHTS ARE MANDATORY

Research documents have been uploaded. When you generate your final artifacts, you MUST follow the output order defined in the OUTPUT FORMAT section above:

1. \`type="insights"\` block FIRST (see "### 0. Insights Block" above for the exact format)
2. Persona rationale text
3. \`type="manifesto"\` block
4. \`type="personas"\` block
5. \`type="journey-maps"\` block

Do NOT skip the insights block. Do NOT output it during Q&A rounds — only in the generation response.
Ground your personas and journey maps in the document evidence extracted in the insights block.
`;
