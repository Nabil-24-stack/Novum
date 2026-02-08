"use client";

import { Settings } from "lucide-react";
import { PRESETS } from "@/lib/tokens/presets";
import { PresetCard } from "./PresetCard";

interface PresetPanelProps {
  currentPresetId: string | null;
  onSelectPreset: (presetId: string) => void;
  onCustomise: () => void;
}

export function PresetPanel({
  currentPresetId,
  onSelectPreset,
  onCustomise,
}: PresetPanelProps) {
  return (
    <div className="space-y-4">
      {/* Description */}
      <p className="text-sm text-neutral-600">
        Choose a style preset to quickly transform your design system.
      </p>

      {/* Preset Cards */}
      <div className="space-y-2">
        {PRESETS.map((preset) => (
          <PresetCard
            key={preset.id}
            preset={preset}
            isSelected={currentPresetId === preset.id}
            onClick={() => onSelectPreset(preset.id)}
          />
        ))}
      </div>

      {/* Customise Button */}
      <button
        onClick={onCustomise}
        className="w-full flex items-center justify-center gap-2 py-2.5 px-4 text-sm font-medium text-neutral-700 bg-neutral-100 hover:bg-neutral-200 rounded-lg transition-colors"
      >
        <Settings className="w-4 h-4" />
        Customise
      </button>
    </div>
  );
}
