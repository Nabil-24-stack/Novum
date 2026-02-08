import { parse } from "@babel/parser";
import _traverse from "@babel/traverse";
import type * as t from "@babel/types";

// Handle ESM/CJS interop for Babel traverse
const traverse = (
  typeof _traverse === "function" ? _traverse : (_traverse as { default: typeof _traverse }).default
) as typeof _traverse;

// ============================================================================
// Types
// ============================================================================

export interface PropSchema {
  /** Map of prop names to their valid string options (for union types) */
  enumProps: Record<string, string[]>;
}

// ============================================================================
// Component File Path Resolution
// ============================================================================

/**
 * Resolve a component name to its likely file path in the VFS.
 * Handles both simple components (Button -> /components/ui/button.tsx)
 * and composite components (CardHeader -> /components/ui/card.tsx).
 */
export function resolveComponentFilePath(
  componentName: string,
  files: Record<string, string>
): string | null {
  // Skip native HTML elements (lowercase)
  if (componentName[0] === componentName[0].toLowerCase()) {
    return null;
  }

  // Convert PascalCase to kebab-case
  const kebabName = componentName
    .replace(/([a-z])([A-Z])/g, "$1-$2")
    .toLowerCase();

  // Try exact match first: Button -> /components/ui/button.tsx
  const exactPath = `/components/ui/${kebabName}.tsx`;
  if (files[exactPath]) {
    return exactPath;
  }

  // Try composite component: CardHeader -> /components/ui/card.tsx
  // Extract the base component name (first word)
  const baseMatch = componentName.match(/^([A-Z][a-z]+)/);
  if (baseMatch) {
    const baseName = baseMatch[1].toLowerCase();
    const basePath = `/components/ui/${baseName}.tsx`;
    if (files[basePath]) {
      return basePath;
    }
  }

  // Search all component files for the export
  for (const [filePath, content] of Object.entries(files)) {
    if (!filePath.startsWith("/components/") || !filePath.endsWith(".tsx")) {
      continue;
    }
    // Quick check: does the file export this component?
    if (content.includes(`export { ${componentName}`) ||
        content.includes(`export const ${componentName}`) ||
        content.includes(`export function ${componentName}`)) {
      return filePath;
    }
  }

  return null;
}

// ============================================================================
// Prop Schema Scanner
// ============================================================================

/**
 * Scan a component file for TypeScript prop interfaces and extract
 * enum/union type props.
 *
 * Looks for patterns like:
 *   interface ButtonProps { variant?: "default" | "outline" | "ghost"; }
 *   type ButtonProps = { size?: "sm" | "md" | "lg"; }
 */
export function scanComponentPropSchema(
  componentCode: string,
  componentName: string
): PropSchema | null {
  try {
    const ast = parse(componentCode, {
      sourceType: "module",
      plugins: ["jsx", "typescript"],
    });

    const enumProps: Record<string, string[]> = {};

    // Look for interface ComponentNameProps or type ComponentNameProps
    const propsTypeName = `${componentName}Props`;

    traverse(ast, {
      // Handle: interface ButtonProps { ... }
      TSInterfaceDeclaration(path) {
        if (path.node.id.name !== propsTypeName) return;

        const body = path.node.body.body;
        for (const prop of body) {
          if (prop.type === "TSPropertySignature" && prop.key.type === "Identifier") {
            const options = extractUnionOptions(prop.typeAnnotation?.typeAnnotation);
            if (options.length > 0) {
              enumProps[prop.key.name] = options;
            }
          }
        }
      },

      // Handle: type ButtonProps = { ... }
      TSTypeAliasDeclaration(path) {
        if (path.node.id.name !== propsTypeName) return;

        const typeAnnotation = path.node.typeAnnotation;

        // Handle direct object type: type Props = { variant: "a" | "b" }
        if (typeAnnotation.type === "TSTypeLiteral") {
          for (const member of typeAnnotation.members) {
            if (member.type === "TSPropertySignature" && member.key.type === "Identifier") {
              const options = extractUnionOptions(member.typeAnnotation?.typeAnnotation);
              if (options.length > 0) {
                enumProps[member.key.name] = options;
              }
            }
          }
        }

        // Handle intersection types: type Props = BaseProps & { variant: "a" | "b" }
        if (typeAnnotation.type === "TSIntersectionType") {
          for (const member of typeAnnotation.types) {
            if (member.type === "TSTypeLiteral") {
              for (const prop of member.members) {
                if (prop.type === "TSPropertySignature" && prop.key.type === "Identifier") {
                  const options = extractUnionOptions(prop.typeAnnotation?.typeAnnotation);
                  if (options.length > 0) {
                    enumProps[prop.key.name] = options;
                  }
                }
              }
            }
          }
        }
      },
    });

    // Return null if no enum props found
    if (Object.keys(enumProps).length === 0) {
      return null;
    }

    return { enumProps };
  } catch (error) {
    console.warn(`[prop-schema] Failed to parse ${componentName}:`, error);
    return null;
  }
}

/**
 * Extract string literal options from a union type.
 * Returns empty array if not a pure string union.
 *
 * Example: "default" | "outline" | "ghost" -> ["default", "outline", "ghost"]
 */
function extractUnionOptions(typeNode: t.TSType | null | undefined): string[] {
  if (!typeNode) return [];

  // Direct string literal type (single option - treat as no options)
  if (typeNode.type === "TSLiteralType" && typeNode.literal.type === "StringLiteral") {
    return [typeNode.literal.value];
  }

  // Union type
  if (typeNode.type === "TSUnionType") {
    const options: string[] = [];

    for (const member of typeNode.types) {
      // Only accept string literals
      if (member.type === "TSLiteralType" && member.literal.type === "StringLiteral") {
        options.push(member.literal.value);
      } else {
        // Mixed types (e.g., "sm" | number) - skip this prop entirely
        return [];
      }
    }

    return options;
  }

  return [];
}

// ============================================================================
// Console Test API
// ============================================================================

/**
 * Test function exposed on window for console debugging.
 * Usage: window.novum.testEnumDetection("Button", "/components/ui/button.tsx")
 */
export function testEnumDetection(
  componentName: string,
  componentCode: string
): PropSchema | null {
  return scanComponentPropSchema(componentCode, componentName);
}
