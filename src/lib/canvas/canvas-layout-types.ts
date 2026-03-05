import type { FlowNodePosition } from "@/lib/flow/types";
import type { GroupId } from "@/lib/strategy/section-layout";

/**
 * Persisted canvas layout state.
 * Stored as JSONB in the `canvas_layout` column of the `projects` table.
 */
export interface CanvasLayout {
  nodePositions: Record<string, FlowNodePosition>;
  groupPositions: Record<string, { x: number; y: number }>;
  flowLayoutOffset: { x: number; y: number };
  personaPositions: { x: number; y: number }[];
  journeyMapPositions: { x: number; y: number }[];
  ideaPositions: { x: number; y: number }[];
  userFlowPositions: { x: number; y: number }[];
  keyFeaturesPosition: { x: number; y: number } | null;
}

export function serializeCanvasLayout(
  nodePositions: Map<string, FlowNodePosition>,
  groupPositions: Map<string, { x: number; y: number }>,
  flowLayoutOffset: { x: number; y: number },
  personaPositions: { x: number; y: number }[],
  journeyMapPositions: { x: number; y: number }[],
  ideaPositions: { x: number; y: number }[],
  userFlowPositions: { x: number; y: number }[],
  keyFeaturesPosition: { x: number; y: number } | null
): CanvasLayout {
  return {
    nodePositions: Object.fromEntries(nodePositions),
    groupPositions: Object.fromEntries(groupPositions),
    flowLayoutOffset,
    personaPositions,
    journeyMapPositions,
    ideaPositions,
    userFlowPositions,
    keyFeaturesPosition,
  };
}

export function deserializeCanvasLayout(raw: CanvasLayout) {
  return {
    nodePositions: new Map(Object.entries(raw.nodePositions ?? {})),
    groupPositions: new Map(
      Object.entries(raw.groupPositions ?? {}) as [GroupId, { x: number; y: number }][]
    ),
    flowLayoutOffset: raw.flowLayoutOffset ?? { x: 0, y: 0 },
    personaPositions: raw.personaPositions ?? [],
    journeyMapPositions: raw.journeyMapPositions ?? [],
    ideaPositions: raw.ideaPositions ?? [],
    userFlowPositions: raw.userFlowPositions ?? [],
    keyFeaturesPosition: raw.keyFeaturesPosition ?? null,
  };
}
