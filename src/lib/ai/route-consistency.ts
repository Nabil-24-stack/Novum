/**
 * Route Consistency Checker
 *
 * Post-write deterministic checker that ensures:
 * 1. App.tsx has routes for all page files in /pages/
 * 2. flow.json includes entries for all page files in /pages/
 *
 * Runs after all AI-generated files are written to VFS.
 * Fail-safe: wrapped in try/catch — returns empty fixes on any error.
 */

import { generateAppTsx, toPascalCase } from "@/lib/vfs/app-generator";

// ============================================================================
// Types
// ============================================================================

export interface ConsistencyFix {
  path: string;
  content: string;
  reason: string;
}

export interface ConsistencyResult {
  fixes: ConsistencyFix[];
}

// ============================================================================
// Page Discovery
// ============================================================================

interface DiscoveredPage {
  fileName: string; // e.g., "Settings"
  filePath: string; // e.g., "/pages/Settings.tsx"
  componentName: string; // e.g., "Settings"
  id: string; // e.g., "settings"
  route: string; // e.g., "/settings"
  name: string; // e.g., "Settings"
}

/**
 * Scan VFS for page files and extract metadata.
 * A valid page file must:
 * - Live in /pages/*.tsx
 * - Export at least one named function/const with PascalCase name
 */
function discoverPages(files: Record<string, string>): DiscoveredPage[] {
  const pages: DiscoveredPage[] = [];
  const exportRegex = /export\s+(?:function|const)\s+([A-Z][A-Za-z0-9]*)/;

  for (const filePath of Object.keys(files)) {
    const match = filePath.match(/^\/pages\/([A-Za-z0-9]+)\.tsx$/);
    if (!match) continue;

    const fileName = match[1];
    const content = files[filePath];

    // Verify it has a named export
    const exportMatch = content.match(exportRegex);
    if (!exportMatch) continue;

    const componentName = exportMatch[1];
    const id = fileName.toLowerCase();
    const route = id === "home" || id === "index" ? "/" : `/${id.replace(/([A-Z])/g, (m, c, i) => (i > 0 ? "-" : "") + c.toLowerCase())}`;
    const name = fileName.replace(/([A-Z])/g, " $1").trim();

    pages.push({ fileName, filePath, componentName, id, route, name });
  }

  return pages;
}

// ============================================================================
// App.tsx Consistency
// ============================================================================

function checkAppTsx(
  files: Record<string, string>,
  discoveredPages: DiscoveredPage[],
): ConsistencyFix | null {
  if (discoveredPages.length === 0) return null;

  const appTsx = files["/App.tsx"];
  if (!appTsx) return null;

  // Check if all pages are routed in App.tsx
  const missingPages = discoveredPages.filter((page) => {
    // Check if the component is imported
    const importRegex = new RegExp(`import\\s*\\{[^}]*\\b${page.componentName}\\b[^}]*\\}\\s*from`);
    return !importRegex.test(appTsx);
  });

  if (missingPages.length === 0) return null;

  // Regenerate App.tsx with all pages
  const allPages = discoveredPages.map((p) => ({
    id: p.id,
    label: p.componentName,
    route: p.route,
  }));

  const newAppTsx = generateAppTsx(allPages);

  return {
    path: "/App.tsx",
    content: newAppTsx,
    reason: `Added routing for ${missingPages.map((p) => p.componentName).join(", ")}`,
  };
}

// ============================================================================
// flow.json Consistency
// ============================================================================

interface FlowManifest {
  pages: Array<{ id: string; name: string; route: string }>;
  connections: Array<{ from: string; to: string; label?: string }>;
}

function checkFlowJson(
  files: Record<string, string>,
  discoveredPages: DiscoveredPage[],
): ConsistencyFix | null {
  if (discoveredPages.length === 0) return null;

  const flowRaw = files["/flow.json"];
  let flow: FlowManifest;

  try {
    flow = flowRaw ? JSON.parse(flowRaw) : { pages: [], connections: [] };
  } catch {
    // Invalid JSON — rebuild from scratch
    flow = { pages: [], connections: [] };
  }

  if (!Array.isArray(flow.pages)) {
    flow.pages = [];
  }

  const existingPageIds = new Set(flow.pages.map((p) => p.id));
  const missingPages = discoveredPages.filter((p) => !existingPageIds.has(p.id));

  if (missingPages.length === 0) return null;

  // Add missing pages to flow.json
  const updatedPages = [
    ...flow.pages,
    ...missingPages.map((p) => ({
      id: p.id,
      name: p.name,
      route: p.route,
    })),
  ];

  // Add sequential connections for new pages (from last existing → first new, then chain new ones)
  const updatedConnections = [...(flow.connections || [])];
  if (flow.pages.length > 0 && missingPages.length > 0) {
    const lastExisting = flow.pages[flow.pages.length - 1];
    updatedConnections.push({
      from: lastExisting.id,
      to: missingPages[0].id,
    });
  }
  for (let i = 0; i < missingPages.length - 1; i++) {
    updatedConnections.push({
      from: missingPages[i].id,
      to: missingPages[i + 1].id,
    });
  }

  const updatedFlow: FlowManifest = {
    pages: updatedPages,
    connections: updatedConnections,
  };

  return {
    path: "/flow.json",
    content: JSON.stringify(updatedFlow, null, 2),
    reason: `Added ${missingPages.map((p) => p.name).join(", ")} to flow manifest`,
  };
}

// ============================================================================
// Orchestrator
// ============================================================================

/**
 * Check route consistency across VFS files.
 * Returns a list of files that need to be written to fix inconsistencies.
 */
export function checkRouteConsistency(
  files: Record<string, string>,
): ConsistencyResult {
  try {
    const discoveredPages = discoverPages(files);
    const fixes: ConsistencyFix[] = [];

    const appFix = checkAppTsx(files, discoveredPages);
    if (appFix) fixes.push(appFix);

    const flowFix = checkFlowJson(files, discoveredPages);
    if (flowFix) fixes.push(flowFix);

    return { fixes };
  } catch (err) {
    console.warn("[RouteConsistency] Check failed, skipping:", err);
    return { fixes: [] };
  }
}
