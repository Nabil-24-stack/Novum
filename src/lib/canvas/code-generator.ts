import type { GhostElement, CanvasNode, LayoutConfig, NodeStyle } from "./types";
import type { ComponentDefinition } from "./component-registry";
import { KNOWN_COMPONENTS } from "./component-registry";

// ============================================================================
// Types
// ============================================================================

export interface ImportInfo {
  componentName: string;
  importPath: string;
  isNamedExport: boolean;
}

export interface GeneratedCode {
  jsx: string;
  imports: ImportInfo[];
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Convert component display name to registry key.
 * e.g., "Date Picker" -> "date-picker"
 */
function displayNameToKey(displayName: string): string {
  return displayName.toLowerCase().replace(/\s+/g, "-");
}

/**
 * Get component definition from registry by display name or component type.
 */
function getComponentDefinition(
  componentType: string
): Omit<ComponentDefinition, "name"> | null {
  const key = displayNameToKey(componentType);
  return KNOWN_COMPONENTS[key] || null;
}

// ============================================================================
// Code Generation Functions
// ============================================================================

/**
 * Generate JSX code for a frame ghost element.
 * Always uses flow layout with Tailwind classes.
 */
function generateFrameCode(): GeneratedCode {
  // Flow layout - use Tailwind classes for sizing
  const jsx = `<div className="w-full h-32 border rounded-lg bg-white" />`;

  return {
    jsx,
    imports: [],
  };
}

/**
 * Generate JSX code for a text ghost element.
 * Always uses flow layout.
 */
function generateTextCode(ghost: GhostElement): GeneratedCode {
  const content = ghost.content?.trim() || "Text";
  const jsx = `<p>${content}</p>`;

  return {
    jsx,
    imports: [],
  };
}

/**
 * Generate JSX code for a component ghost element.
 * Always uses flow layout - component flows naturally in its container.
 */
function generateComponentCode(ghost: GhostElement): GeneratedCode {
  const componentType = ghost.componentType || "Component";

  // Try to get the component definition from registry
  const definition = getComponentDefinition(componentType);

  let jsx: string;
  const imports: ImportInfo[] = [];

  if (definition) {
    jsx = definition.defaultCode;
    imports.push({
      componentName: definition.componentName,
      importPath: definition.importPath,
      isNamedExport: definition.namedExport ?? true,
    });

    // Some components need additional imports (e.g., Card needs CardHeader, CardContent)
    const additionalImports = getAdditionalImports(componentType, definition.defaultCode);
    imports.push(...additionalImports);
  } else {
    // Unknown component - generate simple placeholder
    const pascalName = componentType
      .split(/[\s-]+/)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join("");

    jsx = `<${pascalName} />`;
    imports.push({
      componentName: pascalName,
      importPath: `./components/ui/${displayNameToKey(componentType)}`,
      isNamedExport: true,
    });
  }

  return {
    jsx,
    imports,
  };
}

/**
 * Extract additional component names that need to be imported based on the default code.
 * For example, Card component might use CardHeader, CardContent, etc.
 */
function getAdditionalImports(componentType: string, defaultCode: string): ImportInfo[] {
  const additionalImports: ImportInfo[] = [];

  // Map of component types to their sub-components
  const subComponentMap: Record<string, { components: string[]; importPath: string }> = {
    card: {
      components: ["CardHeader", "CardTitle", "CardDescription", "CardContent", "CardFooter"],
      importPath: "./components/ui/card",
    },
    tabs: {
      components: ["TabsList", "TabsTrigger", "TabsContent"],
      importPath: "./components/ui/tabs",
    },
    dialog: {
      components: ["DialogTrigger", "DialogContent", "DialogHeader", "DialogTitle", "DialogDescription"],
      importPath: "./components/ui/dialog",
    },
    select: {
      components: ["SelectOption"],
      importPath: "./components/ui/select",
    },
    accordion: {
      components: ["AccordionItem", "AccordionTrigger", "AccordionContent"],
      importPath: "./components/ui/accordion",
    },
    avatar: {
      components: ["AvatarImage", "AvatarFallback"],
      importPath: "./components/ui/avatar",
    },
    alert: {
      components: ["AlertTitle", "AlertDescription"],
      importPath: "./components/ui/alert",
    },
    "radio-group": {
      components: ["RadioGroupItem"],
      importPath: "./components/ui/radio-group",
    },
    table: {
      components: ["TableHeader", "TableBody", "TableRow", "TableHead", "TableCell"],
      importPath: "./components/ui/table",
    },
    breadcrumb: {
      components: ["BreadcrumbItem", "BreadcrumbLink", "BreadcrumbSeparator", "BreadcrumbPage"],
      importPath: "./components/ui/breadcrumb",
    },
    tooltip: {
      components: ["TooltipProvider", "TooltipTrigger", "TooltipContent"],
      importPath: "./components/ui/tooltip",
    },
    popover: {
      components: ["PopoverTrigger", "PopoverContent"],
      importPath: "./components/ui/popover",
    },
    toast: {
      components: ["Toaster", "ToastComponent", "ToastTitle", "ToastDescription", "useToast"],
      importPath: "./components/ui/toast",
    },
  };

  const key = displayNameToKey(componentType);
  const subComponents = subComponentMap[key];

  if (subComponents) {
    for (const component of subComponents.components) {
      // Check if the component is used in the default code
      if (defaultCode.includes(`<${component}`)) {
        additionalImports.push({
          componentName: component,
          importPath: subComponents.importPath,
          isNamedExport: true,
        });
      }
    }
  }

  // Check for Button in code (e.g., Dialog might use Button)
  if (defaultCode.includes("<Button") && key !== "button") {
    additionalImports.push({
      componentName: "Button",
      importPath: "./components/ui/button",
      isNamedExport: true,
    });
  }

  // Check for Label in code (e.g., Checkbox might use Label)
  if (defaultCode.includes("<Label") && key !== "label") {
    additionalImports.push({
      componentName: "Label",
      importPath: "./components/ui/label",
      isNamedExport: true,
    });
  }

  return additionalImports;
}

// ============================================================================
// Flex Class Generation
// ============================================================================

/**
 * Build Tailwind flex classes from a LayoutConfig.
 */
export function buildFlexClasses(layout?: LayoutConfig): string {
  if (!layout) return "flex";

  const classes = ["flex"];

  // Direction
  if (layout.direction === "column") {
    classes.push("flex-col");
  } else {
    classes.push("flex-row");
  }

  // Gap
  classes.push(`gap-[${layout.gap}px]`);

  // Padding
  if (layout.padding && layout.padding > 0) {
    classes.push(`p-[${layout.padding}px]`);
  }

  // Align items
  if (layout.alignItems) {
    switch (layout.alignItems) {
      case "start":
        classes.push("items-start");
        break;
      case "center":
        classes.push("items-center");
        break;
      case "end":
        classes.push("items-end");
        break;
      case "stretch":
        classes.push("items-stretch");
        break;
    }
  }

  // Width sizing mode
  if (layout.widthMode) {
    switch (layout.widthMode) {
      case "fill":
        classes.push("w-full");
        break;
      case "hug":
        classes.push("w-fit");
        break;
      // "fixed" uses explicit width from style - no class needed
    }
  }

  // Height sizing mode
  if (layout.heightMode) {
    switch (layout.heightMode) {
      case "fill":
        classes.push("h-full");
        break;
      case "hug":
        classes.push("h-fit");
        break;
      // "fixed" uses explicit height from style - no class needed
    }
  }

  return classes.join(" ");
}

/**
 * Build Tailwind style classes from a NodeStyle.
 */
export function buildStyleClasses(style?: NodeStyle): string {
  if (!style) return "";

  const classes: string[] = [];

  // Background color
  if (style.backgroundColor) {
    classes.push(`bg-${style.backgroundColor}`);
  }

  // Border width
  if (style.borderWidth && style.borderWidth > 0) {
    if (style.borderWidth === 1) {
      classes.push("border");
    } else {
      classes.push(`border-${style.borderWidth}`);
    }
  }

  // Border color (only if border width is set)
  if (style.borderWidth && style.borderWidth > 0 && style.borderColor) {
    classes.push(`border-${style.borderColor}`);
  }

  // Border radius
  if (style.borderRadius && style.borderRadius > 0) {
    if (style.borderRadius >= 9999) {
      classes.push("rounded-full");
    } else {
      classes.push(`rounded-[${style.borderRadius}px]`);
    }
  }

  return classes.join(" ");
}

// ============================================================================
// Hierarchical Code Generation
// ============================================================================

/**
 * Recursively generate JSX code for a CanvasNode and its children.
 * Groups become flex containers with their children inside.
 */
export function generateCodeForNode(
  node: CanvasNode,
  nodes: Map<string, CanvasNode>
): GeneratedCode {
  // If node has children, it's a group - generate flex container
  if (node.children && node.children.length > 0) {
    const flexClasses = buildFlexClasses(node.layout);
    const styleClasses = buildStyleClasses(node.style);
    const allClasses = [flexClasses, styleClasses].filter(Boolean).join(" ");

    const allImports: ImportInfo[] = [];
    const childrenJsx: string[] = [];

    // Recursively generate code for each child
    for (const childId of node.children) {
      const child = nodes.get(childId);
      if (!child) continue;

      const childCode = generateCodeForNode(child, nodes);
      childrenJsx.push(childCode.jsx);
      allImports.push(...childCode.imports);
    }

    // Deduplicate imports
    const uniqueImports = deduplicateImports(allImports);

    // Build the container with children
    const jsx = childrenJsx.length > 0
      ? `<div className="${allClasses}">\n  ${childrenJsx.join("\n  ")}\n</div>`
      : `<div className="${allClasses}" />`;

    return {
      jsx,
      imports: uniqueImports,
    };
  }

  // Leaf node - use existing ghost code generation
  return generateCodeForGhost(node);
}

/**
 * Deduplicate imports by component name.
 */
function deduplicateImports(imports: ImportInfo[]): ImportInfo[] {
  const seen = new Map<string, ImportInfo>();

  for (const imp of imports) {
    if (!seen.has(imp.componentName)) {
      seen.set(imp.componentName, imp);
    }
  }

  return Array.from(seen.values());
}

// ============================================================================
// Main Export
// ============================================================================

/**
 * Generate JSX code and required imports for a ghost element.
 * All elements use flow/auto-layout - no absolute positioning.
 *
 * @param ghost - The ghost element to generate code for
 * @returns Generated JSX code and array of required imports
 */
export function generateCodeForGhost(ghost: GhostElement): GeneratedCode {
  switch (ghost.type) {
    case "frame":
      return generateFrameCode();
    case "text":
      return generateTextCode(ghost);
    case "component":
      return generateComponentCode(ghost);
    default:
      return {
        jsx: "<!-- Unknown ghost type -->",
        imports: [],
      };
  }
}
