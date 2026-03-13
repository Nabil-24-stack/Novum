import { authorizeAction, recordUsage, getBillingStatus } from "./billing";
import { calculateCostMicros } from "./config";
import type { ActionType } from "./types";

export async function requireBillingAuth(
  userId: string,
  actionType: ActionType,
  operationId?: string,
  projectId?: string
): Promise<
  | { allowed: true; operationId: string }
  | { allowed: false; response: Response }
> {
  const result = await authorizeAction(userId, actionType, operationId, projectId);

  if (result.allowed) {
    return { allowed: true, operationId: result.operationId };
  }

  // Build 402 response
  const status = await getBillingStatus(userId);

  return {
    allowed: false,
    response: Response.json(
      {
        code: "BILLING_LIMIT",
        message: result.reason,
        planTier: status.planTier,
        usagePercent: status.usagePercent,
        usageResetAt: status.usageResetAt,
        upgradeUrlAvailable: status.planTier === "free",
      },
      { status: 402 }
    ),
  };
}

export function fireAndForgetRecordUsage(params: {
  operationId: string;
  userId: string;
  route: string;
  phase?: string;
  inputTokens: number;
  outputTokens: number;
  projectId?: string;
  metadata?: Record<string, unknown>;
}): void {
  recordUsage(params).catch((err) => {
    console.error("[billing] Failed to record usage:", err);
  });
}

export { calculateCostMicros };
