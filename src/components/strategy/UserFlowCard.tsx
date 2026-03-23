"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Database, FileText, GitBranch, Zap } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import type { FlowData, PersonaData, StrategyNode, UserFlow } from "@/hooks/useStrategyStore";
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
import { normalizeUserFlowData } from "@/lib/strategy/artifact-edit-sync";

const ACCENT_COLORS = [
  { bg: "bg-blue-100", text: "text-blue-700", stroke: "#3b82f6" },
  { bg: "bg-violet-100", text: "text-violet-700", stroke: "#8b5cf6" },
  { bg: "bg-emerald-100", text: "text-emerald-700", stroke: "#10b981" },
  { bg: "bg-amber-100", text: "text-amber-700", stroke: "#f59e0b" },
  { bg: "bg-rose-100", text: "text-rose-700", stroke: "#f43f5e" },
] as const;

const TYPE_STYLES: Record<StrategyNode["type"], { bg: string; border: string; iconColor: string }> = {
  page: { bg: "bg-blue-50", border: "border-blue-300", iconColor: "text-blue-500" },
  action: { bg: "bg-emerald-50", border: "border-emerald-300", iconColor: "text-emerald-500" },
  decision: { bg: "bg-amber-50", border: "border-amber-300", iconColor: "text-amber-500" },
  data: { bg: "bg-violet-50", border: "border-violet-300", iconColor: "text-violet-500" },
};

const TYPE_ICONS: Record<StrategyNode["type"], typeof FileText> = {
  page: FileText,
  action: Zap,
  decision: GitBranch,
  data: Database,
};

const NODE_W = 180;
const NODE_H = 92;
const GAP = 52;
const PADDING_X = 24;
const PADDING_TOP = 10;
const PADDING_BOTTOM = 10;

export const USER_FLOW_CARD_WIDTH = 700;
export const USER_FLOW_CARD_HEIGHT = 280;

const NODE_REVEAL_INTERVAL = 180;

interface UserFlowCardProps {
  flow: Partial<UserFlow>;
  flowData: FlowData | null;
  personas: PersonaData[] | null;
  x: number;
  y: number;
  onMove?: (x: number, y: number) => void;
  onCommit?: (flow: UserFlow) => void;
  isSelected?: boolean;
  onSelect?: () => void;
  onSingleClickConfirmed?: () => void;
}

function getPersonaColorIndex(personaName: string, personas: PersonaData[] | null): number {
  if (!personas) return 0;
  const index = personas.findIndex((persona) => persona.name === personaName);
  return index >= 0 ? index % ACCENT_COLORS.length : 0;
}

export function UserFlowCard({
  flow,
  flowData,
  personas,
  x,
  y,
  onMove,
  onCommit,
  isSelected = false,
  onSelect,
  onSingleClickConfirmed,
}: UserFlowCardProps) {
  const {
    canEdit,
    isEditing,
    draft,
    setDraft,
    startEditing,
    cancelEditing,
    saveEditing,
  } = useEditableCard({
    value: normalizeUserFlowData({
      id: flow.id ?? `flow-${flow.jtbdIndex ?? 0}`,
      jtbdIndex: flow.jtbdIndex ?? 0,
      jtbdText: flow.jtbdText ?? "",
      personaNames: flow.personaNames ?? [],
      steps: flow.steps ?? [],
    }),
    onCommit,
    normalize: normalizeUserFlowData,
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

  const steps = useMemo(() => draft.steps ?? [], [draft.steps]);
  const personaNames = useMemo(() => draft.personaNames ?? [], [draft.personaNames]);

  const [visibleCount, setVisibleCount] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset the reveal cycle for the current flow shape
    setVisibleCount(0);

    if (steps.length === 0 || isEditing) return;

    const startDelay = setTimeout(() => {
      setVisibleCount(1);

      timerRef.current = setInterval(() => {
        setVisibleCount((previous) => {
          const next = previous + 1;
          if (next >= steps.length && timerRef.current) {
            clearInterval(timerRef.current);
          }
          return next;
        });
      }, NODE_REVEAL_INTERVAL);
    }, 100);

    return () => {
      clearTimeout(startDelay);
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isEditing, steps.length]);

  const cardWidth = useMemo(
    () => Math.max(USER_FLOW_CARD_WIDTH, steps.length * (NODE_W + GAP) - GAP + PADDING_X * 2),
    [steps.length]
  );

  const personaColors = useMemo(
    () =>
      personaNames.map((name) => {
        const index = getPersonaColorIndex(name, personas);
        return ACCENT_COLORS[index];
      }),
    [personaNames, personas]
  );

  const gradientId = `uf-grad-${draft.id ?? "tmp"}`;
  const useGradient = personaColors.length > 1;
  const strokeColor = personaColors[0]?.stroke ?? "#3b82f6";

  const nodePositions = useMemo(
    () =>
      steps.map((_, index) => ({
        x: PADDING_X + index * (NODE_W + GAP),
        y: PADDING_TOP,
      })),
    [steps]
  );

  const resolvedNodes = useMemo(
    () => steps.map((step) => flowData?.nodes.find((node) => node.id === step.nodeId)),
    [flowData, steps]
  );

  const availableNodes = flowData?.nodes ?? [];

  return (
    <div
      className={`absolute ${isEditing ? "" : "select-none"}`}
      style={{
        left: x,
        top: y,
        width: cardWidth,
        touchAction: isEditing ? undefined : "none",
      }}
      {...cardInteractionProps}
    >
      <div
        className={`overflow-hidden rounded-2xl border border-neutral-200/60 bg-white/90 shadow-lg backdrop-blur-sm ${ARTIFACT_IDLE_CARD_CLASSNAME} ${
          isSelected ? ARTIFACT_SELECTED_CARD_CLASSNAME : ""
        } ${!isEditing ? (isDragging ? "cursor-grabbing" : "cursor-grab") : ""}`}
      >
        <div className="px-5 pb-3 pt-4">
          <div>
            {draft.jtbdText && (
              <p className="text-xs italic leading-relaxed text-neutral-500">&ldquo;{draft.jtbdText}&rdquo;</p>
            )}
            {personaNames.length > 0 && (
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                {personaNames.map((name, index) => {
                  const color = personaColors[index];
                  return (
                    <span
                      key={`${name}-${index}`}
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${color.bg} ${color.text}`}
                    >
                      {name}
                    </span>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {isEditing ? (
          <div className={`space-y-4 px-5 pb-5 ${ARTIFACT_EDITOR_FIELDS_CLASSNAME}`}>
            <div className="rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs text-neutral-500">
              JTBD and persona links stay anchored to the upstream overview and persona artifacts.
            </div>

            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
                Steps
              </p>
              {availableNodes.length > 0 ? (
                <AddListItemButton
                  label="Add step"
                  onClick={() => {
                    const fallbackNodeId = availableNodes[0]?.id ?? "";
                    setDraft((current) => ({
                      ...current,
                      steps: [
                        ...current.steps,
                        { nodeId: fallbackNodeId, action: "" },
                      ],
                    }));
                  }}
                />
              ) : (
                <p className="text-[11px] text-neutral-400">
                  Add IA nodes before creating more steps.
                </p>
              )}
            </div>

            {draft.steps.length > 0 ? (
              <div className="-mx-1 overflow-x-auto pb-1">
                <div className="flex min-w-max items-start gap-4 px-1">
                  {draft.steps.map((step, stepIndex) => {
                    const node = resolvedNodes[stepIndex];
                    const type = node?.type ?? "page";
                    const style = TYPE_STYLES[type];
                    const Icon = TYPE_ICONS[type];

                    return (
                      <div key={stepIndex} className="flex items-start gap-4">
                        {stepIndex > 0 && (
                          <div className="flex h-[148px] items-center text-blue-500/80">
                            <ArrowRight className="h-4 w-4" />
                          </div>
                        )}

                        <div
                          className={`w-[180px] shrink-0 rounded-xl border p-4 shadow-sm ${style.bg} ${style.border}`}
                        >
                          <div className="mb-3 flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="flex min-w-0 items-center gap-2">
                                <Icon className={`h-4 w-4 shrink-0 ${style.iconColor}`} />
                                <span className="truncate text-sm font-semibold text-neutral-800">
                                  {node?.label ?? stepLabel(step.nodeId)}
                                </span>
                              </div>
                              <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-neutral-500">
                                Step {stepIndex + 1}
                              </p>
                            </div>
                            <RemoveListItemButton
                              onClick={() =>
                                setDraft((current) => ({
                                  ...current,
                                  steps: current.steps.filter((_, index) => index !== stepIndex),
                                }))
                              }
                            />
                          </div>

                          <div className="space-y-3">
                            <label className="block space-y-1 text-xs font-medium text-neutral-500">
                              <span>IA node</span>
                              <select
                                value={step.nodeId}
                                disabled={availableNodes.length === 0}
                                onChange={(event) =>
                                  setDraft((current) => ({
                                    ...current,
                                    steps: current.steps.map((item, index) =>
                                      index === stepIndex
                                        ? { ...item, nodeId: event.target.value }
                                        : item
                                    ),
                                  }))
                                }
                                className="h-10 w-full rounded-lg border border-neutral-200 bg-white/95 px-3 text-sm text-neutral-700 outline-none focus:border-neutral-400"
                              >
                                {availableNodes.length === 0 && (
                                  <option value="">No IA nodes available</option>
                                )}
                                {availableNodes.map((availableNode) => (
                                  <option key={availableNode.id} value={availableNode.id}>
                                    {availableNode.label}
                                  </option>
                                ))}
                              </select>
                            </label>

                            <label className="block space-y-1 text-xs font-medium text-neutral-500">
                              <span>Action</span>
                              <Textarea
                                ref={stepIndex === 0 ? firstInputRef : undefined}
                                value={step.action}
                                placeholder="Describe what happens in this step"
                                rows={4}
                                onChange={(event) =>
                                  setDraft((current) => ({
                                    ...current,
                                    steps: current.steps.map((item, index) =>
                                      index === stepIndex
                                        ? { ...item, action: event.target.value }
                                        : item
                                    ),
                                  }))
                                }
                                onKeyDown={(event) =>
                                  handleEditorKeyDown(event, {
                                    onSave: saveEditing,
                                    onCancel: cancelEditing,
                                  })
                                }
                                className="min-h-[96px] resize-none bg-white/95 text-sm leading-relaxed"
                              />
                            </label>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-neutral-300 bg-neutral-50 px-4 py-6 text-center text-sm text-neutral-500">
                No flow steps yet. Add a step to map this user flow onto the IA.
              </div>
            )}

            <EditModeActions onSave={saveEditing} onCancel={cancelEditing} />
          </div>
        ) : (
          <div>
            <div className="relative" style={{ height: NODE_H + PADDING_TOP + PADDING_BOTTOM }}>
              <svg
                width={cardWidth}
                height={NODE_H + PADDING_TOP + PADDING_BOTTOM}
                className="absolute inset-0"
              >
                {useGradient && (
                  <defs>
                    <linearGradient
                      id={gradientId}
                      gradientUnits="userSpaceOnUse"
                      x1={nodePositions[0]?.x ?? 0}
                      y1={(nodePositions[0]?.y ?? PADDING_TOP) + NODE_H / 2}
                      x2={(nodePositions[nodePositions.length - 1]?.x ?? 0) + NODE_W}
                      y2={(nodePositions[0]?.y ?? PADDING_TOP) + NODE_H / 2}
                    >
                      {personaColors.map((color, index) => {
                        const segmentSize = 1 / personaColors.length;
                        return [
                          <stop
                            key={`${index}-start`}
                            offset={`${index * segmentSize * 100}%`}
                            stopColor={color.stroke}
                          />,
                          <stop
                            key={`${index}-end`}
                            offset={`${(index + 1) * segmentSize * 100}%`}
                            stopColor={color.stroke}
                          />,
                        ];
                      }).flat()}
                    </linearGradient>
                  </defs>
                )}

                {nodePositions.map((position, index) => {
                  if (index === 0 || index >= visibleCount) return null;
                  const previous = nodePositions[index - 1];
                  const x1 = previous.x + NODE_W;
                  const y1 = previous.y + NODE_H / 2;
                  const x2 = position.x;
                  const y2 = position.y + NODE_H / 2;

                  return (
                    <g key={`connection-${index}`}>
                      <line
                        x1={x1}
                        y1={y1}
                        x2={x2}
                        y2={y2}
                        stroke={useGradient ? `url(#${gradientId})` : strokeColor}
                        strokeWidth={2.5}
                        strokeLinecap="round"
                      />
                      <polygon
                        points={`${x2 - 6},${y2 - 4} ${x2},${y2} ${x2 - 6},${y2 + 4}`}
                        fill={useGradient ? personaColors[personaColors.length - 1]?.stroke ?? strokeColor : strokeColor}
                      />
                    </g>
                  );
                })}
              </svg>

              {nodePositions.map((position, index) => {
                if (index >= visibleCount) return null;
                const node = resolvedNodes[index];
                const type = node?.type ?? "page";
                const style = TYPE_STYLES[type];
                const Icon = TYPE_ICONS[type];

                return (
                  <div
                    key={`${node?.id ?? "node"}-${index}`}
                    className={`absolute overflow-hidden rounded-xl border px-4 py-3 shadow-sm ${style.bg} ${style.border}`}
                    style={{
                      left: position.x,
                      top: position.y,
                      width: NODE_W,
                      height: NODE_H,
                    }}
                  >
                    <div className="mb-2 flex min-w-0 items-center gap-2">
                      <Icon className={`h-4 w-4 shrink-0 ${style.iconColor}`} />
                      <span className="truncate text-sm font-semibold text-neutral-800">
                        {node?.label ?? stepLabel(steps[index]?.nodeId ?? "")}
                      </span>
                    </div>
                    <p className="line-clamp-2 overflow-hidden text-xs leading-5 text-neutral-500">
                      {steps[index]?.action}
                    </p>
                  </div>
                );
              })}
            </div>

            {canEdit && <div className="px-5 pb-5"><ReadOnlyEditHint /></div>}
          </div>
        )}
      </div>
    </div>
  );
}

function stepLabel(nodeId: string) {
  return nodeId || "Unmapped";
}
