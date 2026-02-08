"use client";

import type { BoundingBox } from "@/lib/canvas/coordinates";

interface MultiSelectBoxProps {
  boundingBox: BoundingBox;
  /** Offset to account for canvas overlay positioning */
  offset?: number;
}

/**
 * Renders a light blue bounding box around all selected elements.
 * Only shown when multiple elements are selected.
 */
export function MultiSelectBox({ boundingBox, offset = 0 }: MultiSelectBoxProps) {
  return (
    <div
      className="absolute pointer-events-none border-2 border-blue-400 bg-blue-100/20 rounded"
      style={{
        left: boundingBox.x + offset,
        top: boundingBox.y + offset,
        width: boundingBox.width,
        height: boundingBox.height,
      }}
    >
      {/* Optional: Add corner indicators */}
      <div className="absolute -top-1 -left-1 w-2 h-2 bg-blue-400 rounded-full" />
      <div className="absolute -top-1 -right-1 w-2 h-2 bg-blue-400 rounded-full" />
      <div className="absolute -bottom-1 -left-1 w-2 h-2 bg-blue-400 rounded-full" />
      <div className="absolute -bottom-1 -right-1 w-2 h-2 bg-blue-400 rounded-full" />
    </div>
  );
}
