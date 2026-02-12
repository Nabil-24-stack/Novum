"use client";

import { useMemo, useState, useEffect, useRef, useCallback } from "react";
import { FlowConnections } from "@/components/flow/FlowConnections";
import { StrategyFlowNode } from "./StrategyFlowNode";
import { calculateStrategyLayout } from "@/lib/strategy/strategy-layout";
import type { FlowData, StrategyNode } from "@/hooks/useStrategyStore";
import type { FlowNodePosition } from "@/lib/flow/types";

interface StrategyFlowCanvasProps {
  flowData: FlowData;
  offsetX: number;
  offsetY: number;
}

// Delay between each node appearing (ms)
const NODE_REVEAL_INTERVAL = 180;

export function StrategyFlowCanvas({ flowData, offsetX, offsetY }: StrategyFlowCanvasProps) {
  const [visibleCount, setVisibleCount] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // User drag overrides: nodeId -> { x, y } (relative to container)
  const [dragOffsets, setDragOffsets] = useState<Record<string, { x: number; y: number }>>({});

  const layout = useMemo(
    () => calculateStrategyLayout(flowData.nodes, flowData.connections),
    [flowData.nodes, flowData.connections]
  );

  // Nodes from layout are already in BFS level order (left to right).
  // Build ordered list of node IDs for the reveal sequence.
  const orderedNodeIds = useMemo(() => layout.nodes.map((n) => n.id), [layout.nodes]);

  // Staggered reveal: increment visibleCount on an interval
  useEffect(() => {
    // Reset is safe here — it synchronizes with a new orderedNodeIds arriving
    setVisibleCount(0); // eslint-disable-line react-hooks/set-state-in-effect

    // Small initial delay so the container has time to mount
    const startDelay = setTimeout(() => {
      // Show first node immediately
      setVisibleCount(1);

      timerRef.current = setInterval(() => {
        setVisibleCount((prev) => {
          const next = prev + 1;
          if (next >= orderedNodeIds.length) {
            if (timerRef.current) clearInterval(timerRef.current);
          }
          return next;
        });
      }, NODE_REVEAL_INTERVAL);
    }, 100);

    return () => {
      clearTimeout(startDelay);
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [orderedNodeIds.length]);

  // Set of currently visible node IDs
  const visibleNodeIds = useMemo(
    () => new Set(orderedNodeIds.slice(0, visibleCount)),
    [orderedNodeIds, visibleCount]
  );

  // Apply drag offsets to layout positions
  const effectivePositions = useMemo(() => {
    return layout.nodes.map((pos) => {
      const offset = dragOffsets[pos.id];
      if (!offset) return pos;
      return { ...pos, x: offset.x, y: offset.y };
    });
  }, [layout.nodes, dragOffsets]);

  // Build node position map for FlowConnections (only visible nodes)
  const nodePositionMap = useMemo(() => {
    const map = new Map<string, FlowNodePosition>();
    for (const pos of effectivePositions) {
      if (visibleNodeIds.has(pos.id)) {
        map.set(pos.id, pos);
      }
    }
    return map;
  }, [effectivePositions, visibleNodeIds]);

  // Build a lookup from id -> StrategyNode for rendering
  const nodeMap = useMemo(() => {
    const map = new Map<string, StrategyNode>();
    for (const node of flowData.nodes) {
      map.set(node.id, node);
    }
    return map;
  }, [flowData.nodes]);

  // Only show connections where both endpoints are visible
  const flowConnections = useMemo(
    () =>
      flowData.connections
        .filter((c) => visibleNodeIds.has(c.from) && visibleNodeIds.has(c.to))
        .map((c) => ({
          from: c.from,
          to: c.to,
          label: c.label,
        })),
    [flowData.connections, visibleNodeIds]
  );

  // Compute bounding box that includes dragged nodes
  const canvasSize = useMemo(() => {
    let maxX = layout.width;
    let maxY = layout.height;
    for (const pos of effectivePositions) {
      maxX = Math.max(maxX, pos.x + pos.width + 40);
      maxY = Math.max(maxY, pos.y + pos.height + 40);
    }
    return { width: maxX, height: maxY };
  }, [effectivePositions, layout.width, layout.height]);

  const handleNodeMove = useCallback((id: string, newX: number, newY: number) => {
    setDragOffsets((prev) => ({ ...prev, [id]: { x: newX, y: newY } }));
  }, []);

  return (
    <div
      className="absolute"
      style={{
        left: offsetX,
        top: offsetY,
        width: canvasSize.width,
        height: canvasSize.height,
      }}
    >
      {/* Connections SVG layer */}
      <FlowConnections
        connections={flowConnections}
        nodePositions={nodePositionMap}
        width={canvasSize.width}
        height={canvasSize.height}
      />

      {/* Nodes — only render visible ones with staggered index for animation */}
      {effectivePositions.map((pos, index) => {
        if (!visibleNodeIds.has(pos.id)) return null;
        const node = nodeMap.get(pos.id);
        if (!node) return null;
        return (
          <StrategyFlowNode
            key={pos.id}
            node={node}
            position={pos}
            index={index}
            onMove={handleNodeMove}
          />
        );
      })}
    </div>
  );
}
