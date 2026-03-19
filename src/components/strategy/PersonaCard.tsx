"use client";

import { useMemo } from "react";
import { AlertTriangle, Quote, Target } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { PersonaData } from "@/hooks/useStrategyStore";
import {
  AddListItemButton,
  CardDragHandle,
  EditModeActions,
  ReadOnlyEditHint,
  RemoveListItemButton,
  handleEditorKeyDown,
  useDragHandle,
  useEditableCard,
  useFocusWhenEditing,
} from "@/components/strategy/editing";
import { normalizePersonaData } from "@/lib/strategy/artifact-edit-sync";

const ACCENT_COLORS = [
  { bg: "bg-blue-100", text: "text-blue-700", border: "border-blue-200" },
  { bg: "bg-violet-100", text: "text-violet-700", border: "border-violet-200" },
  { bg: "bg-emerald-100", text: "text-emerald-700", border: "border-emerald-200" },
  { bg: "bg-amber-100", text: "text-amber-700", border: "border-amber-200" },
  { bg: "bg-rose-100", text: "text-rose-700", border: "border-rose-200" },
] as const;

interface PersonaCardProps {
  persona: Partial<PersonaData>;
  x: number;
  y: number;
  onMove?: (x: number, y: number) => void;
  index: number;
  coveragePercent?: number;
  onCommit?: (persona: PersonaData) => void;
}

export function PersonaCard({
  persona,
  x,
  y,
  onMove,
  index,
  coveragePercent,
  onCommit,
}: PersonaCardProps) {
  const accent = ACCENT_COLORS[index] ?? ACCENT_COLORS[0];
  const {
    canEdit,
    isEditing,
    draft,
    setDraft,
    startEditing,
    cancelEditing,
    saveEditing,
  } = useEditableCard({
    value: normalizePersonaData({
      name: persona.name ?? "",
      role: persona.role ?? "",
      bio: persona.bio ?? "",
      goals: persona.goals ?? [],
      painPoints: persona.painPoints ?? [],
      quote: persona.quote ?? "",
    }),
    onCommit,
    normalize: normalizePersonaData,
  });
  const { isDragging, dragHandleProps } = useDragHandle({ x, y, onMove });
  const firstInputRef = useFocusWhenEditing<HTMLInputElement>(isEditing);

  const initials = useMemo(() => {
    if (!draft.name.trim()) return "?";
    return draft.name
      .split(" ")
      .map((word) => word[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  }, [draft.name]);

  return (
    <div
      className={`absolute ${isEditing ? "" : "select-none"}`}
      style={{
        left: x,
        top: y,
        width: 320,
      }}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div className="rounded-2xl border border-neutral-200/60 bg-white/90 p-6 shadow-lg backdrop-blur-sm">
        <div className="mb-4 flex items-start justify-between gap-3">
          <h2 className="text-lg font-bold text-neutral-900">Persona {index + 1}</h2>
          <CardDragHandle
            isDragging={isDragging}
            canDrag={Boolean(onMove)}
            dragHandleProps={dragHandleProps}
          />
        </div>

        {isEditing ? (
          <div className="space-y-4">
            <div className="grid gap-3">
              <Input
                ref={firstInputRef}
                value={draft.name}
                placeholder="Persona name"
                onChange={(event) =>
                  setDraft((current) => ({ ...current, name: event.target.value }))
                }
                onKeyDown={(event) =>
                  handleEditorKeyDown(event, {
                    onSave: saveEditing,
                    onCancel: cancelEditing,
                  })
                }
                className="text-sm"
              />
              <Input
                value={draft.role}
                placeholder="Role or context"
                onChange={(event) =>
                  setDraft((current) => ({ ...current, role: event.target.value }))
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
                value={draft.bio}
                placeholder="Short bio"
                onChange={(event) =>
                  setDraft((current) => ({ ...current, bio: event.target.value }))
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

            <EditableStringList
              label="Goals"
              values={draft.goals}
              addLabel="Add goal"
              onChange={(nextGoals) =>
                setDraft((current) => ({ ...current, goals: nextGoals }))
              }
              onSave={saveEditing}
              onCancel={cancelEditing}
            />

            <EditableStringList
              label="Pain Points"
              values={draft.painPoints}
              addLabel="Add pain point"
              onChange={(nextPainPoints) =>
                setDraft((current) => ({ ...current, painPoints: nextPainPoints }))
              }
              onSave={saveEditing}
              onCancel={cancelEditing}
            />

            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
                Quote
              </p>
              <Textarea
                value={draft.quote}
                placeholder="First-person quote"
                onChange={(event) =>
                  setDraft((current) => ({ ...current, quote: event.target.value }))
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

            <EditModeActions onSave={saveEditing} onCancel={cancelEditing} />
          </div>
        ) : (
          <div
            className={canEdit ? "cursor-text" : undefined}
            onClick={() => {
              if (canEdit) startEditing();
            }}
          >
            {(draft.name || draft.role) && (
              <div className="mb-4 flex items-center gap-3">
                <div
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold ${accent.bg} ${accent.text}`}
                >
                  {initials}
                </div>
                <div className="min-w-0">
                  {draft.name && (
                    <p className="truncate text-base font-semibold text-neutral-900">{draft.name}</p>
                  )}
                  {draft.role && (
                    <p className="truncate text-sm text-neutral-500">{draft.role}</p>
                  )}
                </div>
              </div>
            )}

            {draft.bio && (
              <p className="mb-4 text-sm leading-relaxed text-neutral-600">{draft.bio}</p>
            )}

            {draft.bio && draft.goals.length > 0 && (
              <div className="mb-4 border-t border-neutral-200/60" />
            )}

            {draft.goals.length > 0 && (
              <div className="mb-4">
                <div className="mb-2 flex items-center gap-1.5">
                  <Target className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
                    Goals
                  </h4>
                </div>
                <ul className="space-y-1.5">
                  {draft.goals.map((goal, goalIndex) => (
                    <li
                      key={goalIndex}
                      className="relative pl-5 text-sm leading-relaxed text-neutral-700"
                    >
                      <span className="absolute left-0 top-1.5 h-1.5 w-1.5 rounded-full bg-emerald-400" />
                      {goal}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {draft.painPoints.length > 0 && (
              <div className="mb-4">
                <div className="mb-2 flex items-center gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
                    Pain Points
                  </h4>
                </div>
                <ul className="space-y-1.5">
                  {draft.painPoints.map((painPoint, painPointIndex) => (
                    <li
                      key={painPointIndex}
                      className="relative pl-5 text-sm leading-relaxed text-neutral-700"
                    >
                      <span className="absolute left-0 top-1.5 h-1.5 w-1.5 rounded-full bg-amber-400" />
                      {painPoint}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {draft.quote && (
              <>
                {(draft.goals.length > 0 || draft.painPoints.length > 0) && (
                  <div className="mb-4 border-t border-neutral-200/60" />
                )}
                <div className={`border-l-2 pl-3 ${accent.border}`}>
                  <Quote className="mb-1 h-3.5 w-3.5 text-neutral-400" />
                  <p className="text-sm italic leading-relaxed text-neutral-600">
                    &ldquo;{draft.quote}&rdquo;
                  </p>
                </div>
              </>
            )}

            {coveragePercent !== undefined && (
              <div className="mt-4 border-t border-neutral-200/60 pt-3">
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="text-xs font-medium text-neutral-500">Coverage</span>
                  <span className="text-xs font-semibold text-emerald-600">{coveragePercent}%</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-neutral-100">
                  <div
                    className="h-full rounded-full bg-emerald-400 transition-all duration-500"
                    style={{ width: `${coveragePercent}%` }}
                  />
                </div>
              </div>
            )}

            {canEdit && <ReadOnlyEditHint />}
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
          <div key={index} className="flex items-start gap-2">
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
