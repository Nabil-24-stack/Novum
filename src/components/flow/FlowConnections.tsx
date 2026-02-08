"use client";

import type { FlowConnection, FlowNodePosition } from "@/lib/flow/types";
import { getSmartOrthogonalPath, isForwardConnection } from "@/lib/flow/auto-layout";

interface FlowConnectionsProps {
  connections: FlowConnection[];
  nodePositions: Map<string, FlowNodePosition>;
  width: number;
  height: number;
}

/**
 * Single orthogonal connection line with dashed animation
 */
function ConnectionLine({
  conn,
  fromNode,
  toNode,
}: {
  conn: FlowConnection;
  fromNode: FlowNodePosition;
  toNode: FlowNodePosition;
}) {
  const path = getSmartOrthogonalPath(fromNode, toNode, 0);

  // Calculate label position (at the midpoint of the connection)
  const midX = (fromNode.x + fromNode.width + toNode.x) / 2;
  const labelY = (fromNode.y + fromNode.height / 2 + toNode.y + toNode.height / 2) / 2;

  return (
    <g>
      {/* Connection line with dashed animation */}
      <path
        d={path}
        fill="none"
        stroke="#9ca3af"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray="6 4"
        className="flow-line"
        markerEnd="url(#arrowhead)"
      />

      {/* Connection label (if provided) */}
      {conn.label && (
        <g transform={`translate(${midX}, ${labelY})`}>
          <rect
            x={-conn.label.length * 3.5 - 8}
            y={-10}
            width={conn.label.length * 7 + 16}
            height={20}
            rx={4}
            fill="white"
            stroke="#e5e7eb"
            strokeWidth={1}
          />
          <text
            textAnchor="middle"
            dominantBaseline="central"
            fill="#6b7280"
            style={{ fontFamily: "system-ui, sans-serif", fontSize: "11px", fontWeight: 500 }}
          >
            {conn.label}
          </text>
        </g>
      )}
    </g>
  );
}

export function FlowConnections({ connections, nodePositions, width, height }: FlowConnectionsProps) {
  if (connections.length === 0) {
    return null;
  }

  return (
    <svg
      className="absolute top-0 left-0 pointer-events-none"
      width={width}
      height={height}
      style={{ overflow: "visible" }}
    >
      {/* Arrowhead marker */}
      <defs>
        <marker
          id="arrowhead"
          markerWidth="10"
          markerHeight="7"
          refX="9"
          refY="3.5"
          orient="auto"
        >
          <polygon points="0 0, 10 3.5, 0 7" fill="#9ca3af" />
        </marker>
      </defs>

      {/* Animation styles */}
      <style>
        {`
          @keyframes flowAnimation {
            from { stroke-dashoffset: 20; }
            to { stroke-dashoffset: 0; }
          }
          .flow-line {
            animation: flowAnimation 0.8s linear infinite;
          }
        `}
      </style>

      {/* Render only forward connections */}
      {connections.map((conn, index) => {
        const fromNode = nodePositions.get(conn.from);
        const toNode = nodePositions.get(conn.to);

        if (!fromNode || !toNode) return null;

        // Skip backward connections
        if (!isForwardConnection(fromNode, toNode)) return null;

        return (
          <ConnectionLine
            key={`${conn.from}-${conn.to}-${index}`}
            conn={conn}
            fromNode={fromNode}
            toNode={toNode}
          />
        );
      })}
    </svg>
  );
}
