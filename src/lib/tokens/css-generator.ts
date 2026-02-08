/**
 * CSS Generator
 * Converts TokenState to CSS with :root and .dark blocks
 */

import type { TokenState, ColorScale } from "./types";

const STEPS: (keyof ColorScale)[] = ["50", "100", "200", "300", "400", "500", "600", "700", "800", "900", "950"];

/**
 * Generate primitive CSS variables for all color scales
 */
function generatePrimitiveVars(primitives: TokenState["primitives"]): string {
  const lines: string[] = [];

  for (const [paletteName, scale] of Object.entries(primitives.colors)) {
    for (const step of STEPS) {
      const value = scale[step];
      if (value) {
        lines.push(`    --${paletteName}-${step}: ${value};`);
      }
    }
    lines.push(""); // Empty line between palettes
  }

  return lines.join("\n").trimEnd();
}

/**
 * Generate semantic CSS variables using var() references to primitives
 */
function generateSemanticVars(
  semantics: TokenState["semantics"],
  mode: "light" | "dark"
): string {
  const lines: string[] = [];
  const colors = semantics.colors;

  for (const [tokenName, value] of Object.entries(colors)) {
    const ref = mode === "light" ? value.light : value.dark;
    // Use var() reference to primitive
    const varRef = `var(--${ref.replace("-", "-")})`;
    lines.push(`    --${tokenName}: ${varRef};`);
  }

  return lines.join("\n");
}

/**
 * Generate global CSS variables (radius, typography)
 */
function generateGlobalVars(globals: TokenState["globals"]): string {
  const lines: string[] = [];

  // Radius
  lines.push(`    --radius: ${globals.radius.md};`);
  lines.push(`    --radius-sm: ${globals.radius.sm};`);
  lines.push(`    --radius-lg: ${globals.radius.lg};`);
  lines.push(`    --radius-xl: ${globals.radius.xl};`);

  // Typography - fonts
  lines.push(`    --font-sans: ${globals.typography.fontSans};`);
  lines.push(`    --font-mono: ${globals.typography.fontMono};`);

  // Typography - scale (modular scale: baseSize * ratio^step)
  const base = globals.typography?.baseSize ?? 16;
  const ratio = globals.typography?.scaleRatio ?? 1.25;
  const wRegular = globals.typography?.weightRegular ?? 400;
  const wBold = globals.typography?.weightBold ?? 700;

  const scaleSteps: { name: string; step: number; lh: string }[] = [
    { name: "h1", step: 4, lh: "1.1" },
    { name: "h2", step: 3, lh: "1.2" },
    { name: "h3", step: 2, lh: "1.3" },
    { name: "h4", step: 1, lh: "1.4" },
    { name: "body", step: 0, lh: "1.5" },
    { name: "body-sm", step: -1, lh: "1.5" },
    { name: "caption", step: -2, lh: "1.4" },
  ];

  for (const { name, step, lh } of scaleSteps) {
    const sizeRem = (base * Math.pow(ratio, step)) / 16;
    lines.push(`    --text-${name}: ${sizeRem.toFixed(4)}rem;`);
    lines.push(`    --text-${name}-lh: ${lh};`);
  }

  // Typography - weights
  lines.push(`    --font-weight-regular: ${wRegular};`);
  lines.push(`    --font-weight-bold: ${wBold};`);

  // Spacing unit
  const baseUnit = globals.spacing?.baseUnit ?? 4;
  const unitRem = baseUnit / 16;
  lines.push(`    --spacing-unit: ${unitRem}rem;`);

  return lines.join("\n");
}

function mapShadow(shadow: TokenState["components"]["button"]["shadow"]): string {
  switch (shadow) {
    case "sm":
      return "0 1px 2px 0 rgb(0 0 0 / 0.05)";
    case "md":
      return "0 4px 6px -1px rgb(0 0 0 / 0.10), 0 2px 4px -2px rgb(0 0 0 / 0.10)";
    case "lg":
      return "0 10px 15px -3px rgb(0 0 0 / 0.10), 0 4px 6px -4px rgb(0 0 0 / 0.10)";
    default:
      return "none";
  }
}

function generateComponentVars(tokens: TokenState): string {
  const lines: string[] = [];
  const names: Array<keyof TokenState["components"]> = [
    "button",
    "card",
    "input",
    "badge",
    "dialog",
    "tabs",
  ];

  for (const name of names) {
    const spec = tokens.components[name] ?? {};
    const radiusKey = spec.radius ?? "md";
    const radius = tokens.globals.radius[radiusKey] ?? tokens.globals.radius.md;
    const borderWidth = `${spec.border ?? 0}px`;
    const shadow = mapShadow(spec.shadow ?? "none");

    lines.push(`    --${name}-radius: ${radius};`);
    lines.push(`    --${name}-border-width: ${borderWidth};`);
    lines.push(`    --${name}-shadow: ${shadow};`);
  }

  return lines.join("\n");
}

/**
 * Generate complete CSS from TokenState
 */
export function generateCSS(tokens: TokenState): string {
  const fontImport = `@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500;600;700&family=DM+Sans:wght@400;500;600;700&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700&family=Lora:wght@400;500;600;700&family=Manrope:wght@400;500;600;700&family=Outfit:wght@400;500;600;700&family=Playfair+Display:wght@400;500;600;700&family=Plus+Jakarta+Sans:wght@400;500;600;700&family=Poppins:wght@400;500;600;700&family=Space+Grotesk:wght@400;500;600;700&display=swap');`;

  const tailwindDirectives = `@tailwind base;
@tailwind components;
@tailwind utilities;`;

  const primitiveVars = generatePrimitiveVars(tokens.primitives);
  const lightSemanticVars = generateSemanticVars(tokens.semantics, "light");
  const darkSemanticVars = generateSemanticVars(tokens.semantics, "dark");
  const globalVars = generateGlobalVars(tokens.globals);
  const componentVars = generateComponentVars(tokens);

  return `${fontImport}

${tailwindDirectives}

@layer base {
  :root {
    /* Primitives (same in light and dark) */
${primitiveVars}

    /* Semantics (light mode values) */
${lightSemanticVars}

    /* Globals */
${globalVars}

    /* Component specs */
${componentVars}
  }

  .dark {
    /* Semantics (dark mode values) */
${darkSemanticVars}
  }
}

@layer base {
  * {
    @apply border-border;
  }
  body {
    @apply bg-background text-foreground;
    font-family: var(--font-sans);
  }
}
`;
}

/**
 * Parse tokens.json content
 */
export function parseTokens(content: string): TokenState | null {
  try {
    const parsed = JSON.parse(content);
    if (parsed.version === "1.0") {
      return parsed as TokenState;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Serialize TokenState to JSON string
 */
export function serializeTokens(tokens: TokenState): string {
  return JSON.stringify(tokens, null, 2);
}

/**
 * Extract base color from a color scale (returns the "500" value as hex approx)
 * This is a rough approximation for the color picker
 */
export function getBaseColorFromScale(scale: ColorScale): string {
  const hsl500 = scale["500"];
  if (!hsl500) return "#808080";

  // Parse "h s% l%" format
  const parts = hsl500.trim().split(/\s+/);
  if (parts.length < 3) return "#808080";

  const h = parseFloat(parts[0]);
  const s = parseFloat(parts[1]) / 100;
  const l = parseFloat(parts[2]) / 100;

  // Convert HSL to hex
  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1/6) return p + (q - p) * 6 * t;
    if (t < 1/2) return q;
    if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
    return p;
  };

  let r: number, g: number, b: number;
  if (s === 0) {
    r = g = b = l;
  } else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h/360 + 1/3);
    g = hue2rgb(p, q, h/360);
    b = hue2rgb(p, q, h/360 - 1/3);
  }

  const toHex = (x: number) => {
    const hex = Math.round(x * 255).toString(16);
    return hex.length === 1 ? "0" + hex : hex;
  };

  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}
