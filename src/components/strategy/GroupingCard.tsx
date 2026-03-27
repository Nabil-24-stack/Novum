"use client";

import { Briefcase, Layers3, Users2 } from "lucide-react";
import type { ManifestoData, PersonaData } from "@/hooks/useStrategyStore";
import { resolvePainPointsByIds } from "@/lib/strategy/pain-points";
import {
  ARTIFACT_IDLE_CARD_CLASSNAME,
  ARTIFACT_SELECTED_CARD_CLASSNAME,
  useArtifactCardInteraction,
} from "@/components/strategy/editing";

interface GroupingCardProps {
  manifestoData: Partial<ManifestoData>;
  personaData?: PersonaData[] | null;
  x: number;
  y: number;
  onMove?: (x: number, y: number) => void;
  isSelected?: boolean;
  onSelect?: () => void;
  onSingleClickConfirmed?: () => void;
}

export function GroupingCard({
  manifestoData,
  personaData = null,
  x,
  y,
  onMove,
  isSelected = false,
  onSelect,
  onSingleClickConfirmed,
}: GroupingCardProps) {
  const { isDragging, cardInteractionProps } = useArtifactCardInteraction({
    x,
    y,
    isEditing: false,
    onMove,
    onSelect,
    onSingleClickConfirmed,
  });
  const personas = personaData ?? [];
  const painPoints = manifestoData.painPoints ?? [];
  const jtbds = manifestoData.jtbd ?? [];

  return (
    <div
      className="absolute select-none"
      style={{ left: x, top: y, width: 720, touchAction: "none" }}
      {...cardInteractionProps}
    >
      <div
        className={`rounded-2xl border border-neutral-200/60 bg-white/90 p-8 shadow-lg backdrop-blur-sm ${ARTIFACT_IDLE_CARD_CLASSNAME} ${
          isSelected ? ARTIFACT_SELECTED_CARD_CLASSNAME : ""
        } ${isDragging ? "cursor-grabbing" : "cursor-grab"}`}
      >
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50">
            <Layers3 className="h-4 w-4 text-amber-600" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-neutral-900">Grouping</h2>
            <p className="text-sm text-neutral-500">
              Pain points clustered into jobs and the people behind them
            </p>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
          <section className="space-y-4">
            <div className="rounded-2xl border border-neutral-200/70 bg-neutral-50/80 p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
                Discovery Frame
              </p>
              <div className="mt-3 space-y-3 text-sm text-neutral-600">
                <div>
                  <p className="font-medium text-neutral-900">
                    {manifestoData.title?.trim() || "Product framing in progress"}
                  </p>
                  {manifestoData.problemStatement && (
                    <p className="mt-1 leading-relaxed">{manifestoData.problemStatement}</p>
                  )}
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <InfoBlock label="Target User" value={manifestoData.targetUser} />
                  <InfoBlock label="Context" value={manifestoData.environmentContext} />
                </div>
              </div>
            </div>

            <div>
              <div className="mb-3 flex items-center gap-2">
                <Briefcase className="h-4 w-4 text-blue-600" />
                <h3 className="text-sm font-semibold uppercase tracking-wider text-neutral-500">
                  JTBD Clusters
                </h3>
              </div>
              <div className="space-y-3">
                {jtbds.length > 0 ? (
                  jtbds.map((jtbd, jtbdIndex) => {
                    const linkedPainPoints = resolvePainPointsByIds(jtbd.painPointIds, manifestoData as ManifestoData);
                    return (
                      <div
                        key={`jtbd-${jtbd.id || jtbd.text || "item"}-${jtbdIndex}`}
                        className="rounded-2xl border border-blue-100 bg-blue-50/60 p-4"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-wider text-blue-600">
                              {jtbd.id}
                            </p>
                            <p className="mt-1 text-sm font-medium leading-relaxed text-neutral-800">
                              {jtbd.text}
                            </p>
                          </div>
                          <span className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-neutral-500">
                            {(jtbd.personaNames ?? []).length || 0} persona{(jtbd.personaNames ?? []).length === 1 ? "" : "s"}
                          </span>
                        </div>

                        {linkedPainPoints.length > 0 && (
                          <div className="mt-3">
                            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-500">
                              Linked Pain Points
                            </p>
                            <div className="flex flex-wrap gap-2">
                              {linkedPainPoints.map((painPoint, painPointIndex) => (
                                <span
                                  key={`pain-point-${painPoint.id || painPoint.text || "item"}-${painPointIndex}`}
                                  className="rounded-full bg-rose-100 px-2.5 py-1 text-xs font-medium text-rose-700"
                                >
                                  {painPoint.text}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })
                ) : (
                  <PlaceholderCopy text="JTBD clusters will appear here once the manifesto is generated." />
                )}
              </div>
            </div>
          </section>

          <section>
            <div className="mb-3 flex items-center gap-2">
              <Users2 className="h-4 w-4 text-amber-600" />
              <h3 className="text-sm font-semibold uppercase tracking-wider text-neutral-500">
                Persona Roster
              </h3>
            </div>
            <div className="space-y-3">
              {personas.length > 0 ? (
                personas.map((persona, personaIndex) => {
                  const personaName = typeof persona.name === "string" ? persona.name : "";
                  const personaRole = typeof persona.role === "string" ? persona.role : "";
                  const personaGoals = Array.isArray(persona.goals) ? persona.goals : [];

                  return (
                    <div
                      key={`persona-${personaName || personaRole || "item"}-${personaIndex}`}
                      className="rounded-2xl border border-amber-100 bg-amber-50/60 p-4"
                    >
                      <p className="text-sm font-semibold text-neutral-900">
                        {personaName || "Persona in progress"}
                      </p>
                      {personaRole && (
                        <p className="mt-1 text-sm text-neutral-600">{personaRole}</p>
                      )}
                      {personaGoals.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {personaGoals.slice(0, 3).map((goal, goalIndex) => (
                            <span
                              key={`goal-${goal}-${goalIndex}`}
                              className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-neutral-600"
                            >
                              {goal}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })
              ) : (
                <PlaceholderCopy text="Personas will appear here once the discovery grouping is ready." />
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function InfoBlock({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="rounded-xl border border-white/90 bg-white/80 p-3">
      <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">{label}</p>
      <p className="mt-1 text-sm text-neutral-700">
        {value?.trim() || "Still being articulated"}
      </p>
    </div>
  );
}

function PlaceholderCopy({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-neutral-200 bg-neutral-50/60 p-4 text-sm text-neutral-500">
      {text}
    </div>
  );
}
