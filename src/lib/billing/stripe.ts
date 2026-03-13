import Stripe from "stripe";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { getOrCreateBillingAccount } from "./billing";
import { STRIPE_PRO_PRICE_ID, APP_URL } from "./config";
import {
  FREE_MONTHLY_GENERATIONS,
  FREE_SHARED_BUDGET_USD_MICROS,
  PRO_MONTHLY_BUDGET_USD_MICROS,
} from "./config";

function getStripe() {
  return new Stripe(process.env.STRIPE_SECRET_KEY!);
}

/** Extract current_period_start/end from the first subscription item */
function getSubscriptionPeriod(subscription: Stripe.Subscription): {
  periodStart: number;
  periodEnd: number;
} {
  const item = subscription.items.data[0];
  return {
    periodStart: item?.current_period_start ?? Math.floor(Date.now() / 1000),
    periodEnd: item?.current_period_end ?? Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
  };
}

/** Get subscription ID from an invoice (clover API uses parent.subscription_details) */
function getInvoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  const parent = invoice.parent;
  if (parent?.subscription_details?.subscription) {
    const sub = parent.subscription_details.subscription;
    return typeof sub === "string" ? sub : sub.id;
  }
  return null;
}

export async function createCheckoutSession(
  userId: string,
  email: string
): Promise<string> {
  const stripe = getStripe();
  const supabase = createSupabaseAdmin();

  // Ensure billing account row exists (upserts if missing)
  const account = await getOrCreateBillingAccount(userId);
  let customerId = account.stripe_customer_id;

  if (!customerId) {
    const customer = await stripe.customers.create({
      email,
      metadata: { supabase_user_id: userId },
    });
    customerId = customer.id;

    await supabase
      .from("billing_accounts")
      .update({ stripe_customer_id: customerId, updated_at: new Date().toISOString() })
      .eq("user_id", userId);
  }

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: "subscription",
    line_items: [{ price: STRIPE_PRO_PRICE_ID, quantity: 1 }],
    success_url: `${APP_URL}/?billing=success`,
    cancel_url: `${APP_URL}/?billing=cancelled`,
    subscription_data: {
      metadata: { supabase_user_id: userId },
    },
  });

  return session.url!;
}

export async function createPortalSession(
  stripeCustomerId: string
): Promise<string> {
  const stripe = getStripe();

  const session = await stripe.billingPortal.sessions.create({
    customer: stripeCustomerId,
    return_url: `${APP_URL}/`,
  });

  return session.url;
}

export async function syncStripeSubscription(event: Stripe.Event): Promise<void> {
  const supabase = createSupabaseAdmin();

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const subId = session.subscription;
      if (!subId) break;

      const subIdStr = typeof subId === "string" ? subId : subId.id;
      const subscription = await getStripe().subscriptions.retrieve(subIdStr);
      const userId = subscription.metadata.supabase_user_id;
      if (!userId) break;

      const { periodStart, periodEnd } = getSubscriptionPeriod(subscription);

      // Ensure billing account row exists before upgrading
      await getOrCreateBillingAccount(userId);

      // Update billing account to Pro
      await supabase
        .from("billing_accounts")
        .update({
          plan_tier: "pro",
          stripe_customer_id: typeof session.customer === "string" ? session.customer : session.customer?.id,
          stripe_subscription_id: subscription.id,
          stripe_price_id: subscription.items.data[0]?.price.id || null,
          subscription_status: subscription.status,
          current_period_start: new Date(periodStart * 1000).toISOString(),
          current_period_end: new Date(periodEnd * 1000).toISOString(),
          cancel_at_period_end: subscription.cancel_at_period_end,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", userId);

      // Deactivate any existing Free period
      await supabase
        .from("billing_usage_periods")
        .update({ is_active: false })
        .eq("user_id", userId)
        .eq("is_active", true);

      // Create Pro usage period
      await supabase.from("billing_usage_periods").insert({
        user_id: userId,
        period_start: new Date(periodStart * 1000).toISOString(),
        period_end: new Date(periodEnd * 1000).toISOString(),
        plan_tier: "pro",
        budget_usd_micros: PRO_MONTHLY_BUDGET_USD_MICROS,
        is_active: true,
      });

      break;
    }

    case "customer.subscription.updated": {
      const subscription = event.data.object as Stripe.Subscription;
      const userId = subscription.metadata.supabase_user_id;
      if (!userId) break;

      const { periodStart, periodEnd } = getSubscriptionPeriod(subscription);

      await getOrCreateBillingAccount(userId);
      await supabase
        .from("billing_accounts")
        .update({
          subscription_status: subscription.status,
          cancel_at_period_end: subscription.cancel_at_period_end,
          current_period_start: new Date(periodStart * 1000).toISOString(),
          current_period_end: new Date(periodEnd * 1000).toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", userId);

      break;
    }

    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      const userId = subscription.metadata.supabase_user_id;
      if (!userId) break;

      const now = new Date();

      // Ensure billing account row exists
      await getOrCreateBillingAccount(userId);

      // Revert to free
      await supabase
        .from("billing_accounts")
        .update({
          plan_tier: "free",
          subscription_status: "canceled",
          cancel_at_period_end: false,
          stripe_subscription_id: null,
          stripe_price_id: null,
          current_period_start: null,
          current_period_end: null,
          free_cycle_anchor: now.toISOString(),
          updated_at: now.toISOString(),
        })
        .eq("user_id", userId);

      // Deactivate Pro period
      await supabase
        .from("billing_usage_periods")
        .update({ is_active: false })
        .eq("user_id", userId)
        .eq("is_active", true);

      // Create Fresh Free period
      const periodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
      await supabase.from("billing_usage_periods").insert({
        user_id: userId,
        period_start: now.toISOString(),
        period_end: periodEnd.toISOString(),
        plan_tier: "free",
        free_generations_limit: FREE_MONTHLY_GENERATIONS,
        free_shared_budget_usd_micros: FREE_SHARED_BUDGET_USD_MICROS,
        is_active: true,
      });

      break;
    }

    case "invoice.payment_succeeded": {
      const invoice = event.data.object as Stripe.Invoice;
      const subId = getInvoiceSubscriptionId(invoice);
      if (!subId) break;

      const subscription = await getStripe().subscriptions.retrieve(subId);
      const userId = subscription.metadata.supabase_user_id;
      if (!userId) break;

      // Check if this is a renewal (not the initial invoice)
      if (invoice.billing_reason === "subscription_cycle") {
        const { periodStart, periodEnd } = getSubscriptionPeriod(subscription);

        // Deactivate old period
        await supabase
          .from("billing_usage_periods")
          .update({ is_active: false })
          .eq("user_id", userId)
          .eq("is_active", true);

        // Create new Pro period
        await supabase.from("billing_usage_periods").insert({
          user_id: userId,
          period_start: new Date(periodStart * 1000).toISOString(),
          period_end: new Date(periodEnd * 1000).toISOString(),
          plan_tier: "pro",
          budget_usd_micros: PRO_MONTHLY_BUDGET_USD_MICROS,
          is_active: true,
        });

        // Update account period dates
        await supabase
          .from("billing_accounts")
          .update({
            current_period_start: new Date(periodStart * 1000).toISOString(),
            current_period_end: new Date(periodEnd * 1000).toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("user_id", userId);
      }

      break;
    }

    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      const subId = getInvoiceSubscriptionId(invoice);
      if (!subId) break;

      const subscription = await getStripe().subscriptions.retrieve(subId);
      const userId = subscription.metadata.supabase_user_id;
      if (!userId) break;

      await getOrCreateBillingAccount(userId);
      await supabase
        .from("billing_accounts")
        .update({
          subscription_status: "past_due",
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", userId);

      break;
    }
  }
}
