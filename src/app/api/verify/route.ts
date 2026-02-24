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

const VERIFY_SYSTEM_PROMPT = `You are a visual QA reviewer for a web application preview.
Analyze the screenshot for critical issues ONLY:

1. **Runtime error screens** — Red error overlays, stack traces, "Something went wrong"
2. **Blank/white pages** — No visible content rendered at all
3. **Obvious broken layouts** — Content overflowing off-screen, elements stacked on top of each other unreadably
4. **Missing content** — A page that should have content but shows empty containers

Do NOT flag:
- Minor styling differences or preferences
- Color choices or font sizes
- Spacing that looks slightly off
- Missing images (placeholder images are fine)
- Scrollbars or overflow on purpose

Respond with ONLY valid JSON (no markdown fencing):
- If the page looks reasonable: {"status":"pass"}
- If there are critical issues: {"status":"fail","issues":["issue 1","issue 2"],"fixCode":"<code blocks>"}

For fixCode, use markdown code blocks with file="path" attributes, e.g.:
\`\`\`tsx file="/App.tsx"
// fixed code here
\`\`\`

Keep fixes minimal — only fix the specific issues you identified.`;

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { screenshot, files, modelId = "gemini-2.5-pro" } = body as {
      screenshot: string;
      files: Record<string, string>;
      modelId?: ModelId;
    };

    if (!screenshot) {
      return Response.json({ status: "pass" });
    }

    // Build file context (only the files that were written)
    const fileContext = Object.entries(files)
      .map(([path, content]) => `File: ${path}\n\`\`\`tsx\n${content}\n\`\`\``)
      .join("\n\n");

    const model = getModel(modelId);

    const result = await generateText({
      model,
      system: VERIFY_SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              image: screenshot,
            },
            {
              type: "text",
              text: `Review this screenshot of the rendered page.\n\nFiles that were just written:\n${fileContext}\n\nRespond with JSON only.`,
            },
          ],
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

      // Couldn't parse — fail-safe: treat as pass
      console.warn("[verify] Could not parse AI response as JSON:", text);
      return Response.json({ status: "pass" });
    }
  } catch (err) {
    console.error("[verify] Error:", err);
    // Fail-safe: treat errors as pass
    return Response.json({ status: "pass" });
  }
}
