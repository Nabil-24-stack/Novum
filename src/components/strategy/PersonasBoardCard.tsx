"use client";

import { AlertTriangle, Quote, Target, Users2 } from "lucide-react";
import type { ManifestoData, PersonaData } from "@/hooks/useStrategyStore";
import { resolvePainPointsByIds } from "@/lib/strategy/pain-points";
import {
  artifactCardLayout,
  getPersonasCardWidth,
  getPersonasColumnCount,
} from "@/lib/strategy/artifact-card-layout";
import {
  ARTIFACT_IDLE_CARD_CLASSNAME,
  ARTIFACT_SELECTED_CARD_CLASSNAME,
  useArtifactCardInteraction,
} from "@/components/strategy/editing";

const ACCENT_COLORS = [
  { bg: "bg-blue-100", text: "text-blue-700", border: "border-blue-200" },
  { bg: "bg-violet-100", text: "text-violet-700", border: "border-violet-200" },
  { bg: "bg-emerald-100", text: "text-emerald-700", border: "border-emerald-200" },
  { bg: "bg-amber-100", text: "text-amber-700", border: "border-amber-200" },
  { bg: "bg-rose-100", text: "text-rose-700", border: "border-rose-200" },
] as const;

interface PersonasBoardCardProps {
  manifestoData?: Partial<ManifestoData> | null;
  personaData?: Array<Partial<PersonaData>> | null;
  x: number;
  y: number;
  onMove?: (x: number, y: number) => void;
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

export function PersonasBoardCard({
  manifestoData = null,
  personaData = null,
  x,
  y,
  onMove,
  isSelected = false,
  onSelect,
  onSingleClickConfirmed,
}: PersonasBoardCardProps) {
  const { isDragging, cardInteractionProps } = useArtifactCardInteraction({
    x,
    y,
    isEditing: false,
    onMove,
    onSelect,
    onSingleClickConfirmed,
  });
  const personas = personaData ?? [];
  const painPointRegistry = manifestoData?.painPoints ?? [];
  const columnCount = getPersonasColumnCount(personas.length);
  const cardWidth = getPersonasCardWidth(personas.length);

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

        {personas.length > 0 ? (
          <div
            className="grid items-start gap-4"
            style={{
              gridTemplateColumns: `repeat(${columnCount}, minmax(0, ${artifactCardLayout.personas.columnWidth}px))`,
            }}
          >
            {personas.map((persona, personaIndex) => {
              const accent = ACCENT_COLORS[personaIndex] ?? ACCENT_COLORS[0];
              const name = typeof persona.name === "string" ? persona.name : "";
              const role = typeof persona.role === "string" ? persona.role : "";
              const bio = typeof persona.bio === "string" ? persona.bio : "";
              const goals = Array.isArray(persona.goals) ? persona.goals : [];
              const quote = typeof persona.quote === "string" ? persona.quote : "";
              const painPointIds = Array.isArray(persona.painPointIds) ? persona.painPointIds : [];
              const resolvedPainPoints = resolvePainPointsByIds(
                painPointIds,
                { painPoints: painPointRegistry } as ManifestoData,
              );

              return (
                <div
                  key={`persona-${name || role || "item"}-${personaIndex}`}
                  className="rounded-2xl border border-neutral-200/60 bg-white/90 p-6 shadow-lg backdrop-blur-sm"
                >
                  {(name || role) && (
                    <div className="mb-4 flex items-center gap-3">
                      <div
                        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold ${accent.bg} ${accent.text}`}
                      >
                        {getInitials(name)}
                      </div>
                      <div className="min-w-0">
                        {name ? (
                          <p className="truncate text-base font-semibold text-neutral-900">{name}</p>
                        ) : (
                          <p className="truncate text-base font-semibold text-neutral-900">
                            Persona in progress
                          </p>
                        )}
                        {role && (
                          <p className="truncate text-sm text-neutral-500">{role}</p>
                        )}
                      </div>
                    </div>
                  )}

                  {bio && (
                    <p className="mb-4 text-sm leading-relaxed text-neutral-600">{bio}</p>
                  )}

                  {bio && goals.length > 0 && (
                    <div className="mb-4 border-t border-neutral-200/60" />
                  )}

                  {goals.length > 0 && (
                    <div className="mb-4">
                      <div className="mb-2 flex items-center gap-1.5">
                        <Target className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
                        <h4 className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
                          Goals
                        </h4>
                      </div>
                      <ul className="space-y-1.5">
                        {goals.map((goal, goalIndex) => (
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

                  {quote && (
                    <>
                      {(goals.length > 0 || resolvedPainPoints.length > 0) && (
                        <div className="mb-4 border-t border-neutral-200/60" />
                      )}
                      <div className={`border-l-2 pl-3 ${accent.border}`}>
                        <Quote className="mb-1 h-3.5 w-3.5 text-neutral-400" />
                        <p className="text-sm italic leading-relaxed text-neutral-600">
                          &ldquo;{quote}&rdquo;
                        </p>
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-neutral-200 bg-neutral-50/60 p-4 text-sm text-neutral-500">
            Rich persona details will appear here once the discovery phase identifies the users behind each job.
          </div>
        )}
      </div>
    </div>
  );
}
