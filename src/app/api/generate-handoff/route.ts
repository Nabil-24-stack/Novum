import { createHash } from "node:crypto";
import { generateText } from "ai";
import { requireAuth } from "@/lib/supabase/auth-guard";
import { authorizeAction } from "@/lib/billing/billing";
import { fireAndForgetRecordUsage } from "@/lib/billing/route-helpers";
import { getModel } from "@/lib/ai/model";
import {
  buildDeltaMarkdown,
  buildFullHandoffMarkdown,
} from "@/lib/handoff/markdown";
import { getDirtyHandoffSections } from "@/lib/handoff/snapshot";
import type { HandoffSnapshot } from "@/lib/handoff/types";
import { HANDOFF_SECTION_LABELS } from "@/lib/handoff/types";

async function generateNarrativeSummary(params: {
  snapshot: HandoffSnapshot;
  previousSnapshot?: HandoffSnapshot | null;
  dirtySections?: string[];
  mode: "initial" | "regenerate";
  fallback: string;
}): Promise<{ text: string; inputTokens: number; outputTokens: number }> {
  const { snapshot, previousSnapshot, dirtySections, mode, fallback } = params;

  const prompt =
    mode === "initial"
      ? [
          "You are writing the executive summary for a PRD-style markdown handoff.",
          "Write exactly one concise paragraph in plain text.",
          "Focus on the product, target user, core problem, and the chosen solution direction.",
          "Do not use markdown headings or bullet points.",
          "",
          "Current strategy snapshot:",
          JSON.stringify(snapshot, null, 2),
        ].join("\n")
      : [
          "You are writing a short delta summary for a product strategy update.",
          "Write exactly 2 short bullet points in markdown.",
          "Focus only on what changed and why it matters to the build handoff.",
          `Changed sections: ${(dirtySections ?? []).join(", ")}`,
          "",
          "Previous snapshot:",
          JSON.stringify(previousSnapshot ?? null, null, 2),
          "",
          "Current snapshot:",
          JSON.stringify(snapshot, null, 2),
        ].join("\n");

  try {
    const result = await generateText({
      model: getModel(),
      system: "Return only the requested summary text.",
      messages: [{ role: "user", content: prompt }],
      providerOptions: {
        openai: { store: false },
      },
    });

    return {
      text: result.text.trim() || fallback,
      inputTokens: result.usage.inputTokens ?? 0,
      outputTokens: result.usage.outputTokens ?? 0,
    };
  } catch (error) {
    console.warn("[generate-handoff] Summary generation failed, using fallback:", error);
    return {
      text: fallback,
      inputTokens: 0,
      outputTokens: 0,
    };
  }
}

function buildFallbackExecutiveSummary(snapshot: HandoffSnapshot): string {
  const title = snapshot.productOverview?.title || "This product";
  const targetUser = snapshot.productOverview?.targetUser || "its target users";
  const problem = snapshot.productOverview?.problemStatement || "the planning-to-build context gap";
  const solution = snapshot.selectedSolution?.title || "the selected solution direction";

  return `${title} is intended for ${targetUser} and is focused on solving ${problem}. This handoff captures the current strategy, the approved solution direction (${solution}), and the requirements an AI coding tool should use when building or updating the product.`;
}

function buildFallbackDeltaSummary(dirtySections: string[]): string {
  if (dirtySections.length === 0) {
    return "- No strategy sections changed since the last generated handoff.";
  }

  const labels = dirtySections.map((section) => HANDOFF_SECTION_LABELS[section as keyof typeof HANDOFF_SECTION_LABELS]);
  return [
    `- Updated sections: ${labels.join(", ")}.`,
    "- Regenerate the full handoff before sending it back to your coding tool so the latest strategy is reflected.",
  ].join("\n");
}

export async function POST(req: Request) {
  const auth = await requireAuth();
  if (auth.response) return auth.response;

  try {
    const {
      snapshot,
      previousSnapshot,
      mode,
      operationId,
      projectId,
    } = await req.json() as {
      snapshot: HandoffSnapshot;
      previousSnapshot?: HandoffSnapshot | null;
      mode: "initial" | "regenerate";
      operationId?: string;
      projectId?: string;
    };

    if (!snapshot || (mode !== "initial" && mode !== "regenerate")) {
      return Response.json({ error: "Invalid request" }, { status: 400 });
    }

    const authorization = await authorizeAction(
      auth.user.id,
      "strategy_ai",
      operationId,
      projectId
    );
    if (!authorization.allowed) {
      return Response.json({ error: authorization.reason }, { status: 402 });
    }

    const dirtySections = getDirtyHandoffSections(snapshot, previousSnapshot ?? null);
    let totalInputTokens = 0;
    let totalOutputTokens = 0;

    const executiveSummaryResult = await generateNarrativeSummary({
      snapshot,
      mode: "initial",
      fallback: buildFallbackExecutiveSummary(snapshot),
    });
    totalInputTokens += executiveSummaryResult.inputTokens;
    totalOutputTokens += executiveSummaryResult.outputTokens;

    let deltaSummary = "";
    if (mode === "regenerate" && dirtySections.length > 0) {
      const deltaSummaryResult = await generateNarrativeSummary({
        snapshot,
        previousSnapshot,
        dirtySections,
        mode: "regenerate",
        fallback: buildFallbackDeltaSummary(dirtySections),
      });
      deltaSummary = deltaSummaryResult.text;
      totalInputTokens += deltaSummaryResult.inputTokens;
      totalOutputTokens += deltaSummaryResult.outputTokens;
    }

    const fullMarkdown = buildFullHandoffMarkdown({
      snapshot,
      executiveSummary: executiveSummaryResult.text,
    });
    const deltaMarkdown =
      mode === "regenerate" && dirtySections.length > 0
        ? buildDeltaMarkdown({
            currentSnapshot: snapshot,
            dirtySections,
            deltaSummary,
          })
        : null;

    fireAndForgetRecordUsage({
      operationId: authorization.operationId,
      userId: auth.user.id,
      route: "/api/generate-handoff",
      phase: "handoff",
      inputTokens: totalInputTokens,
      outputTokens: totalOutputTokens,
      projectId,
    });

    return Response.json({
      fullMarkdown,
      deltaMarkdown,
      baselineHash: createHash("sha256").update(JSON.stringify(snapshot)).digest("hex"),
      dirtySections,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[generate-handoff] Error:", error);
    return Response.json(
      {
        error: error instanceof Error ? error.message : "Failed to generate handoff",
      },
      { status: 500 }
    );
  }
}
