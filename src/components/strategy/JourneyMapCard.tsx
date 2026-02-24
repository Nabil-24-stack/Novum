"use client";

import { useCallback, useState, type PointerEvent } from "react";
import { Footprints, Check } from "lucide-react";
import { useCanvasScale } from "@/components/canvas/InfiniteCanvas";
import type { JourneyMapData, JourneyStage } from "@/hooks/useStrategyStore";

export const JOURNEY_CARD_WIDTH = 900;

const PERSONA_ACCENT_COLORS = [
  { bg: "bg-blue-100", text: "text-blue-700" },
  { bg: "bg-violet-100", text: "text-violet-700" },
  { bg: "bg-emerald-100", text: "text-emerald-700" },
  { bg: "bg-amber-100", text: "text-amber-700" },
  { bg: "bg-rose-100", text: "text-rose-700" },
] as const;

// Column colors — each stage gets a distinct pastel tint
const STAGE_COLORS = [
  { header: "bg-blue-200/80 text-blue-900", cell: "bg-blue-50/70" },
  { header: "bg-teal-200/80 text-teal-900", cell: "bg-teal-50/70" },
  { header: "bg-violet-200/80 text-violet-900", cell: "bg-violet-50/70" },
  { header: "bg-amber-200/80 text-amber-900", cell: "bg-amber-50/70" },
  { header: "bg-rose-200/80 text-rose-900", cell: "bg-rose-50/70" },
  { header: "bg-cyan-200/80 text-cyan-900", cell: "bg-cyan-50/70" },
] as const;

// Row definitions — fixed categories rendered on the left
const ROW_DEFS = [
  { key: "actions", label: "Actions" },
  { key: "thoughts", label: "Thoughts" },
  { key: "emotion", label: "Emotions" },
  { key: "painPoints", label: "Pain Points" },
  { key: "opportunities", label: "Opportunities" },
] as const;

type RowKey = (typeof ROW_DEFS)[number]["key"];

function getEmotionEmoji(emotion: string): string {
  const lower = emotion.toLowerCase();
  if (lower.includes("happy") || lower.includes("delighted") || lower.includes("excited")) return "\u{1F60A}";
  if (lower.includes("hopeful") || lower.includes("optimistic") || lower.includes("curious")) return "\u{1F914}";
  if (lower.includes("satisfied") || lower.includes("relieved") || lower.includes("confident")) return "\u{1F60C}";
  if (lower.includes("frustrat") || lower.includes("angry") || lower.includes("annoyed")) return "\u{1F620}";
  if (lower.includes("overwhelm") || lower.includes("anxious") || lower.includes("stressed")) return "\u{1F630}";
  if (lower.includes("confused") || lower.includes("uncertain") || lower.includes("hesitant")) return "\u{1F615}";
  if (lower.includes("disappoint") || lower.includes("sad")) return "\u{1F61E}";
  if (lower.includes("neutral") || lower.includes("indifferent")) return "\u{1F610}";
  return "\u{1F642}";
}

function getEmotionStyle(emotion: string): string {
  const lower = emotion.toLowerCase();
  if (
    lower.includes("happy") || lower.includes("excited") || lower.includes("satisfied") ||
    lower.includes("relieved") || lower.includes("confident") || lower.includes("delighted")
  ) return "bg-emerald-100 text-emerald-700 border-emerald-200";
  if (
    lower.includes("frustrat") || lower.includes("angry") || lower.includes("annoyed") ||
    lower.includes("overwhelm") || lower.includes("anxious") || lower.includes("disappoint") ||
    lower.includes("stressed") || lower.includes("sad")
  ) return "bg-red-100 text-red-700 border-red-200";
  return "bg-amber-100 text-amber-700 border-amber-200";
}

function getCellContent(stage: Partial<JourneyStage>, rowKey: RowKey): React.ReactNode {
  switch (rowKey) {
    case "actions":
      return stage.actions?.map((item, i) => (
        <p key={i} className="text-[11px] text-neutral-700 leading-relaxed">{item}</p>
      ));
    case "thoughts":
      return stage.thoughts?.map((item, i) => (
        <p key={i} className="text-[11px] text-neutral-600 italic leading-relaxed">&ldquo;{item}&rdquo;</p>
      ));
    case "emotion":
      if (!stage.emotion) return null;
      return (
        <div className="flex flex-col items-center gap-1">
          <span className="text-xl">{getEmotionEmoji(stage.emotion)}</span>
          <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${getEmotionStyle(stage.emotion)}`}>
            {stage.emotion}
          </span>
        </div>
      );
    case "painPoints":
      return stage.painPoints?.map((item, i) => (
        <p key={i} className="text-[11px] text-neutral-700 leading-relaxed">{item}</p>
      ));
    case "opportunities":
      return stage.opportunities?.map((item, i) => (
        <p key={i} className="text-[11px] text-emerald-800 leading-relaxed">{item}</p>
      ));
    default:
      return null;
  }
}

interface JourneyMapCardProps {
  journeyMap: Partial<JourneyMapData>;
  x: number;
  y: number;
  onMove?: (x: number, y: number) => void;
  index: number;
  coveredStageIndices?: Set<number>;
}

export function JourneyMapCard({ journeyMap, x, y, onMove, index, coveredStageIndices }: JourneyMapCardProps) {
  const canvasScale = useCanvasScale();
  const [isDragging, setIsDragging] = useState(false);

  const accent = PERSONA_ACCENT_COLORS[index % PERSONA_ACCENT_COLORS.length];
  const stages = journeyMap.stages ?? [];
  const stageCount = stages.length;

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

  // Dynamic width: row-label column (100px) + stage columns (150px each min)
  const cardWidth = Math.max(JOURNEY_CARD_WIDTH, 100 + stageCount * 150 + 48);

  return (
    <div
      className={`absolute select-none ${
        isDragging ? "cursor-grabbing" : onMove ? "cursor-grab" : ""
      }`}
      style={{
        left: x,
        top: y,
        width: cardWidth,
        touchAction: onMove ? "none" : undefined,
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      <div className="bg-white/90 backdrop-blur-sm border border-neutral-200/60 shadow-lg rounded-2xl overflow-hidden">
        {/* Card header */}
        <div className="flex items-center gap-2 px-5 py-3 border-b border-neutral-200/60">
          <Footprints className="w-4 h-4 text-neutral-400 shrink-0" />
          <h3 className="text-sm font-semibold text-neutral-900">Journey Map</h3>
          {journeyMap.personaName && (
            <span className={`text-xs font-medium px-2.5 py-0.5 rounded-full ${accent.bg} ${accent.text}`}>
              {journeyMap.personaName}
            </span>
          )}
        </div>

        {/* Table body */}
        {stageCount > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse" style={{ minWidth: 100 + stageCount * 150 }}>
              {/* Stage header row */}
              <thead>
                <tr>
                  {/* Empty corner cell */}
                  <th className="w-[100px] min-w-[100px]" />
                  {stages.map((stage, colIdx) => {
                    const color = STAGE_COLORS[colIdx % STAGE_COLORS.length];
                    const isCovered = coveredStageIndices?.has(colIdx);
                    return (
                      <th
                        key={colIdx}
                        className={`px-3 py-2.5 text-center text-[11px] font-bold uppercase tracking-wider ${color.header} ${isCovered ? "border-b-2 border-emerald-400" : ""}`}
                      >
                        <span className="flex items-center justify-center gap-1">
                          {stage.stage ?? "..."}
                          {isCovered && <Check className="w-3 h-3 text-emerald-600 shrink-0" />}
                        </span>
                      </th>
                    );
                  })}
                </tr>
              </thead>

              <tbody>
                {ROW_DEFS.map((row) => (
                  <tr key={row.key}>
                    {/* Row label — fixed left column */}
                    <td className="px-4 py-3 text-xs font-semibold text-neutral-600 align-top bg-neutral-50/50 border-t border-neutral-100">
                      {row.label}
                    </td>

                    {/* Data cells — one per stage */}
                    {stages.map((stage, colIdx) => {
                      const color = STAGE_COLORS[colIdx % STAGE_COLORS.length];
                      const content = getCellContent(stage, row.key);
                      const isEmotion = row.key === "emotion";

                      return (
                        <td
                          key={colIdx}
                          className={`px-3 py-2.5 border-t border-neutral-100/80 ${color.cell} ${
                            isEmotion ? "text-center align-middle" : "align-top"
                          }`}
                        >
                          <div className={`space-y-1 ${isEmotion ? "flex justify-center" : ""}`}>
                            {content}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
