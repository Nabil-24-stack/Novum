"use client";

import { Smartphone, GitBranch } from "lucide-react";

export type CanvasMode = "prototype" | "flow";

interface ViewModeToggleProps {
  mode: CanvasMode;
  onModeChange: (mode: CanvasMode) => void;
  className?: string;
}

export function ViewModeToggle({ mode, onModeChange, className }: ViewModeToggleProps) {
  return (
    <div className={`flex flex-col bg-white rounded-lg shadow-lg border border-neutral-200 p-1 gap-1 ${className ?? ""}`}>
      <button
        onClick={() => onModeChange("prototype")}
        className={`p-2 rounded-md transition-colors relative group ${
          mode === "prototype"
            ? "bg-neutral-900 text-white"
            : "text-neutral-600 hover:bg-neutral-100"
        }`}
        title="Prototype View - Single frame preview"
      >
        <Smartphone className="w-4 h-4" />
        {/* Tooltip */}
        <div className="absolute left-full top-1/2 -translate-y-1/2 ml-2 px-2 py-1 bg-neutral-900 text-white text-sm rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap">
          Prototype
        </div>
      </button>
      <button
        onClick={() => onModeChange("flow")}
        className={`p-2 rounded-md transition-colors relative group ${
          mode === "flow"
            ? "bg-neutral-900 text-white"
            : "text-neutral-600 hover:bg-neutral-100"
        }`}
        title="Flow View - Multi-page flow diagram"
      >
        <GitBranch className="w-4 h-4" />
        {/* Tooltip */}
        <div className="absolute left-full top-1/2 -translate-y-1/2 ml-2 px-2 py-1 bg-neutral-900 text-white text-sm rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap">
          Flow
        </div>
      </button>
    </div>
  );
}
