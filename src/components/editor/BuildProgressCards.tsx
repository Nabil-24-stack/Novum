"use client";

import { Loader2, Check, AlertTriangle, RotateCcw, Eye, ShieldCheck, Clock, Layers } from "lucide-react";
import type { PageBuildState, FoundationBuild } from "@/hooks/useStreamingStore";

interface BuildProgressCardsProps {
  pageBuilds: Record<string, PageBuildState>;
  pageNames: Record<string, { name: string; route: string }>;
  buildPhase: "idle" | "building";
  foundationPageId: string | null;
  foundationBuild: FoundationBuild;
  onRetry: (pageId: string) => void;
  onRetryVerification: (pageId: string) => void;
  onRetryAllFailed: () => void;
}

export function BuildProgressCards({
  pageBuilds,
  pageNames,
  buildPhase,
  foundationBuild,
  onRetry,
  onRetryVerification,
  onRetryAllFailed,
}: BuildProgressCardsProps) {
  const entries = Object.entries(pageBuilds);

  // Count by buildStage for parallel fresh builds
  const streamingCount = entries.filter(([, s]) => s.buildStage === "streaming").length;
  const queuedCount = entries.filter(([, s]) => s.buildStage === "queued_verification" || s.buildStage === "generated").length;
  const verifyingCount = entries.filter(([, s]) => s.buildStage === "verifying").length;
  const verifiedCount = entries.filter(([, s]) => s.buildStage === "verified").length;
  const buildFailedCount = entries.filter(([, s]) => s.buildStage === "build_failed").length;
  const verifyFailedCount = entries.filter(([, s]) => s.buildStage === "verify_failed").length;
  const pendingCount = entries.filter(([, s]) => s.buildStage === "pending").length;
  const totalCount = entries.length;
  const failedCount = buildFailedCount + verifyFailedCount;
  const allTerminal = entries.every(([, s]) => {
    const st = s.buildStage;
    return st === "verified" || st === "build_failed" || st === "verify_failed";
  });

  // Build a rich status line
  const statusParts: string[] = [];
  if (streamingCount > 0) statusParts.push(`${streamingCount} streaming`);
  if (verifyingCount > 0) statusParts.push(`${verifyingCount} verifying`);
  if (queuedCount > 0) statusParts.push(`${queuedCount} queued`);
  if (pendingCount > 0) statusParts.push(`${pendingCount} pending`);
  const statusSuffix = statusParts.length > 0 ? ` (${statusParts.join(", ")}, ${verifiedCount}/${totalCount} verified)` : "";

  // Card background color based on buildStage
  function cardClasses(build: PageBuildState): string {
    const stage = build.buildStage;
    if (stage === "verifying") return "bg-blue-50 border-blue-200";
    if (stage === "verified") return "bg-emerald-50 border-emerald-200";
    if (stage === "build_failed") return "bg-red-50 border-red-200";
    if (stage === "verify_failed") return "bg-amber-50 border-amber-200";
    if (stage === "streaming") return "bg-blue-50 border-blue-200";
    if (stage === "queued_verification" || stage === "generated") return "bg-yellow-50 border-yellow-200";
    return "bg-neutral-50 border-neutral-200"; // pending
  }

  return (
    <div className="flex flex-col gap-2">
      {/* Phase indicator */}
      {buildPhase === "building" && (
        <div className="text-xs text-neutral-500 px-1 flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
            Building...{statusSuffix}
          </span>
        </div>
      )}

      {/* Foundation card */}
      {foundationBuild.status !== "idle" && (
        <div
          className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-colors ${
            foundationBuild.status === "completed"
              ? "bg-emerald-50 border-emerald-200"
              : foundationBuild.status === "error"
                ? "bg-red-50 border-red-200"
                : "bg-violet-50 border-violet-200"
          }`}
        >
          <div className="shrink-0">
            {foundationBuild.status === "streaming" && (
              <Loader2 className="w-4 h-4 text-violet-500 animate-spin" />
            )}
            {foundationBuild.status === "completed" && (
              <Layers className="w-4 h-4 text-emerald-600" />
            )}
            {foundationBuild.status === "error" && (
              <AlertTriangle className="w-4 h-4 text-red-500" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-neutral-900">Shared Layout</span>
              <span className="text-[10px] font-medium bg-violet-100 text-violet-700 px-1.5 py-0.5 rounded">
                Foundation
              </span>
            </div>
            {foundationBuild.status === "streaming" && (
              <span className="text-xs text-violet-600">Generating Navbar, Footer, AppLayout...</span>
            )}
            {foundationBuild.status === "completed" && (
              <span className="text-xs text-emerald-600">
                {foundationBuild.artifacts.length} component{foundationBuild.artifacts.length !== 1 ? "s" : ""} ready
              </span>
            )}
            {foundationBuild.status === "error" && (
              <span className="text-xs text-red-600">{foundationBuild.error || "Failed"} — pages will use inline layouts</span>
            )}
          </div>
        </div>
      )}

      {/* Page status cards */}
      {entries.map(([pageId, build]) => {
        const info = pageNames[pageId] || { name: pageId, route: `/${pageId}` };
        const stage = build.buildStage;
        return (
          <div
            key={pageId}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-colors ${cardClasses(build)}`}
          >
            {/* Status icon */}
            <div className="shrink-0">
              {stage === "streaming" && (
                <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />
              )}
              {stage === "pending" && (
                <div className="w-4 h-4 rounded-full border-2 border-neutral-300" />
              )}
              {(stage === "queued_verification" || stage === "generated") && (
                <Clock className="w-4 h-4 text-yellow-600" />
              )}
              {stage === "verifying" && (
                <Eye className="w-4 h-4 text-blue-500 animate-pulse" />
              )}
              {stage === "verified" && (
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
              )}
              {stage === "build_failed" && (
                <AlertTriangle className="w-4 h-4 text-red-500" />
              )}
              {stage === "verify_failed" && (
                <Check className="w-4 h-4 text-amber-600" />
              )}
            </div>

            {/* Page info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-neutral-900 truncate">
                  {info.name}
                </span>
                <span className="text-xs text-neutral-500 font-mono">
                  {info.route}
                </span>
              </div>
              {stage === "streaming" && build.currentFile && (
                <span className="text-xs text-blue-600 font-mono truncate block">
                  {build.currentFile.path}
                </span>
              )}
              {stage === "pending" && buildPhase === "building" && (
                <span className="text-xs text-neutral-400">
                  Waiting...
                </span>
              )}
              {(stage === "queued_verification" || stage === "generated") && (
                <span className="text-xs text-yellow-700">
                  Queued for verification...
                </span>
              )}
              {stage === "verifying" && (
                <span className="text-xs text-blue-600">
                  {build.verificationStatus === "capturing" ? "Capturing preview..." :
                   build.verificationStatus === "reviewing" ? "Reviewing..." :
                   `Fixing (attempt ${build.verificationAttempt}/3)...`}
                </span>
              )}
              {stage === "verified" && (
                <span className="text-xs text-emerald-600">
                  Verified
                </span>
              )}
              {stage === "verify_failed" && (
                <span className="text-xs text-amber-600">
                  Issues detected — {build.verificationIssues[0] || "check preview"}
                </span>
              )}
              {stage === "build_failed" && (
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

            {/* Retry button for build-failed pages */}
            {stage === "build_failed" && (
              <button
                onClick={() => onRetry(pageId)}
                className="shrink-0 inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-red-700 bg-red-100 rounded hover:bg-red-200 transition-colors"
              >
                <RotateCcw className="w-3 h-3" />
                Retry
              </button>
            )}
            {/* Retry verification button */}
            {stage === "verify_failed" && (
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
          {!allTerminal ? (
            <span className="flex items-center gap-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Building pages...
              <span className="text-neutral-400">
                ({verifiedCount}/{totalCount})
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

        {allTerminal && failedCount > 0 && (
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
