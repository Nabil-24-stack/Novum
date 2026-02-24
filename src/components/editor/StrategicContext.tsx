"use client";

import { useState, useMemo } from "react";
import { BrainCircuit, ChevronRight, User, CheckSquare } from "lucide-react";
import { useProductBrainStore } from "@/hooks/useProductBrainStore";
import { useStrategyStore } from "@/hooks/useStrategyStore";
import { findConnectionsByStrategyIds } from "@/lib/product-brain/lookup";

const PERSONA_COLORS = [
  { bg: "bg-blue-50", text: "text-blue-700" },
  { bg: "bg-violet-50", text: "text-violet-700" },
  { bg: "bg-emerald-50", text: "text-emerald-700" },
  { bg: "bg-amber-50", text: "text-amber-700" },
  { bg: "bg-rose-50", text: "text-rose-700" },
] as const;

interface StrategicContextProps {
  strategyIds?: string[];
}

export function StrategicContext({ strategyIds }: StrategicContextProps) {
  const [isCollapsed, setIsCollapsed] = useState(true);
  const brainData = useProductBrainStore((s) => s.brainData);
  const manifestoData = useStrategyStore((s) => s.manifestoData);
  const personaData = useStrategyStore((s) => s.personaData);

  const connections = useMemo(() => {
    if (!brainData || !strategyIds || strategyIds.length === 0) return [];
    return findConnectionsByStrategyIds(brainData, strategyIds);
  }, [brainData, strategyIds]);

  // Don't render if no strategy IDs or no connections found
  if (!strategyIds || strategyIds.length === 0 || connections.length === 0) return null;

  // Build a persona name → index map for coloring
  const personaIndexMap = new Map<string, number>();
  personaData?.forEach((p, i) => personaIndexMap.set(p.name, i));

  // Resolve JTBD indices to text
  const jtbdTexts = manifestoData?.jtbd ?? [];

  return (
    <div className="border-b border-neutral-200">
      {/* Clickable header with chevron toggle */}
      <button
        onClick={() => setIsCollapsed((prev) => !prev)}
        className="w-full flex items-center justify-between p-4 hover:bg-neutral-50 transition-colors"
      >
        <h3 className="text-sm font-medium text-neutral-500 uppercase tracking-wide flex items-center gap-1.5">
          <BrainCircuit className="w-3.5 h-3.5" />
          Strategic Context
          <span className="ml-1 px-1.5 py-0.5 bg-violet-100 text-violet-700 text-xs font-semibold rounded-full">
            {connections.length}
          </span>
        </h3>
        <ChevronRight
          className={`w-4 h-4 text-neutral-400 transition-transform ${
            isCollapsed ? "" : "rotate-90"
          }`}
        />
      </button>

      {/* Collapsible content */}
      {!isCollapsed && (
        <div className="px-4 pb-4 space-y-3">
          {connections.map((conn) => (
            <div key={conn.id} className="space-y-2">
              {/* Component description */}
              <p className="text-sm font-medium text-neutral-800">
                {conn.componentDescription}
              </p>

              {/* Persona badges */}
              {conn.personaNames.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {conn.personaNames.map((name) => {
                    const idx = personaIndexMap.get(name) ?? 0;
                    const color = PERSONA_COLORS[idx % PERSONA_COLORS.length];
                    return (
                      <span
                        key={name}
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${color.bg} ${color.text}`}
                      >
                        <User className="w-2.5 h-2.5" />
                        {name}
                      </span>
                    );
                  })}
                </div>
              )}

              {/* JTBD chips */}
              {conn.jtbdIndices.length > 0 && (
                <div className="space-y-1">
                  {conn.jtbdIndices.map((idx) => {
                    const text = jtbdTexts[idx];
                    if (!text) return null;
                    return (
                      <div
                        key={idx}
                        className="flex items-start gap-1.5 text-xs text-neutral-600"
                      >
                        <CheckSquare className="w-3 h-3 text-emerald-500 mt-0.5 shrink-0" />
                        <span className="leading-relaxed">{text}</span>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Rationale */}
              <p className="text-xs text-neutral-400 leading-relaxed italic">
                {conn.rationale}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
