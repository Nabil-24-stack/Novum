"use client";

import { useState, useCallback, useRef, type PointerEvent } from "react";
import { useCanvasScale } from "@/components/canvas/InfiniteCanvas";
import type { DecisionConnection } from "@/lib/product-brain/types";
import type { FlowNodePosition } from "@/lib/flow/types";
import type { ManifestoData, PersonaData } from "@/hooks/useStrategyStore";
import type { InsightsCardData } from "@/hooks/useDocumentStore";
import type { AnnotationElementBounds } from "@/hooks/useAnnotationStore";
import { getTraceableTexts } from "@/lib/strategy/traceable";

interface StrategyAnnotationsProps {
  pageId: string;
  position: FlowNodePosition;
  connections: DecisionConnection[];
  bounds: Map<string, AnnotationElementBounds>;
  manifestoData: ManifestoData;
  personaData: PersonaData[];
  insightsData: InsightsCardData | null;
  isFrameActive?: boolean;
}

const CARD_WIDTH = 280;
const FRAME_GAP = 24;
const HEADER_HEIGHT = 36;
const DOT_RADIUS = 3.5;

const PERSONA_ACCENT_COLORS = [
  { bg: "bg-blue-100", text: "text-blue-700", hex: "#1d4ed8" },
  { bg: "bg-violet-100", text: "text-violet-700", hex: "#6d28d9" },
  { bg: "bg-emerald-100", text: "text-emerald-700", hex: "#047857" },
  { bg: "bg-amber-100", text: "text-amber-700", hex: "#b45309" },
  { bg: "bg-rose-100", text: "text-rose-700", hex: "#be123c" },
] as const;

type Side = "left" | "right";

/** Offset from default position, keyed by connection ID */
type DragOffsets = Map<string, { dx: number; dy: number }>;

export function StrategyAnnotations({
  position,
  connections,
  bounds,
  manifestoData,
  personaData,
  insightsData,
  isFrameActive,
}: StrategyAnnotationsProps) {
  const canvasScale = useCanvasScale();
  const [dragOffsets, setDragOffsets] = useState<DragOffsets>(new Map());
  const draggingRef = useRef<string | null>(null);

  if (connections.length === 0) return null;

  const svgZ = isFrameActive ? 15 : 5;
  const cardZ = isFrameActive ? 16 : 6;

  const frameMidX = position.x + position.width / 2;
  const frameContentTop = position.y + HEADER_HEIGHT;
  const frameContentBottom = position.y + HEADER_HEIGHT + position.height;

  // Build card data with horizontal alignment to target element
  const cards = connections.map((conn) => {
    const b = bounds.get(conn.id);
    const jtbdTexts = getTraceableTexts(manifestoData.jtbd);
    const jtbdText = conn.jtbdIndices[0] != null ? jtbdTexts[conn.jtbdIndices[0]] : null;
    const persona = personaData.find((p) => conn.personaNames.includes(p.name));
    const personaIndex = persona ? personaData.indexOf(persona) : -1;
    const insight =
      conn.insightIndices?.[0] != null && insightsData
        ? insightsData.insights[conn.insightIndices[0]]
        : null;

    let targetX: number;
    let targetY: number;
    let connectorOpacity = 1;
    let isBelowFold = b?.isBelowFold ?? false;
    const hasBounds = !!b?.iframeRect;

    if (b?.iframeRect && !b.isBelowFold) {
      const scaleX = position.width / b.iframeWidth;
      const scaleY = position.height / b.iframeHeight;
      targetX = position.x + b.iframeRect.x * scaleX + (b.iframeRect.width * scaleX) / 2;
      targetY = frameContentTop + b.iframeRect.y * scaleY + (b.iframeRect.height * scaleY) / 2;
      targetY = Math.max(frameContentTop, Math.min(frameContentBottom, targetY));
    } else {
      targetX = frameMidX;
      targetY = frameContentBottom;
      connectorOpacity = 0.4;
      isBelowFold = true;
    }

    const side: Side = targetX < frameMidX ? "left" : "right";
    const lineColor = personaIndex >= 0
      ? PERSONA_ACCENT_COLORS[personaIndex % PERSONA_ACCENT_COLORS.length].hex
      : "#94a3b8";

    // Default card position: horizontally aligned with target element
    const defaultCardX =
      side === "right"
        ? position.x + position.width + FRAME_GAP
        : position.x - FRAME_GAP - CARD_WIDTH;
    const defaultCardY = targetY - 20; // offset so connector hits ~top area of card

    // Apply drag offset
    const offset = dragOffsets.get(conn.id);
    const cardX = defaultCardX + (offset?.dx ?? 0);
    const cardY = defaultCardY + (offset?.dy ?? 0);

    return { conn, jtbdText, persona, personaIndex, insight, targetX, targetY, connectorOpacity, isBelowFold, hasBounds, side, cardX, cardY, lineColor };
  });

  // SVG bounds
  const allXs = cards.flatMap((c) => [c.targetX, c.cardX, c.cardX + CARD_WIDTH]);
  const allYs = cards.flatMap((c) => [c.cardY, c.targetY]);
  const svgLeft = Math.min(...allXs) - DOT_RADIUS - 2;
  const svgRight = Math.max(...allXs) + DOT_RADIUS + 2;
  const svgTop = Math.min(...allYs) - DOT_RADIUS - 2;
  const svgBottom = Math.max(...allYs) + DOT_RADIUS + 22;

  return (
    <>
      {/* Connector lines SVG */}
      <svg
        className="absolute pointer-events-none"
        style={{
          left: svgLeft,
          top: svgTop,
          width: svgRight - svgLeft,
          height: svgBottom - svgTop,
          overflow: "visible",
          zIndex: svgZ,
        }}
      >
        {cards.map((card) => {
          const cardEdgeX = (card.side === "right" ? card.cardX : card.cardX + CARD_WIDTH) - svgLeft;
          const cardCenterY = card.cardY + 20 - svgTop;
          const elemX = card.targetX - svgLeft;
          const elemY = card.targetY - svgTop;

          return (
            <g key={card.conn.id} opacity={card.connectorOpacity}>
              <line
                x1={elemX}
                y1={elemY}
                x2={cardEdgeX}
                y2={cardCenterY}
                stroke={card.lineColor}
                strokeWidth={1.5}
                strokeDasharray="4 3"
              />
              <circle
                cx={elemX}
                cy={elemY}
                r={DOT_RADIUS}
                fill={card.lineColor}
              />
            </g>
          );
        })}
      </svg>

      {/* Annotation cards — draggable */}
      {cards.map((card) => (
        <AnnotationCard
          key={card.conn.id}
          card={card}
          cardZ={cardZ}
          canvasScale={canvasScale}
          draggingRef={draggingRef}
          onDragMove={(connId, dx, dy) => {
            setDragOffsets((prev) => {
              const next = new Map(prev);
              const cur = next.get(connId) ?? { dx: 0, dy: 0 };
              next.set(connId, { dx: cur.dx + dx, dy: cur.dy + dy });
              return next;
            });
          }}
        />
      ))}
    </>
  );
}

// --- Individual card component (handles its own drag) ---

interface CardData {
  conn: DecisionConnection;
  jtbdText: string | null;
  persona: PersonaData | undefined;
  personaIndex: number;
  insight: { insight: string; quote?: string; sourceDocument?: string; source?: string } | undefined | null;
  isBelowFold: boolean;
  hasBounds: boolean;
  cardX: number;
  cardY: number;
}

interface AnnotationCardProps {
  card: CardData;
  cardZ: number;
  canvasScale: number;
  draggingRef: React.MutableRefObject<string | null>;
  onDragMove: (connId: string, dx: number, dy: number) => void;
}

function AnnotationCard({ card, cardZ, canvasScale, draggingRef, onDragMove }: AnnotationCardProps) {
  const [isDragging, setIsDragging] = useState(false);

  const handlePointerDown = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      e.currentTarget.setPointerCapture(e.pointerId);
      draggingRef.current = card.conn.id;
      setIsDragging(true);
    },
    [card.conn.id, draggingRef]
  );

  const handlePointerMove = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      if (draggingRef.current !== card.conn.id) return;
      onDragMove(card.conn.id, e.movementX / canvasScale, e.movementY / canvasScale);
    },
    [card.conn.id, canvasScale, draggingRef, onDragMove]
  );

  const handlePointerUp = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      e.currentTarget.releasePointerCapture(e.pointerId);
      draggingRef.current = null;
      setIsDragging(false);
    },
    [draggingRef]
  );

  const accent =
    card.personaIndex >= 0
      ? PERSONA_ACCENT_COLORS[card.personaIndex % PERSONA_ACCENT_COLORS.length]
      : null;

  return (
    <div
      className="absolute select-none"
      style={{
        left: card.cardX,
        top: card.cardY,
        width: CARD_WIDTH,
        zIndex: cardZ,
        cursor: isDragging ? "grabbing" : "grab",
        touchAction: "none",
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      <div className="bg-white/95 backdrop-blur-sm border border-neutral-200/60 shadow-sm rounded-xl px-4 py-3 text-xs leading-relaxed">
        {/* Persona tag */}
        {card.persona && accent && (
          <div className="mb-2">
            <span className={`inline-block text-[11px] font-medium px-2.5 py-0.5 rounded-full ${accent.bg} ${accent.text}`}>
              {card.persona.name}
            </span>
          </div>
        )}
        <p className="text-neutral-600 mb-1.5">{card.conn.componentDescription}</p>
        {card.jtbdText && (
          <p className="text-neutral-500 italic mb-1.5">&ldquo;{card.jtbdText}&rdquo;</p>
        )}
        <p className="text-neutral-500">{card.conn.rationale}</p>
        {card.insight?.quote && (
          <blockquote className="mt-2 pl-2 border-l-2 border-amber-300 text-neutral-400 italic">
            &ldquo;{card.insight.quote}&rdquo;
          </blockquote>
        )}
        {(card.isBelowFold || !card.hasBounds) && (
          <span className="inline-block mt-1.5 px-1.5 py-0.5 text-[10px] font-medium text-amber-600 bg-amber-50 rounded">
            Below fold
          </span>
        )}
      </div>
    </div>
  );
}
