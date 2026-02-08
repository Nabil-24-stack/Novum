"use client";

import { SandpackProvider, useSandpack } from "@codesandbox/sandpack-react";
import { ReactNode, useMemo, useEffect, useRef, useCallback } from "react";
import { defaultPackageJson } from "@/lib/vfs/templates/package-json";
import { SandpackFileSync } from "./SandpackFileSync";
import { getTailwindConfigDataUrl } from "@/lib/tailwind-config";
import { getInspectorScriptDataUrl } from "@/lib/inspection/inspector-script";
import type { PreviewMode } from "@/lib/tokens";
import type { InspectionMessage } from "@/lib/inspection/types";

interface SandpackWrapperProps {
  files: Record<string, string>;
  children: ReactNode;
  previewMode?: PreviewMode;
  inspectionMode?: boolean;
  /** Whether flow mode is active (navigation interception) */
  flowModeActive?: boolean;
}

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
    // JSON parse error (e.g., while AI is typing) - fallback to defaults
    console.warn("Failed to parse package.json, using default dependencies");
  }

  return defaultPackageJson.dependencies;
}

/**
 * Generate a data URL script to toggle dark mode class on the document
 */
function getDarkModeScriptDataUrl(isDark: boolean): string {
  const script = isDark
    ? `document.documentElement.classList.add('dark');`
    : `document.documentElement.classList.remove('dark');`;
  return `data:text/javascript;charset=utf-8,${encodeURIComponent(script)}`;
}

/**
 * Sync inspection mode with Sandpack status.
 * Broadcasts inspection mode to iframes when:
 * 1. Sandpack transitions to 'idle' (bundling finished) - handles HMR updates
 * 2. inspectionMode prop changes while status is already 'idle' - handles manual toggle
 */
function InspectionSync({ inspectionMode }: { inspectionMode: boolean }) {
  const { sandpack } = useSandpack();
  const prevStatusRef = useRef(sandpack.status);
  const prevInspectionModeRef = useRef(inspectionMode);

  useEffect(() => {
    const prevStatus = prevStatusRef.current;
    const currentStatus = sandpack.status;
    const prevInspectionMode = prevInspectionModeRef.current;

    prevStatusRef.current = currentStatus;
    prevInspectionModeRef.current = inspectionMode;

    // Broadcast when:
    // 1. Status transitions to idle (HMR finished), OR
    // 2. inspectionMode changes while status is idle (manual toggle)
    const statusTransitionedToIdle = currentStatus === "idle" && prevStatus !== "idle";
    const inspectionModeChanged = inspectionMode !== prevInspectionMode && currentStatus === "idle";

    if (statusTransitionedToIdle || inspectionModeChanged) {
      // Small delay to ensure iframe is ready to receive messages
      const timer = setTimeout(() => {
        const iframes = document.querySelectorAll<HTMLIFrameElement>(
          'iframe[title="Sandpack Preview"]'
        );
        iframes.forEach((iframe) => {
          try {
            iframe.contentWindow?.postMessage(
              {
                type: "novum:inspection-mode",
                payload: { enabled: inspectionMode },
              } as InspectionMessage,
              "*"
            );
          } catch {
            // Ignore errors
          }
        });
      }, 100);

      return () => clearTimeout(timer);
    }
  }, [sandpack.status, inspectionMode]);

  return null;
}

/**
 * Sync flow mode state with Sandpack iframes for navigation interception.
 *
 * Uses a handshake protocol to handle race conditions:
 * - Iframes may reload/rebundle after the host broadcasts flow mode state
 * - When an iframe loads, it sends 'novum:inspector-ready'
 * - This component replies with current flow mode state
 *
 * This guarantees iframes always receive the correct state regardless of load timing.
 */
function FlowModeSync({ flowModeActive }: { flowModeActive: boolean }) {
  const { sandpack } = useSandpack();

  // Initialize to null to detect first mount (fixes React strict mode double-mount).
  // If initialized to flowModeActive, the effect wouldn't detect a "change" on mount.
  const prevFlowModeRef = useRef<boolean | null>(null);

  // Broadcast flow mode state to all Sandpack iframes
  const broadcastFlowMode = useCallback((enabled: boolean) => {
    const iframes = document.querySelectorAll<HTMLIFrameElement>(
      'iframe[title="Sandpack Preview"]'
    );
    iframes.forEach((iframe) => {
      try {
        iframe.contentWindow?.postMessage(
          {
            type: "novum:flow-mode-state",
            payload: { enabled },
          } as InspectionMessage,
          "*"
        );
      } catch {
        // Ignore cross-origin errors
      }
    });
  }, []);

  // Effect 1: Broadcast on first mount or when flowModeActive changes
  useEffect(() => {
    const prevFlowMode = prevFlowModeRef.current;
    const isFirstMount = prevFlowMode === null;

    if (isFirstMount || flowModeActive !== prevFlowMode) {
      // Delay to ensure iframes exist
      const timer = setTimeout(() => broadcastFlowMode(flowModeActive), 150);
      prevFlowModeRef.current = flowModeActive;
      return () => clearTimeout(timer);
    }
  }, [flowModeActive, broadcastFlowMode]);

  // Effect 2: Re-broadcast when Sandpack becomes idle (catches late-loading iframes)
  useEffect(() => {
    if (sandpack.status === "idle" && flowModeActive) {
      const timer = setTimeout(() => broadcastFlowMode(flowModeActive), 100);
      return () => clearTimeout(timer);
    }
  }, [sandpack.status, flowModeActive, broadcastFlowMode]);

  // Effect 3: HANDSHAKE - Respond to iframe ready signals
  // Solves race condition where iframe reloads AFTER initial broadcast
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === "novum:inspector-ready") {
        // Reply with current state after short delay for message listener setup
        setTimeout(() => broadcastFlowMode(flowModeActive), 50);
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [flowModeActive, broadcastFlowMode]);

  return null;
}

export function SandpackWrapper({ files, children, previewMode = "light", inspectionMode = false, flowModeActive = false }: SandpackWrapperProps) {
  // Parse dependencies from VFS package.json, with fallback to defaults
  const dependencies = useMemo(() => parseDependencies(files), [files]);

  // Filter out package.json and tokens.json from files passed to Sandpack
  // (Sandpack manages dependencies separately via customSetup)
  const sandpackFiles = useMemo(() => {
    const filtered = { ...files };
    delete filtered["/package.json"];
    delete filtered["/tokens.json"];
    return filtered;
  }, [files]);

  // Build external resources array with dark mode script and inspector
  const externalResources = useMemo(() => [
    "https://cdn.tailwindcss.com",
    getTailwindConfigDataUrl(),
    getDarkModeScriptDataUrl(previewMode === "dark"),
    getInspectorScriptDataUrl(inspectionMode),
  ], [previewMode, inspectionMode]);

  return (
    <SandpackProvider
      template="react-ts"
      files={sandpackFiles}
      customSetup={{
        dependencies,
      }}
      options={{
        externalResources,
        classes: {
          "sp-wrapper": "!h-full",
          "sp-layout": "!h-full",
          "sp-stack": "!h-full",
        },
      }}
      theme="light"
    >
      <SandpackFileSync files={sandpackFiles} />
      <InspectionSync inspectionMode={inspectionMode} />
      <FlowModeSync flowModeActive={flowModeActive} />
      {children}
    </SandpackProvider>
  );
}
