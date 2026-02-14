"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, ArrowRight } from "lucide-react";
import type { ConfidenceData } from "@/hooks/useStrategyStore";

const DIMENSION_LABELS: Record<string, string> = {
  targetUser: "Target User",
  coreProblem: "Core Problem",
  jobsToBeDone: "Jobs to Be Done",
  constraints: "Constraints",
  successMetrics: "Success Metrics",
};

function barColor(score: number): string {
  if (score >= 90) return "bg-emerald-500";
  if (score >= 70) return "bg-emerald-400";
  if (score >= 40) return "bg-yellow-500";
  return "bg-amber-400";
}

interface ConfidenceBarProps {
  data: ConfidenceData;
  onReady: () => void;
}

export function ConfidenceBar({ data, onReady }: ConfidenceBarProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="sticky top-0 z-10 bg-white border-b border-neutral-200">
      {/* Collapsed row */}
      <div className="px-4 py-3">
        <div className="flex items-center gap-3">
          <span className="text-xs font-medium text-neutral-600 whitespace-nowrap">
            Problem Understanding
          </span>

          {/* Progress bar */}
          <div className="flex-1 h-2 bg-neutral-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${barColor(data.overall)}`}
              style={{ width: `${data.overall}%` }}
            />
          </div>

          <span className="text-xs font-semibold text-neutral-700 tabular-nums w-8 text-right">
            {data.overall}%
          </span>

          <button
            onClick={() => setExpanded(!expanded)}
            className="p-0.5 text-neutral-400 hover:text-neutral-600 transition-colors"
          >
            {expanded ? (
              <ChevronUp className="w-4 h-4" />
            ) : (
              <ChevronDown className="w-4 h-4" />
            )}
          </button>
        </div>

        {/* "I'm ready" button — always visible, right-aligned */}
        {!expanded && (
          <div className="flex justify-end mt-1.5">
            <button
              onClick={onReady}
              className="inline-flex items-center gap-1 text-xs text-neutral-500 hover:text-neutral-800 transition-colors"
            >
              I&apos;m ready
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>
        )}
      </div>

      {/* Expanded dimensions */}
      {expanded && (
        <div className="px-4 pb-3 space-y-3">
          {Object.entries(data.dimensions).map(([key, dim]) => (
            <div key={key}>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-medium text-neutral-600 w-28 shrink-0">
                  {DIMENSION_LABELS[key] || key}
                </span>
                <div className="flex-1 h-1.5 bg-neutral-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${barColor(dim.score)}`}
                    style={{ width: `${dim.score}%` }}
                  />
                </div>
                <span className="text-xs text-neutral-500 tabular-nums w-8 text-right">
                  {dim.score}%
                </span>
              </div>
              <p className="text-xs text-neutral-500 italic ml-[7.5rem]">
                {dim.summary}
              </p>
            </div>
          ))}

          <div className="flex justify-end pt-1">
            <button
              onClick={onReady}
              className="inline-flex items-center gap-1 text-xs text-neutral-500 hover:text-neutral-800 transition-colors"
            >
              I&apos;m ready
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
