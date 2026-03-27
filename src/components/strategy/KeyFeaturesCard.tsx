"use client";

import { useMemo } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import type { KeyFeatureData, KeyFeaturesData, ManifestoData } from "@/hooks/useStrategyStore";
import type { TraceableTextItem } from "@/lib/strategy/traceable";
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
import {
  getResolvedFeaturePainPointIds,
  isFeatureExportableForManifesto,
} from "@/lib/strategy/feature-traceability";

export const KEY_FEATURES_CARD_WIDTH = 420;

interface KeyFeaturesCardProps {
  data: Partial<KeyFeaturesData>;
  manifestoData?: ManifestoData | null;
  jtbdOptions: TraceableTextItem[];
  painPointOptions: { id: string; label: string; source: string }[];
  x: number;
  y: number;
  onMove?: (x: number, y: number) => void;
  onCommit?: (data: KeyFeaturesData) => void;
  isSelected?: boolean;
  onSelect?: () => void;
  onSingleClickConfirmed?: () => void;
}

function getFeatureJtbdIds(feature: Partial<KeyFeatureData> | null | undefined): string[] {
  return Array.isArray(feature?.jtbdIds)
    ? feature.jtbdIds.filter((id): id is string => typeof id === "string" && id.trim().length > 0)
    : [];
}

function getFeaturePainPointIds(feature: Partial<KeyFeatureData> | null | undefined): string[] {
  return Array.isArray(feature?.painPointIds)
    ? feature.painPointIds.filter((id): id is string => typeof id === "string" && id.trim().length > 0)
    : [];
}

function getFeatureKind(feature: Partial<KeyFeatureData> | null | undefined): KeyFeatureData["kind"] {
  return feature?.kind === "supporting" ? "supporting" : "core";
}

function getFeatureParkingMessage(
  feature: Partial<KeyFeatureData> | null | undefined,
  manifestoData: ManifestoData | null | undefined,
  keyFeaturesData: KeyFeaturesData | null | undefined,
): string | null {
  const kind = getFeatureKind(feature);
  if (kind === "supporting") {
    return feature?.supportingJustification?.trim()
      ? null
      : "This supporting item is parked until you explain why it must ship without discovery linkage.";
  }
  const hasJtbd = getFeatureJtbdIds(feature).length > 0;
  const hasPainPoints = getResolvedFeaturePainPointIds(feature, manifestoData).length > 0;
  const isExportable = isFeatureExportableForManifesto(feature, manifestoData, keyFeaturesData);
  if (isExportable) return null;
  if (!hasJtbd && !hasPainPoints) {
    return "This core feature is parked until it links to at least one JTBD and one pain point.";
  }
  if (!hasJtbd) {
    return "This core feature is parked until it links to at least one JTBD.";
  }
  return "This core feature is parked until it links to at least one pain point.";
}

export function KeyFeaturesCard({
  data,
  manifestoData = null,
  jtbdOptions,
  painPointOptions,
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
    }, manifestoData),
    onCommit,
    normalize: (value) => normalizeKeyFeaturesData(value, manifestoData),
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
  const parkedFeatureCount = draft.features.filter(
    (feature) => !isFeatureExportableForManifesto(feature, manifestoData, draft),
  ).length;

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

            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
              Core features require JTBD + pain-point linkage. Supporting items require a supporting justification.
            </div>

            {draft.features.map((feature, index) => {
              const featureJtbdIds = getFeatureJtbdIds(feature);
              const featurePainPointIds = getResolvedFeaturePainPointIds(feature, manifestoData);
              const featureKind = getFeatureKind(feature);
              const parkingMessage = getFeatureParkingMessage(feature, manifestoData, draft);

              return (
                <div key={feature.id || index} className="space-y-2 rounded-xl border border-neutral-200/80 p-3">
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
                    Type
                    <select
                      value={featureKind}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          features: current.features.map((item, featureIndex) =>
                            featureIndex === index
                              ? {
                                  ...item,
                                  kind: event.target.value as KeyFeatureData["kind"],
                                }
                              : item
                          ),
                        }))
                      }
                      className="h-10 w-full rounded-lg border border-neutral-200 bg-white px-3 text-sm text-neutral-700 outline-none focus:border-neutral-400"
                    >
                      <option value="core">Core</option>
                      <option value="supporting">Supporting</option>
                    </select>
                  </label>

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
                                  priority: event.target.value as KeyFeatureData["priority"],
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

                  {featureKind === "supporting" && (
                    <div className="space-y-1">
                      <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
                        Supporting Justification
                      </p>
                      <Textarea
                        value={feature.supportingJustification}
                        placeholder="Explain why this must ship even without direct discovery linkage."
                        onChange={(event) =>
                          setDraft((current) => ({
                            ...current,
                            features: current.features.map((item, featureIndex) =>
                              featureIndex === index
                                ? { ...item, supportingJustification: event.target.value }
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
                    </div>
                  )}

                  <TraceabilitySelector
                    label="Links to JTBDs"
                    description={
                      featureKind === "core"
                        ? "Required for core features."
                        : "Optional context for supporting items."
                    }
                    options={jtbdOptions.map((jtbd) => ({
                      id: jtbd.id,
                      label: jtbd.text,
                      meta: jtbd.id.toUpperCase(),
                    }))}
                    selectedIds={featureJtbdIds}
                    onChange={(nextIds) =>
                      setDraft((current) => ({
                        ...current,
                        features: current.features.map((item, featureIndex) =>
                          featureIndex === index ? { ...item, jtbdIds: nextIds } : item
                        ),
                      }))
                    }
                  />

                  <TraceabilitySelector
                    label="Links to pain points"
                    description={
                      featureKind === "core"
                        ? "Required for core features."
                        : "Optional context for supporting items."
                    }
                    options={painPointOptions.map((painPoint) => ({
                      id: painPoint.id,
                      label: painPoint.label,
                      meta: painPoint.source,
                    }))}
                    selectedIds={featurePainPointIds}
                    onChange={(nextIds) =>
                      setDraft((current) => ({
                        ...current,
                        features: current.features.map((item, featureIndex) =>
                          featureIndex === index ? { ...item, painPointIds: nextIds } : item
                        ),
                      }))
                    }
                  />

                  {parkingMessage && (
                    <p className="text-xs font-medium text-red-600">
                      {parkingMessage}
                    </p>
                  )}
                </div>
              );
            })}

            <AddListItemButton
              label="Add feature"
              onClick={() =>
                setDraft((current) => ({
                  ...current,
                  features: [
                    ...current.features,
                    {
                      id: "",
                      name: "",
                      description: "",
                      priority: "medium",
                      kind: "core",
                      supportingJustification: "",
                      jtbdIds: [],
                      painPointIds: [],
                    },
                  ],
                }))
              }
            />

            <EditModeActions onSave={saveEditing} onCancel={cancelEditing} />
          </div>
        ) : (
          <div className="p-5">
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
                    <div className="ml-4 space-y-3">
                      {group.map((feature, index) => {
                        const featureKind = getFeatureKind(feature);
                        const featureJtbdIds = getFeatureJtbdIds(feature);
                        const featurePainPointIds = getFeaturePainPointIds(feature);

                        return (
                          <div key={`${priority}-${index}`} className="min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-semibold leading-tight text-neutral-900">
                                {feature.name}
                              </p>
                              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${
                                featureKind === "supporting"
                                  ? "bg-slate-100 text-slate-700"
                                  : "bg-blue-50 text-blue-700"
                              }`}>
                                {featureKind === "supporting" ? "Supporting" : "Core"}
                              </span>
                              {!isFeatureExportableForManifesto(feature, manifestoData, draft) && (
                                <span className="inline-flex items-center rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-medium text-red-700">
                                  Parked
                                </span>
                              )}
                            </div>
                            {feature.description && (
                              <p className="mt-0.5 text-sm leading-relaxed text-neutral-600">
                                {feature.description}
                              </p>
                            )}
                            {featureKind === "supporting" && feature.supportingJustification && (
                              <p className="mt-1 text-xs leading-relaxed text-neutral-500">
                                {feature.supportingJustification}
                              </p>
                            )}
                            <div className="mt-1.5 flex flex-wrap gap-1.5">
                              {featureJtbdIds.map((jtbdId) => {
                                const jtbd = jtbdOptions.find((item) => item.id === jtbdId);
                                if (!jtbd) return null;
                                return (
                                  <span
                                    key={jtbdId}
                                    className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-700"
                                  >
                                    {jtbd.id.toUpperCase()}
                                  </span>
                                );
                              })}
                              {featurePainPointIds.map((painPointId) => {
                                const painPoint = painPointOptions.find((item) => item.id === painPointId);
                                if (!painPoint) return null;
                                return (
                                  <span
                                    key={painPointId}
                                    className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700"
                                  >
                                    {painPoint.label}
                                  </span>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            {parkedFeatureCount > 0 && (
              <p className="mt-4 text-xs font-medium text-amber-700">
                {parkedFeatureCount} parked feature{parkedFeatureCount === 1 ? "" : "s"} will stay in Novum and be excluded from exported files until linked or justified.
              </p>
            )}

            {canEdit && <ReadOnlyEditHint />}
          </div>
        )}
      </div>
    </div>
  );
}

function TraceabilitySelector(props: {
  label: string;
  description: string;
  options: { id: string; label: string; meta: string }[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}) {
  const { label, description, options, selectedIds, onChange } = props;

  return (
    <div className="space-y-2 rounded-lg border border-neutral-200 bg-neutral-50/70 p-3">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">{label}</p>
        <p className="mt-1 text-xs text-neutral-500">{description}</p>
      </div>

      {options.length > 0 ? (
        <div className="space-y-2">
          {options.map((option) => {
            const checked = selectedIds.includes(option.id);
            return (
              <label
                key={option.id}
                className="flex cursor-pointer items-start gap-2 rounded-lg border border-transparent bg-white px-2 py-2 text-sm hover:border-neutral-200"
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(event) =>
                    onChange(
                      event.target.checked
                        ? [...selectedIds, option.id]
                        : selectedIds.filter((id) => id !== option.id)
                    )
                  }
                  className="mt-0.5 h-4 w-4 rounded border-neutral-300"
                />
                <span className="min-w-0">
                  <span className="block text-sm text-neutral-800">{option.label}</span>
                  <span className="block text-[11px] uppercase tracking-wider text-neutral-400">
                    {option.meta}
                  </span>
                </span>
              </label>
            );
          })}
        </div>
      ) : (
        <p className="text-xs text-neutral-500">No options available yet.</p>
      )}
    </div>
  );
}
