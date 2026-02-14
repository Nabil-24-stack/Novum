"use client";

import { useCallback, useState, type PointerEvent } from "react";
import { useCanvasScale } from "@/components/canvas/InfiniteCanvas";
import { DEFAULT_FRAME_WIDTH, DEFAULT_FRAME_HEIGHT } from "@/lib/constants";
import type { WireframePage, WireframeSection, WireframeElement } from "@/hooks/useStrategyStore";

const CARD_WIDTH = DEFAULT_FRAME_WIDTH;
const CARD_HEIGHT = DEFAULT_FRAME_HEIGHT;

// Frame header height (matches FlowFrame chrome)
const HEADER_HEIGHT = 36;

interface WireframeCardProps {
  page: WireframePage;
  x: number;
  y: number;
  onMove?: (x: number, y: number) => void;
}

export function WireframeCard({ page, x, y, onMove }: WireframeCardProps) {
  const canvasScale = useCanvasScale();
  const [isDragging, setIsDragging] = useState(false);

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
        width: CARD_WIDTH,
        height: CARD_HEIGHT + HEADER_HEIGHT,
        touchAction: onMove ? "none" : undefined,
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      {/* Frame header — matches FlowFrame chrome */}
      <div
        className="bg-white border border-b-0 border-neutral-200 rounded-t-lg flex items-center px-3"
        style={{ height: HEADER_HEIGHT }}
      >
        <span className="text-xs font-medium text-neutral-500 truncate">
          {page.name}
        </span>
      </div>

      {/* Page content — white background matching iframe look */}
      <div
        className="bg-white border border-neutral-200 rounded-b-lg overflow-hidden flex flex-col"
        style={{ height: CARD_HEIGHT }}
      >
        <div className="flex-1 flex flex-col p-8 gap-5 min-h-0">
          {page.sections.map((section, idx) => (
            <SectionBlock key={idx} section={section} />
          ))}
        </div>
      </div>
    </div>
  );
}

function SectionBlock({ section }: { section: WireframeSection }) {
  const flex = section.flex ?? 1;

  // Header type: compact strip with left-aligned label
  if (section.type === "header") {
    return (
      <div className="flex items-center gap-3 shrink-0" style={{ height: 48 }}>
        <div className="h-5 w-5 rounded bg-neutral-200" />
        <div className="h-4 rounded bg-neutral-200" style={{ width: 160 }} />
        <div className="flex-1" />
        {section.items?.map((item, i) => (
          <div key={i} className="h-3 rounded bg-neutral-100" style={{ width: 60 }} />
        ))}
      </div>
    );
  }

  // Row type: horizontal layout with children
  if (section.type === "row" && section.children && section.children.length > 0) {
    return (
      <div className="flex flex-col gap-2" style={{ flex }}>
        <span className="text-xs font-medium text-neutral-400 uppercase tracking-wider shrink-0">
          {section.label}
        </span>
        <div className="flex-1 flex gap-5 min-h-0">
          {section.children.map((child, i) => (
            <SectionBlock key={i} section={child} />
          ))}
        </div>
        {section.elements && section.elements.length > 0 && (
          <div className="flex flex-wrap items-center gap-3 shrink-0 pt-1">
            {section.elements.map((el, i) => (
              <ElementBlock key={i} element={el} />
            ))}
          </div>
        )}
      </div>
    );
  }

  // Grid type: multi-column grid of labeled cells
  if (section.type === "grid" && section.items && section.items.length > 0) {
    const cols = section.columns || section.items.length;
    return (
      <div className="flex flex-col gap-2" style={{ flex }}>
        <span className="text-xs font-medium text-neutral-400 uppercase tracking-wider shrink-0">
          {section.label}
        </span>
        <div
          className="flex-1 grid gap-4 min-h-0"
          style={{ gridTemplateColumns: `repeat(${Math.min(cols, 6)}, 1fr)` }}
        >
          {section.items.map((item, i) => (
            <div
              key={i}
              className="bg-neutral-50 border border-dashed border-neutral-200 rounded-lg flex flex-col items-center justify-center gap-2 p-3 min-h-[80px]"
            >
              <span className="text-xs text-neutral-400 text-center leading-tight">
                {item}
              </span>
              <div className="w-12 h-3 bg-neutral-200 rounded" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // List type: vertical stack of placeholder rows
  if (section.type === "list") {
    const rows = section.items || ["Row 1", "Row 2", "Row 3"];
    return (
      <div className="flex flex-col gap-2" style={{ flex }}>
        <span className="text-xs font-medium text-neutral-400 uppercase tracking-wider shrink-0">
          {section.label}
        </span>
        <div className="flex-1 flex flex-col gap-2 min-h-0">
          {rows.map((item, i) => (
            <div
              key={i}
              className="flex items-center gap-3 px-4 py-3 bg-neutral-50 border border-dashed border-neutral-200 rounded-lg"
            >
              <div className="w-8 h-8 rounded-full bg-neutral-200 shrink-0" />
              <div className="flex-1 flex flex-col gap-1.5">
                <div className="h-3 bg-neutral-200 rounded" style={{ width: `${Math.min(40 + i * 15, 70)}%` }} />
                <div className="h-2 bg-neutral-100 rounded w-1/3" />
              </div>
              <span className="text-[10px] text-neutral-300">{item}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Default block: labeled area with placeholder content + optional inline elements
  const hasElements = section.elements && section.elements.length > 0;
  return (
    <div className="flex flex-col gap-2" style={{ flex }}>
      <span className="text-xs font-medium text-neutral-400 uppercase tracking-wider shrink-0">
        {section.label}
      </span>
      <div className="flex-1 bg-neutral-50 border border-dashed border-neutral-200 rounded-lg flex flex-col justify-center p-5 gap-3 min-h-[60px]">
        {!hasElements && (
          <>
            <div className="h-3 bg-neutral-200 rounded w-3/4" />
            <div className="h-3 bg-neutral-100 rounded w-1/2" />
            <div className="h-3 bg-neutral-100 rounded w-2/3" />
          </>
        )}
        {hasElements && (
          <div className="flex flex-wrap items-center gap-3">
            {section.elements!.map((el, i) => (
              <ElementBlock key={i} element={el} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// --- Inline component placeholders at natural size ---

function ElementBlock({ element }: { element: WireframeElement }) {
  switch (element.type) {
    case "button": {
      const isPrimary = !element.variant || element.variant === "primary";
      const isOutline = element.variant === "outline" || element.variant === "ghost";
      const isDestructive = element.variant === "destructive";
      return (
        <div
          className={`inline-flex items-center justify-center rounded-md px-4 shrink-0 ${
            isDestructive
              ? "bg-neutral-400 text-white"
              : isPrimary
              ? "bg-neutral-300 text-white"
              : isOutline
              ? "bg-white border border-neutral-300"
              : "bg-neutral-200"
          }`}
          style={{ height: 36, minWidth: 80 }}
        >
          <span className={`text-xs font-medium ${isPrimary || isDestructive ? "text-white" : "text-neutral-500"}`}>
            {element.label}
          </span>
        </div>
      );
    }

    case "input":
      return (
        <div
          className="flex items-center bg-white border border-neutral-300 rounded-md px-3 gap-2"
          style={{ height: 38, width: 240 }}
        >
          <span className="text-xs text-neutral-400 truncate">{element.label}</span>
        </div>
      );

    case "textarea":
      return (
        <div
          className="flex items-start bg-white border border-neutral-300 rounded-md px-3 pt-2"
          style={{ height: 80, width: 300 }}
        >
          <span className="text-xs text-neutral-400">{element.label}</span>
        </div>
      );

    case "toggle":
      return (
        <div className="inline-flex items-center gap-2 shrink-0">
          <div className="rounded-full bg-neutral-300 relative" style={{ width: 40, height: 22 }}>
            <div className="absolute top-[3px] right-[3px] w-4 h-4 rounded-full bg-white" />
          </div>
          <span className="text-xs text-neutral-500">{element.label}</span>
        </div>
      );

    case "checkbox":
      return (
        <div className="inline-flex items-center gap-2 shrink-0">
          <div className="w-4 h-4 rounded-sm border-2 border-neutral-300 bg-white" />
          <span className="text-xs text-neutral-500">{element.label}</span>
        </div>
      );

    case "search":
      return (
        <div
          className="flex items-center bg-white border border-neutral-300 rounded-md px-3 gap-2"
          style={{ height: 38, width: 280 }}
        >
          {/* Search icon placeholder */}
          <div className="w-3.5 h-3.5 rounded-full border-2 border-neutral-300 shrink-0" />
          <span className="text-xs text-neutral-400 truncate">{element.label}</span>
        </div>
      );

    case "select":
      return (
        <div
          className="flex items-center justify-between bg-white border border-neutral-300 rounded-md px-3"
          style={{ height: 38, width: 200 }}
        >
          <span className="text-xs text-neutral-500 truncate">{element.label}</span>
          {/* Chevron placeholder */}
          <div className="w-0 h-0 border-l-[4px] border-l-transparent border-r-[4px] border-r-transparent border-t-[5px] border-t-neutral-400 shrink-0 ml-2" />
        </div>
      );

    case "badge":
      return (
        <div className="inline-flex items-center rounded-full bg-neutral-200 px-2.5 shrink-0" style={{ height: 22 }}>
          <span className="text-[10px] font-medium text-neutral-500">{element.label}</span>
        </div>
      );

    case "avatar":
      return (
        <div className="inline-flex items-center gap-2 shrink-0">
          <div className="w-9 h-9 rounded-full bg-neutral-200 flex items-center justify-center">
            <span className="text-[10px] text-neutral-400 font-medium">
              {element.label.slice(0, 2).toUpperCase()}
            </span>
          </div>
        </div>
      );

    default:
      return null;
  }
}

export { CARD_WIDTH as WIREFRAME_CARD_WIDTH, CARD_HEIGHT as WIREFRAME_CARD_HEIGHT };
