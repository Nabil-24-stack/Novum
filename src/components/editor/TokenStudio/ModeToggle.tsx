"use client";

import { Sun, Moon } from "lucide-react";
import type { PreviewMode } from "@/lib/tokens";

interface ModeToggleProps {
  mode: PreviewMode;
  onChange: (mode: PreviewMode) => void;
  size?: "sm" | "md";
}

export function ModeToggle({ mode, onChange, size = "md" }: ModeToggleProps) {
  const isLight = mode === "light";
  const iconSize = size === "sm" ? "w-3.5 h-3.5" : "w-4 h-4";
  const padding = size === "sm" ? "p-1" : "p-1.5";

  return (
    <div className="flex items-center bg-neutral-100 rounded-lg p-0.5">
      <button
        onClick={() => onChange("light")}
        className={`${padding} rounded-md transition-colors ${
          isLight
            ? "bg-white shadow-sm text-amber-500"
            : "text-neutral-400 hover:text-neutral-600"
        }`}
        title="Light mode"
      >
        <Sun className={iconSize} />
      </button>
      <button
        onClick={() => onChange("dark")}
        className={`${padding} rounded-md transition-colors ${
          !isLight
            ? "bg-white shadow-sm text-indigo-500"
            : "text-neutral-400 hover:text-neutral-600"
        }`}
        title="Dark mode"
      >
        <Moon className={iconSize} />
      </button>
    </div>
  );
}
