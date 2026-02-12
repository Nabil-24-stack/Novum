"use client";

import { useEffect, useState, useCallback, type PointerEvent } from "react";
import { FileText, Zap, GitBranch, Database } from "lucide-react";
import { useCanvasScale } from "@/components/canvas/InfiniteCanvas";
import type { StrategyNode } from "@/hooks/useStrategyStore";

interface StrategyFlowNodeProps {
  node: StrategyNode;
  position: { x: number; y: number; width: number; height: number };
  index?: number;
  onMove?: (id: string, x: number, y: number) => void;
}

const TYPE_STYLES: Record<
  StrategyNode["type"],
  { bg: string; border: string; iconColor: string }
> = {
  page: { bg: "bg-blue-50", border: "border-blue-300", iconColor: "text-blue-500" },
  action: { bg: "bg-emerald-50", border: "border-emerald-300", iconColor: "text-emerald-500" },
  decision: { bg: "bg-amber-50", border: "border-amber-300", iconColor: "text-amber-500" },
  data: { bg: "bg-violet-50", border: "border-violet-300", iconColor: "text-violet-500" },
};

const TYPE_ICONS: Record<StrategyNode["type"], typeof FileText> = {
  page: FileText,
  action: Zap,
  decision: GitBranch,
  data: Database,
};

export function StrategyFlowNode({ node, position, onMove }: StrategyFlowNodeProps) {
  const canvasScale = useCanvasScale();
  const [visible, setVisible] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const style = TYPE_STYLES[node.type];
  const Icon = TYPE_ICONS[node.type];

  // Trigger entrance animation on mount
  useEffect(() => {
    const raf = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  const handlePointerDown = useCallback((e: PointerEvent<HTMLDivElement>) => {
    if (!onMove) return;
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    setIsDragging(true);
  }, [onMove]);

  const handlePointerMove = useCallback((e: PointerEvent<HTMLDivElement>) => {
    if (!isDragging || !onMove) return;
    onMove(
      node.id,
      position.x + e.movementX / canvasScale,
      position.y + e.movementY / canvasScale,
    );
  }, [isDragging, onMove, node.id, position.x, position.y, canvasScale]);

  const handlePointerUp = useCallback((e: PointerEvent<HTMLDivElement>) => {
    e.currentTarget.releasePointerCapture(e.pointerId);
    setIsDragging(false);
  }, []);

  return (
    <div
      className={`absolute ${style.bg} border ${style.border} rounded-xl flex flex-col items-center justify-center px-4 py-3 shadow-sm select-none ${
        isDragging ? "cursor-grabbing shadow-md z-10" : onMove ? "cursor-grab" : ""
      }`}
      style={{
        left: position.x,
        top: position.y,
        width: position.width,
        height: position.height,
        opacity: visible ? 1 : 0,
        transform: visible ? "scale(1) translateY(0)" : "scale(0.85) translateY(8px)",
        transition: isDragging ? "none" : "opacity 0.3s ease-out, transform 0.3s ease-out",
        touchAction: "none",
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      <div className="flex items-center gap-2 mb-1">
        <Icon className={`w-4 h-4 ${style.iconColor}`} />
        <span className="text-sm font-semibold text-neutral-800 truncate max-w-[160px]">
          {node.label}
        </span>
      </div>
      {node.description && (
        <span className="text-xs text-neutral-500 text-center line-clamp-2 leading-tight">
          {node.description}
        </span>
      )}
    </div>
  );
}
