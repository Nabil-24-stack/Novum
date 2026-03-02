"use client";

import { create } from "zustand";
import type { ProductBrainData, PageDecisions } from "@/lib/product-brain/types";

interface ProductBrainState {
  brainData: ProductBrainData | null;
  setBrainData: (data: ProductBrainData) => void;
  addPageDecisions: (page: PageDecisions) => void;
  removeConnection: (connectionId: string) => void;
  removePageConnections: (pageId: string) => void;
  removeOrphanedConnections: (validPageIds: string[], validJtbdCount: number, validPersonaNames: string[]) => number;
  clearBrain: () => void;
}

export const useProductBrainStore = create<ProductBrainState>((set, get) => ({
  brainData: null,

  setBrainData: (data) => {
    set({ brainData: data });
  },

  addPageDecisions: (page) => {
    const current = get().brainData ?? { version: 1 as const, pages: [] };
    const existingIdx = current.pages.findIndex((p) => p.pageId === page.pageId);
    const updatedPages =
      existingIdx >= 0
        ? current.pages.map((p, i) => (i === existingIdx ? page : p))
        : [...current.pages, page];
    set({ brainData: { ...current, pages: updatedPages } });
  },

  removeConnection: (connectionId) => {
    const current = get().brainData;
    if (!current) return;
    set({
      brainData: {
        ...current,
        pages: current.pages.map((p) => ({
          ...p,
          connections: p.connections.filter((c) => c.id !== connectionId),
        })),
      },
    });
  },

  removePageConnections: (pageId) => {
    const current = get().brainData;
    if (!current) return;
    set({
      brainData: {
        ...current,
        pages: current.pages.filter((p) => p.pageId !== pageId),
      },
    });
  },

  removeOrphanedConnections: (validPageIds, validJtbdCount, validPersonaNames) => {
    const current = get().brainData;
    if (!current) return 0;

    const validPageSet = new Set(validPageIds);
    const validNameSet = new Set(validPersonaNames);
    let removedCount = 0;

    const updatedPages = current.pages
      .filter((p) => validPageSet.has(p.pageId))
      .map((p) => {
        const filtered = p.connections.filter((c) => {
          // Use the connection's own pageId if present, otherwise inherit from the parent PageDecisions.
          // The AI annotation prompt does NOT include pageId on individual connections,
          // so c.pageId is typically undefined — falling back to p.pageId prevents
          // every connection from being incorrectly classified as an orphan.
          const effectivePageId = c.pageId || p.pageId;
          const isOrphan =
            !validPageSet.has(effectivePageId) ||
            c.jtbdIndices.some((i) => i >= validJtbdCount) ||
            c.personaNames.some((n) => !validNameSet.has(n));
          if (isOrphan) removedCount++;
          return !isOrphan;
        });
        return { ...p, connections: filtered };
      });

    if (removedCount > 0) {
      set({ brainData: { ...current, pages: updatedPages } });
    }
    return removedCount;
  },

  clearBrain: () => {
    set({ brainData: null });
  },
}));
