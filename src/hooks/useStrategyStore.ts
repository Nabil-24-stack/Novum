"use client";

import { create } from "zustand";

export type StrategyPhase = "hero" | "problem-overview" | "ideation" | "solution-design" | "building" | "complete";

export interface ConfidenceDimension {
  score: number;    // 0-100
  summary: string;  // What the AI knows so far
}

export interface ConfidenceData {
  overall: number;  // 0-100
  dimensions: {
    targetUser: ConfidenceDimension;
    coreProblem: ConfidenceDimension;
    currentWorkflow: ConfidenceDimension;
    domainContext: ConfidenceDimension;
    stakesAndImpact: ConfidenceDimension;
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

export interface JourneyStage {
  stage: string;         // AI-decided stage name (e.g. "Awareness", "Onboarding")
  actions: string[];     // What the user does
  thoughts: string[];    // What the user thinks
  emotion: string;       // Single emoji or short word (e.g. "frustrated", "hopeful")
  painPoints: string[];  // Friction points
  opportunities: string[]; // Design opportunities
}

export interface JourneyMapData {
  personaName: string;   // Links to which persona this map belongs to
  stages: JourneyStage[];
}

export interface IdeaData {
  id: string;
  title: string;
  description: string;
  keyFeatures: string[];
  pros: string[];
  cons: string[];
  illustrations: string[];
}

export interface WireframeElement {
  type: "button" | "input" | "toggle" | "search" | "select" | "badge" | "avatar" | "checkbox" | "textarea";
  label: string;
  variant?: "primary" | "secondary" | "outline" | "destructive" | "ghost";
}

export interface WireframeSection {
  label: string;
  flex?: number;
  type?: "header" | "row" | "grid" | "block" | "list";
  children?: WireframeSection[];
  columns?: number;
  items?: string[];
  elements?: WireframeElement[];
}

export interface WireframePage {
  id: string;
  name: string;
  sections: WireframeSection[];
}

export interface WireframeData {
  pages: WireframePage[];
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

interface StrategyState {
  phase: StrategyPhase;
  userPrompt: string;
  manifestoData: ManifestoData | null;
  streamingOverview: Partial<ManifestoData> | null;
  personaData: PersonaData[] | null;
  streamingPersonas: Partial<PersonaData>[] | null;
  flowData: FlowData | null;
  confidenceData: ConfidenceData | null;
  journeyMapData: JourneyMapData[] | null;
  streamingJourneyMaps: Partial<JourneyMapData>[] | null;
  ideaData: IdeaData[] | null;
  streamingIdeas: Partial<IdeaData>[] | null;
  selectedIdeaId: string | null;
  completedPages: string[];
  currentBuildingPage: string | null;
  currentBuildingPages: string[];
  pendingApprovalPage: string | null;

  // Deep-dive mode (re-enter questioning phase after initial overview generation)
  isDeepDive: boolean;

  // Wireframe data (JSON wireframes from solution-design phase)
  wireframeData: WireframeData | null;
  streamingWireframes: WireframeData | null;

  // Actions
  setPhase: (phase: StrategyPhase) => void;
  setUserPrompt: (prompt: string) => void;
  setManifestoData: (data: ManifestoData) => void;
  setStreamingOverview: (data: Partial<ManifestoData> | null) => void;
  setPersonaData: (data: PersonaData[]) => void;
  setStreamingPersonas: (data: Partial<PersonaData>[] | null) => void;
  setFlowData: (data: FlowData) => void;
  setConfidenceData: (data: ConfidenceData) => void;
  setJourneyMapData: (data: JourneyMapData[]) => void;
  setStreamingJourneyMaps: (data: Partial<JourneyMapData>[] | null) => void;
  setIdeaData: (data: IdeaData[]) => void;
  setStreamingIdeas: (data: Partial<IdeaData>[] | null) => void;
  setSelectedIdeaId: (id: string | null) => void;
  addCompletedPage: (pageId: string) => void;
  setBuildingPage: (pageId: string | null) => void;
  setBuildingPages: (pageIds: string[]) => void;
  setPendingApprovalPage: (pageId: string | null) => void;
  setDeepDive: (v: boolean) => void;
  setWireframeData: (data: WireframeData) => void;
  setStreamingWireframes: (data: WireframeData | null) => void;
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
  journeyMapData: null as JourneyMapData[] | null,
  streamingJourneyMaps: null as Partial<JourneyMapData>[] | null,
  ideaData: null as IdeaData[] | null,
  streamingIdeas: null as Partial<IdeaData>[] | null,
  selectedIdeaId: null as string | null,
  completedPages: [] as string[],
  currentBuildingPage: null as string | null,
  currentBuildingPages: [] as string[],
  pendingApprovalPage: null as string | null,
  isDeepDive: false,
  wireframeData: null as WireframeData | null,
  streamingWireframes: null as WireframeData | null,
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

  setConfidenceData: (data) =>
    set((state) => {
      // Confidence ratchet: during deep-dive, scores can only go up
      if (state.isDeepDive && state.confidenceData) {
        const prev = state.confidenceData.dimensions;
        const ratcheted: ConfidenceData = {
          overall: 0,
          dimensions: {
            targetUser: {
              score: Math.max(prev.targetUser.score, data.dimensions.targetUser.score),
              summary: data.dimensions.targetUser.summary,
            },
            coreProblem: {
              score: Math.max(prev.coreProblem.score, data.dimensions.coreProblem.score),
              summary: data.dimensions.coreProblem.summary,
            },
            currentWorkflow: {
              score: Math.max(prev.currentWorkflow.score, data.dimensions.currentWorkflow.score),
              summary: data.dimensions.currentWorkflow.summary,
            },
            domainContext: {
              score: Math.max(prev.domainContext.score, data.dimensions.domainContext.score),
              summary: data.dimensions.domainContext.summary,
            },
            stakesAndImpact: {
              score: Math.max(prev.stakesAndImpact.score, data.dimensions.stakesAndImpact.score),
              summary: data.dimensions.stakesAndImpact.summary,
            },
          },
        };
        const scores = Object.values(ratcheted.dimensions).map((d) => d.score);
        ratcheted.overall = Math.min(100, Math.round(scores.reduce((a, b) => a + b, 0) / scores.length));
        return { confidenceData: ratcheted };
      }
      return { confidenceData: data };
    }),

  setJourneyMapData: (data) => set({ journeyMapData: data, streamingJourneyMaps: null }),

  setStreamingJourneyMaps: (data) => set({ streamingJourneyMaps: data }),

  setIdeaData: (data) => set({ ideaData: data, streamingIdeas: null }),

  setStreamingIdeas: (data) => set({ streamingIdeas: data }),

  setSelectedIdeaId: (id) => set({ selectedIdeaId: id }),

  addCompletedPage: (pageId) =>
    set((state) => ({
      completedPages: state.completedPages.includes(pageId)
        ? state.completedPages
        : [...state.completedPages, pageId],
    })),

  setBuildingPage: (pageId) => set({ currentBuildingPage: pageId }),

  setBuildingPages: (pageIds) => set({ currentBuildingPages: pageIds, currentBuildingPage: null }),

  setPendingApprovalPage: (pageId) => set({ pendingApprovalPage: pageId }),

  setDeepDive: (v) => set({ isDeepDive: v }),

  setWireframeData: (data) => set({ wireframeData: data, streamingWireframes: null }),

  setStreamingWireframes: (data) => set({ streamingWireframes: data }),

  reset: () => set(initialState),
}));
