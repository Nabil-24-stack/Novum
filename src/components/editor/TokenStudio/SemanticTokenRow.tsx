"use client";

import { useMemo } from "react";
import type { SemanticColorName, SemanticColorValue, ColorScale } from "@/lib/tokens";
import { hslStringToHex } from "@/lib/tokens";
import { ColorSwatchPicker } from "./ColorSwatchPicker";

interface SemanticTokenRowProps {
  tokenName: SemanticColorName;
  value: SemanticColorValue;
  mode: "light" | "dark";
  availableRefs: string[];
  primitives: Record<string, ColorScale>;
  onUpdate: (ref: string) => void;
}

// Human-readable labels for token names
const TOKEN_LABELS: Record<SemanticColorName, string> = {
  background: "Background",
  foreground: "Foreground",
  card: "Card",
  "card-foreground": "Card Text",
  popover: "Popover",
  "popover-foreground": "Popover Text",
  primary: "Primary",
  "primary-foreground": "Primary Text",
  secondary: "Secondary",
  "secondary-foreground": "Secondary Text",
  muted: "Muted",
  "muted-foreground": "Muted Text",
  accent: "Accent",
  "accent-foreground": "Accent Text",
  destructive: "Destructive",
  "destructive-foreground": "Destructive Text",
  border: "Border",
  input: "Input",
  ring: "Ring",
};

function resolvePrimitiveToHex(
  ref: string,
  primitives: Record<string, ColorScale>
): string {
  const match = ref.match(/^([a-zA-Z]+)-(\d+)$/);
  if (!match) return "#808080";

  const [, paletteName, step] = match;
  const scale = primitives[paletteName];
  if (!scale) return "#808080";

  const hsl = scale[step as keyof ColorScale];
  return hsl ? hslStringToHex(hsl) : "#808080";
}

export function SemanticTokenRow({
  tokenName,
  value,
  mode,
  availableRefs,
  primitives,
  onUpdate,
}: SemanticTokenRowProps) {
  const currentRef = mode === "light" ? value.light : value.dark;
  const currentHex = useMemo(
    () => resolvePrimitiveToHex(currentRef, primitives),
    [currentRef, primitives]
  );

  return (
    <div className="flex items-center justify-between py-1.5">
      <div className="flex items-center gap-2">
        {/* Color preview swatch */}
        <div
          className="w-5 h-5 rounded border border-neutral-200"
          style={{ backgroundColor: currentHex }}
        />
        <span className="text-base text-neutral-700">
          {TOKEN_LABELS[tokenName] || tokenName}
        </span>
      </div>

      {/* Visual color swatch picker */}
      <ColorSwatchPicker
        value={currentRef}
        availableRefs={availableRefs}
        primitives={primitives}
        onChange={onUpdate}
      />
    </div>
  );
}
