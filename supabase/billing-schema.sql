-- Billing System Schema
-- Run via Supabase SQL editor or MCP execute_sql

-- A1. billing_accounts
CREATE TABLE billing_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_tier TEXT NOT NULL DEFAULT 'free' CHECK (plan_tier IN ('free', 'pro')),
  stripe_customer_id TEXT UNIQUE,
  stripe_subscription_id TEXT,
  stripe_price_id TEXT,
  subscription_status TEXT,
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE,
  free_cycle_anchor TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE billing_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own billing" ON billing_accounts FOR SELECT USING (auth.uid() = user_id);

-- A2. billing_usage_periods
CREATE TABLE billing_usage_periods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  plan_tier TEXT NOT NULL CHECK (plan_tier IN ('free', 'pro')),
  budget_usd_micros BIGINT NOT NULL DEFAULT 0,
  spent_usd_micros BIGINT NOT NULL DEFAULT 0,
  free_generations_limit INT NOT NULL DEFAULT 0,
  free_generations_used INT NOT NULL DEFAULT 0,
  free_shared_budget_usd_micros BIGINT NOT NULL DEFAULT 0,
  free_shared_spent_usd_micros BIGINT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE billing_usage_periods ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own periods" ON billing_usage_periods FOR SELECT USING (auth.uid() = user_id);
CREATE UNIQUE INDEX idx_active_period ON billing_usage_periods (user_id) WHERE is_active = TRUE;

-- A3. billing_operations
CREATE TABLE billing_operations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id UUID NOT NULL UNIQUE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  period_id UUID REFERENCES billing_usage_periods(id),
  project_id UUID,
  operation_type TEXT NOT NULL CHECK (operation_type IN ('initial_generation', 'build_usage', 'strategy_ai')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'refunded')),
  total_cost_usd_micros BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);
ALTER TABLE billing_operations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own operations" ON billing_operations FOR SELECT USING (auth.uid() = user_id);

-- A4. billing_usage_events
CREATE TABLE billing_usage_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id UUID NOT NULL REFERENCES billing_operations(operation_id),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  route TEXT NOT NULL,
  phase TEXT,
  input_tokens INT NOT NULL DEFAULT 0,
  output_tokens INT NOT NULL DEFAULT 0,
  total_tokens INT NOT NULL DEFAULT 0,
  cost_usd_micros BIGINT NOT NULL DEFAULT 0,
  counted BOOLEAN NOT NULL DEFAULT TRUE,
  project_id UUID,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE billing_usage_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own events" ON billing_usage_events FOR SELECT USING (auth.uid() = user_id);

-- A5. Alter published_apps
ALTER TABLE published_apps ADD COLUMN IF NOT EXISTS show_novum_branding BOOLEAN NOT NULL DEFAULT TRUE;

-- A6. Atomic increment functions for race-safe usage accounting

CREATE OR REPLACE FUNCTION increment_operation_cost(
  p_operation_id UUID,
  p_amount BIGINT
) RETURNS VOID AS $$
BEGIN
  UPDATE billing_operations
  SET total_cost_usd_micros = total_cost_usd_micros + p_amount
  WHERE operation_id = p_operation_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION increment_period_spent(
  p_period_id UUID,
  p_amount BIGINT
) RETURNS VOID AS $$
BEGIN
  UPDATE billing_usage_periods
  SET spent_usd_micros = spent_usd_micros + p_amount
  WHERE id = p_period_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION increment_period_free_shared_spent(
  p_period_id UUID,
  p_amount BIGINT
) RETURNS VOID AS $$
BEGIN
  UPDATE billing_usage_periods
  SET free_shared_spent_usd_micros = free_shared_spent_usd_micros + p_amount
  WHERE id = p_period_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION increment_period_free_generations_used(
  p_period_id UUID
) RETURNS VOID AS $$
BEGIN
  UPDATE billing_usage_periods
  SET free_generations_used = free_generations_used + 1
  WHERE id = p_period_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
