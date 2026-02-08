# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Novum is a **Code-First UI Builder** where the source of truth is a Virtual File System (VFS) running a live React application in the browser via Sandpack. The AI writes production-ready React code directly into the VFS—no intermediate JSON representations.

## Commands

```bash
npm run dev      # Start development server at localhost:3000
npm run build    # Production build
npm run lint     # Run ESLint
```

## Environment Setup

Copy `.env.example` to `.env.local` and add your Google AI API key:
```bash
GOOGLE_GENERATIVE_AI_API_KEY=your_api_key_here
```

## Architecture

### Core Concept: "Code is State"

The application has two distinct React environments:
1. **Host App** (Next.js) - The editor UI with canvas, sidebar, etc.
2. **Virtual App** (Sandpack) - The user's app running inside an iframe, compiled from VFS files

### Key Systems

**Virtual File System (`src/hooks/useVirtualFiles.ts`)**
- Manages in-memory file storage as `Record<string, string>`
- Files use Sandpack paths (e.g., `/App.tsx`, `/components/ui/button.tsx`)
- Initial state loaded from `src/lib/vfs/templates/hello-world.ts`
- Methods: `readFile`, `writeFile`, `deleteFile`, `getAllFiles`

**Sandpack Integration (`src/components/providers/SandpackWrapper.tsx`)**
- Wraps the canvas with `SandpackProvider`
- Uses `react-ts` template with Tailwind via CDN
- Injects external scripts via data URLs: Tailwind config, dark mode toggle, inspector script
- **Dynamic dependencies**: Parses `/package.json` from VFS to determine Sandpack dependencies

### Canvas System (`src/components/canvas/`)

The canvas is built with **native DOM + CSS transforms** (no canvas/WebGL libraries).

**Core Components:**
- `InfiniteCanvas.tsx` - Pan/zoom container using CSS `translate()` + `scale()`, dot grid background
- `Frame.tsx` - Draggable/resizable preview container with Sandpack iframe, light/dark mode toggles
- `CanvasOverlay.tsx` - Global drawing layer at InfiniteCanvas level; `pointer-events-none` for cursor tool (allows Sandpack interaction), `pointer-events-auto` for drawing tools. Supports multi-frame drop detection in Flow View via `flowFrameStates` prop
- `CanvasToolbar.tsx` - Floating pill with tool buttons (Cursor, Frame, Text, Component)
- `GhostFrame.tsx`, `GhostText.tsx`, `GhostComponent.tsx` - Figma-style selectable/resizable placeholder elements

**Coordinate Systems:**
- **Screen Space**: Raw `e.clientX/Y` from pointer events
- **World Space**: Inside the CSS transform, where Frame and ghosts are positioned
- **Conversion**: `worldX = (screenX - viewport.x) / viewport.scale`

**Pan/Zoom Implementation:**
```typescript
// InfiniteCanvas applies transform to children
<div style={{ transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.scale})` }}>
  {children}
</div>
```
- Two-finger scroll → pan (`deltaX/Y`)
- `ctrlKey + wheel` (pinch) → zoom with focal point preservation
- Scale limits: 0.1x to 3x
- `CanvasScaleContext` shares scale with children for drag correction

**Frame Interactions:**
- Drag via Pointer Events API with `setPointerCapture`
- 8-way resize handles (corners + edges)
- Movement divided by `canvasScale` for zoom-corrected positioning
- Min size: 200×150px

**Canvas Tools (`src/hooks/useCanvasTool.ts`):**

Hook manages: `activeTool`, `ghostElements`, `drawState`, `selectedGhostId`, `frameCounter`

| Tool | Shortcut | Behavior |
|------|----------|----------|
| Cursor (V) | Default | Select/move/resize ghosts, interact with Sandpack preview |
| Frame (F) | Draw rectangles → creates ghost frames with auto-naming |
| Text (T) | Click → text input ghost (auto-enters edit mode) |
| Component (C) | Opens component picker dialog |

**Keyboard Shortcuts:**
- `Delete` / `Backspace` - Remove selected ghost
- `Escape` - Deselect current ghost

**Ghost Elements (Figma-style):**
Temporary placeholders that exist only in the Host App (not in VFS). Ghosts can be dragged onto the Frame to materialize as real code.

```typescript
interface GhostElement {
  id: string;
  type: "frame" | "text" | "component";
  x: number; y: number; width: number; height: number;
  content?: string;       // For text
  componentType?: string; // For component
  name?: string;          // Display name (e.g., "Frame 1")
}
```

**Ghost Visual States:**

| State | Frame | Text | Component |
|-------|-------|------|-----------|
| Unselected | White fill, 1px blue border, "Frame N" label above | Subtle hover outline | No border, component name label above |
| Selected | 2px blue border, 4 corner resize handles, dimensions badge below | Blue border, corner handles, dimensions | 2px blue border (overlay), corner handles, dimensions |

**GhostComponent Styling (Figma-style):**
- No container background or padding - components render at full size
- Selection border rendered as separate overlay (`absolute inset-0`) so it doesn't clip focus rings
- Border only visible when selected (unselected components appear standalone)
- Components centered via flex container, some use `shrink-0` to maintain natural size

**Ghost Interactions:**
- **Cursor tool**: Click to select, drag selected ghost to move, corner handles to resize
- **Drawing tools**: Ghosts are non-interactive (`pointer-events-none`), allowing drawing through them
- Selection state managed by `useCanvasTool` hook (`selectedGhostId`, `setSelectedGhostId`)
- Frame counter auto-increments for naming ("Frame 1", "Frame 2", etc.)
- **onDragMove callback**: Ghost components notify parent during drag for real-time drop zone feedback

**Ghost Materialization (`src/hooks/useMaterializer.ts`):**

When a ghost is dropped onto a Frame, it's converted to actual code in the VFS:

1. **Drop Detection**: `CanvasOverlay.handleGhostDragEnd` checks if ghost center is inside Frame content area (Prototype View) or any FlowFrame content area (Flow View via `getDropPointInFlowFrames()`)
2. **Drop Target Query**: Sends `novum:find-drop-target` to the specific iframe (targeted via `pageId` in Flow View) to find valid container at drop point
3. **Code Generation**: `generateCodeForGhost()` creates JSX and required imports
4. **Smart Nesting**: If drop target is a valid container (`div`, `section`, etc.), code is inserted as child
5. **Fallback**: If no valid container, inserts into App.tsx root element
6. **Import Management**: `addImportsIfMissing()` adds component imports if needed
7. **AST Insertion**: `insertChildAtLocation()` surgically inserts JSX without reformatting

**Drop Target Indicator:**

Real-time visual feedback showing where a ghost will be inserted during drag:

- **Green dashed overlay** (`#22c55e`) highlights valid drop containers in the iframe
- **Throttled updates** (50ms) prevent performance issues during rapid mouse movement
- **Container detection**: Traverses DOM to find valid containers (`div`, `section`, `article`, etc.)
- **Coordinate conversion**: Ghost position → world coords → iframe coords via `getDropPointInFrame()`

**Resize Handles:**
4 corner handles (nw, ne, sw, se) - 8×8px white squares with 1px blue/purple border. Resize math applies scale correction for zoom levels.

**Component Registry (`src/lib/canvas/component-registry.tsx`):**
- `KNOWN_COMPONENTS` - Static registry mapping component keys to preview configs
- `buildComponentRegistry()` - Discovers VFS components, merges with known previews
- Previews render actual UI components with design system styling from `/globals.css`

Preview patterns for different component types:
- **Block components** (Button, Input, Card): Fill width naturally via `[&>*]:w-full`
- **Inline components** (Badge, Switch): Wrapped in centering flex container
- **Fixed-size components** (Switch, Avatar): Use `shrink-0` to maintain natural dimensions
- **Stateful components** (Slider): Use wrapper component with `useState` for interactivity

### Flow View System (`src/components/flow/`, `src/lib/flow/`)

Multi-page app visualization showing all pages as full FlowFrame nodes connected by forward-flowing arrows. Flow View is functionally identical to Prototype View — drawing tools, ghost elements, inspection, and visual editing all work across multiple frames.

**Key Components:**
- `FlowCanvas.tsx` - Main container combining layout, nodes, connections, CanvasOverlay, and toolbar; manages node positions in state
- `FlowFrame.tsx` - Full SandpackWrapper + Frame per page; supports drag-and-drop repositioning, inspection, editing. Each frame has `data-flow-page-id={page.id}` attribute for targeted iframe messaging
- `FlowConnections.tsx` - SVG orthogonal connectors with animated dashed lines; renders only forward connections
- `ViewModeToggle.tsx` - Toggle to switch Prototype/Flow views, positioned at `-left-12` relative to each FlowFrame

**Always-Mounted Iframes:**
All FlowFrame Sandpack iframes are always mounted (no virtualization). This eliminates reload delays when panning between pages.

**Drawing Tools in Flow View:**
FlowCanvas passes tool state (`activeTool`, `drawState`, etc.) to `InfiniteCanvas` (enabling toolbar + keyboard shortcuts V/F/T/C) and renders a `CanvasOverlay` inside the canvas. Ghost elements are shared across views via the global `useCanvasStore` — ghosts persist when switching between Prototype and Flow modes.

**Multi-Frame Drop Detection (`CanvasOverlay.tsx`):**
- `FlowFrameDropState` type: `{ pageId, route, x, y, width, height }`
- `flowFrameStates` prop computed from `nodePositions` + manifest pages
- `getDropPointInFlowFrames()` iterates all frames, returns `{ x, y, pageId }` for the first frame containing the ghost's center
- `sendToTargetIframe(pageId, message)` queries `[data-flow-page-id="${pageId}"] iframe` for targeted messaging
- `sendToAllFlowIframes(message)` broadcasts to all flow iframes (used for `hide-drop-zone` cleanup)
- During drag: hides drop zone on ALL flow iframes, then shows on the specific hovered frame

**Targeted Iframe Messaging (`useMaterializer.ts`):**
- `sendToIframe(message, targetPageId?)` — when `targetPageId` provided, targets specific FlowFrame's iframe
- `findDropTarget(x, y, targetPageId?)` — routes `novum:find-drop-target` to specific iframe
- `materializeNode(node, nodes, frameState, dropPoint, targetPageId?)` — materializes code into the correct page

**Inspection Page Tracking (`useInspection.ts`):**
When an element is selected in Flow View, `useInspection` matches `event.source` against FlowFrame iframes to set `pageId` on the `SelectedElement`. This identifies which page the selection belongs to.

**Interactions:**
- **Click**: Navigates to that page in Prototype View (uses `key={startRoute}` to force SandpackPreview remount)
- **Drag**: Repositions nodes on canvas; pointer events distinguish click vs drag (DRAG_THRESHOLD = 5px)
- Canvas scale compensation for accurate drag movement
- Connections re-render in real-time as nodes are dragged
- Canvas dimensions auto-expand when nodes move outside bounds

**Auto-Layout Algorithm (`src/lib/flow/auto-layout.ts`):**
- Uses BFS topological sort to assign levels (columns) to nodes
- No external dependencies (dagre/reactflow cause Next.js SSR issues)
- Nodes with no incoming edges start at level 0; "/" route prioritized

**Connection Routing:**
- Only forward connections rendered (left-to-right) for cleaner visualization
- Orthogonal paths: Right edge → stub → elbow → target left edge
- Dashed lines with "marching ants" animation (`stroke-dashoffset`)
- Optional labels displayed at connection midpoint

**Flow Manifest (`/flow.json` in VFS):**
```json
{
  "pages": [{ "id": "home", "name": "Home", "route": "/" }],
  "connections": [{ "from": "home", "to": "dashboard", "label": "Login" }]
}
```

**Hook:** `useFlowManifest.ts` - Parses `/flow.json`, auto-generates sequential connections if none defined

**Navigation Interception (`src/hooks/useFlowNavigation.ts`):**

When in Flow View, clicking navigation buttons inside frames does NOT navigate the iframe. Instead, the viewport smoothly animates to center on the target frame at 100% zoom.

| Behavior | Flow View | Prototype View |
|----------|-----------|----------------|
| Navigation buttons | Viewport animates to target frame | Normal navigation |
| Missing route | Toast notification via sonner | N/A |

**Flow:**
1. `useFlowNavigation` broadcasts `novum:flow-mode-state` to all iframes when `canvasMode` changes
2. Inspector script sets `window.__novumFlowModeActive` flag in iframe
3. Router's `navigate()` checks flag and calls `window.__novumInterceptNavigation()` instead of navigating
4. Interception function posts `novum:navigation-intent` with target route to parent
5. `useFlowNavigation` receives message, finds target page in manifest
6. Animates viewport to center on target frame at 100% zoom (~300ms ease-out-cubic)
7. If route not found in manifest, shows toast error

**Viewport Animation (`src/lib/canvas/viewport-animation.ts`):**
- `animateViewport(from, to, onUpdate, options)` - Smooth animation via requestAnimationFrame
- `calculateCenteredViewport(nodeRect, containerW, containerH)` - Computes viewport state to center node at scale 1
- Easing: ease-out-cubic for natural deceleration
- Returns cancel function to abort in-progress animations

### Visual Editor / Inspection System

**Inspection Hook (`src/hooks/useInspection.ts`)**
- Manages `inspectionMode` and `selectedElement` state
- Listens for `postMessage` from Sandpack iframe with type `"novum:element-selected"`
- Broadcasts inspection mode changes to all iframes

**Inspector Script (`src/lib/inspection/inspector-script.ts`)**
- Generates a data URL script injected into Sandpack iframe
- Shows blue hover outline on elements when inspection mode active
- Captures clicks, prevents default, posts element info to parent
- Captures right-clicks (`contextmenu`), selects element and posts `novum:context-menu` with iframe-local cursor coords
- Reads `data-source-loc` attributes for precise source location (see AST System below)

**Class Manager (`src/lib/inspection/class-manager.ts`)**
- Tailwind class manipulation utility for the visual editor
- `updateClass()` - Replaces classes in-place (preserves order) by category
- Detection helpers: `detectLayoutMode`, `detectFlexDirection`, `detectGap`, etc.

**Writer Hook (`src/hooks/useWriter.ts`)**
- Finds and replaces className and text content values in VFS files
- Supports `cn()`, `clsx()`, and `twMerge()` patterns
- Order-independent matching (compares classes as sets)
- Component prop operations: `getComponentProps()`, `updateComponentProp()`, `removeComponentProp()`

**Draft Editor Hook (`src/hooks/useDraftEditor.ts`)**
- Optimistic UI for instant visual feedback during class and text edits
- Updates DOM directly via postMessage for zero-latency preview
- Smart debounce: auto-saves to VFS after 3000ms (3 seconds)
- Coordinates both class and text drafts with unified flush/cancel

### Layers Panel Auto-Open (`src/components/canvas/Frame.tsx`, `src/components/canvas/LayersPanel.tsx`)

When an element is selected in the iframe (inspection mode), the Layers panel automatically opens, expands the DOM tree to reveal the selected element, and scrolls it into view.

**Key Behaviors:**
- **Auto-open on selection**: `handleElementSelected` in `page.tsx` calls `setLayersOpen(true)` whenever any element is selected
- **Re-opens after manual close**: Every new selection triggers `setLayersOpen(true)`, so closing the panel and selecting another element re-opens it
- **Auto-expand ancestors**: `findNodePath()` traverses the DOM tree to find all ancestor nodes of the selected element, then additively expands them (preserves user-expanded nodes)
- **Auto-scroll**: After expanding, uses `requestAnimationFrame` + `scrollIntoView({ block: "nearest", behavior: "smooth" })` to bring the selected TreeNode into view

**Tree Traversal (`findNodePath`):**
Standalone recursive function in `Frame.tsx` that returns an array of stable node keys (source-based `fileName:line:column`) from root to the target selector, or `null` if not found.

**Scroll Targeting:**
Each TreeNode row in `LayersPanel.tsx` has a `data-layer-selector={node.selector}` attribute. The auto-expand effect in `Frame.tsx` queries this attribute via `CSS.escape()` to find and scroll to the correct DOM element.

**Flow View Support:**
- `FlowCanvas` passes `selectedPageId` and `selectedSelector` props to each `FlowFrame`
- `FlowFrame` has a `useEffect` that auto-opens its local `layersOpen` state when `selectedPageId` matches its `page.id`
- The `selectedSelector` is forwarded to `Frame` only for the matching page, triggering the same auto-expand + scroll behavior

**Effect Dependencies:**
The auto-expand effect in `Frame.tsx` fires when any of these change: `layersOpen`, `selectedSelector`, `localDomTree`. This handles both cases:
- DOM tree already loaded → expand + scroll immediately
- DOM tree loads after panel opens → expand + scroll when tree arrives

### Keyboard Reordering System (`src/hooks/useKeyboardMove.ts`)

Allows reordering elements using arrow keys when an element is selected in inspection mode.

**Direction Mapping (based on parent's computed flex direction):**

| Parent Layout | Arrow Key | Swap Direction |
|---------------|-----------|----------------|
| flex-row | ← / → | prev / next |
| flex-row-reverse | ← / → | next / prev |
| flex-col / block | ↑ / ↓ | prev / next |

**Flow:**
1. User presses arrow key in iframe → forwarded via `novum:keyboard-event`
2. `useKeyboardMove` maps key to swap direction based on `parentLayout`
3. Optimistic swap: `novum:swap-elements` sent to iframe for instant FLIP animation
4. VFS update: `swapSiblingAtLocation()` surgically swaps JSX elements in source
5. Source location update: `swapSiblingAtLocation()` returns `newSourceLocation` which is used to update `selectedElement.source` via `onSourceLocationUpdate` callback

**Source Location Tracking:**
After each swap, the element's position in the source code changes. The AST writer calculates and returns the new `line:column` position in `ASTWriteResult.newSourceLocation`. This is critical for subsequent operations - without updating the source location, the next arrow key press would fail because it would try to find the element at its old (stale) coordinates.

**FLIP Animation (`inspector-script.ts`):**
- **First**: Record positions of both elements
- **Last**: Perform DOM swap, record new positions
- **Invert**: Apply CSS transforms to visually restore original positions
- **Play**: Animate transforms to zero (0.15s ease-out)

**Persistent Selection:**
- `selectionOverlay` - Blue border that persists after clicking (separate from hover highlight)
- `currentSelectedElement` - DOM reference to selected element
- `currentSelectedSelector` - Precise selector with `nth-of-type` for re-selection
- `MutationObserver` detects when Sandpack re-renders and re-selects element by selector

### AST Instrumentation System (`src/lib/ast/`, `src/hooks/useInstrumentedFiles.ts`)

The "GPS" system for precise element-to-source mapping. Solves the fragile CSS selector + className regex matching problem.

**Shadow File Pattern:**
- Clean VFS files remain pristine (for editing)
- Instrumented "shadow" files are fed to Sandpack (for preview)
- Shadow files have `data-source-loc="filename:line:column"` on every JSX element

**Key Files:**
- `src/lib/ast/instrument.ts` - Babel transformation that injects `data-source-loc` attributes
- `src/lib/ast/writer.ts` - AST-based surgical code editor (update props, text, insert/delete nodes)
- `src/lib/ast/import-manager.ts` - Adds missing imports when materializing components
- `src/lib/ast/test-utils.ts` - Console test API (`window.novum.testEdit()`)
- `src/lib/canvas/code-generator.ts` - Generates JSX code from ghost elements
- `src/hooks/useInstrumentedFiles.ts` - Hook that generates shadow files with caching
- `src/hooks/useMaterializer.ts` - Converts ghosts to code, queries iframe for drop targets

**Flow:**
1. `useVirtualFiles()` provides clean `files` object
2. `useInstrumentedFiles(files)` returns `shadowFiles` with source location attributes
3. `SandpackWrapper` receives `shadowFiles` for preview rendering
4. `RightPanel` receives clean `files` for editing
5. Inspector reads `data-source-loc` and includes `source: { fileName, line, column }` in selection payload

**AST Writer Operations:**
- `updateProp` - Update or add a JSX attribute (e.g., className)
- `updateText` - Modify text content of an element
- `insertChild` - Insert JSX element as child (first, last, or index)
- `deleteNode` - Remove a JSX element
- `swapSibling` - Swap element with previous/next sibling (preserves whitespace between)
- `getProps` - Read all JSX attributes from an element (for prop inspector)
- `removeProp` - Remove a JSX attribute from an element

**Surgical String Replacement:**
The AST Writer uses surgical editing to preserve formatting:
1. Parse AST to find target node by line:column
2. Get node's start/end character indices
3. Generate new code only for the modified node
4. Splice: `code.slice(0, start) + newCode + code.slice(end)`
Result: Comments and whitespace in untouched code remain intact.

**Fallback Pattern (`useWriter.ts`):**
When `sourceLocation` is provided, uses AST writer. Otherwise falls back to regex-based editing.

**Console Testing:**
```javascript
// In browser console:
window.novum.testEdit()  // Tests AST editing on selected element
window.novum.updateClasses("bg-red-500", source)
window.novum.updateText("New Text", source)
window.novum.deleteElement(source)
window.novum.insertChild(source, "<div>Child</div>")
```

**Types (`src/lib/inspection/types.ts`):**
```typescript
interface SourceLocation {
  fileName: string;  // e.g., "/App.tsx"
  line: number;      // 1-indexed
  column: number;    // 0-indexed
}

interface SelectedElement {
  // ... existing fields ...
  source?: SourceLocation;  // Precise location from AST instrumentation
  pageId?: string;          // Which FlowFrame page this selection came from (Flow View only)
}

interface ContextMenuPayload extends SelectedElement {
  menuX: number;  // Iframe-local cursor X
  menuY: number;  // Iframe-local cursor Y
}
```

### PostMessage Protocol (Host ↔ Iframe)

| Message Type | Direction | Purpose |
|--------------|-----------|---------|
| `novum:inspection-mode` | Host → Iframe | Toggle inspection mode |
| `novum:element-selected` | Iframe → Host | Report selected element details |
| `novum:request-dom-tree` | Host → Iframe | Request DOM tree for layers panel |
| `novum:dom-tree-response` | Iframe → Host | Return serialized DOM tree |
| `novum:highlight-element` | Host → Iframe | Highlight element by selector |
| `novum:select-element` | Host → Iframe | Select element by selector |
| `novum:update-classes` | Host → Iframe | Instant DOM class update (optimistic UI) |
| `novum:rollback-classes` | Host → Iframe | Revert classes on VFS write failure |
| `novum:update-text` | Host → Iframe | Instant DOM text update (optimistic UI) |
| `novum:rollback-text` | Host → Iframe | Revert text on VFS write failure |
| `novum:find-drop-target` | Host → Iframe | Query for drop target at coordinates |
| `novum:drop-target-found` | Iframe → Host | Return drop target info (container, source location) |
| `novum:show-drop-zone` | Host → Iframe | Show green drop zone indicator at coordinates |
| `novum:hide-drop-zone` | Host → Iframe | Hide drop zone indicator |
| `novum:swap-elements` | Host → Iframe | Swap element with sibling (keyboard reordering) |
| `novum:keyboard-event` | Iframe → Host | Forward arrow key presses from iframe |
| `novum:flow-mode-state` | Host → Iframe | Toggle flow mode (navigation interception) |
| `novum:navigation-intent` | Iframe → Host | Navigation requested in flow mode (targetRoute, sourceRoute) |
| `novum:context-menu` | Iframe → Host | Right-click context menu with element info + cursor coords |

### AI Chat Integration

**Chat API (`src/app/api/chat/route.ts`)**
- Uses Vercel AI SDK with Gemini 2.5 Pro
- System prompt instructs AI to write full file contents with `file="path"` attribute
- Includes multi-page app instructions for `/flow.json` updates

**Stream-to-VFS Flow:**
1. User sends message → API streams response
2. ChatTab detects code blocks with ` ```lang file="/path" ` pattern
3. Extracts path and content, runs **Gatekeeper** on `.tsx/.ts/.jsx/.js` files (see below)
4. Calls `writeFile(path, gatedCode)` — gatekeeper-corrected code written to VFS
5. SandpackProvider re-renders preview instantly

**Persistent Chat History:**
- `ChatTab` is always mounted in `RightPanel` (uses CSS `hidden` class, not conditional rendering)
- Switching between Chat/Design tabs or App Preview/Design System views preserves `useChat` state
- Prevents `useChat` hook from being destroyed and recreated on tab switches

**Right-Click "Add to AI Chat" Context Menu:**

Allows users to pin specific elements as context for AI chat by right-clicking in inspection mode.

**Key Files:**
- `src/hooks/useChatContextStore.ts` - Zustand store for pinned elements and context menu state
- `src/components/canvas/InspectorContextMenu.tsx` - Floating context menu component

**Pinned Element Store (`src/hooks/useChatContextStore.ts`):**
```typescript
interface PinnedElement {
  id: string;              // "fileName:line:column"
  tagName: string;
  displayLabel: string;    // e.g. "<div.sidebar>" or "<Button>"
  source: SourceLocation;
  className?: string;
  textContent?: string;
}
```
- `pinnedElements` array (deduped by `id`)
- `contextMenu` state (visible, x, y, element)
- Actions: `showContextMenu`, `hideContextMenu`, `pinElement`, `unpinElement`, `clearPinnedElements`

**Context Menu Component (`src/components/canvas/InspectorContextMenu.tsx`):**
- Fixed-position `z-[99999]` overlay with "Add to AI Chat" menu item
- Dismisses on click outside, Escape, or scroll (delayed by `requestAnimationFrame` to avoid self-dismiss)
- Viewport-edge clamping to stay visible

**Flow:**
1. Right-click in iframe (inspection mode ON) → `handleContextMenu` in inspector script
2. Posts `novum:element-selected` (updates selection) then `novum:context-menu` (with `menuX`/`menuY`)
3. `page.tsx` listener finds source iframe via `event.source`, converts iframe-local coords to screen-space with scale correction
4. `useChatContextStore.showContextMenu()` → `InspectorContextMenu` renders at position
5. User clicks "Add to AI Chat" → `pinElement()`, switches to Chat tab
6. `ChatTab` shows blue chip above input; user types message
7. `handleSubmit` includes full file content with `>>>` markers on target lines in `vfsContext`
8. Pinned elements cleared after successful send

**Coordinate Conversion (iframe → screen):**
```typescript
const scaleX = iframeRect.width / iframe.clientWidth;
const screenX = iframeRect.left + menuX * scaleX;
```
Handles canvas zoom: `clientWidth` is unscaled CSS width, `rect.width` is visual width after transforms.

**Pinned Element Chips (ChatTab):**
- Blue pills (`bg-blue-50 text-blue-700 font-mono`) with X button to remove
- "Clear all" link when >1 element pinned
- On send: full file content included with `>>>` arrow markers highlighting the target line

### Design System Gatekeeper (`src/lib/ai/`)

Deterministic transpiler that intercepts AI-generated code before it hits the VFS, enforcing the design system. Hooked into `ChatTab.tsx` at the `writeFile` call.

**Key Files:**
- `src/lib/ai/gatekeeper.ts` - Orchestrator, runs all rules in order
- `src/lib/ai/color-mapper.ts` - Rule 2: Color enforcement
- `src/lib/ai/spacing-mapper.ts` - Rule 3: Spacing normalization
- `src/lib/ai/layout-mapper.ts` - Rule 4: Layout enforcement (grid + 8px rhythm)
- `src/lib/ai/typography-mapper.ts` - Rule 5: Typography enforcement (semantic text classes)
- `src/lib/ai/component-promoter.ts` - Rule 1: Component promotion
- `src/lib/ai/tailwind-palette.ts` - Tailwind default palette hex values (22 families × 11 shades)

**Pipeline (order matters):**
1. **Component Promotion** — `<button>` → `<Button>`, `<input>` → `<Input>`, etc. (AST-based, adds imports)
2. **Color Enforcement** — `bg-blue-500` → `bg-primary`, `text-[#ef4444]` → `text-destructive` (OKLCH distance matching against `/tokens.json` palettes)
3. **Spacing Normalization** — `p-[11px]` → `p-3`, `gap-[23px]` → `gap-6` (snaps to Tailwind scale)
4. **Layout Enforcement** — `gap-7` → `gap-8`, `grid-cols-[5]` → `grid-cols-5` (8px rhythm + grid normalization)
5. **Typography Enforcement** — `text-3xl` → `text-h2`, `text-xs` → `text-caption` (maps to semantic typography scale). Also strips redundant weight classes (`text-h1 font-bold` → `text-h1`)

**What it catches:**
- Tailwind palette classes (`bg-blue-500`), arbitrary hex/rgb (`bg-[#3b82f6]`), named colors (`text-white`), with variants (`hover:bg-blue-500`) and opacity modifiers (`bg-blue-500/50`)
- Arbitrary spacing on padding/margin/gap prefixes only (not `w-[350px]` or `h-[200px]`)
- Raw HTML `<button>`, `<input>`, `<textarea>`, `<label>` elements (bails out on `ref`, `style`, spread attrs, complex handlers)
- Off-rhythm spacing (>= 16px): `gap-5` → `gap-6`, `p-7` → `p-8`, `m-9` → `m-10`, `gap-11` → `gap-12` (8px grid enforcement)
- Arbitrary grid classes: `grid-cols-[5]` → `grid-cols-5`, `grid-cols-[repeat(5,minmax(0,1fr))]` → `grid-cols-5`, `col-span-[15]` → `col-span-12` (clamped 1–12)
- Raw Tailwind text size classes: `text-xs` → `text-caption`, `text-sm` → `text-body-sm`, `text-base` → `text-body`, `text-lg`/`text-xl` → `text-h4`, `text-2xl` → `text-h3`, `text-3xl` → `text-h2`, `text-4xl`+ → `text-h1`
- Redundant weight classes alongside semantic typography: `font-bold`/`font-semibold` with heading classes, `font-normal` with body classes

**NOT enforced by layout mapper:** `space-x/y` utilities (inter-child, often small), width/height classes, values < 16px, custom pixel templates like `grid-cols-[200px_1fr]`

**Fail-safe:** Each phase wrapped in try/catch. If anything fails, original code passes through unchanged. Only gates `.tsx/.ts/.jsx/.js` files.

**Color mapping is adaptive:** Reads `/tokens.json` to find the nearest project palette via OKLCH Euclidean distance. If the user's brand is red (Brutalist), `bg-red-500` maps to `bg-primary`, not `bg-destructive`.

### Token System

**Token Studio (`src/components/editor/TokenStudio/`)**
Three-tier design token architecture:
- **Primitives**: Raw color palettes (brand, neutral, success, warning, error, info) with 50-950 scales
- **Semantics**: Meaningful mappings (primary → brand-600) with light/dark mode variants
- **Components**: Token-aware UI components

**Token Studio Views:**
- **Presets View** (default): Quick-apply complete design systems with one click
- **Customise View**: Fine-tune palettes, semantic mappings, component specs, typography scale, and spacing density via tabs

**Style Presets (`src/lib/tokens/presets.ts`):**

| Preset | Philosophy | Brand Color | Typography | Scale | Spacing | Radius | Borders |
|--------|-----------|-------------|------------|-------|---------|--------|---------|
| **Brutalist** | Raw, bold, uncompromising | `#FF0000` (pure red) | JetBrains Mono | 15px / 1.333 / 800 | 3px (Tight) | `0` (none) | 1px on all |
| **Soft** | Gentle, warm, approachable | `#8B5CF6` (violet) | Plus Jakarta Sans | 16px / 1.2 / 600 | 5px (Comfortable) | `1rem` (large) | 0 on most |
| **Neon** | Vibrant, electric, futuristic | `#22D3EE` (cyan) | Outfit | 16px / 1.25 / 700 | 4px (Standard) | `0.5rem` (medium) | 1px on all |
| **Editorial** | Refined, typographic | `#1E3A8A` (navy) | Playfair Display | 17px / 1.25 / 700 | 4px (Standard) | `0.375rem` (small) | 1px on all |
| **Terra** | Earthy, grounded | `#2F6B4F` (forest) | Lora | 16px / 1.2 / 600 | 5px (Comfortable) | `0.75rem` (medium) | 0 on most |
| **Arctic Glass** | Cool, clean, technical | `#0E7490` (cyan) | Space Grotesk | 16px / 1.25 / 700 | 4px (Standard) | `0.5rem` (medium) | 1px on all |
| **Sunset Pop** | Warm, energetic | `#EA580C` (orange) | Poppins | 16px / 1.25 / 700 | 4.5px (Standard) | `0.5rem` (medium) | 0 on most |
| **Noir Luxe** | Dark premium, metallic | `#D4A017` (gold) | Cormorant Garamond | 17px / 1.3 / 600 | 3.5px (Standard) | `0.25rem` (small) | 1px on all |

Scale column format: `baseSize / scaleRatio / weightBold` (all presets use weightRegular: 400)

**Preset utility palettes:**

| Palette | Brutalist | Soft | Neon |
|---------|-----------|------|------|
| **error** | `#B91C1C` (dark crimson, distinct from brand) | `#F43F5E` (rose) | `#FB7185` (neon pink) |
| **success** | `#059669` (bold emerald) | `#10B981` (emerald) | `#4ADE80` (neon green) |
| **warning** | `#D97706` (bold amber) | `#F59E0B` (amber) | `#FBBF24` (electric yellow) |
| **info** | `#2563EB` (bold blue) | `#6366F1` (indigo) | `#A855F7` (purple) |
| **neutral** | `generateNeutralScale()` (HSL grays) | `#78716C` (warm stone) | `#64748B` (slate) |

**Preset design decisions:**
- Each preset's `error` palette is distinct from `brand` so `bg-primary` and `bg-destructive` are visually distinguishable
- Neutral bases are dark enough (OKLCH L ≤ 0.55) for `muted-foreground` (neutral-500) to pass WCAG AA contrast against white
- Neon uses `brand` (cyan) for accent and `info` (purple) for secondary — two distinct highlight colors
- All semantic bg/fg pairings target ≥ 4.5:1 contrast ratio (WCAG AA)

Each preset provides a complete `TokenState` object including:
- Color palettes (brand, neutral, success, warning, error, info)
- Semantic color mappings for light/dark modes
- Component specs (radius, border, shadow per component)
- Global settings (radius scale, font family, typography scale, spacing density)

Key files:
- `/tokens.json` (VFS) - Single source of truth for design tokens
- `/globals.css` (VFS) - Auto-generated CSS variables from tokens.json
- `src/hooks/useTokens.ts` - React hook for token management (`applyPreset()` for presets)
- `src/lib/tokens/types.ts` - TypeScript types for `GlobalSettings` (typography, spacing)
- `src/lib/tokens/defaults.ts` - Default token values
- `src/lib/tokens/css-generator.ts` - Generates CSS variables including `--text-h1` through `--text-caption`, `--spacing-unit`, `--font-weight-*`
- `src/lib/tokens/presets.ts` - Preset definitions with complete TokenState objects
- `src/lib/tailwind-config.ts` - Tailwind config with variable-driven spacing scale + semantic fontSize classes
- `src/components/editor/TokenStudio/PresetPanel.tsx` - Preset selection UI
- `src/components/editor/TokenStudio/PresetCard.tsx` - Individual preset card with color preview
- `src/components/editor/TokenStudio/TypographyTab.tsx` - Base size + scale ratio sliders with live preview
- `src/components/editor/TokenStudio/SpacingTab.tsx` - Base unit slider with density label + visual scale

**Typography Scale System:**

Modular scale generating 7 semantic text levels from two controls: `baseSize` (px) and `scaleRatio`. Formula: `sizeRem = (baseSize * ratio^step) / 16`.

| Level | Step | Line-height | Weight | Usage |
|-------|------|-------------|--------|-------|
| `text-h1` | +4 | 1.1 | bold | Page titles, hero headings |
| `text-h2` | +3 | 1.2 | bold | Section headings |
| `text-h3` | +2 | 1.3 | bold | Subsection headings |
| `text-h4` | +1 | 1.4 | bold | Minor headings, large labels |
| `text-body` | 0 | 1.5 | regular | Paragraphs, default text |
| `text-body-sm` | -1 | 1.5 | regular | Secondary info, small text |
| `text-caption` | -2 | 1.4 | regular | Metadata, timestamps |

CSS variables: `--text-h1`, `--text-h1-lh`, `--font-weight-bold`, `--font-weight-regular`

Typography classes set `font-size`, `line-height`, and `font-weight` only — NOT `color`. Color is applied separately via semantic color classes (`text-foreground`, `text-muted-foreground`, etc.) which switch in dark mode.

**Spacing Density System:**

Single `baseUnit` (px) controls all spacing utilities globally. Tailwind's entire `theme.spacing` scale is overridden with `calc(var(--spacing-unit) * N)`.

CSS variable: `--spacing-unit` (baseUnit / 16 rem). Affects `p`, `m`, `gap`, `w`, `h`, `size`, `inset` — all spacing utilities.

Density labels: <3.5px "Tight", 3.5-4.5px "Standard", 4.5-5.5px "Comfortable", >5.5px "Spacious".

**Token Migration (`useTokens.ts`):**
When loading existing `/tokens.json` that lacks the new fields, `initializeTokens()` backfills defaults: `baseSize: 16`, `scaleRatio: 1.25`, `weightRegular: 400`, `weightBold: 700`, `spacing.baseUnit: 4`.

### VFS File Structure (Inside Sandpack)

The virtual app follows Shadcn/ui patterns:
- `/package.json` - Dependencies (AI updates when adding libraries)
- `/App.tsx` - Main application component
- `/index.tsx` - React entry point with hash-based router (`useRouter()` hook)
- `/flow.json` - Multi-page flow manifest for Flow View
- `/design-system.tsx` - Component gallery (27 components)
- `/globals.css` - Tailwind + CSS variables for theming
- `/tokens.json` - Design token definitions
- `/components/ui/*.tsx` - Shadcn-style components (use `cn()` for class merging)
- `/lib/utils.ts` - `cn()` utility for class merging

### Pre-built Component Library (27 Components)

The VFS includes a comprehensive set of production-ready components. All components:
- Use semantic tokens only (no hardcoded colors like `bg-blue-500`)
- Are pure React (no external dependencies like Radix)
- Use named exports (`export function Component`)
- Support the `cn()` utility for className merging

**Form Controls:**
| Component | Path | Key Exports | Notes |
|-----------|------|-------------|-------|
| Button | `/components/ui/button.tsx` | Button | `variant`, `size` props |
| Input | `/components/ui/input.tsx` | Input | Standard input props |
| Textarea | `/components/ui/textarea.tsx` | Textarea | Multi-line text input |
| Checkbox | `/components/ui/checkbox.tsx` | Checkbox | `checked`, `onCheckedChange` |
| Switch | `/components/ui/switch.tsx` | Switch | `checked`, `onCheckedChange` |
| Radio Group | `/components/ui/radio-group.tsx` | RadioGroup, RadioGroupItem | `defaultValue`, `onValueChange` |
| Toggle | `/components/ui/toggle.tsx` | Toggle | `pressed`, `onPressedChange` |
| Slider | `/components/ui/slider.tsx` | Slider | `value`, `onValueChange` |
| Select | `/components/ui/select.tsx` | Select, SelectOption | Native HTML select wrapper |
| Label | `/components/ui/label.tsx` | Label | Form labels |
| Date Picker | `/components/ui/date-picker.tsx` | DatePicker | Calendar dropdown with `value`, `onChange` |

**Layout & Display:**
| Component | Path | Key Exports | Notes |
|-----------|------|-------------|-------|
| Card | `/components/ui/card.tsx` | Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter | Container component |
| Table | `/components/ui/table.tsx` | Table, TableHeader, TableBody, TableRow, TableHead, TableCell | Data tables |
| Separator | `/components/ui/separator.tsx` | Separator | `orientation` prop |
| Aspect Ratio | `/components/ui/aspect-ratio.tsx` | AspectRatio | `ratio` prop (e.g., 16/9) |

**Feedback:**
| Component | Path | Key Exports | Notes |
|-----------|------|-------------|-------|
| Alert | `/components/ui/alert.tsx` | Alert, AlertTitle, AlertDescription | `variant`: "default" or "destructive" |
| Progress | `/components/ui/progress.tsx` | Progress | `value`, `max` props |
| Skeleton | `/components/ui/skeleton.tsx` | Skeleton | Loading placeholder with pulse |
| Toast | `/components/ui/toast.tsx` | ToastProvider, Toaster, useToast | Provider-based toast system |
| Badge | `/components/ui/badge.tsx` | Badge | `variant` prop |

**Navigation:**
| Component | Path | Key Exports | Notes |
|-----------|------|-------------|-------|
| Tabs | `/components/ui/tabs.tsx` | Tabs, TabsList, TabsTrigger, TabsContent | `defaultValue`, `onValueChange` |
| Accordion | `/components/ui/accordion.tsx` | Accordion, AccordionItem, AccordionTrigger, AccordionContent | Collapsible sections |
| Breadcrumb | `/components/ui/breadcrumb.tsx` | Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbSeparator, BreadcrumbPage | Navigation trail |

**Overlays:**
| Component | Path | Key Exports | Notes |
|-----------|------|-------------|-------|
| Dialog | `/components/ui/dialog.tsx` | Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription | Modal dialogs |
| Tooltip | `/components/ui/tooltip.tsx` | Tooltip, TooltipProvider, TooltipTrigger, TooltipContent | Hover/focus tooltips |
| Popover | `/components/ui/popover.tsx` | Popover, PopoverTrigger, PopoverContent | Click-triggered content |

**Display:**
| Component | Path | Key Exports | Notes |
|-----------|------|-------------|-------|
| Avatar | `/components/ui/avatar.tsx` | Avatar, AvatarImage, AvatarFallback | User avatars |

**Key Files:**
- `src/lib/vfs/templates/shadcn-core.ts` - Component template strings for VFS
- `src/lib/canvas/component-registry.tsx` - Registry with preview configs for Component Picker
- `src/lib/canvas/code-generator.ts` - JSX code generation from ghost elements
- `src/lib/vfs/templates/design-system-rich.ts` - Design System showcase page

### Two Canvas Modes

The app supports two canvas modes, toggled via `ViewModeToggle` (attached to each frame at `-left-12`):

**Prototype Mode:**
- Single `Frame` on infinite canvas
- Pan/zoom/resize the preview
- Drawing tools (toolbar + ghost elements) + visual editing
- State: `viewport` (x, y, scale)

**Flow Mode:**
- Multi-page visualization with full FlowFrame nodes (always mounted, no virtualization)
- Orthogonal connections between pages
- Full editing: drawing tools, ghost elements, inspection, RightPanel — all work identically to Prototype mode
- Ghost drop targets auto-detected across multiple frames
- Click page → navigates to that route in Prototype mode
- State: `flowViewport` (separate pan/zoom)
- Component dialog uses `flowViewport` for center calculation when in flow mode

### Design Principles

1. **Single Source of Truth**: VFS is the only state. If it's not in a file, it doesn't exist.
2. **No Node State**: No element trees or node graphs—UI rendered purely by bundling files.
3. **Standard Patterns**: Use Tailwind utilities and Shadcn patterns. Avoid custom CSS.
4. **No External Graph Libraries**: Flow View layout must be dependency-free (dagre/reactflow cause SSR issues).
5. **Native Canvas**: Use DOM + CSS transforms for canvas, not WebGL or `<canvas>` element.

### Visual Editor Constraints

**What IS editable:**
- Static `className="..."` strings
- `cn()`, `clsx()`, `twMerge()` calls with string literal arguments
- Text content in simple text elements (no nested children)
- Component props with string or boolean values (e.g., `variant="outline"`, `disabled`)

**What is NOT editable:**
- Design system component internals (e.g., Button's internal `<button>` element)
- Classes from variables: `className={styles}`
- Hard-coded Tailwind palette colors (must use semantic tokens)
- Expression props (e.g., `onClick={handler}`) - displayed as read-only
- Internal props: `children`, `key`, `ref`, `data-source-loc`

## Tech Stack

- Next.js 16 (App Router, TypeScript)
- Tailwind CSS v4
- `@codesandbox/sandpack-react` for VFS runtime
- `lucide-react` for icons
- `ai` + `@ai-sdk/google` + `@ai-sdk/react` for Gemini integration
- `zustand` for lightweight global state (canvas store, chat context store)
- `sonner` for toast notifications
- `@babel/standalone` for AST instrumentation (source location injection)

**Canvas is pure DOM** - No framer-motion, react-spring, or canvas libraries for the main canvas. Uses native Pointer Events API and CSS transforms.

## Implementation Roadmap

- **Phase 1** ✅ Foundation (VFS, Canvas, Frame, Sandpack)
- **Phase 2** ✅ Agentic Loop (Chat + AI writes to VFS)
- **Phase 3** ✅ Dynamic Dependencies (AI manages `/package.json`)
- **Phase 4** ✅ Design System Engine (Token Studio, component gallery)
- **Phase 5** ✅ AI Token Integration (semantic tokens, `/tokens.json` in context)
- **Phase 6** ✅ Visual Editor (Inspector, Auto Layout, Colors & Typography)
- **Phase 7** ✅ Instant Preview (Optimistic UI with debounced VFS writes)
- **Phase 8** ✅ Manual Design Tools (Canvas toolbar, ghost elements)
  - 8.1 ✅ Figma-style ghosts (selection, resize handles, keyboard delete, global canvas overlay, borderless component styling)
  - 8.2 ✅ Ghost-to-code generation (materialization, drop target detection, visual drop zone indicator)
- **Phase 9** ✅ Flow View (Multi-page visualization, smart orthogonal routing, draggable nodes)
- **Phase 10** ✅ AST Architecture (10.1 GPS, 10.2 Surgeon, 10.3 Optimistic Text Editing, 10.4 Component Prop Inspector)
- **Phase 11** ✅ Keyboard Reordering (Arrow key element swapping with FLIP animation, persistent selection)
- **Phase 12** ✅ Token Studio Presets (Brutalist, Soft, Neon one-click style presets with Customise flow)
- **Phase 13** ✅ Flow View Navigation Interception (Navigation buttons animate viewport to target frame at 100% zoom)
- **Phase 14** ✅ AI Chat Enhancements (Right-click "Add to AI Chat" context menu with pinned element chips, persistent chat history across tab/view switches)
- **Phase 15** ✅ Flow View Full Editing (Drawing tools, ghost elements, multi-frame drop detection, targeted iframe messaging, always-mounted iframes)
- **Phase 16** ✅ Design System Enforcement Gatekeeper (Color enforcement, spacing normalization, component promotion — deterministic transpiler before VFS writes)
  - 16.1 ✅ Preset accessibility audit (Brutalist: distinct error palette, usable utility colors; Soft: darker neutral for muted contrast; Neon: distinct accent/secondary, muted-foreground AA compliance)
- **Phase 17** ✅ Structural Layout Enforcement (Grid normalization + 8px rhythm enforcement in gatekeeper pipeline)
  - 17b ✅ Dynamic Typography & Spacing Token Engine (Modular type scale, spacing density, semantic text classes, gatekeeper typography enforcement, per-preset values)
- **Phase 18** ✅ Layers Panel Auto-Open (Auto-open on element selection, ancestor expansion, scroll-into-view, Flow View multi-frame support)
