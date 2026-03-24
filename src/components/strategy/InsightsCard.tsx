"use client";

import { Check, FileText, Loader2, Upload } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { InsightData, InsightsCardData } from "@/hooks/useDocumentStore";
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
import { normalizeInsightsData } from "@/lib/strategy/artifact-edit-sync";

interface InsightsCardProps {
  data: Partial<InsightsCardData>;
  x: number;
  y: number;
  onMove?: (x: number, y: number) => void;
  onUploadMore?: () => void;
  isUploading?: boolean;
  onCommit?: (data: InsightsCardData) => void;
  isSelected?: boolean;
  onSelect?: () => void;
  onSingleClickConfirmed?: () => void;
}

export function InsightsCard({
  data,
  x,
  y,
  onMove,
  onUploadMore,
  isUploading,
  onCommit,
  isSelected = false,
  onSelect,
  onSingleClickConfirmed,
}: InsightsCardProps) {
  const {
    canEdit,
    isEditing,
    draft,
    setDraft,
    startEditing,
    cancelEditing,
    saveEditing,
  } = useEditableCard({
    value: normalizeInsightsData({
      insights: data.insights ?? [],
      documents: data.documents ?? [],
    }),
    onCommit,
    normalize: normalizeInsightsData,
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

  const hasInsights = draft.insights.length > 0;
  const hasDocs = draft.documents.length > 0;

  return (
    <div
      className={`absolute ${isEditing ? "" : "select-none"}`}
      style={{
        left: x,
        top: y,
        width: 600,
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
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50">
            <FileText className="h-4 w-4 text-blue-600" />
          </div>
          <h2 className="text-2xl font-bold text-neutral-900">Key Insights</h2>
          <span className="ml-auto rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-600">
            {draft.documents.length} doc{draft.documents.length !== 1 ? "s" : ""}
          </span>
        </div>

        {isEditing ? (
          <div className={`space-y-4 ${ARTIFACT_EDITOR_FIELDS_CLASSNAME}`}>
            {hasDocs && (
              <div className="rounded-xl border border-neutral-200/70 bg-neutral-50 p-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-500">
                  Source Documents
                </p>
                <div className="space-y-1.5">
                  {draft.documents.map((document, index) => (
                    <div key={`${document.name}-${index}`} className="flex items-center gap-2 text-sm text-neutral-600">
                      <Check className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
                      <span className="truncate">{document.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
                Insights
              </p>
              <AddListItemButton
                label="Add insight"
                onClick={() =>
                  setDraft((current) => ({
                    ...current,
                    insights: [
                      ...current.insights,
                      { id: "", insight: "", quote: "", sourceDocument: "", source: "conversation" },
                    ],
                  }))
                }
              />
            </div>

            <div className="space-y-3">
              {draft.insights.map((item, index) => (
                <div key={index} className="space-y-2 rounded-xl border border-neutral-200/80 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
                      Insight {index + 1}
                    </p>
                    <RemoveListItemButton
                      onClick={() =>
                        setDraft((current) => ({
                          ...current,
                          insights: current.insights.filter((_, insightIndex) => insightIndex !== index),
                        }))
                      }
                    />
                  </div>

                  <Textarea
                    ref={index === 0 ? firstInputRef : undefined}
                    value={item.insight}
                    placeholder="What did we learn?"
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        insights: current.insights.map((insight, insightIndex) =>
                          insightIndex === index
                            ? { ...insight, insight: event.target.value }
                            : insight
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

                  <Textarea
                    value={item.quote ?? ""}
                    placeholder="Optional supporting quote"
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        insights: current.insights.map((insight, insightIndex) =>
                          insightIndex === index
                            ? { ...insight, quote: event.target.value }
                            : insight
                        ),
                      }))
                    }
                    onKeyDown={(event) =>
                      handleEditorKeyDown(event, {
                        onSave: saveEditing,
                        onCancel: cancelEditing,
                      })
                    }
                    className="min-h-[72px] text-sm"
                  />

                  <Input
                    value={item.sourceDocument ?? ""}
                    placeholder="Source document"
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        insights: current.insights.map((insight, insightIndex) =>
                          insightIndex === index
                            ? { ...insight, sourceDocument: event.target.value }
                            : insight
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
                </div>
              ))}
            </div>

            <EditModeActions onSave={saveEditing} onCancel={cancelEditing} />
          </div>
        ) : (
          <div>
            {hasDocs && (
              <>
                <h3 className="mb-2 text-sm font-semibold uppercase tracking-wider text-neutral-500">
                  Source Documents
                </h3>
                <div className="mb-6 space-y-1.5">
                  {draft.documents.map((document, index) => (
                    <div key={`${document.name}-${index}`} className="flex items-center gap-2 text-sm text-neutral-600">
                      <Check className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
                      <span className="truncate">{document.name}</span>
                    </div>
                  ))}
                </div>
                <div className="mb-5 border-t border-neutral-200/60" />
              </>
            )}

            {hasInsights ? (
              <>
                <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-neutral-500">
                  Insights
                </h3>
                <ol className="space-y-4">
                  {draft.insights.map((item, index) => (
                    <InsightItem key={index} item={item as InsightData} index={index} />
                  ))}
                </ol>
              </>
            ) : (
              <div className="flex items-center gap-2 py-4 text-sm text-neutral-400">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>{hasDocs ? "Analyzing documents..." : "Gathering insights..."}</span>
              </div>
            )}

            {onUploadMore && (
              <>
                {(hasInsights || hasDocs) && <div className="mb-5 mt-6 border-t border-neutral-200/60" />}
                <button
                  type="button"
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={(event) => {
                    event.stopPropagation();
                    onUploadMore();
                  }}
                  disabled={isUploading}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-neutral-200 py-3 text-sm text-neutral-500 transition-colors hover:border-blue-300 hover:bg-blue-50/50 hover:text-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isUploading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Uploading...
                    </>
                  ) : (
                    <>
                      <Upload className="h-4 w-4" />
                      Upload More Documents
                    </>
                  )}
                </button>
              </>
            )}

            {canEdit && <ReadOnlyEditHint />}
          </div>
        )}
      </div>
    </div>
  );
}

function InsightItem({ item, index }: { item: InsightData; index: number }) {
  return (
    <li className="space-y-1.5">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 w-5 shrink-0 text-center text-sm font-semibold text-blue-500">
          {index + 1}
        </span>
        <p className="text-base font-medium leading-relaxed text-neutral-800">{item.insight}</p>
      </div>
      {item.quote && (
        <div className="ml-8 border-l-2 border-blue-200 py-1 pl-3">
          <p className="text-sm italic leading-relaxed text-neutral-500">&ldquo;{item.quote}&rdquo;</p>
          {item.sourceDocument && (
            <p className="mt-1 text-xs text-neutral-400">- {item.sourceDocument}</p>
          )}
        </div>
      )}
      {item.source === "conversation" && !item.quote && (
        <p className="ml-8 text-xs italic text-neutral-400">From conversation</p>
      )}
    </li>
  );
}
