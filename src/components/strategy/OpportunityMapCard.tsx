"use client";

import { ArrowRightLeft, Sparkles, Users2 } from "lucide-react";
import type { ManifestoData, PersonaData } from "@/hooks/useStrategyStore";
import {
  artifactCardLayout,
  getOpportunityMapCardWidth,
  getOpportunityMapColumnCount,
} from "@/lib/strategy/artifact-card-layout";
import {
  ARTIFACT_IDLE_CARD_CLASSNAME,
  ARTIFACT_SELECTED_CARD_CLASSNAME,
  useArtifactCardInteraction,
} from "@/components/strategy/editing";

interface OpportunityMapCardProps {
  manifestoData: Partial<ManifestoData>;
  personaData?: PersonaData[] | null;
  x: number;
  y: number;
  onMove?: (x: number, y: number) => void;
  isSelected?: boolean;
  onSelect?: () => void;
  onSingleClickConfirmed?: () => void;
}

export function OpportunityMapCard({
  manifestoData,
  personaData = null,
  x,
  y,
  onMove,
  isSelected = false,
  onSelect,
  onSingleClickConfirmed,
}: OpportunityMapCardProps) {
  const { isDragging, cardInteractionProps } = useArtifactCardInteraction({
    x,
    y,
    isEditing: false,
    onMove,
    onSelect,
    onSingleClickConfirmed,
  });

  const personas = personaData ?? [];
  const jtbds = manifestoData.jtbd ?? [];
  const hmw = manifestoData.hmw ?? [];
  const columnCount = getOpportunityMapColumnCount(personas.length);
  const cardWidth = getOpportunityMapCardWidth(personas.length);

  return (
    <div
      className="absolute select-none"
      style={{ left: x, top: y, width: cardWidth, touchAction: "none" }}
      {...cardInteractionProps}
    >
      <div
        className={`rounded-2xl border border-neutral-200/60 bg-white/90 p-8 shadow-lg backdrop-blur-sm ${ARTIFACT_IDLE_CARD_CLASSNAME} ${
          isSelected ? ARTIFACT_SELECTED_CARD_CLASSNAME : ""
        } ${isDragging ? "cursor-grabbing" : "cursor-grab"}`}
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

        {personas.length > 0 ? (
          <div
            className="grid items-start gap-4"
            style={{
              gridTemplateColumns: `repeat(${columnCount}, minmax(0, ${artifactCardLayout.opportunityMap.columnWidth}px))`,
            }}
          >
            {personas.map((persona, personaIndex) => {
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
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-neutral-200 bg-neutral-50/60 p-4 text-sm text-neutral-500">
            Persona mapping will appear here once the discovery phase identifies who each job belongs to.
          </div>
        )}
      </div>
    </div>
  );
}
