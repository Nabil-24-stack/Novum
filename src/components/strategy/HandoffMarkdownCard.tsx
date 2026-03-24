"use client";

import { useCallback, useMemo, useState, type PointerEvent } from "react";
import {
  Download,
  FileText,
  Loader2,
  RefreshCw,
  TriangleAlert,
} from "lucide-react";
import { useCanvasScale } from "@/components/canvas/InfiniteCanvas";
import type { HandoffDirtySection } from "@/lib/handoff/types";
import { HANDOFF_SECTION_LABELS } from "@/lib/handoff/types";

export const HANDOFF_CARD_WIDTH = 760;
export const HANDOFF_CARD_HEIGHT = 920;

interface HandoffMarkdownCardProps {
  projectName: string;
  x: number;
  y: number;
  problemMarkdown: string;
  solutionMarkdown: string;
  latestDeltaMarkdown: string | null;
  dirtySections: HandoffDirtySection[];
  isOutdated: boolean;
  generatedAt: string | null;
  lastError: string | null;
  warningMessage?: string | null;
  isGenerating: boolean;
  canGenerate: boolean;
  onMove?: (x: number, y: number) => void;
  onRegenerate: () => void;
}

function triggerDownload(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function HandoffMarkdownCard({
  projectName,
  x,
  y,
  problemMarkdown,
  solutionMarkdown,
  latestDeltaMarkdown,
  dirtySections,
  isOutdated,
  generatedAt,
  lastError,
  warningMessage,
  isGenerating,
  canGenerate,
  onMove,
  onRegenerate,
}: HandoffMarkdownCardProps) {
  const canvasScale = useCanvasScale();
  const [isDragging, setIsDragging] = useState(false);
  const [activePreview, setActivePreview] = useState<"problem" | "solution" | "delta">("problem");

  const handlePointerDown = useCallback((e: PointerEvent<HTMLDivElement>) => {
    if (!onMove) return;
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    setIsDragging(true);
  }, [onMove]);

  const handlePointerMove = useCallback((e: PointerEvent<HTMLDivElement>) => {
    if (!isDragging || !onMove) return;
    onMove(x + e.movementX / canvasScale, y + e.movementY / canvasScale);
  }, [canvasScale, isDragging, onMove, x, y]);

  const handlePointerUp = useCallback((e: PointerEvent<HTMLDivElement>) => {
    e.currentTarget.releasePointerCapture(e.pointerId);
    setIsDragging(false);
  }, []);

  const generatedLabel = useMemo(() => {
    if (!generatedAt) return "Not generated yet";
    const date = new Date(generatedAt);
    return Number.isNaN(date.getTime()) ? "Generated recently" : date.toLocaleString();
  }, [generatedAt]);

  const problemFilename = `${projectName || "project"}-problem.md`;
  const solutionFilename = `${projectName || "project"}-solution.md`;
  const deltaFilename = `${projectName || "project"}-delta.md`;
  const canDownloadProblem = problemMarkdown.trim().length > 0 && !isOutdated;
  const canDownloadSolution = solutionMarkdown.trim().length > 0 && !isOutdated;
  const canDownloadDelta = Boolean(latestDeltaMarkdown?.trim()) && !isOutdated;
  const canPreview = canDownloadProblem || canDownloadSolution;
  const showRegenerate = isOutdated || !canPreview || Boolean(lastError);
  const previewContent = activePreview === "problem"
    ? problemMarkdown
    : activePreview === "solution"
      ? solutionMarkdown
      : latestDeltaMarkdown ?? "";

  return (
    <div
      className={`absolute select-none ${isDragging ? "cursor-grabbing" : onMove ? "cursor-grab" : ""}`}
      style={{
        left: x,
        top: y,
        width: HANDOFF_CARD_WIDTH,
        touchAction: onMove ? "none" : undefined,
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      <div className="bg-white border border-neutral-200 rounded-2xl shadow-lg overflow-hidden">
        <div className="px-6 py-5 border-b border-neutral-200 bg-neutral-50">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-neutral-900 text-white flex items-center justify-center shrink-0">
              <FileText className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-xl font-semibold text-neutral-900">Handoff</h2>
                {isGenerating && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    Generating
                  </span>
                )}
                {!isGenerating && isOutdated && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700">
                    <TriangleAlert className="w-3 h-3" />
                    Outdated
                  </span>
                )}
                {!isGenerating && !isOutdated && canPreview && (
                  <span className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
                    Ready
                  </span>
                )}
              </div>
              <p className="mt-1 text-sm text-neutral-500">
                Structured markdown generated from your current strategy artifacts.
              </p>
              <p className="mt-2 text-xs text-neutral-400">Last generated: {generatedLabel}</p>
              {isOutdated && (
                <p className="mt-2 text-xs text-amber-600">
                  This preview is stale until you regenerate the handoff.
                </p>
              )}
            </div>
          </div>

          {dirtySections.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {dirtySections.map((section) => (
                <span
                  key={section}
                  className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700"
                >
                  {HANDOFF_SECTION_LABELS[section]}
                </span>
              ))}
            </div>
          )}

          {lastError && (
            <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {lastError}
            </div>
          )}

          {warningMessage && (
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              {warningMessage}
            </div>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                triggerDownload(problemFilename, problemMarkdown);
              }}
              disabled={!canDownloadProblem}
              className="inline-flex items-center gap-2 rounded-lg border border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Download className="w-4 h-4" />
              Download problem
            </button>
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                triggerDownload(solutionFilename, solutionMarkdown);
              }}
              disabled={!canDownloadSolution}
              className="inline-flex items-center gap-2 rounded-lg border border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Download className="w-4 h-4" />
              Download solution
            </button>
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                if (latestDeltaMarkdown) {
                  triggerDownload(deltaFilename, latestDeltaMarkdown);
                }
              }}
              disabled={!canDownloadDelta}
              className="inline-flex items-center gap-2 rounded-lg border border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Download className="w-4 h-4" />
              Download delta
            </button>
            {showRegenerate && (
              <button
                type="button"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  onRegenerate();
                }}
                disabled={isGenerating || !canGenerate}
                className="inline-flex items-center gap-2 rounded-lg bg-neutral-900 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isGenerating ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4" />
                )}
                {canPreview ? "Regenerate" : "Generate"}
              </button>
            )}
          </div>
        </div>

        <div
          className="bg-neutral-950 px-6 py-5"
          style={{ minHeight: HANDOFF_CARD_HEIGHT - 180 }}
        >
          {canPreview ? (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                {[
                  { key: "problem", label: "problem.md" },
                  { key: "solution", label: "solution.md" },
                  { key: "delta", label: "delta.md" },
                ].map((tab) => {
                  const disabled =
                    (tab.key === "problem" && !problemMarkdown.trim()) ||
                    (tab.key === "solution" && !solutionMarkdown.trim()) ||
                    (tab.key === "delta" && !latestDeltaMarkdown?.trim());
                  const isActive = activePreview === tab.key;

                  return (
                    <button
                      key={tab.key}
                      type="button"
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!disabled) {
                          setActivePreview(tab.key as "problem" | "solution" | "delta");
                        }
                      }}
                      disabled={disabled}
                      className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                        isActive
                          ? "bg-white text-neutral-900"
                          : "bg-neutral-800 text-neutral-300 hover:bg-neutral-700"
                      } disabled:cursor-not-allowed disabled:opacity-40`}
                    >
                      {tab.label}
                    </button>
                  );
                })}
              </div>

              <pre className="whitespace-pre-wrap break-words font-mono text-[12px] leading-6 text-neutral-100">
                {previewContent}
              </pre>
            </div>
          ) : (
            <div className="flex min-h-[320px] items-center justify-center rounded-2xl border border-dashed border-neutral-700 bg-neutral-900/70 px-6 py-12 text-center">
              <div className="max-w-md">
                <p className="text-sm font-medium text-neutral-100">
                  {isGenerating
                    ? "Generating your markdown handoff..."
                    : canGenerate
                      ? "Approve the solution design to generate your first markdown handoff."
                      : "Add more strategy context before generating the handoff."}
                </p>
                <p className="mt-2 text-sm text-neutral-400">
                  Once generated, this card becomes the read-only source for downloading `problem.md`, `solution.md`, and `delta.md`.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
