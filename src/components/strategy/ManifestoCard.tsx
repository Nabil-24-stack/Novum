"use client";

import { AlertTriangle, CheckCircle2, Circle, ShieldCheck, Sparkles } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type {
  HmwData,
  JtbdData,
  ManifestoData,
} from "@/hooks/useStrategyStore";
import type {
  CoverageDisplayState,
  CoverageSummary,
  JtbdCoverage,
} from "@/lib/product-brain/types";
import type { TraceableTextItem } from "@/lib/strategy/traceable";
import { resolvePainPointsByIds } from "@/lib/strategy/pain-points";
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
import { normalizeManifestoData } from "@/lib/strategy/artifact-edit-sync";

interface ManifestoCardProps {
  manifestoData: Partial<ManifestoData>;
  x: number;
  y: number;
  onMove?: (x: number, y: number) => void;
  jtbdCoverage?: JtbdCoverage[];
  coverageSummary?: CoverageSummary | null;
  coverageDisplayState: CoverageDisplayState;
  coverageProgressNote?: string | null;
  onAddressGaps?: () => void;
  onCommit?: (manifestoData: ManifestoData) => void;
  isSelected?: boolean;
  onSelect?: () => void;
  onSingleClickConfirmed?: () => void;
}

export function ManifestoCard({
  manifestoData,
  x,
  y,
  onMove,
  jtbdCoverage,
  coverageSummary,
  coverageDisplayState,
  coverageProgressNote,
  onAddressGaps,
  onCommit,
  isSelected = false,
  onSelect,
  onSingleClickConfirmed,
}: ManifestoCardProps) {
  const showStrategyCoverage = false;
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
  const firstInputRef = useFocusWhenEditing<HTMLInputElement>(isEditing);
  const painPoints = draft.painPoints ?? [];
  const jtbd = draft.jtbd ?? [];
  const hmw = draft.hmw ?? [];

  const hasTitle = Boolean(draft.title.trim());
  const hasProblem = Boolean(draft.problemStatement.trim());
  const hasUser = Boolean(draft.targetUser.trim());
  const hasEnvironmentContext = Boolean(draft.environmentContext.trim());
  const hasPainPoints = painPoints.length > 0;
  const hasJtbd = jtbd.length > 0;
  const hasHmw = hmw.length > 0;

  return (
    <div
      className={`absolute ${isEditing ? "" : "select-none"}`}
      style={{
        left: x,
        top: y,
        width: 640,
        touchAction: isEditing ? undefined : "none",
      }}
      {...cardInteractionProps}
    >
      <div
        className={`rounded-2xl border border-neutral-200/60 bg-white/90 p-8 shadow-lg backdrop-blur-sm ${ARTIFACT_IDLE_CARD_CLASSNAME} ${
          isSelected ? ARTIFACT_SELECTED_CARD_CLASSNAME : ""
        } ${!isEditing ? (isDragging ? "cursor-grabbing" : "cursor-grab") : ""}`}
      >
        <div className="mb-6">
          <div>
            <h2 className="text-2xl font-bold text-neutral-900">Overview</h2>
            {hasTitle && <p className="mt-1 text-sm text-neutral-500">{draft.title}</p>}
          </div>
        </div>

        {isEditing ? (
          <div className={`space-y-4 ${ARTIFACT_EDITOR_FIELDS_CLASSNAME}`}>
            <Input
              ref={firstInputRef}
              value={draft.title}
              placeholder="Product title"
              onChange={(event) =>
                setDraft((current) => ({ ...current, title: event.target.value }))
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
              value={draft.problemStatement}
              placeholder="The problem"
              onChange={(event) =>
                setDraft((current) => ({ ...current, problemStatement: event.target.value }))
              }
              onKeyDown={(event) =>
                handleEditorKeyDown(event, {
                  onSave: saveEditing,
                  onCancel: cancelEditing,
                })
              }
              className="min-h-[96px] text-sm"
            />

            <Textarea
              value={draft.targetUser}
              placeholder="Who will use this"
              onChange={(event) =>
                setDraft((current) => ({ ...current, targetUser: event.target.value }))
              }
              onKeyDown={(event) =>
                handleEditorKeyDown(event, {
                  onSave: saveEditing,
                  onCancel: cancelEditing,
                })
              }
              className="min-h-[80px] text-sm"
            />

            <Textarea
              value={draft.environmentContext}
              placeholder="Where and how the user encounters this problem"
              onChange={(event) =>
                setDraft((current) => ({ ...current, environmentContext: event.target.value }))
              }
              onKeyDown={(event) =>
                handleEditorKeyDown(event, {
                  onSave: saveEditing,
                  onCancel: cancelEditing,
                })
              }
              className="min-h-[80px] text-sm"
            />

            <EditableTraceableList
              label="Canonical Pain Points"
              values={painPoints}
              addLabel="Add pain point"
              onChange={(painPoints) => setDraft((current) => ({ ...current, painPoints }))}
              onSave={saveEditing}
              onCancel={cancelEditing}
            />

            <EditableJtbdList
              values={jtbd}
              painPointOptions={painPoints}
              onChange={(jtbd) => setDraft((current) => ({ ...current, jtbd }))}
              onSave={saveEditing}
              onCancel={cancelEditing}
            />

            <EditableHmwList
              values={hmw}
              jtbdOptions={jtbd}
              painPointOptions={painPoints}
              onChange={(hmw) => setDraft((current) => ({ ...current, hmw }))}
              onSave={saveEditing}
              onCancel={cancelEditing}
            />

            <EditModeActions onSave={saveEditing} onCancel={cancelEditing} />
          </div>
        ) : (
          <div>
            {hasProblem && (
              <>
                <h3 className="mb-2 text-sm font-semibold uppercase tracking-wider text-neutral-500">
                  The Problem
                </h3>
                <p className="mb-6 text-base leading-relaxed text-neutral-600">
                  {draft.problemStatement}
                </p>
              </>
            )}

            {hasProblem && hasUser && <div className="mb-5 border-t border-neutral-200/60" />}

            {hasUser && (
              <>
                <h3 className="mb-2 text-sm font-semibold uppercase tracking-wider text-neutral-500">
                  Who Will Use This
                </h3>
                <p className="mb-6 text-base leading-relaxed text-neutral-700">{draft.targetUser}</p>
              </>
            )}

            {(hasUser || hasEnvironmentContext) && hasPainPoints && <div className="mb-5 border-t border-neutral-200/60" />}

            {hasEnvironmentContext && (
              <>
                <h3 className="mb-2 text-sm font-semibold uppercase tracking-wider text-neutral-500">
                  Environment / Usage Context
                </h3>
                <p className="mb-6 text-base leading-relaxed text-neutral-700">{draft.environmentContext}</p>
              </>
            )}

            {hasPainPoints && (
              <>
                <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-neutral-500">
                  Canonical Pain Points
                </h3>
                <ul className="space-y-2">
                  {painPoints.map((painPoint) => (
                    <li key={painPoint.id} className="text-sm leading-relaxed text-neutral-700">
                      {painPoint.text}
                    </li>
                  ))}
                </ul>
              </>
            )}

            {(hasPainPoints || hasUser) && hasJtbd && <div className="mb-5 mt-6 border-t border-neutral-200/60" />}

            {hasJtbd && (
              <>
                <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-neutral-500">
                  What {draft.targetUser || "Users"} Need To Get Done
                </h3>
                <ol className="space-y-3">
                  {jtbd.map((job, index) => {
                    const isAddressed = jtbdCoverage?.[index]?.addressed;
                    const linkedPainPoints = resolvePainPointsByIds(job.painPointIds, draft);
                    return (
                      <li key={job.id} className="flex items-start gap-3">
                        {isAddressed ? (
                          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 fill-emerald-500 text-emerald-500 transition-colors duration-500" />
                        ) : (
                          <Circle
                            className={`mt-0.5 h-5 w-5 shrink-0 ${
                              coverageDisplayState === "pending"
                                ? "text-emerald-500"
                                : "text-neutral-300"
                            }`}
                          />
                        )}
                        <div className="min-w-0">
                          <span
                            className={`text-base leading-relaxed transition-colors duration-500 ${
                              isAddressed
                                ? "text-neutral-400 line-through decoration-neutral-300"
                                : "text-neutral-700"
                            }`}
                          >
                            {job.text}
                          </span>
                          {linkedPainPoints.length > 0 && (
                            <div className="mt-1 flex flex-wrap gap-1.5">
                              {linkedPainPoints.map((painPoint) => (
                                <span
                                  key={painPoint.id}
                                  className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700"
                                >
                                  {painPoint.text}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </>
            )}

            {(hasJtbd || hasUser) && hasHmw && <div className="mb-5 mt-6 border-t border-neutral-200/60" />}

            {hasHmw && (
              <>
                <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-neutral-500">
                  How Might We
                </h3>
                <ol className="space-y-3">
                  {hmw.map((question, index) => {
                    const linkedPainPoints = resolvePainPointsByIds(question.painPointIds, draft);
                    return (
                      <li key={question.id} className="flex items-start gap-3">
                        <span className="mt-0.5 w-5 shrink-0 text-center text-sm font-semibold text-amber-500">
                          {index + 1}
                        </span>
                        <div className="min-w-0">
                          <span className="text-base italic leading-relaxed text-neutral-700">
                            {question.text}
                          </span>
                          <div className="mt-1 flex flex-wrap gap-1.5">
                            {(question.jtbdIds ?? []).map((jtbdId) => {
                              const linkedJtbd = jtbd.find((item) => item.id === jtbdId);
                              if (!linkedJtbd) return null;
                              return (
                                <span
                                  key={jtbdId}
                                  className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-700"
                                >
                                  {linkedJtbd.text}
                                </span>
                              );
                            })}
                            {linkedPainPoints.map((painPoint) => (
                              <span
                                key={painPoint.id}
                                className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700"
                              >
                                {painPoint.text}
                              </span>
                            ))}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </>
            )}

            {showStrategyCoverage && hasTitle && hasProblem && hasUser && hasJtbd && hasHmw && (
              <>
                <div className="mb-5 mt-6 border-t border-neutral-200/60" />

                <div className="mb-5 flex items-center gap-2.5">
                  <ShieldCheck className="h-5 w-5 shrink-0 text-emerald-500" />
                  <h3 className="text-sm font-semibold uppercase tracking-wider text-neutral-500">
                    Strategy Coverage
                  </h3>
                </div>

                {coverageDisplayState === "ready" && coverageSummary ? (
                  <>
                    <div className="mb-5 text-center">
                      <span
                        className={`text-5xl font-bold ${
                          coverageSummary.overallPercent >= 80
                            ? "text-emerald-600"
                            : coverageSummary.overallPercent >= 50
                              ? "text-amber-600"
                              : "text-neutral-400"
                        }`}
                      >
                        {coverageSummary.overallPercent}%
                      </span>
                      <p className="mt-1 text-sm text-neutral-500">of jobs-to-be-done addressed</p>
                      {coverageProgressNote && (
                        <p className="mt-2 text-xs text-neutral-400">{coverageProgressNote}</p>
                      )}
                    </div>

                    {coverageSummary.personaCoverage.length > 0 && (
                      <div className="mb-5">
                        <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-neutral-500">
                          Per Persona
                        </h4>
                        <div className="space-y-3">
                          {coverageSummary.personaCoverage.map((personaCoverage) => (
                            <div key={personaCoverage.personaName}>
                              <div className="mb-1 flex items-center justify-between">
                                <span className="truncate text-sm font-medium text-neutral-700">
                                  {personaCoverage.personaName}
                                </span>
                                <span className="ml-2 shrink-0 text-xs font-semibold text-neutral-500">
                                  {personaCoverage.coveragePercent}%
                                </span>
                              </div>
                              <div className="h-1.5 overflow-hidden rounded-full bg-neutral-100">
                                <div
                                  className="h-full rounded-full bg-emerald-400 transition-all duration-500"
                                  style={{ width: `${personaCoverage.coveragePercent}%` }}
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {coverageSummary.gaps.length > 0 && (
                      <>
                        <div className="mb-4 border-t border-neutral-200/60" />
                        <div className="mb-4">
                          <h4 className="mb-2.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-neutral-500">
                            <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                            Unaddressed
                          </h4>
                          <ul className="space-y-2">
                            {coverageSummary.gaps.map((gap, gapIndex) => (
                              <li
                                key={gapIndex}
                                className="relative pl-5 text-sm leading-relaxed text-neutral-600"
                              >
                                <span className="absolute left-0 top-1.5 h-1.5 w-1.5 rounded-full bg-amber-400" />
                                {gap}
                              </li>
                            ))}
                          </ul>
                        </div>

                        {onAddressGaps && (
                          <button
                            type="button"
                            onPointerDown={(event) => event.stopPropagation()}
                            onClick={(event) => {
                              event.stopPropagation();
                              onAddressGaps();
                            }}
                            className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-emerald-700"
                          >
                            <Sparkles className="h-4 w-4" />
                            Address gaps
                          </button>
                        )}
                      </>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-neutral-400">
                    Coverage insights will appear once annotations are available.
                  </p>
                )}
              </>
            )}

            {canEdit && <ReadOnlyEditHint />}
          </div>
        )}
      </div>
    </div>
  );
}

function EditableTraceableList(props: {
  label: string;
  values: TraceableTextItem[];
  addLabel: string;
  onChange: (values: TraceableTextItem[]) => void;
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
          onClick={() => onChange([...values, { id: "", text: "" }])}
        />
      </div>
      <div className="space-y-2">
        {values.map((value, index) => (
          <div key={value.id || index} className="flex items-start gap-2">
            <Textarea
              value={value.text}
              placeholder={`${label} ${index + 1}`}
              onChange={(event) =>
                onChange(
                  values.map((item, itemIndex) =>
                    itemIndex === index ? { ...item, text: event.target.value } : item
                  )
                )
              }
              onKeyDown={(event) =>
                handleEditorKeyDown(event, {
                  onSave,
                  onCancel,
                })
              }
              className="min-h-[72px] flex-1 text-sm"
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

function EditableJtbdList(props: {
  values: JtbdData[];
  painPointOptions: TraceableTextItem[];
  onChange: (values: JtbdData[]) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const { values, painPointOptions, onChange, onSave, onCancel } = props;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">Jobs To Be Done</p>
        <AddListItemButton
          label="Add JTBD"
          onClick={() => onChange([...values, { id: "", text: "", painPointIds: [] }])}
        />
      </div>
      <div className="space-y-3">
        {values.map((value, index) => (
          <div key={value.id || index} className="space-y-2 rounded-lg border border-neutral-200 bg-neutral-50/70 p-3">
            <div className="flex items-start gap-2">
              <Textarea
                value={value.text}
                placeholder={`JTBD ${index + 1}`}
                onChange={(event) =>
                  onChange(
                    values.map((item, itemIndex) =>
                      itemIndex === index ? { ...item, text: event.target.value } : item
                    )
                  )
                }
                onKeyDown={(event) =>
                  handleEditorKeyDown(event, {
                    onSave,
                    onCancel,
                  })
                }
                className="min-h-[72px] flex-1 text-sm"
              />
              <RemoveListItemButton
                onClick={() => onChange(values.filter((_, itemIndex) => itemIndex !== index))}
              />
            </div>
            <CheckboxSelector
              label="Source pain points"
              description="Link this JTBD to the canonical pain points it synthesizes."
              options={painPointOptions.map((painPoint) => ({
                id: painPoint.id,
                label: painPoint.text,
              }))}
              selectedIds={value.painPointIds ?? []}
              onChange={(painPointIds) =>
                onChange(
                  values.map((item, itemIndex) =>
                    itemIndex === index ? { ...item, painPointIds } : item
                  )
                )
              }
              containerClassName="rounded-lg border border-neutral-200 bg-white p-3"
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function EditableHmwList(props: {
  values: HmwData[];
  jtbdOptions: JtbdData[];
  painPointOptions: TraceableTextItem[];
  onChange: (values: HmwData[]) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const { values, jtbdOptions, painPointOptions, onChange, onSave, onCancel } = props;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">How Might We</p>
        <AddListItemButton
          label="Add HMW"
          onClick={() => onChange([...values, { id: "", text: "", jtbdIds: [], painPointIds: [] }])}
        />
      </div>
      <div className="space-y-3">
        {values.map((value, index) => (
          <div key={value.id || index} className="space-y-2 rounded-lg border border-neutral-200 bg-neutral-50/70 p-3">
            <div className="flex items-start gap-2">
              <Textarea
                value={value.text}
                placeholder={`HMW ${index + 1}`}
                onChange={(event) =>
                  onChange(
                    values.map((item, itemIndex) =>
                      itemIndex === index ? { ...item, text: event.target.value } : item
                    )
                  )
                }
                onKeyDown={(event) =>
                  handleEditorKeyDown(event, {
                    onSave,
                    onCancel,
                  })
                }
                className="min-h-[72px] flex-1 text-sm"
              />
              <RemoveListItemButton
                onClick={() => onChange(values.filter((_, itemIndex) => itemIndex !== index))}
              />
            </div>
            <CheckboxSelector
              label="Linked JTBDs"
              description="Connect this HMW to the JTBDs it reframes."
              options={jtbdOptions.map((jtbd) => ({
                id: jtbd.id,
                label: jtbd.text,
              }))}
              selectedIds={value.jtbdIds ?? []}
              onChange={(jtbdIds) =>
                onChange(
                  values.map((item, itemIndex) =>
                    itemIndex === index ? { ...item, jtbdIds } : item
                  )
                )
              }
              containerClassName="rounded-lg border border-neutral-200 bg-white p-3"
            />
            <CheckboxSelector
              label="Linked pain points"
              description="Connect this HMW to the canonical pain points it opens up."
              options={painPointOptions.map((painPoint) => ({
                id: painPoint.id,
                label: painPoint.text,
              }))}
              selectedIds={value.painPointIds ?? []}
              onChange={(painPointIds) =>
                onChange(
                  values.map((item, itemIndex) =>
                    itemIndex === index ? { ...item, painPointIds } : item
                  )
                )
              }
              containerClassName="rounded-lg border border-neutral-200 bg-white p-3"
            />
          </div>
        ))}
      </div>
    </div>
  );
}
