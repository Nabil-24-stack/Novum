"use client";

import { create } from "zustand";

interface StrategyArtifactSelectionState {
  activeArtifactId: string | null;
  chatScopedArtifactId: string | null;
  setActiveArtifact: (id: string | null) => void;
  setChatScopedArtifact: (id: string | null) => void;
  clearArtifactSelection: () => void;
}

export const useStrategyArtifactSelectionStore = create<StrategyArtifactSelectionState>((set) => ({
  activeArtifactId: null,
  chatScopedArtifactId: null,

  setActiveArtifact: (id) =>
    set((state) => ({
      activeArtifactId: id,
      chatScopedArtifactId: state.chatScopedArtifactId === id ? state.chatScopedArtifactId : null,
    })),

  setChatScopedArtifact: (id) =>
    set((state) => ({
      chatScopedArtifactId: id && state.activeArtifactId === id ? id : null,
    })),

  clearArtifactSelection: () =>
    set({
      activeArtifactId: null,
      chatScopedArtifactId: null,
    }),
}));
