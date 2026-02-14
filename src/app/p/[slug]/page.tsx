import { createSupabasePublic } from "@/lib/supabase";
import { PublishedAppViewer } from "./PublishedAppViewer";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export default async function PublishedAppPage({ params }: PageProps) {
  const { slug } = await params;

  const supabase = createSupabasePublic();
  const { data, error } = await supabase
    .from("published_apps")
    .select("name, files")
    .eq("slug", slug)
    .single();

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <h1 className="text-2xl font-semibold text-gray-800 mb-2">
            App not found
          </h1>
          <p className="text-gray-500">
            This published app doesn&apos;t exist or has been removed.
          </p>
        </div>
      </div>
    );
  }

  return (
    <PublishedAppViewer
      name={data.name}
      files={data.files as Record<string, string>}
    />
  );
}
