import { generateText } from "ai";
import { buildAnnotationEvaluationPrompt } from "@/lib/ai/annotation-evaluation-prompt";
import { requireAuth } from "@/lib/supabase/auth-guard";
import { getModel } from "@/lib/ai/model";
import { requireBillingAuth, fireAndForgetRecordUsage } from "@/lib/billing/route-helpers";

export const maxDuration = 60;

interface PageInput {
  pageId: string;
  pageName: string;
  code: string;
}

function tryParseResponseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    // Fall through
  }

  const jsonMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[1].trim());
    } catch {
      // Fall through
    }
  }

  const braceMatch = text.match(/\{[\s\S]*\}/);
  if (braceMatch) {
    try {
      return JSON.parse(braceMatch[0]);
    } catch {
      // Fall through
    }
  }

  return null;
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
      operationId,
      projectId,
    } = body as {
      pages: PageInput[];
      manifestoContext: string;
      personaContext: string;
      insightsContext?: string;
      operationId?: string;
      projectId?: string;
    };

    const billingCheck = await requireBillingAuth(auth.user.id, "build_usage", operationId, projectId);
    if (!billingCheck.allowed) return billingCheck.response;

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
      model: getModel(),
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: pages.length === 1
            ? `Review this page and output the decision-connections JSON for sections with strong strategic links. Zero connections is fine if nothing on the page reflects a meaningful strategic decision.`
            : `Review all ${pages.length} pages and output the decision-connections JSON for sections with strong strategic links. Remember: quality over quantity, and zero connections is fine for utility pages.`,
        },
      ],
      providerOptions: {
        openai: { store: false },
      },
    });

    if (billingCheck.allowed) {
      fireAndForgetRecordUsage({
        operationId: billingCheck.operationId,
        userId: auth.user.id,
        route: "/api/evaluate-annotations",
        inputTokens: result.usage.inputTokens ?? 0,
        outputTokens: result.usage.outputTokens ?? 0,
        projectId,
      });
    }

    const text = result.text.trim();

    const parsed = tryParseResponseJson(text);
    if (parsed !== null) {
      return Response.json(parsed);
    }

    // Couldn't parse — treat as a real failure so callers retry instead of
    // accepting an accidental zero-annotation success.
    console.warn("[evaluate-annotations] Could not parse AI response as JSON:", text.slice(0, 200));
    return Response.json(
      {
        error: "Annotation evaluation failed",
        detail: "Model response was not valid JSON",
        pages: [],
      },
      { status: 502 }
    );
  } catch (err) {
    console.error("[evaluate-annotations] Error:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    // Return 502 so the client can distinguish model failure from empty annotations
    return Response.json(
      { error: "Annotation evaluation failed", detail: message, pages: [] },
      { status: 502 }
    );
  }
}
