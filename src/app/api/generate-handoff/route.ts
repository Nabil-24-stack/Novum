import { createHash } from "node:crypto";
import { requireAuth } from "@/lib/supabase/auth-guard";
import { authorizeAction } from "@/lib/billing/billing";
import { fireAndForgetRecordUsage } from "@/lib/billing/route-helpers";
import {
  buildProblemMarkdown,
  buildSolutionMarkdown,
  buildDeltaMarkdown,
} from "@/lib/handoff/markdown";
import { getDirtyHandoffSections } from "@/lib/handoff/snapshot";
import type { HandoffSnapshot } from "@/lib/handoff/types";

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

    const problemMarkdown = buildProblemMarkdown({ snapshot });
    const solutionMarkdown = buildSolutionMarkdown({ snapshot });
    const deltaMarkdown =
      mode === "regenerate" && dirtySections.length > 0
        ? buildDeltaMarkdown({
            currentSnapshot: snapshot,
            previousSnapshot: previousSnapshot ?? null,
            dirtySections,
          })
        : null;

    fireAndForgetRecordUsage({
      operationId: authorization.operationId,
      userId: auth.user.id,
      route: "/api/generate-handoff",
      phase: "handoff",
      inputTokens: 0,
      outputTokens: 0,
      projectId,
    });

    return Response.json({
      problemMarkdown,
      solutionMarkdown,
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
