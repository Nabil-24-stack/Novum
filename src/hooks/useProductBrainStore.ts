"use client";

import { create } from "zustand";
import type { ProductBrainData, PageDecisions } from "@/lib/product-brain/types";

interface ProductBrainState {
  brainData: ProductBrainData | null;
  setBrainData: (data: ProductBrainData) => void;
  addPageDecisions: (page: PageDecisions) => void;
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

  clearBrain: () => {
    set({ brainData: null });
  },
}));
