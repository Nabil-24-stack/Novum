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
  illustration: string; // single SVG string
}

export interface KeyFeaturesData {
  ideaTitle: string;
  features: { name: string; description: string; priority: "high" | "medium" | "low" }[];
}

export interface UserFlowStep {
  nodeId: string;         // References a StrategyNode.id from the IA
  action: string;         // Brief action annotation (e.g., "Reviews analytics")
}

export interface UserFlow {
  id: string;
  jtbdIndex: number;      // 0-based index into ManifestoData.jtbd[]
  jtbdText: string;       // Full JTBD text for display
  personaNames: string[]; // Must match PersonaData.name exactly
  steps: UserFlowStep[];
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
  // Deep-dive mode (re-enter questioning phase after initial overview generation)
  isDeepDive: boolean;

  // Key features data (from solution-design phase)
  keyFeaturesData: KeyFeaturesData | null;
  streamingKeyFeatures: Partial<KeyFeaturesData> | null;

  // User flow data (JTBD-based flows through the IA, from solution-design phase)
  userFlowsData: UserFlow[] | null;
  streamingUserFlows: Partial<UserFlow>[] | null;

  // Flag: strategy artifacts were updated after pages were already built (triggers re-evaluation prompt)
  strategyUpdatedAfterBuild: boolean;

  // Journey map auto-continuation (for incomplete multi-persona generations)
  journeyMapContinueAttempts: number;
  isJourneyMapContinuing: boolean;

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
  setDeepDive: (v: boolean) => void;
  setKeyFeaturesData: (data: KeyFeaturesData) => void;
  setStreamingKeyFeatures: (data: Partial<KeyFeaturesData> | null) => void;
  setUserFlowsData: (data: UserFlow[]) => void;
  setStreamingUserFlows: (data: Partial<UserFlow>[] | null) => void;
  setStrategyUpdatedAfterBuild: (v: boolean) => void;
  setJourneyMapContinueAttempts: (n: number) => void;
  setIsJourneyMapContinuing: (v: boolean) => void;
  hydrate: (data: Partial<typeof initialState>) => void;
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
  isDeepDive: false,
  keyFeaturesData: null as KeyFeaturesData | null,
  streamingKeyFeatures: null as Partial<KeyFeaturesData> | null,
  userFlowsData: null as UserFlow[] | null,
  streamingUserFlows: null as Partial<UserFlow>[] | null,
  strategyUpdatedAfterBuild: false,
  journeyMapContinueAttempts: 0,
  isJourneyMapContinuing: false,
};

export const useStrategyStore = create<StrategyState>((set, get) => ({
  ...initialState,

  setPhase: (phase) => set({ phase }),

  setUserPrompt: (prompt) => set({ userPrompt: prompt }),

  setManifestoData: (data) => {
    const afterBuild = get().completedPages.length > 0;
    set({ manifestoData: data, streamingOverview: null, ...(afterBuild ? { strategyUpdatedAfterBuild: true } : {}) });
  },

  setStreamingOverview: (data) => set({ streamingOverview: data }),

  setPersonaData: (data) => {
    const afterBuild = get().completedPages.length > 0;
    set({ personaData: data, streamingPersonas: null, journeyMapContinueAttempts: 0, isJourneyMapContinuing: false, ...(afterBuild ? { strategyUpdatedAfterBuild: true } : {}) });
  },

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

  setJourneyMapData: (data) => {
    const afterBuild = get().completedPages.length > 0;
    set({ journeyMapData: data, streamingJourneyMaps: null, ...(afterBuild ? { strategyUpdatedAfterBuild: true } : {}) });
  },

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

  setDeepDive: (v) => set({ isDeepDive: v }),

  setKeyFeaturesData: (data) => set({ keyFeaturesData: data, streamingKeyFeatures: null }),

  setStreamingKeyFeatures: (data) => set({ streamingKeyFeatures: data }),

  setUserFlowsData: (data) => set({ userFlowsData: data, streamingUserFlows: null }),

  setStreamingUserFlows: (data) => set({ streamingUserFlows: data }),

  setStrategyUpdatedAfterBuild: (v) => set({ strategyUpdatedAfterBuild: v }),

  setJourneyMapContinueAttempts: (n) => set({ journeyMapContinueAttempts: n }),

  setIsJourneyMapContinuing: (v) => set({ isJourneyMapContinuing: v }),

  hydrate: (data: Partial<typeof initialState>) => set({
    ...initialState,
    ...data,
  }),

  reset: () => set(initialState),
}));
