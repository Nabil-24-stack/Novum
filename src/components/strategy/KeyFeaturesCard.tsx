"use client";

import { useCallback, useState, type PointerEvent } from "react";
import { useCanvasScale } from "@/components/canvas/InfiniteCanvas";
import type { KeyFeaturesData } from "@/hooks/useStrategyStore";

export const KEY_FEATURES_CARD_WIDTH = 400;

interface KeyFeaturesCardProps {
  data: Partial<KeyFeaturesData>;
  x: number;
  y: number;
  onMove?: (x: number, y: number) => void;
}

export function KeyFeaturesCard({ data, x, y, onMove }: KeyFeaturesCardProps) {
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

  const handlePointerUp = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      e.currentTarget.releasePointerCapture(e.pointerId);
      setIsDragging(false);
    },
    []
  );

  return (
    <div
      className={`absolute select-none ${isDragging ? "cursor-grabbing" : onMove ? "cursor-grab" : ""}`}
      style={{
        left: x,
        top: y,
        width: KEY_FEATURES_CARD_WIDTH,
        touchAction: onMove ? "none" : undefined,
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      <div className="bg-white border border-neutral-200 rounded-xl shadow-md overflow-hidden">
        {/* Header */}
        <div className="px-5 pt-5 pb-3 border-b border-neutral-100">
          <h3 className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-1">
            Key Features
          </h3>
          {data.ideaTitle && (
            <p className="text-sm font-bold text-neutral-900 leading-tight">
              {data.ideaTitle}
            </p>
          )}
        </div>

        {/* Features grouped by priority */}
        {data.features && data.features.length > 0 && (
          <div className="p-5 space-y-4">
            {(["high", "medium", "low"] as const).map((priority) => {
              const group = data.features!.filter((f) => f.priority === priority);
              if (group.length === 0) return null;
              const config = {
                high: { label: "High Priority", bg: "bg-red-50", text: "text-red-700", dot: "bg-red-400" },
                medium: { label: "Medium Priority", bg: "bg-amber-50", text: "text-amber-700", dot: "bg-amber-400" },
                low: { label: "Low Priority", bg: "bg-slate-50", text: "text-slate-600", dot: "bg-slate-400" },
              }[priority];
              return (
                <div key={priority}>
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`w-2 h-2 rounded-full ${config.dot}`} />
                    <span className={`text-xs font-semibold uppercase tracking-wider ${config.text}`}>
                      {config.label}
                    </span>
                  </div>
                  <div className="space-y-2 ml-4">
                    {group.map((feature, i) => (
                      <div key={i} className="min-w-0">
                        <p className="text-sm font-semibold text-neutral-900 leading-tight">
                          {feature.name}
                        </p>
                        {feature.description && (
                          <p className="text-sm text-neutral-600 leading-relaxed mt-0.5">
                            {feature.description}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
            {/* Fallback for features without priority (streaming/legacy) */}
            {data.features && data.features.some((f) => !f.priority) && (
              <div className="space-y-2">
                {data.features.filter((f) => !f.priority).map((feature, i) => (
                  <div key={i} className="flex gap-3">
                    <div className="w-6 h-6 rounded-full bg-neutral-100 flex items-center justify-center text-xs font-bold text-neutral-500 shrink-0 mt-0.5">
                      {i + 1}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-neutral-900 leading-tight">
                        {feature.name}
                      </p>
                      {feature.description && (
                        <p className="text-sm text-neutral-600 leading-relaxed mt-0.5">
                          {feature.description}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
