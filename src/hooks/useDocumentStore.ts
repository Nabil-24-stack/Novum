"use client";

import { create } from "zustand";

export interface UploadedDocument {
  id: string;
  name: string;
  text: string;
  uploadedAt: string; // ISO timestamp
}

export interface InsightData {
  insight: string;
  quote: string;         // Direct citation from document
  sourceDocument: string; // File name
}

export interface InsightsCardData {
  insights: InsightData[];
  documents: { name: string; uploadedAt: string }[];
}

interface DocumentState {
  documents: UploadedDocument[];
  isUploading: boolean;
  insightsData: InsightsCardData | null;
  streamingInsights: Partial<InsightsCardData> | null;
  pendingReanalysis: boolean;

  // Actions
  addDocuments: (docs: UploadedDocument[]) => void;
  setUploading: (v: boolean) => void;
  setInsightsData: (data: InsightsCardData) => void;
  setStreamingInsights: (data: Partial<InsightsCardData> | null) => void;
  setPendingReanalysis: (v: boolean) => void;
  reset: () => void;
}

const initialState = {
  documents: [] as UploadedDocument[],
  isUploading: false,
  insightsData: null as InsightsCardData | null,
  streamingInsights: null as Partial<InsightsCardData> | null,
  pendingReanalysis: false,
};

export const useDocumentStore = create<DocumentState>((set) => ({
  ...initialState,

  addDocuments: (docs) =>
    set((state) => ({
      documents: [...state.documents, ...docs],
    })),

  setUploading: (v) => set({ isUploading: v }),

  setInsightsData: (data) => set({ insightsData: data, streamingInsights: null }),

  setStreamingInsights: (data) => set({ streamingInsights: data }),

  setPendingReanalysis: (v) => set({ pendingReanalysis: v }),

  reset: () => set(initialState),
}));
