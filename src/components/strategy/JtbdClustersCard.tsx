"use client";

import { Briefcase } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import type { ManifestoData } from "@/hooks/useStrategyStore";
import {
  buildJtbdClusterViewModels,
  JTBD_CLUSTER_EMPTY_PAIN_POINTS_TEXT,
} from "@/lib/strategy/jtbd-clusters";
import {
  ARTIFACT_IDLE_CARD_CLASSNAME,
  ARTIFACT_SELECTED_CARD_CLASSNAME,
  useArtifactCardInteraction,
} from "@/components/strategy/editing";

interface JtbdClustersCardProps {
  manifestoData: Partial<ManifestoData>;
  visibleClusterCount?: number;
  x: number;
  y: number;
  onMove?: (x: number, y: number) => void;
  isSelected?: boolean;
  onSelect?: () => void;
  onSingleClickConfirmed?: () => void;
}

export function JtbdClustersCard({
  manifestoData,
  visibleClusterCount,
  x,
  y,
  onMove,
  isSelected = false,
  onSelect,
  onSingleClickConfirmed,
}: JtbdClustersCardProps) {
  const { isDragging, cardInteractionProps } = useArtifactCardInteraction({
    x,
    y,
    isEditing: false,
    onMove,
    onSelect,
    onSingleClickConfirmed,
  });
  const jtbdClusters = buildJtbdClusterViewModels(manifestoData);
  const revealedClusterCount = visibleClusterCount === undefined
    ? jtbdClusters.length
    : Math.min(visibleClusterCount, jtbdClusters.length);
  const shouldShowStreamingPlaceholder = visibleClusterCount !== undefined && revealedClusterCount < Math.max(1, jtbdClusters.length);

  return (
    <div
      className="absolute select-none"
      style={{ left: x, top: y, width: 560, touchAction: "none" }}
      {...cardInteractionProps}
    >
      <div
        className={`rounded-2xl border border-neutral-200/60 bg-white/90 p-8 shadow-lg backdrop-blur-sm ${ARTIFACT_IDLE_CARD_CLASSNAME} ${
          isSelected ? ARTIFACT_SELECTED_CARD_CLASSNAME : ""
        } ${isDragging ? "cursor-grabbing" : "cursor-grab"}`}
      >
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50">
            <Briefcase className="h-4 w-4 text-blue-600" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-neutral-900">JTBD Clusters</h2>
            <p className="text-sm text-neutral-500">
              Pain points grouped into the jobs users need done
            </p>
          </div>
          <span className="ml-auto rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-600">
            {jtbdClusters.length}
          </span>
        </div>

        <div className="space-y-3">
          {jtbdClusters.length > 0 || visibleClusterCount !== undefined ? (
            <>
              {jtbdClusters.slice(0, revealedClusterCount).map((jtbd) => (
                <div
                  key={jtbd.key}
                  className="rounded-2xl border border-blue-100 bg-blue-50/60 p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-blue-600">
                        {jtbd.label}
                      </p>
                      <p className="mt-1 text-sm font-medium leading-relaxed text-neutral-800">
                        {jtbd.text}
                      </p>
                    </div>
                    <span className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-neutral-500">
                      {jtbd.personaCount} persona{jtbd.personaCount === 1 ? "" : "s"}
                    </span>
                  </div>

                  <div className="mt-3">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-500">
                      Linked Pain Points
                    </p>
                    {jtbd.painPoints.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {jtbd.painPoints.map((painPoint) => (
                          <span
                            key={`pain-point-${painPoint.id}`}
                            className="rounded-full bg-rose-100 px-2.5 py-1 text-xs font-medium text-rose-700"
                          >
                            {painPoint.text}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-neutral-500">
                        {JTBD_CLUSTER_EMPTY_PAIN_POINTS_TEXT}
                      </p>
                    )}
                  </div>
                </div>
              ))}
              {shouldShowStreamingPlaceholder && <JtbdClusterPlaceholder />}
            </>
          ) : (
            <div className="rounded-2xl border border-dashed border-neutral-200 bg-neutral-50/60 p-4 text-sm text-neutral-500">
              JTBD clusters will appear here once the manifesto is generated.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function JtbdClusterPlaceholder() {
  return (
    <div className="rounded-2xl border border-blue-100 bg-blue-50/40 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-2">
          <Skeleton className="h-3 w-16 bg-blue-100/80" />
          <Skeleton className="h-4 w-full bg-blue-100/80" />
          <Skeleton className="h-4 w-5/6 bg-blue-100/80" />
        </div>
        <Skeleton className="h-6 w-20 rounded-full bg-white/80" />
      </div>

      <div className="mt-3 space-y-2">
        <Skeleton className="h-3 w-28 bg-blue-100/80" />
        <div className="flex flex-wrap gap-2">
          <Skeleton className="h-6 w-28 rounded-full bg-white/80" />
          <Skeleton className="h-6 w-24 rounded-full bg-white/80" />
        </div>
      </div>
    </div>
  );
}
