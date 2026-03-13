import { requireAuth } from "@/lib/supabase/auth-guard";
import { getBillingStatus } from "@/lib/billing/billing";

export async function GET() {
  const auth = await requireAuth();
  if (auth.response) return auth.response;

  try {
    const status = await getBillingStatus(auth.user.id);
    return Response.json(status);
  } catch (err) {
    console.error("[billing/status] Error:", err);
    return Response.json({ error: "Failed to get billing status" }, { status: 500 });
  }
}
