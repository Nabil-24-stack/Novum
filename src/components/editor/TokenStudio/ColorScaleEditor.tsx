"use client";

import { useState, useCallback } from "react";
import { Trash2, GripVertical } from "lucide-react";
import type { ColorScale } from "@/lib/tokens";
import { hslStringToHex, getBaseColorFromScale } from "@/lib/tokens";

interface ColorScaleEditorProps {
  name: string;
  scale: ColorScale;
  baseColor?: string;
  onUpdateBase: (baseColor: string) => void;
  onRemove?: () => void;
  onRename?: (newName: string) => void;
  isRequired?: boolean;
}

const STEPS = ["50", "100", "200", "300", "400", "500", "600", "700", "800", "900", "950"] as const;

export function ColorScaleEditor({
  name,
  scale,
  baseColor: baseColorProp,
  onUpdateBase,
  onRemove,
  onRename,
  isRequired = false,
}: ColorScaleEditorProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(name);

  // Use passed baseColor if available, otherwise derive from scale (fallback)
  const baseColor = baseColorProp || getBaseColorFromScale(scale);

  const handleColorChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onUpdateBase(e.target.value);
    },
    [onUpdateBase]
  );

  const handleNameSubmit = useCallback(() => {
    if (editName && editName !== name && onRename) {
      onRename(editName);
    }
    setIsEditing(false);
  }, [editName, name, onRename]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        handleNameSubmit();
      } else if (e.key === "Escape") {
        setEditName(name);
        setIsEditing(false);
      }
    },
    [handleNameSubmit, name]
  );

  return (
    <div className="bg-neutral-50 rounded-lg p-3 space-y-2">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <GripVertical className="w-4 h-4 text-neutral-300 shrink-0" />

          {isEditing && !isRequired ? (
            <input
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onBlur={handleNameSubmit}
              onKeyDown={handleKeyDown}
              autoFocus
              className="flex-1 min-w-0 px-2 py-0.5 text-base font-medium bg-white border border-neutral-200 rounded focus:outline-none focus:ring-2 focus:ring-neutral-300"
            />
          ) : (
            <span
              className={`text-base font-medium text-neutral-800 truncate ${
                !isRequired ? "cursor-pointer hover:text-neutral-600" : ""
              }`}
              onClick={() => !isRequired && setIsEditing(true)}
              title={!isRequired ? "Click to rename" : undefined}
            >
              {name}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* Color picker */}
          <label className="relative cursor-pointer">
            <input
              type="color"
              value={baseColor}
              onChange={handleColorChange}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            />
            <div
              className="w-7 h-7 rounded-md border border-neutral-200 shadow-sm"
              style={{ backgroundColor: baseColor }}
            />
          </label>

          {/* Delete button */}
          {!isRequired && onRemove && (
            <button
              onClick={onRemove}
              className="p-1 text-neutral-400 hover:text-red-500 transition-colors"
              title="Remove palette"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Color scale preview strip */}
      <div className="flex rounded-md overflow-hidden h-6">
        {STEPS.map((step) => {
          const hsl = scale[step];
          const hex = hslStringToHex(hsl);
          return (
            <div
              key={step}
              className="flex-1 relative group"
              style={{ backgroundColor: hex }}
              title={`${step}: ${hsl}`}
            >
              {/* Tooltip on hover */}
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-1.5 py-0.5 bg-neutral-800 text-white text-[10px] rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-10">
                {step}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
