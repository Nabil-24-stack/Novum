function envInt(key: string, fallback: number): number {
  const val = process.env[key];
  if (!val) return fallback;
  const parsed = parseInt(val, 10);
  return isNaN(parsed) ? fallback : parsed;
}

// Token pricing (USD per million tokens → micros per token)
const INPUT_USD_PER_MILLION = envInt("BILLING_USAGE_INPUT_USD_PER_MILLION", 3);
const OUTPUT_USD_PER_MILLION = envInt("BILLING_USAGE_OUTPUT_USD_PER_MILLION", 15);

export const INPUT_MICROS_PER_TOKEN = (INPUT_USD_PER_MILLION * 1_000_000) / 1_000_000; // 3 micros/token
export const OUTPUT_MICROS_PER_TOKEN = (OUTPUT_USD_PER_MILLION * 1_000_000) / 1_000_000; // 15 micros/token

// Free tier limits
export const FREE_MONTHLY_GENERATIONS = envInt("BILLING_FREE_MONTHLY_GENERATIONS", 2);
export const FREE_SHARED_BUDGET_USD_MICROS = envInt("BILLING_FREE_SHARED_BUDGET_USD_MICROS", 5_000_000);

// Pro tier limits
export const PRO_MONTHLY_BUDGET_USD_MICROS = envInt("BILLING_PRO_MONTHLY_BUDGET_USD_MICROS", 25_000_000);

// Warning thresholds
export const USAGE_WARN_PCT = envInt("BILLING_USAGE_WARN_PCT", 80);
export const USAGE_CRITICAL_PCT = envInt("BILLING_USAGE_CRITICAL_PCT", 90);

// Stripe
export const STRIPE_PRO_PRICE_ID = process.env.STRIPE_PRO_PRICE_ID_AUD || "";

// App URL
export const APP_URL = process.env.APP_URL || "http://localhost:3000";

export function calculateCostMicros(inputTokens: number, outputTokens: number): number {
  return Math.round(inputTokens * INPUT_MICROS_PER_TOKEN + outputTokens * OUTPUT_MICROS_PER_TOKEN);
}
