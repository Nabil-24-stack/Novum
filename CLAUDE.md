# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Novum is a **Code-First UI Builder** where the source of truth is a Virtual File System (VFS) running a live React application in the browser via Sandpack. The AI writes production-ready React code directly into the VFS—no intermediate JSON representations. A strategy layer guides ideation through personas, journey maps, and manifesto before building.

## Commands

```bash
npm run dev      # Start development server at localhost:3000
npm run build    # Production build
npm run lint     # Run ESLint
```

## Environment Setup

Copy `.env.example` to `.env.local` and add your API keys:
```bash
# AI Providers
GOOGLE_GENERATIVE_AI_API_KEY=your_key_here
ANTHROPIC_API_KEY=your_key_here

# Supabase (auth, persistence, publishing)
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key_here
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
```

## App Structure

| Route | Page | Purpose |
|-------|------|---------|
| `/` | Dashboard | Project list, create project, upload research documents (PDF/DOCX) |
| `/login` | Login | Supabase auth |
| `/project/[id]` | Project Editor | Canvas, chat, strategy phases, visual editor, flow view |
| `/p/[slug]` | Published Viewer | Read-only Sandpack rendering of published app |

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

### Multi-Model AI Support

Four AI models available via Vercel AI SDK, selectable per-request in ChatTab:

| Model ID | Provider | Default |
|----------|----------|---------|
| `claude-sonnet-4-6` | Anthropic | Yes |
| `gemini-2.5-pro` | Google | |
| `gemini-3-pro-preview` | Google | |
| `gpt-5.2` | OpenAI | |

All API routes share a `ModelId` type and `getModel()` factory function. Model ID is passed in the request body.

### API Routes

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/chat` | POST | Multi-model streaming chat with strategy phases (120s) |
| `/api/build-app` | POST | Build all pages sequentially or incrementally (300s) |
| `/api/build-page` | POST | Build individual page for parallel builds (120s) |
| `/api/verify` | POST | Error detection + AI fix generation (60s) |
| `/api/evaluate-annotations` | POST | Generate product brain decision connections (60s) |
| `/api/extract-document` | POST | PDF/DOCX text extraction via `unpdf`/`mammoth` (30s) |
| `/api/events` | POST | Analytics event logging to Supabase |
| `/api/projects` | GET/POST | Project CRUD |
| `/api/projects/[id]` | GET/PATCH/DELETE | Individual project operations |
| `/api/publish` | POST | Publish app to `/p/[slug]` |

### Strategy System (`src/hooks/useStrategyStore.ts`)

Guided product strategy phases before code generation:

**Phases:** `hero` → `problem-overview` → `ideation` → `solution-design` → `building` → `complete`

Each phase selects a different system prompt in `/api/chat` (via `strategyPhase` field). The AI generates structured JSON blocks alongside chat text:

- **Manifesto** (`type="manifesto"`) — Problem statement, jobs-to-be-done, success metrics, constraints
- **Personas** (`type="personas"`) — User profiles with goals, pain points, quotes
- **Journey Maps** (`type="journey-maps"`) — Per-persona stage maps with actions, thoughts, emotions, opportunities
- **Ideas** (`type="ideas"`) — Innovation candidates with illustrations and ratings
- **Key Features** (`type="features"`) — Core value propositions
- **User Flows** (`type="user-flows"`) — Page-to-page navigation diagrams
- **Insights** (`type="insights"`) — Research findings with evidence (from uploaded documents)
- **Confidence** (`type="confidence"`) — Scoring across dimensions (target user, core problem, domain context, etc.)

**Key files:** `src/hooks/useStrategyStore.ts`, `src/lib/ai/strategy-prompts.ts`, `src/components/strategy/` (ManifestoCard, PersonaCard, JourneyMapCard, IdeaCard, KeyFeaturesCard, UserFlowCard, InsightsCard)

### Product Brain (`src/hooks/useProductBrainStore.ts`)

Tracks which code elements are connected to which strategy artifacts. Stored as `/product-brain.json` in VFS.

**DecisionConnection** links a page section to personas, jobs-to-be-done, journey stages, and insights with a rationale. Connections are generated by `/api/evaluate-annotations` which analyzes page code against strategy context.

**Key files:** `src/lib/product-brain/types.ts`, `src/hooks/useProductBrainStore.ts`, `src/hooks/useAnnotationStore.ts`, `src/hooks/useAnnotationResolution.ts`, `src/components/canvas/StrategyAnnotations.tsx`

### Parallel Build System

Multi-page build orchestration with per-page verification:

- **`useParallelBuild`** — Orchestrates builds via `/api/build-page` (individual) or `/api/build-app` (all-at-once). Supports fresh builds and incremental rebuilds
- **`useStreamingStore`** (Zustand) — Tracks per-page state: `status` (pending/streaming/completed/error), `verificationStatus` (idle/capturing/reviewing/fixing/passed/failed), `verificationAttempt`, `annotationEvaluation`
- **Foundation page** — First page built; subsequent pages can receive error context from prior pages
- **Flow:** Stream response → `parseStreamingContent` → gatekeeper → `writeFile` → rebuild App.tsx → verify → evaluate annotations

**Key files:** `src/hooks/useParallelBuild.ts`, `src/hooks/useStreamingStore.ts`, `src/lib/streaming-parser.ts`

### Verification Loop (`src/lib/verification/`)

Self-healing error detection and fix loop:

1. **Pre-validation** (`pre-validator.ts`) — Deterministic checks (missing imports/deps) before AI
2. **Sandpack errors** — Native compile errors from the bundler
3. **AI review** (`/api/verify`) — Sends error text + context files to AI for fix generation
4. **Retry**: Max 3 AI attempts. 5xx errors retry without consuming attempts. Deterministic syntax fixes don't consume attempts
5. **Focused section mode**: Files >200 lines send only ~100 lines around the error to the AI
6. If verification fails, annotation evaluation is skipped

**Key files:** `src/lib/verification/verify-loop.ts`, `src/lib/verification/pre-validator.ts`, `src/lib/verification/screenshot-capture.ts`

### Auth + Project Persistence

- **Supabase auth** via `@supabase/ssr` with `requireAuth()` guard on API routes
- **Project CRUD**: `/api/projects` (list/create), `/api/projects/[id]` (get/update/delete)
- **`useProjectPersistence`**: Debounced (5s) auto-save of VFS files, chat messages, canvas layout, strategy, product brain, documents. `beforeunload` handler with `keepalive: true`

### Research Documents

- PDF/DOCX upload on dashboard, extracted via `/api/extract-document` (`unpdf` + `mammoth`, 100K char limit)
- Stored in `useDocumentStore`, injected into AI context as `documentContext`
- AI generates insights with per-insight source attribution

### Publishing

- `/api/publish` saves VFS files + name to `published_apps` Supabase table, returns slug
- `/p/[slug]` renders read-only Sandpack with the saved files

### Analytics

Fire-and-forget event tracking via `/api/events` → `activity_events` table. Event types: `chat_message_sent`, `ai_response_complete`, `ai_response_error`, `code_generated`, `verification_result`. Client: `src/lib/analytics/track-event.ts`

### Canvas System (`src/components/canvas/`)

Built with **native DOM + CSS transforms** (no canvas/WebGL libraries).

**Core Components:** `InfiniteCanvas.tsx` (pan/zoom container), `Frame.tsx` (draggable/resizable Sandpack preview), `CanvasOverlay.tsx` (drawing layer), `CanvasToolbar.tsx` (floating tool buttons), `GhostFrame.tsx`/`GhostText.tsx`/`GhostComponent.tsx` (placeholder elements)

**Coordinate conversion:** `worldX = (screenX - viewport.x) / viewport.scale`

**Canvas Tools:** Cursor (V) — select/move/resize ghosts; Frame (F) — draw frame rectangles; Text (T) — click for text input; Component (C) — opens component picker. Keyboard: Delete/Backspace removes ghost, Escape deselects.

**Ghost Elements:** Temporary Figma-style placeholders in the Host App. Can be dragged onto Frame to materialize as real code via `useMaterializer.ts`. Drop target detection queries the iframe for valid containers at the drop point, with a green overlay indicator showing where the element will be inserted.

**Component Registry (`src/lib/canvas/component-registry.tsx`):** Maps component keys to preview configs for the Component Picker dialog.

### Two Canvas Modes

Toggled via `ViewModeToggle`:

- **Prototype Mode** — Single Frame on infinite canvas. Pan/zoom/resize, drawing tools, visual editing. State: `viewport`
- **Flow Mode** — Multi-page FlowFrame nodes (always mounted, no virtualization) with orthogonal connections. Full editing identical to Prototype mode. Click page → navigates to that route. State: `flowViewport`

### Flow View System (`src/components/flow/`, `src/lib/flow/`)

**Key Components:** `FlowCanvas.tsx` (main container), `FlowFrame.tsx` (full SandpackWrapper + Frame per page), `FlowConnections.tsx` (SVG orthogonal connectors with animated dashed lines)

**Flow Manifest (`/flow.json` in VFS):** `{ pages: [{ id, name, route }], connections: [{ from, to, label }] }`. Hook: `useFlowManifest.ts`

**Navigation Interception (`useFlowNavigation.ts`):** In Flow View, navigation buttons animate viewport to target frame at 100% zoom instead of navigating the iframe. Uses `novum:flow-mode-state` / `novum:navigation-intent` postMessage protocol.

**Auto-Layout (`src/lib/flow/auto-layout.ts`):** BFS topological sort, no external dependencies (dagre/reactflow cause SSR issues).

### Visual Editor / Inspection System

- **`useInspection.ts`** — Manages inspection mode and selected element state via postMessage
- **Inspector Script (`src/lib/inspection/inspector-script.ts`)** — Injected into Sandpack iframe; hover outlines, click selection, right-click context menu, reads `data-source-loc` attributes
- **Class Manager (`src/lib/inspection/class-manager.ts`)** — Tailwind class manipulation (updateClass, detectLayoutMode, detectFlexDirection, etc.)
- **`useWriter.ts`** — className/text replacement in VFS files; supports `cn()`/`clsx()`/`twMerge()`; component prop operations
- **`useDraftEditor.ts`** — Optimistic UI with 3s debounced VFS writes; coordinates class and text drafts

**Layers Panel:** Auto-opens on element selection, expands ancestor nodes via `findNodePath()`, scrolls into view. Flow View support: `FlowFrame` auto-opens layers when `selectedPageId` matches.

**Keyboard Reordering (`useKeyboardMove.ts`):** Arrow keys swap elements based on parent flex direction. Flow: keyboard-event → direction mapping → optimistic DOM swap (FLIP animation) → VFS AST update → source location update.

### AST Instrumentation System (`src/lib/ast/`, `src/hooks/useInstrumentedFiles.ts`)

Precise element-to-source mapping via shadow files with `data-source-loc` attributes.

**Shadow File Pattern:** Clean VFS files for editing, instrumented shadow files for Sandpack preview.

**Key Files:** `src/lib/ast/instrument.ts` (Babel transform), `src/lib/ast/writer.ts` (surgical code editor), `src/lib/ast/import-manager.ts` (import management), `src/hooks/useInstrumentedFiles.ts` (shadow file generation with caching), `src/hooks/useMaterializer.ts` (ghost-to-code conversion)

**AST Writer Operations:** `updateProp`, `updateText`, `insertChild`, `deleteNode`, `swapSibling`, `getProps`, `removeProp`. Uses surgical string splicing to preserve formatting.

**Fallback:** When `sourceLocation` is provided, uses AST writer. Otherwise falls back to regex-based editing in `useWriter.ts`.

### PostMessage Protocol (Host ↔ Iframe)

**Host → Iframe:** `inspection-mode`, `update-classes`, `update-text`, `rollback-classes`, `rollback-text`, `show/hide-drop-zone`, `find-drop-target`, `swap-elements`, `highlight-element`, `select-element`, `request-dom-tree`, `flow-mode-state`, `strategy-track-start`

**Iframe → Host:** `element-selected`, `dom-tree-response`, `drop-target-found`, `keyboard-event`, `navigation-intent`, `context-menu`, `strategy-bounds-batch`

### AI Chat Integration

**Chat API (`src/app/api/chat/route.ts`)** — Multi-model streaming (4 providers via `getModel()`). System prompt selected by `strategyPhase` (problem-overview, ideation, solution-design, building). Accepts `vfsContext`, `documentContext`, `currentPageId`.

**Stream-to-VFS Flow:**
1. API streams response → ChatTab extracts code blocks with ` ```lang file="/path" ` pattern
2. Runs **Gatekeeper** on `.tsx/.ts/.jsx/.js` files (7-phase pipeline, see below)
3. Writes gated code to VFS → SandpackProvider re-renders
4. Post-processing: annotation cleanup (removed `data-strategy-id`), flow.json sync, route consistency validation

**Right-Click "Add to AI Chat":** Pinned elements via `useChatContextStore` (Zustand). Right-click in inspection mode → context menu → pin element → shows as chip in ChatTab → on send, includes full file content with `>>>` markers on target lines. Key files: `src/hooks/useChatContextStore.ts`, `src/components/canvas/InspectorContextMenu.tsx`

**Persistent Chat History:** `ChatTab` always mounted (CSS `hidden`, not conditional rendering). Preserves `useChat` state across tab/view switches.

### Design System Gatekeeper (`src/lib/ai/`)

Deterministic transpiler enforcing the design system on AI-generated code before VFS writes.

**Pipeline (7 phases, order matters):**
1. **Phase -1: Import Fixing** (`import-fixer.ts`) — Fixes missing/incorrect imports based on available exports
2. **Phase 0: Layout Declaration** (`layout-declaration-mapper.ts`) — Ensures containers with 2+ children have explicit `flex`/`grid` layout
3. **Phase 1: Component Promotion** (`component-promoter.ts`) — `<button>` → `<Button>`, `<input>` → `<Input>`, etc. (AST-based, adds imports)
4. **Phase 2: Color Enforcement** (`color-mapper.ts`) — Hardcoded Tailwind colors → semantic tokens via OKLCH distance matching against `/tokens.json`
5. **Phase 3: Spacing Normalization** (`spacing-mapper.ts`) — Arbitrary values → Tailwind scale; 8px rhythm for values ≥ 16px
6. **Phase 4: Layout Enforcement** (`layout-mapper.ts`) — Grid normalization (`grid-cols-[5]` → `grid-cols-5`), 8px spacing rhythm
7. **Phase 5: Typography Enforcement** (`typography-mapper.ts`) — `text-3xl` → `text-h2`, strips redundant weight classes

**Safety net:** Final Babel parse validation — if gated code doesn't parse but input did, reverts to original. Each phase wrapped in try/catch; failures pass through unchanged. Color mapping reads `/tokens.json` to find the nearest palette via OKLCH Euclidean distance.

### Token System

**Three-tier architecture:** Primitives (raw color palettes 50-950), Semantics (meaningful mappings with light/dark modes), Components (token-aware specs per component).

**Token Studio (`src/components/editor/TokenStudio/`):**
- **Presets View** (default): 8 one-click presets — Brutalist, Soft, Neon, Editorial, Terra, Arctic Glass (default), Sunset Pop, Noir Luxe. Each provides complete `TokenState` (palettes, semantics, components, typography, spacing). Key file: `src/lib/tokens/presets.ts`
- **Customise View**: Tabs for palettes, semantic mappings, component specs, typography scale, spacing density

**Typography Scale:** Modular scale from `baseSize` (px) × `scaleRatio`. 7 levels: `text-h1` (+4), `text-h2` (+3), `text-h3` (+2), `text-h4` (+1), `text-body` (0), `text-body-sm` (-1), `text-caption` (-2). Sets font-size, line-height, font-weight only — NOT color.

**Spacing Density:** Single `baseUnit` (px) controls all spacing via `--spacing-unit` CSS variable. Labels: <3.5px "Tight", 3.5-4.5px "Standard", 4.5-5.5px "Comfortable", >5.5px "Spacious".

**Key files:** `/tokens.json` (VFS source of truth), `/globals.css` (auto-generated CSS), `src/hooks/useTokens.ts`, `src/lib/tokens/types.ts`, `src/lib/tokens/defaults.ts`, `src/lib/tokens/css-generator.ts`, `src/lib/tokens/presets.ts`, `src/lib/tailwind-config.ts`

### VFS File Structure (Inside Sandpack)

- `/package.json` - Dependencies (AI updates when adding libraries)
- `/App.tsx` - Main application component
- `/index.tsx` - React entry point with hash-based router (`useRouter()` hook)
- `/flow.json` - Multi-page flow manifest for Flow View
- `/product-brain.json` - Decision connections (strategy ↔ code)
- `/design-system.tsx` - Component gallery (27 components)
- `/globals.css` - Tailwind + CSS variables for theming
- `/tokens.json` - Design token definitions
- `/components/ui/*.tsx` - Shadcn-style components (use `cn()` for class merging)
- `/lib/utils.ts` - `cn()` utility for class merging

### Pre-built Component Library (27 Components)

All VFS components use semantic tokens only, are pure React (no Radix — the host app uses Radix, but VFS components don't), use named exports, and support `cn()`.

**Form Controls:** Button (`variant`, `size`), Input, Textarea, Checkbox, Switch, RadioGroup/RadioGroupItem, Toggle, Slider, Select/SelectOption, Label, DatePicker

**Layout & Display:** Card (Card/CardHeader/CardTitle/CardDescription/CardContent/CardFooter), Table (Table/TableHeader/TableBody/TableRow/TableHead/TableCell), Separator, AspectRatio

**Feedback:** Alert/AlertTitle/AlertDescription, Progress, Skeleton, Toast (ToastProvider/Toaster/useToast), Badge

**Navigation:** Tabs/TabsList/TabsTrigger/TabsContent, Accordion/AccordionItem/AccordionTrigger/AccordionContent, Breadcrumb/BreadcrumbItem/BreadcrumbLink/BreadcrumbSeparator/BreadcrumbPage

**Overlays:** Dialog/DialogTrigger/DialogContent/DialogHeader/DialogTitle/DialogDescription, Tooltip/TooltipProvider/TooltipTrigger/TooltipContent, Popover/PopoverTrigger/PopoverContent

**Display:** Avatar/AvatarImage/AvatarFallback

**Key files:** `src/lib/vfs/templates/shadcn-core.ts` (templates), `src/lib/canvas/component-registry.tsx` (preview configs), `src/lib/canvas/code-generator.ts` (JSX generation), `src/lib/vfs/templates/design-system-rich.ts` (showcase page)

### Design Principles

1. **Single Source of Truth**: VFS is the only state. If it's not in a file, it doesn't exist.
2. **No Node State**: No element trees or node graphs—UI rendered purely by bundling files.
3. **Standard Patterns**: Use Tailwind utilities and Shadcn patterns. Avoid custom CSS.
4. **No External Graph Libraries**: Flow View layout must be dependency-free (dagre/reactflow cause SSR issues).
5. **Native Canvas**: Use DOM + CSS transforms for canvas, not WebGL or `<canvas>` element.

### Visual Editor Constraints

**Editable:** Static `className="..."` strings, `cn()`/`clsx()`/`twMerge()` string args, simple text content, string/boolean component props. **Not editable:** Component internals, dynamic className vars, expression props (displayed read-only), `children`/`key`/`ref`/`data-source-loc`.

## Tech Stack

- Next.js 16 (App Router, TypeScript), React 19
- Tailwind CSS v4
- `@codesandbox/sandpack-react` for VFS runtime
- `ai` + `@ai-sdk/google` + `@ai-sdk/anthropic` + `@ai-sdk/openai` + `@ai-sdk/react` for multi-model AI
- `@supabase/supabase-js` + `@supabase/ssr` for auth and persistence
- `zustand` for global state (canvas store, chat context, strategy, product brain, streaming, annotations, documents)
- `@babel/parser` + `@babel/traverse` + `@babel/generator` + `@babel/standalone` for AST instrumentation
- `culori` for OKLCH color distance calculations
- `framer-motion` for animations
- `lucide-react` for icons, `sonner` for toasts
- `mammoth` + `unpdf` for document extraction
- `zod` for validation, `class-variance-authority` for component variants
- Radix UI primitives (host app only — accordion, avatar, checkbox, dialog, label, progress, radio-group, select, separator, switch, tabs, slot)

## Implementation Roadmap

- **Phase 1** ✅ Foundation (VFS, Canvas, Frame, Sandpack)
- **Phase 2** ✅ Agentic Loop (Chat + AI writes to VFS)
- **Phase 3** ✅ Dynamic Dependencies (AI manages `/package.json`)
- **Phase 4** ✅ Design System Engine (Token Studio, component gallery)
- **Phase 5** ✅ AI Token Integration (semantic tokens, `/tokens.json` in context)
- **Phase 6** ✅ Visual Editor (Inspector, Auto Layout, Colors & Typography)
- **Phase 7** ✅ Instant Preview (Optimistic UI with debounced VFS writes)
- **Phase 8** ✅ Manual Design Tools (Canvas toolbar, ghost elements, materialization)
- **Phase 9** ✅ Flow View (Multi-page visualization, orthogonal routing, draggable nodes)
- **Phase 10** ✅ AST Architecture (GPS source mapping, surgical editing, optimistic text, prop inspector)
- **Phase 11** ✅ Keyboard Reordering (Arrow key element swapping with FLIP animation)
- **Phase 12** ✅ Token Studio Presets (8 one-click style presets with Customise flow)
- **Phase 13** ✅ Flow View Navigation Interception (Viewport animation to target frame)
- **Phase 14** ✅ AI Chat Enhancements (Right-click context menu, pinned elements, persistent chat)
- **Phase 15** ✅ Flow View Full Editing (Drawing tools, multi-frame drop detection, always-mounted iframes)
- **Phase 16** ✅ Design System Gatekeeper (Color, spacing, component promotion — 5 phase transpiler)
  - 16.1 ✅ Preset accessibility audit (WCAG AA contrast, distinct error/brand palettes)
- **Phase 17** ✅ Layout + Typography Enforcement (Grid normalization, 8px rhythm, modular type scale, spacing density)
- **Phase 18** ✅ Layers Panel Auto-Open (Ancestor expansion, scroll-into-view, Flow View support)
- **Phase 19** ✅ Strategy System (Problem overview → ideation → solution design phases, manifesto, personas, journey maps)
- **Phase 20** ✅ Product Brain (Decision connections, annotation evaluation, strategy-to-code tracking)
- **Phase 21** ✅ Parallel Build (Multi-page streaming, per-page verification, error forwarding between pages)
- **Phase 22** ✅ Verification Loop (Pre-validation, AI error detection, auto-fix retry, focused section mode)
- **Phase 23** ✅ Auth + Dashboard (Supabase auth, project CRUD, dashboard with document upload)
- **Phase 24** ✅ Publishing (Published apps table, `/p/[slug]` read-only viewer)
- **Phase 25** ✅ Analytics (Event tracking to Supabase, fire-and-forget logging)
- **Phase 26** ✅ Research Documents (PDF/DOCX upload, text extraction, insight generation)
- **Phase 27** ✅ Multi-Model AI (4 providers — Anthropic, Google, OpenAI — with model selector)
- **Phase 28** ✅ Gatekeeper Expansion (Import fixing, layout declaration enforcement — 7-phase pipeline)
