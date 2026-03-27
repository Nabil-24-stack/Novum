"use client";

import { useMemo } from "react";
import { AlertCircle, Check, FileText, Loader2, Upload } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import type { InsightData, InsightsCardData } from "@/hooks/useDocumentStore";
import type { ManifestoData } from "@/hooks/useStrategyStore";
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

interface PainPointsCardProps {
  data: Partial<InsightsCardData>;
  manifestoData?: Partial<ManifestoData> | null;
  visiblePainPointCount?: number;
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

const STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "by",
  "for",
  "from",
  "how",
  "in",
  "into",
  "is",
  "it",
  "of",
  "on",
  "or",
  "that",
  "the",
  "their",
  "there",
  "they",
  "this",
  "to",
  "we",
  "when",
  "with",
]);

function tokenize(value: string): string[] {
  return [...new Set(
    value
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .map((token) => token.trim())
      .filter((token) => token.length > 2 && !STOPWORDS.has(token))
  )];
}

function getEvidenceScore(painPointText: string, insight: InsightData): number {
  const haystack = `${insight.insight} ${insight.quote ?? ""}`.toLowerCase();
  const normalizedPainPoint = painPointText.toLowerCase();
  if (normalizedPainPoint && haystack.includes(normalizedPainPoint)) {
    return 100;
  }

  const painTokens = tokenize(painPointText);
  if (painTokens.length === 0) return 0;
  const evidenceTokens = new Set(tokenize(haystack));
  return painTokens.filter((token) => evidenceTokens.has(token)).length;
}

export function PainPointsCard({
  data,
  manifestoData = null,
  visiblePainPointCount,
  x,
  y,
  onMove,
  onUploadMore,
  isUploading,
  onCommit,
  isSelected = false,
  onSelect,
  onSingleClickConfirmed,
}: PainPointsCardProps) {
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

  const canonicalPainPoints = useMemo(
    () => manifestoData?.painPoints ?? [],
    [manifestoData],
  );
  const evidenceMap = useMemo(() => {
    return new Map(
      canonicalPainPoints.map((painPoint) => {
        const matches = draft.insights
          .map((insight) => ({ insight, score: getEvidenceScore(painPoint.text, insight) }))
          .filter((candidate) => candidate.score > 0)
          .sort((a, b) => b.score - a.score)
          .slice(0, 2)
          .map((candidate) => candidate.insight);
        return [painPoint.id, matches];
      })
    );
  }, [canonicalPainPoints, draft.insights]);
  const matchedEvidenceIds = useMemo(
    () => new Set([...evidenceMap.values()].flat().map((insight) => insight.id)),
    [evidenceMap]
  );
  const unmatchedInsights = useMemo(
    () => draft.insights.filter((insight) => !matchedEvidenceIds.has(insight.id)).slice(0, 3),
    [draft.insights, matchedEvidenceIds]
  );
  const hasPainPoints = canonicalPainPoints.length > 0;
  const hasInsights = draft.insights.length > 0;
  const hasDocs = draft.documents.length > 0;
  const totalRevealItems = hasPainPoints
    ? Math.max(1, canonicalPainPoints.length)
    : Math.max(1, draft.insights.length);
  const revealedPainPointCount = visiblePainPointCount === undefined
    ? (hasPainPoints ? canonicalPainPoints.length : draft.insights.length)
    : Math.min(visiblePainPointCount, hasPainPoints ? canonicalPainPoints.length : draft.insights.length);
  const shouldShowStreamingPlaceholder = visiblePainPointCount !== undefined && revealedPainPointCount < totalRevealItems;
  const shouldShowSupplementarySections = visiblePainPointCount === undefined || !shouldShowStreamingPlaceholder;

  return (
    <div
      className={`absolute ${isEditing ? "" : "select-none"}`}
      style={{
        left: x,
        top: y,
        width: 620,
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
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-rose-50">
            <AlertCircle className="h-4 w-4 text-rose-600" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-neutral-900">Pain Points</h2>
            <p className="text-sm text-neutral-500">
              Canonical pains anchored in research evidence
            </p>
          </div>
          <span className="ml-auto rounded-full bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-600">
            {hasPainPoints ? canonicalPainPoints.length : draft.insights.length}
          </span>
        </div>

        {isEditing ? (
          <div className={`space-y-4 ${ARTIFACT_EDITOR_FIELDS_CLASSNAME}`}>
            {hasPainPoints && (
              <div className="rounded-xl border border-neutral-200/70 bg-neutral-50 p-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-500">
                  Canonical Pain Points
                </p>
                <div className="flex flex-wrap gap-2">
                  {canonicalPainPoints.map((painPoint) => (
                    <span
                      key={painPoint.id}
                      className="rounded-full bg-rose-100 px-2.5 py-1 text-xs font-medium text-rose-700"
                    >
                      {painPoint.text}
                    </span>
                  ))}
                </div>
              </div>
            )}

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
                Research Evidence
              </p>
              <AddListItemButton
                label="Add evidence"
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
                      Evidence {index + 1}
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
            {hasPainPoints ? (
              <>
                <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-neutral-500">
                  Canonical Pain Points
                </h3>
                <div className="space-y-4">
                  {canonicalPainPoints.slice(0, revealedPainPointCount).map((painPoint, index) => (
                    <PainPointItem
                      key={painPoint.id}
                      index={index}
                      text={painPoint.text}
                      evidence={evidenceMap.get(painPoint.id) ?? []}
                    />
                  ))}
                  {shouldShowStreamingPlaceholder && <PainPointItemPlaceholder />}
                </div>
              </>
            ) : hasInsights ? (
              <>
                <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-neutral-500">
                  Surfaced Pain Signals
                </h3>
                <ol className="space-y-4">
                  {draft.insights.slice(0, revealedPainPointCount).map((item, index) => (
                    <EvidenceItem key={item.id || index} item={item} index={index} />
                  ))}
                  {shouldShowStreamingPlaceholder && <EvidenceItemPlaceholder />}
                </ol>
              </>
            ) : visiblePainPointCount !== undefined ? (
              <div className="space-y-4">
                <PainPointItemPlaceholder />
              </div>
            ) : (
              <div className="flex items-center gap-2 py-4 text-sm text-neutral-400">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>{hasDocs ? "Clustering raw pains from research..." : "Listening for pain points..."}</span>
              </div>
            )}

            {shouldShowSupplementarySections && unmatchedInsights.length > 0 && hasPainPoints && (
              <>
                <div className="mb-5 mt-6 border-t border-neutral-200/60" />
                <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-neutral-500">
                  Additional Research Evidence
                </h3>
                <ol className="space-y-4">
                  {unmatchedInsights.map((item, index) => (
                    <EvidenceItem key={item.id || index} item={item} index={index} />
                  ))}
                </ol>
              </>
            )}

            {shouldShowSupplementarySections && hasDocs && (
              <>
                <div className="mb-5 mt-6 border-t border-neutral-200/60" />
                <h3 className="mb-2 text-sm font-semibold uppercase tracking-wider text-neutral-500">
                  Source Documents
                </h3>
                <div className="space-y-1.5">
                  {draft.documents.map((document, index) => (
                    <div key={`${document.name}-${index}`} className="flex items-center gap-2 text-sm text-neutral-600">
                      <FileText className="h-3.5 w-3.5 shrink-0 text-neutral-400" />
                      <span className="truncate">{document.name}</span>
                    </div>
                  ))}
                </div>
              </>
            )}

            {onUploadMore && (
              <>
                {(hasPainPoints || hasInsights || hasDocs) && <div className="mb-5 mt-6 border-t border-neutral-200/60" />}
                <button
                  type="button"
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={(event) => {
                    event.stopPropagation();
                    onUploadMore();
                  }}
                  disabled={isUploading}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-neutral-200 py-3 text-sm text-neutral-500 transition-colors hover:border-rose-300 hover:bg-rose-50/50 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-50"
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

function PainPointItem({
  index,
  text,
  evidence,
}: {
  index: number;
  text: string;
  evidence: InsightData[];
}) {
  return (
    <div className="rounded-2xl border border-rose-100 bg-rose-50/60 p-4">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 w-5 shrink-0 text-center text-sm font-semibold text-rose-500">
          {index + 1}
        </span>
        <div className="min-w-0 space-y-3">
          <p className="text-base font-medium leading-relaxed text-neutral-800">{text}</p>
          {evidence.length > 0 ? (
            <div className="space-y-2">
              {evidence.map((item) => (
                <div key={item.id} className="rounded-xl border border-white/80 bg-white/80 p-3">
                  <p className="text-sm leading-relaxed text-neutral-600">{item.insight}</p>
                  {item.quote && (
                    <p className="mt-2 text-sm italic text-neutral-500">&ldquo;{item.quote}&rdquo;</p>
                  )}
                  {(item.sourceDocument || item.source === "conversation") && (
                    <p className="mt-2 text-xs text-neutral-400">
                      {item.sourceDocument || "Conversation evidence"}
                    </p>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs italic text-neutral-400">
              Waiting for supporting evidence to be linked.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function PainPointItemPlaceholder() {
  return (
    <div className="rounded-2xl border border-rose-100 bg-rose-50/40 p-4">
      <div className="flex items-start gap-3">
        <Skeleton className="mt-0.5 h-4 w-5 bg-rose-100/80" />
        <div className="min-w-0 flex-1 space-y-3">
          <Skeleton className="h-4 w-full bg-rose-100/80" />
          <Skeleton className="h-4 w-5/6 bg-rose-100/80" />
          <div className="rounded-xl border border-white/80 bg-white/80 p-3">
            <Skeleton className="h-4 w-full bg-neutral-200/80" />
            <Skeleton className="mt-2 h-4 w-4/5 bg-neutral-200/80" />
          </div>
        </div>
      </div>
    </div>
  );
}

function EvidenceItem({ item, index }: { item: InsightData; index: number }) {
  return (
    <li className="space-y-1.5">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 w-5 shrink-0 text-center text-sm font-semibold text-rose-500">
          {index + 1}
        </span>
        <p className="text-base font-medium leading-relaxed text-neutral-800">{item.insight}</p>
      </div>
      {item.quote && (
        <div className="ml-8 border-l-2 border-rose-200 py-1 pl-3">
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

function EvidenceItemPlaceholder() {
  return (
    <li className="space-y-1.5">
      <div className="flex items-start gap-3">
        <Skeleton className="mt-0.5 h-4 w-5 bg-rose-100/80" />
        <div className="min-w-0 flex-1 space-y-2">
          <Skeleton className="h-4 w-full bg-rose-100/80" />
          <Skeleton className="h-4 w-5/6 bg-rose-100/80" />
        </div>
      </div>
      <div className="ml-8 border-l-2 border-rose-200 py-1 pl-3">
        <Skeleton className="h-4 w-5/6 bg-neutral-200/80" />
      </div>
    </li>
  );
}
