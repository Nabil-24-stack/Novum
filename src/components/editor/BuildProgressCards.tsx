"use client";

import { Loader2, Check, AlertTriangle, RotateCcw, Eye, ShieldCheck } from "lucide-react";
import type { PageBuildState } from "@/hooks/useStreamingStore";

interface BuildProgressCardsProps {
  pageBuilds: Record<string, PageBuildState>;
  pageNames: Record<string, { name: string; route: string }>;
  buildPhase: "idle" | "building";
  foundationPageId: string | null;
  onRetry: (pageId: string) => void;
  onRetryVerification: (pageId: string) => void;
  onRetryAllFailed: () => void;
}

export function BuildProgressCards({
  pageBuilds,
  pageNames,
  buildPhase,
  foundationPageId,
  onRetry,
  onRetryVerification,
  onRetryAllFailed,
}: BuildProgressCardsProps) {
  const entries = Object.entries(pageBuilds);
  const isVerifying = (b: PageBuildState) =>
    b.status === "completed" && b.verificationStatus !== "idle" && b.verificationStatus !== "passed" && b.verificationStatus !== "failed";
  const isVerified = (b: PageBuildState) =>
    b.status === "completed" && (b.verificationStatus === "passed" || b.verificationStatus === "idle");
  const completedCount = entries.filter(([, s]) => s.status === "completed").length;
  const verifyingCount = entries.filter(([, s]) => isVerifying(s)).length;
  const failedCount = entries.filter(([, s]) => s.status === "error").length;
  const totalCount = entries.length;
  const allDone = completedCount + failedCount === totalCount && verifyingCount === 0;

  return (
    <div className="flex flex-col gap-2">
      {/* Phase indicator */}
      {buildPhase === "building" && (
        <div className="text-xs text-neutral-500 px-1 flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
            Building pages sequentially...
          </span>
        </div>
      )}

      {/* Page status cards */}
      {entries.map(([pageId, build]) => {
        const info = pageNames[pageId] || { name: pageId, route: `/${pageId}` };
        const isFoundation = pageId === foundationPageId;
        return (
          <div
            key={pageId}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-colors ${
              build.status === "completed" && isVerifying(build)
                ? "bg-blue-50 border-blue-200"
                : build.status === "completed"
                  ? "bg-emerald-50 border-emerald-200"
                  : build.status === "error"
                    ? "bg-red-50 border-red-200"
                    : build.status === "streaming"
                      ? "bg-blue-50 border-blue-200"
                      : "bg-neutral-50 border-neutral-200"
            }`}
          >
            {/* Status icon */}
            <div className="shrink-0">
              {build.status === "streaming" && (
                <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />
              )}
              {build.status === "pending" && (
                <div className="w-4 h-4 rounded-full border-2 border-neutral-300" />
              )}
              {build.status === "completed" && isVerifying(build) && (
                <Eye className="w-4 h-4 text-blue-500 animate-pulse" />
              )}
              {build.status === "completed" && isVerified(build) && (
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
              )}
              {build.status === "completed" && build.verificationStatus === "failed" && (
                <Check className="w-4 h-4 text-amber-600" />
              )}
              {build.status === "error" && (
                <AlertTriangle className="w-4 h-4 text-red-500" />
              )}
            </div>

            {/* Page info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-neutral-900 truncate">
                  {info.name}
                </span>
                {isFoundation && (
                  <span className="text-[10px] font-medium bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">
                    Foundation
                  </span>
                )}
                <span className="text-xs text-neutral-500 font-mono">
                  {info.route}
                </span>
              </div>
              {build.status === "streaming" && build.currentFile && (
                <span className="text-xs text-blue-600 font-mono truncate block">
                  {build.currentFile.path}
                </span>
              )}
              {build.status === "pending" && buildPhase === "building" && (
                <span className="text-xs text-neutral-400">
                  Waiting...
                </span>
              )}
              {build.status === "completed" && isVerifying(build) && (
                <span className="text-xs text-blue-600">
                  {build.verificationStatus === "capturing" ? "Capturing preview..." :
                   build.verificationStatus === "reviewing" ? "Reviewing..." :
                   `Fixing (attempt ${build.verificationAttempt}/3)...`}
                </span>
              )}
              {build.status === "completed" && isVerified(build) && (
                <span className="text-xs text-emerald-600">
                  Verified
                </span>
              )}
              {build.status === "completed" && build.verificationStatus === "failed" && (
                <span className="text-xs text-amber-600">
                  Issues detected — {build.verificationIssues[0] || "check preview"}
                </span>
              )}
              {build.status === "error" && (
                <span className="text-xs text-red-600 truncate block">
                  {build.error || "Build failed"}
                </span>
              )}
              {/* Verification log */}
              {build.verificationLog.length > 0 && (
                <div className="mt-1 space-y-0.5">
                  {build.verificationLog.map((entry, i) => (
                    <span key={i} className="text-xs text-neutral-500 block">
                      {entry}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Retry button for failed pages */}
            {build.status === "error" && (
              <button
                onClick={() => onRetry(pageId)}
                className="shrink-0 inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-red-700 bg-red-100 rounded hover:bg-red-200 transition-colors"
              >
                <RotateCcw className="w-3 h-3" />
                Retry
              </button>
            )}
            {/* Retry verification button */}
            {build.status === "completed" && build.verificationStatus === "failed" && (
              <button
                onClick={() => onRetryVerification(pageId)}
                className="shrink-0 inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-amber-700 bg-amber-100 rounded hover:bg-amber-200 transition-colors"
              >
                <RotateCcw className="w-3 h-3" />
                Retry
              </button>
            )}
          </div>
        );
      })}

      {/* Bottom summary / actions */}
      <div className="flex items-center justify-between pt-2 border-t border-neutral-200 mt-1">
        <div className="text-sm text-neutral-600">
          {!allDone ? (
            <span className="flex items-center gap-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Building pages...
              <span className="text-neutral-400">
                ({completedCount}/{totalCount})
              </span>
            </span>
          ) : failedCount > 0 ? (
            <span className="text-red-600">
              {failedCount} page{failedCount !== 1 ? "s" : ""} failed
            </span>
          ) : (
            <span className="text-emerald-600 font-medium flex items-center gap-1.5">
              <Check className="w-3.5 h-3.5" />
              All pages built!
            </span>
          )}
        </div>

        {allDone && failedCount > 0 && (
          <button
            onClick={onRetryAllFailed}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-neutral-700 bg-neutral-100 rounded-lg hover:bg-neutral-200 transition-colors"
          >
            <RotateCcw className="w-3 h-3" />
            Retry Failed
          </button>
        )}
      </div>
    </div>
  );
}
