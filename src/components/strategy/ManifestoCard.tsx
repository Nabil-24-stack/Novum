"use client";

import { useCallback, useState, type PointerEvent } from "react";
import { CheckCircle2 } from "lucide-react";
import { useCanvasScale } from "@/components/canvas/InfiniteCanvas";
import type { ManifestoData } from "@/hooks/useStrategyStore";

interface ManifestoCardProps {
  manifestoData: Partial<ManifestoData>;
  x: number;
  y: number;
  onMove?: (x: number, y: number) => void;
}

export function ManifestoCard({ manifestoData, x, y, onMove }: ManifestoCardProps) {
  const canvasScale = useCanvasScale();
  const [isDragging, setIsDragging] = useState(false);

  const hasTitle = manifestoData.title !== undefined;
  const hasProblem = manifestoData.problemStatement !== undefined;
  const hasUser = manifestoData.targetUser !== undefined;
  const hasJtbd = manifestoData.jtbd !== undefined && manifestoData.jtbd.length > 0;
  const hasSolution = manifestoData.solution !== undefined;

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
        {hasTitle && (
          <h2 className="text-2xl font-bold text-neutral-900 mb-6">
            {manifestoData.title}
          </h2>
        )}

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
              {manifestoData.jtbd!.map((job, index) => (
                <li
                  key={index}
                  className="flex items-start gap-3"
                >
                  <CheckCircle2 className="w-5 h-5 text-emerald-500 mt-0.5 shrink-0" />
                  <span className="text-base text-neutral-700 leading-relaxed">
                    {job}
                  </span>
                </li>
              ))}
            </ol>
          </>
        )}

        {/* Divider before Solution */}
        {(hasJtbd || hasUser) && hasSolution && (
          <div className="border-t border-neutral-200/60 mt-6 mb-5" />
        )}

        {/* The Solution */}
        {hasSolution && (
          <>
            <h3 className="text-sm font-semibold text-neutral-500 uppercase tracking-wider mb-2">
              The Solution
            </h3>
            <p className="text-base text-neutral-700 leading-relaxed">
              {manifestoData.solution}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
