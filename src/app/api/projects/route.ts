import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase/auth-guard";
import { helloWorldTemplate } from "@/lib/vfs/templates/hello-world";
import { logServerEvent } from "@/lib/analytics/log-server-event";

export async function GET() {
  const auth = await requireAuth();
  if (auth.response) return auth.response;

  const { data, error } = await auth.supabase
    .from("projects")
    .select("id, name, brand_color, phase, updated_at, created_at")
    .order("updated_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}

export async function POST(req: Request) {
  const auth = await requireAuth();
  if (auth.response) return auth.response;

  const body = await req.json();
  const name = body.name || "Untitled Project";

  const { data, error } = await auth.supabase
    .from("projects")
    .insert({
      name,
      user_id: auth.user.id,
      files: helloWorldTemplate,
      strategy: {},
      chat_messages: [],
      documents: [],
      phase: "hero",
    })
    .select("id, name")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  logServerEvent(auth.user.id, "project_created", data.id, { name });
  return NextResponse.json(data, { status: 201 });
}
