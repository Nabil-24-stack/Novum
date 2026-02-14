"use client";

import { useState, useCallback } from "react";
import { Copy, ExternalLink, X, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface PublishDialogProps {
  isOpen: boolean;
  onClose: () => void;
  files: Record<string, string>;
  defaultName: string;
}

type PublishState = "idle" | "publishing" | "success";

export function PublishDialog({ isOpen, onClose, files, defaultName }: PublishDialogProps) {
  const [name, setName] = useState(defaultName);
  const [state, setState] = useState<PublishState>("idle");
  const [publishedUrl, setPublishedUrl] = useState("");

  const handlePublish = useCallback(async () => {
    setState("publishing");

    try {
      const res = await fetch("/api/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ files, name: name.trim() || "My App" }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to publish");
      }

      const { url } = await res.json();
      const fullUrl = `${window.location.origin}${url}`;
      setPublishedUrl(fullUrl);
      setState("success");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to publish app");
      setState("idle");
    }
  }, [files, name]);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(publishedUrl);
    toast.success("Link copied to clipboard");
  }, [publishedUrl]);

  const handleClose = useCallback(() => {
    setState("idle");
    setPublishedUrl("");
    setName(defaultName);
    onClose();
  }, [defaultName, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40"
        onClick={handleClose}
      />

      {/* Dialog */}
      <div className="relative bg-white rounded-lg shadow-xl w-[420px] max-w-[90vw]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <h2 className="text-lg font-semibold text-neutral-900">
            {state === "success" ? "Published!" : "Publish your app"}
          </h2>
          <button
            onClick={handleClose}
            className="p-1 text-neutral-400 hover:text-neutral-600 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 pb-5">
          {state === "success" ? (
            /* Success state */
            <div className="space-y-4">
              <p className="text-sm text-neutral-600">
                Your app is live! Share this link with anyone:
              </p>

              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={publishedUrl}
                  className="flex-1 px-3 py-2 text-sm bg-neutral-50 border border-neutral-200 rounded-md text-neutral-700 select-all"
                  onFocus={(e) => e.target.select()}
                />
                <button
                  onClick={handleCopy}
                  className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium bg-neutral-900 text-white rounded-md hover:bg-neutral-800 transition-colors"
                >
                  <Copy className="w-3.5 h-3.5" />
                  Copy
                </button>
              </div>

              <div className="flex items-center justify-between pt-1">
                <a
                  href={publishedUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  Open in new tab
                </a>
                <button
                  onClick={handleClose}
                  className="px-4 py-1.5 text-sm font-medium text-neutral-600 hover:text-neutral-900 border border-neutral-300 rounded-md hover:border-neutral-400 transition-colors"
                >
                  Done
                </button>
              </div>
            </div>
          ) : (
            /* Idle / Publishing state */
            <div className="space-y-4">
              <div>
                <label
                  htmlFor="app-name"
                  className="block text-sm font-medium text-neutral-700 mb-1.5"
                >
                  App name
                </label>
                <input
                  id="app-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="My App"
                  disabled={state === "publishing"}
                  className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
                />
              </div>

              <button
                onClick={handlePublish}
                disabled={state === "publishing"}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium bg-neutral-900 text-white rounded-md hover:bg-neutral-800 transition-colors disabled:opacity-50"
              >
                {state === "publishing" ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Publishing...
                  </>
                ) : (
                  "Publish"
                )}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
