import Stripe from "stripe";
import { syncStripeSubscription } from "@/lib/billing/stripe";

function getStripe() {
  return new Stripe(process.env.STRIPE_SECRET_KEY!);
}

export async function POST(request: Request) {
  const body = await request.text();
  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    return Response.json({ error: "Missing stripe-signature header" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err) {
    console.error("[stripe/webhook] Signature verification failed:", err);
    return Response.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    await syncStripeSubscription(event);
    return Response.json({ received: true });
  } catch (err) {
    console.error("[stripe/webhook] Error processing event:", err);
    return Response.json({ error: "Webhook processing failed" }, { status: 500 });
  }
}
