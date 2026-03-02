import { createClient } from "@supabase/supabase-js";

/**
 * Admin client using service role key — bypasses RLS.
 * Use only in server-side code when RLS must be bypassed.
 */
export function createSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}
