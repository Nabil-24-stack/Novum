"use client";

import type { ComponentName, ComponentSpec, RadiusPreset } from "@/lib/tokens";

interface ComponentsTabProps {
  components: Record<ComponentName, ComponentSpec>;
  onUpdateComponent: (name: ComponentName, spec: Partial<ComponentSpec>) => void;
  globalRadius: Record<RadiusPreset, string>;
  onUpdateGlobalRadius: (radiusName: RadiusPreset, value: string) => void;
  fontSans: string;
  fontMono: string;
  onUpdateFontSans: (value: string) => void;
  onUpdateFontMono: (value: string) => void;
}

const COMPONENT_LABELS: Record<ComponentName, string> = {
  button: "Button",
  card: "Card",
  input: "Input",
  badge: "Badge",
  select: "Select",
  textarea: "Textarea",
  tabs: "Tabs",
  dialog: "Dialog",
  alert: "Alert",
  popover: "Popover",
  tooltip: "Tooltip",
  toast: "Toast",
  "date-picker": "Date Picker",
  toggle: "Toggle",
};

const RADIUS_OPTIONS: { value: RadiusPreset; label: string }[] = [
  { value: "none", label: "None" },
  { value: "sm", label: "Small" },
  { value: "md", label: "Medium" },
  { value: "lg", label: "Large" },
  { value: "xl", label: "Extra Large" },
  { value: "full", label: "Full" },
];

const GLOBAL_RADIUS_FIELDS: { key: RadiusPreset; label: string }[] = [
  { key: "none", label: "None" },
  { key: "sm", label: "Small" },
  { key: "md", label: "Medium" },
  { key: "lg", label: "Large" },
  { key: "xl", label: "Extra Large" },
  { key: "full", label: "Full" },
];

const SHADOW_OPTIONS = [
  { value: "none", label: "None" },
  { value: "sm", label: "Small" },
  { value: "md", label: "Medium" },
  { value: "lg", label: "Large" },
];

const FONT_OPTIONS = [
  { value: "'Geist', 'Inter', sans-serif", label: "Geist" },
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

const MONO_FONT_OPTIONS = [
  { value: "'Geist Mono', 'JetBrains Mono', monospace", label: "Geist Mono" },
  { value: "'JetBrains Mono', monospace", label: "JetBrains Mono" },
  { value: "'SFMono-Regular', 'SF Mono', monospace", label: "SF Mono" },
];

function radiusToInputValue(radius: string): string {
  if (radius === "0" || radius.endsWith("px")) {
    return radius;
  }

  const match = radius.match(/([\d.]+)rem/);
  return match ? `${parseFloat(match[1])}rem` : radius;
}

export function ComponentsTab({
  components,
  onUpdateComponent,
  globalRadius,
  onUpdateGlobalRadius,
  fontSans,
  fontMono,
  onUpdateFontSans,
  onUpdateFontMono,
}: ComponentsTabProps) {
  return (
    <div className="space-y-5">
      <div>
        <h4 className="text-sm font-medium text-neutral-400 uppercase tracking-wide mb-3">
          Global
        </h4>

        <div className="bg-neutral-50 rounded-lg p-3 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-base text-neutral-700">Radius Scale</span>
            <span className="text-sm text-neutral-500">Explicit tokens</span>
          </div>
          <div className="space-y-2">
            {GLOBAL_RADIUS_FIELDS.map(({ key, label }) => (
              <div
                key={key}
                className="grid grid-cols-[88px,1fr,48px] items-center gap-2"
              >
                <label className="text-sm text-neutral-500">{label}</label>
                <input
                  type="text"
                  value={radiusToInputValue(globalRadius[key])}
                  onChange={(e) => onUpdateGlobalRadius(key, e.target.value)}
                  className="w-full px-2 py-1.5 text-sm bg-white border border-neutral-200 rounded cursor-text hover:border-neutral-300 focus:outline-none focus:ring-1 focus:ring-neutral-300"
                />
                <div
                  className="h-8 w-8 justify-self-end bg-neutral-200 border border-neutral-300"
                  style={{ borderRadius: globalRadius[key] }}
                />
              </div>
            ))}
          </div>
        </div>

        <div className="mt-3 bg-neutral-50 rounded-lg p-3">
          <div className="flex items-center justify-between">
            <span className="text-base text-neutral-700">Sans Font</span>
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

        <div className="mt-3 bg-neutral-50 rounded-lg p-3">
          <div className="flex items-center justify-between">
            <span className="text-base text-neutral-700">Mono Font</span>
          </div>
          <select
            value={fontMono}
            onChange={(e) => onUpdateFontMono(e.target.value)}
            className="mt-2 w-full px-2 py-1.5 text-base bg-white border border-neutral-200 rounded cursor-pointer hover:border-neutral-300 focus:outline-none focus:ring-1 focus:ring-neutral-300"
            style={{ fontFamily: fontMono }}
          >
            {MONO_FONT_OPTIONS.map((font) => (
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

                <div className="flex items-center justify-between">
                  <label className="text-sm text-neutral-500">Border</label>
                  <button
                    onClick={() =>
                      onUpdateComponent(name, {
                        border: spec.border ? 0 : 1,
                      })
                    }
                    className={`w-8 h-5 rounded-full transition-colors ${
                      spec.border ? "bg-neutral-800" : "bg-neutral-200"
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
