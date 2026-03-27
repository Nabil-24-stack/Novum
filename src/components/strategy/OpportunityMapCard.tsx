"use client";

import { ArrowRightLeft, Sparkles, Users2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import type { ManifestoData, PersonaData } from "@/hooks/useStrategyStore";
import {
  artifactCardLayout,
  getOpportunityMapCardWidth,
  getOpportunityMapColumnCount,
} from "@/lib/strategy/artifact-card-layout";
import { normalizeManifestoData } from "@/lib/strategy/artifact-edit-sync";
import {
  ARTIFACT_EDITOR_FIELDS_CLASSNAME,
  ARTIFACT_IDLE_CARD_CLASSNAME,
  ARTIFACT_SELECTED_CARD_CLASSNAME,
  AddListItemButton,
  CheckboxSelector,
  EditModeActions,
  ReadOnlyEditHint,
  RemoveListItemButton,
  handleEditorKeyDown,
  useArtifactCardInteraction,
  useEditableCard,
  useFocusWhenEditing,
} from "@/components/strategy/editing";

interface OpportunityMapCardProps {
  manifestoData: Partial<ManifestoData>;
  personaData?: PersonaData[] | null;
  visiblePersonaCount?: number;
  x: number;
  y: number;
  onMove?: (x: number, y: number) => void;
  onCommit?: (manifestoData: ManifestoData) => void;
  isSelected?: boolean;
  onSelect?: () => void;
  onSingleClickConfirmed?: () => void;
}

export function OpportunityMapCard({
  manifestoData,
  personaData = null,
  visiblePersonaCount,
  x,
  y,
  onMove,
  onCommit,
  isSelected = false,
  onSelect,
  onSingleClickConfirmed,
}: OpportunityMapCardProps) {
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

  const personas = personaData ?? [];
  const personaOptions = personas
    .map((persona) => ({
      id: persona.name,
      label: persona.name,
      meta: persona.role,
    }))
    .filter((persona) => persona.id.trim().length > 0);
  const jtbds = draft.jtbd ?? [];
  const hmw = draft.hmw ?? [];
  const columnCount = getOpportunityMapColumnCount(personas.length);
  const cardWidth = getOpportunityMapCardWidth(personas.length);
  const editWidth = Math.max(cardWidth, 700);
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
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-50">
            <ArrowRightLeft className="h-4 w-4 text-violet-600" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-neutral-900">Opportunity Map</h2>
            <p className="text-sm text-neutral-500">
              Which personas care about which jobs, and the HMWs each job unlocks
            </p>
          </div>
        </div>

        {isEditing ? (
          <div className={`space-y-4 ${ARTIFACT_EDITOR_FIELDS_CLASSNAME}`}>
            <div className="rounded-xl border border-neutral-200/70 bg-neutral-50 p-3 text-xs text-neutral-500">
              Manage persona-to-JTBD coverage and HMW-to-JTBD links here. JTBD wording stays in JTBD clusters, and persona details stay in the personas card.
            </div>

            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
                JTBD Persona Mapping
              </p>
              {jtbds.map((jtbd, jtbdIndex) => (
                <div key={jtbd.id || jtbdIndex} className="space-y-2 rounded-xl border border-neutral-200/80 p-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-blue-600">
                      {jtbd.id || `JTBD ${jtbdIndex + 1}`}
                    </p>
                    <p className="mt-1 text-sm font-medium leading-relaxed text-neutral-800">
                      {jtbd.text || "JTBD wording is still streaming in."}
                    </p>
                  </div>

                  <CheckboxSelector
                    label="Linked personas"
                    description="Choose which personas are directly served by this JTBD."
                    options={personaOptions}
                    selectedIds={jtbd.personaNames ?? []}
                    onChange={(personaNames) =>
                      setDraft((current) => ({
                        ...current,
                        jtbd: current.jtbd.map((item, index) =>
                          index === jtbdIndex ? { ...item, personaNames } : item
                        ),
                      }))
                    }
                    emptyMessage="No personas available yet."
                    containerClassName="rounded-lg border border-neutral-200 bg-neutral-50/70 p-3"
                  />
                </div>
              ))}
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
                  How Might We
                </p>
                <AddListItemButton
                  label="Add HMW"
                  onClick={() =>
                    setDraft((current) => ({
                      ...current,
                      hmw: [...current.hmw, { id: "", text: "", jtbdIds: [], painPointIds: [] }],
                    }))
                  }
                />
              </div>

              {hmw.map((item, hmwIndex) => (
                <div key={item.id || hmwIndex} className="space-y-3 rounded-xl border border-neutral-200/80 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold uppercase tracking-wider text-fuchsia-600">
                      {item.id || `HMW ${hmwIndex + 1}`}
                    </p>
                    <RemoveListItemButton
                      onClick={() =>
                        setDraft((current) => ({
                          ...current,
                          hmw: current.hmw.filter((_, index) => index !== hmwIndex),
                        }))
                      }
                    />
                  </div>

                  <Textarea
                    ref={hmwIndex === 0 ? firstInputRef : undefined}
                    value={item.text}
                    placeholder={`HMW ${hmwIndex + 1}`}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        hmw: current.hmw.map((hmwItem, index) =>
                          index === hmwIndex ? { ...hmwItem, text: event.target.value } : hmwItem
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

                  <CheckboxSelector
                    label="Linked JTBDs"
                    description="Choose the JTBDs this opportunity opens up."
                    options={jtbds.map((jtbd) => ({
                      id: jtbd.id,
                      label: jtbd.text || "JTBD wording is still streaming in.",
                      meta: jtbd.id.toUpperCase(),
                    }))}
                    selectedIds={item.jtbdIds ?? []}
                    onChange={(jtbdIds) =>
                      setDraft((current) => ({
                        ...current,
                        hmw: current.hmw.map((hmwItem, index) =>
                          index === hmwIndex ? { ...hmwItem, jtbdIds } : hmwItem
                        ),
                      }))
                    }
                    emptyMessage="No JTBDs available yet."
                    containerClassName="rounded-lg border border-neutral-200 bg-neutral-50/70 p-3"
                  />
                </div>
              ))}
            </div>

            <EditModeActions onSave={saveEditing} onCancel={cancelEditing} />
          </div>
        ) : personas.length > 0 || visiblePersonaCount !== undefined ? (
          <div
            className="grid items-start gap-4"
            style={{
              gridTemplateColumns: `repeat(${columnCount}, minmax(0, ${artifactCardLayout.opportunityMap.columnWidth}px))`,
            }}
          >
            {personas.slice(0, revealedPersonaCount).map((persona, personaIndex) => {
              const personaName = typeof persona.name === "string" ? persona.name : "";
              const personaRole = typeof persona.role === "string" ? persona.role : "";
              const mappedJtbds = jtbds.filter((jtbd) => (jtbd.personaNames ?? []).includes(personaName));
              return (
                <div
                  key={`persona-${personaName || personaRole || "item"}-${personaIndex}`}
                  className="rounded-2xl border border-amber-100 bg-amber-50/50 p-4"
                >
                  <div className="mb-4 flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <Users2 className="h-4 w-4 text-amber-600" />
                        <p className="text-sm font-semibold text-neutral-900">
                          {personaName || "Persona in progress"}
                        </p>
                      </div>
                      {personaRole && (
                        <p className="mt-1 text-sm text-neutral-600">{personaRole}</p>
                      )}
                    </div>
                    <span className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-neutral-500">
                      {mappedJtbds.length} JTBD{mappedJtbds.length === 1 ? "" : "s"}
                    </span>
                  </div>

                  <div className="space-y-3">
                    {mappedJtbds.length > 0 ? (
                      mappedJtbds.map((jtbd, jtbdIndex) => {
                        const linkedHmw = hmw.filter((item) => (item.jtbdIds ?? []).includes(jtbd.id));
                        const jtbdId = typeof jtbd.id === "string" ? jtbd.id : "";
                        const jtbdText = typeof jtbd.text === "string" ? jtbd.text : "";
                        return (
                          <div
                            key={`jtbd-${jtbdId || jtbdText || "item"}-${jtbdIndex}`}
                            className="rounded-2xl border border-blue-100 bg-blue-50/70 p-3"
                          >
                            <p className="text-xs font-semibold uppercase tracking-wider text-blue-600">
                              {jtbdId || `JTBD ${jtbdIndex + 1}`}
                            </p>
                            <p className="mt-1 text-sm font-medium leading-relaxed text-neutral-800">
                              {jtbdText || "JTBD wording is still streaming in."}
                            </p>

                            <div className="mt-3">
                              <div className="mb-2 flex items-center gap-2">
                                <Sparkles className="h-3.5 w-3.5 text-fuchsia-600" />
                                <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
                                  How Might We
                                </p>
                              </div>
                              {linkedHmw.length > 0 ? (
                                <div className="flex flex-wrap gap-2">
                                  {linkedHmw.map((item, hmwIndex) => (
                                    <span
                                      key={`hmw-${item.id || item.text || "item"}-${hmwIndex}`}
                                      className="rounded-full bg-fuchsia-100 px-2.5 py-1 text-xs font-medium text-fuchsia-700"
                                    >
                                      {item.text}
                                    </span>
                                  ))}
                                </div>
                              ) : (
                                <p className="text-xs italic text-neutral-400">
                                  HMW opportunities are still being linked.
                                </p>
                              )}
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <div className="rounded-2xl border border-dashed border-neutral-200 bg-white/80 p-3 text-sm text-neutral-500">
                        No persona-to-job mapping has been attached yet.
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            {shouldShowStreamingPlaceholder && <OpportunityMapPlaceholderColumn />}
            {canEdit && (
              <div style={{ gridColumn: `1 / span ${Math.max(1, columnCount)}` }}>
                <ReadOnlyEditHint />
              </div>
            )}
          </div>
        ) : (
          <div>
            <div className="rounded-2xl border border-dashed border-neutral-200 bg-neutral-50/60 p-4 text-sm text-neutral-500">
              Persona mapping will appear here once the discovery phase identifies who each job belongs to.
            </div>
            {canEdit && <ReadOnlyEditHint />}
          </div>
        )}
      </div>
    </div>
  );
}

function OpportunityMapPlaceholderColumn() {
  return (
    <div className="rounded-2xl border border-amber-100 bg-amber-50/50 p-4">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex items-center gap-2">
            <Users2 className="h-4 w-4 text-amber-600" />
            <Skeleton className="h-4 w-24 bg-white/80" />
          </div>
          <Skeleton className="h-3 w-28 bg-white/80" />
        </div>
        <Skeleton className="h-6 w-16 rounded-full bg-white/80" />
      </div>

      <div className="rounded-2xl border border-blue-100 bg-blue-50/70 p-3">
        <Skeleton className="h-3 w-16 bg-blue-100/80" />
        <Skeleton className="mt-2 h-4 w-full bg-blue-100/80" />
        <Skeleton className="mt-2 h-4 w-5/6 bg-blue-100/80" />
        <div className="mt-3 space-y-2">
          <Skeleton className="h-3 w-24 bg-fuchsia-100/80" />
          <div className="flex flex-wrap gap-2">
            <Skeleton className="h-6 w-24 rounded-full bg-white/80" />
            <Skeleton className="h-6 w-20 rounded-full bg-white/80" />
          </div>
        </div>
      </div>
    </div>
  );
}
