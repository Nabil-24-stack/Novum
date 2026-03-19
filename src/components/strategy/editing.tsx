"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { Check, GripHorizontal, Plus, Trash2, X } from "lucide-react";
import { useCanvasScale } from "@/components/canvas/InfiniteCanvas";

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

export function useDragHandle(params: {
  x: number;
  y: number;
  onMove?: (x: number, y: number) => void;
}) {
  const { x, y, onMove } = params;
  const canvasScale = useCanvasScale();
  const [isDragging, setIsDragging] = useState(false);

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (!onMove) return;
      event.preventDefault();
      event.stopPropagation();
      event.currentTarget.setPointerCapture(event.pointerId);
      setIsDragging(true);
    },
    [onMove]
  );

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (!isDragging || !onMove) return;
      onMove(x + event.movementX / canvasScale, y + event.movementY / canvasScale);
    },
    [canvasScale, isDragging, onMove, x, y]
  );

  const handlePointerUp = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setIsDragging(false);
  }, []);

  return {
    isDragging,
    dragHandleProps: {
      onPointerDown: handlePointerDown,
      onPointerMove: handlePointerMove,
      onPointerUp: handlePointerUp,
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

export function CardDragHandle(props: {
  isDragging: boolean;
  canDrag: boolean;
  dragHandleProps: {
    onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
    onPointerMove: (event: ReactPointerEvent<HTMLElement>) => void;
    onPointerUp: (event: ReactPointerEvent<HTMLElement>) => void;
  };
  label?: string;
}) {
  const { isDragging, canDrag, dragHandleProps, label = "Drag card" } = props;

  return (
    <div
      className={`inline-flex items-center gap-1.5 rounded-full border border-neutral-200 bg-white px-2.5 py-1 text-[11px] font-medium text-neutral-500 ${
        canDrag ? (isDragging ? "cursor-grabbing" : "cursor-grab") : "cursor-default opacity-60"
      }`}
      {...(canDrag ? dragHandleProps : {})}
    >
      <GripHorizontal className="h-3.5 w-3.5" />
      {label}
    </div>
  );
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
      Click anywhere in this card to edit it inline.
    </p>
  );
}
