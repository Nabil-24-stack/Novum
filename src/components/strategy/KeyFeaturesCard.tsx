"use client";

import { useMemo } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import type { KeyFeaturesData } from "@/hooks/useStrategyStore";
import {
  ARTIFACT_EDITOR_FIELDS_CLASSNAME,
  ARTIFACT_IDLE_CARD_CLASSNAME,
  ARTIFACT_SELECTED_CARD_CLASSNAME,
  AddListItemButton,
  EditModeActions,
  ReadOnlyEditHint,
  RemoveListItemButton,
  handleEditorKeyDown,
  useArtifactCardInteraction,
  useEditableCard,
  useFocusWhenEditing,
} from "@/components/strategy/editing";
import { normalizeKeyFeaturesData } from "@/lib/strategy/artifact-edit-sync";

export const KEY_FEATURES_CARD_WIDTH = 400;

interface KeyFeaturesCardProps {
  data: Partial<KeyFeaturesData>;
  x: number;
  y: number;
  onMove?: (x: number, y: number) => void;
  onCommit?: (data: KeyFeaturesData) => void;
  isSelected?: boolean;
  onSelect?: () => void;
  onSingleClickConfirmed?: () => void;
}

export function KeyFeaturesCard({
  data,
  x,
  y,
  onMove,
  onCommit,
  isSelected = false,
  onSelect,
  onSingleClickConfirmed,
}: KeyFeaturesCardProps) {
  const {
    canEdit,
    isEditing,
    draft,
    setDraft,
    startEditing,
    cancelEditing,
    saveEditing,
  } = useEditableCard({
    value: normalizeKeyFeaturesData({
      ideaTitle: data.ideaTitle ?? "",
      features: data.features ?? [],
    }),
    onCommit,
    normalize: normalizeKeyFeaturesData,
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
  const firstInputRef = useFocusWhenEditing<HTMLInputElement>(isEditing);

  const featuresByPriority = useMemo(() => {
    return {
      high: draft.features.filter((feature) => feature.priority === "high"),
      medium: draft.features.filter((feature) => feature.priority === "medium"),
      low: draft.features.filter((feature) => feature.priority === "low"),
    };
  }, [draft.features]);

  return (
    <div
      className={`absolute ${isEditing ? "" : "select-none"}`}
      style={{
        left: x,
        top: y,
        width: KEY_FEATURES_CARD_WIDTH,
        touchAction: isEditing ? undefined : "none",
      }}
      {...cardInteractionProps}
    >
      <div
        className={`overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-md ${ARTIFACT_IDLE_CARD_CLASSNAME} ${
          isSelected ? ARTIFACT_SELECTED_CARD_CLASSNAME : ""
        } ${!isEditing ? (isDragging ? "cursor-grabbing" : "cursor-grab") : ""}`}
      >
        <div className="border-b border-neutral-100 px-5 py-3">
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
              Key Features
            </h3>
            {draft.ideaTitle && (
              <p className="mt-1 text-sm font-bold leading-tight text-neutral-900">
                {draft.ideaTitle}
              </p>
            )}
          </div>
        </div>

        {isEditing ? (
          <div className={`space-y-4 p-5 ${ARTIFACT_EDITOR_FIELDS_CLASSNAME}`}>
            <div className="rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs text-neutral-500">
              Selected solution label: {draft.ideaTitle || "Not set"}
            </div>

            {draft.features.map((feature, index) => (
              <div key={index} className="space-y-2 rounded-xl border border-neutral-200/80 p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
                    Feature {index + 1}
                  </p>
                  <RemoveListItemButton
                    onClick={() =>
                      setDraft((current) => ({
                        ...current,
                        features: current.features.filter((_, featureIndex) => featureIndex !== index),
                      }))
                    }
                  />
                </div>

                <Input
                  ref={index === 0 ? firstInputRef : undefined}
                  value={feature.name}
                  placeholder="Feature name"
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      features: current.features.map((item, featureIndex) =>
                        featureIndex === index
                          ? { ...item, name: event.target.value }
                          : item
                      ),
                    }))
                  }
                  onKeyDown={(event) =>
                    handleEditorKeyDown(event, {
                      onSave: saveEditing,
                      onCancel: cancelEditing,
                    })
                  }
                  className="text-sm"
                />

                <Textarea
                  value={feature.description}
                  placeholder="Describe why this feature matters."
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      features: current.features.map((item, featureIndex) =>
                        featureIndex === index
                          ? { ...item, description: event.target.value }
                          : item
                      ),
                    }))
                  }
                  onKeyDown={(event) =>
                    handleEditorKeyDown(event, {
                      onSave: saveEditing,
                      onCancel: cancelEditing,
                    })
                  }
                  className="min-h-[88px] text-sm"
                />

                <label className="space-y-1 text-xs font-medium text-neutral-500">
                  Priority
                  <select
                    value={feature.priority}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        features: current.features.map((item, featureIndex) =>
                          featureIndex === index
                            ? {
                                ...item,
                                priority: event.target.value as KeyFeaturesData["features"][number]["priority"],
                              }
                            : item
                        ),
                      }))
                    }
                    className="h-10 w-full rounded-lg border border-neutral-200 bg-white px-3 text-sm text-neutral-700 outline-none focus:border-neutral-400"
                  >
                    <option value="high">High priority</option>
                    <option value="medium">Medium priority</option>
                    <option value="low">Low priority</option>
                  </select>
                </label>
              </div>
            ))}

            <AddListItemButton
              label="Add feature"
              onClick={() =>
                setDraft((current) => ({
                  ...current,
                  features: [
                    ...current.features,
                    { name: "", description: "", priority: "medium" },
                  ],
                }))
              }
            />

            <EditModeActions onSave={saveEditing} onCancel={cancelEditing} />
          </div>
        ) : (
          <div
            className={canEdit ? "p-5" : "p-5"}
          >
            <div className="space-y-4">
              {(["high", "medium", "low"] as const).map((priority) => {
                const group = featuresByPriority[priority];
                if (group.length === 0) return null;

                const config = {
                  high: {
                    label: "High Priority",
                    text: "text-red-700",
                    dot: "bg-red-400",
                  },
                  medium: {
                    label: "Medium Priority",
                    text: "text-amber-700",
                    dot: "bg-amber-400",
                  },
                  low: {
                    label: "Low Priority",
                    text: "text-slate-600",
                    dot: "bg-slate-400",
                  },
                }[priority];

                return (
                  <div key={priority}>
                    <div className="mb-2 flex items-center gap-2">
                      <span className={`h-2 w-2 rounded-full ${config.dot}`} />
                      <span className={`text-xs font-semibold uppercase tracking-wider ${config.text}`}>
                        {config.label}
                      </span>
                    </div>
                    <div className="ml-4 space-y-2">
                      {group.map((feature, index) => (
                        <div key={`${priority}-${index}`} className="min-w-0">
                          <p className="text-sm font-semibold leading-tight text-neutral-900">
                            {feature.name}
                          </p>
                          {feature.description && (
                            <p className="mt-0.5 text-sm leading-relaxed text-neutral-600">
                              {feature.description}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>

            {canEdit && <ReadOnlyEditHint />}
          </div>
        )}
      </div>
    </div>
  );
}
