"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { Check, Plus, Trash2, X } from "lucide-react";
import { useCanvasScale } from "@/components/canvas/InfiniteCanvas";

export const ARTIFACT_EDITOR_FIELDS_CLASSNAME =
  "[&_input]:border-neutral-300 [&_input]:bg-white [&_input]:text-neutral-900 [&_input]:placeholder:text-neutral-400 " +
  "[&_textarea]:border-neutral-300 [&_textarea]:bg-white [&_textarea]:text-neutral-900 [&_textarea]:placeholder:text-neutral-400 " +
  "[&_select]:border-neutral-300 [&_select]:bg-white [&_select]:text-neutral-900";
export const ARTIFACT_SELECTED_CARD_CLASSNAME = "ring-2 ring-blue-500 border-blue-300 shadow-xl";
export const ARTIFACT_IDLE_CARD_CLASSNAME = "transition-shadow";

const DRAG_THRESHOLD_PX = 5;
const SINGLE_CLICK_CONFIRM_DELAY_MS = 220;

function isInteractiveTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement
    ? Boolean(
        target.closest(
          "button, input, textarea, select, a, [role='button'], [data-artifact-no-drag='true']"
        )
      )
    : false;
}

export function cloneEditableValue<T>(value: T): T {
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }

  return JSON.parse(JSON.stringify(value)) as T;
}

export function useEditableCard<T>(params: {
  value: T;
  onCommit?: (value: T) => void;
  normalize?: (value: T) => T;
}) {
  const { value, onCommit, normalize } = params;
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState<T>(() => cloneEditableValue(value));
  const liveValue = useMemo(() => cloneEditableValue(value), [value]);

  const startEditing = useCallback(() => {
    if (!onCommit) return;
    setDraft(cloneEditableValue(liveValue));
    setIsEditing(true);
  }, [liveValue, onCommit]);

  const cancelEditing = useCallback(() => {
    setIsEditing(false);
  }, []);

  const saveEditing = useCallback(() => {
    if (!onCommit) return;
    const nextValue = normalize ? normalize(draft) : draft;
    onCommit(nextValue);
    setIsEditing(false);
  }, [draft, normalize, onCommit]);

  return {
    canEdit: Boolean(onCommit),
    isEditing,
    draft: isEditing ? draft : liveValue,
    setDraft,
    startEditing,
    cancelEditing,
    saveEditing,
  };
}

export function useArtifactCardInteraction(params: {
  x: number;
  y: number;
  isEditing: boolean;
  onMove?: (x: number, y: number) => void;
  onSelect?: () => void;
  onSingleClickConfirmed?: () => void;
  onEdit?: () => void;
}) {
  const { x, y, isEditing, onMove, onSelect, onSingleClickConfirmed, onEdit } = params;
  const canvasScale = useCanvasScale();
  const [isDragging, setIsDragging] = useState(false);
  const gestureRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    dragging: boolean;
  } | null>(null);
  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressNextClickRef = useRef(false);

  const cancelPendingSingleClick = useCallback(() => {
    if (!clickTimerRef.current) return;
    clearTimeout(clickTimerRef.current);
    clickTimerRef.current = null;
  }, []);

  useEffect(() => cancelPendingSingleClick, [cancelPendingSingleClick]);

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (isEditing || event.button !== 0 || isInteractiveTarget(event.target)) return;
      event.stopPropagation();
      suppressNextClickRef.current = false;
      onSelect?.();
      gestureRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        dragging: false,
      };
      if (onMove) {
        event.currentTarget.setPointerCapture(event.pointerId);
      }
    },
    [isEditing, onMove, onSelect]
  );

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const gesture = gestureRef.current;
      if (!gesture || gesture.pointerId !== event.pointerId || !onMove) return;
      const deltaX = event.clientX - gesture.startX;
      const deltaY = event.clientY - gesture.startY;
      if (!gesture.dragging && Math.hypot(deltaX, deltaY) < DRAG_THRESHOLD_PX) return;
      if (!gesture.dragging) {
        gesture.dragging = true;
        setIsDragging(true);
        suppressNextClickRef.current = true;
        cancelPendingSingleClick();
      }
      event.preventDefault();
      event.stopPropagation();
      onMove(x + event.movementX / canvasScale, y + event.movementY / canvasScale);
    },
    [cancelPendingSingleClick, canvasScale, onMove, x, y]
  );

  const handlePointerUp = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    suppressNextClickRef.current = gesture.dragging;
    gestureRef.current = null;
    setIsDragging(false);
  }, []);

  const handlePointerCancel = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    cancelPendingSingleClick();
    suppressNextClickRef.current = false;
    gestureRef.current = null;
    setIsDragging(false);
  }, [cancelPendingSingleClick]);

  const handleClick = useCallback((event: ReactMouseEvent<HTMLElement>) => {
    if (isEditing || isInteractiveTarget(event.target)) return;
    event.stopPropagation();

    if (suppressNextClickRef.current) {
      suppressNextClickRef.current = false;
      return;
    }

    cancelPendingSingleClick();
    if (event.detail !== 1 || !onSingleClickConfirmed) return;

    clickTimerRef.current = setTimeout(() => {
      clickTimerRef.current = null;
      onSingleClickConfirmed();
    }, SINGLE_CLICK_CONFIRM_DELAY_MS);
  }, [cancelPendingSingleClick, isEditing, onSingleClickConfirmed]);

  const handleDoubleClick = useCallback((event: ReactMouseEvent<HTMLElement>) => {
    if (isEditing || !onEdit || isInteractiveTarget(event.target)) return;
    event.stopPropagation();
    cancelPendingSingleClick();
    onSelect?.();
    onEdit();
  }, [cancelPendingSingleClick, isEditing, onEdit, onSelect]);

  return {
    isDragging,
    cardInteractionProps: {
      onPointerDown: handlePointerDown,
      onPointerMove: handlePointerMove,
      onPointerUp: handlePointerUp,
      onPointerCancel: handlePointerCancel,
      onClick: handleClick,
      onDoubleClick: handleDoubleClick,
    },
  };
}

export function useFocusWhenEditing<T extends HTMLInputElement | HTMLTextAreaElement>(isEditing: boolean) {
  const ref = useRef<T>(null);

  useEffect(() => {
    if (!isEditing) return;

    requestAnimationFrame(() => {
      ref.current?.focus();
      ref.current?.select();
    });
  }, [isEditing]);

  return ref;
}

export function handleEditorKeyDown(
  event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>,
  actions: {
    onSave: () => void;
    onCancel: () => void;
  }
) {
  if (event.key === "Escape") {
    event.preventDefault();
    event.stopPropagation();
    actions.onCancel();
    return;
  }

  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    event.stopPropagation();
    actions.onSave();
  }
}

export function EditModeActions(props: {
  onSave: () => void;
  onCancel: () => void;
  saveLabel?: string;
}) {
  const { onSave, onCancel, saveLabel = "Save" } = props;

  return (
    <div className="flex items-center justify-between gap-3 border-t border-neutral-200/70 pt-4">
      <p className="text-[11px] text-neutral-400">
        Press Enter to save. Shift+Enter adds a new line. Esc cancels.
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onCancel();
          }}
          className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 px-3 py-1.5 text-xs font-medium text-neutral-600 transition-colors hover:bg-neutral-50"
        >
          <X className="h-3.5 w-3.5" />
          Cancel
        </button>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onSave();
          }}
          className="inline-flex items-center gap-1.5 rounded-lg bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-neutral-800"
        >
          <Check className="h-3.5 w-3.5" />
          {saveLabel}
        </button>
      </div>
    </div>
  );
}

export function AddListItemButton(props: {
  onClick: () => void;
  label: string;
}) {
  const { onClick, label } = props;

  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-600 transition-colors hover:border-neutral-400 hover:bg-neutral-50"
    >
      <Plus className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}

export function RemoveListItemButton(props: {
  onClick: () => void;
  label?: string;
}) {
  const { onClick, label = "Remove" } = props;

  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      className="inline-flex items-center gap-1.5 rounded-lg border border-transparent px-2 py-1 text-xs font-medium text-neutral-400 transition-colors hover:bg-red-50 hover:text-red-600"
    >
      <Trash2 className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}

export function ReadOnlyEditHint() {
  return (
    <p className="mt-4 text-[11px] text-neutral-400">
      Single-click to select, drag to move, or double-click to edit.
    </p>
  );
}
