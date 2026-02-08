// Shadcn-compatible Tailwind config for CDN injection
// This config is injected via data URL after the Tailwind CDN loads,
// enabling custom color classes like bg-primary to work with CSS variables

// Generate spacing scale: each key maps to calc(var(--spacing-unit) * N)
function buildSpacingScale(): Record<string, string> {
  const scale: Record<string, string> = {
    px: "1px",
    0: "0px",
  };
  const keys = [
    0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 5, 6, 7, 8, 9, 10, 11, 12,
    14, 16, 20, 24, 28, 32, 36, 40, 44, 48, 52, 56, 60, 64, 72, 80, 96,
  ];
  for (const k of keys) {
    scale[String(k)] = `calc(var(--spacing-unit) * ${k})`;
  }
  return scale;
}

const shadcnTailwindConfig = {
  darkMode: ["class"],
  theme: {
    spacing: buildSpacingScale(),
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      fontSize: {
        h1: ["var(--text-h1)", { lineHeight: "var(--text-h1-lh)", fontWeight: "var(--font-weight-bold)" }],
        h2: ["var(--text-h2)", { lineHeight: "var(--text-h2-lh)", fontWeight: "var(--font-weight-bold)" }],
        h3: ["var(--text-h3)", { lineHeight: "var(--text-h3-lh)", fontWeight: "var(--font-weight-bold)" }],
        h4: ["var(--text-h4)", { lineHeight: "var(--text-h4-lh)", fontWeight: "var(--font-weight-bold)" }],
        body: ["var(--text-body)", { lineHeight: "var(--text-body-lh)", fontWeight: "var(--font-weight-regular)" }],
        "body-sm": ["var(--text-body-sm)", { lineHeight: "var(--text-body-sm-lh)", fontWeight: "var(--font-weight-regular)" }],
        caption: ["var(--text-caption)", { lineHeight: "var(--text-caption-lh)", fontWeight: "var(--font-weight-regular)" }],
      },
    },
  },
};

export function getTailwindConfigDataUrl(): string {
  const script = `tailwind.config = ${JSON.stringify(shadcnTailwindConfig)};`;
  return `data:text/javascript;charset=utf-8,${encodeURIComponent(script)}`;
}
