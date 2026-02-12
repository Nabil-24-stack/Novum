"use client";

import { create } from "zustand";

interface StreamingState {
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
}

export const useStreamingStore = create<StreamingState>((set, get) => ({
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
}));
