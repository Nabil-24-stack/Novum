/** Precise source location from data-source-loc attribute */
export interface SourceLocation {
  fileName: string;
  line: number;
  column: number;
}

/** Parent layout context for keyboard reordering */
export interface ParentLayoutInfo {
  layout: "flex" | "grid" | "block";
  direction: "row" | "column";
  isReverse: boolean;
  parentSource?: SourceLocation;
  /** Number of columns in a grid layout (for row-jumping with ArrowUp/Down) */
  numCols?: number;
  /** Whether grid children use explicit placement (col-start-*, row-start-*) */
  hasExplicitPlacement?: boolean;
}

/** Structured reasons for reorder failures */
export enum ReorderFailureReason {
  NO_SIBLING_IN_DIRECTION = "NO_SIBLING_IN_DIRECTION",
  SOURCE_NOT_FOUND = "SOURCE_NOT_FOUND",
  NON_REORDERABLE_CONTEXT = "NON_REORDERABLE_CONTEXT",
  STALE_SOURCE_LOCATION = "STALE_SOURCE_LOCATION",
  UNKNOWN = "UNKNOWN",
}

export interface SelectedElement {
  tagName: string;
  className: string;
  /** Stable selection identity across DOM churn */
  selectionId: string;
  /** High-precision selector for optimistic DOM operations */
  preciseSelector: string;
  id?: string;
  /** The direct text content of the element (if it's a simple text element) */
  textContent?: string;
  /** Whether the element has only text content (no complex children) */
  isTextElement?: boolean;
  computedStyles?: {
    width: string;
    height: string;
    padding: string;
    margin: string;
    backgroundColor: string;
    color: string;
    fontSize: string;
    fontFamily: string;
    borderRadius: string;
    display: string;
  };
  boundingRect?: {
    top: number;
    left: number;
    width: number;
    height: number;
  };
  selector?: string;
  /** Precise source location from AST instrumentation (file:line:column) */
  source?: SourceLocation;
  /** Preferred callsite source location for instance-first editing */
  instanceSource?: SourceLocation;
  /** Current edit scope used by host UI */
  editScope?: "instance" | "component";
  /** Parent element layout info for keyboard reordering */
  parentLayout?: ParentLayoutInfo;
  /** Which FlowFrame page this selection came from (Flow View only) */
  pageId?: string;
  /** Strategy connection IDs from data-strategy-id attributes in element's ancestry */
  strategyIds?: string[];
}

export interface DOMTreeNode {
  nodeId: string;
  tagName: string;
  className: string;
  id?: string;
  textPreview?: string;
  hasChildren: boolean;
  children: DOMTreeNode[];
  selector: string;
  depth: number;
  source?: SourceLocation;
}

export interface UpdateClassesPayload {
  selector: string;
  newClassName: string;
}

export interface RollbackClassesPayload {
  selector: string;
  originalClassName: string;
}

/** Payload sent to iframe to find drop target at a point */
export interface FindDropTargetPayload {
  x: number;
  y: number;
}

/** Response from iframe with drop target information */
export interface DropTargetFoundPayload {
  tagName?: string;
  selector?: string;
  source?: SourceLocation;
  /** Whether the target is a valid container for nesting (div, section, Card, etc.) */
  isContainer: boolean;
}

/** Payload sent to iframe to show drop zone indicator at a point */
export interface ShowDropZonePayload {
  x: number;
  y: number;
}

/** Payload sent to iframe to show a live drop preview (component placeholder inside container) */
export interface ShowDropPreviewPayload {
  x: number;
  y: number;
  componentType: string;
  ghostType: string;
  textContent?: string;
}

/** Payload for swapping elements (keyboard reordering) */
export interface SwapElementsPayload {
  selector: string;
  direction: "prev" | "next";
}

/** Payload for moving an element by N sibling positions (grid row jumps) */
export interface MoveByOffsetPayload {
  offset: number;
}

/** Payload for moving an element (mouse drag-and-drop) */
export interface MoveElementPayload {
  sourceSelector: string;
  sourceLocation: SourceLocation;
  targetSelector: string;
  targetLocation: SourceLocation;
  position: "before" | "after" | "inside";
}

/** Payload for optimistic DOM move (sent to iframe) */
export interface OptimisticMovePayload {
  sourceSelector: string;
  targetSelector: string;
  position: "before" | "after" | "inside";
}

/** Payload for inserting an optimistic placeholder at drop point */
export interface InsertPlaceholderPayload {
  x: number;
  y: number;
  componentName: string;
}

/** Payload for instant text updates (optimistic UI) */
export interface UpdateTextPayload {
  selector: string;
  newText: string;
}

/** Payload for text rollback on VFS write failure */
export interface RollbackTextPayload {
  selector: string;
  originalText: string;
}

/** Payload for flow mode state sync (Host → Iframe) */
export interface FlowModeStatePayload {
  enabled: boolean;
}

/** Payload for navigation intent in flow mode (Iframe → Host) */
export interface NavigationIntentPayload {
  targetRoute: string;
  sourceRoute: string;
}

/** Payload for context menu (right-click in inspection mode) */
export interface ContextMenuPayload extends SelectedElement {
  menuX: number;
  menuY: number;
}

/** Payload for route change notification (Iframe → Host) */
export interface RouteChangedPayload {
  route: string;
}

/** Response from iframe with screenshot data */
export interface ScreenshotCapturedPayload {
  dataUrl: string | null;
  error?: string;
}

export interface InspectionMessage {
  type:
    | "novum:element-selected"
    | "novum:selection-revalidated"
    | "novum:inspection-mode"
    | "novum:inspector-ready"
    | "novum:request-dom-tree"
    | "novum:dom-tree-response"
    | "novum:highlight-element"
    | "novum:clear-highlight"
    | "novum:select-element"
    | "novum:update-classes"
    | "novum:rollback-classes"
    | "novum:update-text"
    | "novum:rollback-text"
    | "novum:find-drop-target"
    | "novum:drop-target-found"
    | "novum:show-drop-zone"
    | "novum:hide-drop-zone"
    | "novum:show-drop-preview"
    | "novum:hide-drop-preview"
    | "novum:swap-elements"
    | "novum:move-element-by-offset"
    | "novum:keyboard-event"
    | "novum:insert-placeholder"
    | "novum:remove-placeholder"
    | "novum:drag-start"
    | "novum:move-element"
    | "novum:optimistic-move"
    | "novum:flow-mode-state"
    | "novum:navigation-intent"
    | "novum:context-menu"
    | "novum:route-changed"
    | "novum:clear-selection"
    | "novum:capture-screenshot"
    | "novum:screenshot-captured";
  payload?: SelectedElement | { enabled: boolean } | DOMTreeNode | { selector: string } | UpdateClassesPayload | RollbackClassesPayload | UpdateTextPayload | RollbackTextPayload | FindDropTargetPayload | DropTargetFoundPayload | ShowDropZonePayload | ShowDropPreviewPayload | SwapElementsPayload | MoveByOffsetPayload | { key: string } | InsertPlaceholderPayload | MoveElementPayload | OptimisticMovePayload | FlowModeStatePayload | NavigationIntentPayload | ContextMenuPayload | RouteChangedPayload | ScreenshotCapturedPayload;
}
