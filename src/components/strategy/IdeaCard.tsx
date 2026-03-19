"use client";

import { useEffect, useRef } from "react";
import { Check } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { IdeaData } from "@/hooks/useStrategyStore";
import {
  ARTIFACT_EDITOR_FIELDS_CLASSNAME,
  ARTIFACT_IDLE_CARD_CLASSNAME,
  ARTIFACT_SELECTED_CARD_CLASSNAME,
  EditModeActions,
  ReadOnlyEditHint,
  handleEditorKeyDown,
  useArtifactCardInteraction,
  useEditableCard,
  useFocusWhenEditing,
} from "@/components/strategy/editing";
import { normalizeIdeaData } from "@/lib/strategy/artifact-edit-sync";

export const IDEA_CARD_WIDTH = 300;

const STICKY_COLORS = [
  { bg: "bg-yellow-100", border: "border-yellow-300" },
  { bg: "bg-pink-100", border: "border-pink-300" },
  { bg: "bg-sky-100", border: "border-sky-300" },
  { bg: "bg-lime-100", border: "border-lime-300" },
  { bg: "bg-violet-100", border: "border-violet-300" },
  { bg: "bg-orange-100", border: "border-orange-300" },
  { bg: "bg-teal-100", border: "border-teal-300" },
  { bg: "bg-rose-100", border: "border-rose-300" },
] as const;

interface IdeaCardProps {
  idea: Partial<IdeaData>;
  x: number;
  y: number;
  onMove?: (x: number, y: number) => void;
  onHeightMeasured?: (height: number) => void;
  index: number;
  isActive?: boolean;
  onSelectArtifact?: () => void;
  isSelectedIdea?: boolean;
  onToggleSelectedIdea?: () => void;
  onCommit?: (idea: IdeaData) => void;
}

export function IdeaCard({
  idea,
  x,
  y,
  onMove,
  onHeightMeasured,
  index,
  isActive = false,
  onSelectArtifact,
  isSelectedIdea = false,
  onToggleSelectedIdea,
  onCommit,
}: IdeaCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const lastHeightRef = useRef(0);
  const onHeightMeasuredRef = useRef(onHeightMeasured);
  const color = STICKY_COLORS[index % STICKY_COLORS.length];
  const {
    canEdit,
    isEditing,
    draft,
    setDraft,
    startEditing,
    cancelEditing,
    saveEditing,
  } = useEditableCard({
    value: normalizeIdeaData({
      id: idea.id ?? `idea-${index}`,
      title: idea.title ?? "",
      description: idea.description ?? "",
      illustration: idea.illustration ?? "",
    }),
    onCommit,
    normalize: normalizeIdeaData,
  });
  const { isDragging, cardInteractionProps } = useArtifactCardInteraction({
    x,
    y,
    isEditing,
    onMove,
    onSelect: onSelectArtifact,
    onEdit: startEditing,
  });
  const firstInputRef = useFocusWhenEditing<HTMLInputElement>(isEditing);

  useEffect(() => {
    onHeightMeasuredRef.current = onHeightMeasured;
  }, [onHeightMeasured]);

  useEffect(() => {
    const element = cardRef.current;
    if (!element) return;

    const observer = new ResizeObserver(() => {
      const height = element.offsetHeight;
      if (height > 0 && Math.abs(height - lastHeightRef.current) > 1) {
        lastHeightRef.current = height;
        onHeightMeasuredRef.current?.(height);
      }
    });

    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={cardRef}
      className={`absolute ${isEditing ? "" : "select-none"}`}
      style={{
        left: x,
        top: y,
        width: IDEA_CARD_WIDTH,
        touchAction: isEditing ? undefined : "none",
      }}
      {...cardInteractionProps}
    >
      <div
        className={`overflow-hidden rounded-xl border shadow-md ${
          color.bg
        } ${color.border} ${ARTIFACT_IDLE_CARD_CLASSNAME} ${
          isActive || isSelectedIdea ? ARTIFACT_SELECTED_CARD_CLASSNAME : "hover:shadow-lg"
        } ${!isEditing ? (isDragging ? "cursor-grabbing" : "cursor-grab") : ""}`}
        style={{ position: "relative" }}
      >
        {draft.illustration && (
          <div
            className="flex items-center justify-center bg-black/5 p-3 [&>svg]:max-h-[120px] [&>svg]:w-auto"
            dangerouslySetInnerHTML={{ __html: draft.illustration }}
          />
        )}

        <div className="p-5">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-black/10 text-sm font-bold text-black/60">
                {index + 1}
              </div>
              {onToggleSelectedIdea && (
                <button
                  type="button"
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={(event) => {
                    event.stopPropagation();
                    onToggleSelectedIdea();
                  }}
                  className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                    isSelectedIdea
                      ? "bg-blue-500 text-white"
                      : "bg-white/70 text-neutral-600 hover:bg-white"
                  }`}
                >
                  <Check className="h-3 w-3" />
                  {isSelectedIdea ? "Selected" : "Set selected"}
                </button>
              )}
            </div>
          </div>

          {isEditing ? (
            <div className={`space-y-3 ${ARTIFACT_EDITOR_FIELDS_CLASSNAME}`}>
              <Input
                ref={firstInputRef}
                value={draft.title}
                placeholder="Idea title"
                onChange={(event) =>
                  setDraft((current) => ({ ...current, title: event.target.value }))
                }
                onKeyDown={(event) =>
                  handleEditorKeyDown(event, {
                    onSave: saveEditing,
                    onCancel: cancelEditing,
                  })
                }
                className="border-black/10 bg-white/90 text-sm"
              />

              <Textarea
                value={draft.description}
                placeholder="What makes this direction strong?"
                onChange={(event) =>
                  setDraft((current) => ({ ...current, description: event.target.value }))
                }
                onKeyDown={(event) =>
                  handleEditorKeyDown(event, {
                    onSave: saveEditing,
                    onCancel: cancelEditing,
                  })
                }
                className="min-h-[120px] border-black/10 bg-white/90 text-sm"
              />

              {draft.illustration && (
                <p className="text-[11px] text-black/50">
                  Illustration stays read-only in v1.
                </p>
              )}

              <EditModeActions onSave={saveEditing} onCancel={cancelEditing} />
            </div>
          ) : (
            <div>
              {draft.title && (
                <h3 className="pr-6 text-base font-bold leading-tight text-neutral-900">
                  {draft.title}
                </h3>
              )}

              {draft.description && (
                <p className="mt-2 text-sm leading-relaxed text-neutral-700">
                  {draft.description}
                </p>
              )}

              {canEdit && <ReadOnlyEditHint />}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
