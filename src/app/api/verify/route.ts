import { generateText } from "ai";
import { google } from "@ai-sdk/google";
import { anthropic } from "@ai-sdk/anthropic";

type ModelId = "gemini-2.5-pro" | "gemini-3-pro-preview" | "claude-sonnet-4-5";

function getModel(modelId: ModelId) {
  switch (modelId) {
    case "gemini-2.5-pro":
      return google("gemini-2.5-pro");
    case "gemini-3-pro-preview":
      return google("gemini-3-pro-preview");
    case "claude-sonnet-4-5":
      return anthropic("claude-sonnet-4-5-20250929");
    default:
      return google("gemini-2.5-pro");
  }
}

export const maxDuration = 30;

const ERROR_FIX_SYSTEM_PROMPT = `You are a code-level QA reviewer for a web application.
The page has a runtime error. Analyze the error text and the source code, then provide a fix.

Respond with ONLY valid JSON (no markdown fencing):
- {"status":"fail","issues":["description of the issue"],"fixCode":"<code blocks>"}

For fixCode, use markdown code blocks with file="path" attributes, e.g.:
\`\`\`tsx file="/App.tsx"
// fixed code here
\`\`\`

Common issues:
- "Element type is invalid" — usually a missing or wrong import/export (e.g., using default import for a named export)
- "is not defined" — missing import statement
- "Cannot read prop" — accessing property on undefined/null, often from a bad import
- "Module not found" — importing from a path that doesn't exist
- "does not provide an export" — named export doesn't exist in the target module

Keep fixes minimal — only fix the specific error.`;

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { files, contextFiles, modelId = "gemini-2.5-pro", errorText } = body as {
      files: Record<string, string>;
      contextFiles?: Record<string, string>;
      modelId?: ModelId;
      errorText?: string;
    };

    if (!errorText) {
      return Response.json({ status: "pass" });
    }

    // Build file context — written files are primary context
    const fileContext = Object.entries(files)
      .map(([path, content]) => `File: ${path}\n\`\`\`tsx\n${content}\n\`\`\``)
      .join("\n\n");

    // Build additional context from the full VFS (structural files the AI might need)
    let additionalContext = "";
    if (contextFiles) {
      const STRUCTURAL_PATTERNS = [
        "/App.tsx",
        "/index.tsx",
        "/lib/router.tsx",
        "/lib/utils.ts",
        "/flow.json",
        "/package.json",
      ];
      const extraFiles: [string, string][] = [];

      for (const [path, content] of Object.entries(contextFiles)) {
        // Skip files already in primary context
        if (files[path]) continue;
        // Include structural files, UI components, and page files
        const isStructural = STRUCTURAL_PATTERNS.includes(path);
        const isComponent = path.startsWith("/components/ui/");
        const isPage = path.startsWith("/pages/");
        if (isStructural || isComponent || isPage) {
          extraFiles.push([path, content]);
        }
      }

      // Cap at 15 extra files to avoid token bloat
      const capped = extraFiles.slice(0, 15);
      if (capped.length > 0) {
        additionalContext = "\n\nAdditional project files (for context):\n" +
          capped.map(([path, content]) => `File: ${path}\n\`\`\`tsx\n${content}\n\`\`\``).join("\n\n");
      }
    }

    const model = getModel(modelId);

    const result = await generateText({
      model,
      system: ERROR_FIX_SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `The page shows this runtime error:\n\n"${errorText}"\n\nFiles that were just written:\n${fileContext}${additionalContext}\n\nDiagnose the error and provide a fix. Respond with JSON only.`,
        },
      ],
    });

    // Parse response - try to extract JSON
    const text = result.text.trim();

    // Try to parse as JSON directly
    try {
      const parsed = JSON.parse(text);
      return Response.json(parsed);
    } catch {
      // Try to extract JSON from markdown fences
      const jsonMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[1].trim());
          return Response.json(parsed);
        } catch {
          // Fall through
        }
      }

      // Try to find JSON object in the text
      const braceMatch = text.match(/\{[\s\S]*\}/);
      if (braceMatch) {
        try {
          const parsed = JSON.parse(braceMatch[0]);
          return Response.json(parsed);
        } catch {
          // Fall through
        }
      }

      // Couldn't parse — treat as fail so errors aren't hidden
      console.warn("[verify] Could not parse AI response as JSON:", text);
      return Response.json({
        status: "fail",
        issues: ["AI response could not be parsed — raw text returned"],
        fixCode: text, // Pass raw text through; extractCodeBlocks will try to find code blocks
      });
    }
  } catch (err) {
    console.error("[verify] Error:", err);
    return Response.json(
      { status: "fail", issues: [`Server error: ${(err as Error).message || "unknown"}`] },
      { status: 500 }
    );
  }
}
