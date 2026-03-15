import Stripe from "stripe";
import { requireAuth } from "@/lib/supabase/auth-guard";
import { syncStripeSubscription } from "@/lib/billing/stripe";

function getStripe() {
  return new Stripe(process.env.STRIPE_SECRET_KEY!);
}

export async function POST(request: Request) {
  const auth = await requireAuth();
  if (auth.response) return auth.response;

  try {
    const { sessionId } = await request.json();
    if (!sessionId || typeof sessionId !== "string") {
      return Response.json({ error: "Missing sessionId" }, { status: 400 });
    }

    const stripe = getStripe();
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    // Verify this checkout session belongs to the authenticated user
    if (session.customer) {
      const customerId =
        typeof session.customer === "string" ? session.customer : session.customer.id;
      const customer = await stripe.customers.retrieve(customerId);
      if (
        !customer.deleted &&
        customer.metadata.supabase_user_id !== auth.user.id
      ) {
        return Response.json({ error: "Unauthorized" }, { status: 403 });
      }
    }

    if (session.payment_status === "paid" && session.subscription) {
      // Run the same sync logic as the webhook handler
      await syncStripeSubscription({
        type: "checkout.session.completed",
        data: { object: session },
      } as unknown as Stripe.Event);

      console.log("[billing/verify-checkout] Verified and synced checkout", {
        sessionId,
        userId: auth.user.id,
      });

      return Response.json({ upgraded: true });
    }

    return Response.json({
      upgraded: false,
      paymentStatus: session.payment_status,
    });
  } catch (err) {
    console.error("[billing/verify-checkout] Error:", err);
    return Response.json({ error: "Verification failed" }, { status: 500 });
  }
}
