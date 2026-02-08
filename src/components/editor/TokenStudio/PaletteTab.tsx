"use client";

import { useState, useCallback } from "react";
import { Plus } from "lucide-react";
import type { ColorScale } from "@/lib/tokens";
import { ColorScaleEditor } from "./ColorScaleEditor";

interface PaletteTabProps {
  palettes: Record<string, ColorScale>;
  baseColors?: Record<string, string>;
  onUpdateBase: (paletteName: string, baseColor: string) => void;
  onAddPalette: (name: string, baseColor: string) => void;
  onRemovePalette: (name: string) => void;
  onRenamePalette: (oldName: string, newName: string) => void;
}

// These palettes cannot be removed
const REQUIRED_PALETTES = ["brand", "neutral"];

export function PaletteTab({
  palettes,
  baseColors = {},
  onUpdateBase,
  onAddPalette,
  onRemovePalette,
  onRenamePalette,
}: PaletteTabProps) {
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [newPaletteName, setNewPaletteName] = useState("");
  const [newPaletteColor, setNewPaletteColor] = useState("#6366f1");

  const handleAddPalette = useCallback(() => {
    if (!newPaletteName.trim()) return;

    // Sanitize name: lowercase, alphanumeric only
    const sanitized = newPaletteName.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (!sanitized || palettes[sanitized]) return;

    onAddPalette(sanitized, newPaletteColor);
    setNewPaletteName("");
    setNewPaletteColor("#6366f1");
    setIsAddingNew(false);
  }, [newPaletteName, newPaletteColor, palettes, onAddPalette]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        handleAddPalette();
      } else if (e.key === "Escape") {
        setIsAddingNew(false);
        setNewPaletteName("");
      }
    },
    [handleAddPalette]
  );

  // Sort palettes: required first, then alphabetical
  const sortedPaletteNames = Object.keys(palettes).sort((a, b) => {
    const aRequired = REQUIRED_PALETTES.includes(a);
    const bRequired = REQUIRED_PALETTES.includes(b);
    if (aRequired && !bRequired) return -1;
    if (!aRequired && bRequired) return 1;
    return a.localeCompare(b);
  });

  return (
    <div className="space-y-3">
      <p className="text-sm text-neutral-500">
        Click a color swatch to change the base color. The scale will regenerate automatically.
      </p>

      {/* Palette list */}
      <div className="space-y-2">
        {sortedPaletteNames.map((name) => (
          <ColorScaleEditor
            key={name}
            name={name}
            scale={palettes[name]}
            baseColor={baseColors[name]}
            onUpdateBase={(color) => onUpdateBase(name, color)}
            onRemove={
              !REQUIRED_PALETTES.includes(name)
                ? () => onRemovePalette(name)
                : undefined
            }
            onRename={
              !REQUIRED_PALETTES.includes(name)
                ? (newName) => onRenamePalette(name, newName)
                : undefined
            }
            isRequired={REQUIRED_PALETTES.includes(name)}
          />
        ))}
      </div>

      {/* Add new palette */}
      {isAddingNew ? (
        <div className="bg-neutral-50 rounded-lg p-3 space-y-2">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={newPaletteName}
              onChange={(e) => setNewPaletteName(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Palette name"
              autoFocus
              className="flex-1 px-2 py-1 text-base bg-white border border-neutral-200 rounded focus:outline-none focus:ring-2 focus:ring-neutral-300"
            />
            <label className="relative cursor-pointer">
              <input
                type="color"
                value={newPaletteColor}
                onChange={(e) => setNewPaletteColor(e.target.value)}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              />
              <div
                className="w-8 h-8 rounded-md border border-neutral-200"
                style={{ backgroundColor: newPaletteColor }}
              />
            </label>
          </div>
          <div className="flex justify-end gap-2">
            <button
              onClick={() => {
                setIsAddingNew(false);
                setNewPaletteName("");
              }}
              className="px-3 py-1 text-sm text-neutral-600 hover:text-neutral-800"
            >
              Cancel
            </button>
            <button
              onClick={handleAddPalette}
              disabled={!newPaletteName.trim()}
              className="px-3 py-1 text-sm bg-neutral-800 text-white rounded hover:bg-neutral-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Add
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setIsAddingNew(true)}
          className="w-full py-2 text-base text-neutral-500 hover:text-neutral-700 border border-dashed border-neutral-300 rounded-lg hover:border-neutral-400 transition-colors flex items-center justify-center gap-1"
        >
          <Plus className="w-4 h-4" />
          Add Custom Palette
        </button>
      )}
    </div>
  );
}
