"use client";

import { useCallback, useState, type PointerEvent } from "react";
import { Target, AlertTriangle, Quote } from "lucide-react";
import { useCanvasScale } from "@/components/canvas/InfiniteCanvas";
import type { PersonaData } from "@/hooks/useStrategyStore";

const ACCENT_COLORS = [
  { bg: "bg-blue-100", text: "text-blue-700", border: "border-blue-200" },
  { bg: "bg-violet-100", text: "text-violet-700", border: "border-violet-200" },
] as const;

interface PersonaCardProps {
  persona: Partial<PersonaData>;
  x: number;
  y: number;
  onMove?: (x: number, y: number) => void;
  index: number; // 0 or 1, for color theming
}

export function PersonaCard({ persona, x, y, onMove, index }: PersonaCardProps) {
  const canvasScale = useCanvasScale();
  const [isDragging, setIsDragging] = useState(false);

  const accent = ACCENT_COLORS[index] ?? ACCENT_COLORS[0];

  const hasName = persona.name !== undefined;
  const hasRole = persona.role !== undefined;
  const hasBio = persona.bio !== undefined;
  const hasGoals = persona.goals !== undefined && persona.goals.length > 0;
  const hasPainPoints = persona.painPoints !== undefined && persona.painPoints.length > 0;
  const hasQuote = persona.quote !== undefined;

  // Generate initials from name
  const initials = persona.name
    ? persona.name
        .split(" ")
        .map((w) => w[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : "?";

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

  return (
    <div
      className={`absolute select-none ${
        isDragging ? "cursor-grabbing" : onMove ? "cursor-grab" : ""
      }`}
      style={{
        left: x,
        top: y,
        width: 320,
        touchAction: onMove ? "none" : undefined,
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      <div className="bg-white/90 backdrop-blur-sm border border-neutral-200/60 shadow-lg rounded-2xl p-6">
        {/* Header: initials circle + name + role */}
        {(hasName || hasRole) && (
          <div className="flex items-center gap-3 mb-4">
            <div
              className={`w-10 h-10 rounded-full ${accent.bg} ${accent.text} flex items-center justify-center text-sm font-bold shrink-0`}
            >
              {initials}
            </div>
            <div className="min-w-0">
              {hasName && (
                <p className="text-base font-semibold text-neutral-900 truncate">
                  {persona.name}
                </p>
              )}
              {hasRole && (
                <p className="text-sm text-neutral-500 truncate">{persona.role}</p>
              )}
            </div>
          </div>
        )}

        {/* Bio */}
        {hasBio && (
          <p className="text-sm text-neutral-600 leading-relaxed mb-4">
            {persona.bio}
          </p>
        )}

        {/* Divider before goals */}
        {hasBio && hasGoals && (
          <div className="border-t border-neutral-200/60 mb-4" />
        )}

        {/* Goals */}
        {hasGoals && (
          <div className="mb-4">
            <div className="flex items-center gap-1.5 mb-2">
              <Target className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
              <h4 className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">
                Goals
              </h4>
            </div>
            <ul className="space-y-1.5">
              {persona.goals!.map((goal, i) => (
                <li key={i} className="text-sm text-neutral-700 leading-relaxed pl-5 relative">
                  <span className="absolute left-0 top-1.5 w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  {goal}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Pain Points */}
        {hasPainPoints && (
          <div className="mb-4">
            <div className="flex items-center gap-1.5 mb-2">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
              <h4 className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">
                Pain Points
              </h4>
            </div>
            <ul className="space-y-1.5">
              {persona.painPoints!.map((pain, i) => (
                <li key={i} className="text-sm text-neutral-700 leading-relaxed pl-5 relative">
                  <span className="absolute left-0 top-1.5 w-1.5 h-1.5 rounded-full bg-amber-400" />
                  {pain}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Quote */}
        {hasQuote && (
          <>
            {(hasGoals || hasPainPoints) && (
              <div className="border-t border-neutral-200/60 mb-4" />
            )}
            <div className={`border-l-2 ${accent.border} pl-3`}>
              <Quote className="w-3.5 h-3.5 text-neutral-400 mb-1" />
              <p className="text-sm text-neutral-600 italic leading-relaxed">
                &ldquo;{persona.quote}&rdquo;
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
