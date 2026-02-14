import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { files, name } = body;

    if (!files || typeof files !== "object" || Object.keys(files).length === 0) {
      return NextResponse.json(
        { error: "files must be a non-empty object" },
        { status: 400 }
      );
    }

    if (!name || typeof name !== "string") {
      return NextResponse.json(
        { error: "name must be a non-empty string" },
        { status: 400 }
      );
    }

    const slug = crypto.randomUUID().replace(/-/g, "").slice(0, 8);

    const supabase = createSupabaseAdmin();
    const { error } = await supabase.from("published_apps").insert({
      slug,
      name: name.slice(0, 200),
      files,
    });

    if (error) {
      console.error("[Publish] Supabase insert error:", error);
      return NextResponse.json(
        { error: "Failed to publish app" },
        { status: 500 }
      );
    }

    return NextResponse.json({ slug, url: `/p/${slug}` });
  } catch (err) {
    console.error("[Publish] Unexpected error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
