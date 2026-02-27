"use client";

import { create } from "zustand";
import type { SourceLocation } from "@/lib/inspection/types";

export interface PinnedElement {
  id: string; // "fileName:line:column"
  tagName: string;
  displayLabel: string; // e.g. "<div.sidebar>" or "<Button>"
  source: SourceLocation;
  className?: string;
  textContent?: string;
}

export interface AddressGapsPayload {
  unaddressedJtbds: { index: number; text: string }[];
}

interface ChatContextState {
  pinnedElements: PinnedElement[];
  contextMenu: {
    visible: boolean;
    x: number;
    y: number;
    element: PinnedElement | null;
  };
  pendingAddressGaps: AddressGapsPayload | null;
  showContextMenu: (x: number, y: number, element: PinnedElement) => void;
  hideContextMenu: () => void;
  pinElement: (element: PinnedElement) => void;
  unpinElement: (id: string) => void;
  clearPinnedElements: () => void;
  setPendingAddressGaps: (payload: AddressGapsPayload | null) => void;
}

export const useChatContextStore = create<ChatContextState>((set, get) => ({
  pinnedElements: [],
  contextMenu: { visible: false, x: 0, y: 0, element: null },
  pendingAddressGaps: null,

  showContextMenu: (x, y, element) => {
    set({ contextMenu: { visible: true, x, y, element } });
  },

  hideContextMenu: () => {
    set({ contextMenu: { visible: false, x: 0, y: 0, element: null } });
  },

  pinElement: (element) => {
    const { pinnedElements } = get();
    // No-op if already pinned
    if (pinnedElements.some((el) => el.id === element.id)) return;
    set({ pinnedElements: [...pinnedElements, element] });
  },

  unpinElement: (id) => {
    set({ pinnedElements: get().pinnedElements.filter((el) => el.id !== id) });
  },

  clearPinnedElements: () => {
    set({ pinnedElements: [] });
  },

  setPendingAddressGaps: (payload) => {
    set({ pendingAddressGaps: payload });
  },
}));
