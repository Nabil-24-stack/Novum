import { generateText } from "ai";
import { google } from "@ai-sdk/google";
import { anthropic } from "@ai-sdk/anthropic";
import { openai } from "@ai-sdk/openai";
import { buildAnnotationEvaluationPrompt } from "@/lib/ai/annotation-evaluation-prompt";
import { requireAuth } from "@/lib/supabase/auth-guard";

type ModelId = "gemini-2.5-pro" | "gemini-3-pro-preview" | "claude-sonnet-4-6" | "gpt-5.2";

function getModel(modelId: ModelId) {
  switch (modelId) {
    case "gemini-2.5-pro":
      return google("gemini-2.5-pro");
    case "gemini-3-pro-preview":
      return google("gemini-3-pro-preview");
    case "claude-sonnet-4-6":
      return anthropic("claude-sonnet-4-6");
    case "gpt-5.2":
      return openai("gpt-5.2");
    default:
      return google("gemini-2.5-pro");
  }
}

export const maxDuration = 60;

interface PageInput {
  pageId: string;
  pageName: string;
  code: string;
}

export async function POST(req: Request) {
  const auth = await requireAuth();
  if (auth.response) return auth.response;

  try {
    const body = await req.json();
    const {
      pages,
      manifestoContext,
      personaContext,
      insightsContext,
      modelId = "gemini-2.5-pro",
    } = body as {
      pages: PageInput[];
      manifestoContext: string;
      personaContext: string;
      insightsContext?: string;
      modelId?: ModelId;
    };

    if (!pages || pages.length === 0) {
      return Response.json({ pages: [] });
    }

    const systemPrompt = buildAnnotationEvaluationPrompt(
      manifestoContext,
      personaContext,
      pages,
      insightsContext,
    );

    const result = await generateText({
      model: getModel(modelId),
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: `Review all ${pages.length} pages and output the decision-connections JSON for sections with strong strategic links. Remember: quality over quantity, and zero connections is fine for utility pages.`,
        },
      ],
      providerOptions: {
        openai: { store: false },
      },
    });

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

      // Couldn't parse — fail-safe: return empty
      console.warn("[evaluate-annotations] Could not parse AI response as JSON:", text.slice(0, 200));
      return Response.json({ pages: [] });
    }
  } catch (err) {
    console.error("[evaluate-annotations] Error:", err);
    // Fail-safe: return empty pages so the app works without annotations
    return Response.json({ pages: [] });
  }
}
