export type ClientEventType =
  | "chat_message_sent"
  | "ai_response_complete"
  | "ai_response_error"
  | "code_generated"
  | "verification_result";

/**
 * Fire-and-forget client-side event tracker.
 * Uses fetch with keepalive so events survive page navigation.
 * Never throws — analytics must never break the app.
 */
export function trackEvent(
  eventType: ClientEventType,
  projectId?: string | null,
  metadata?: Record<string, unknown>
): void {
  try {
    fetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event_type: eventType,
        project_id: projectId ?? null,
        metadata: metadata ?? {},
      }),
      keepalive: true,
    }).catch(() => {
      // Silently ignore — analytics should never disrupt the app
    });
  } catch {
    // Silently ignore
  }
}
