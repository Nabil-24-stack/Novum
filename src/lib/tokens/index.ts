/**
 * Token Studio - Barrel Exports
 */

// Types
export type {
  TokenState,
  ColorScale,
  ColorStep,
  SemanticColorName,
  SemanticColorValue,
  ComponentName,
  ComponentSpec,
  RadiusPreset,
  GlobalSettings,
  PreviewMode,
  DefaultPaletteName,
  HSLString,
} from "./types";

export { COLOR_STEPS } from "./types";

// Defaults
export { defaultTokenState, defaultBaseColors } from "./defaults";

// Color scale generation
export {
  generateColorScale,
  generateNeutralScale,
  toHSLString,
  hslStringToHex,
  hexToHSLString,
  interpolateColors,
  getPerceivedBrightness,
  needsLightForeground,
} from "./color-scale";

// CSS generation
export {
  generateCSS,
  parseTokens,
  serializeTokens,
  getBaseColorFromScale,
} from "./css-generator";

// Presets
export type { Preset, PresetPreview } from "./presets";
export { PRESETS, getPresetById } from "./presets";
