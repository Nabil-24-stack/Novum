import { requireAuth } from "@/lib/supabase/auth-guard";
import { requireBillingAuth } from "@/lib/billing/route-helpers";
import type { ActionType } from "@/lib/billing/types";

export async function POST(request: Request) {
  const auth = await requireAuth();
  if (auth.response) return auth.response;

  try {
    const { actionType, operationId, projectId } = (await request.json()) as {
      actionType: ActionType;
      operationId?: string;
      projectId?: string;
    };

    if (!actionType) {
      return Response.json({ error: "actionType is required" }, { status: 400 });
    }

    const result = await requireBillingAuth(auth.user.id, actionType, operationId, projectId);

    if (!result.allowed) {
      return result.response;
    }

    return Response.json({ allowed: true, operationId: result.operationId });
  } catch (err) {
    console.error("[billing/authorize-action] Error:", err);
    return Response.json({ error: "Failed to authorize action" }, { status: 500 });
  }
}
