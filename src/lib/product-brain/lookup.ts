import type { ProductBrainData, DecisionConnection } from "./types";

/**
 * Find all decision connections relevant to a selected element.
 *
 * Matching strategy:
 * 1. If pageId is provided, look in that page's connections first
 * 2. Match connections whose sourceLocation.fileName === the element's fileName
 * 3. If no fileName matches found, return ALL connections for the page (the element
 *    is in that page, so all connections are contextually relevant)
 */
export function findConnectionsForElement(
  brain: ProductBrainData,
  fileName: string,
  pageId?: string
): DecisionConnection[] {
  // Try to find the page by pageId first
  if (pageId) {
    const page = brain.pages.find((p) => p.pageId === pageId);
    if (page) {
      // Try fileName match within this page
      const byFile = page.connections.filter(
        (c) => c.sourceLocation?.fileName === fileName
      );
      // If we found file-specific matches, use those; otherwise return all page connections
      return byFile.length > 0 ? byFile : page.connections;
    }
  }

  // No pageId or page not found — search all pages by fileName
  const byFile = brain.pages.flatMap((p) =>
    p.connections.filter((c) => c.sourceLocation?.fileName === fileName)
  );
  if (byFile.length > 0) return byFile;

  // Last resort: try matching fileName against page-level file pattern
  // e.g., fileName "/pages/Dashboard.tsx" → pageId "dashboard"
  for (const page of brain.pages) {
    const pageFileName = `/pages/${page.pageName}.tsx`;
    if (fileName === pageFileName || fileName === `/pages/${page.pageId}.tsx`) {
      return page.connections;
    }
  }

  return [];
}

/**
 * Find decision connections whose `id` matches one of the provided strategy IDs.
 * These IDs come from `data-strategy-id` attributes found in the selected element's
 * DOM ancestry.
 */
export function findConnectionsByStrategyIds(
  brain: ProductBrainData,
  strategyIds: string[]
): DecisionConnection[] {
  const idSet = new Set(strategyIds);
  return brain.pages.flatMap((p) =>
    p.connections.filter((c) => idSet.has(c.id))
  );
}
