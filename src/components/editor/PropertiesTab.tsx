"use client";

import { useState, useEffect, useRef } from "react";
import { MousePointer, RotateCcw, Lock, FileCode, AlignLeft, AlignCenter, AlignRight, Type, Settings2, ToggleLeft, ToggleRight, X } from "lucide-react";
import type { SelectedElement } from "@/lib/inspection/types";
import type { ParsedProp } from "@/hooks/useWriter";
import type { ClassEditMode } from "@/hooks/useWriter";
import {
  updateClass,
  removeLayoutClasses,
  detectLayoutMode,
  detectFlexDirection,
  detectJustifyContent,
  detectAlignItems,
  detectGap,
  detectPadding,
  detectFontSize,
  detectFontWeight,
  detectTextAlign,
  detectBgColor,
  detectTextColor,
  detectWidth,
  detectHeight,
  detectBorderRadius,
  detectBorderWidth,
  detectBorderColor,
  detectShadow,
  detectOpacity,
  SPACING_SCALE,
  FONT_SIZE_SCALE,
  FONT_WEIGHT_SCALE,
  BG_COLOR_OPTIONS,
  TEXT_COLOR_OPTIONS,
  DIMENSION_PRESETS,
  BORDER_RADIUS_SCALE,
  BORDER_WIDTH_SCALE,
  BORDER_COLOR_OPTIONS,
  SHADOW_SCALE,
  OPACITY_SCALE,
  type ClassCategory,
} from "@/lib/inspection/class-manager";

interface PropertiesTabProps {
  selectedElement: SelectedElement | null;
  inspectionMode: boolean;
  onClassUpdate?: (
    selector: string,
    originalClassName: string,
    newClassName: string
  ) => void;
  onTextUpdate?: (originalText: string, newText: string) => void;
  /** Called on every keystroke for optimistic text updates */
  onOptimisticTextUpdate?: (newText: string) => void;
  /** Current draft text value (controlled from parent for optimistic UI) */
  draftText?: string;
  /** Whether the element's className can be edited in VFS */
  isEditable?: boolean;
  /** The file where the className was found (when editable) */
  editableFile?: string;
  /** Reason why the element is not editable */
  notEditableReason?: string;
  /** Class editing capability mode */
  classEditMode?: ClassEditMode;
  /** Whether the element's text content can be edited */
  isTextEditable?: boolean;
  /** The file where the text content was found (when editable) */
  textEditableFile?: string;
  /** Whether there are pending changes being saved */
  isPending?: boolean;
  /** Component props from AST (if source location available) */
  componentProps?: ParsedProp[] | null;
  /** Called when a prop value is updated */
  onPropUpdate?: (propName: string, value: string | boolean) => void;
  /** Called when a prop is removed */
  onPropRemove?: (propName: string) => void;
}

export function PropertiesTab({
  selectedElement,
  inspectionMode,
  onClassUpdate,
  onTextUpdate,
  onOptimisticTextUpdate,
  draftText,
  isEditable = false,
  editableFile,
  notEditableReason,
  classEditMode = "READ_ONLY",
  isTextEditable = false,
  textEditableFile,
  isPending = false,
  componentProps,
  onPropUpdate,
  onPropRemove,
}: PropertiesTabProps) {
  // Track the original text content for comparison when saving
  // (hooks must be called before any early returns)
  const originalTextRef = useRef<string | null>(null);
  const [editingText, setEditingText] = useState<string>("");
  const [isTextFocused, setIsTextFocused] = useState(false);

  // draftText indicates there's an uncommitted text change being debounced
  // We use local state for the textarea to prevent cursor jumping
  const hasTextDraft = draftText !== undefined;

  // Extract values from selected element (with defaults for when null)
  const textContent = selectedElement?.textContent;
  const selector = selectedElement?.selector;

  // Update editing text when selected element changes
  useEffect(() => {
    if (textContent !== undefined) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Syncing state from props
      setEditingText(textContent);
      originalTextRef.current = textContent;
    } else {
       
      setEditingText("");
      originalTextRef.current = null;
    }
  }, [textContent, selector]);

  // Handle text content save (on blur or enter)
  const handleTextSave = () => {
    setIsTextFocused(false);
    const trimmedText = editingText.trim();
    const originalText = originalTextRef.current;

    if (
      onTextUpdate &&
      originalText !== null &&
      trimmedText !== originalText
    ) {
      onTextUpdate(originalText, trimmedText);
      originalTextRef.current = trimmedText;
    }
  };

  // Early return for no selection (after hooks)
  if (!selectedElement) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-8">
        <div className="w-12 h-12 bg-neutral-100 rounded-full flex items-center justify-center mb-4">
          <MousePointer className="w-6 h-6 text-neutral-400" />
        </div>
        <p className="text-neutral-600 font-medium text-base">No element selected</p>
        <p className="text-neutral-400 text-sm mt-2">
          {inspectionMode
            ? "Click an element in the preview to inspect it"
            : "Enable inspection mode to select elements"}
        </p>
      </div>
    );
  }

  const { tagName, className, id, isTextElement, boundingRect } =
    selectedElement;

  // Check if this is a native HTML element (lowercase tag name)
  const isNativeElement = tagName === tagName.toLowerCase();

  // Text-heavy tag names that should show the Content input
  const TEXT_EDITABLE_TAGS = new Set([
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'p', 'span', 'label', 'button', 'a', 'li',
    'th', 'td', 'dt', 'dd', 'figcaption', 'blockquote'
  ]);

  // Smart Content visibility: only show for text-heavy elements
  const isTextEditableElement =
    isTextElement &&
    (TEXT_EDITABLE_TAGS.has(tagName.toLowerCase()) || !isNativeElement);

  // Filter out internal props for display
  const displayableProps = componentProps?.filter(
    (prop) =>
      prop.name !== 'className' &&
      prop.name !== 'children' &&
      prop.name !== 'key' &&
      prop.name !== 'ref' &&
      !prop.name.startsWith('data-')
  );

  const hasDisplayableProps = displayableProps && displayableProps.length > 0;

  // Controls are disabled unless class editing is fully supported.
  const isDisabled = classEditMode !== "FULL_EDIT";

  // Handler to update classes
  const handleClassUpdate = (category: ClassCategory, newValue: string | null) => {
    if (!onClassUpdate || !selector || isDisabled) return;

    const originalClassName = className || "";
    const newClassName = updateClass(originalClassName, category, newValue);

    if (originalClassName !== newClassName) {
      onClassUpdate(selector, originalClassName, newClassName);
    }
  };

  // Handler for reset layout
  const handleResetLayout = () => {
    if (!onClassUpdate || !selector || isDisabled) return;

    const originalClassName = className || "";
    const newClassName = removeLayoutClasses(originalClassName);

    if (originalClassName !== newClassName) {
      onClassUpdate(selector, originalClassName, newClassName);
    }
  };

  // Detect current values from classes
  const layoutMode = detectLayoutMode(className || "");
  const flexDirection = detectFlexDirection(className || "");
  const justifyContent = detectJustifyContent(className || "");
  const alignItems = detectAlignItems(className || "");
  const gap = detectGap(className || "");
  const padding = detectPadding(className || "");

  // Detect typography and color values
  const fontSize = detectFontSize(className || "");
  const fontWeight = detectFontWeight(className || "");
  const textAlign = detectTextAlign(className || "");
  const bgColor = detectBgColor(className || "");
  const textColor = detectTextColor(className || "");

  // Detect dimension values
  const width = detectWidth(className || "");
  const height = detectHeight(className || "");

  // Detect border values
  const borderRadius = detectBorderRadius(className || "");
  const borderWidth = detectBorderWidth(className || "");
  const borderColor = detectBorderColor(className || "");

  // Detect effect values
  const shadow = detectShadow(className || "");
  const opacity = detectOpacity(className || "");

  // Whether flex/grid controls should be shown
  const showFlexControls = layoutMode === "flex";
  const showGridControls = layoutMode === "grid";
  const showSpacingControls = showFlexControls || showGridControls;

  return (
    <div className="h-full overflow-y-auto">
      {/* Element Header */}
      <div className="p-4 border-b border-neutral-200">
        <div className="flex items-center gap-2">
          <span className="px-2 py-1 bg-blue-100 text-blue-700 text-sm font-mono font-medium rounded">
            {tagName}
          </span>
          {id && (
            <span className="px-2 py-1 bg-purple-100 text-purple-700 text-sm font-mono rounded">
              #{id}
            </span>
          )}
        </div>
        {selector && (
          <p
            className="mt-2 text-sm text-neutral-400 font-mono truncate"
            title={selector}
          >
            {selector}
          </p>
        )}
      </div>

      {/* Component Props */}
      {hasDisplayableProps && (
        <div className="p-4 border-b border-neutral-200">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-neutral-500 uppercase tracking-wide flex items-center gap-1.5">
              <Settings2 className="w-3.5 h-3.5" />
              Props
            </h3>
            <span
              className="flex items-center gap-1 px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded"
              title="Props are editable"
            >
              <FileCode className="w-3 h-3" />
              Editable
            </span>
          </div>
          <div className="space-y-3">
            {displayableProps!.map((prop) => (
              <PropEditor
                key={prop.name}
                prop={prop}
                onUpdate={onPropUpdate}
                onRemove={onPropRemove}
              />
            ))}
          </div>
        </div>
      )}

      {/* Text Content */}
      {isTextEditableElement && (
        <div className="p-4 border-b border-neutral-200">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-neutral-500 uppercase tracking-wide flex items-center gap-1.5">
              <Type className="w-3.5 h-3.5" />
              Content
              {hasTextDraft && (
                <span
                  className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-pulse"
                  title="Saving..."
                />
              )}
            </h3>
            {isTextEditable ? (
              <span
                className="flex items-center gap-1 px-2 py-0.5 bg-green-100 text-green-700 text-sm rounded"
                title={`Editable in ${textEditableFile}`}
              >
                <FileCode className="w-3 h-3" />
                {textEditableFile?.replace("/", "")}
              </span>
            ) : (
              <span
                className="flex items-center gap-1 px-2 py-0.5 bg-neutral-100 text-neutral-500 text-sm rounded"
                title="Text is dynamically generated"
              >
                <Lock className="w-3 h-3" />
                Read-Only
              </span>
            )}
          </div>
          <textarea
            value={editingText}
            onChange={(e) => {
              const newText = e.target.value;
              setEditingText(newText);

              // Call optimistic update on every keystroke for instant preview
              if (onOptimisticTextUpdate) {
                onOptimisticTextUpdate(newText);
              }
            }}
            onFocus={() => setIsTextFocused(true)}
            onBlur={handleTextSave}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleTextSave();
                (e.target as HTMLTextAreaElement).blur();
              }
            }}
            disabled={!isTextEditable}
            placeholder="Text content..."
            className={`w-full px-3 py-2 text-sm bg-white border rounded-md resize-none transition-colors ${
              isTextFocused
                ? "border-blue-500 ring-1 ring-blue-500"
                : "border-neutral-200"
            } ${
              !isTextEditable
                ? "opacity-60 cursor-not-allowed bg-neutral-50"
                : "hover:border-neutral-300"
            }`}
            rows={Math.min(4, Math.max(2, editingText.split("\n").length))}
          />
          {isTextEditable && (
            <p className="mt-1.5 text-sm text-neutral-400">
              Updates live as you type
            </p>
          )}
        </div>
      )}

      {/* Auto Layout Section */}
      <div className="p-4 border-b border-neutral-200">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium text-neutral-500 uppercase tracking-wide flex items-center gap-2">
            Auto Layout
            {isPending && (
              <span
                className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-pulse"
                title="Saving..."
              />
            )}
          </h3>
          {isEditable ? (
            <span
              className="flex items-center gap-1 px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded"
              title={`Editable in ${editableFile}`}
            >
              <FileCode className="w-3 h-3" />
              {editableFile?.replace("/", "")}
            </span>
          ) : classEditMode === "LIMITED_EDIT" ? (
            <span
              className="flex items-center gap-1 px-2 py-0.5 bg-amber-100 text-amber-700 text-xs rounded"
              title={notEditableReason || "Limited editing mode"}
            >
              <Lock className="w-3 h-3" />
              Limited
            </span>
          ) : (
            <span
              className="flex items-center gap-1 px-2 py-0.5 bg-neutral-100 text-neutral-500 text-xs rounded"
              title={notEditableReason || "Not editable"}
            >
              <Lock className="w-3 h-3" />
              Read-Only
            </span>
          )}
        </div>

        {!isNativeElement ? (
          <div className="text-sm text-neutral-400 italic">
            Managed by Component
          </div>
        ) : (
          <div className="space-y-4">
            {/* Not Editable Explanation */}
            {isDisabled && notEditableReason && (
              <div className="text-sm text-neutral-400 bg-neutral-50 p-2 rounded">
                {notEditableReason}
              </div>
            )}

            {/* Layout Mode Toggle */}
            <div>
              <label className="text-sm text-neutral-500 mb-2 block">
                Layout Mode
              </label>
              <div className="flex bg-neutral-100 rounded-lg p-0.5">
                <LayoutModeButton
                  label="Flex"
                  active={layoutMode === "flex"}
                  disabled={isDisabled}
                  onClick={() => handleClassUpdate("display", "flex")}
                />
                <LayoutModeButton
                  label="Grid"
                  active={layoutMode === "grid"}
                  disabled={isDisabled}
                  onClick={() => handleClassUpdate("display", "grid")}
                />
              </div>
            </div>

            {/* Direction Toggle (Flex only) */}
            {showFlexControls && (
              <div>
                <label className="text-sm text-neutral-500 mb-2 block">
                  Direction
                </label>
                <div className="flex bg-neutral-100 rounded-lg p-0.5">
                  <LayoutModeButton
                    label="→ Row"
                    active={flexDirection === "row" || flexDirection === null}
                    disabled={isDisabled}
                    onClick={() => handleClassUpdate("flexDirection", null)}
                  />
                  <LayoutModeButton
                    label="↓ Column"
                    active={flexDirection === "col"}
                    disabled={isDisabled}
                    onClick={() => handleClassUpdate("flexDirection", "flex-col")}
                  />
                </div>
              </div>
            )}

            {/* Alignment Grid (Flex only) */}
            {showFlexControls && (
              <div>
                <label className="text-sm text-neutral-500 mb-2 block">
                  Alignment
                </label>
                <AlignmentGrid
                  justifyContent={justifyContent}
                  alignItems={alignItems}
                  disabled={isDisabled}
                  onJustifyChange={(value) =>
                    handleClassUpdate(
                      "justifyContent",
                      value ? `justify-${value}` : null
                    )
                  }
                  onAlignChange={(value) =>
                    handleClassUpdate("alignItems", value ? `items-${value}` : null)
                  }
                />
              </div>
            )}

            {/* Gap Input (Flex/Grid) */}
            {showSpacingControls && (
              <div>
                <label className="text-sm text-neutral-500 mb-2 block">Gap</label>
                <SpacingSelect
                  value={gap}
                  disabled={isDisabled}
                  onChange={(value) =>
                    handleClassUpdate("gap", value ? `gap-${value}` : null)
                  }
                />
              </div>
            )}

            {/* Padding Input */}
            <div>
              <label className="text-sm text-neutral-500 mb-2 block">
                Padding
              </label>
              <SpacingSelect
                value={padding}
                disabled={isDisabled}
                onChange={(value) =>
                  handleClassUpdate("padding", value ? `p-${value}` : null)
                }
              />
            </div>

            {/* Reset Button */}
            <button
              onClick={handleResetLayout}
              disabled={isDisabled}
              className="flex items-center justify-center gap-2 w-full px-3 py-2 text-sm font-medium text-neutral-600 bg-neutral-100 hover:bg-neutral-200 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Reset Layout
            </button>
          </div>
        )}
      </div>

      {/* Typography Section */}
      <div className="p-4 border-b border-neutral-200">
        <h3 className="text-sm font-medium text-neutral-500 uppercase tracking-wide mb-3">
          Typography
        </h3>
        {!isNativeElement ? (
          <div className="text-sm text-neutral-400 italic">Managed by Component</div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="text-sm text-neutral-500 mb-2 block">Font Size</label>
              <FontSizeSelect
                value={fontSize}
                disabled={isDisabled}
                onChange={(v) => handleClassUpdate("fontSize", v ? `text-${v}` : null)}
              />
            </div>
            <div>
              <label className="text-sm text-neutral-500 mb-2 block">Weight</label>
              <FontWeightButtons
                value={fontWeight}
                disabled={isDisabled}
                onChange={(v) => handleClassUpdate("fontWeight", v ? `font-${v}` : null)}
              />
            </div>
            <div>
              <label className="text-sm text-neutral-500 mb-2 block">Align</label>
              <TextAlignButtons
                value={textAlign}
                disabled={isDisabled}
                onChange={(v) => handleClassUpdate("textAlign", v ? `text-${v}` : null)}
              />
            </div>
          </div>
        )}
      </div>

      {/* Fill Section */}
      <div className="p-4 border-b border-neutral-200">
        <h3 className="text-sm font-medium text-neutral-500 uppercase tracking-wide mb-3">
          Fill
        </h3>
        {!isNativeElement ? (
          <div className="text-sm text-neutral-400 italic">Managed by Component</div>
        ) : (
          <TokenColorSelect
            value={bgColor}
            options={BG_COLOR_OPTIONS}
            disabled={isDisabled}
            onChange={(v) => handleClassUpdate("bgColor", v ? `bg-${v}` : null)}
          />
        )}
      </div>

      {/* Text Color Section */}
      <div className="p-4 border-b border-neutral-200">
        <h3 className="text-sm font-medium text-neutral-500 uppercase tracking-wide mb-3">
          Text Color
        </h3>
        {!isNativeElement ? (
          <div className="text-sm text-neutral-400 italic">Managed by Component</div>
        ) : (
          <TokenColorSelect
            value={textColor}
            options={TEXT_COLOR_OPTIONS}
            disabled={isDisabled}
            onChange={(v) => handleClassUpdate("textColor", v ? `text-${v}` : null)}
          />
        )}
      </div>

      {/* Dimensions */}
      <div className="p-4 border-b border-neutral-200">
        <h3 className="text-sm font-medium text-neutral-500 uppercase tracking-wide mb-3">
          Dimensions
        </h3>
        {!isNativeElement ? (
          <div className="text-sm text-neutral-400 italic">Managed by Component</div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="text-sm text-neutral-500 mb-2 block">Width</label>
              <DimensionInput
                value={width}
                computedValue={boundingRect ? Math.round(boundingRect.width) : undefined}
                disabled={isDisabled}
                onChange={(v) => handleClassUpdate("width", v ? `w-${v}` : null)}
              />
            </div>
            <div>
              <label className="text-sm text-neutral-500 mb-2 block">Height</label>
              <DimensionInput
                value={height}
                computedValue={boundingRect ? Math.round(boundingRect.height) : undefined}
                disabled={isDisabled}
                onChange={(v) => handleClassUpdate("height", v ? `h-${v}` : null)}
              />
            </div>
          </div>
        )}
      </div>

      {/* Border */}
      <div className="p-4 border-b border-neutral-200">
        <h3 className="text-sm font-medium text-neutral-500 uppercase tracking-wide mb-3">
          Border
        </h3>
        {!isNativeElement ? (
          <div className="text-sm text-neutral-400 italic">Managed by Component</div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="text-sm text-neutral-500 mb-2 block">Radius</label>
              <BorderRadiusInput
                value={borderRadius}
                disabled={isDisabled}
                onChange={(v) => {
                  if (v === null) {
                    handleClassUpdate("borderRadius", null);
                  } else if (v === "") {
                    handleClassUpdate("borderRadius", "rounded");
                  } else if (v === "none") {
                    handleClassUpdate("borderRadius", "rounded-none");
                  } else if (v.startsWith("[")) {
                    handleClassUpdate("borderRadius", `rounded-${v}`);
                  } else {
                    handleClassUpdate("borderRadius", `rounded-${v}`);
                  }
                }}
              />
            </div>
            <div>
              <label className="text-sm text-neutral-500 mb-2 block">Width</label>
              <BorderWidthSelect
                value={borderWidth}
                disabled={isDisabled}
                onChange={(v) => {
                  if (v === null) {
                    handleClassUpdate("borderWidth", null);
                  } else if (v === "") {
                    handleClassUpdate("borderWidth", "border");
                  } else if (v === "0") {
                    handleClassUpdate("borderWidth", "border-0");
                  } else {
                    handleClassUpdate("borderWidth", `border-${v}`);
                  }
                }}
              />
            </div>
            <div>
              <label className="text-sm text-neutral-500 mb-2 block">Color</label>
              <TokenColorSelect
                value={borderColor}
                options={BORDER_COLOR_OPTIONS}
                disabled={isDisabled}
                onChange={(v) => handleClassUpdate("borderColor", v ? `border-${v}` : null)}
              />
            </div>
          </div>
        )}
      </div>

      {/* Effects */}
      <div className="p-4 border-b border-neutral-200">
        <h3 className="text-sm font-medium text-neutral-500 uppercase tracking-wide mb-3">
          Effects
        </h3>
        {!isNativeElement ? (
          <div className="text-sm text-neutral-400 italic">Managed by Component</div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="text-sm text-neutral-500 mb-2 block">Shadow</label>
              <ShadowSelect
                value={shadow}
                disabled={isDisabled}
                onChange={(v) => {
                  if (v === null) {
                    handleClassUpdate("shadow", null);
                  } else if (v === "") {
                    handleClassUpdate("shadow", "shadow");
                  } else if (v === "none") {
                    handleClassUpdate("shadow", "shadow-none");
                  } else {
                    handleClassUpdate("shadow", `shadow-${v}`);
                  }
                }}
              />
            </div>
            <div>
              <label className="text-sm text-neutral-500 mb-2 block">Opacity</label>
              <OpacitySlider
                value={opacity}
                disabled={isDisabled}
                onChange={(v) => handleClassUpdate("opacity", v ? `opacity-${v}` : null)}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Helper Components
// ============================================================================

function LayoutModeButton({
  label,
  active,
  disabled,
  onClick,
}: {
  label: string;
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex-1 px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
        active
          ? "bg-white text-neutral-900 shadow-sm"
          : "text-neutral-600 hover:text-neutral-900"
      } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
    >
      {label}
    </button>
  );
}

function AlignmentGrid({
  justifyContent,
  alignItems,
  disabled,
  onJustifyChange,
  onAlignChange,
}: {
  justifyContent: string | null;
  alignItems: string | null;
  disabled?: boolean;
  onJustifyChange: (value: string | null) => void;
  onAlignChange: (value: string | null) => void;
}) {
  // Map position to justify and align values
  const alignMap: Record<string, { justify: string | null; align: string | null }> = {
    "top-left": { justify: "start", align: "start" },
    "top-center": { justify: "center", align: "start" },
    "top-right": { justify: "end", align: "start" },
    "center-left": { justify: "start", align: "center" },
    "center-center": { justify: "center", align: "center" },
    "center-right": { justify: "end", align: "center" },
    "bottom-left": { justify: "start", align: "end" },
    "bottom-center": { justify: "center", align: "end" },
    "bottom-right": { justify: "end", align: "end" },
  };

  // Determine current position
  const currentJustify = justifyContent || "start";
  const currentAlign = alignItems || "start";

  // Find current position key
  let currentPosition = "top-left";
  for (const [key, value] of Object.entries(alignMap)) {
    if (value.justify === currentJustify && value.align === currentAlign) {
      currentPosition = key;
      break;
    }
  }

  const handleClick = (position: string) => {
    if (disabled) return;
    const { justify, align } = alignMap[position];
    onJustifyChange(justify);
    onAlignChange(align);
  };

  const positions = [
    ["top-left", "top-center", "top-right"],
    ["center-left", "center-center", "center-right"],
    ["bottom-left", "bottom-center", "bottom-right"],
  ];

  const arrows: Record<string, string> = {
    "top-left": "↖",
    "top-center": "↑",
    "top-right": "↗",
    "center-left": "←",
    "center-center": "•",
    "center-right": "→",
    "bottom-left": "↙",
    "bottom-center": "↓",
    "bottom-right": "↘",
  };

  return (
    <div className="flex gap-4">
      {/* 3x3 Grid */}
      <div className="grid grid-cols-3 gap-1 bg-neutral-100 p-1 rounded-lg">
        {positions.map((row) =>
          row.map((position) => (
            <button
              key={position}
              onClick={() => handleClick(position)}
              disabled={disabled}
              className={`w-7 h-7 flex items-center justify-center text-sm rounded transition-colors ${
                currentPosition === position
                  ? "bg-blue-500 text-white"
                  : "bg-white text-neutral-600 hover:bg-neutral-50"
              } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
            >
              {arrows[position]}
            </button>
          ))
        )}
      </div>

      {/* Justify Dropdown */}
      <div className="flex-1">
        <label className="text-sm text-neutral-400 mb-1 block">Justify</label>
        <select
          value={currentJustify}
          onChange={(e) => onJustifyChange(e.target.value || null)}
          disabled={disabled}
          className="w-full px-2 py-1.5 text-sm bg-white border border-neutral-200 rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <option value="start">Start</option>
          <option value="center">Center</option>
          <option value="end">End</option>
          <option value="between">Between</option>
          <option value="around">Around</option>
          <option value="evenly">Evenly</option>
        </select>
      </div>
    </div>
  );
}

function SpacingSelect({
  value,
  disabled,
  onChange,
}: {
  value: string | null;
  disabled?: boolean;
  onChange: (value: string | null) => void;
}) {
  return (
    <select
      value={value || ""}
      onChange={(e) => onChange(e.target.value || null)}
      disabled={disabled}
      className="w-full px-2 py-1.5 text-sm bg-white border border-neutral-200 rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
    >
      <option value="">None</option>
      {SPACING_SCALE.map(({ value: v, px }) => (
        <option key={v} value={v}>
          {v} ({px}px)
        </option>
      ))}
    </select>
  );
}

function FontSizeSelect({
  value,
  disabled,
  onChange,
}: {
  value: string | null;
  disabled?: boolean;
  onChange: (value: string | null) => void;
}) {
  return (
    <select
      value={value || ""}
      onChange={(e) => onChange(e.target.value || null)}
      disabled={disabled}
      className="w-full px-2 py-1.5 text-sm bg-white border border-neutral-200 rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
    >
      <option value="">Default</option>
      {FONT_SIZE_SCALE.map(({ value: v, label, size }) => (
        <option key={v} value={v}>
          {label} ({size})
        </option>
      ))}
    </select>
  );
}

function FontWeightButtons({
  value,
  disabled,
  onChange,
}: {
  value: string | null;
  disabled?: boolean;
  onChange: (value: string | null) => void;
}) {
  return (
    <div className="flex bg-neutral-100 rounded-lg p-0.5">
      {FONT_WEIGHT_SCALE.map(({ value: v, label, weight }) => (
        <button
          key={v}
          onClick={() => onChange(value === v ? null : v)}
          disabled={disabled}
          style={{ fontWeight: weight }}
          className={`flex-1 px-2 py-1.5 text-sm rounded-md transition-colors ${
            value === v
              ? "bg-white text-neutral-900 shadow-sm"
              : "text-neutral-600 hover:text-neutral-900"
          } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function TextAlignButtons({
  value,
  disabled,
  onChange,
}: {
  value: string | null;
  disabled?: boolean;
  onChange: (value: string | null) => void;
}) {
  const options = [
    { value: "left", icon: AlignLeft },
    { value: "center", icon: AlignCenter },
    { value: "right", icon: AlignRight },
  ];

  return (
    <div className="flex bg-neutral-100 rounded-lg p-0.5">
      {options.map(({ value: v, icon: Icon }) => (
        <button
          key={v}
          onClick={() => onChange(value === v ? null : v)}
          disabled={disabled}
          className={`flex-1 p-1.5 flex items-center justify-center rounded-md transition-colors ${
            value === v
              ? "bg-white text-neutral-900 shadow-sm"
              : "text-neutral-600 hover:text-neutral-900"
          } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
        >
          <Icon className="w-4 h-4" />
        </button>
      ))}
    </div>
  );
}

function TokenColorSelect({
  value,
  options,
  disabled,
  onChange,
}: {
  value: string | null;
  options: Array<{ value: string; label: string; cssVar: string }>;
  disabled?: boolean;
  onChange: (value: string | null) => void;
}) {
  return (
    <div className="relative">
      <select
        value={value || ""}
        onChange={(e) => onChange(e.target.value || null)}
        disabled={disabled}
        className="w-full pl-8 pr-2 py-1.5 text-sm bg-white border border-neutral-200 rounded-md appearance-none disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {options.map(({ value: v, label }) => (
          <option key={v} value={v}>
            {label}
          </option>
        ))}
      </select>
      {/* Color swatch positioned inside the select */}
      {value && (
        <div
          className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 rounded border border-neutral-300"
          style={{ backgroundColor: `hsl(var(--${value}))` }}
        />
      )}
      {/* Dropdown chevron */}
      <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none">
        <svg className="w-4 h-4 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </div>
    </div>
  );
}

function DimensionInput({
  value,
  computedValue,
  disabled,
  onChange,
}: {
  value: string | null;
  computedValue?: number;
  disabled?: boolean;
  onChange: (value: string | null) => void;
}) {
  const [inputValue, setInputValue] = useState("");
  const [isFocused, setIsFocused] = useState(false);

  // Parse the current value for display
  const getDisplayValue = (): string => {
    if (!value) return "";
    // Extract value from arbitrary format [350px] -> 350
    const arbitraryMatch = value.match(/^\[(.+)\]$/);
    if (arbitraryMatch) {
      return arbitraryMatch[1].replace("px", "");
    }
    // For presets, show nothing (handled by dropdown)
    if (DIMENSION_PRESETS.some(p => p.value === value)) {
      return "";
    }
    // For Tailwind spacing numbers
    return value;
  };

  // Sync input value when external value changes
  useEffect(() => {
    if (!isFocused) {
      setInputValue(getDisplayValue());
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, isFocused]);

  // Check if current value is a preset
  const currentPreset = DIMENSION_PRESETS.find(p => p.value === value)?.value || "";

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value);
  };

  const handleInputBlur = () => {
    setIsFocused(false);
    const trimmed = inputValue.trim();
    if (!trimmed) {
      // Don't clear if using a preset
      if (!currentPreset) {
        onChange(null);
      }
      return;
    }
    // Smart conversion: bare number -> [Xpx], percentage/vh/vw kept as-is
    if (/^\d+$/.test(trimmed)) {
      onChange(`[${trimmed}px]`);
    } else if (/^\d+(%|vh|vw|rem|em)$/.test(trimmed)) {
      onChange(`[${trimmed}]`);
    } else if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
      onChange(trimmed);
    } else {
      // Try to use as-is (for Tailwind spacing numbers like "64")
      onChange(trimmed);
    }
  };

  const handlePresetChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const preset = e.target.value;
    if (preset) {
      onChange(preset);
      setInputValue("");
    } else {
      // "Custom" selected - clear preset but keep input
      if (!inputValue) {
        onChange(null);
      }
    }
  };

  return (
    <div className="flex gap-2">
      <input
        type="text"
        value={inputValue}
        onChange={handleInputChange}
        onFocus={() => setIsFocused(true)}
        onBlur={handleInputBlur}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            handleInputBlur();
            (e.target as HTMLInputElement).blur();
          }
        }}
        disabled={disabled}
        placeholder={computedValue !== undefined ? `${computedValue}` : "auto"}
        className="flex-1 px-2 py-1.5 text-sm bg-white border border-neutral-200 rounded-md disabled:opacity-50 disabled:cursor-not-allowed focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
      />
      <select
        value={currentPreset}
        onChange={handlePresetChange}
        disabled={disabled}
        className="px-2 py-1.5 text-sm bg-white border border-neutral-200 rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <option value="">Custom</option>
        {DIMENSION_PRESETS.map(({ value: v, label }) => (
          <option key={v} value={v}>
            {label}
          </option>
        ))}
      </select>
    </div>
  );
}

function BorderRadiusInput({
  value,
  disabled,
  onChange,
}: {
  value: string | null;
  disabled?: boolean;
  onChange: (value: string | null) => void;
}) {
  const [customValue, setCustomValue] = useState("");
  const [showCustomInput, setShowCustomInput] = useState(false);

  // Find current scale index
  const scaleIndex = BORDER_RADIUS_SCALE.findIndex(s => s.value === value);
  const isOnScale = scaleIndex !== -1;
  const isArbitrary = value !== null && value.startsWith("[");

  // Sync custom value when external value changes
  useEffect(() => {
    if (isArbitrary && value) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCustomValue(value.slice(1, -1)); // Remove brackets
      setShowCustomInput(true);
    } else {
      setShowCustomInput(false);
    }
  }, [value, isArbitrary]);

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const index = parseInt(e.target.value);
    const scaleValue = BORDER_RADIUS_SCALE[index].value;
    setShowCustomInput(false);
    onChange(scaleValue === "none" ? "none" : scaleValue);
  };

  const handleCustomBlur = () => {
    const trimmed = customValue.trim();
    if (!trimmed) {
      onChange(null);
      setShowCustomInput(false);
      return;
    }
    // Wrap in brackets if not already
    if (!trimmed.startsWith("[")) {
      onChange(`[${trimmed}]`);
    } else {
      onChange(trimmed);
    }
  };

  // Get current scale label
  const currentLabel = isOnScale
    ? `${BORDER_RADIUS_SCALE[scaleIndex].label} (${BORDER_RADIUS_SCALE[scaleIndex].px})`
    : isArbitrary
      ? `Custom (${value?.slice(1, -1)})`
      : "None";

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <input
          type="range"
          min={0}
          max={BORDER_RADIUS_SCALE.length - 1}
          value={isOnScale ? scaleIndex : 0}
          onChange={handleSliderChange}
          disabled={disabled}
          className="flex-1 h-2 bg-neutral-200 rounded-lg appearance-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        />
        <span className="text-sm text-neutral-600 min-w-[80px] text-right">{currentLabel}</span>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={() => setShowCustomInput(!showCustomInput)}
          disabled={disabled}
          className={`text-sm px-2 py-1 rounded transition-colors ${
            showCustomInput
              ? "bg-blue-100 text-blue-700"
              : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
          } disabled:opacity-50 disabled:cursor-not-allowed`}
        >
          Custom
        </button>
        {showCustomInput && (
          <input
            type="text"
            value={customValue}
            onChange={(e) => setCustomValue(e.target.value)}
            onBlur={handleCustomBlur}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                handleCustomBlur();
                (e.target as HTMLInputElement).blur();
              }
            }}
            disabled={disabled}
            placeholder="12px"
            className="flex-1 px-2 py-1 text-sm bg-white border border-neutral-200 rounded-md disabled:opacity-50 disabled:cursor-not-allowed focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          />
        )}
      </div>
    </div>
  );
}

function BorderWidthSelect({
  value,
  disabled,
  onChange,
}: {
  value: string | null;
  disabled?: boolean;
  onChange: (value: string | null) => void;
}) {
  return (
    <select
      value={value ?? "none"}
      onChange={(e) => {
        const v = e.target.value;
        if (v === "none") {
          onChange(null);
        } else {
          onChange(v);
        }
      }}
      disabled={disabled}
      className="w-full px-2 py-1.5 text-sm bg-white border border-neutral-200 rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
    >
      <option value="none">None</option>
      {BORDER_WIDTH_SCALE.map(({ value: v, label }) => (
        <option key={v || "default"} value={v}>
          {label}
        </option>
      ))}
    </select>
  );
}

function ShadowSelect({
  value,
  disabled,
  onChange,
}: {
  value: string | null;
  disabled?: boolean;
  onChange: (value: string | null) => void;
}) {
  return (
    <select
      value={value ?? "off"}
      onChange={(e) => {
        const v = e.target.value;
        if (v === "off") {
          onChange(null);
        } else {
          onChange(v);
        }
      }}
      disabled={disabled}
      className="w-full px-2 py-1.5 text-sm bg-white border border-neutral-200 rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
    >
      <option value="off">Off</option>
      {SHADOW_SCALE.map(({ value: v, label }) => (
        <option key={v || "default"} value={v}>
          {label}
        </option>
      ))}
    </select>
  );
}

function OpacitySlider({
  value,
  disabled,
  onChange,
}: {
  value: string | null;
  disabled?: boolean;
  onChange: (value: string | null) => void;
}) {
  // Map value to slider position (0-100)
  const getSliderValue = (): number => {
    if (value === null) return 100;
    const parsed = parseInt(value);
    return isNaN(parsed) ? 100 : parsed;
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = parseInt(e.target.value);
    if (newValue === 100) {
      onChange(null); // Remove opacity class at 100%
    } else {
      // Find closest value in OPACITY_SCALE
      const closest = OPACITY_SCALE.reduce((prev, curr) => {
        return Math.abs(curr.percent - newValue) < Math.abs(prev.percent - newValue) ? curr : prev;
      });
      onChange(closest.value);
    }
  };

  const currentValue = getSliderValue();

  return (
    <div className="flex items-center gap-3">
      <input
        type="range"
        min={0}
        max={100}
        step={25}
        value={currentValue}
        onChange={handleChange}
        disabled={disabled}
        className="flex-1 h-2 bg-neutral-200 rounded-lg appearance-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
      />
      <span className="text-sm text-neutral-600 min-w-[40px] text-right">{currentValue}%</span>
    </div>
  );
}

// ============================================================================
// PropEditor Component
// ============================================================================

function PropEditor({
  prop,
  onUpdate,
  onRemove,
}: {
  prop: ParsedProp;
  onUpdate?: (propName: string, value: string | boolean) => void;
  onRemove?: (propName: string) => void;
}) {
  // Only store editing value when actively editing
  // Use prop.value directly for display, switch to local state when editing
  const [editingValue, setEditingValue] = useState<string | null>(null);

  // Compute display value from prop
  const displayValue =
    prop.valueType === "string" && typeof prop.value === "string"
      ? prop.value
      : prop.valueType === "expression" && prop.rawValue
        ? prop.rawValue
        : "";

  // Are we currently editing?
  const isEditing = editingValue !== null;

  // Handle boolean toggle
  const handleBooleanToggle = () => {
    if (!onUpdate) return;
    const currentValue = prop.value === true || prop.valueType === "none";
    onUpdate(prop.name, !currentValue);
  };

  // Start editing - copy current value to local state
  const startEditing = () => {
    setEditingValue(displayValue);
  };

  // Handle string value save
  const handleStringSave = () => {
    if (editingValue === null) return;
    const trimmed = editingValue.trim();
    setEditingValue(null); // Exit editing mode
    if (!onUpdate) return;
    if (trimmed !== prop.value) {
      onUpdate(prop.name, trimmed);
    }
  };

  // Cancel editing
  const cancelEditing = () => {
    setEditingValue(null);
  };

  // Handle prop removal
  const handleRemove = () => {
    if (!onRemove) return;
    onRemove(prop.name);
  };

  // Handle enum select change
  const handleEnumChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    if (!onUpdate) return;
    onUpdate(prop.name, e.target.value);
  };

  // Determine if this is a boolean prop
  const isBoolean = prop.valueType === "boolean" || prop.valueType === "none";
  const booleanValue = prop.value === true || prop.valueType === "none";

  // Expression props are read-only (e.g., onClick handlers)
  const isExpression = prop.valueType === "expression";

  // Check if this prop has enum options (dropdown)
  const hasOptions = prop.options && prop.options.length > 0;

  // Phantom prop = schema prop not currently set in JSX (value is null)
  const isPhantomProp = prop.value === null && hasOptions;

  // Only show remove button for props that are actually in the JSX
  const canRemove = !isExpression && !isPhantomProp;

  return (
    <div className="flex items-center gap-2 group">
      {/* Prop Name */}
      <label
        className={`text-sm font-mono min-w-[80px] truncate ${
          isPhantomProp ? "text-neutral-400" : "text-neutral-600"
        }`}
        title={prop.name}
      >
        {prop.name}
      </label>

      {/* Value Editor */}
      <div className="flex-1">
        {isBoolean ? (
          // Boolean Toggle
          <button
            onClick={handleBooleanToggle}
            className="flex items-center gap-1.5 text-sm"
            title={booleanValue ? "Click to set false" : "Click to set true"}
          >
            {booleanValue ? (
              <ToggleRight className="w-5 h-5 text-blue-500" />
            ) : (
              <ToggleLeft className="w-5 h-5 text-neutral-400" />
            )}
            <span className={booleanValue ? "text-blue-600" : "text-neutral-500"}>
              {booleanValue ? "true" : "false"}
            </span>
          </button>
        ) : isExpression ? (
          // Expression (read-only)
          <span
            className="text-sm font-mono text-neutral-400 truncate block"
            title={prop.rawValue}
          >
            {`{${prop.rawValue?.slice(0, 20)}${(prop.rawValue?.length || 0) > 20 ? "..." : ""}}`}
          </span>
        ) : hasOptions ? (
          // Enum Dropdown (with placeholder for phantom props)
          <select
            value={typeof prop.value === "string" ? prop.value : ""}
            onChange={handleEnumChange}
            className={`w-full px-2 py-1 text-sm font-mono bg-white border rounded focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none ${
              isPhantomProp
                ? "border-dashed border-neutral-300 text-neutral-400"
                : "border-neutral-200"
            }`}
          >
            {isPhantomProp && (
              <option value="" disabled>
                Select {prop.name}...
              </option>
            )}
            {prop.options!.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        ) : isEditing ? (
          // String Input (editing)
          <input
            type="text"
            value={editingValue ?? ""}
            onChange={(e) => setEditingValue(e.target.value)}
            onBlur={handleStringSave}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                handleStringSave();
              } else if (e.key === "Escape") {
                cancelEditing();
              }
            }}
            autoFocus
            className="w-full px-2 py-1 text-sm font-mono bg-white border border-blue-500 rounded focus:ring-1 focus:ring-blue-500 outline-none"
          />
        ) : (
          // String Display (click to edit)
          <button
            onClick={startEditing}
            className="w-full text-left px-2 py-1 text-sm font-mono text-neutral-800 bg-neutral-50 hover:bg-neutral-100 border border-neutral-200 rounded truncate transition-colors"
            title={typeof prop.value === "string" ? prop.value : "Click to edit"}
          >
            {typeof prop.value === "string" ? `"${prop.value}"` : "—"}
          </button>
        )}
      </div>

      {/* Remove Button - only for props actually in JSX */}
      {canRemove && (
        <button
          onClick={handleRemove}
          className="p-1 text-neutral-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
          title="Remove prop"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}
