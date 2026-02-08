"use client";

import { useState, useCallback } from "react";
import type { CanvasTool, GhostElement, DrawState } from "@/lib/canvas/types";

export type { CanvasTool, GhostElement, DrawState };

export interface UseCanvasToolReturn {
  activeTool: CanvasTool;
  setActiveTool: (tool: CanvasTool) => void;
  ghostElements: GhostElement[];
  setGhostElements: (ghosts: GhostElement[]) => void;
  addGhost: (ghost: GhostElement) => void;
  updateGhost: (id: string, updates: Partial<GhostElement>) => void;
  removeGhost: (id: string) => void;
  clearGhosts: () => void;
  drawState: DrawState;
  setDrawState: (state: DrawState) => void;
  startDrawing: (x: number, y: number) => void;
  updateDrawing: (x: number, y: number) => void;
  stopDrawing: () => void;
  // Selection state
  selectedGhostId: string | null;
  setSelectedGhostId: (id: string | null) => void;
  // Frame counter for auto-naming
  frameCounter: number;
  incrementFrameCounter: () => void;
}

const initialDrawState: DrawState = {
  isDrawing: false,
  startX: 0,
  startY: 0,
  currentX: 0,
  currentY: 0,
};

export function useCanvasTool(): UseCanvasToolReturn {
  const [activeTool, setActiveToolState] = useState<CanvasTool>("cursor");
  const [ghostElements, setGhostElements] = useState<GhostElement[]>([]);
  const [drawState, setDrawState] = useState<DrawState>(initialDrawState);
  const [selectedGhostId, setSelectedGhostId] = useState<string | null>(null);
  const [frameCounter, setFrameCounter] = useState(1);

  const setActiveTool = useCallback((tool: CanvasTool) => {
    setActiveToolState(tool);
    // Reset draw state when changing tools
    setDrawState(initialDrawState);
  }, []);

  const addGhost = useCallback((ghost: GhostElement) => {
    setGhostElements((prev) => [...prev, ghost]);
  }, []);

  const updateGhost = useCallback((id: string, updates: Partial<GhostElement>) => {
    setGhostElements((prev) =>
      prev.map((ghost) =>
        ghost.id === id ? { ...ghost, ...updates } : ghost
      )
    );
  }, []);

  const removeGhost = useCallback((id: string) => {
    setGhostElements((prev) => prev.filter((ghost) => ghost.id !== id));
    // Deselect if the removed ghost was selected
    setSelectedGhostId((prevId) => (prevId === id ? null : prevId));
  }, []);

  const clearGhosts = useCallback(() => {
    setGhostElements([]);
    setSelectedGhostId(null);
  }, []);

  const incrementFrameCounter = useCallback(() => {
    setFrameCounter((prev) => prev + 1);
  }, []);

  const startDrawing = useCallback((x: number, y: number) => {
    setDrawState({
      isDrawing: true,
      startX: x,
      startY: y,
      currentX: x,
      currentY: y,
    });
  }, []);

  const updateDrawing = useCallback((x: number, y: number) => {
    setDrawState((prev) => ({
      ...prev,
      currentX: x,
      currentY: y,
    }));
  }, []);

  const stopDrawing = useCallback(() => {
    setDrawState(initialDrawState);
  }, []);

  return {
    activeTool,
    setActiveTool,
    ghostElements,
    setGhostElements,
    addGhost,
    updateGhost,
    removeGhost,
    clearGhosts,
    drawState,
    setDrawState,
    startDrawing,
    updateDrawing,
    stopDrawing,
    selectedGhostId,
    setSelectedGhostId,
    frameCounter,
    incrementFrameCounter,
  };
}
