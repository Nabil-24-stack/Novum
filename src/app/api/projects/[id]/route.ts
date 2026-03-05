import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase/auth-guard";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if (auth.response) return auth.response;

  const { id } = await params;
  const { data, error } = await auth.supabase
    .from("projects")
    .select("*")
    .eq("id", id)
    .single();

  if (error) {
    const status = error.code === "PGRST116" ? 404 : 500;
    return NextResponse.json({ error: error.message }, { status });
  }
  return NextResponse.json(data);
}

const ALLOWED_FIELDS = new Set([
  "name",
  "brand_color",
  "files",
  "strategy",
  "chat_messages",
  "product_brain",
  "documents",
  "phase",
  "canvas_layout",
]);

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if (auth.response) return auth.response;

  const { id } = await params;
  const body = await req.json();

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const [key, value] of Object.entries(body)) {
    if (ALLOWED_FIELDS.has(key)) {
      updates[key] = value;
    }
  }

  const { data, error } = await auth.supabase
    .from("projects")
    .update(updates)
    .eq("id", id)
    .select("id, name, updated_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if (auth.response) return auth.response;

  const { id } = await params;
  const { error } = await auth.supabase.from("projects").delete().eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}
