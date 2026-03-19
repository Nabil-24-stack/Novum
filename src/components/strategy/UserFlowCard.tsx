"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Database, FileText, GitBranch, Zap } from "lucide-react";
import { Input } from "@/components/ui/input";
import type { FlowData, PersonaData, StrategyNode, UserFlow } from "@/hooks/useStrategyStore";
import {
  ARTIFACT_EDITOR_FIELDS_CLASSNAME,
  AddListItemButton,
  CardDragHandle,
  EditModeActions,
  ReadOnlyEditHint,
  RemoveListItemButton,
  handleEditorKeyDown,
  useDragHandle,
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

const NODE_W = 140;
const NODE_H = 56;
const GAP = 60;
const PADDING_X = 24;
const PADDING_TOP = 100;
const PADDING_BOTTOM = 40;

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
  const { isDragging, dragHandleProps } = useDragHandle({ x, y, onMove });
  const firstInputRef = useFocusWhenEditing<HTMLInputElement>(isEditing);

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
      }}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div className="overflow-hidden rounded-2xl border border-neutral-200/60 bg-white/90 shadow-lg backdrop-blur-sm">
        <div className="flex items-start justify-between gap-3 px-5 pb-3 pt-4">
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
          <CardDragHandle
            isDragging={isDragging}
            canDrag={Boolean(onMove)}
            dragHandleProps={dragHandleProps}
          />
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

            <div className="space-y-3">
              {draft.steps.map((step, stepIndex) => (
                <div key={stepIndex} className="space-y-2 rounded-xl border border-neutral-200/80 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
                      Step {stepIndex + 1}
                    </p>
                    <RemoveListItemButton
                      onClick={() =>
                        setDraft((current) => ({
                          ...current,
                          steps: current.steps.filter((_, index) => index !== stepIndex),
                        }))
                      }
                    />
                  </div>

                  <label className="space-y-1 text-xs font-medium text-neutral-500">
                    IA node
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
                      className="h-10 w-full rounded-lg border border-neutral-200 bg-white px-3 text-sm text-neutral-700 outline-none focus:border-neutral-400"
                    >
                      {availableNodes.length === 0 && (
                        <option value="">No IA nodes available</option>
                      )}
                      {availableNodes.map((node) => (
                        <option key={node.id} value={node.id}>
                          {node.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <Input
                    ref={stepIndex === 0 ? firstInputRef : undefined}
                    value={step.action}
                    placeholder="Step action"
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
                    className="text-sm"
                  />
                </div>
              ))}
            </div>

            <EditModeActions onSave={saveEditing} onCancel={cancelEditing} />
          </div>
        ) : (
          <div
            className={canEdit ? "cursor-text" : undefined}
            onClick={() => {
              if (canEdit) startEditing();
            }}
          >
            <div className="relative" style={{ height: USER_FLOW_CARD_HEIGHT - PADDING_TOP + PADDING_BOTTOM }}>
              <svg
                width={cardWidth}
                height={USER_FLOW_CARD_HEIGHT - PADDING_TOP + PADDING_BOTTOM}
                className="absolute inset-0"
              >
                {useGradient && (
                  <defs>
                    <linearGradient
                      id={gradientId}
                      gradientUnits="userSpaceOnUse"
                      x1={nodePositions[0]?.x ?? 0}
                      y1={NODE_H / 2}
                      x2={(nodePositions[nodePositions.length - 1]?.x ?? 0) + NODE_W}
                      y2={NODE_H / 2}
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
                  const y1 = NODE_H / 2;
                  const x2 = position.x;
                  const y2 = NODE_H / 2;

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
                    className={`absolute rounded-xl border px-4 py-3 shadow-sm ${style.bg} ${style.border}`}
                    style={{
                      left: position.x,
                      top: 0,
                      width: NODE_W,
                      height: NODE_H,
                    }}
                  >
                    <div className="mb-1 flex items-center gap-2">
                      <Icon className={`h-4 w-4 ${style.iconColor}`} />
                      <span className="truncate text-sm font-semibold text-neutral-800">
                        {node?.label ?? stepLabel(steps[index]?.nodeId ?? "")}
                      </span>
                    </div>
                    <p className="line-clamp-2 text-xs leading-tight text-neutral-500">
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
