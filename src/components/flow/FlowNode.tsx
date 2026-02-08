"use client";

import { useRef, useCallback, PointerEvent, useMemo, useState } from "react";
import { SandpackProvider, SandpackPreview } from "@codesandbox/sandpack-react";
import type { FlowPage, FlowNodePosition } from "@/lib/flow/types";
import { defaultPackageJson } from "@/lib/vfs/templates/package-json";
import { getTailwindConfigDataUrl } from "@/lib/tailwind-config";
import type { PreviewMode } from "@/lib/tokens";

// Original preview dimensions (before scaling)
const PREVIEW_WIDTH = 1440;
const PREVIEW_HEIGHT = 900;
const SCALE = 0.25;

// Threshold to distinguish click from drag (in pixels)
const DRAG_THRESHOLD = 5;

function parseDependencies(files: Record<string, string>): Record<string, string> {
  const packageJsonContent = files["/package.json"];

  if (!packageJsonContent) {
    return defaultPackageJson.dependencies;
  }

  try {
    const parsed = JSON.parse(packageJsonContent);
    if (parsed.dependencies && typeof parsed.dependencies === "object") {
      return parsed.dependencies;
    }
  } catch {
    // JSON parse error - fallback to defaults
  }

  return defaultPackageJson.dependencies;
}

interface FlowNodeProps {
  page: FlowPage;
  position: FlowNodePosition;
  onClick: (route: string) => void;
  onDrag: (id: string, deltaX: number, deltaY: number) => void;
  isSelected?: boolean;
  canvasScale: number;
  files: Record<string, string>;
  previewMode?: PreviewMode;
}

export function FlowNode({
  page,
  position,
  onClick,
  onDrag,
  isSelected,
  canvasScale,
  files,
  previewMode = "light",
}: FlowNodeProps) {
  const [isDragging, setIsDragging] = useState(false);
  const isDraggingRef = useRef(false);
  const startPosRef = useRef({ x: 0, y: 0 });
  const totalDistanceRef = useRef(0);

  // Parse dependencies from VFS package.json
  const dependencies = useMemo(() => parseDependencies(files), [files]);

  // Filter out package.json and tokens.json from files
  const sandpackFiles = useMemo(() => {
    const filtered = { ...files };
    delete filtered["/package.json"];
    delete filtered["/tokens.json"];
    return filtered;
  }, [files]);

  // Build external resources array with route initialization and dark mode scripts
  const externalResources = useMemo(() => {
    // Set the hash BEFORE React app mounts so the router reads the correct route
    // This is needed because Sandpack's startRoute doesn't set window.location.hash
    const routeScript = page.route !== "/"
      ? `if (!window.location.hash) { window.location.hash = "${page.route}"; }`
      : "";
    const routeDataUrl = routeScript
      ? `data:text/javascript;charset=utf-8,${encodeURIComponent(routeScript)}`
      : null;

    const isDark = previewMode === "dark";
    const darkModeScript = isDark
      ? `document.documentElement.classList.add('dark');`
      : `document.documentElement.classList.remove('dark');`;
    const darkModeDataUrl = `data:text/javascript;charset=utf-8,${encodeURIComponent(darkModeScript)}`;

    return [
      "https://cdn.tailwindcss.com",
      getTailwindConfigDataUrl(),
      // Route script must come before app loads
      ...(routeDataUrl ? [routeDataUrl] : []),
      darkModeDataUrl,
    ];
  }, [previewMode, page.route]);

  const handlePointerDown = useCallback((e: PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();

    // Capture pointer for smooth dragging - use currentTarget (the overlay div)
    e.currentTarget.setPointerCapture(e.pointerId);

    isDraggingRef.current = true;
    setIsDragging(true);
    startPosRef.current = { x: e.clientX, y: e.clientY };
    totalDistanceRef.current = 0;
  }, []);

  const handlePointerMove = useCallback((e: PointerEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current) return;

    // Calculate delta (accounting for canvas zoom)
    const deltaX = (e.clientX - startPosRef.current.x) / canvasScale;
    const deltaY = (e.clientY - startPosRef.current.y) / canvasScale;

    // Track total distance for click vs drag detection
    totalDistanceRef.current += Math.sqrt(
      Math.pow(e.clientX - startPosRef.current.x, 2) +
      Math.pow(e.clientY - startPosRef.current.y, 2)
    );

    // Update start position for next frame
    startPosRef.current = { x: e.clientX, y: e.clientY };

    // Notify parent of drag
    onDrag(page.id, deltaX, deltaY);
  }, [page.id, onDrag, canvasScale]);

  const handlePointerUp = useCallback((e: PointerEvent<HTMLDivElement>) => {
    // Release pointer capture - use currentTarget (the overlay div)
    e.currentTarget.releasePointerCapture(e.pointerId);

    const wasDragging = isDraggingRef.current;
    isDraggingRef.current = false;
    setIsDragging(false);

    // If moved less than threshold, treat as click (navigate)
    if (wasDragging && totalDistanceRef.current < DRAG_THRESHOLD) {
      onClick(page.route);
    }

    totalDistanceRef.current = 0;
  }, [page.route, onClick]);

  return (
    <div
      className={`absolute select-none ${
        isSelected ? "ring-2 ring-blue-500 ring-offset-2" : ""
      }`}
      style={{
        left: position.x,
        top: position.y,
        width: position.width,
        height: position.height,
      }}
    >
      {/* Title bar */}
      <div className="absolute -top-7 left-0 right-0 flex items-center justify-between px-2 pointer-events-none">
        <span className="text-base font-medium text-neutral-700 bg-white/80 backdrop-blur-sm px-2 py-0.5 rounded shadow-sm">
          {page.name}
        </span>
        <span className="text-sm text-neutral-400 font-mono bg-white/60 px-1.5 py-0.5 rounded">
          {page.route}
        </span>
      </div>

      {/* Preview container with scale transform */}
      <div
        className="relative rounded-lg overflow-hidden shadow-lg border border-neutral-200 bg-white pointer-events-none"
        style={{
          width: position.width,
          height: position.height,
        }}
      >
        {/* Scaled preview wrapper - each node has its own isolated Sandpack instance */}
        <div
          className="absolute top-0 left-0 origin-top-left pointer-events-none"
          style={{
            width: PREVIEW_WIDTH,
            height: PREVIEW_HEIGHT,
            transform: `scale(${SCALE})`,
          }}
        >
          <SandpackProvider
            template="react-ts"
            files={sandpackFiles}
            customSetup={{
              dependencies,
            }}
            options={{
              externalResources,
            }}
            theme="light"
          >
            <SandpackPreview
              showNavigator={false}
              showOpenInCodeSandbox={false}
              showRefreshButton={false}
              startRoute={page.route}
              style={{ width: PREVIEW_WIDTH, height: PREVIEW_HEIGHT }}
            />
          </SandpackProvider>
        </div>

        {/* Interactive overlay - sits on top of iframe to capture all pointer events */}
        <div
          className="absolute inset-0 z-10 select-none pointer-events-auto"
          style={{ cursor: isDragging ? "grabbing" : "grab" }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        >
          {/* Hover effect inside overlay */}
          <div className="absolute inset-0 bg-blue-500/0 hover:bg-blue-500/5 transition-colors rounded-lg" />
        </div>
      </div>
    </div>
  );
}
