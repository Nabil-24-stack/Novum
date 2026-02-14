"use client";

import { create } from "zustand";

export type StrategyPhase = "hero" | "manifesto" | "persona" | "flow" | "wireframe" | "building" | "complete";

export interface ConfidenceDimension {
  score: number;    // 0-100
  summary: string;  // What the AI knows so far
}

export interface ConfidenceData {
  overall: number;  // 0-100
  dimensions: {
    targetUser: ConfidenceDimension;
    coreProblem: ConfidenceDimension;
    jobsToBeDone: ConfidenceDimension;
    constraints: ConfidenceDimension;
    successMetrics: ConfidenceDimension;
  };
}

export interface PersonaData {
  name: string;
  role: string;        // e.g. "Marketing Manager at SaaS startup"
  bio: string;         // 1-2 sentence bio
  goals: string[];     // 2-3 goals
  painPoints: string[];// 2-3 pain points
  quote: string;       // First-person key quote
}

export interface ManifestoData {
  title: string;
  problemStatement: string;
  targetUser: string;
  jtbd: string[];
  hmw: string[];
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

export interface WireframeElement {
  type: "button" | "input" | "toggle" | "search" | "select" | "badge" | "avatar" | "checkbox" | "textarea";
  label: string;
  variant?: "primary" | "secondary" | "outline" | "destructive" | "ghost";
}

export interface WireframeSection {
  label: string;
  flex?: number;                 // flex-grow weight (default 1)
  type?: "header" | "row" | "grid" | "block" | "list";
  children?: WireframeSection[]; // for row type (horizontal children)
  columns?: number;              // for grid type
  items?: string[];              // for grid/list types
  elements?: WireframeElement[]; // inline component placeholders at natural size
}

export interface WireframePage {
  id: string;
  name: string;
  sections: WireframeSection[];
}

export interface WireframeData {
  pages: WireframePage[];
}

interface StrategyState {
  phase: StrategyPhase;
  userPrompt: string;
  manifestoData: ManifestoData | null;
  streamingOverview: Partial<ManifestoData> | null;
  personaData: PersonaData[] | null;
  streamingPersonas: Partial<PersonaData>[] | null;
  flowData: FlowData | null;
  confidenceData: ConfidenceData | null;
  wireframeData: WireframeData | null;
  streamingWireframes: WireframeData | null;
  completedPages: string[];
  currentBuildingPage: string | null;
  pendingApprovalPage: string | null;

  // Actions
  setPhase: (phase: StrategyPhase) => void;
  setUserPrompt: (prompt: string) => void;
  setManifestoData: (data: ManifestoData) => void;
  setStreamingOverview: (data: Partial<ManifestoData> | null) => void;
  setPersonaData: (data: PersonaData[]) => void;
  setStreamingPersonas: (data: Partial<PersonaData>[] | null) => void;
  setFlowData: (data: FlowData) => void;
  setConfidenceData: (data: ConfidenceData) => void;
  setWireframeData: (data: WireframeData | null) => void;
  setStreamingWireframes: (data: WireframeData | null) => void;
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
  personaData: null as PersonaData[] | null,
  streamingPersonas: null as Partial<PersonaData>[] | null,
  flowData: null as FlowData | null,
  confidenceData: null as ConfidenceData | null,
  wireframeData: null as WireframeData | null,
  streamingWireframes: null as WireframeData | null,
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

  setPersonaData: (data) => set({ personaData: data, streamingPersonas: null }),

  setStreamingPersonas: (data) => set({ streamingPersonas: data }),

  setFlowData: (data) => set({ flowData: data }),

  setConfidenceData: (data) => set({ confidenceData: data }),

  setWireframeData: (data) => set({ wireframeData: data, streamingWireframes: null }),

  setStreamingWireframes: (data) => set({ streamingWireframes: data }),

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
