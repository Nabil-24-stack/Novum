"use client";

import { useCallback, useState, type PointerEvent } from "react";
import { CheckCircle2, Circle, ShieldCheck, AlertTriangle, Sparkles } from "lucide-react";
import { useCanvasScale } from "@/components/canvas/InfiniteCanvas";
import type { ManifestoData } from "@/hooks/useStrategyStore";
import type { JtbdCoverage, CoverageSummary } from "@/lib/product-brain/types";

interface ManifestoCardProps {
  manifestoData: Partial<ManifestoData>;
  x: number;
  y: number;
  onMove?: (x: number, y: number) => void;
  jtbdCoverage?: JtbdCoverage[];
  coverageSummary?: CoverageSummary | null;
  onAddressGaps?: () => void;
}

export function ManifestoCard({ manifestoData, x, y, onMove, jtbdCoverage, coverageSummary, onAddressGaps }: ManifestoCardProps) {
  const canvasScale = useCanvasScale();
  const [isDragging, setIsDragging] = useState(false);

  const hasTitle = manifestoData.title !== undefined;
  const hasProblem = manifestoData.problemStatement !== undefined;
  const hasUser = manifestoData.targetUser !== undefined;
  const hasJtbd = manifestoData.jtbd !== undefined && manifestoData.jtbd.length > 0;
  const hasHmw = manifestoData.hmw !== undefined && manifestoData.hmw.length > 0;

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
  }, [isDragging, onMove, x, y, canvasScale]);

  const handlePointerUp = useCallback((e: PointerEvent<HTMLDivElement>) => {
    e.currentTarget.releasePointerCapture(e.pointerId);
    setIsDragging(false);
  }, []);

  return (
    <div
      className={`absolute select-none ${
        isDragging ? "cursor-grabbing" : onMove ? "cursor-grab" : ""
      }`}
      style={{
        left: x,
        top: y,
        width: 600,
        touchAction: onMove ? "none" : undefined,
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      <div className="bg-white/90 backdrop-blur-sm border border-neutral-200/60 shadow-lg rounded-2xl p-8">
        {/* Title */}
        <h2 className="text-2xl font-bold text-neutral-900 mb-6">
          Overview
        </h2>

        {/* The Problem */}
        {hasProblem && (
          <>
            <h3 className="text-sm font-semibold text-neutral-500 uppercase tracking-wider mb-2">
              The Problem
            </h3>
            <p className="text-base text-neutral-600 leading-relaxed mb-6">
              {manifestoData.problemStatement}
            </p>
          </>
        )}

        {/* Divider between Problem and Who Will Use This */}
        {hasProblem && hasUser && (
          <div className="border-t border-neutral-200/60 mb-5" />
        )}

        {/* Who Will Use This */}
        {hasUser && (
          <>
            <h3 className="text-sm font-semibold text-neutral-500 uppercase tracking-wider mb-2">
              Who Will Use This
            </h3>
            <p className="text-base text-neutral-700 leading-relaxed mb-6">
              {manifestoData.targetUser}
            </p>
          </>
        )}

        {/* Divider between Who Will Use This and JTBD */}
        {hasUser && hasJtbd && (
          <div className="border-t border-neutral-200/60 mb-5" />
        )}

        {/* What [Users] Need To Get Done */}
        {hasJtbd && (
          <>
            <h3 className="text-sm font-semibold text-neutral-500 uppercase tracking-wider mb-3">
              What {manifestoData.targetUser || "Users"} Need To Get Done
            </h3>
            <ol className="space-y-3">
              {manifestoData.jtbd!.map((job, index) => {
                const isAddressed = jtbdCoverage?.[index]?.addressed;
                return (
                  <li
                    key={index}
                    className="flex items-start gap-3"
                  >
                    {isAddressed ? (
                      <CheckCircle2 className="w-5 h-5 text-emerald-500 fill-emerald-500 mt-0.5 shrink-0 transition-colors duration-500" />
                    ) : (
                      <Circle className={`w-5 h-5 mt-0.5 shrink-0 ${jtbdCoverage ? "text-neutral-300" : "text-emerald-500"}`} />
                    )}
                    <span className={`text-base leading-relaxed transition-colors duration-500 ${isAddressed ? "text-neutral-400 line-through decoration-neutral-300" : "text-neutral-700"}`}>
                      {job}
                    </span>
                  </li>
                );
              })}
            </ol>
          </>
        )}

        {/* Divider before How Might We */}
        {(hasJtbd || hasUser) && hasHmw && (
          <div className="border-t border-neutral-200/60 mt-6 mb-5" />
        )}

        {/* How Might We */}
        {hasHmw && (
          <>
            <h3 className="text-sm font-semibold text-neutral-500 uppercase tracking-wider mb-3">
              How Might We
            </h3>
            <ol className="space-y-3">
              {manifestoData.hmw!.map((question, index) => (
                <li
                  key={index}
                  className="flex items-start gap-3"
                >
                  <span className="text-sm font-semibold text-amber-500 mt-0.5 shrink-0 w-5 text-center">
                    {index + 1}
                  </span>
                  <span className="text-base text-neutral-700 leading-relaxed italic">
                    {question}
                  </span>
                </li>
              ))}
            </ol>
          </>
        )}

        {/* Strategy Coverage Section — only shown once all manifesto fields are populated */}
        {hasTitle && hasProblem && hasUser && hasJtbd && hasHmw && (
          <>
            <div className="border-t border-neutral-200/60 mt-6 mb-5" />

            <div className="flex items-center gap-2.5 mb-5">
              <ShieldCheck className="w-5 h-5 text-emerald-500 shrink-0" />
              <h3 className="text-sm font-semibold text-neutral-500 uppercase tracking-wider">
                Strategy Coverage
              </h3>
            </div>

            {coverageSummary ? (
              <>
                <div className="text-center mb-5">
                  <span className={`text-5xl font-bold ${
                    coverageSummary.overallPercent >= 80
                      ? "text-emerald-600"
                      : coverageSummary.overallPercent >= 50
                        ? "text-amber-600"
                        : "text-neutral-400"
                  }`}>
                    {coverageSummary.overallPercent}%
                  </span>
                  <p className="text-sm text-neutral-500 mt-1">
                    of jobs-to-be-done addressed
                  </p>
                </div>

                {coverageSummary.personaCoverage.length > 0 && (
                  <div className="mb-5">
                    <h4 className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-3">
                      Per Persona
                    </h4>
                    <div className="space-y-3">
                      {coverageSummary.personaCoverage.map((persona) => (
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

                {coverageSummary.gaps.length > 0 && (
                  <>
                    <div className="border-t border-neutral-200/60 mb-4" />
                    <div className="mb-4">
                      <h4 className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                        Unaddressed
                      </h4>
                      <ul className="space-y-2">
                        {coverageSummary.gaps.map((gap, i) => (
                          <li key={i} className="text-sm text-neutral-600 leading-relaxed pl-5 relative">
                            <span className="absolute left-0 top-1.5 w-1.5 h-1.5 rounded-full bg-amber-400" />
                            {gap}
                          </li>
                        ))}
                      </ul>
                    </div>

                    {onAddressGaps && (
                      <button
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={onAddressGaps}
                        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl transition-colors"
                      >
                        <Sparkles className="w-4 h-4" />
                        Address Gaps with AI
                      </button>
                    )}
                  </>
                )}

                {coverageSummary.gaps.length === 0 && (
                  <div className="text-center py-2">
                    <p className="text-sm text-emerald-600 font-medium">
                      All jobs-to-be-done are addressed!
                    </p>
                  </div>
                )}
              </>
            ) : (
              <div className="text-center py-3">
                <span className="text-2xl font-semibold text-neutral-300">Pending</span>
                <p className="text-sm text-neutral-400 mt-1">
                  Coverage will update as pages are built
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
