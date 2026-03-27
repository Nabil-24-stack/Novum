"use client";

import { useCallback, useMemo, useRef } from "react";
import { AlertTriangle, Quote, Target, Users2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import type { ManifestoData, PersonaData } from "@/hooks/useStrategyStore";
import { normalizePersonaData } from "@/lib/strategy/artifact-edit-sync";
import { resolvePainPointsByIds } from "@/lib/strategy/pain-points";
import {
  artifactCardLayout,
  getPersonasCardWidth,
  getPersonasColumnCount,
} from "@/lib/strategy/artifact-card-layout";
import {
  ARTIFACT_EDITOR_FIELDS_CLASSNAME,
  ARTIFACT_IDLE_CARD_CLASSNAME,
  ARTIFACT_SELECTED_CARD_CLASSNAME,
  AddListItemButton,
  CheckboxSelector,
  EditableStringList,
  EditModeActions,
  ReadOnlyEditHint,
  RemoveListItemButton,
  handleEditorKeyDown,
  useArtifactCardInteraction,
  useEditableCard,
  useFocusWhenEditing,
} from "@/components/strategy/editing";

const ACCENT_COLORS = [
  { bg: "bg-blue-100", text: "text-blue-700", border: "border-blue-200" },
  { bg: "bg-violet-100", text: "text-violet-700", border: "border-violet-200" },
  { bg: "bg-emerald-100", text: "text-emerald-700", border: "border-emerald-200" },
  { bg: "bg-amber-100", text: "text-amber-700", border: "border-amber-200" },
  { bg: "bg-rose-100", text: "text-rose-700", border: "border-rose-200" },
] as const;

type EditablePersonaBoardItem = PersonaData & {
  __draftId: string;
};

interface PersonasBoardCardProps {
  manifestoData?: Partial<ManifestoData> | null;
  personaData?: Array<Partial<PersonaData>> | null;
  visiblePersonaCount?: number;
  x: number;
  y: number;
  onMove?: (x: number, y: number) => void;
  onCommit?: (personaData: PersonaData[]) => void;
  isSelected?: boolean;
  onSelect?: () => void;
  onSingleClickConfirmed?: () => void;
}

function getInitials(name: string): string {
  if (!name.trim()) return "?";
  return name
    .split(" ")
    .map((word) => word[0] ?? "")
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function isMeaningfulPersona(persona: Pick<PersonaData, "name" | "role" | "bio" | "goals" | "painPointIds" | "quote">): boolean {
  return Boolean(
    persona.name.trim() ||
    persona.role.trim() ||
    persona.bio.trim() ||
    persona.quote.trim() ||
    persona.goals.length > 0 ||
    persona.painPointIds.length > 0
  );
}

function normalizeEditablePersonaBoard(
  personas: Array<Partial<PersonaData> & { __draftId?: string }> | null | undefined,
  painPointRegistry: NonNullable<ManifestoData["painPoints"]>,
): EditablePersonaBoardItem[] {
  return (personas ?? [])
    .map((persona, index) => {
      const normalized = normalizePersonaData(
        {
          ...(persona as PersonaData),
          name: persona.name ?? "",
          role: persona.role ?? "",
          bio: persona.bio ?? "",
          goals: persona.goals ?? [],
          painPointIds: persona.painPointIds ?? [],
          quote: persona.quote ?? "",
        } as PersonaData,
        painPointRegistry
      );

      return {
        ...normalized,
        __draftId: persona.__draftId ?? `existing-${index}`,
      };
    })
    .filter((persona) => isMeaningfulPersona(persona));
}

export function PersonasBoardCard({
  manifestoData = null,
  personaData = null,
  visiblePersonaCount,
  x,
  y,
  onMove,
  onCommit,
  isSelected = false,
  onSelect,
  onSingleClickConfirmed,
}: PersonasBoardCardProps) {
  const painPointRegistry = useMemo(
    () => manifestoData?.painPoints ?? [],
    [manifestoData?.painPoints]
  );
  const nextDraftIdRef = useRef(0);
  const normalizeBoard = useCallback(
    (value: EditablePersonaBoardItem[]) => normalizeEditablePersonaBoard(value, painPointRegistry),
    [painPointRegistry]
  );
  const {
    canEdit,
    isEditing,
    draft,
    setDraft,
    startEditing,
    cancelEditing,
    saveEditing,
  } = useEditableCard({
    value: normalizeEditablePersonaBoard(personaData as Array<Partial<PersonaData> & { __draftId?: string }> | null, painPointRegistry),
    onCommit,
    normalize: normalizeBoard,
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
  const personas = draft;
  const columnCount = getPersonasColumnCount(personas.length);
  const cardWidth = getPersonasCardWidth(personas.length);
  const editWidth = Math.max(cardWidth, 680);
  const revealedPersonaCount = visiblePersonaCount === undefined
    ? personas.length
    : Math.min(visiblePersonaCount, personas.length);
  const shouldShowStreamingPlaceholder =
    !isEditing &&
    visiblePersonaCount !== undefined &&
    revealedPersonaCount < Math.max(1, personas.length);

  return (
    <div
      className={`absolute ${isEditing ? "" : "select-none"}`}
      style={{
        left: x,
        top: y,
        width: isEditing ? editWidth : cardWidth,
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
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50">
            <Users2 className="h-4 w-4 text-amber-600" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-neutral-900">Personas</h2>
            <p className="text-sm text-neutral-500">
              Rich profiles for the people behind each job
            </p>
          </div>
          <span className="ml-auto rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-600">
            {personas.length}
          </span>
        </div>

        {isEditing ? (
          <div className={`space-y-4 ${ARTIFACT_EDITOR_FIELDS_CLASSNAME}`}>
            <div className="rounded-xl border border-neutral-200/70 bg-neutral-50 p-3 text-xs text-neutral-500">
              Save the whole board at once. Persona renames will update linked JTBDs, journey maps, user flows, and key features.
            </div>

            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
                Personas
              </p>
              <AddListItemButton
                label="Add persona"
                onClick={() =>
                  setDraft((current) => [
                    ...current,
                    {
                      __draftId: `new-${nextDraftIdRef.current++}`,
                      name: "",
                      role: "",
                      bio: "",
                      goals: [],
                      painPointIds: [],
                      quote: "",
                    },
                  ])
                }
              />
            </div>

            {draft.map((persona, personaIndex) => (
              <div key={persona.__draftId} className="space-y-4 rounded-xl border border-neutral-200/80 p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
                    Persona {personaIndex + 1}
                  </p>
                  <RemoveListItemButton
                    onClick={() =>
                      setDraft((current) => current.filter((_, index) => index !== personaIndex))
                    }
                  />
                </div>

                <div className="grid gap-3">
                  <Input
                    ref={personaIndex === 0 ? firstInputRef : undefined}
                    value={persona.name}
                    placeholder="Persona name"
                    onChange={(event) =>
                      setDraft((current) =>
                        current.map((item, index) =>
                          index === personaIndex ? { ...item, name: event.target.value } : item
                        )
                      )
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
                    value={persona.role}
                    placeholder="Role or context"
                    onChange={(event) =>
                      setDraft((current) =>
                        current.map((item, index) =>
                          index === personaIndex ? { ...item, role: event.target.value } : item
                        )
                      )
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
                    value={persona.bio}
                    placeholder="Short bio"
                    onChange={(event) =>
                      setDraft((current) =>
                        current.map((item, index) =>
                          index === personaIndex ? { ...item, bio: event.target.value } : item
                        )
                      )
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
                  values={persona.goals}
                  addLabel="Add goal"
                  onChange={(goals) =>
                    setDraft((current) =>
                      current.map((item, index) =>
                        index === personaIndex ? { ...item, goals } : item
                      )
                    )
                  }
                  onSave={saveEditing}
                  onCancel={cancelEditing}
                />

                <CheckboxSelector
                  label="Pain Points"
                  description="Select canonical pain points from the overview registry."
                  options={painPointRegistry.map((painPoint) => ({
                    id: painPoint.id,
                    label: painPoint.text,
                  }))}
                  selectedIds={persona.painPointIds}
                  onChange={(painPointIds) =>
                    setDraft((current) =>
                      current.map((item, index) =>
                        index === personaIndex ? { ...item, painPointIds } : item
                      )
                    )
                  }
                  emptyMessage="No canonical pain points available yet."
                />

                <div className="space-y-1">
                  <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
                    Quote
                  </p>
                  <Textarea
                    value={persona.quote}
                    placeholder="First-person quote"
                    onChange={(event) =>
                      setDraft((current) =>
                        current.map((item, index) =>
                          index === personaIndex ? { ...item, quote: event.target.value } : item
                        )
                      )
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
              </div>
            ))}

            <EditModeActions onSave={saveEditing} onCancel={cancelEditing} />
          </div>
        ) : personas.length > 0 || visiblePersonaCount !== undefined ? (
          <div
            className="grid items-start gap-4"
            style={{
              gridTemplateColumns: `repeat(${columnCount}, minmax(0, ${artifactCardLayout.personas.columnWidth}px))`,
            }}
          >
            {personas.slice(0, revealedPersonaCount).map((persona, personaIndex) => (
              <PersonaDisplayCard
                key={persona.__draftId}
                persona={persona}
                personaIndex={personaIndex}
                painPointRegistry={painPointRegistry}
              />
            ))}
            {shouldShowStreamingPlaceholder && <PersonaPlaceholderCard />}
            {canEdit && (
              <div style={{ gridColumn: `1 / span ${Math.max(1, columnCount)}` }}>
                <ReadOnlyEditHint />
              </div>
            )}
          </div>
        ) : (
          <div>
            <div className="rounded-2xl border border-dashed border-neutral-200 bg-neutral-50/60 p-4 text-sm text-neutral-500">
              Rich persona details will appear here once the discovery phase identifies the users behind each job.
            </div>
            {canEdit && <ReadOnlyEditHint />}
          </div>
        )}
      </div>
    </div>
  );
}

function PersonaDisplayCard(props: {
  persona: EditablePersonaBoardItem;
  personaIndex: number;
  painPointRegistry: NonNullable<ManifestoData["painPoints"]>;
}) {
  const { persona, personaIndex, painPointRegistry } = props;
  const accent = ACCENT_COLORS[personaIndex] ?? ACCENT_COLORS[0];
  const resolvedPainPoints = useMemo(
    () =>
      resolvePainPointsByIds(
        persona.painPointIds,
        { painPoints: painPointRegistry } as ManifestoData,
      ),
    [painPointRegistry, persona.painPointIds]
  );

  return (
    <div className="rounded-2xl border border-neutral-200/60 bg-white/90 p-6 shadow-lg backdrop-blur-sm">
      {(persona.name || persona.role) && (
        <div className="mb-4 flex items-center gap-3">
          <div
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold ${accent.bg} ${accent.text}`}
          >
            {getInitials(persona.name)}
          </div>
          <div className="min-w-0">
            {persona.name ? (
              <p className="truncate text-base font-semibold text-neutral-900">{persona.name}</p>
            ) : (
              <p className="truncate text-base font-semibold text-neutral-900">
                Persona in progress
              </p>
            )}
            {persona.role && (
              <p className="truncate text-sm text-neutral-500">{persona.role}</p>
            )}
          </div>
        </div>
      )}

      {persona.bio && (
        <p className="mb-4 text-sm leading-relaxed text-neutral-600">{persona.bio}</p>
      )}

      {persona.bio && persona.goals.length > 0 && (
        <div className="mb-4 border-t border-neutral-200/60" />
      )}

      {persona.goals.length > 0 && (
        <div className="mb-4">
          <div className="mb-2 flex items-center gap-1.5">
            <Target className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
            <h4 className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
              Goals
            </h4>
          </div>
          <ul className="space-y-1.5">
            {persona.goals.map((goal, goalIndex) => (
              <li
                key={`goal-${goal}-${goalIndex}`}
                className="relative pl-5 text-sm leading-relaxed text-neutral-700"
              >
                <span className="absolute left-0 top-1.5 h-1.5 w-1.5 rounded-full bg-emerald-400" />
                {goal}
              </li>
            ))}
          </ul>
        </div>
      )}

      {resolvedPainPoints.length > 0 && (
        <div className="mb-4">
          <div className="mb-2 flex items-center gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-500" />
            <h4 className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
              Pain Points
            </h4>
          </div>
          <ul className="space-y-1.5">
            {resolvedPainPoints.map((painPoint, painPointIndex) => (
              <li
                key={`pain-point-${painPoint.id || painPoint.text || "item"}-${painPointIndex}`}
                className="relative pl-5 text-sm leading-relaxed text-neutral-700"
              >
                <span className="absolute left-0 top-1.5 h-1.5 w-1.5 rounded-full bg-amber-400" />
                {painPoint.text}
              </li>
            ))}
          </ul>
        </div>
      )}

      {persona.quote && (
        <>
          {(persona.goals.length > 0 || resolvedPainPoints.length > 0) && (
            <div className="mb-4 border-t border-neutral-200/60" />
          )}
          <div className={`border-l-2 pl-3 ${accent.border}`}>
            <Quote className="mb-1 h-3.5 w-3.5 text-neutral-400" />
            <p className="text-sm italic leading-relaxed text-neutral-600">
              &ldquo;{persona.quote}&rdquo;
            </p>
          </div>
        </>
      )}
    </div>
  );
}

function PersonaPlaceholderCard() {
  return (
    <div className="rounded-2xl border border-neutral-200/60 bg-white/90 p-6 shadow-lg backdrop-blur-sm">
      <div className="mb-4 flex items-center gap-3">
        <Skeleton className="h-10 w-10 rounded-full bg-amber-100/80" />
        <div className="min-w-0 flex-1 space-y-2">
          <Skeleton className="h-4 w-2/3 bg-amber-100/80" />
          <Skeleton className="h-3 w-1/2 bg-neutral-200/80" />
        </div>
      </div>

      <div className="space-y-2">
        <Skeleton className="h-4 w-full bg-neutral-200/80" />
        <Skeleton className="h-4 w-5/6 bg-neutral-200/80" />
      </div>

      <div className="mb-4 mt-4 border-t border-neutral-200/60" />

      <div className="space-y-2">
        <Skeleton className="h-3 w-16 bg-emerald-100/80" />
        <Skeleton className="h-4 w-3/4 bg-neutral-200/80" />
        <Skeleton className="h-4 w-2/3 bg-neutral-200/80" />
      </div>
    </div>
  );
}
