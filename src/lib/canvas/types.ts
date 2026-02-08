export type CanvasTool = "cursor" | "frame" | "text" | "component";

export interface GhostElement {
  id: string;
  type: "frame" | "text" | "component";
  x: number;
  y: number;
  width: number;
  height: number;
  content?: string;          // For text
  componentType?: string;    // For component ("Button", "Card", "Input")
  name?: string;             // Display name (e.g., "Frame 1", "Frame 2")
}

export interface DrawState {
  isDrawing: boolean;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
}

// ============================================================================
// Hierarchical Canvas Node Types (Phase 16)
// ============================================================================

/**
 * Sizing mode for width/height.
 * - "hug": Shrink to fit content (auto)
 * - "fill": Expand to fill container (w-full/h-full)
 * - "fixed": Use specific pixel value
 */
export type SizingMode = "hug" | "fill" | "fixed";

/**
 * Layout configuration for auto-layout groups.
 * Defines how children are arranged within a group.
 */
export interface LayoutConfig {
  direction: "row" | "column";
  gap: number;                  // pixels (4, 8, 12, 16, 24)
  alignItems?: "start" | "center" | "end" | "stretch";
  padding?: number;             // pixels (0, 4, 8, 12, 16, 24)
  widthMode?: SizingMode;       // How width is determined
  heightMode?: SizingMode;      // How height is determined
}

/**
 * Styling configuration for canvas nodes (groups).
 * Defines visual appearance when materialized.
 */
export interface NodeStyle {
  backgroundColor?: string;     // Tailwind color (e.g., "neutral-100", "white")
  borderWidth?: number;         // pixels (0, 1, 2, 4)
  borderColor?: string;         // Tailwind color (e.g., "neutral-200", "blue-500")
  borderRadius?: number;        // pixels (0, 4, 8, 12, 16)
}

/**
 * Extended ghost element with hierarchy and layout support.
 * Children use relative positioning to parent. Root nodes use world coordinates.
 */
export interface CanvasNode extends GhostElement {
  parentId?: string | null;     // null = root level
  children?: string[];          // Child node IDs (ordered)
  layout?: LayoutConfig;        // Auto-layout settings (only for groups)
  style?: NodeStyle;            // Visual styling (only for groups)
}

/**
 * Selection state supporting multi-select.
 */
export interface SelectionState {
  selectedIds: Set<string>;
  primaryId: string | null;     // Last clicked (for property panel)
}
