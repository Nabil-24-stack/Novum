"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Send, Loader2, X, Info } from "lucide-react";
import { toast } from "sonner";
import { useProjects } from "@/hooks/useProjects";
import { useDocumentStore } from "@/hooks/useDocumentStore";
import { ProjectCard } from "@/components/dashboard/ProjectCard";
import { AccountMenu } from "@/components/billing/AccountMenu";
import { createClient } from "@/lib/supabase/client";

export default function Dashboard() {
  // Override the global overflow:hidden on html/body so the dashboard can scroll
  useEffect(() => {
    document.documentElement.style.overflow = "auto";
    document.body.style.overflow = "auto";
    return () => {
      document.documentElement.style.overflow = "";
      document.body.style.overflow = "";
    };
  }, []);

  const router = useRouter();
  const { projects, isLoading, deleteProject, renameProject } = useProjects();
  const [input, setInput] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userName, setUserName] = useState<string | null>(null);
  const docFileInputRef = useRef<HTMLInputElement>(null);
  const uploadedDocuments = useDocumentStore((s) => s.documents);
  const isDocUploading = useDocumentStore((s) => s.isUploading);

  // Fetch user info
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      const email = user?.email ?? null;
      setUserEmail(email);
      const fullName = user?.user_metadata?.full_name || user?.user_metadata?.name;
      if (fullName) {
        setUserName(fullName);
      } else if (email) {
        // Derive first name from email: "nabil.hasan@..." → "Nabil"
        const local = email.split("@")[0].split(/[._-]/)[0];
        setUserName(local.charAt(0).toUpperCase() + local.slice(1));
      }
    });
  }, []);

  const handleDocumentUpload = useCallback(async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    const validFiles = Array.from(fileList).filter((f) => {
      const ext = f.name.split(".").pop()?.toLowerCase();
      return ext === "pdf" || ext === "docx";
    });
    if (validFiles.length === 0) return;

    useDocumentStore.getState().setUploading(true);
    try {
      const formData = new FormData();
      validFiles.forEach((f) => formData.append("files", f));
      const res = await fetch("/api/extract-document", { method: "POST", body: formData });
      if (!res.ok) throw new Error("Upload failed");
      const data = await res.json();
      const docs = (data.documents as { name: string; text: string }[]).map((d) => ({
        id: crypto.randomUUID(),
        name: d.name,
        text: d.text,
        uploadedAt: new Date().toISOString(),
      }));
      useDocumentStore.getState().addDocuments(docs);
      toast.success(`${docs.length} document${docs.length > 1 ? "s" : ""} uploaded`);
    } catch {
      toast.error("Failed to extract document text");
    } finally {
      useDocumentStore.getState().setUploading(false);
      if (docFileInputRef.current) docFileInputRef.current.value = "";
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const message = input.trim();
    if (!message || isCreating) return;

    setIsCreating(true);
    try {
      // Create project
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: message.slice(0, 60) }),
      });
      if (!res.ok) throw new Error("Failed to create project");
      const { id } = await res.json();

      // Store initial message + documents in sessionStorage for the project page to pick up
      sessionStorage.setItem(
        `novum-init-${id}`,
        JSON.stringify({
          message,
          documents: useDocumentStore.getState().documents,
        })
      );

      // Clear dashboard document state
      useDocumentStore.getState().reset();

      router.push(`/project/${id}`);
    } catch {
      toast.error("Failed to create project");
      setIsCreating(false);
    }
  };

  return (
    <main className="min-h-screen bg-neutral-50" style={{ overflow: "auto", height: "auto" }}>
      {/* Account menu (top-right) */}
      {userEmail && userName && (
        <AccountMenu userEmail={userEmail} userName={userName} />
      )}

      {/* Hero section — full viewport minus peek */}
      <section className="h-[calc(100vh-80px)] flex flex-col items-center justify-center px-4">
        <h1 className="text-4xl font-semibold text-neutral-900 tracking-tight">
          Novum
        </h1>
        <p className="mt-3 text-neutral-500 text-center max-w-md">
          Describe the problem you want to solve, and I&apos;ll help you design and build a web app.
        </p>

        {/* Chat input card */}
        <div className="mt-8 w-full max-w-xl">
          <form
            onSubmit={handleSubmit}
            className="bg-white rounded-2xl shadow-lg border border-neutral-200 p-4"
          >
            {/* Document chips */}
            {(uploadedDocuments.length > 0 || isDocUploading) && (
              <div className="flex flex-wrap gap-2 mb-2">
                {uploadedDocuments.map((doc) => (
                  <span
                    key={doc.id}
                    className="inline-flex items-center gap-1.5 bg-neutral-100 text-neutral-600 text-sm rounded-full px-3 py-1"
                  >
                    <span className="truncate max-w-[180px]">{doc.name}</span>
                    <button
                      type="button"
                      onClick={() =>
                        useDocumentStore
                          .getState()
                          .setDocuments(uploadedDocuments.filter((d) => d.id !== doc.id))
                      }
                      className="text-neutral-400 hover:text-neutral-700 transition-colors"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </span>
                ))}
                {isDocUploading && (
                  <span className="inline-flex items-center gap-1.5 bg-neutral-100 text-neutral-400 text-sm rounded-full px-3 py-1">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Uploading...
                  </span>
                )}
              </div>
            )}

            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit(e);
                }
              }}
              placeholder="What problem do you want to solve?"
              rows={3}
              className="w-full resize-none text-neutral-900 placeholder-neutral-400 bg-transparent outline-none text-base"
            />

            <input
              ref={docFileInputRef}
              type="file"
              accept=".pdf,.docx"
              multiple
              className="hidden"
              onChange={(e) => handleDocumentUpload(e.target.files)}
            />

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => docFileInputRef.current?.click()}
                  disabled={isDocUploading}
                  className="px-3 py-2 border border-neutral-300 rounded-lg text-sm text-neutral-500 hover:border-neutral-400 hover:text-neutral-700 transition-colors disabled:opacity-50"
                >
                  Add research docs
                </button>
                <div className="relative group">
                  <Info className="w-4 h-4 text-neutral-400 cursor-help" />
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-neutral-900 text-white text-xs rounded-lg w-56 text-center opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity">
                    Upload any user research documents like interview transcripts or notes to give more context about the problem.
                    <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-neutral-900" />
                  </div>
                </div>
              </div>
              <button
                type="submit"
                disabled={!input.trim() || isCreating}
                className="flex items-center gap-2 px-4 py-2 bg-neutral-900 text-white rounded-lg text-sm font-medium hover:bg-neutral-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {isCreating ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
                Start
              </button>
            </div>
          </form>
        </div>
      </section>

      {/* Projects section — peeks 80px above fold */}
      <section className="px-4 pb-16 max-w-6xl mx-auto">
        <h2 className="text-xl font-semibold text-neutral-900 mb-6">Your projects</h2>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-5 h-5 animate-spin text-neutral-400" />
          </div>
        ) : projects.length === 0 ? (
          <p className="text-neutral-400 text-sm text-center py-12">
            No projects yet. Describe a problem above to get started.
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                onRename={renameProject}
                onDelete={deleteProject}
              />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
