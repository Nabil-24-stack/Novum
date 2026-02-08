"use client";

import { useCallback, useMemo } from "react";
import { ArrowRight, ArrowDown, Minus, Plus } from "lucide-react";
import type { LayoutConfig } from "@/lib/canvas/types";
import { useCanvasStore } from "@/hooks/useCanvasStore";

interface AutoLayoutToolbarProps {
  /** The ID of the group node being edited */
  groupId: string;
  /** Position of the toolbar (below the group's bounding box) */
  position: { x: number; y: number };
  /** Canvas scale for proper sizing */
  scale: number;
}

const GAP_PRESETS = [4, 8, 12, 16, 24];

/**
 * Floating toolbar for controlling auto-layout settings.
 * Appears when a group is selected.
 */
export function AutoLayoutToolbar({ groupId, position, scale }: AutoLayoutToolbarProps) {
  const { nodes, setLayout } = useCanvasStore();
  const node = nodes.get(groupId);

  // Get current layout or default, memoized to avoid dependency issues
  const layout: LayoutConfig = useMemo(
    () => node?.layout || { direction: "row", gap: 8 },
    [node?.layout]
  );

  const handleDirectionToggle = useCallback(() => {
    const newDirection = layout.direction === "row" ? "column" : "row";
    setLayout(groupId, { ...layout, direction: newDirection });
  }, [groupId, layout, setLayout]);

  const handleGapChange = useCallback(
    (delta: number) => {
      const currentIndex = GAP_PRESETS.indexOf(layout.gap);
      let newIndex: number;

      if (currentIndex === -1) {
        // Not a preset value, find closest
        const closest = GAP_PRESETS.reduce((prev, curr) =>
          Math.abs(curr - layout.gap) < Math.abs(prev - layout.gap) ? curr : prev
        );
        newIndex = GAP_PRESETS.indexOf(closest);
      } else {
        newIndex = currentIndex + delta;
      }

      newIndex = Math.max(0, Math.min(GAP_PRESETS.length - 1, newIndex));
      setLayout(groupId, { ...layout, gap: GAP_PRESETS[newIndex] });
    },
    [groupId, layout, setLayout]
  );

  // Calculate toolbar position, accounting for scale
  const toolbarStyle: React.CSSProperties = {
    position: "absolute",
    left: position.x,
    top: position.y + 8, // Small offset below the group
    transform: `scale(${1 / scale})`,
    transformOrigin: "top left",
    zIndex: 100,
  };

  return (
    <div
      style={toolbarStyle}
      className="flex items-center gap-2 bg-white border border-neutral-200 rounded-lg shadow-lg px-2 py-1.5 pointer-events-auto"
    >
      {/* Direction toggle */}
      <button
        onClick={handleDirectionToggle}
        className="flex items-center gap-1.5 px-2 py-1 rounded hover:bg-neutral-100 transition-colors"
        title={`Direction: ${layout.direction}`}
      >
        {layout.direction === "row" ? (
          <ArrowRight className="w-4 h-4 text-neutral-600" />
        ) : (
          <ArrowDown className="w-4 h-4 text-neutral-600" />
        )}
        <span className="text-xs text-neutral-600 capitalize">{layout.direction}</span>
      </button>

      {/* Divider */}
      <div className="w-px h-5 bg-neutral-200" />

      {/* Gap control */}
      <div className="flex items-center gap-1">
        <button
          onClick={() => handleGapChange(-1)}
          className="p-1 rounded hover:bg-neutral-100 transition-colors disabled:opacity-50"
          disabled={layout.gap <= GAP_PRESETS[0]}
          title="Decrease gap"
        >
          <Minus className="w-3 h-3 text-neutral-600" />
        </button>

        <span className="text-xs text-neutral-600 w-8 text-center font-mono">
          {layout.gap}px
        </span>

        <button
          onClick={() => handleGapChange(1)}
          className="p-1 rounded hover:bg-neutral-100 transition-colors disabled:opacity-50"
          disabled={layout.gap >= GAP_PRESETS[GAP_PRESETS.length - 1]}
          title="Increase gap"
        >
          <Plus className="w-3 h-3 text-neutral-600" />
        </button>
      </div>
    </div>
  );
}
