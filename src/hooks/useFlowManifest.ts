import { useMemo } from "react";
import type { FlowManifest, FlowPage, FlowConnection } from "@/lib/flow/types";

/**
 * Hook to parse flow.json from VFS and return flow manifest
 * Falls back to a single "/" page if flow.json is missing or invalid
 * Auto-generates sequential connections if none are defined
 */
export function useFlowManifest(files: Record<string, string>): FlowManifest {
  return useMemo(() => {
    const flowJsonContent = files["/flow.json"];

    // If no flow.json exists, return fallback with single home page
    if (!flowJsonContent) {
      return createFallbackManifest();
    }

    try {
      const parsed = JSON.parse(flowJsonContent);

      // Validate structure
      if (!isValidFlowManifest(parsed)) {
        console.warn("[useFlowManifest] Invalid flow.json structure, using fallback");
        return createFallbackManifest();
      }

      const manifest = parsed as FlowManifest;

      // Ensure connections array exists
      if (!manifest.connections) {
        manifest.connections = [];
      }

      // Auto-generate sequential connections if none are defined
      if (manifest.connections.length === 0 && manifest.pages.length > 1) {
        manifest.connections = generateSequentialConnections(manifest.pages);
        console.log("[useFlowManifest] Auto-generated connections:", manifest.connections);
      }

      return manifest;
    } catch (err) {
      console.warn("[useFlowManifest] Failed to parse flow.json:", err);
      return createFallbackManifest();
    }
  }, [files]);
}

/**
 * Generate sequential connections between pages based on their order
 * Creates a linear flow: page1 -> page2 -> page3 -> ...
 * Uses the original array order (assumes AI/user defined pages in logical sequence)
 * Ensures "/" (home) page comes first if it exists
 */
function generateSequentialConnections(pages: FlowPage[]): FlowConnection[] {
  const connections: FlowConnection[] = [];

  // Reorder so "/" comes first, keep rest in original order
  const homePage = pages.find(p => p.route === "/");
  const otherPages = pages.filter(p => p.route !== "/");
  const orderedPages = homePage ? [homePage, ...otherPages] : pages;

  // Create sequential connections
  for (let i = 0; i < orderedPages.length - 1; i++) {
    connections.push({
      from: orderedPages[i].id,
      to: orderedPages[i + 1].id,
    });
  }

  return connections;
}

/**
 * Create fallback manifest with single home page
 */
function createFallbackManifest(): FlowManifest {
  return {
    pages: [
      { id: "home", name: "Home", route: "/" },
    ],
    connections: [],
  };
}

/**
 * Validate that parsed JSON matches FlowManifest structure
 */
function isValidFlowManifest(obj: unknown): obj is FlowManifest {
  if (typeof obj !== "object" || obj === null) {
    return false;
  }

  const manifest = obj as Record<string, unknown>;

  // Must have pages array
  if (!Array.isArray(manifest.pages)) {
    return false;
  }

  // Validate each page
  for (const page of manifest.pages) {
    if (!isValidFlowPage(page)) {
      return false;
    }
  }

  // Connections are optional but must be array if present
  if (manifest.connections !== undefined && !Array.isArray(manifest.connections)) {
    return false;
  }

  // Validate connections if present
  if (Array.isArray(manifest.connections)) {
    for (const conn of manifest.connections) {
      if (!isValidFlowConnection(conn)) {
        return false;
      }
    }
  }

  return true;
}

function isValidFlowPage(obj: unknown): obj is FlowPage {
  if (typeof obj !== "object" || obj === null) {
    return false;
  }

  const page = obj as Record<string, unknown>;

  return (
    typeof page.id === "string" &&
    typeof page.name === "string" &&
    typeof page.route === "string"
  );
}

function isValidFlowConnection(obj: unknown): boolean {
  if (typeof obj !== "object" || obj === null) {
    return false;
  }

  const conn = obj as Record<string, unknown>;

  return (
    typeof conn.from === "string" &&
    typeof conn.to === "string" &&
    (conn.label === undefined || typeof conn.label === "string")
  );
}
