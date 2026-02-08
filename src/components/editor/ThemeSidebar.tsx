"use client";

import { useState, useEffect, useCallback } from "react";
import { Palette } from "lucide-react";

interface ThemeSidebarProps {
  files: Record<string, string>;
  writeFile: (path: string, content: string) => void;
}

interface ThemeColors {
  background: string;
  foreground: string;
  primary: string;
  secondary: string;
  muted: string;
  accent: string;
  destructive: string;
  border: string;
}

interface ThemeSettings {
  colors: ThemeColors;
  radius: number;
  font: string;
}

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

// Convert HSL string "h s% l%" to hex
function hslToHex(hslString: string): string {
  const parts = hslString.trim().split(/\s+/);
  if (parts.length < 3) return "#000000";

  const h = parseFloat(parts[0]) / 360;
  const s = parseFloat(parts[1]) / 100;
  const l = parseFloat(parts[2]) / 100;

  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };

  let r, g, b;
  if (s === 0) {
    r = g = b = l;
  } else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }

  const toHex = (x: number) => {
    const hex = Math.round(x * 255).toString(16);
    return hex.length === 1 ? "0" + hex : hex;
  };

  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

// Convert hex to HSL string "h s% l%"
function hexToHsl(hex: string): string {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return "0 0% 0%";

  const r = parseInt(result[1], 16) / 255;
  const g = parseInt(result[2], 16) / 255;
  const b = parseInt(result[3], 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
        break;
      case g:
        h = ((b - r) / d + 2) / 6;
        break;
      case b:
        h = ((r - g) / d + 4) / 6;
        break;
    }
  }

  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

// Parse CSS variables from globals.css
function parseThemeFromCss(css: string): ThemeSettings {
  const defaults: ThemeSettings = {
    colors: {
      background: "0 0% 100%",
      foreground: "240 10% 3.9%",
      primary: "240 5.9% 10%",
      secondary: "240 4.8% 95.9%",
      muted: "240 4.8% 95.9%",
      accent: "240 4.8% 95.9%",
      destructive: "0 84.2% 60.2%",
      border: "240 5.9% 90%",
    },
    radius: 0.5,
    font: "'Inter', sans-serif",
  };

  const colorKeys = Object.keys(defaults.colors) as (keyof ThemeColors)[];

  colorKeys.forEach((key) => {
    const regex = new RegExp(`--${key}:\\s*([^;]+);`);
    const match = css.match(regex);
    if (match) {
      defaults.colors[key] = match[1].trim();
    }
  });

  const radiusMatch = css.match(/--radius:\s*([0-9.]+)rem/);
  if (radiusMatch) {
    defaults.radius = parseFloat(radiusMatch[1]);
  }

  const fontMatch = css.match(/--font-sans:\s*([^;]+);/);
  if (fontMatch) {
    defaults.font = fontMatch[1].trim();
  }

  return defaults;
}

// Update CSS with new theme values
function updateCssWithTheme(css: string, theme: ThemeSettings): string {
  let updated = css;

  // Update colors
  (Object.keys(theme.colors) as (keyof ThemeColors)[]).forEach((key) => {
    const regex = new RegExp(`(--${key}:)\\s*[^;]+;`, "g");
    updated = updated.replace(regex, `$1 ${theme.colors[key]};`);
  });

  // Update radius
  updated = updated.replace(
    /(--radius:)\s*[^;]+;/g,
    `$1 ${theme.radius}rem;`
  );

  // Update font
  updated = updated.replace(
    /(--font-sans:)\s*[^;]+;/g,
    `$1 ${theme.font};`
  );

  return updated;
}

export function ThemeSidebar({ files, writeFile }: ThemeSidebarProps) {
  const [theme, setTheme] = useState<ThemeSettings | null>(null);

  // Parse theme from CSS on mount and when files change
  useEffect(() => {
    const css = files["/globals.css"];
    if (css) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Syncing state from external source
      setTheme(parseThemeFromCss(css));
    }
  }, [files]);

  const updateTheme = useCallback(
    (updates: { colors?: Partial<ThemeColors>; radius?: number; font?: string }) => {
      if (!theme) return;

      const newTheme = {
        ...theme,
        ...updates,
        colors: {
          ...theme.colors,
          ...(updates.colors || {}),
        },
      };

      setTheme(newTheme);

      // Update the CSS file
      const css = files["/globals.css"];
      if (css) {
        const updatedCss = updateCssWithTheme(css, newTheme);
        writeFile("/globals.css", updatedCss);
      }
    },
    [theme, files, writeFile]
  );

  const handleColorChange = useCallback(
    (key: keyof ThemeColors, hexValue: string) => {
      const hslValue = hexToHsl(hexValue);
      updateTheme({
        colors: { [key]: hslValue },
      });
    },
    [updateTheme]
  );

  const handleRadiusChange = useCallback(
    (value: number) => {
      updateTheme({ radius: value });
    },
    [updateTheme]
  );

  const handleFontChange = useCallback(
    (value: string) => {
      updateTheme({ font: value });
    },
    [updateTheme]
  );

  if (!theme) {
    return (
      <div className="w-64 bg-white border-l border-neutral-200 p-4">
        <p className="text-base text-neutral-500">Loading theme...</p>
      </div>
    );
  }

  const colorEntries: { key: keyof ThemeColors; label: string }[] = [
    { key: "primary", label: "Primary" },
    { key: "secondary", label: "Secondary" },
    { key: "background", label: "Background" },
    { key: "foreground", label: "Foreground" },
    { key: "muted", label: "Muted" },
    { key: "accent", label: "Accent" },
    { key: "destructive", label: "Destructive" },
    { key: "border", label: "Border" },
  ];

  return (
    <div className="w-64 bg-white border-l border-neutral-200 flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-neutral-200">
        <Palette className="w-4 h-4 text-neutral-600" />
        <h2 className="font-semibold text-neutral-800 text-base">Theme</h2>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {/* Colors Section */}
        <div>
          <h3 className="text-sm font-medium text-neutral-500 uppercase tracking-wide mb-3">
            Colors
          </h3>
          <div className="space-y-3">
            {colorEntries.map(({ key, label }) => (
              <div key={key} className="flex items-center justify-between">
                <label className="text-base text-neutral-700">{label}</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={hslToHex(theme.colors[key])}
                    onChange={(e) => handleColorChange(key, e.target.value)}
                    className="w-8 h-8 rounded border border-neutral-200 cursor-pointer"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Typography Section */}
        <div>
          <h3 className="text-sm font-medium text-neutral-500 uppercase tracking-wide mb-3">
            Typography
          </h3>
          <select
            value={theme.font}
            onChange={(e) => handleFontChange(e.target.value)}
            className="w-full px-3 py-2 text-base bg-white border border-neutral-200 rounded-md cursor-pointer hover:border-neutral-300 focus:outline-none focus:ring-2 focus:ring-neutral-200"
            style={{ fontFamily: theme.font }}
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

        {/* Radius Section */}
        <div>
          <h3 className="text-sm font-medium text-neutral-500 uppercase tracking-wide mb-3">
            Border Radius
          </h3>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-base text-neutral-500">0</span>
              <span className="text-base font-mono text-neutral-700">
                {theme.radius.toFixed(2)}rem
              </span>
              <span className="text-base text-neutral-500">2</span>
            </div>
            <input
              type="range"
              min="0"
              max="2"
              step="0.05"
              value={theme.radius}
              onChange={(e) => handleRadiusChange(parseFloat(e.target.value))}
              className="w-full h-2 bg-neutral-200 rounded-lg appearance-none cursor-pointer accent-neutral-800"
            />
          </div>
          {/* Visual Preview */}
          <div className="mt-3 flex justify-center">
            <div
              className="w-16 h-16 bg-neutral-200 border border-neutral-300"
              style={{ borderRadius: `${theme.radius}rem` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
