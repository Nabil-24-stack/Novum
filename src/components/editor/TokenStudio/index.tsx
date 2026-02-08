"use client";

import { useState, useCallback } from "react";
import { Palette, Layers, Component, Type, Ruler, ChevronLeft } from "lucide-react";
import type { UseTokensReturn } from "@/hooks/useTokens";
import { getPresetById } from "@/lib/tokens/presets";
import { ModeToggle } from "./ModeToggle";
import { PaletteTab } from "./PaletteTab";
import { ModesTab } from "./ModesTab";
import { ComponentsTab } from "./ComponentsTab";
import { TypographyTab } from "./TypographyTab";
import { SpacingTab } from "./SpacingTab";
import { PresetPanel } from "./PresetPanel";

type TabId = "palette" | "modes" | "components" | "typography" | "spacing";
type ViewMode = "presets" | "customise";

interface TokenStudioProps {
  tokenState: UseTokensReturn;
}

const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
  { id: "palette", label: "Palette", icon: <Palette className="w-4 h-4" /> },
  { id: "modes", label: "Modes", icon: <Layers className="w-4 h-4" /> },
  { id: "components", label: "Components", icon: <Component className="w-4 h-4" /> },
  { id: "typography", label: "Type", icon: <Type className="w-4 h-4" /> },
  { id: "spacing", label: "Space", icon: <Ruler className="w-4 h-4" /> },
];

export function TokenStudio({ tokenState }: TokenStudioProps) {
  const [activeTab, setActiveTab] = useState<TabId>("palette");
  const [view, setView] = useState<ViewMode>("presets");
  const [currentPresetId, setCurrentPresetId] = useState<string | null>(null);

  const {
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
    updateSpacingBaseUnit,
    availablePrimitiveRefs,
  } = tokenState;

  const handleSelectPreset = useCallback(
    (presetId: string) => {
      const preset = getPresetById(presetId);
      if (preset) {
        applyPreset(preset.tokens);
        setCurrentPresetId(presetId);
      }
    },
    [applyPreset]
  );

  const handleCustomise = useCallback(() => {
    setView("customise");
  }, []);

  const handleBackToPresets = useCallback(() => {
    setView("presets");
  }, []);

  return (
    <div className="w-72 bg-white border-l border-neutral-200 flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-200">
        <div className="flex items-center gap-2">
          {view === "customise" && (
            <button
              onClick={handleBackToPresets}
              className="p-1 -ml-1 hover:bg-neutral-100 rounded transition-colors"
              title="Back to presets"
            >
              <ChevronLeft className="w-4 h-4 text-neutral-600" />
            </button>
          )}
          <Palette className="w-4 h-4 text-neutral-600" />
          <h2 className="font-semibold text-neutral-800 text-base">
            {view === "presets" ? "Style Presets" : "Customise"}
          </h2>
        </div>
        <ModeToggle mode={previewMode} onChange={setPreviewMode} size="sm" />
      </div>

      {view === "presets" ? (
        /* Presets View */
        <div className="flex-1 overflow-y-auto p-4">
          <PresetPanel
            currentPresetId={currentPresetId}
            onSelectPreset={handleSelectPreset}
            onCustomise={handleCustomise}
          />
        </div>
      ) : (
        /* Customise View */
        <>
          {/* Tab Navigation */}
          <div className="flex border-b border-neutral-200">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-sm font-medium transition-colors ${
                  activeTab === tab.id
                    ? "text-neutral-900 border-b-2 border-neutral-800"
                    : "text-neutral-500 hover:text-neutral-700"
                }`}
              >
                {tab.icon}
                <span className="hidden sm:inline">{tab.label}</span>
              </button>
            ))}
          </div>

          {/* Tab Content */}
          <div className="flex-1 overflow-y-auto p-4">
            {activeTab === "palette" && (
              <PaletteTab
                palettes={tokens.primitives.colors}
                baseColors={tokens.primitives.baseColors}
                onUpdateBase={updatePaletteBase}
                onAddPalette={addPalette}
                onRemovePalette={removePalette}
                onRenamePalette={renamePalette}
              />
            )}

            {activeTab === "modes" && (
              <ModesTab
                semanticColors={tokens.semantics.colors}
                primitives={tokens.primitives.colors}
                availableRefs={availablePrimitiveRefs}
                previewMode={previewMode}
                onPreviewModeChange={setPreviewMode}
                onUpdateSemanticColor={updateSemanticColor}
              />
            )}

            {activeTab === "components" && (
              <ComponentsTab
                components={tokens.components}
                onUpdateComponent={updateComponentSpec}
                globalRadius={tokens.globals.radius.md}
                onUpdateGlobalRadius={updateGlobalRadius}
                fontSans={tokens.globals.typography.fontSans}
                onUpdateFontSans={(value) => updateGlobalFont("fontSans", value)}
              />
            )}

            {activeTab === "typography" && (
              <TypographyTab
                baseSize={tokens.globals.typography.baseSize}
                scaleRatio={tokens.globals.typography.scaleRatio}
                onUpdateBaseSize={updateTypographyBaseSize}
                onUpdateScaleRatio={updateTypographyScaleRatio}
              />
            )}

            {activeTab === "spacing" && (
              <SpacingTab
                baseUnit={tokens.globals.spacing.baseUnit}
                onUpdateBaseUnit={updateSpacingBaseUnit}
              />
            )}
          </div>
        </>
      )}
    </div>
  );
}
