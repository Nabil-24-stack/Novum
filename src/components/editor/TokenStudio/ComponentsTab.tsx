"use client";

import type { ComponentName, ComponentSpec, RadiusPreset } from "@/lib/tokens";

interface ComponentsTabProps {
  components: Record<ComponentName, ComponentSpec>;
  onUpdateComponent: (name: ComponentName, spec: Partial<ComponentSpec>) => void;
  globalRadius: string;
  onUpdateGlobalRadius: (value: string) => void;
  fontSans: string;
  onUpdateFontSans: (value: string) => void;
}

const COMPONENT_LABELS: Record<ComponentName, string> = {
  button: "Button",
  card: "Card",
  input: "Input",
  badge: "Badge",
  dialog: "Dialog",
  tabs: "Tabs",
};

const RADIUS_OPTIONS: { value: RadiusPreset; label: string }[] = [
  { value: "none", label: "None" },
  { value: "sm", label: "Small" },
  { value: "md", label: "Medium" },
  { value: "lg", label: "Large" },
  { value: "xl", label: "Extra Large" },
  { value: "full", label: "Full" },
];

const SHADOW_OPTIONS = [
  { value: "none", label: "None" },
  { value: "sm", label: "Small" },
  { value: "md", label: "Medium" },
  { value: "lg", label: "Large" },
];

const FONT_OPTIONS = [
  { value: "'Inter', sans-serif", label: "Inter" },
  { value: "'Plus Jakarta Sans', sans-serif", label: "Plus Jakarta Sans" },
  { value: "'DM Sans', sans-serif", label: "DM Sans" },
  { value: "'Outfit', sans-serif", label: "Outfit" },
  { value: "'Manrope', sans-serif", label: "Manrope" },
  { value: "'Space Grotesk', sans-serif", label: "Space Grotesk" },
  { value: "'Poppins', sans-serif", label: "Poppins" },
  { value: "'Playfair Display', serif", label: "Playfair Display" },
  { value: "'Lora', serif", label: "Lora" },
  { value: "'Cormorant Garamond', serif", label: "Cormorant Garamond" },
];

// Convert rem string to slider value (0 to 2, step 0.125)
function radiusToSlider(radius: string): number {
  const match = radius.match(/([\d.]+)rem/);
  return match ? parseFloat(match[1]) : 0.5;
}

// Convert slider value to rem string
function sliderToRadius(value: number): string {
  return `${value}rem`;
}

export function ComponentsTab({
  components,
  onUpdateComponent,
  globalRadius,
  onUpdateGlobalRadius,
  fontSans,
  onUpdateFontSans,
}: ComponentsTabProps) {
  const radiusValue = radiusToSlider(globalRadius);

  return (
    <div className="space-y-5">
      {/* Global Settings */}
      <div>
        <h4 className="text-sm font-medium text-neutral-400 uppercase tracking-wide mb-3">
          Global
        </h4>

        {/* Base Radius */}
        <div className="bg-neutral-50 rounded-lg p-3 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-base text-neutral-700">Base Radius</span>
            <span className="text-sm font-mono text-neutral-500">
              {radiusValue.toFixed(2)}rem
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-neutral-400">0</span>
            <input
              type="range"
              min="0"
              max="2"
              step="0.125"
              value={radiusValue}
              onChange={(e) =>
                onUpdateGlobalRadius(sliderToRadius(parseFloat(e.target.value)))
              }
              className="flex-1 h-2 bg-neutral-200 rounded-lg appearance-none cursor-pointer accent-neutral-800"
            />
            <span className="text-sm text-neutral-400">2</span>
          </div>
          {/* Visual preview */}
          <div className="flex justify-center pt-1">
            <div
              className="w-14 h-14 bg-neutral-200 border border-neutral-300"
              style={{ borderRadius: globalRadius }}
            />
          </div>
        </div>

        {/* Font */}
        <div className="mt-3 bg-neutral-50 rounded-lg p-3">
          <div className="flex items-center justify-between">
            <span className="text-base text-neutral-700">Font Family</span>
          </div>
          <select
            value={fontSans}
            onChange={(e) => onUpdateFontSans(e.target.value)}
            className="mt-2 w-full px-2 py-1.5 text-base bg-white border border-neutral-200 rounded cursor-pointer hover:border-neutral-300 focus:outline-none focus:ring-1 focus:ring-neutral-300"
            style={{ fontFamily: fontSans }}
          >
            {FONT_OPTIONS.map((font) => (
              <option
                key={font.value}
                value={font.value}
                style={{ fontFamily: font.value }}
              >
                {font.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Component-specific settings */}
      <div>
        <h4 className="text-sm font-medium text-neutral-400 uppercase tracking-wide mb-3">
          Components
        </h4>

        <div className="space-y-2">
          {(Object.keys(COMPONENT_LABELS) as ComponentName[]).map((name) => {
            const spec = components[name] || {};
            return (
              <div
                key={name}
                className="bg-neutral-50 rounded-lg p-3 space-y-2"
              >
                <span className="text-base font-medium text-neutral-800">
                  {COMPONENT_LABELS[name]}
                </span>

                <div className="grid grid-cols-2 gap-2">
                  {/* Radius */}
                  <div>
                    <label className="text-sm text-neutral-500">Radius</label>
                    <select
                      value={spec.radius || "md"}
                      onChange={(e) =>
                        onUpdateComponent(name, {
                          radius: e.target.value as RadiusPreset,
                        })
                      }
                      className="w-full mt-0.5 px-2 py-1 text-sm bg-white border border-neutral-200 rounded cursor-pointer hover:border-neutral-300 focus:outline-none focus:ring-1 focus:ring-neutral-300"
                    >
                      {RADIUS_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Shadow */}
                  <div>
                    <label className="text-sm text-neutral-500">Shadow</label>
                    <select
                      value={spec.shadow || "none"}
                      onChange={(e) =>
                        onUpdateComponent(name, {
                          shadow: e.target.value as ComponentSpec["shadow"],
                        })
                      }
                      className="w-full mt-0.5 px-2 py-1 text-sm bg-white border border-neutral-200 rounded cursor-pointer hover:border-neutral-300 focus:outline-none focus:ring-1 focus:ring-neutral-300"
                    >
                      {SHADOW_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Border toggle */}
                <div className="flex items-center justify-between">
                  <label className="text-sm text-neutral-500">Border</label>
                  <button
                    onClick={() =>
                      onUpdateComponent(name, {
                        border: spec.border ? 0 : 1,
                      })
                    }
                    className={`w-8 h-5 rounded-full transition-colors ${
                      spec.border
                        ? "bg-neutral-800"
                        : "bg-neutral-200"
                    }`}
                  >
                    <div
                      className={`w-4 h-4 rounded-full bg-white shadow transition-transform ${
                        spec.border ? "translate-x-3.5" : "translate-x-0.5"
                      }`}
                    />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
