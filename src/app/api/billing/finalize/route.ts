import { requireAuth } from "@/lib/supabase/auth-guard";
import { finalizeOperation } from "@/lib/billing/billing";

export async function POST(request: Request) {
  const auth = await requireAuth();
  if (auth.response) return auth.response;

  try {
    const { operationId } = (await request.json()) as { operationId: string };

    if (!operationId) {
      return Response.json({ error: "operationId is required" }, { status: 400 });
    }

    await finalizeOperation(operationId);
    return Response.json({ ok: true });
  } catch (err) {
    console.error("[billing/finalize] Error:", err);
    return Response.json({ error: "Failed to finalize operation" }, { status: 500 });
  }
}
