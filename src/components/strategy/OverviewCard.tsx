"use client";

import { FileText } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import type { ManifestoData } from "@/hooks/useStrategyStore";
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
import { normalizeManifestoData } from "@/lib/strategy/artifact-edit-sync";

interface OverviewCardProps {
  manifestoData: Partial<ManifestoData>;
  visibleSections?: number;
  x: number;
  y: number;
  onMove?: (x: number, y: number) => void;
  onCommit?: (manifestoData: ManifestoData) => void;
  isSelected?: boolean;
  onSelect?: () => void;
  onSingleClickConfirmed?: () => void;
}

export function OverviewCard({
  manifestoData,
  visibleSections,
  x,
  y,
  onMove,
  onCommit,
  isSelected = false,
  onSelect,
  onSingleClickConfirmed,
}: OverviewCardProps) {
  const {
    canEdit,
    isEditing,
    draft,
    setDraft,
    startEditing,
    cancelEditing,
    saveEditing,
  } = useEditableCard({
    value: normalizeManifestoData({
      title: manifestoData.title ?? "",
      problemStatement: manifestoData.problemStatement ?? "",
      targetUser: manifestoData.targetUser ?? "",
      environmentContext: manifestoData.environmentContext ?? "",
      painPoints: manifestoData.painPoints ?? [],
      jtbd: manifestoData.jtbd ?? [],
      hmw: manifestoData.hmw ?? [],
    } as ManifestoData),
    onCommit,
    normalize: normalizeManifestoData,
  });
  const { isDragging, cardInteractionProps } = useArtifactCardInteraction({
    x,
    y,
    isEditing,
    onMove,
    onSelect,
    onSingleClickConfirmed,
    onEdit: startEditing,
  });
  const firstInputRef = useFocusWhenEditing<HTMLTextAreaElement>(isEditing);

  const hasProblem = Boolean(draft.problemStatement.trim());
  const hasTargetUsers = Boolean(draft.targetUser.trim());
  const showProblemSection = visibleSections === undefined || visibleSections >= 1;
  const showTargetSection = visibleSections === undefined || visibleSections >= 2;

  return (
    <div
      className={`absolute ${isEditing ? "" : "select-none"}`}
      style={{
        left: x,
        top: y,
        width: 520,
        touchAction: isEditing ? undefined : "none",
      }}
      {...cardInteractionProps}
    >
      <div
        className={`rounded-2xl border border-neutral-200/60 bg-white/90 p-8 shadow-lg backdrop-blur-sm ${ARTIFACT_IDLE_CARD_CLASSNAME} ${
          isSelected ? ARTIFACT_SELECTED_CARD_CLASSNAME : ""
        } ${!isEditing ? (isDragging ? "cursor-grabbing" : "cursor-grab") : ""}`}
      >
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-50">
            <FileText className="h-4 w-4 text-sky-600" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-neutral-900">Overview</h2>
            <p className="text-sm text-neutral-500">
              The core problem and who it affects
            </p>
          </div>
        </div>

        {isEditing ? (
          <div className={`space-y-4 ${ARTIFACT_EDITOR_FIELDS_CLASSNAME}`}>
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
                Core Problem
              </p>
              <Textarea
                ref={firstInputRef}
                value={draft.problemStatement}
                placeholder="Describe the core problem"
                onChange={(event) =>
                  setDraft((current) => ({ ...current, problemStatement: event.target.value }))
                }
                onKeyDown={(event) =>
                  handleEditorKeyDown(event, {
                    onSave: saveEditing,
                    onCancel: cancelEditing,
                  })
                }
                className="min-h-[120px] text-sm"
              />
            </div>

            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
                Target Users
              </p>
              <Textarea
                value={draft.targetUser}
                placeholder="Who experiences this problem"
                onChange={(event) =>
                  setDraft((current) => ({ ...current, targetUser: event.target.value }))
                }
                onKeyDown={(event) =>
                  handleEditorKeyDown(event, {
                    onSave: saveEditing,
                    onCancel: cancelEditing,
                  })
                }
                className="min-h-[96px] text-sm"
              />
            </div>

            <EditModeActions onSave={saveEditing} onCancel={cancelEditing} />
          </div>
        ) : (
          <div>
            <div className="rounded-2xl border border-neutral-200/70 bg-neutral-50/80 p-4">
              <h3 className="mb-2 text-sm font-semibold uppercase tracking-wider text-neutral-500">
                Core Problem
              </h3>
              {showProblemSection ? (
                <p className="text-base leading-relaxed text-neutral-700">
                  {hasProblem ? draft.problemStatement : "Problem framing is still being articulated."}
                </p>
              ) : (
                <div className="space-y-2">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-5/6" />
                  <Skeleton className="h-4 w-3/4" />
                </div>
              )}
            </div>

            <div className="mt-4 rounded-2xl border border-neutral-200/70 bg-neutral-50/80 p-4">
              <h3 className="mb-2 text-sm font-semibold uppercase tracking-wider text-neutral-500">
                Target Users
              </h3>
              {showTargetSection ? (
                <p className="text-base leading-relaxed text-neutral-700">
                  {hasTargetUsers ? draft.targetUser : "Target users are still being clarified."}
                </p>
              ) : (
                <div className="space-y-2">
                  <Skeleton className="h-4 w-2/3" />
                  <Skeleton className="h-4 w-1/2" />
                </div>
              )}
            </div>

            {canEdit && <ReadOnlyEditHint />}
          </div>
        )}
      </div>
    </div>
  );
}
