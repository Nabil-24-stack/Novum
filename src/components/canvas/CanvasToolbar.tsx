"use client";

import { MousePointer2, Square, Type, Component } from "lucide-react";
import type { CanvasTool } from "@/lib/canvas/types";

interface CanvasToolbarProps {
  activeTool: CanvasTool;
  onToolChange: (tool: CanvasTool) => void;
}

interface ToolButtonProps {
  tool: CanvasTool;
  icon: React.ReactNode;
  label: string;
  shortcut: string;
  isActive: boolean;
  onClick: () => void;
}

function ToolButton({ icon, label, shortcut, isActive, onClick }: ToolButtonProps) {
  return (
    <button
      onClick={onClick}
      className={`p-2.5 rounded-full transition-colors relative group ${
        isActive
          ? "bg-neutral-100 text-neutral-900"
          : "text-neutral-500 hover:text-neutral-700 hover:bg-neutral-50"
      }`}
      title={`${label} (${shortcut})`}
    >
      {icon}
      {/* Tooltip */}
      <div className="absolute left-full top-1/2 -translate-y-1/2 ml-2 px-2 py-1 bg-neutral-900 text-white text-sm rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap">
        {label}
        <span className="ml-1.5 text-neutral-400">{shortcut}</span>
      </div>
    </button>
  );
}

export function CanvasToolbar({ activeTool, onToolChange }: CanvasToolbarProps) {
  const tools: { tool: CanvasTool; icon: React.ReactNode; label: string; shortcut: string }[] = [
    { tool: "cursor", icon: <MousePointer2 className="w-4 h-4" />, label: "Select", shortcut: "V" },
    { tool: "frame", icon: <Square className="w-4 h-4" />, label: "Frame", shortcut: "F" },
    { tool: "text", icon: <Type className="w-4 h-4" />, label: "Text", shortcut: "T" },
    { tool: "component", icon: <Component className="w-4 h-4" />, label: "Component", shortcut: "C" },
  ];

  return (
    <div className="absolute top-3 left-4 bg-white shadow-lg rounded-xl px-1.5 py-2 flex flex-col items-center gap-0.5 border border-neutral-200 z-50">
      {tools.map(({ tool, icon, label, shortcut }) => (
        <ToolButton
          key={tool}
          tool={tool}
          icon={icon}
          label={label}
          shortcut={shortcut}
          isActive={activeTool === tool}
          onClick={() => onToolChange(tool)}
        />
      ))}
    </div>
  );
}
