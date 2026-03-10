import { createSupabaseAdmin } from "@/lib/supabase/admin";

export type ServerEventType =
  | "project_created"
  | "app_published";

/**
 * Log an event from a server-side API route.
 * Uses admin client (bypasses RLS). Non-throwing — errors are logged but never propagated.
 */
export function logServerEvent(
  userId: string,
  eventType: ServerEventType,
  projectId?: string | null,
  metadata?: Record<string, unknown>
): void {
  try {
    const supabase = createSupabaseAdmin();
    Promise.resolve(
      supabase
        .from("activity_events")
        .insert({
          user_id: userId,
          event_type: eventType,
          project_id: projectId ?? null,
          metadata: metadata ?? {},
        })
    ).then(({ error }) => {
      if (error) console.error("[analytics] logServerEvent failed:", error.message);
    }).catch((err: unknown) => {
      console.error("[analytics] logServerEvent unexpected error:", err);
    });
  } catch (err) {
    console.error("[analytics] logServerEvent unexpected error:", err);
  }
}
