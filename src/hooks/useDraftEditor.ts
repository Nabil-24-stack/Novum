"use client";

import { useRef, useCallback, useState, useEffect } from "react";
import { useWriter } from "./useWriter";
import type { SourceLocation } from "@/lib/inspection/types";

export interface DraftState {
  selectionId?: string;
  selector: string;
  originalClassName: string;
  draftClassName: string;
  revision: number;
}

export interface TextDraftState {
  selectionId?: string;
  selector: string;
  originalText: string;
  draftText: string;
  revision: number;
}

export interface UseDraftEditorProps {
  files: Record<string, string>;
  writeFile: (path: string, content: string) => void;
  /** Debounce delay in ms before auto-saving to VFS. Default: 3000ms */
  debounceMs?: number;
  onError?: (message: string) => void;
}

export interface UseDraftEditorReturn {
  draft: DraftState | null;
  textDraft: TextDraftState | null;
  /** True while the VFS commit is in progress */
  isPending: boolean;
  /** True when there are uncommitted changes (debounce timer running) */
  hasPendingChanges: boolean;
  updateClasses: (
    selector: string,
    originalClassName: string,
    newClassName: string,
    sourceLocation?: SourceLocation,
    selectionId?: string
  ) => void;
  /** Update text with optimistic UI - instant DOM update, debounced VFS write */
  updateText: (
    selector: string,
    originalText: string,
    newText: string,
    sourceLocation?: SourceLocation,
    selectionId?: string
  ) => void;
  flush: () => Promise<void>;
  cancel: () => void;
}

/**
 * Broadcasts a message to all Sandpack preview iframes.
 */
function broadcastToIframes(message: { type: string; payload?: unknown }) {
  const iframes = document.querySelectorAll<HTMLIFrameElement>(
    'iframe[title="Sandpack Preview"]'
  );
  iframes.forEach((iframe) => {
    iframe.contentWindow?.postMessage(message, "*");
  });
}

/**
 * Hook for optimistic UI updates with Smart Debounce strategy.
 *
 * - Updates DOM instantly via postMessage for zero-latency preview
 * - Auto-saves to VFS after debounce period (default 1000ms)
 * - Timer resets on each edit (standard debounce behavior)
 * - Also commits on: selection change, inspection off, unmount
 */
export function useDraftEditor({
  files,
  writeFile,
  debounceMs = 250,
  onError,
}: UseDraftEditorProps): UseDraftEditorReturn {
  const writer = useWriter({ files, writeFile });

  // Store writer in ref for cleanup (avoids dependency on writer which changes every render)
  const writerRef = useRef(writer);

  // Current draft state (mutable ref for immediate access)
  const draftRef = useRef<DraftState | null>(null);

  // Snapshot for React rendering
  const [draftSnapshot, setDraftSnapshot] = useState<DraftState | null>(null);

  // Debounce timer ref
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const classRevisionRef = useRef(0);

  // Text draft state and refs
  const textDraftRef = useRef<TextDraftState | null>(null);
  const [textDraftSnapshot, setTextDraftSnapshot] = useState<TextDraftState | null>(null);
  const textTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const textRevisionRef = useRef(0);

  // Store source location for text commits
  const textSourceLocationRef = useRef<SourceLocation | undefined>(undefined);

  // Store source location for class commits
  const classSourceLocationRef = useRef<SourceLocation | undefined>(undefined);

  // RAF-coalesced optimistic preview messages
  const classPreviewRef = useRef<{ selector: string; newClassName: string } | null>(null);
  const classPreviewRafRef = useRef<number | null>(null);
  const textPreviewRef = useRef<{ selector: string; newText: string } | null>(null);
  const textPreviewRafRef = useRef<number | null>(null);

  // isPending = true while the VFS commit is in progress
  const [isPending, setIsPending] = useState(false);

  // hasPendingChanges = true when there are uncommitted changes
  const hasPendingChanges = draftSnapshot !== null || textDraftSnapshot !== null;

  // Keep writerRef in sync with latest writer (for use in cleanup effect)
  useEffect(() => {
    writerRef.current = writer;
  });

  /**
   * Commit the current class draft to VFS.
   * Called on: debounce timer, selection change, inspection mode off, unmount.
   */
  const commitDraft = useCallback(async () => {
    // Clear any pending timer
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    const draft = draftRef.current;
    if (!draft) {
      return;
    }

    const { selector, originalClassName, draftClassName } = draft;
    const revision = draft.revision;
    const sourceLocation = classSourceLocationRef.current;

    // Stale commit guard: only the latest revision can commit.
    if (revision !== classRevisionRef.current) {
      return;
    }

    // Skip if no actual change
    if (originalClassName === draftClassName) {
      draftRef.current = null;
      setDraftSnapshot(null);
      classSourceLocationRef.current = undefined;
      return;
    }

    // Show "Saving..." indicator during commit
    setIsPending(true);

    // Attempt to write to VFS (with source location if available)
    const result = writer.updateElementClasses(
      selector,
      originalClassName,
      draftClassName,
      sourceLocation
    );

    if (!result.success) {
      // Check if this is a "pattern not found" error vs an actual failure
      const isPatternNotFound =
        result.error?.includes("generated dynamically") ||
        result.error?.includes("couldn't apply changes");

      if (isPatternNotFound) {
        // Pattern not found - this can happen when:
        // 1. The element has classes from conditionals that aren't in static source
        // 2. The VFS files changed since editing started
        // 3. The element is inside a component
        //
        // In these cases, silently discard the changes.
        // The DOM will reset to VFS state on next Sandpack recompile.
        console.warn(
          "[useDraftEditor] Could not persist changes - pattern not found in source:",
          result.error
        );
        // No rollback needed - let Sandpack handle it on recompile
      } else {
        // Unexpected error - rollback and notify user
        broadcastToIframes({
          type: "novum:rollback-classes",
          payload: { selector, originalClassName },
        });
        onError?.(result.error || "Failed to save changes");
        console.error("[useDraftEditor] VFS write failed:", result.error);
      }
    } else {
      console.log(
        "[useDraftEditor] VFS commit successful:",
        result.file,
        `"${originalClassName}" -> "${draftClassName}"`
      );
    }

    // Clear draft state
    if (draftRef.current?.revision === revision) {
      draftRef.current = null;
      setDraftSnapshot(null);
    }
    classSourceLocationRef.current = undefined;
    setIsPending(false);
  }, [writer, onError]);

  /**
   * Commit the current text draft to VFS.
   * Called on: debounce timer, selection change, inspection mode off, unmount.
   */
  const commitTextDraft = useCallback(async () => {
    // Clear any pending timer
    if (textTimerRef.current) {
      clearTimeout(textTimerRef.current);
      textTimerRef.current = null;
    }

    const textDraft = textDraftRef.current;
    if (!textDraft) {
      return;
    }

    const { selector, originalText, draftText } = textDraft;
    const revision = textDraft.revision;
    const sourceLocation = textSourceLocationRef.current;

    // Stale commit guard: only the latest revision can commit.
    if (revision !== textRevisionRef.current) {
      return;
    }

    // Skip if no actual change
    if (originalText === draftText) {
      textDraftRef.current = null;
      setTextDraftSnapshot(null);
      textSourceLocationRef.current = undefined;
      return;
    }

    // Show "Saving..." indicator during commit
    setIsPending(true);

    // Attempt to write to VFS (with source location if available)
    // Note: updateElementText signature is (originalText, newText, className, sourceLocation)
    // We pass empty className since we're using AST-based editing with sourceLocation
    const result = writer.updateElementText(
      originalText,
      draftText,
      "", // className not needed when using AST
      sourceLocation
    );

    if (!result.success) {
      // Check if this is a "pattern not found" error vs an actual failure
      const isPatternNotFound =
        result.error?.includes("dynamically generated") ||
        result.error?.includes("not find text");

      if (isPatternNotFound) {
        // Pattern not found - silently discard changes
        console.warn(
          "[useDraftEditor] Could not persist text changes - pattern not found in source:",
          result.error
        );
      } else {
        // Unexpected error - rollback and notify user
        broadcastToIframes({
          type: "novum:rollback-text",
          payload: { selector, originalText },
        });
        onError?.(result.error || "Failed to save text changes");
        console.error("[useDraftEditor] VFS text write failed:", result.error);
      }
    } else {
      console.log(
        "[useDraftEditor] VFS text commit successful:",
        result.file,
        `"${originalText}" -> "${draftText}"`
      );
    }

    // Clear text draft state
    if (textDraftRef.current?.revision === revision) {
      textDraftRef.current = null;
      setTextDraftSnapshot(null);
    }
    textSourceLocationRef.current = undefined;
    setIsPending(false);
  }, [writer, onError]);

  const flushClassPreview = useCallback(() => {
    classPreviewRafRef.current = null;
    const pending = classPreviewRef.current;
    if (!pending) return;
    broadcastToIframes({
      type: "novum:update-classes",
      payload: pending,
    });
  }, []);

  const flushTextPreview = useCallback(() => {
    textPreviewRafRef.current = null;
    const pending = textPreviewRef.current;
    if (!pending) return;
    broadcastToIframes({
      type: "novum:update-text",
      payload: pending,
    });
  }, []);

  /**
   * Update classes with optimistic UI.
   * - Immediately updates DOM via postMessage
   * - Schedules VFS write after debounce period
   * - Timer resets on each call (standard debounce)
   */
  const updateClasses = useCallback(
    (
      selector: string,
      originalClassName: string,
      newClassName: string,
      sourceLocation?: SourceLocation,
      selectionId?: string
    ) => {
      // Clear any existing timer (debounce reset)
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }

      // Determine the true original className
      // If we already have a draft for this selector, keep the original from there
      const existingDraft = draftRef.current;
      const trueOriginal =
        existingDraft &&
        ((selectionId && existingDraft.selectionId === selectionId) ||
          (!selectionId && existingDraft.selector === selector))
          ? existingDraft.originalClassName
          : originalClassName;

      classRevisionRef.current += 1;
      const revision = classRevisionRef.current;

      // Update draft state
      const newDraft: DraftState = {
        selectionId,
        selector,
        originalClassName: trueOriginal,
        draftClassName: newClassName,
        revision,
      };
      draftRef.current = newDraft;
      setDraftSnapshot(newDraft);

      // Store source location for commit
      classSourceLocationRef.current = sourceLocation;

      // RAF-coalesced optimistic update for smooth paint under high-frequency controls.
      classPreviewRef.current = { selector, newClassName };
      if (classPreviewRafRef.current === null) {
        classPreviewRafRef.current = requestAnimationFrame(flushClassPreview);
      }

      // Schedule VFS write after debounce period
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        commitDraft();
      }, debounceMs);
    },
    [debounceMs, commitDraft, flushClassPreview]
  );

  /**
   * Update text with optimistic UI.
   * - Immediately updates DOM via postMessage
   * - Schedules VFS write after debounce period
   * - Timer resets on each call (standard debounce)
   */
  const updateText = useCallback(
    (
      selector: string,
      originalText: string,
      newText: string,
      sourceLocation?: SourceLocation,
      selectionId?: string
    ) => {
      // Clear any existing text timer (debounce reset)
      if (textTimerRef.current) {
        clearTimeout(textTimerRef.current);
        textTimerRef.current = null;
      }

      // Preserve true original if already drafting this element
      const existingDraft = textDraftRef.current;
      const trueOriginal =
        existingDraft &&
        ((selectionId && existingDraft.selectionId === selectionId) ||
          (!selectionId && existingDraft.selector === selector))
          ? existingDraft.originalText
          : originalText;

      textRevisionRef.current += 1;
      const revision = textRevisionRef.current;

      // Update text draft state
      const newDraft: TextDraftState = {
        selectionId,
        selector,
        originalText: trueOriginal,
        draftText: newText,
        revision,
      };
      textDraftRef.current = newDraft;
      setTextDraftSnapshot(newDraft);

      // Store source location for commit
      textSourceLocationRef.current = sourceLocation;

      // RAF-coalesced optimistic text update for smooth paint.
      textPreviewRef.current = { selector, newText };
      if (textPreviewRafRef.current === null) {
        textPreviewRafRef.current = requestAnimationFrame(flushTextPreview);
      }

      // Schedule VFS write after debounce period
      textTimerRef.current = setTimeout(() => {
        textTimerRef.current = null;
        commitTextDraft();
      }, debounceMs);
    },
    [debounceMs, commitTextDraft, flushTextPreview]
  );

  /**
   * Flush any pending changes immediately (skip debounce).
   * Call this on: selection change, inspection mode off.
   */
  const flush = useCallback(async () => {
    await commitDraft();
    await commitTextDraft();
  }, [commitDraft, commitTextDraft]);

  /**
   * Cancel any pending changes and rollback DOM.
   */
  const cancel = useCallback(() => {
    // Clear any pending class timer
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (classPreviewRafRef.current !== null) {
      cancelAnimationFrame(classPreviewRafRef.current);
      classPreviewRafRef.current = null;
    }
    classPreviewRef.current = null;

    // Clear any pending text timer
    if (textTimerRef.current) {
      clearTimeout(textTimerRef.current);
      textTimerRef.current = null;
    }
    if (textPreviewRafRef.current !== null) {
      cancelAnimationFrame(textPreviewRafRef.current);
      textPreviewRafRef.current = null;
    }
    textPreviewRef.current = null;

    const draft = draftRef.current;
    if (draft) {
      // Rollback DOM to original class
      broadcastToIframes({
        type: "novum:rollback-classes",
        payload: {
          selector: draft.selector,
          originalClassName: draft.originalClassName,
        },
      });
    }

    const textDraft = textDraftRef.current;
    if (textDraft) {
      // Rollback DOM to original text
      broadcastToIframes({
        type: "novum:rollback-text",
        payload: {
          selector: textDraft.selector,
          originalText: textDraft.originalText,
        },
      });
    }

    draftRef.current = null;
    setDraftSnapshot(null);
    textDraftRef.current = null;
    setTextDraftSnapshot(null);
    classSourceLocationRef.current = undefined;
    textSourceLocationRef.current = undefined;
    setIsPending(false);
  }, []);

  // Commit on unmount (best-effort, synchronous)
  // Note: Uses writerRef to avoid dependency on writer which changes every render
  useEffect(() => {
    return () => {
      // Clear any pending class timer
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      if (classPreviewRafRef.current !== null) {
        cancelAnimationFrame(classPreviewRafRef.current);
        classPreviewRafRef.current = null;
      }
      classPreviewRef.current = null;

      // Clear any pending text timer
      if (textTimerRef.current) {
        clearTimeout(textTimerRef.current);
        textTimerRef.current = null;
      }
      if (textPreviewRafRef.current !== null) {
        cancelAnimationFrame(textPreviewRafRef.current);
        textPreviewRafRef.current = null;
      }
      textPreviewRef.current = null;

      // If there are pending class changes, try to commit them
      if (draftRef.current) {
        const draft = draftRef.current;
        if (draft.originalClassName !== draft.draftClassName) {
          // Best-effort commit - if it fails, changes are lost (acceptable on unmount)
          const result = writerRef.current.updateElementClasses(
            draft.selector,
            draft.originalClassName,
            draft.draftClassName,
            classSourceLocationRef.current
          );
          if (result.success) {
            console.log("[useDraftEditor] Committed classes on unmount:", result.file);
          } else {
            console.warn("[useDraftEditor] Could not commit classes on unmount:", result.error);
          }
        }
      }

      // If there are pending text changes, try to commit them
      if (textDraftRef.current) {
        const textDraft = textDraftRef.current;
        if (textDraft.originalText !== textDraft.draftText) {
          // Best-effort commit - if it fails, changes are lost (acceptable on unmount)
          const result = writerRef.current.updateElementText(
            textDraft.originalText,
            textDraft.draftText,
            "",
            textSourceLocationRef.current
          );
          if (result.success) {
            console.log("[useDraftEditor] Committed text on unmount:", result.file);
          } else {
            console.warn("[useDraftEditor] Could not commit text on unmount:", result.error);
          }
        }
      }
    };
  }, []);

  return {
    draft: draftSnapshot,
    textDraft: textDraftSnapshot,
    isPending,
    hasPendingChanges,
    updateClasses,
    updateText,
    flush,
    cancel,
  };
}
