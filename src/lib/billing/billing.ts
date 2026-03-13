import { createSupabaseAdmin } from "@/lib/supabase/admin";
import type {
  BillingAccount,
  UsagePeriod,
  BillingStatus,
  ActionType,
} from "./types";
import {
  FREE_MONTHLY_GENERATIONS,
  FREE_SHARED_BUDGET_USD_MICROS,
  PRO_MONTHLY_BUDGET_USD_MICROS,
  USAGE_WARN_PCT,
  USAGE_CRITICAL_PCT,
  calculateCostMicros,
} from "./config";

const FREE_CYCLE_DAYS = 30;

export async function getOrCreateBillingAccount(
  userId: string
): Promise<BillingAccount> {
  const supabase = createSupabaseAdmin();

  const { data: existing } = await supabase
    .from("billing_accounts")
    .select("*")
    .eq("user_id", userId)
    .single();

  if (existing) return existing as BillingAccount;

  const { data: created, error } = await supabase
    .from("billing_accounts")
    .upsert(
      { user_id: userId, plan_tier: "free" },
      { onConflict: "user_id" }
    )
    .select("*")
    .single();

  if (error) throw new Error(`Failed to create billing account: ${error.message}`);
  return created as BillingAccount;
}

export async function ensureCurrentUsagePeriod(
  userId: string
): Promise<UsagePeriod> {
  const supabase = createSupabaseAdmin();
  const account = await getOrCreateBillingAccount(userId);

  // Check existing active period
  const { data: activePeriod } = await supabase
    .from("billing_usage_periods")
    .select("*")
    .eq("user_id", userId)
    .eq("is_active", true)
    .single();

  if (activePeriod) {
    const now = new Date();
    const periodEnd = new Date(activePeriod.period_end);

    // Still within period
    if (now < periodEnd) return activePeriod as UsagePeriod;

    // Period expired — deactivate
    await supabase
      .from("billing_usage_periods")
      .update({ is_active: false })
      .eq("id", activePeriod.id);
  }

  // Create new period
  const now = new Date();
  let periodStart: Date;
  let periodEnd: Date;
  let budget: number;
  let freeGenLimit: number;
  let freeSharedBudget: number;

  if (account.plan_tier === "pro" && account.current_period_start && account.current_period_end) {
    periodStart = new Date(account.current_period_start);
    periodEnd = new Date(account.current_period_end);
    // If Stripe period is in the past, use now + 30 days as fallback
    if (periodEnd <= now) {
      periodStart = now;
      periodEnd = new Date(now.getTime() + FREE_CYCLE_DAYS * 24 * 60 * 60 * 1000);
    }
    budget = PRO_MONTHLY_BUDGET_USD_MICROS;
    freeGenLimit = 0;
    freeSharedBudget = 0;
  } else {
    // Free tier: 30-day cycle from anchor
    const anchor = new Date(account.free_cycle_anchor);
    // Find the current cycle window
    const msPerCycle = FREE_CYCLE_DAYS * 24 * 60 * 60 * 1000;
    const cyclesSinceAnchor = Math.floor((now.getTime() - anchor.getTime()) / msPerCycle);
    periodStart = new Date(anchor.getTime() + cyclesSinceAnchor * msPerCycle);
    periodEnd = new Date(periodStart.getTime() + msPerCycle);
    budget = 0;
    freeGenLimit = FREE_MONTHLY_GENERATIONS;
    freeSharedBudget = FREE_SHARED_BUDGET_USD_MICROS;
  }

  const { data: newPeriod, error } = await supabase
    .from("billing_usage_periods")
    .insert({
      user_id: userId,
      period_start: periodStart.toISOString(),
      period_end: periodEnd.toISOString(),
      plan_tier: account.plan_tier,
      budget_usd_micros: budget,
      free_generations_limit: freeGenLimit,
      free_shared_budget_usd_micros: freeSharedBudget,
      is_active: true,
    })
    .select("*")
    .single();

  if (error) throw new Error(`Failed to create usage period: ${error.message}`);
  return newPeriod as UsagePeriod;
}

function computeWarningLevel(percent: number): BillingStatus["warningLevel"] {
  if (percent >= 100) return "exceeded";
  if (percent >= USAGE_CRITICAL_PCT) return "critical";
  if (percent >= USAGE_WARN_PCT) return "warn";
  return "none";
}

export async function getBillingStatus(userId: string): Promise<BillingStatus> {
  const account = await getOrCreateBillingAccount(userId);
  const period = await ensureCurrentUsagePeriod(userId);

  const isPro = account.plan_tier === "pro";

  // Usage percent calculation
  let usagePercent: number;
  let canStartInitialGeneration: boolean;
  let canRunBuildUsage: boolean;
  let freeSharedUsagePercent = 0;

  if (isPro) {
    usagePercent = period.budget_usd_micros > 0
      ? Math.round((period.spent_usd_micros / period.budget_usd_micros) * 100)
      : 0;
    canStartInitialGeneration = period.spent_usd_micros < period.budget_usd_micros;
    canRunBuildUsage = period.spent_usd_micros < period.budget_usd_micros;
  } else {
    // Free tier: usage percent based on generation count
    usagePercent = period.free_generations_limit > 0
      ? Math.round((period.free_generations_used / period.free_generations_limit) * 100)
      : 0;
    canStartInitialGeneration = period.free_generations_used < period.free_generations_limit;
    freeSharedUsagePercent = period.free_shared_budget_usd_micros > 0
      ? Math.round((period.free_shared_spent_usd_micros / period.free_shared_budget_usd_micros) * 100)
      : 0;
    canRunBuildUsage = period.free_shared_spent_usd_micros < period.free_shared_budget_usd_micros;
  }

  return {
    planTier: account.plan_tier,
    subscriptionStatus: account.subscription_status,
    cancelAtPeriodEnd: account.cancel_at_period_end,
    freeGenerationsUsed: period.free_generations_used,
    freeGenerationsLimit: period.free_generations_limit,
    freeSharedSpentUsdMicros: period.free_shared_spent_usd_micros,
    freeSharedBudgetUsdMicros: period.free_shared_budget_usd_micros,
    freeSharedUsagePercent,
    budgetUsdMicros: period.budget_usd_micros,
    spentUsdMicros: period.spent_usd_micros,
    usagePercent,
    warningLevel: computeWarningLevel(isPro ? usagePercent : Math.max(usagePercent, freeSharedUsagePercent)),
    canStartInitialGeneration,
    canRunBuildUsage,
    usageResetAt: period.period_end,
    hasStripeCustomer: !!account.stripe_customer_id,
  };
}

export async function authorizeAction(
  userId: string,
  actionType: ActionType,
  operationId?: string,
  projectId?: string
): Promise<{ allowed: true; operationId: string; periodId: string } | { allowed: false; reason: string }> {
  const supabase = createSupabaseAdmin();
  const period = await ensureCurrentUsagePeriod(userId);
  const account = await getOrCreateBillingAccount(userId);

  const opId = operationId || crypto.randomUUID();

  // Strategy AI: always allowed, just create operation for logging
  if (actionType === "strategy_ai") {
    await supabase.from("billing_operations").upsert(
      {
        operation_id: opId,
        user_id: userId,
        period_id: period.id,
        project_id: projectId || null,
        operation_type: "strategy_ai",
        status: "active",
      },
      { onConflict: "operation_id" }
    );
    return { allowed: true, operationId: opId, periodId: period.id };
  }

  // Check if this operation already exists (continuing an in-flight op)
  if (operationId) {
    const { data: existingOp } = await supabase
      .from("billing_operations")
      .select("*")
      .eq("operation_id", operationId)
      .single();

    if (existingOp && existingOp.status === "active") {
      return { allowed: true, operationId, periodId: period.id };
    }
  }

  if (actionType === "initial_generation") {
    if (account.plan_tier === "free") {
      if (period.free_generations_used >= period.free_generations_limit) {
        return { allowed: false, reason: `Free plan limit reached (${period.free_generations_used}/${period.free_generations_limit} builds used). Upgrade to Pro for more.` };
      }
      // Generation count is incremented on finalize, not here,
      // so failed builds don't consume a slot.
    } else {
      // Pro: check budget
      if (period.spent_usd_micros >= period.budget_usd_micros) {
        return { allowed: false, reason: "Pro plan budget exhausted for this billing period." };
      }
    }
  }

  if (actionType === "build_usage") {
    if (account.plan_tier === "free") {
      if (period.free_shared_spent_usd_micros >= period.free_shared_budget_usd_micros) {
        return { allowed: false, reason: "Free plan AI usage budget exhausted. Upgrade to Pro for more." };
      }
    } else {
      if (period.spent_usd_micros >= period.budget_usd_micros) {
        return { allowed: false, reason: "Pro plan budget exhausted for this billing period." };
      }
    }
  }

  // Create operation
  await supabase.from("billing_operations").upsert(
    {
      operation_id: opId,
      user_id: userId,
      period_id: period.id,
      project_id: projectId || null,
      operation_type: actionType,
      status: "active",
    },
    { onConflict: "operation_id" }
  );

  return { allowed: true, operationId: opId, periodId: period.id };
}

export async function recordUsage(params: {
  operationId: string;
  userId: string;
  route: string;
  phase?: string;
  inputTokens: number;
  outputTokens: number;
  projectId?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const supabase = createSupabaseAdmin();
  const costMicros = calculateCostMicros(params.inputTokens, params.outputTokens);
  const totalTokens = params.inputTokens + params.outputTokens;

  // Look up the operation to determine type
  const { data: op } = await supabase
    .from("billing_operations")
    .select("operation_type, period_id")
    .eq("operation_id", params.operationId)
    .single();

  const isStrategy = op?.operation_type === "strategy_ai";

  // Insert usage event
  await supabase.from("billing_usage_events").insert({
    operation_id: params.operationId,
    user_id: params.userId,
    route: params.route,
    phase: params.phase || null,
    input_tokens: params.inputTokens,
    output_tokens: params.outputTokens,
    total_tokens: totalTokens,
    cost_usd_micros: costMicros,
    counted: !isStrategy,
    project_id: params.projectId || null,
    metadata: params.metadata || null,
  });

  // Atomic increment operation total cost
  await supabase.rpc("increment_operation_cost", {
    p_operation_id: params.operationId,
    p_amount: costMicros,
  });

  // Atomic increment period spent (only for counted events)
  if (!isStrategy && op?.period_id) {
    const { data: period } = await supabase
      .from("billing_usage_periods")
      .select("plan_tier")
      .eq("id", op.period_id)
      .single();

    if (period) {
      if (period.plan_tier === "pro") {
        await supabase.rpc("increment_period_spent", {
          p_period_id: op.period_id,
          p_amount: costMicros,
        });
      } else if (op.operation_type !== "initial_generation") {
        // Free tier build_usage: decrement shared budget
        await supabase.rpc("increment_period_free_shared_spent", {
          p_period_id: op.period_id,
          p_amount: costMicros,
        });
      }
    }
  }
}

export async function finalizeOperation(operationId: string): Promise<void> {
  const supabase = createSupabaseAdmin();

  const { data: op } = await supabase
    .from("billing_operations")
    .select("*")
    .eq("operation_id", operationId)
    .single();

  if (!op || op.status !== "active") return;

  await supabase
    .from("billing_operations")
    .update({ status: "completed", completed_at: new Date().toISOString() })
    .eq("operation_id", operationId);

  // Increment free generation count on successful completion (deferred from authorizeAction)
  if (op.operation_type === "initial_generation" && op.period_id) {
    const { data: period } = await supabase
      .from("billing_usage_periods")
      .select("plan_tier")
      .eq("id", op.period_id)
      .single();

    if (period?.plan_tier === "free") {
      await supabase.rpc("increment_period_free_generations_used", {
        p_period_id: op.period_id,
      });
    }
  }
}
