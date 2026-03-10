import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase/auth-guard";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

const ALLOWED_EVENT_TYPES = new Set([
  "chat_message_sent",
  "ai_response_complete",
  "ai_response_error",
  "code_generated",
  "verification_result",
]);

export async function POST(req: Request) {
  const auth = await requireAuth();
  if (auth.response) return auth.response;

  try {
    const { event_type, project_id, metadata } = await req.json();

    if (!event_type || !ALLOWED_EVENT_TYPES.has(event_type)) {
      return NextResponse.json({ error: "Invalid event_type" }, { status: 400 });
    }

    const supabase = createSupabaseAdmin();
    const { error } = await supabase.from("activity_events").insert({
      user_id: auth.user.id,
      event_type,
      project_id: project_id || null,
      metadata: metadata || {},
    });

    if (error) {
      console.error("[events] Insert failed:", error.message);
      return NextResponse.json({ error: "Failed to log event" }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
