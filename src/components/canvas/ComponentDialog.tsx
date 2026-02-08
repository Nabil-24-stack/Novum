"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Search, X } from "lucide-react";
import {
  buildComponentRegistry,
  filterComponents,
  type ComponentDefinition,
} from "@/lib/canvas/component-registry";

interface ComponentDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (componentType: string, defaultWidth: number, defaultHeight: number) => void;
  /** VFS files - used to extract design system CSS for accurate previews */
  files: Record<string, string>;
}

/**
 * Extract CSS custom properties from VFS globals.css
 * Returns an object that can be spread as inline styles
 */
function extractCssVariables(globalsCss: string): React.CSSProperties {
  const cssVars: Record<string, string> = {};

  // Match CSS variable declarations in :root block
  // Use [\s\S] instead of . with /s flag for cross-line matching
  const rootMatch = globalsCss.match(/:root\s*\{([\s\S]*?)\}/);
  if (rootMatch) {
    const rootContent = rootMatch[1];
    const varRegex = /(--[\w-]+):\s*([^;]+);/g;
    let match;
    while ((match = varRegex.exec(rootContent)) !== null) {
      const [, varName, varValue] = match;
      cssVars[varName] = varValue.trim();
    }
  }

  return cssVars as unknown as React.CSSProperties;
}

export function ComponentDialog({ isOpen, onClose, onSelect, files }: ComponentDialogProps) {
  const [searchQuery, setSearchQuery] = useState("");

  // Build component registry dynamically from VFS files
  const componentRegistry = useMemo(
    () => buildComponentRegistry(files),
    [files]
  );

  // Filter components based on search query
  const filteredComponents = useMemo(
    () => filterComponents(componentRegistry, searchQuery),
    [componentRegistry, searchQuery]
  );

  // Extract CSS variables from VFS globals.css for accurate previews
  const designSystemStyles = useMemo(() => {
    const globalsCss = files["/globals.css"] || "";
    return extractCssVariables(globalsCss);
  }, [files]);

  // Handle Escape key and reset search on close
  useEffect(() => {
    if (!isOpen) {
      // Defer the state reset until after render cycle completes
      const timeoutId = setTimeout(() => setSearchQuery(""), 0);
      return () => clearTimeout(timeoutId);
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  const handleSelect = useCallback((component: ComponentDefinition) => {
    onSelect(component.name, component.defaultWidth, component.defaultHeight);
    onClose();
  }, [onSelect, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/20"
        onClick={onClose}
      />

      {/* Dialog */}
      <div className="relative bg-white rounded-xl shadow-xl border border-neutral-200 w-[600px] max-h-[500px] overflow-hidden flex flex-col">
        {/* Header with search */}
        <div className="p-4 border-b border-neutral-100">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
            <input
              type="text"
              placeholder="Search components..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-10 pl-10 pr-10 bg-neutral-50 border border-neutral-200 rounded-lg text-neutral-900 text-base placeholder:text-neutral-400 focus:outline-none focus:border-neutral-300 focus:ring-2 focus:ring-neutral-100"
              autoFocus
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-neutral-400 hover:text-neutral-600 rounded transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Component grid */}
        <div className="flex-1 overflow-y-auto p-4">
          {filteredComponents.length === 0 ? (
            <div className="text-center text-neutral-500 py-8">
              No components found for &quot;{searchQuery}&quot;
            </div>
          ) : (
            <>
              <div className="text-sm font-medium text-neutral-500 uppercase tracking-wider mb-3 px-1">
                Components
              </div>
              <div className="grid grid-cols-3 gap-3">
                {filteredComponents.map((component) => (
                  <ComponentCard
                    key={component.name}
                    component={component}
                    onClick={() => handleSelect(component)}
                    designSystemStyles={designSystemStyles}
                  />
                ))}
              </div>
            </>
          )}
        </div>

      </div>
    </div>
  );
}

interface ComponentCardProps {
  component: ComponentDefinition;
  onClick: () => void;
  designSystemStyles: React.CSSProperties;
}

function ComponentCard({ component, onClick, designSystemStyles }: ComponentCardProps) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      className="group flex flex-col bg-white border border-neutral-200 rounded-lg overflow-hidden transition-all hover:border-neutral-300 hover:shadow-md focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 cursor-pointer"
    >
      {/* Preview area - applies VFS design system CSS variables */}
      <div
        className="flex items-center justify-center p-4 min-h-[80px] bg-neutral-50"
        style={designSystemStyles}
      >
        <div className="transform scale-90 pointer-events-none">
          {component.preview}
        </div>
      </div>

      {/* Name */}
      <div className="px-3 py-2 border-t border-neutral-100 bg-white">
        <span className="text-sm font-medium text-neutral-600 group-hover:text-neutral-900 transition-colors">
          {component.name}
        </span>
      </div>
    </div>
  );
}
