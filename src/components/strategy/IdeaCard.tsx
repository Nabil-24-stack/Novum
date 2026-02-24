"use client";

import { useCallback, useRef, useState, type PointerEvent } from "react";
import { Check } from "lucide-react";
import { useCanvasScale } from "@/components/canvas/InfiniteCanvas";
import type { IdeaData } from "@/hooks/useStrategyStore";

export const IDEA_CARD_WIDTH = 300;

const DRAG_THRESHOLD = 5;

const STICKY_COLORS = [
  { bg: "bg-yellow-100", border: "border-yellow-300" },
  { bg: "bg-pink-100", border: "border-pink-300" },
  { bg: "bg-sky-100", border: "border-sky-300" },
  { bg: "bg-lime-100", border: "border-lime-300" },
  { bg: "bg-violet-100", border: "border-violet-300" },
  { bg: "bg-orange-100", border: "border-orange-300" },
  { bg: "bg-teal-100", border: "border-teal-300" },
  { bg: "bg-rose-100", border: "border-rose-300" },
] as const;

interface IdeaCardProps {
  idea: Partial<IdeaData>;
  x: number;
  y: number;
  onMove?: (x: number, y: number) => void;
  index: number;
  isSelected?: boolean;
  onClick?: () => void;
}

export function IdeaCard({ idea, x, y, onMove, index, isSelected, onClick }: IdeaCardProps) {
  const canvasScale = useCanvasScale();
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  const hasDraggedRef = useRef(false);

  const color = STICKY_COLORS[index % STICKY_COLORS.length];

  const handlePointerDown = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      e.currentTarget.setPointerCapture(e.pointerId);
      dragStartRef.current = { x: e.clientX, y: e.clientY };
      hasDraggedRef.current = false;
      setIsDragging(true);
    },
    []
  );

  const handlePointerMove = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      if (!isDragging || !dragStartRef.current) return;

      if (!hasDraggedRef.current) {
        const dx = e.clientX - dragStartRef.current.x;
        const dy = e.clientY - dragStartRef.current.y;
        if (Math.abs(dx) < DRAG_THRESHOLD && Math.abs(dy) < DRAG_THRESHOLD) return;
        hasDraggedRef.current = true;
      }

      if (onMove) {
        onMove(x + e.movementX / canvasScale, y + e.movementY / canvasScale);
      }
    },
    [isDragging, onMove, x, y, canvasScale]
  );

  const handlePointerUp = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      e.currentTarget.releasePointerCapture(e.pointerId);
      setIsDragging(false);

      if (!hasDraggedRef.current && onClick) {
        onClick();
      }

      dragStartRef.current = null;
      hasDraggedRef.current = false;
    },
    [onClick]
  );

  return (
    <div
      className={`absolute select-none ${isDragging ? "cursor-grabbing" : "cursor-grab"}`}
      style={{
        left: x,
        top: y,
        width: IDEA_CARD_WIDTH,
        touchAction: "none",
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      <div
        className={`${color.bg} border ${color.border} rounded-xl shadow-md transition-shadow overflow-hidden ${
          isSelected ? "ring-2 ring-blue-500 shadow-xl" : "hover:shadow-lg"
        }`}
        style={{ position: "relative" }}
      >
        {/* Illustrations */}
        {idea.illustrations && idea.illustrations.length > 0 ? (
          <div className={`flex ${idea.illustrations.length > 1 ? "gap-1" : ""} bg-black/5 p-3`}>
            {idea.illustrations.map((svg, i) => (
              <div
                key={i}
                className="flex-1 [&>svg]:w-full [&>svg]:h-auto"
                dangerouslySetInnerHTML={{ __html: svg }}
              />
            ))}
          </div>
        ) : idea.title ? (
          <div className="bg-black/5 p-3 h-[72px] animate-pulse" />
        ) : null}

        <div className="p-5">
          {/* Selected checkmark */}
          {isSelected && (
            <div className="absolute top-3 right-3 w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center">
              <Check className="w-3.5 h-3.5 text-white" />
            </div>
          )}

          {/* Number badge */}
          <div className="w-7 h-7 rounded-full bg-black/10 flex items-center justify-center text-sm font-bold text-black/60 mb-3">
            {index + 1}
          </div>

        {/* Title */}
        {idea.title && (
          <h3 className="text-base font-bold text-neutral-900 mb-2 leading-tight pr-6">
            {idea.title}
          </h3>
        )}

        {/* Description */}
        {idea.description && (
          <p className="text-sm text-neutral-700 leading-relaxed mb-3">
            {idea.description}
          </p>
        )}

        {/* Key Features */}
        {idea.keyFeatures && idea.keyFeatures.length > 0 && (
          <div className="mb-3">
            <h4 className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-1.5">
              Key Features
            </h4>
            <ul className="space-y-1">
              {idea.keyFeatures.map((feature, i) => (
                <li key={i} className="text-sm text-neutral-700 pl-4 relative">
                  <span className="absolute left-0 top-1.5 w-1.5 h-1.5 rounded-full bg-neutral-400" />
                  {feature}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Pros */}
        {idea.pros && idea.pros.length > 0 && (
          <div className="mb-3">
            <h4 className="text-xs font-semibold text-emerald-600 uppercase tracking-wider mb-1.5">
              Pros
            </h4>
            <ul className="space-y-1">
              {idea.pros.map((pro, i) => (
                <li key={i} className="text-sm text-neutral-700 pl-4 relative">
                  <span className="absolute left-0 top-1.5 w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  {pro}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Cons */}
        {idea.cons && idea.cons.length > 0 && (
          <div>
            <h4 className="text-xs font-semibold text-amber-600 uppercase tracking-wider mb-1.5">
              Cons
            </h4>
            <ul className="space-y-1">
              {idea.cons.map((con, i) => (
                <li key={i} className="text-sm text-neutral-700 pl-4 relative">
                  <span className="absolute left-0 top-1.5 w-1.5 h-1.5 rounded-full bg-amber-400" />
                  {con}
                </li>
              ))}
            </ul>
          </div>
        )}
        </div>
      </div>
    </div>
  );
}
