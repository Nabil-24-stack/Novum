"use client";

import { useEffect, useRef, useCallback } from "react";
import { useSandpack } from "@codesandbox/sandpack-react";

interface SandpackFileSyncProps {
  files: Record<string, string>;
}

const DEBOUNCE_MS = 100;

export function SandpackFileSync({ files }: SandpackFileSyncProps) {
  const { sandpack } = useSandpack();
  const prevFilesRef = useRef<Record<string, string>>({});
  const isInitialized = useRef(false);

  // Refs for debounced batching
  const pendingUpdatesRef = useRef<Record<string, string>>({});
  const deletedPathsRef = useRef<Set<string>>(new Set());
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Create a stable JSON representation for comparison
  const filesJson = JSON.stringify(files);

  // Debounced sync function - batches rapid file changes into a single Sandpack update
  const syncToSandpack = useCallback(() => {
    const updates = pendingUpdatesRef.current;
    const deleted = deletedPathsRef.current;

    // Check if there are any pending changes
    const updatePaths = Object.keys(updates);
    const deletePaths = Array.from(deleted);

    if (updatePaths.length === 0 && deletePaths.length === 0) {
      return;
    }

    console.log("[SandpackSync] Syncing batched changes:", {
      updates: updatePaths,
      deletes: deletePaths,
    });

    // Clear pending refs before applying (so new changes during apply are captured)
    pendingUpdatesRef.current = {};
    deletedPathsRef.current = new Set();

    // Apply updates without triggering preview yet (false = don't update preview per file)
    Object.entries(updates).forEach(([path, content]) => {
      sandpack.updateFile(path, content, false);
    });

    // Apply deletes
    deleted.forEach((path) => {
      sandpack.deleteFile(path);
    });

    // Determine if we need a full reset vs just HMR
    const hasNewFiles = updatePaths.some(path => !(path in prevFilesRef.current));
    const hasManyChanges = updatePaths.length > 3;
    const hasPackageJson = updatePaths.includes("/package.json");

    if (hasNewFiles || hasManyChanges || hasPackageJson) {
      console.log("[SandpackSync] Structural change detected, running full reset", {
        hasNewFiles,
        hasManyChanges,
        hasPackageJson,
      });
      sandpack.runSandpack();
    } else {
      // For smaller changes, trigger a single preview update
      // This is handled by Sandpack's internal HMR after file updates
      console.log("[SandpackSync] Minor change, relying on HMR");
    }
  }, [sandpack]);

  useEffect(() => {
    // On first render, just store the initial files
    if (!isInitialized.current) {
      isInitialized.current = true;
      prevFilesRef.current = JSON.parse(filesJson);
      console.log("[SandpackSync] Initialized with files:", Object.keys(files));
      return;
    }

    const currentFiles = JSON.parse(filesJson) as Record<string, string>;
    const prevFiles = prevFilesRef.current;

    // Accumulate changed or new files
    Object.entries(currentFiles).forEach(([path, content]) => {
      if (prevFiles[path] !== content) {
        console.log(`[SandpackSync] Queueing file update: ${path}`);
        pendingUpdatesRef.current[path] = content;
      }
    });

    // Accumulate deleted files
    Object.keys(prevFiles).forEach((path) => {
      if (!(path in currentFiles)) {
        console.log(`[SandpackSync] Queueing file delete: ${path}`);
        deletedPathsRef.current.add(path);
        // Remove from pending updates if it was queued
        delete pendingUpdatesRef.current[path];
      }
    });

    // Update ref for next comparison
    prevFilesRef.current = currentFiles;

    // Debounce sync (100ms) - batches rapid AI file writes
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = setTimeout(syncToSandpack, DEBOUNCE_MS);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filesJson, syncToSandpack]);

  return null;
}
