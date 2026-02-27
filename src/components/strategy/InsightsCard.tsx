"use client";

import { useCallback, useState, type PointerEvent } from "react";
import { FileText, Check, Upload, Loader2 } from "lucide-react";
import { useCanvasScale } from "@/components/canvas/InfiniteCanvas";
import type { InsightsCardData, InsightData } from "@/hooks/useDocumentStore";

interface InsightsCardProps {
  data: Partial<InsightsCardData>;
  x: number;
  y: number;
  onMove?: (x: number, y: number) => void;
  onUploadMore?: () => void;
  isUploading?: boolean;
}

export function InsightsCard({ data, x, y, onMove, onUploadMore, isUploading }: InsightsCardProps) {
  const canvasScale = useCanvasScale();
  const [isDragging, setIsDragging] = useState(false);

  const handlePointerDown = useCallback((e: PointerEvent<HTMLDivElement>) => {
    if (!onMove) return;
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    setIsDragging(true);
  }, [onMove]);

  const handlePointerMove = useCallback((e: PointerEvent<HTMLDivElement>) => {
    if (!isDragging || !onMove) return;
    onMove(x + e.movementX / canvasScale, y + e.movementY / canvasScale);
  }, [isDragging, onMove, x, y, canvasScale]);

  const handlePointerUp = useCallback((e: PointerEvent<HTMLDivElement>) => {
    e.currentTarget.releasePointerCapture(e.pointerId);
    setIsDragging(false);
  }, []);

  const insights = data.insights ?? [];
  const documents = data.documents ?? [];
  const hasInsights = insights.length > 0;
  const hasDocs = documents.length > 0;

  return (
    <div
      className={`absolute select-none ${
        isDragging ? "cursor-grabbing" : onMove ? "cursor-grab" : ""
      }`}
      style={{
        left: x,
        top: y,
        width: 600,
        touchAction: onMove ? "none" : undefined,
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      <div className="bg-white/90 backdrop-blur-sm border border-neutral-200/60 shadow-lg rounded-2xl p-8">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
            <FileText className="w-4 h-4 text-blue-600" />
          </div>
          <h2 className="text-2xl font-bold text-neutral-900">Key Insights</h2>
          <span className="ml-auto text-xs font-medium bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full">
            {documents.length} doc{documents.length !== 1 ? "s" : ""}
          </span>
        </div>

        {/* Source Documents */}
        {hasDocs && (
          <>
            <h3 className="text-sm font-semibold text-neutral-500 uppercase tracking-wider mb-2">
              Source Documents
            </h3>
            <div className="space-y-1.5 mb-6">
              {documents.map((doc, i) => (
                <div key={i} className="flex items-center gap-2 text-sm text-neutral-600">
                  <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                  <span className="truncate">{doc.name}</span>
                </div>
              ))}
            </div>
            <div className="border-t border-neutral-200/60 mb-5" />
          </>
        )}

        {/* Insights List */}
        {hasInsights && (
          <>
            <h3 className="text-sm font-semibold text-neutral-500 uppercase tracking-wider mb-3">
              Insights
            </h3>
            <ol className="space-y-4">
              {insights.map((item, index) => (
                <InsightItem key={index} item={item as InsightData} index={index} />
              ))}
            </ol>
          </>
        )}

        {/* Streaming placeholder */}
        {!hasInsights && (
          <div className="flex items-center gap-2 text-sm text-neutral-400 py-4">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>{hasDocs ? "Analyzing documents..." : "Gathering insights..."}</span>
          </div>
        )}

        {/* Upload More Button */}
        {onUploadMore && (
          <>
            {(hasInsights || hasDocs) && (
              <div className="border-t border-neutral-200/60 mt-6 mb-5" />
            )}
            <button
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                onUploadMore();
              }}
              disabled={isUploading}
              className="w-full py-3 border-2 border-dashed border-neutral-200 rounded-xl text-sm text-neutral-500 hover:border-blue-300 hover:text-blue-600 hover:bg-blue-50/50 transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isUploading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Uploading...
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4" />
                  Upload More Documents
                </>
              )}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function InsightItem({ item, index }: { item: InsightData; index: number }) {
  return (
    <li className="space-y-1.5">
      <div className="flex items-start gap-3">
        <span className="text-sm font-semibold text-blue-500 mt-0.5 shrink-0 w-5 text-center">
          {index + 1}
        </span>
        <p className="text-base font-medium text-neutral-800 leading-relaxed">
          {item.insight}
        </p>
      </div>
      {item.quote && (
        <div className="ml-8 border-l-2 border-blue-200 pl-3 py-1">
          <p className="text-sm text-neutral-500 italic leading-relaxed">
            &ldquo;{item.quote}&rdquo;
          </p>
          {item.sourceDocument && (
            <p className="text-xs text-neutral-400 mt-1">
              — {item.sourceDocument}
            </p>
          )}
        </div>
      )}
      {item.source === "conversation" && !item.quote && (
        <p className="ml-8 text-xs text-neutral-400 italic">From conversation</p>
      )}
    </li>
  );
}
