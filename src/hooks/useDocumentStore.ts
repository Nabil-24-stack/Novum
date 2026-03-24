"use client";

import { create } from "zustand";
import { createDeterministicTraceableId } from "@/lib/strategy/traceable";

export interface UploadedDocument {
  id: string;
  name: string;
  text: string;
  uploadedAt: string; // ISO timestamp
}

export interface InsightData {
  id: string;
  insight: string;
  quote?: string;                          // Only for document-sourced insights
  sourceDocument?: string;                 // Only for document-sourced insights
  source?: "document" | "conversation";    // Provenance
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
  setDocuments: (docs: UploadedDocument[]) => void;
  reset: () => void;
}

const initialState = {
  documents: [] as UploadedDocument[],
  isUploading: false,
  insightsData: null as InsightsCardData | null,
  streamingInsights: null as Partial<InsightsCardData> | null,
  pendingReanalysis: false,
};

function normalizeInsightsData(
  data: InsightsCardData,
  previous: InsightsCardData | null
): InsightsCardData {
  const previousInsights = previous?.insights ?? [];
  const previousByText = new Map<string, InsightData[]>();
  const usedIds = new Set<string>();

  for (const insight of previousInsights) {
    const key = insight.insight.trim();
    const queue = previousByText.get(key);
    if (queue) {
      queue.push(insight);
    } else {
      previousByText.set(key, [insight]);
    }
  }

  return {
    documents: data.documents ?? [],
    insights: (data.insights ?? []).flatMap((item, index) => {
        const insightText = item.insight.trim();
        const quote = item.quote?.trim();
        const sourceDocument = item.sourceDocument?.trim();
        if (!insightText && !quote && !sourceDocument) return [];

        if (item.id?.trim()) {
          usedIds.add(item.id);
          return [{
            ...item,
            id: item.id.trim(),
            insight: insightText,
            quote,
            sourceDocument,
          }];
        }

        const sameIndex = previousInsights[index];
        if (sameIndex && !usedIds.has(sameIndex.id)) {
          usedIds.add(sameIndex.id);
          return [{
            ...item,
            id: sameIndex.id,
            insight: insightText,
            quote,
            sourceDocument,
          }];
        }

        const textMatches = previousByText.get(insightText);
        const match = textMatches?.find((candidate) => !usedIds.has(candidate.id));
        if (match) {
          usedIds.add(match.id);
          return [{
            ...item,
            id: match.id,
            insight: insightText,
            quote,
            sourceDocument,
          }];
        }

        const id = createDeterministicTraceableId(
          "insight",
          `${index}:${insightText}:${sourceDocument ?? ""}:${quote ?? ""}`
        );
        usedIds.add(id);
        return [{
          ...item,
          id,
          insight: insightText,
          quote,
          sourceDocument,
        }];
      }),
  };
}

export const useDocumentStore = create<DocumentState>((set) => ({
  ...initialState,

  addDocuments: (docs) =>
    set((state) => ({
      documents: [...state.documents, ...docs],
    })),

  setUploading: (v) => set({ isUploading: v }),

  setInsightsData: (data) =>
    set((state) => ({
      insightsData: normalizeInsightsData(data, state.insightsData),
      streamingInsights: null,
    })),

  setStreamingInsights: (data) => set({ streamingInsights: data }),

  setPendingReanalysis: (v) => set({ pendingReanalysis: v }),

  setDocuments: (docs) => set({ documents: docs }),

  reset: () => set(initialState),
}));
