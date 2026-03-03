"use client";

import { useCallback, useState, useMemo, useEffect, useRef, type PointerEvent } from "react";
import { FileText, Zap, GitBranch, Database } from "lucide-react";
import { useCanvasScale } from "@/components/canvas/InfiniteCanvas";
import type { UserFlow, FlowData, PersonaData, StrategyNode } from "@/hooks/useStrategyStore";

// Persona accent colors — matches PersonaCard.tsx order
const ACCENT_COLORS = [
  { bg: "bg-blue-100", text: "text-blue-700", stroke: "#3b82f6" },
  { bg: "bg-violet-100", text: "text-violet-700", stroke: "#8b5cf6" },
  { bg: "bg-emerald-100", text: "text-emerald-700", stroke: "#10b981" },
  { bg: "bg-amber-100", text: "text-amber-700", stroke: "#f59e0b" },
  { bg: "bg-rose-100", text: "text-rose-700", stroke: "#f43f5e" },
] as const;

// Node type styles — matches StrategyFlowNode.tsx
const TYPE_STYLES: Record<StrategyNode["type"], { bg: string; border: string; iconColor: string }> = {
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

// Layout constants
const NODE_W = 140;
const NODE_H = 56;
const GAP = 60;
const PADDING_X = 24;
const PADDING_TOP = 100; // space for header
const PADDING_BOTTOM = 40;
const ACTION_HEIGHT = 28;

export const USER_FLOW_CARD_WIDTH = 700;
export const USER_FLOW_CARD_HEIGHT = 280;

// Delay between each node appearing (ms) — matches StrategyFlowCanvas
const NODE_REVEAL_INTERVAL = 180;

interface UserFlowCardProps {
  flow: Partial<UserFlow>;
  flowData: FlowData | null;
  personas: PersonaData[] | null;
  x: number;
  y: number;
  onMove?: (x: number, y: number) => void;
}

function getPersonaColorIndex(personaName: string, personas: PersonaData[] | null): number {
  if (!personas) return 0;
  const idx = personas.findIndex((p) => p.name === personaName);
  return idx >= 0 ? idx % ACCENT_COLORS.length : 0;
}

export function UserFlowCard({ flow, flowData, personas, x, y, onMove }: UserFlowCardProps) {
  const canvasScale = useCanvasScale();
  const [isDragging, setIsDragging] = useState(false);

  const steps = useMemo(() => flow.steps ?? [], [flow.steps]);
  const personaNames = useMemo(() => flow.personaNames ?? [], [flow.personaNames]);

  // Progressive node reveal animation
  const [visibleCount, setVisibleCount] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    setVisibleCount(0);

    if (steps.length === 0) return;

    const startDelay = setTimeout(() => {
      setVisibleCount(1);

      timerRef.current = setInterval(() => {
        setVisibleCount((prev) => {
          const next = prev + 1;
          if (next >= steps.length) {
            if (timerRef.current) clearInterval(timerRef.current);
          }
          return next;
        });
      }, NODE_REVEAL_INTERVAL);
    }, 100);

    return () => {
      clearTimeout(startDelay);
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [steps.length]);

  // Compute dynamic card width
  const cardWidth = useMemo(
    () => Math.max(USER_FLOW_CARD_WIDTH, steps.length * (NODE_W + GAP) - GAP + PADDING_X * 2),
    [steps.length]
  );

  // Resolve persona colors
  const personaColors = useMemo(
    () => personaNames.map((name) => {
      const idx = getPersonaColorIndex(name, personas);
      return ACCENT_COLORS[idx];
    }),
    [personaNames, personas]
  );

  // Primary stroke color (or gradient ID for multi-persona)
  const gradientId = `uf-grad-${flow.id ?? "tmp"}`;
  const useGradient = personaColors.length > 1;
  const strokeColor = personaColors[0]?.stroke ?? "#3b82f6";

  // Drag handlers
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

  // Compute node positions
  const nodePositions = useMemo(() =>
    steps.map((_, i) => ({
      x: PADDING_X + i * (NODE_W + GAP),
      y: PADDING_TOP,
    })),
    [steps]
  );

  // Resolve IA nodes for each step
  const resolvedNodes = useMemo(() =>
    steps.map((step) => flowData?.nodes.find((n) => n.id === step.nodeId)),
    [steps, flowData]
  );

  const svgWidth = cardWidth;
  const svgHeight = USER_FLOW_CARD_HEIGHT;

  return (
    <div
      className={`absolute select-none ${isDragging ? "cursor-grabbing" : onMove ? "cursor-grab" : ""}`}
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
      <style>{`
        @keyframes userFlowNodeReveal {
          from { opacity: 0; transform: scale(0.85) translateY(8px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>
      <div className="bg-white/90 backdrop-blur-sm border border-neutral-200/60 shadow-lg rounded-2xl overflow-hidden">
        {/* Header: JTBD + persona badges */}
        <div className="px-5 pt-4 pb-3">
          {flow.jtbdText && (
            <p className="text-xs text-neutral-500 leading-relaxed italic line-clamp-2">
              &ldquo;{flow.jtbdText}&rdquo;
            </p>
          )}
          {personaNames.length > 0 && (
            <div className="flex items-center gap-1.5 mt-2 flex-wrap">
              {personaNames.map((name, i) => {
                const color = personaColors[i];
                return (
                  <span
                    key={name}
                    className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${color.bg} ${color.text}`}
                  >
                    {name}
                  </span>
                );
              })}
            </div>
          )}
        </div>

        {/* Flow diagram */}
        <div className="relative" style={{ height: svgHeight - PADDING_TOP + PADDING_BOTTOM }}>
          <svg
            width={svgWidth}
            height={svgHeight - PADDING_TOP + PADDING_BOTTOM}
            className="absolute inset-0"
          >
            {/* Gradient definition for multi-persona */}
            {useGradient && (
              <defs>
                <linearGradient
                  id={gradientId}
                  gradientUnits="userSpaceOnUse"
                  x1={nodePositions[0]?.x ?? 0}
                  y1={NODE_H / 2}
                  x2={(nodePositions[nodePositions.length - 1]?.x ?? 0) + NODE_W}
                  y2={NODE_H / 2}
                >
                  {personaColors.map((color, i) => {
                    const segmentSize = 1 / personaColors.length;
                    return [
                      <stop
                        key={`${i}-start`}
                        offset={`${i * segmentSize * 100}%`}
                        stopColor={color.stroke}
                      />,
                      <stop
                        key={`${i}-end`}
                        offset={`${(i + 1) * segmentSize * 100}%`}
                        stopColor={color.stroke}
                      />,
                    ];
                  }).flat()}
                </linearGradient>
              </defs>
            )}

            {/* Connection lines between nodes */}
            {nodePositions.map((pos, i) => {
              if (i === 0) return null;
              if (i >= visibleCount) return null;
              const prev = nodePositions[i - 1];
              const x1 = prev.x + NODE_W;
              const y1 = NODE_H / 2;
              const x2 = pos.x;
              const y2 = NODE_H / 2;

              return (
                <g key={`conn-${i}`}>
                  <line
                    x1={x1}
                    y1={y1}
                    x2={x2}
                    y2={y2}
                    stroke={useGradient ? `url(#${gradientId})` : strokeColor}
                    strokeWidth={2.5}
                    strokeLinecap="round"
                  />
                  {/* Arrowhead */}
                  <polygon
                    points={`${x2 - 6},${y2 - 4} ${x2},${y2} ${x2 - 6},${y2 + 4}`}
                    fill={useGradient ? personaColors[Math.floor(i / steps.length * personaColors.length)]?.stroke ?? strokeColor : strokeColor}
                  />
                </g>
              );
            })}
          </svg>

          {/* Nodes + action annotations */}
          {steps.map((step, i) => {
            if (i >= visibleCount) return null;

            const pos = nodePositions[i];
            const node = resolvedNodes[i];
            const nodeType = node?.type ?? "page";
            const style = TYPE_STYLES[nodeType];
            const Icon = TYPE_ICONS[nodeType];
            const label = node?.label ?? step.nodeId;

            return (
              <div
                key={`${step.nodeId}-${i}`}
                className="absolute"
                style={{
                  left: pos.x,
                  top: 0,
                  width: NODE_W,
                  animation: "userFlowNodeReveal 0.3s ease-out both",
                }}
              >
                {/* Node box */}
                <div
                  className={`${style.bg} border ${style.border} rounded-lg flex flex-col items-center justify-center px-2 py-2`}
                  style={{ height: NODE_H }}
                >
                  <div className="flex items-center gap-1.5">
                    <Icon className={`w-3.5 h-3.5 ${style.iconColor} shrink-0`} />
                    <span className="text-xs font-semibold text-neutral-800 truncate max-w-[100px]">
                      {label}
                    </span>
                  </div>
                </div>
                {/* Action annotation */}
                <p
                  className="text-[10px] text-neutral-500 text-center mt-1.5 leading-tight line-clamp-2 px-1"
                  style={{ minHeight: ACTION_HEIGHT }}
                >
                  {step.action}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
