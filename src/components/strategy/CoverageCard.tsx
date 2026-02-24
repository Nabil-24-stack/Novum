"use client";

import { useCallback, useState, type PointerEvent } from "react";
import { ShieldCheck, AlertTriangle, Sparkles } from "lucide-react";
import { useCanvasScale } from "@/components/canvas/InfiniteCanvas";
import type { CoverageSummary } from "@/lib/product-brain/types";

interface CoverageCardProps {
  summary: CoverageSummary;
  x: number;
  y: number;
  onMove?: (x: number, y: number) => void;
  onAddressGaps?: () => void;
}

export function CoverageCard({ summary, x, y, onMove, onAddressGaps }: CoverageCardProps) {
  const canvasScale = useCanvasScale();
  const [isDragging, setIsDragging] = useState(false);

  const handlePointerDown = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      if (!onMove) return;
      e.preventDefault();
      e.stopPropagation();
      e.currentTarget.setPointerCapture(e.pointerId);
      setIsDragging(true);
    },
    [onMove]
  );

  const handlePointerMove = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      if (!isDragging || !onMove) return;
      onMove(x + e.movementX / canvasScale, y + e.movementY / canvasScale);
    },
    [isDragging, onMove, x, y, canvasScale]
  );

  const handlePointerUp = useCallback((e: PointerEvent<HTMLDivElement>) => {
    e.currentTarget.releasePointerCapture(e.pointerId);
    setIsDragging(false);
  }, []);

  const overallColor =
    summary.overallPercent >= 80
      ? "text-emerald-600"
      : summary.overallPercent >= 50
        ? "text-amber-600"
        : "text-red-500";

  return (
    <div
      className={`absolute select-none ${
        isDragging ? "cursor-grabbing" : onMove ? "cursor-grab" : ""
      }`}
      style={{
        left: x,
        top: y,
        width: 400,
        touchAction: onMove ? "none" : undefined,
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      <div className="bg-white/90 backdrop-blur-sm border border-neutral-200/60 shadow-lg rounded-2xl p-6">
        {/* Header */}
        <div className="flex items-center gap-2.5 mb-5">
          <ShieldCheck className="w-5 h-5 text-emerald-500 shrink-0" />
          <h3 className="text-base font-semibold text-neutral-900">Strategy Coverage</h3>
        </div>

        {/* Overall percentage */}
        <div className="text-center mb-5">
          <span className={`text-5xl font-bold ${overallColor}`}>
            {summary.overallPercent}%
          </span>
          <p className="text-sm text-neutral-500 mt-1">
            of jobs-to-be-done addressed
          </p>
        </div>

        {/* Per-persona coverage */}
        {summary.personaCoverage.length > 0 && (
          <div className="mb-5">
            <h4 className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-3">
              Per Persona
            </h4>
            <div className="space-y-3">
              {summary.personaCoverage.map((persona) => (
                <div key={persona.personaName}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-neutral-700 truncate">
                      {persona.personaName}
                    </span>
                    <span className="text-xs font-semibold text-neutral-500 shrink-0 ml-2">
                      {persona.coveragePercent}%
                    </span>
                  </div>
                  <div className="h-1.5 bg-neutral-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-emerald-400 rounded-full transition-all duration-500"
                      style={{ width: `${persona.coveragePercent}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Gaps */}
        {summary.gaps.length > 0 && (
          <>
            <div className="border-t border-neutral-200/60 mb-4" />
            <div className="mb-4">
              <h4 className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                Unaddressed
              </h4>
              <ul className="space-y-2">
                {summary.gaps.map((gap, i) => (
                  <li key={i} className="text-sm text-neutral-600 leading-relaxed pl-5 relative">
                    <span className="absolute left-0 top-1.5 w-1.5 h-1.5 rounded-full bg-amber-400" />
                    {gap}
                  </li>
                ))}
              </ul>
            </div>

            {/* Address Gaps button */}
            {onAddressGaps && (
              <button
                onClick={onAddressGaps}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl transition-colors"
              >
                <Sparkles className="w-4 h-4" />
                Address Gaps with AI
              </button>
            )}
          </>
        )}

        {/* All covered state */}
        {summary.gaps.length === 0 && (
          <div className="text-center py-2">
            <p className="text-sm text-emerald-600 font-medium">
              All jobs-to-be-done are addressed!
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
