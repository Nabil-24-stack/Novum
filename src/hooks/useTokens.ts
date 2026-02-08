"use client";

import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import {
  TokenState,
  PreviewMode,
  SemanticColorName,
  SemanticColorValue,
  ComponentName,
  ComponentSpec,
  defaultTokenState,
  generateColorScale,
  generateCSS,
  parseTokens,
  serializeTokens,
} from "@/lib/tokens";

interface UseTokensProps {
  files: Record<string, string>;
  writeFile: (path: string, content: string) => void;
}

export interface UseTokensReturn {
  tokens: TokenState;
  previewMode: PreviewMode;
  setPreviewMode: (mode: PreviewMode) => void;

  // Preset operations
  applyPreset: (presetTokens: TokenState) => void;

  // Primitive operations
  updatePaletteBase: (paletteName: string, baseColor: string) => void;
  addPalette: (name: string, baseColor: string) => void;
  removePalette: (name: string) => void;
  renamePalette: (oldName: string, newName: string) => void;

  // Semantic operations
  updateSemanticColor: (
    tokenName: SemanticColorName,
    mode: "light" | "dark",
    primitiveRef: string
  ) => void;

  // Component operations
  updateComponentSpec: (
    componentName: ComponentName,
    spec: Partial<ComponentSpec>
  ) => void;

  // Global operations
  updateGlobalRadius: (value: string) => void;
  updateGlobalFont: (font: "fontSans" | "fontMono", value: string) => void;

  // Typography operations
  updateTypographyBaseSize: (size: number) => void;
  updateTypographyScaleRatio: (ratio: number) => void;
  updateTypographyWeight: (type: "weightRegular" | "weightBold", value: number) => void;

  // Spacing operations
  updateSpacingBaseUnit: (unit: number) => void;

  // Available primitive references for dropdowns
  availablePrimitiveRefs: string[];
}

const TOKENS_PATH = "/tokens.json";
const CSS_PATH = "/globals.css";

/**
 * Initialize tokens from VFS files or return defaults
 */
function initializeTokens(files: Record<string, string>): TokenState {
  const tokensJson = files[TOKENS_PATH];
  if (tokensJson) {
    const parsed = parseTokens(tokensJson);
    if (parsed) {
      // Migration: ensure new typography/spacing fields have defaults
      return {
        ...parsed,
        globals: {
          ...parsed.globals,
          typography: {
            fontSans: parsed.globals.typography?.fontSans ?? "'Inter', sans-serif",
            fontMono: parsed.globals.typography?.fontMono ?? "'JetBrains Mono', monospace",
            baseSize: parsed.globals.typography?.baseSize ?? 16,
            scaleRatio: parsed.globals.typography?.scaleRatio ?? 1.25,
            weightRegular: parsed.globals.typography?.weightRegular ?? 400,
            weightBold: parsed.globals.typography?.weightBold ?? 700,
          },
          spacing: parsed.globals.spacing ?? { baseUnit: 4 },
        },
      };
    }
  }
  return defaultTokenState;
}

export function useTokens({ files, writeFile }: UseTokensProps): UseTokensReturn {
  // Use ref to track if we've done initial write
  const hasInitializedRef = useRef(false);

  // Initialize tokens lazily from files
  const [tokens, setTokens] = useState<TokenState>(() => initializeTokens(files));
  const [previewMode, setPreviewMode] = useState<PreviewMode>("light");

  // Write initial files if tokens.json doesn't exist yet (only once)
  useEffect(() => {
    if (hasInitializedRef.current) return;
    hasInitializedRef.current = true;

    const tokensJson = files[TOKENS_PATH];
    if (!tokensJson) {
      // No tokens.json found - write initial files
      writeFile(TOKENS_PATH, serializeTokens(defaultTokenState));
      writeFile(CSS_PATH, generateCSS(defaultTokenState));
    }
  }, [files, writeFile]);

  // Sync tokens to VFS whenever they change
  const syncToVFS = useCallback(
    (newTokens: TokenState) => {
      writeFile(TOKENS_PATH, serializeTokens(newTokens));
      writeFile(CSS_PATH, generateCSS(newTokens));
    },
    [writeFile]
  );

  // Apply a complete preset (replaces entire token state)
  const applyPreset = useCallback(
    (presetTokens: TokenState) => {
      setTokens(presetTokens);
      syncToVFS(presetTokens);
    },
    [syncToVFS]
  );

  // Generate list of available primitive references for semantic dropdowns
  const availablePrimitiveRefs = useMemo(() => {
    const refs: string[] = [];
    const steps = ["50", "100", "200", "300", "400", "500", "600", "700", "800", "900", "950"];

    for (const paletteName of Object.keys(tokens.primitives.colors)) {
      for (const step of steps) {
        refs.push(`${paletteName}-${step}`);
      }
    }

    return refs;
  }, [tokens.primitives.colors]);

  // Update a palette's base color and regenerate its scale
  const updatePaletteBase = useCallback(
    (paletteName: string, baseColor: string) => {
      const newScale = generateColorScale(baseColor);

      setTokens((prev) => {
        const updated: TokenState = {
          ...prev,
          primitives: {
            ...prev.primitives,
            colors: {
              ...prev.primitives.colors,
              [paletteName]: newScale,
            },
            baseColors: {
              ...prev.primitives.baseColors,
              [paletteName]: baseColor,
            },
          },
        };
        syncToVFS(updated);
        return updated;
      });
    },
    [syncToVFS]
  );

  // Add a new palette
  const addPalette = useCallback(
    (name: string, baseColor: string) => {
      const newScale = generateColorScale(baseColor);

      setTokens((prev) => {
        const updated: TokenState = {
          ...prev,
          primitives: {
            ...prev.primitives,
            colors: {
              ...prev.primitives.colors,
              [name]: newScale,
            },
            baseColors: {
              ...prev.primitives.baseColors,
              [name]: baseColor,
            },
          },
        };
        syncToVFS(updated);
        return updated;
      });
    },
    [syncToVFS]
  );

  // Remove a palette
  const removePalette = useCallback(
    (name: string) => {
      // Don't allow removing required palettes
      if (["brand", "neutral"].includes(name)) return;

      setTokens((prev) => {
        const newColors = { ...prev.primitives.colors };
        delete newColors[name];

        const newBaseColors = { ...prev.primitives.baseColors };
        delete newBaseColors[name];

        const updated: TokenState = {
          ...prev,
          primitives: {
            ...prev.primitives,
            colors: newColors,
            baseColors: newBaseColors,
          },
        };
        syncToVFS(updated);
        return updated;
      });
    },
    [syncToVFS]
  );

  // Rename a palette
  const renamePalette = useCallback(
    (oldName: string, newName: string) => {
      if (!newName || newName === oldName) return;
      if (["brand", "neutral"].includes(oldName)) return; // Can't rename required palettes

      setTokens((prev) => {
        const scale = prev.primitives.colors[oldName];
        if (!scale) return prev;

        const newColors = { ...prev.primitives.colors };
        delete newColors[oldName];
        newColors[newName] = scale;

        // Also rename base color entry
        const newBaseColors = { ...prev.primitives.baseColors };
        if (newBaseColors[oldName]) {
          newBaseColors[newName] = newBaseColors[oldName];
          delete newBaseColors[oldName];
        }

        // Also update any semantic references
        const newSemanticColors = { ...prev.semantics.colors };
        for (const [tokenName, value] of Object.entries(newSemanticColors)) {
          if (value.light.startsWith(`${oldName}-`)) {
            (newSemanticColors as Record<string, SemanticColorValue>)[tokenName] = {
              ...value,
              light: value.light.replace(`${oldName}-`, `${newName}-`),
            };
          }
          if (value.dark.startsWith(`${oldName}-`)) {
            (newSemanticColors as Record<string, SemanticColorValue>)[tokenName] = {
              ...(newSemanticColors as Record<string, SemanticColorValue>)[tokenName],
              dark: value.dark.replace(`${oldName}-`, `${newName}-`),
            };
          }
        }

        const updated: TokenState = {
          ...prev,
          primitives: {
            ...prev.primitives,
            colors: newColors,
            baseColors: newBaseColors,
          },
          semantics: {
            ...prev.semantics,
            colors: newSemanticColors as TokenState["semantics"]["colors"],
          },
        };
        syncToVFS(updated);
        return updated;
      });
    },
    [syncToVFS]
  );

  // Update a semantic color mapping
  const updateSemanticColor = useCallback(
    (
      tokenName: SemanticColorName,
      mode: "light" | "dark",
      primitiveRef: string
    ) => {
      setTokens((prev) => {
        const currentValue = prev.semantics.colors[tokenName];
        const updated: TokenState = {
          ...prev,
          semantics: {
            ...prev.semantics,
            colors: {
              ...prev.semantics.colors,
              [tokenName]: {
                ...currentValue,
                [mode]: primitiveRef,
              },
            },
          },
        };
        syncToVFS(updated);
        return updated;
      });
    },
    [syncToVFS]
  );

  // Update component spec
  const updateComponentSpec = useCallback(
    (componentName: ComponentName, spec: Partial<ComponentSpec>) => {
      setTokens((prev) => {
        const currentSpec = prev.components[componentName] || {};
        const updated: TokenState = {
          ...prev,
          components: {
            ...prev.components,
            [componentName]: {
              ...currentSpec,
              ...spec,
            },
          },
        };
        syncToVFS(updated);
        return updated;
      });
    },
    [syncToVFS]
  );

  // Update global radius
  const updateGlobalRadius = useCallback(
    (value: string) => {
      setTokens((prev) => {
        const updated: TokenState = {
          ...prev,
          globals: {
            ...prev.globals,
            radius: {
              ...prev.globals.radius,
              md: value,
              // Also update relative values
              sm: `calc(${value} - 0.125rem)`,
              lg: `calc(${value} + 0.25rem)`,
              xl: `calc(${value} + 0.5rem)`,
            },
          },
        };
        syncToVFS(updated);
        return updated;
      });
    },
    [syncToVFS]
  );

  // Update global font
  const updateGlobalFont = useCallback(
    (font: "fontSans" | "fontMono", value: string) => {
      setTokens((prev) => {
        const updated: TokenState = {
          ...prev,
          globals: {
            ...prev.globals,
            typography: {
              ...prev.globals.typography,
              [font]: value,
            },
          },
        };
        syncToVFS(updated);
        return updated;
      });
    },
    [syncToVFS]
  );

  // Update typography base size
  const updateTypographyBaseSize = useCallback(
    (size: number) => {
      setTokens((prev) => {
        const updated: TokenState = {
          ...prev,
          globals: {
            ...prev.globals,
            typography: {
              ...prev.globals.typography,
              baseSize: size,
            },
          },
        };
        syncToVFS(updated);
        return updated;
      });
    },
    [syncToVFS]
  );

  // Update typography scale ratio
  const updateTypographyScaleRatio = useCallback(
    (ratio: number) => {
      setTokens((prev) => {
        const updated: TokenState = {
          ...prev,
          globals: {
            ...prev.globals,
            typography: {
              ...prev.globals.typography,
              scaleRatio: ratio,
            },
          },
        };
        syncToVFS(updated);
        return updated;
      });
    },
    [syncToVFS]
  );

  // Update typography weight
  const updateTypographyWeight = useCallback(
    (type: "weightRegular" | "weightBold", value: number) => {
      setTokens((prev) => {
        const updated: TokenState = {
          ...prev,
          globals: {
            ...prev.globals,
            typography: {
              ...prev.globals.typography,
              [type]: value,
            },
          },
        };
        syncToVFS(updated);
        return updated;
      });
    },
    [syncToVFS]
  );

  // Update spacing base unit
  const updateSpacingBaseUnit = useCallback(
    (unit: number) => {
      setTokens((prev) => {
        const updated: TokenState = {
          ...prev,
          globals: {
            ...prev.globals,
            spacing: {
              ...prev.globals.spacing,
              baseUnit: unit,
            },
          },
        };
        syncToVFS(updated);
        return updated;
      });
    },
    [syncToVFS]
  );

  return {
    tokens,
    previewMode,
    setPreviewMode,
    applyPreset,
    updatePaletteBase,
    addPalette,
    removePalette,
    renamePalette,
    updateSemanticColor,
    updateComponentSpec,
    updateGlobalRadius,
    updateGlobalFont,
    updateTypographyBaseSize,
    updateTypographyScaleRatio,
    updateTypographyWeight,
    updateSpacingBaseUnit,
    availablePrimitiveRefs,
  };
}
