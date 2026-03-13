import { requireAuth } from "@/lib/supabase/auth-guard";
import { getOrCreateBillingAccount } from "@/lib/billing/billing";
import { createPortalSession } from "@/lib/billing/stripe";

export async function POST() {
  const auth = await requireAuth();
  if (auth.response) return auth.response;

  try {
    const account = await getOrCreateBillingAccount(auth.user.id);

    if (!account.stripe_customer_id) {
      return Response.json({ error: "No Stripe customer found" }, { status: 400 });
    }

    const url = await createPortalSession(account.stripe_customer_id);
    return Response.json({ url });
  } catch (err) {
    console.error("[billing/portal] Error:", err);
    return Response.json({ error: "Failed to create portal session" }, { status: 500 });
  }
}
