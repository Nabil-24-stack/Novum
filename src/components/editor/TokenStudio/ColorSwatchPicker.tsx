"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { ChevronDown } from "lucide-react";
import type { ColorScale } from "@/lib/tokens";
import { hslStringToHex } from "@/lib/tokens";

interface ColorSwatchPickerProps {
  value: string;
  availableRefs: string[];
  primitives: Record<string, ColorScale>;
  onChange: (ref: string) => void;
}

function resolvePrimitiveToHex(
  ref: string,
  primitives: Record<string, ColorScale>
): string {
  const match = ref.match(/^([a-zA-Z]+)-(\d+)$/);
  if (!match) return "#808080";

  const [, paletteName, step] = match;
  const scale = primitives[paletteName];
  if (!scale) return "#808080";

  const hsl = scale[step as keyof ColorScale];
  return hsl ? hslStringToHex(hsl) : "#808080";
}

export function ColorSwatchPicker({
  value,
  availableRefs,
  primitives,
  onChange,
}: ColorSwatchPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const currentHex = useMemo(
    () => resolvePrimitiveToHex(value, primitives),
    [value, primitives]
  );

  // Group refs by palette
  const groupedRefs = useMemo(() => {
    const groups: Record<string, string[]> = {};
    for (const ref of availableRefs) {
      const paletteName = ref.split("-")[0];
      if (!groups[paletteName]) {
        groups[paletteName] = [];
      }
      groups[paletteName].push(ref);
    }
    return groups;
  }, [availableRefs]);

  // Click outside to close
  useEffect(() => {
    if (!isOpen) return;

    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  // Escape to close
  useEffect(() => {
    if (!isOpen) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setIsOpen(false);
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  const handleSelect = (ref: string) => {
    onChange(ref);
    setIsOpen(false);
  };

  return (
    <div ref={containerRef} className="relative">
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1.5 px-2 py-1 bg-white border border-neutral-200 rounded hover:border-neutral-300 focus:outline-none focus:ring-1 focus:ring-neutral-300"
      >
        <div
          className="w-5 h-5 rounded border border-neutral-200"
          style={{ backgroundColor: currentHex }}
        />
        <ChevronDown className="w-3 h-3 text-neutral-400" />
      </button>

      {/* Dropdown Panel */}
      {isOpen && (
        <div className="absolute top-full right-0 mt-1 z-50 bg-white border border-neutral-200 rounded-lg shadow-lg p-2 w-[200px] max-h-[300px] overflow-y-auto">
          {Object.entries(groupedRefs).map(([paletteName, refs]) => (
            <div key={paletteName} className="mb-2 last:mb-0">
              {/* Palette Label */}
              <div className="text-[10px] font-medium text-neutral-400 uppercase tracking-wide mb-1 px-0.5">
                {paletteName}
              </div>
              {/* Color Grid */}
              <div className="grid grid-cols-4 gap-1">
                {refs.map((ref) => {
                  const hex = resolvePrimitiveToHex(ref, primitives);
                  const isSelected = ref === value;
                  return (
                    <button
                      key={ref}
                      type="button"
                      onClick={() => handleSelect(ref)}
                      className={`
                        group relative w-7 h-7 rounded-md border transition-all
                        ${isSelected
                          ? "ring-2 ring-neutral-800 border-transparent"
                          : "border-neutral-200 hover:ring-2 hover:ring-neutral-300"
                        }
                      `}
                      style={{ backgroundColor: hex }}
                      title={ref}
                    >
                      {/* CSS-only tooltip */}
                      <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-1.5 py-0.5 text-[10px] text-white bg-neutral-800 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-10">
                        {ref}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
