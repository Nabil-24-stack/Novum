import { create } from "zustand";

export interface AnnotationElementBounds {
  connectionId: string;
  iframeRect: { x: number; y: number; width: number; height: number } | null;
  isBelowFold: boolean;
  iframeWidth: number;
  iframeHeight: number;
}

interface AnnotationState {
  /** Page IDs with annotations toggled on */
  activeFrames: Set<string>;
  /** pageId → connectionId → bounds */
  frameBounds: Map<string, Map<string, AnnotationElementBounds>>;

  toggleFrame: (pageId: string) => void;
  openAll: (pageIds: string[]) => void;
  closeAll: () => void;
  setBounds: (pageId: string, connectionId: string, bounds: AnnotationElementBounds) => void;
  setBoundsBatch: (pageId: string, bounds: AnnotationElementBounds[]) => void;
  clearBounds: (pageId: string) => void;
}

export const useAnnotationStore = create<AnnotationState>((set) => ({
  activeFrames: new Set<string>(),
  frameBounds: new Map<string, Map<string, AnnotationElementBounds>>(),

  toggleFrame: (pageId) =>
    set((state) => {
      const next = new Set(state.activeFrames);
      if (next.has(pageId)) {
        next.delete(pageId);
      } else {
        next.add(pageId);
      }
      return { activeFrames: next };
    }),

  openAll: (pageIds) =>
    set({ activeFrames: new Set(pageIds) }),

  closeAll: () =>
    set({ activeFrames: new Set() }),

  setBounds: (pageId, connectionId, bounds) =>
    set((state) => {
      const nextMap = new Map(state.frameBounds);
      const pageBounds = new Map(nextMap.get(pageId) ?? new Map());
      pageBounds.set(connectionId, bounds);
      nextMap.set(pageId, pageBounds);
      return { frameBounds: nextMap };
    }),

  setBoundsBatch: (pageId, bounds) =>
    set((state) => {
      const nextMap = new Map(state.frameBounds);
      const pageBounds = new Map<string, AnnotationElementBounds>();
      for (const b of bounds) {
        pageBounds.set(b.connectionId, b);
      }
      nextMap.set(pageId, pageBounds);
      return { frameBounds: nextMap };
    }),

  clearBounds: (pageId) =>
    set((state) => {
      const nextMap = new Map(state.frameBounds);
      nextMap.delete(pageId);
      return { frameBounds: nextMap };
    }),
}));
