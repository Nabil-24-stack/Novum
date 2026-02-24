"use client";

import { create } from "zustand";

export interface PageBuildState {
  status: "pending" | "streaming" | "completed" | "error";
  currentFile: { path: string; content: string } | null;
  completedFilePaths: string[];
  error?: string;
  // Per-page verification
  verificationStatus: VerificationStatus;
  verificationAttempt: number;
  verificationIssues: string[];
}

export type VerificationStatus = "idle" | "capturing" | "reviewing" | "fixing" | "passed" | "failed";

interface StreamingState {
  // --- Single-build mode (existing) ---
  isStreaming: boolean;
  statusText: string;
  currentFile: { path: string; content: string } | null;
  completedFilePaths: string[];
  targetPageId: string | null;

  startStreaming: (targetPageId?: string | null) => void;
  setStatusText: (text: string) => void;
  setCurrentFile: (path: string, content: string) => void;
  markFileComplete: (path: string) => void;
  setTargetPageId: (pageId: string | null) => void;
  endStreaming: () => void;

  // --- Parallel-build mode ---
  parallelMode: boolean;
  pageBuilds: Record<string, PageBuildState>;

  startParallelStreaming: (pageIds: string[]) => void;
  updatePageBuild: (pageId: string, update: Partial<PageBuildState>) => void;
  completePageBuild: (pageId: string) => void;
  failPageBuild: (pageId: string, error: string) => void;
  updatePageVerification: (pageId: string, status: VerificationStatus, extra?: { attempt?: number; issues?: string[] }) => void;
  endParallelStreaming: () => void;

  // --- Verification loop ---
  verificationStatus: VerificationStatus;
  verificationAttempt: number;
  verificationIssues: string[];

  startVerification: () => void;
  setVerificationCapturing: () => void;
  setVerificationReviewing: () => void;
  setVerificationFixing: (issues: string[]) => void;
  setVerificationPassed: () => void;
  setVerificationFailed: (issues: string[]) => void;
  resetVerification: () => void;
}

export const useStreamingStore = create<StreamingState>((set, get) => ({
  // --- Single-build mode ---
  isStreaming: false,
  statusText: "",
  currentFile: null,
  completedFilePaths: [],
  targetPageId: null,

  startStreaming: (targetPageId?: string | null) => {
    set({
      isStreaming: true,
      statusText: "",
      currentFile: null,
      completedFilePaths: [],
      targetPageId: targetPageId ?? null,
    });
  },

  setStatusText: (text) => {
    set({ statusText: text });
  },

  setCurrentFile: (path, content) => {
    set({ currentFile: { path, content } });
  },

  markFileComplete: (path) => {
    const { completedFilePaths } = get();
    if (!completedFilePaths.includes(path)) {
      set({ completedFilePaths: [...completedFilePaths, path] });
    }
  },

  setTargetPageId: (pageId) => {
    set({ targetPageId: pageId });
  },

  endStreaming: () => {
    set({
      isStreaming: false,
      currentFile: null,
      targetPageId: null,
    });
  },

  // --- Parallel-build mode ---
  parallelMode: false,
  pageBuilds: {},

  startParallelStreaming: (pageIds) => {
    const builds: Record<string, PageBuildState> = {};
    for (const id of pageIds) {
      builds[id] = {
        status: "pending",
        currentFile: null,
        completedFilePaths: [],
        verificationStatus: "idle",
        verificationAttempt: 0,
        verificationIssues: [],
      };
    }
    set({
      parallelMode: true,
      pageBuilds: builds,
      // Also set isStreaming so overlays know something is happening
      isStreaming: true,
      targetPageId: null,
    });
  },

  updatePageBuild: (pageId, update) => {
    const { pageBuilds } = get();
    const existing = pageBuilds[pageId];
    if (!existing) return;
    set({
      pageBuilds: {
        ...pageBuilds,
        [pageId]: { ...existing, ...update },
      },
    });
  },

  completePageBuild: (pageId) => {
    const { pageBuilds } = get();
    const existing = pageBuilds[pageId];
    if (!existing) return;
    set({
      pageBuilds: {
        ...pageBuilds,
        [pageId]: { ...existing, status: "completed", currentFile: null },
      },
    });
  },

  failPageBuild: (pageId, error) => {
    const { pageBuilds } = get();
    const existing = pageBuilds[pageId];
    if (!existing) return;
    set({
      pageBuilds: {
        ...pageBuilds,
        [pageId]: { ...existing, status: "error", error, currentFile: null },
      },
    });
  },

  updatePageVerification: (pageId, status, extra) => {
    const { pageBuilds } = get();
    const existing = pageBuilds[pageId];
    if (!existing) return;
    set({
      pageBuilds: {
        ...pageBuilds,
        [pageId]: {
          ...existing,
          verificationStatus: status,
          verificationAttempt: extra?.attempt ?? existing.verificationAttempt,
          verificationIssues: extra?.issues ?? existing.verificationIssues,
        },
      },
    });
  },

  endParallelStreaming: () => {
    set({
      parallelMode: false,
      pageBuilds: {},
      isStreaming: false,
      currentFile: null,
      targetPageId: null,
    });
  },

  // --- Verification loop ---
  verificationStatus: "idle",
  verificationAttempt: 0,
  verificationIssues: [],

  startVerification: () => {
    set({
      verificationStatus: "capturing",
      verificationAttempt: 1,
      verificationIssues: [],
    });
  },

  setVerificationCapturing: () => {
    set((s) => ({
      verificationStatus: "capturing",
      verificationAttempt: s.verificationAttempt,
    }));
  },

  setVerificationReviewing: () => {
    set({ verificationStatus: "reviewing" });
  },

  setVerificationFixing: (issues) => {
    set((s) => ({
      verificationStatus: "fixing",
      verificationAttempt: s.verificationAttempt + 1,
      verificationIssues: issues,
    }));
  },

  setVerificationPassed: () => {
    set({ verificationStatus: "passed" });
  },

  setVerificationFailed: (issues) => {
    set({
      verificationStatus: "failed",
      verificationIssues: issues,
    });
  },

  resetVerification: () => {
    set({
      verificationStatus: "idle",
      verificationAttempt: 0,
      verificationIssues: [],
    });
  },
}));
