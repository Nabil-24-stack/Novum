"use client";

import { create } from "zustand";

export type StrategyPhase = "hero" | "manifesto" | "flow" | "building" | "complete";

export interface ManifestoData {
  title: string;
  problemStatement: string;
  targetUser: string;
  jtbd: string[];
  solution: string;
}

export interface StrategyNode {
  id: string;
  label: string;
  type: "page" | "action" | "decision" | "data";
  description?: string;
}

export interface StrategyConnection {
  from: string;
  to: string;
  label?: string;
}

export interface FlowData {
  nodes: StrategyNode[];
  connections: StrategyConnection[];
}

interface StrategyState {
  phase: StrategyPhase;
  userPrompt: string;
  manifestoData: ManifestoData | null;
  streamingOverview: Partial<ManifestoData> | null;
  flowData: FlowData | null;
  completedPages: string[];
  currentBuildingPage: string | null;
  pendingApprovalPage: string | null;

  // Actions
  setPhase: (phase: StrategyPhase) => void;
  setUserPrompt: (prompt: string) => void;
  setManifestoData: (data: ManifestoData) => void;
  setStreamingOverview: (data: Partial<ManifestoData> | null) => void;
  setFlowData: (data: FlowData) => void;
  addCompletedPage: (pageId: string) => void;
  setBuildingPage: (pageId: string | null) => void;
  setPendingApprovalPage: (pageId: string | null) => void;
  reset: () => void;
}

const initialState = {
  phase: "hero" as StrategyPhase,
  userPrompt: "",
  manifestoData: null as ManifestoData | null,
  streamingOverview: null as Partial<ManifestoData> | null,
  flowData: null as FlowData | null,
  completedPages: [] as string[],
  currentBuildingPage: null as string | null,
  pendingApprovalPage: null as string | null,
};

export const useStrategyStore = create<StrategyState>((set) => ({
  ...initialState,

  setPhase: (phase) => set({ phase }),

  setUserPrompt: (prompt) => set({ userPrompt: prompt }),

  setManifestoData: (data) => set({ manifestoData: data, streamingOverview: null }),

  setStreamingOverview: (data) => set({ streamingOverview: data }),

  setFlowData: (data) => set({ flowData: data }),

  addCompletedPage: (pageId) =>
    set((state) => ({
      completedPages: state.completedPages.includes(pageId)
        ? state.completedPages
        : [...state.completedPages, pageId],
    })),

  setBuildingPage: (pageId) => set({ currentBuildingPage: pageId }),

  setPendingApprovalPage: (pageId) => set({ pendingApprovalPage: pageId }),

  reset: () => set(initialState),
}));
