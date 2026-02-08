/**
 * Token Template
 * Generates default /tokens.json and /globals.css for the VFS
 */

export const tokensJsonTemplate = `{
  "version": "1.0",
  "primitives": {
    "colors": {
      "brand": {
        "50": "217 91% 97%",
        "100": "217 91% 94%",
        "200": "217 91% 86%",
        "300": "217 91% 74%",
        "400": "217 91% 60%",
        "500": "217 91% 51%",
        "600": "217 91% 45%",
        "700": "217 91% 38%",
        "800": "217 91% 30%",
        "900": "217 91% 22%",
        "950": "217 91% 12%"
      },
      "neutral": {
        "50": "0 0% 98%",
        "100": "0 0% 96%",
        "200": "0 0% 90%",
        "300": "0 0% 83%",
        "400": "0 0% 64%",
        "500": "0 0% 45%",
        "600": "0 0% 32%",
        "700": "0 0% 25%",
        "800": "0 0% 15%",
        "900": "0 0% 9%",
        "950": "0 0% 4%"
      },
      "success": {
        "50": "142 76% 97%",
        "100": "142 76% 93%",
        "200": "142 76% 83%",
        "300": "142 76% 68%",
        "400": "142 69% 49%",
        "500": "142 71% 40%",
        "600": "142 76% 33%",
        "700": "142 76% 27%",
        "800": "142 76% 21%",
        "900": "142 76% 16%",
        "950": "142 76% 9%"
      },
      "warning": {
        "50": "45 93% 97%",
        "100": "45 93% 93%",
        "200": "45 93% 82%",
        "300": "45 93% 68%",
        "400": "45 93% 52%",
        "500": "45 93% 44%",
        "600": "45 93% 36%",
        "700": "45 93% 29%",
        "800": "45 93% 22%",
        "900": "45 93% 16%",
        "950": "45 93% 9%"
      },
      "error": {
        "50": "0 86% 97%",
        "100": "0 86% 94%",
        "200": "0 86% 87%",
        "300": "0 86% 76%",
        "400": "0 84% 63%",
        "500": "0 84% 53%",
        "600": "0 72% 46%",
        "700": "0 74% 38%",
        "800": "0 70% 31%",
        "900": "0 63% 25%",
        "950": "0 75% 14%"
      },
      "info": {
        "50": "199 89% 97%",
        "100": "199 89% 93%",
        "200": "199 89% 84%",
        "300": "199 89% 72%",
        "400": "199 89% 57%",
        "500": "199 89% 48%",
        "600": "199 89% 40%",
        "700": "199 89% 33%",
        "800": "199 89% 26%",
        "900": "199 89% 19%",
        "950": "199 89% 11%"
      }
    },
    "baseColors": {
      "brand": "#3b82f6",
      "neutral": "#737373",
      "success": "#22c55e",
      "warning": "#eab308",
      "error": "#ef4444",
      "info": "#0ea5e9"
    }
  },
  "semantics": {
    "colors": {
      "background": { "light": "neutral-50", "dark": "neutral-950" },
      "foreground": { "light": "neutral-950", "dark": "neutral-50" },
      "card": { "light": "neutral-50", "dark": "neutral-900" },
      "card-foreground": { "light": "neutral-950", "dark": "neutral-50" },
      "popover": { "light": "neutral-50", "dark": "neutral-900" },
      "popover-foreground": { "light": "neutral-950", "dark": "neutral-50" },
      "primary": { "light": "brand-600", "dark": "brand-400" },
      "primary-foreground": { "light": "neutral-50", "dark": "neutral-950" },
      "secondary": { "light": "neutral-100", "dark": "neutral-800" },
      "secondary-foreground": { "light": "neutral-900", "dark": "neutral-100" },
      "muted": { "light": "neutral-100", "dark": "neutral-800" },
      "muted-foreground": { "light": "neutral-500", "dark": "neutral-400" },
      "accent": { "light": "neutral-100", "dark": "neutral-800" },
      "accent-foreground": { "light": "neutral-900", "dark": "neutral-100" },
      "destructive": { "light": "error-500", "dark": "error-400" },
      "destructive-foreground": { "light": "neutral-50", "dark": "neutral-950" },
      "border": { "light": "neutral-200", "dark": "neutral-800" },
      "input": { "light": "neutral-200", "dark": "neutral-800" },
      "ring": { "light": "brand-500", "dark": "brand-400" }
    }
  },
  "components": {
    "button": { "radius": "md", "border": 0, "shadow": "none" },
    "card": { "radius": "lg", "border": 1, "shadow": "sm" },
    "input": { "radius": "md", "border": 1, "shadow": "none" },
    "badge": { "radius": "full", "border": 0, "shadow": "none" },
    "dialog": { "radius": "lg", "border": 1, "shadow": "lg" },
    "tabs": { "radius": "md", "border": 0, "shadow": "none" }
  },
  "globals": {
    "radius": {
      "none": "0",
      "sm": "0.25rem",
      "md": "0.5rem",
      "lg": "0.75rem",
      "xl": "1rem",
      "full": "9999px"
    },
    "typography": {
      "fontSans": "'Inter', sans-serif",
      "fontMono": "'JetBrains Mono', monospace"
    }
  }
}`;

export const globalsCssTemplate = `@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500;600;700&family=DM+Sans:wght@400;500;600;700&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700&family=Lora:wght@400;500;600;700&family=Manrope:wght@400;500;600;700&family=Outfit:wght@400;500;600;700&family=Playfair+Display:wght@400;500;600;700&family=Plus+Jakarta+Sans:wght@400;500;600;700&family=Poppins:wght@400;500;600;700&family=Space+Grotesk:wght@400;500;600;700&display=swap');

@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    /* Primitives (same in light and dark) */
    --brand-50: 217 91% 97%;
    --brand-100: 217 91% 94%;
    --brand-200: 217 91% 86%;
    --brand-300: 217 91% 74%;
    --brand-400: 217 91% 60%;
    --brand-500: 217 91% 51%;
    --brand-600: 217 91% 45%;
    --brand-700: 217 91% 38%;
    --brand-800: 217 91% 30%;
    --brand-900: 217 91% 22%;
    --brand-950: 217 91% 12%;

    --neutral-50: 0 0% 98%;
    --neutral-100: 0 0% 96%;
    --neutral-200: 0 0% 90%;
    --neutral-300: 0 0% 83%;
    --neutral-400: 0 0% 64%;
    --neutral-500: 0 0% 45%;
    --neutral-600: 0 0% 32%;
    --neutral-700: 0 0% 25%;
    --neutral-800: 0 0% 15%;
    --neutral-900: 0 0% 9%;
    --neutral-950: 0 0% 4%;

    --success-50: 142 76% 97%;
    --success-100: 142 76% 93%;
    --success-200: 142 76% 83%;
    --success-300: 142 76% 68%;
    --success-400: 142 69% 49%;
    --success-500: 142 71% 40%;
    --success-600: 142 76% 33%;
    --success-700: 142 76% 27%;
    --success-800: 142 76% 21%;
    --success-900: 142 76% 16%;
    --success-950: 142 76% 9%;

    --warning-50: 45 93% 97%;
    --warning-100: 45 93% 93%;
    --warning-200: 45 93% 82%;
    --warning-300: 45 93% 68%;
    --warning-400: 45 93% 52%;
    --warning-500: 45 93% 44%;
    --warning-600: 45 93% 36%;
    --warning-700: 45 93% 29%;
    --warning-800: 45 93% 22%;
    --warning-900: 45 93% 16%;
    --warning-950: 45 93% 9%;

    --error-50: 0 86% 97%;
    --error-100: 0 86% 94%;
    --error-200: 0 86% 87%;
    --error-300: 0 86% 76%;
    --error-400: 0 84% 63%;
    --error-500: 0 84% 53%;
    --error-600: 0 72% 46%;
    --error-700: 0 74% 38%;
    --error-800: 0 70% 31%;
    --error-900: 0 63% 25%;
    --error-950: 0 75% 14%;

    --info-50: 199 89% 97%;
    --info-100: 199 89% 93%;
    --info-200: 199 89% 84%;
    --info-300: 199 89% 72%;
    --info-400: 199 89% 57%;
    --info-500: 199 89% 48%;
    --info-600: 199 89% 40%;
    --info-700: 199 89% 33%;
    --info-800: 199 89% 26%;
    --info-900: 199 89% 19%;
    --info-950: 199 89% 11%;

    /* Semantics (light mode values) */
    --background: var(--neutral-50);
    --foreground: var(--neutral-950);
    --card: var(--neutral-50);
    --card-foreground: var(--neutral-950);
    --popover: var(--neutral-50);
    --popover-foreground: var(--neutral-950);
    --primary: var(--brand-600);
    --primary-foreground: var(--neutral-50);
    --secondary: var(--neutral-100);
    --secondary-foreground: var(--neutral-900);
    --muted: var(--neutral-100);
    --muted-foreground: var(--neutral-500);
    --accent: var(--neutral-100);
    --accent-foreground: var(--neutral-900);
    --destructive: var(--error-500);
    --destructive-foreground: var(--neutral-50);
    --border: var(--neutral-200);
    --input: var(--neutral-200);
    --ring: var(--brand-500);

    /* Globals */
    --radius: 0.5rem;
    --radius-sm: 0.25rem;
    --radius-lg: 0.75rem;
    --radius-xl: 1rem;
    --font-sans: 'Inter', sans-serif;
    --font-mono: 'JetBrains Mono', monospace;

    /* Component specs */
    --button-radius: 0.5rem;
    --button-border-width: 0px;
    --button-shadow: none;
    --card-radius: 0.75rem;
    --card-border-width: 1px;
    --card-shadow: 0 1px 2px 0 rgb(0 0 0 / 0.05);
    --input-radius: 0.5rem;
    --input-border-width: 1px;
    --input-shadow: none;
    --badge-radius: 9999px;
    --badge-border-width: 0px;
    --badge-shadow: none;
    --dialog-radius: 0.75rem;
    --dialog-border-width: 1px;
    --dialog-shadow: 0 10px 15px -3px rgb(0 0 0 / 0.10), 0 4px 6px -4px rgb(0 0 0 / 0.10);
    --tabs-radius: 0.5rem;
    --tabs-border-width: 0px;
    --tabs-shadow: none;
  }

  .dark {
    /* Semantics (dark mode values) */
    --background: var(--neutral-950);
    --foreground: var(--neutral-50);
    --card: var(--neutral-900);
    --card-foreground: var(--neutral-50);
    --popover: var(--neutral-900);
    --popover-foreground: var(--neutral-50);
    --primary: var(--brand-400);
    --primary-foreground: var(--neutral-950);
    --secondary: var(--neutral-800);
    --secondary-foreground: var(--neutral-100);
    --muted: var(--neutral-800);
    --muted-foreground: var(--neutral-400);
    --accent: var(--neutral-800);
    --accent-foreground: var(--neutral-100);
    --destructive: var(--error-400);
    --destructive-foreground: var(--neutral-950);
    --border: var(--neutral-800);
    --input: var(--neutral-800);
    --ring: var(--brand-400);
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
