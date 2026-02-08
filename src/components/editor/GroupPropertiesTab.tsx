"use client";

import { useCallback, useMemo } from "react";
import {
  ArrowRight,
  ArrowDown,
  Layers,
  RotateCcw,
  Type,
  Component,
  Square,
} from "lucide-react";
import type { CanvasNode, SizingMode } from "@/lib/canvas/types";
import { useCanvasStore } from "@/hooks/useCanvasStore";

// ============================================================================
// Constants
// ============================================================================

const BORDER_WIDTH_OPTIONS = [
  { value: 0, label: "None" },
  { value: 1, label: "1px" },
  { value: 2, label: "2px" },
  { value: 4, label: "4px" },
];

const COLOR_OPTIONS = [
  { value: "", label: "None", color: "transparent" },
  { value: "white", label: "White", color: "#ffffff" },
  { value: "neutral-50", label: "Neutral 50", color: "#fafafa" },
  { value: "neutral-100", label: "Neutral 100", color: "#f5f5f5" },
  { value: "neutral-200", label: "Neutral 200", color: "#e5e5e5" },
  { value: "neutral-300", label: "Neutral 300", color: "#d4d4d4" },
  { value: "blue-50", label: "Blue 50", color: "#eff6ff" },
  { value: "blue-100", label: "Blue 100", color: "#dbeafe" },
  { value: "blue-500", label: "Blue 500", color: "#3b82f6" },
  { value: "green-50", label: "Green 50", color: "#f0fdf4" },
  { value: "green-100", label: "Green 100", color: "#dcfce7" },
  { value: "green-500", label: "Green 500", color: "#22c55e" },
  { value: "red-50", label: "Red 50", color: "#fef2f2" },
  { value: "red-100", label: "Red 100", color: "#fee2e2" },
  { value: "red-500", label: "Red 500", color: "#ef4444" },
];

// ============================================================================
// Component
// ============================================================================

interface GroupPropertiesTabProps {
  /** The selected group node */
  node: CanvasNode;
}

export function GroupPropertiesTab({ node }: GroupPropertiesTabProps) {
  const { setLayout, setStyle, updateNode } = useCanvasStore();

  const layout = useMemo(
    () => node.layout || { direction: "row" as const, gap: 8 },
    [node.layout]
  );
  const style = useMemo(() => node.style || {}, [node.style]);

  // -------------------------------------------------------------------------
  // Layout handlers
  // -------------------------------------------------------------------------

  const handleDirectionChange = useCallback(
    (direction: "row" | "column") => {
      setLayout(node.id, { ...layout, direction });
    },
    [node.id, layout, setLayout]
  );

  const handleGapChange = useCallback(
    (gap: number) => {
      setLayout(node.id, { ...layout, gap });
    },
    [node.id, layout, setLayout]
  );

  const handlePaddingChange = useCallback(
    (padding: number) => {
      setLayout(node.id, { ...layout, padding: padding || undefined });
    },
    [node.id, layout, setLayout]
  );

  const handleRemoveLayout = useCallback(() => {
    setLayout(node.id, null);
  }, [node.id, setLayout]);

  // -------------------------------------------------------------------------
  // Style handlers
  // -------------------------------------------------------------------------

  const handleBackgroundChange = useCallback(
    (backgroundColor: string) => {
      setStyle(node.id, {
        ...style,
        backgroundColor: backgroundColor || undefined,
      });
    },
    [node.id, style, setStyle]
  );

  const handleBorderWidthChange = useCallback(
    (borderWidth: number) => {
      setStyle(node.id, {
        ...style,
        borderWidth: borderWidth || undefined,
      });
    },
    [node.id, style, setStyle]
  );

  const handleBorderColorChange = useCallback(
    (borderColor: string) => {
      setStyle(node.id, {
        ...style,
        borderColor: borderColor || undefined,
      });
    },
    [node.id, style, setStyle]
  );

  const handleBorderRadiusChange = useCallback(
    (borderRadius: number) => {
      setStyle(node.id, {
        ...style,
        borderRadius: borderRadius || undefined,
      });
    },
    [node.id, style, setStyle]
  );

  // -------------------------------------------------------------------------
  // Sizing mode handlers
  // -------------------------------------------------------------------------

  const handleWidthModeChange = useCallback(
    (widthMode: SizingMode) => {
      setLayout(node.id, { ...layout, widthMode });
    },
    [node.id, layout, setLayout]
  );

  const handleHeightModeChange = useCallback(
    (heightMode: SizingMode) => {
      setLayout(node.id, { ...layout, heightMode });
    },
    [node.id, layout, setLayout]
  );

  const handleWidthChange = useCallback(
    (width: number) => {
      if (width > 0) {
        updateNode(node.id, { width });
      }
    },
    [node.id, updateNode]
  );

  const handleHeightChange = useCallback(
    (height: number) => {
      if (height > 0) {
        updateNode(node.id, { height });
      }
    },
    [node.id, updateNode]
  );

  const isGroup = node.children && node.children.length > 0;

  // Determine display type and icon based on node type
  const getNodeTypeDisplay = () => {
    if (isGroup) {
      return { label: "Group", icon: Layers, color: "bg-purple-100 text-purple-700" };
    }
    switch (node.type) {
      case "text":
        return { label: "Text", icon: Type, color: "bg-amber-100 text-amber-700" };
      case "component":
        return { label: node.componentType || "Component", icon: Component, color: "bg-blue-100 text-blue-700" };
      case "frame":
      default:
        return { label: "Frame", icon: Square, color: "bg-neutral-100 text-neutral-700" };
    }
  };

  const nodeTypeDisplay = getNodeTypeDisplay();
  const NodeIcon = nodeTypeDisplay.icon;

  return (
    <div className="h-full overflow-y-auto">
      {/* Header */}
      <div className="p-4 border-b border-neutral-200">
        <div className="flex items-center gap-2">
          <span className={`px-2 py-1 text-sm font-medium rounded flex items-center gap-1.5 ${nodeTypeDisplay.color}`}>
            <NodeIcon className="w-3.5 h-3.5" />
            {nodeTypeDisplay.label}
          </span>
          {node.name && node.type !== "component" && (
            <span className="text-neutral-600 text-sm font-medium">
              {node.name}
            </span>
          )}
        </div>
        <p className="mt-2 text-xs text-neutral-400">
          {isGroup
            ? `${node.children?.length} children`
            : node.type === "text"
            ? "Text element"
            : node.type === "component"
            ? "Component element"
            : "Frame element"}
        </p>
      </div>

      {/* Auto Layout Section */}
      {isGroup && (
        <div className="p-4 border-b border-neutral-200">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-neutral-500 uppercase tracking-wide">
              Auto Layout
            </h3>
            {node.layout && (
              <button
                onClick={handleRemoveLayout}
                className="text-xs text-neutral-500 hover:text-red-500 flex items-center gap-1"
              >
                <RotateCcw className="w-3 h-3" />
                Remove
              </button>
            )}
          </div>

          <div className="space-y-4">
            {/* Direction */}
            <div>
              <label className="text-sm text-neutral-500 mb-2 block">
                Direction
              </label>
              <div className="flex bg-neutral-100 rounded-lg p-0.5">
                <button
                  onClick={() => handleDirectionChange("row")}
                  className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                    layout.direction === "row"
                      ? "bg-white text-neutral-900 shadow-sm"
                      : "text-neutral-600 hover:text-neutral-900"
                  }`}
                >
                  <ArrowRight className="w-4 h-4" />
                  Row
                </button>
                <button
                  onClick={() => handleDirectionChange("column")}
                  className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                    layout.direction === "column"
                      ? "bg-white text-neutral-900 shadow-sm"
                      : "text-neutral-600 hover:text-neutral-900"
                  }`}
                >
                  <ArrowDown className="w-4 h-4" />
                  Column
                </button>
              </div>
            </div>

            {/* Gap */}
            <div>
              <label className="text-sm text-neutral-500 mb-2 block">
                Gap
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min={0}
                  max={32}
                  step={4}
                  value={layout.gap}
                  onChange={(e) => handleGapChange(parseInt(e.target.value))}
                  className="flex-1 h-2 bg-neutral-200 rounded-lg appearance-none cursor-pointer"
                />
                <span className="text-sm text-neutral-600 min-w-[40px] text-right font-mono">
                  {layout.gap}px
                </span>
              </div>
            </div>

            {/* Padding */}
            <div>
              <label className="text-sm text-neutral-500 mb-2 block">
                Padding
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min={0}
                  max={32}
                  step={4}
                  value={layout.padding || 0}
                  onChange={(e) => handlePaddingChange(parseInt(e.target.value))}
                  className="flex-1 h-2 bg-neutral-200 rounded-lg appearance-none cursor-pointer"
                />
                <span className="text-sm text-neutral-600 min-w-[40px] text-right font-mono">
                  {layout.padding || 0}px
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Fill Section */}
      <div className="p-4 border-b border-neutral-200">
        <h3 className="text-sm font-medium text-neutral-500 uppercase tracking-wide mb-3">
          Fill
        </h3>
        <ColorSelect
          value={style.backgroundColor || ""}
          options={COLOR_OPTIONS}
          onChange={handleBackgroundChange}
        />
      </div>

      {/* Border Section */}
      <div className="p-4 border-b border-neutral-200">
        <h3 className="text-sm font-medium text-neutral-500 uppercase tracking-wide mb-3">
          Border
        </h3>
        <div className="space-y-4">
          {/* Border Width */}
          <div>
            <label className="text-sm text-neutral-500 mb-2 block">Width</label>
            <select
              value={style.borderWidth || 0}
              onChange={(e) => handleBorderWidthChange(parseInt(e.target.value))}
              className="w-full px-2 py-1.5 text-sm bg-white border border-neutral-200 rounded-md"
            >
              {BORDER_WIDTH_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Border Color (only show if border width > 0) */}
          {(style.borderWidth || 0) > 0 && (
            <div>
              <label className="text-sm text-neutral-500 mb-2 block">Color</label>
              <ColorSelect
                value={style.borderColor || "neutral-200"}
                options={COLOR_OPTIONS.filter((c) => c.value !== "")}
                onChange={handleBorderColorChange}
              />
            </div>
          )}

          {/* Border Radius */}
          <div>
            <label className="text-sm text-neutral-500 mb-2 block">Radius</label>
            <div className="flex items-center gap-2">
              <input
                type="range"
                min={0}
                max={16}
                step={4}
                value={Math.min(style.borderRadius || 0, 16)}
                onChange={(e) => handleBorderRadiusChange(parseInt(e.target.value))}
                className="flex-1 h-2 bg-neutral-200 rounded-lg appearance-none cursor-pointer"
              />
              <span className="text-sm text-neutral-600 min-w-[40px] text-right font-mono">
                {style.borderRadius || 0}px
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Size Section */}
      <div className="p-4 border-b border-neutral-200">
        <h3 className="text-sm font-medium text-neutral-500 uppercase tracking-wide mb-3">
          Size
        </h3>
        <div className="space-y-4">
          {/* Width */}
          <div>
            <label className="text-sm text-neutral-500 mb-2 block">Width</label>
            <div className="flex items-center gap-2">
              <div className="flex bg-neutral-100 rounded-lg p-0.5 flex-1">
                <button
                  onClick={() => handleWidthModeChange("hug")}
                  className={`flex-1 px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                    (layout.widthMode || "fixed") === "hug"
                      ? "bg-white text-neutral-900 shadow-sm"
                      : "text-neutral-600 hover:text-neutral-900"
                  }`}
                >
                  Hug
                </button>
                <button
                  onClick={() => handleWidthModeChange("fill")}
                  className={`flex-1 px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                    layout.widthMode === "fill"
                      ? "bg-white text-neutral-900 shadow-sm"
                      : "text-neutral-600 hover:text-neutral-900"
                  }`}
                >
                  Fill
                </button>
                <button
                  onClick={() => handleWidthModeChange("fixed")}
                  className={`flex-1 px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                    layout.widthMode === "fixed"
                      ? "bg-white text-neutral-900 shadow-sm"
                      : "text-neutral-600 hover:text-neutral-900"
                  }`}
                >
                  Fixed
                </button>
              </div>
              {(layout.widthMode === "fixed" || (!layout.widthMode && true)) ? (
                <div className="relative min-w-[70px]">
                  <input
                    type="number"
                    value={Math.round(node.width)}
                    onChange={(e) => handleWidthChange(parseInt(e.target.value) || 0)}
                    className="w-full px-2 py-1 pr-6 text-sm font-mono text-neutral-600 bg-white border border-neutral-200 rounded-md text-right"
                    min={50}
                  />
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-neutral-400">
                    px
                  </span>
                </div>
              ) : (
                <span className="text-sm text-neutral-600 min-w-[50px] text-right font-mono">
                  {Math.round(node.width)}px
                </span>
              )}
            </div>
          </div>

          {/* Height */}
          <div>
            <label className="text-sm text-neutral-500 mb-2 block">Height</label>
            <div className="flex items-center gap-2">
              <div className="flex bg-neutral-100 rounded-lg p-0.5 flex-1">
                <button
                  onClick={() => handleHeightModeChange("hug")}
                  className={`flex-1 px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                    (layout.heightMode || "fixed") === "hug"
                      ? "bg-white text-neutral-900 shadow-sm"
                      : "text-neutral-600 hover:text-neutral-900"
                  }`}
                >
                  Hug
                </button>
                <button
                  onClick={() => handleHeightModeChange("fill")}
                  className={`flex-1 px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                    layout.heightMode === "fill"
                      ? "bg-white text-neutral-900 shadow-sm"
                      : "text-neutral-600 hover:text-neutral-900"
                  }`}
                >
                  Fill
                </button>
                <button
                  onClick={() => handleHeightModeChange("fixed")}
                  className={`flex-1 px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                    layout.heightMode === "fixed"
                      ? "bg-white text-neutral-900 shadow-sm"
                      : "text-neutral-600 hover:text-neutral-900"
                  }`}
                >
                  Fixed
                </button>
              </div>
              {(layout.heightMode === "fixed" || (!layout.heightMode && true)) ? (
                <div className="relative min-w-[70px]">
                  <input
                    type="number"
                    value={Math.round(node.height)}
                    onChange={(e) => handleHeightChange(parseInt(e.target.value) || 0)}
                    className="w-full px-2 py-1 pr-6 text-sm font-mono text-neutral-600 bg-white border border-neutral-200 rounded-md text-right"
                    min={50}
                  />
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-neutral-400">
                    px
                  </span>
                </div>
              ) : (
                <span className="text-sm text-neutral-600 min-w-[50px] text-right font-mono">
                  {Math.round(node.height)}px
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Helper Components
// ============================================================================

function ColorSelect({
  value,
  options,
  onChange,
}: {
  value: string;
  options: Array<{ value: string; label: string; color: string }>;
  onChange: (value: string) => void;
}) {
  const selectedOption = options.find((o) => o.value === value);

  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full pl-8 pr-2 py-1.5 text-sm bg-white border border-neutral-200 rounded-md appearance-none"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {/* Color swatch */}
      <div
        className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 rounded border border-neutral-300"
        style={{
          backgroundColor: selectedOption?.color || "transparent",
          backgroundImage:
            selectedOption?.value === ""
              ? "linear-gradient(45deg, #ccc 25%, transparent 25%), linear-gradient(-45deg, #ccc 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #ccc 75%), linear-gradient(-45deg, transparent 75%, #ccc 75%)"
              : undefined,
          backgroundSize: "8px 8px",
          backgroundPosition: "0 0, 0 4px, 4px -4px, -4px 0px",
        }}
      />
      {/* Dropdown chevron */}
      <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none">
        <svg
          className="w-4 h-4 text-neutral-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </div>
    </div>
  );
}
