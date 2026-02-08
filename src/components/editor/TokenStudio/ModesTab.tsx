"use client";

import type {
  SemanticColorName,
  SemanticColorValue,
  ColorScale,
  PreviewMode,
} from "@/lib/tokens";
import { SemanticTokenRow } from "./SemanticTokenRow";
import { ModeToggle } from "./ModeToggle";

interface ModesTabProps {
  semanticColors: Record<SemanticColorName, SemanticColorValue>;
  primitives: Record<string, ColorScale>;
  availableRefs: string[];
  previewMode: PreviewMode;
  onPreviewModeChange: (mode: PreviewMode) => void;
  onUpdateSemanticColor: (
    tokenName: SemanticColorName,
    mode: "light" | "dark",
    ref: string
  ) => void;
}

// Group semantic tokens by category for better UX
const TOKEN_GROUPS: { label: string; tokens: SemanticColorName[] }[] = [
  {
    label: "Surface",
    tokens: ["background", "foreground", "card", "card-foreground"],
  },
  {
    label: "Primary",
    tokens: ["primary", "primary-foreground"],
  },
  {
    label: "Secondary",
    tokens: ["secondary", "secondary-foreground"],
  },
  {
    label: "Muted & Accent",
    tokens: ["muted", "muted-foreground", "accent", "accent-foreground"],
  },
  {
    label: "Destructive",
    tokens: ["destructive", "destructive-foreground"],
  },
  {
    label: "Interactive",
    tokens: ["border", "input", "ring"],
  },
  {
    label: "Popover",
    tokens: ["popover", "popover-foreground"],
  },
];

export function ModesTab({
  semanticColors,
  primitives,
  availableRefs,
  previewMode,
  onPreviewModeChange,
  onUpdateSemanticColor,
}: ModesTabProps) {
  return (
    <div className="space-y-4">
      {/* Mode selector */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-neutral-500">
          Editing <span className="font-medium">{previewMode}</span> mode
        </p>
        <ModeToggle mode={previewMode} onChange={onPreviewModeChange} />
      </div>

      {/* Token groups */}
      <div className="space-y-4">
        {TOKEN_GROUPS.map((group) => (
          <div key={group.label}>
            <h4 className="text-sm font-medium text-neutral-400 uppercase tracking-wide mb-2">
              {group.label}
            </h4>
            <div className="bg-neutral-50 rounded-lg px-3 divide-y divide-neutral-200">
              {group.tokens.map((tokenName) => {
                const value = semanticColors[tokenName];
                if (!value) return null;
                return (
                  <SemanticTokenRow
                    key={tokenName}
                    tokenName={tokenName}
                    value={value}
                    mode={previewMode}
                    availableRefs={availableRefs}
                    primitives={primitives}
                    onUpdate={(ref) =>
                      onUpdateSemanticColor(tokenName, previewMode, ref)
                    }
                  />
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
