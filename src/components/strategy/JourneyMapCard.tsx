"use client";

import type { ReactNode } from "react";
import { Check, Footprints } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { JourneyMapData, JourneyStage } from "@/hooks/useStrategyStore";
import type { TraceableTextItem } from "@/lib/strategy/traceable";
import { resolvePainPointsByIds } from "@/lib/strategy/pain-points";
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
import { normalizeJourneyMapData } from "@/lib/strategy/artifact-edit-sync";

export const JOURNEY_CARD_WIDTH = 900;

const PERSONA_ACCENT_COLORS = [
  { bg: "bg-blue-100", text: "text-blue-700" },
  { bg: "bg-violet-100", text: "text-violet-700" },
  { bg: "bg-emerald-100", text: "text-emerald-700" },
  { bg: "bg-amber-100", text: "text-amber-700" },
  { bg: "bg-rose-100", text: "text-rose-700" },
] as const;

const STAGE_COLORS = [
  { header: "bg-blue-200/80 text-blue-900", cell: "bg-blue-50/70" },
  { header: "bg-teal-200/80 text-teal-900", cell: "bg-teal-50/70" },
  { header: "bg-violet-200/80 text-violet-900", cell: "bg-violet-50/70" },
  { header: "bg-amber-200/80 text-amber-900", cell: "bg-amber-50/70" },
  { header: "bg-rose-200/80 text-rose-900", cell: "bg-rose-50/70" },
  { header: "bg-cyan-200/80 text-cyan-900", cell: "bg-cyan-50/70" },
] as const;

const ROW_DEFS = [
  { key: "actions", label: "Actions" },
  { key: "thoughts", label: "Thoughts" },
  { key: "emotion", label: "Emotions" },
  { key: "painPoints", label: "Pain Points" },
  { key: "frictionNotes", label: "Friction Notes" },
  { key: "opportunities", label: "Opportunities" },
] as const;

type RowKey = (typeof ROW_DEFS)[number]["key"];

function getEmotionEmoji(emotion: string): string {
  const lower = emotion.toLowerCase();
  if (lower.includes("happy") || lower.includes("delighted") || lower.includes("excited")) return "\u{1F60A}";
  if (lower.includes("hopeful") || lower.includes("optimistic") || lower.includes("curious")) return "\u{1F914}";
  if (lower.includes("satisfied") || lower.includes("relieved") || lower.includes("confident")) return "\u{1F60C}";
  if (lower.includes("frustrat") || lower.includes("angry") || lower.includes("annoyed")) return "\u{1F620}";
  if (lower.includes("overwhelm") || lower.includes("anxious") || lower.includes("stressed")) return "\u{1F630}";
  if (lower.includes("confused") || lower.includes("uncertain") || lower.includes("hesitant")) return "\u{1F615}";
  if (lower.includes("disappoint") || lower.includes("sad")) return "\u{1F61E}";
  if (lower.includes("neutral") || lower.includes("indifferent")) return "\u{1F610}";
  return "\u{1F642}";
}

function getEmotionStyle(emotion: string): string {
  const lower = emotion.toLowerCase();
  if (
    lower.includes("happy") || lower.includes("excited") || lower.includes("satisfied") ||
    lower.includes("relieved") || lower.includes("confident") || lower.includes("delighted")
  ) return "bg-emerald-100 text-emerald-700 border-emerald-200";
  if (
    lower.includes("frustrat") || lower.includes("angry") || lower.includes("annoyed") ||
    lower.includes("overwhelm") || lower.includes("anxious") || lower.includes("disappoint") ||
    lower.includes("stressed") || lower.includes("sad")
  ) return "bg-red-100 text-red-700 border-red-200";
  return "bg-amber-100 text-amber-700 border-amber-200";
}

function getCellContent(
  stage: Partial<JourneyStage>,
  rowKey: RowKey,
  painPointRegistry: TraceableTextItem[],
): ReactNode {
  switch (rowKey) {
    case "actions":
      return stage.actions?.map((item, index) => (
        <p key={index} className="text-[11px] leading-relaxed text-neutral-700">{item}</p>
      ));
    case "thoughts":
      return stage.thoughts?.map((item, index) => (
        <p key={index} className="text-[11px] italic leading-relaxed text-neutral-600">&ldquo;{item}&rdquo;</p>
      ));
    case "emotion":
      if (!stage.emotion) return null;
      return (
        <div className="flex flex-col items-center gap-1">
          <span className="text-xl">{getEmotionEmoji(stage.emotion)}</span>
          <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${getEmotionStyle(stage.emotion)}`}>
            {stage.emotion}
          </span>
        </div>
      );
    case "painPoints": {
      const linkedPainPoints = resolvePainPointsByIds(stage.painPointIds ?? [], {
        painPoints: painPointRegistry,
      } as never);
      return linkedPainPoints.map((item, index) => (
        <p key={item.id || index} className="text-[11px] leading-relaxed text-neutral-700">{item.text}</p>
      ));
    }
    case "frictionNotes":
      return stage.frictionNotes?.map((item, index) => (
        <p key={index} className="text-[11px] leading-relaxed text-neutral-700">{item}</p>
      ));
    case "opportunities":
      return stage.opportunities?.map((item, index) => (
        <p key={index} className="text-[11px] leading-relaxed text-emerald-800">{item}</p>
      ));
    default:
      return null;
  }
}

interface JourneyMapCardProps {
  journeyMap: Partial<JourneyMapData>;
  painPointRegistry: TraceableTextItem[];
  x: number;
  y: number;
  onMove?: (x: number, y: number) => void;
  index: number;
  coveredStageIndices?: Set<number>;
  onCommit?: (journeyMap: JourneyMapData) => void;
  isSelected?: boolean;
  onSelect?: () => void;
  onSingleClickConfirmed?: () => void;
}

export function JourneyMapCard({
  journeyMap,
  painPointRegistry,
  x,
  y,
  onMove,
  index,
  coveredStageIndices,
  onCommit,
  isSelected = false,
  onSelect,
  onSingleClickConfirmed,
}: JourneyMapCardProps) {
  const accent = PERSONA_ACCENT_COLORS[index % PERSONA_ACCENT_COLORS.length];
  const {
    canEdit,
    isEditing,
    draft,
    setDraft,
    startEditing,
    cancelEditing,
    saveEditing,
  } = useEditableCard({
    value: normalizeJourneyMapData(
      {
        ...(journeyMap as JourneyMapData & { stages?: JourneyStage[] }),
        personaName: journeyMap.personaName ?? "",
        stages: journeyMap.stages ?? [],
      } as JourneyMapData,
      painPointRegistry
    ),
    onCommit,
    normalize: (value) => normalizeJourneyMapData(value, painPointRegistry),
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
  const stageCount = draft.stages.length;
  const cardWidth = Math.max(JOURNEY_CARD_WIDTH, 100 + stageCount * 150 + 48);

  return (
    <div
      className={`absolute ${isEditing ? "" : "select-none"}`}
      style={{
        left: x,
        top: y,
        width: cardWidth,
        touchAction: isEditing ? undefined : "none",
      }}
      {...cardInteractionProps}
    >
      <div
        className={`overflow-hidden rounded-2xl border border-neutral-200/60 bg-white/90 shadow-lg backdrop-blur-sm ${ARTIFACT_IDLE_CARD_CLASSNAME} ${
          isSelected ? ARTIFACT_SELECTED_CARD_CLASSNAME : ""
        } ${!isEditing ? (isDragging ? "cursor-grabbing" : "cursor-grab") : ""}`}
      >
        <div className="flex items-center justify-between gap-3 border-b border-neutral-200/60 px-5 py-3">
          <div className="flex items-center gap-2">
            <Footprints className="h-4 w-4 shrink-0 text-neutral-400" />
            <h3 className="text-sm font-semibold text-neutral-900">Journey Map</h3>
            {draft.personaName && (
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${accent.bg} ${accent.text}`}>
                {draft.personaName}
              </span>
            )}
          </div>
        </div>

        {isEditing ? (
          <div className={`space-y-4 p-5 ${ARTIFACT_EDITOR_FIELDS_CLASSNAME}`}>
            <div className="rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs text-neutral-500">
              Persona label follows the linked persona card in v1.
            </div>

            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
                Stages
              </p>
              <AddListItemButton
                label="Add stage"
                onClick={() =>
                  setDraft((current) => ({
                    ...current,
                    stages: [
                      ...current.stages,
                      {
                        stage: "",
                        actions: [],
                        thoughts: [],
                        emotion: "",
                        painPointIds: [],
                        frictionNotes: [],
                        opportunities: [],
                      },
                    ],
                  }))
                }
              />
            </div>

            {draft.stages.map((stage, stageIndex) => (
              <div key={`${stage.stage}-${stageIndex}`} className="space-y-3 rounded-xl border border-neutral-200/80 p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
                    Stage {stageIndex + 1}
                  </p>
                  <RemoveListItemButton
                    onClick={() =>
                      setDraft((current) => ({
                        ...current,
                        stages: current.stages.filter((_, indexToRemove) => indexToRemove !== stageIndex),
                      }))
                    }
                  />
                </div>

                <Input
                  ref={stageIndex === 0 ? firstInputRef : undefined}
                  value={stage.stage}
                  placeholder="Stage name"
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      stages: current.stages.map((item, indexToUpdate) =>
                        indexToUpdate === stageIndex ? { ...item, stage: event.target.value } : item
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

                <EditableStringList
                  label="Actions"
                  values={stage.actions}
                  addLabel="Add action"
                  onChange={(actions) =>
                    setDraft((current) => ({
                      ...current,
                      stages: current.stages.map((item, indexToUpdate) =>
                        indexToUpdate === stageIndex ? { ...item, actions } : item
                      ),
                    }))
                  }
                  onSave={saveEditing}
                  onCancel={cancelEditing}
                />

                <EditableStringList
                  label="Thoughts"
                  values={stage.thoughts}
                  addLabel="Add thought"
                  onChange={(thoughts) =>
                    setDraft((current) => ({
                      ...current,
                      stages: current.stages.map((item, indexToUpdate) =>
                        indexToUpdate === stageIndex ? { ...item, thoughts } : item
                      ),
                    }))
                  }
                  onSave={saveEditing}
                  onCancel={cancelEditing}
                />

                <label className="space-y-1 text-xs font-medium text-neutral-500">
                  Emotion
                  <Input
                    value={stage.emotion}
                    placeholder="frustrated, confident, relieved..."
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        stages: current.stages.map((item, indexToUpdate) =>
                          indexToUpdate === stageIndex ? { ...item, emotion: event.target.value } : item
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
                </label>

                <IdSelector
                  label="Canonical Pain Points"
                  description="Link this stage to overview pain points when the stage reflects a known problem."
                  options={painPointRegistry.map((painPoint) => ({
                    id: painPoint.id,
                    label: painPoint.text,
                  }))}
                  selectedIds={stage.painPointIds}
                  onChange={(painPointIds) =>
                    setDraft((current) => ({
                      ...current,
                      stages: current.stages.map((item, indexToUpdate) =>
                        indexToUpdate === stageIndex ? { ...item, painPointIds } : item
                      ),
                    }))
                  }
                />

                <EditableStringList
                  label="Friction Notes"
                  values={stage.frictionNotes}
                  addLabel="Add friction note"
                  onChange={(frictionNotes) =>
                    setDraft((current) => ({
                      ...current,
                      stages: current.stages.map((item, indexToUpdate) =>
                        indexToUpdate === stageIndex ? { ...item, frictionNotes } : item
                      ),
                    }))
                  }
                  onSave={saveEditing}
                  onCancel={cancelEditing}
                />

                <EditableStringList
                  label="Opportunities"
                  values={stage.opportunities}
                  addLabel="Add opportunity"
                  onChange={(opportunities) =>
                    setDraft((current) => ({
                      ...current,
                      stages: current.stages.map((item, indexToUpdate) =>
                        indexToUpdate === stageIndex ? { ...item, opportunities } : item
                      ),
                    }))
                  }
                  onSave={saveEditing}
                  onCancel={cancelEditing}
                />
              </div>
            ))}

            <EditModeActions onSave={saveEditing} onCancel={cancelEditing} />
          </div>
        ) : (
          <div>
            {stageCount > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse" style={{ minWidth: 100 + stageCount * 150 }}>
                  <thead>
                    <tr>
                      <th className="w-[100px] min-w-[100px]" />
                      {draft.stages.map((stage, columnIndex) => {
                        const color = STAGE_COLORS[columnIndex % STAGE_COLORS.length];
                        const isCovered = coveredStageIndices?.has(columnIndex);

                        return (
                          <th
                            key={`${stage.stage}-${columnIndex}`}
                            className={`px-3 py-2.5 text-center text-[11px] font-bold uppercase tracking-wider ${color.header} ${
                              isCovered ? "border-b-2 border-emerald-400" : ""
                            }`}
                          >
                            <span className="flex items-center justify-center gap-1">
                              {stage.stage || "..."}
                              {isCovered && <Check className="h-3 w-3 shrink-0 text-emerald-600" />}
                            </span>
                          </th>
                        );
                      })}
                    </tr>
                  </thead>

                  <tbody>
                    {ROW_DEFS.map((row) => (
                      <tr key={row.key}>
                        <td className="border-t border-neutral-100 bg-neutral-50/50 px-4 py-3 align-top text-xs font-semibold text-neutral-600">
                          {row.label}
                        </td>

                        {draft.stages.map((stage, columnIndex) => {
                          const color = STAGE_COLORS[columnIndex % STAGE_COLORS.length];
                          const content = getCellContent(stage, row.key, painPointRegistry);
                          const isEmotion = row.key === "emotion";

                          return (
                            <td
                              key={`${stage.stage}-${columnIndex}-${row.key}`}
                              className={`border-t border-neutral-100/80 px-3 py-2.5 ${color.cell} ${
                                isEmotion ? "align-middle text-center" : "align-top"
                              }`}
                            >
                              <div className={`space-y-1 ${isEmotion ? "flex justify-center" : ""}`}>
                                {content}
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {canEdit && <div className="px-5 pb-5"><ReadOnlyEditHint /></div>}
          </div>
        )}
      </div>
    </div>
  );
}

function EditableStringList(props: {
  label: string;
  values: string[];
  addLabel: string;
  onChange: (values: string[]) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const { label, values, addLabel, onChange, onSave, onCancel } = props;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">{label}</p>
        <AddListItemButton
          label={addLabel}
          onClick={() => onChange([...values, ""])}
        />
      </div>
      <div className="space-y-2">
        {values.map((value, index) => (
          <div key={`${label}-${index}`} className="flex items-start gap-2">
            <Textarea
              value={value}
              placeholder={label}
              onChange={(event) =>
                onChange(values.map((item, itemIndex) => (itemIndex === index ? event.target.value : item)))
              }
              onKeyDown={(event) =>
                handleEditorKeyDown(event, {
                  onSave,
                  onCancel,
                })
              }
              className="min-h-[72px] text-sm"
            />
            <RemoveListItemButton
              onClick={() => onChange(values.filter((_, itemIndex) => itemIndex !== index))}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function IdSelector(props: {
  label: string;
  description: string;
  options: { id: string; label: string }[];
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
                <span className="block text-sm text-neutral-800">{option.label}</span>
              </label>
            );
          })}
        </div>
      ) : (
        <p className="text-xs text-neutral-500">No canonical pain points available yet.</p>
      )}
    </div>
  );
}
