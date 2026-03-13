export type PlanTier = "free" | "pro";

export type OperationType = "initial_generation" | "build_usage" | "strategy_ai";

export type ActionType = OperationType;

export interface BillingAccount {
  id: string;
  user_id: string;
  plan_tier: PlanTier;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  stripe_price_id: string | null;
  subscription_status: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  free_cycle_anchor: string;
  created_at: string;
  updated_at: string;
}

export interface UsagePeriod {
  id: string;
  user_id: string;
  period_start: string;
  period_end: string;
  plan_tier: PlanTier;
  budget_usd_micros: number;
  spent_usd_micros: number;
  free_generations_limit: number;
  free_generations_used: number;
  free_shared_budget_usd_micros: number;
  free_shared_spent_usd_micros: number;
  is_active: boolean;
  created_at: string;
}

export interface BillingOperation {
  id: string;
  operation_id: string;
  user_id: string;
  period_id: string | null;
  project_id: string | null;
  operation_type: OperationType;
  status: "active" | "completed" | "refunded";
  total_cost_usd_micros: number;
  created_at: string;
  completed_at: string | null;
}

export interface BillingStatus {
  planTier: PlanTier;
  subscriptionStatus: string | null;
  cancelAtPeriodEnd: boolean;
  // Free tier fields
  freeGenerationsUsed: number;
  freeGenerationsLimit: number;
  freeSharedSpentUsdMicros: number;
  freeSharedBudgetUsdMicros: number;
  freeSharedUsagePercent: number;
  // Pro tier fields
  budgetUsdMicros: number;
  spentUsdMicros: number;
  // Common
  usagePercent: number;
  warningLevel: "none" | "warn" | "critical" | "exceeded";
  canStartInitialGeneration: boolean;
  canRunBuildUsage: boolean;
  usageResetAt: string | null;
  hasStripeCustomer: boolean;
}
