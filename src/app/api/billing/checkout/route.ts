import { requireAuth } from "@/lib/supabase/auth-guard";
import { createCheckoutSession } from "@/lib/billing/stripe";

export async function POST() {
  const auth = await requireAuth();
  if (auth.response) return auth.response;

  try {
    const { url, sessionId } = await createCheckoutSession(auth.user.id, auth.user.email || "");
    return Response.json({ url, sessionId });
  } catch (err) {
    console.error("[billing/checkout] Error:", err);
    return Response.json({ error: "Failed to create checkout session" }, { status: 500 });
  }
}
