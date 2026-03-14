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

export type AnnotationStatus = "idle" | "queued" | "evaluating" | "done" | "error";

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
  annotationStatus: AnnotationStatus;
  annotationConnectionCount: number;
  annotationError?: string;
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
  annotationQueue: string[];
  annotationActive: string | null;
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
  enqueueAnnotation: (pageId: string) => void;
  prependAnnotation: (pageId: string) => void;
  dequeueAnnotation: () => string | null;
  setAnnotationActivePage: (pageId: string | null) => void;
  updatePageAnnotation: (
    pageId: string,
    status: AnnotationStatus,
    extra?: { connectionCount?: number; error?: string }
  ) => void;
  pauseVerification: (pageId: string, errorText: string, errorPath?: string) => void;
  resumeVerification: () => void;
  clearVerificationPause: () => void;
  requestRepairInChat: (pageId: string) => void;
  clearRepairChatIntent: () => void;
  endParallelStreaming: () => void;
  resetTransientState: () => void;

  // --- Annotation evaluation ---
  annotationEvaluation: {
    status: "idle" | "evaluating" | "done" | "error";
    connectionCount: number;
    activePageId: string | null;
    activePageName: string | null;
    completedPages: number;
    failedPages: number;
    failedPageIds: string[];
    totalPages: number;
    errorMessage?: string;
  };
  setAnnotationEvaluation: (update: Partial<StreamingState["annotationEvaluation"]>) => void;
  setAnnotationEvaluating: (update?: Partial<StreamingState["annotationEvaluation"]>) => void;
  setAnnotationDone: (connectionCount: number, update?: Partial<StreamingState["annotationEvaluation"]>) => void;
  setAnnotationError: (message: string, update?: Partial<StreamingState["annotationEvaluation"]>) => void;
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

const createDefaultAnnotationEvaluation = () => ({
  status: "idle" as const,
  connectionCount: 0,
  activePageId: null,
  activePageName: null,
  completedPages: 0,
  failedPages: 0,
  failedPageIds: [] as string[],
  totalPages: 0,
});

const createTransientStreamingState = () => ({
  isStreaming: false,
  statusText: "",
  currentFile: null as { path: string; content: string } | null,
  completedFilePaths: [] as string[],
  targetPageId: null as string | null,
  targetPageIds: [] as string[],
  parallelMode: false,
  pageBuilds: {} as Record<string, PageBuildState>,
  buildPhase: "idle" as const,
  foundationPageId: null as string | null,
  foundationBuild: { ...defaultFoundationBuild },
  verificationQueue: [] as string[],
  verificationActive: null as string | null,
  annotationQueue: [] as string[],
  annotationActive: null as string | null,
  verificationPaused: false,
  verificationPausedPageId: null as string | null,
  verificationPausedErrorText: null as string | null,
  verificationPausedErrorPath: null as string | null,
  repairChatIntent: null as RepairChatIntent | null,
  annotationEvaluation: createDefaultAnnotationEvaluation(),
  refreshSignals: {} as Record<string, number>,
  verificationStatus: "idle" as const,
  verificationAttempt: 0,
  verificationIssues: [] as string[],
});

export const useStreamingStore = create<StreamingState>((set, get) => ({
  ...createTransientStreamingState(),

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
        annotationStatus: "idle",
        annotationConnectionCount: 0,
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
      annotationQueue: [],
      annotationActive: null,
      verificationPaused: false,
      verificationPausedPageId: null,
      verificationPausedErrorText: null,
      verificationPausedErrorPath: null,
      repairChatIntent: null,
      annotationEvaluation: {
        ...createDefaultAnnotationEvaluation(),
        totalPages: pageIds.length,
      },
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

  enqueueAnnotation: (pageId) => {
    set((s) => ({
      annotationQueue: s.annotationQueue.includes(pageId)
        ? s.annotationQueue
        : [...s.annotationQueue, pageId],
    }));
  },

  prependAnnotation: (pageId) => {
    set((s) => ({
      annotationQueue: s.annotationQueue.includes(pageId)
        ? [pageId, ...s.annotationQueue.filter((id) => id !== pageId)]
        : [pageId, ...s.annotationQueue],
    }));
  },

  dequeueAnnotation: () => {
    const { annotationQueue } = get();
    if (annotationQueue.length === 0) return null;
    const [next, ...rest] = annotationQueue;
    set({ annotationQueue: rest });
    return next;
  },

  setAnnotationActivePage: (pageId) => {
    set({ annotationActive: pageId });
  },

  updatePageAnnotation: (pageId, status, extra) => {
    const { pageBuilds } = get();
    const existing = pageBuilds[pageId];
    if (!existing) return;
    set({
      pageBuilds: {
        ...pageBuilds,
        [pageId]: {
          ...existing,
          annotationStatus: status,
          annotationConnectionCount: extra?.connectionCount ?? existing.annotationConnectionCount,
          annotationError: extra?.error,
        },
      },
    });
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
      annotationQueue: [],
      annotationActive: null,
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

  resetTransientState: () => {
    set(createTransientStreamingState());
  },

  // --- Annotation evaluation ---
  setAnnotationEvaluation: (update) => {
    set((s) => ({
      annotationEvaluation: { ...s.annotationEvaluation, ...update },
    }));
  },

  setAnnotationEvaluating: (update) => {
    set((s) => ({
      annotationEvaluation: {
        ...s.annotationEvaluation,
        status: "evaluating",
        errorMessage: undefined,
        ...update,
      },
    }));
  },

  setAnnotationDone: (connectionCount, update) => {
    set((s) => ({
      annotationEvaluation: {
        ...s.annotationEvaluation,
        status: "done",
        connectionCount,
        errorMessage: undefined,
        ...update,
      },
    }));
  },

  setAnnotationError: (message, update) => {
    set((s) => ({
      annotationEvaluation: {
        ...s.annotationEvaluation,
        status: "error",
        errorMessage: message,
        ...update,
      },
    }));
  },

  resetAnnotationEvaluation: () => {
    set({
      annotationEvaluation: createDefaultAnnotationEvaluation(),
    });
  },

  // --- Refresh signals ---
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
