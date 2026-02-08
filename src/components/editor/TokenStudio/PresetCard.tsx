"use client";

import { Check } from "lucide-react";
import type { Preset } from "@/lib/tokens/presets";

interface PresetCardProps {
  preset: Preset;
  isSelected: boolean;
  onClick: () => void;
}

export function PresetCard({ preset, isSelected, onClick }: PresetCardProps) {
  const { preview } = preset;

  return (
    <button
      onClick={onClick}
      className={`w-full text-left p-3 rounded-lg border transition-all ${
        isSelected
          ? "border-neutral-800 bg-neutral-50 ring-1 ring-neutral-800"
          : "border-neutral-200 bg-white hover:border-neutral-300 hover:bg-neutral-50"
      }`}
    >
      {/* Color Preview Strip */}
      <div className="flex gap-1.5 mb-3">
        <div
          className="w-8 h-8 rounded-md border border-neutral-200"
          style={{ backgroundColor: preview.background }}
          title="Background"
        />
        <div
          className="w-8 h-8 rounded-md border border-neutral-200"
          style={{ backgroundColor: preview.primary }}
          title="Primary"
        />
        <div
          className="w-8 h-8 rounded-md border border-neutral-200"
          style={{ backgroundColor: preview.accent }}
          title="Accent"
        />
        <div
          className="w-8 h-8 rounded-md border border-neutral-200"
          style={{ backgroundColor: preview.foreground }}
          title="Foreground"
        />
      </div>

      {/* Name and Description */}
      <div className="flex items-start justify-between">
        <div>
          <h3 className="font-medium text-neutral-900 text-sm">{preset.name}</h3>
          <p className="text-xs text-neutral-500 mt-0.5">{preset.description}</p>
        </div>

        {/* Selection Indicator */}
        {isSelected && (
          <div className="flex items-center gap-1 text-xs text-neutral-600 bg-neutral-100 px-2 py-1 rounded">
            <Check className="w-3 h-3" />
            <span>Selected</span>
          </div>
        )}
      </div>
    </button>
  );
}
