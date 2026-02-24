/**
 * Horizontal layout calculator for strategy artifact groups.
 *
 * Places each visible group left-to-right in a single row:
 *   [Overview] → [Personas] → [Journey Maps] → [Ideas] → [Architecture] → [Wireframes]
 *
 * Each group has its own internal card layout (personas side-by-side, etc.).
 * This module only computes the group origin positions — no visual containers.
 */

export type GroupId =
  | "product-overview"
  | "personas"
  | "journey-maps"
  | "ideas"
  | "architecture"
  | "wireframes";

export interface GroupConfig {
  id: GroupId;
  width: number;   // Total width of all cards in this group
  height: number;  // Total height of all cards in this group
  visible: boolean;
}

export interface GroupOrigin {
  id: GroupId;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Gap between adjacent groups */
export const GROUP_GAP = 60;

/**
 * Calculate group origin positions in a single horizontal row.
 * Each group is placed at origin.y, appending to the right.
 */
export function calculateHorizontalLayout(
  configs: GroupConfig[],
  origin: { x: number; y: number }
): GroupOrigin[] {
  const results: GroupOrigin[] = [];
  let cursorX = origin.x;

  for (const cfg of configs) {
    if (!cfg.visible) continue;
    results.push({
      id: cfg.id,
      x: cursorX,
      y: origin.y,
      width: cfg.width,
      height: cfg.height,
    });
    cursorX += cfg.width + GROUP_GAP;
  }

  return results;
}
