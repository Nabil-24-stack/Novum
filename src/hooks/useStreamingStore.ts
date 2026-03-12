"use client";

import { create } from "zustand";

export type BuildStage =
  | "pending"              // waiting for semaphore slot
  | "streaming"            // AI generating code
  | "unchanged"            // page preserved as-is during a scoped rebuild/edit
  | "generated"            // streaming done, file written to VFS
  | "queued_verification"  // in verification queue, waiting its turn
  | "verifying"            // currently being verified by Sandpack
  | "verified"             // passed verification -- safe for App.tsx + annotations
  | "build_failed"         // generation failed (API error, empty response)
  | "verify_failed";       // verification exhausted 3 retries, code exists but has issues

export interface FoundationArtifact {
  path: string;
  exports: string[];
  purpose: string;
}

export interface FoundationBuild {
  status: "idle" | "streaming" | "completed" | "error";
  artifacts: FoundationArtifact[];
  filePaths: string[];
  error?: string;
}

export interface RepairChatIntent {
  pageId: string;
  nonce: number;
}

export interface PageBuildState {
  // Legacy fields kept for backward compat with rebuild path (buildAllPages)
  status: "pending" | "streaming" | "completed" | "error";
  currentFile: { path: string; content: string } | null;
  completedFilePaths: string[];
  error?: string;
  // Per-page verification (legacy)
  verificationStatus: VerificationStatus;
  verificationAttempt: number;
  verificationIssues: string[];
  verificationLog: string[];
  // New parallel build stage
  buildStage: BuildStage;
}

export type VerificationStatus = "idle" | "capturing" | "reviewing" | "fixing" | "passed" | "failed";

const defaultFoundationBuild: FoundationBuild = {
  status: "idle",
  artifacts: [],
  filePaths: [],
};

interface StreamingState {
  // --- Single-build mode (existing) ---
  isStreaming: boolean;
  statusText: string;
  currentFile: { path: string; content: string } | null;
  completedFilePaths: string[];
  targetPageId: string | null;
  targetPageIds: string[];

  startStreaming: (targetPageIds?: string[] | null) => void;
  setStatusText: (text: string) => void;
  setCurrentFile: (path: string, content: string) => void;
  markFileComplete: (path: string) => void;
  setTargetPageId: (pageId: string | null) => void;
  setTargetPageIds: (pageIds: string[]) => void;
  endStreaming: () => void;

  // --- Parallel-build mode ---
  parallelMode: boolean;
  pageBuilds: Record<string, PageBuildState>;
  buildPhase: "idle" | "building";
  foundationPageId: string | null;
  foundationBuild: FoundationBuild;

  // Verification queue for parallel builds
  verificationQueue: string[];
  verificationActive: string | null;
  verificationPaused: boolean;
  verificationPausedPageId: string | null;
  verificationPausedErrorText: string | null;
  verificationPausedErrorPath: string | null;
  repairChatIntent: RepairChatIntent | null;

  startParallelStreaming: (pageIds: string[]) => void;
  updatePageBuild: (pageId: string, update: Partial<PageBuildState>) => void;
  completePageBuild: (pageId: string) => void;
  failPageBuild: (pageId: string, error: string) => void;
  updatePageVerification: (pageId: string, status: VerificationStatus, extra?: { attempt?: number; issues?: string[] }) => void;
  addPageVerificationLog: (pageId: string, message: string) => void;
  setPageBuildStage: (pageId: string, stage: BuildStage) => void;
  setFoundationBuild: (update: Partial<FoundationBuild>) => void;
  enqueueVerification: (pageId: string) => void;
  prependVerification: (pageId: string) => void;
  dequeueVerification: () => string | null;
  setVerificationActive: (pageId: string | null) => void;
  pauseVerification: (pageId: string, errorText: string, errorPath?: string) => void;
  resumeVerification: () => void;
  clearVerificationPause: () => void;
  requestRepairInChat: (pageId: string) => void;
  clearRepairChatIntent: () => void;
  endParallelStreaming: () => void;

  // --- Annotation evaluation ---
  annotationEvaluation: {
    status: "idle" | "evaluating" | "done" | "error";
    connectionCount: number;
    errorMessage?: string;
  };
  setAnnotationEvaluating: () => void;
  setAnnotationDone: (connectionCount: number) => void;
  setAnnotationError: (message: string) => void;
  resetAnnotationEvaluation: () => void;

  // --- Refresh signals (store-based iframe remount) ---
  refreshSignals: Record<string, number>;
  triggerRefresh: (pageId?: string) => void;

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
  targetPageIds: [],

  startStreaming: (targetPageIds?: string[] | null) => {
    const normalizedPageIds = targetPageIds?.filter(Boolean) ?? [];
    set({
      isStreaming: true,
      statusText: "",
      currentFile: null,
      completedFilePaths: [],
      targetPageId: normalizedPageIds[0] ?? null,
      targetPageIds: normalizedPageIds,
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
    set({ targetPageId: pageId, targetPageIds: pageId ? [pageId] : [] });
  },

  setTargetPageIds: (pageIds) => {
    const normalizedPageIds = pageIds.filter(Boolean);
    set({
      targetPageId: normalizedPageIds[0] ?? null,
      targetPageIds: normalizedPageIds,
    });
  },

  endStreaming: () => {
    set({
      isStreaming: false,
      currentFile: null,
      targetPageId: null,
      targetPageIds: [],
    });
  },

  // --- Parallel-build mode ---
  parallelMode: false,
  pageBuilds: {},
  buildPhase: "idle",
  foundationPageId: null,
  foundationBuild: { ...defaultFoundationBuild },

  verificationQueue: [],
  verificationActive: null,
  verificationPaused: false,
  verificationPausedPageId: null,
  verificationPausedErrorText: null,
  verificationPausedErrorPath: null,
  repairChatIntent: null,

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
        verificationLog: [],
        buildStage: "pending",
      };
    }
    set({
      parallelMode: true,
      pageBuilds: builds,
      buildPhase: "building",
      foundationPageId: pageIds[0] || null,
      foundationBuild: { ...defaultFoundationBuild },
      verificationQueue: [],
      verificationActive: null,
      verificationPaused: false,
      verificationPausedPageId: null,
      verificationPausedErrorText: null,
      verificationPausedErrorPath: null,
      repairChatIntent: null,
      annotationEvaluation: { status: "idle", connectionCount: 0 },
      // Also set isStreaming so overlays know something is happening
      isStreaming: true,
      targetPageId: null,
      targetPageIds: [],
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
        [pageId]: { ...existing, status: "error", error, currentFile: null, buildStage: "build_failed" },
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
          // Clear log when resetting to idle (retry scenario)
          verificationLog: status === "idle" ? [] : existing.verificationLog,
        },
      },
    });
  },

  addPageVerificationLog: (pageId, message) => {
    const { pageBuilds } = get();
    const existing = pageBuilds[pageId];
    if (!existing) return;
    set({
      pageBuilds: {
        ...pageBuilds,
        [pageId]: {
          ...existing,
          verificationLog: [...existing.verificationLog, message],
        },
      },
    });
  },

  setPageBuildStage: (pageId, stage) => {
    const { pageBuilds } = get();
    const existing = pageBuilds[pageId];
    if (!existing) return;
    // Sync legacy status field from buildStage for backward compat
    let legacyStatus = existing.status;
    if (stage === "pending") legacyStatus = "pending";
    else if (stage === "streaming") legacyStatus = "streaming";
    else if (stage === "unchanged" || stage === "generated" || stage === "queued_verification" || stage === "verifying" || stage === "verified") legacyStatus = "completed";
    else if (stage === "build_failed") legacyStatus = "error";
    else if (stage === "verify_failed") legacyStatus = "completed";
    set({
      pageBuilds: {
        ...pageBuilds,
        [pageId]: { ...existing, buildStage: stage, status: legacyStatus },
      },
    });
  },

  setFoundationBuild: (update) => {
    set((s) => ({
      foundationBuild: { ...s.foundationBuild, ...update },
    }));
  },

  enqueueVerification: (pageId) => {
    set((s) => ({
      verificationQueue: s.verificationQueue.includes(pageId)
        ? s.verificationQueue
        : [...s.verificationQueue, pageId],
    }));
  },

  prependVerification: (pageId) => {
    set((s) => ({
      verificationQueue: s.verificationQueue.includes(pageId)
        ? [pageId, ...s.verificationQueue.filter((id) => id !== pageId)]
        : [pageId, ...s.verificationQueue],
    }));
  },

  dequeueVerification: () => {
    const { verificationQueue } = get();
    if (verificationQueue.length === 0) return null;
    const [next, ...rest] = verificationQueue;
    set({ verificationQueue: rest });
    return next;
  },

  setVerificationActive: (pageId) => {
    set({ verificationActive: pageId });
  },

  pauseVerification: (pageId, errorText, errorPath) => {
    set({
      verificationPaused: true,
      verificationPausedPageId: pageId,
      verificationPausedErrorText: errorText,
      verificationPausedErrorPath: errorPath ?? null,
    });
  },

  resumeVerification: () => {
    set({
      verificationPaused: false,
      verificationPausedPageId: null,
      verificationPausedErrorText: null,
      verificationPausedErrorPath: null,
    });
  },

  clearVerificationPause: () => {
    set({
      verificationPaused: false,
      verificationPausedPageId: null,
      verificationPausedErrorText: null,
      verificationPausedErrorPath: null,
    });
  },

  requestRepairInChat: (pageId) => {
    set({
      repairChatIntent: {
        pageId,
        nonce: Date.now(),
      },
    });
  },

  clearRepairChatIntent: () => {
    set({ repairChatIntent: null });
  },

  endParallelStreaming: () => {
    set({
      parallelMode: false,
      pageBuilds: {},
      buildPhase: "idle",
      foundationPageId: null,
      foundationBuild: { ...defaultFoundationBuild },
      verificationQueue: [],
      verificationActive: null,
      verificationPaused: false,
      verificationPausedPageId: null,
      verificationPausedErrorText: null,
      verificationPausedErrorPath: null,
      repairChatIntent: null,
      isStreaming: false,
      currentFile: null,
      targetPageId: null,
      targetPageIds: [],
      refreshSignals: {},
    });
  },

  // --- Annotation evaluation ---
  annotationEvaluation: { status: "idle" as const, connectionCount: 0 },

  setAnnotationEvaluating: () => {
    set({ annotationEvaluation: { status: "evaluating", connectionCount: 0 } });
  },

  setAnnotationDone: (connectionCount) => {
    set({ annotationEvaluation: { status: "done", connectionCount } });
  },

  setAnnotationError: (message) => {
    set({ annotationEvaluation: { status: "error", connectionCount: 0, errorMessage: message } });
  },

  resetAnnotationEvaluation: () => {
    set({ annotationEvaluation: { status: "idle", connectionCount: 0 } });
  },

  // --- Refresh signals ---
  refreshSignals: {},

  triggerRefresh: (pageId) => {
    if (pageId) {
      set((s) => ({
        refreshSignals: {
          ...s.refreshSignals,
          [pageId]: (s.refreshSignals[pageId] ?? 0) + 1,
        },
      }));
    } else {
      set((s) => ({
        refreshSignals: {
          ...s.refreshSignals,
          __all__: (s.refreshSignals.__all__ ?? 0) + 1,
        },
      }));
    }
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
