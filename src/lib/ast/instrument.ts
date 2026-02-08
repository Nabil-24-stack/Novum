import { transform } from "@babel/standalone";

interface InstrumentResult {
  code: string;
  success: boolean;
  error?: string;
}

/**
 * Instruments JSX code by injecting data-source-loc attributes on every JSX element.
 * This enables precise element-to-source mapping (file:line:column).
 *
 * @param code - The source code to instrument
 * @param filename - The filename used for source location (e.g., "/App.tsx")
 * @returns The instrumented code with data-source-loc attributes
 */
export function instrumentCode(code: string, filename: string): InstrumentResult {
  try {
    const result = transform(code, {
      filename,
      presets: ["react", "typescript"],
      plugins: [
        function sourceLocPlugin(): { visitor: Record<string, (path: unknown) => void> } {
          return {
            visitor: {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              JSXOpeningElement(path: any) {
                // Skip fragments (<> or <React.Fragment>)
                const name = path.node.name;
                if (name.type === "JSXIdentifier" && name.name === "Fragment") return;
                if (name.type === "JSXMemberExpression") {
                  // Check for React.Fragment
                  if (
                    name.object?.name === "React" &&
                    name.property?.name === "Fragment"
                  ) {
                    return;
                  }
                }

                const loc = path.node.loc?.start;
                if (!loc) return;

                // Check if data-source-loc already exists (avoid double instrumentation)
                const hasSourceLoc = path.node.attributes.some(
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  (attr: any) =>
                    attr.type === "JSXAttribute" &&
                    attr.name?.name === "data-source-loc"
                );
                if (hasSourceLoc) return;

                const hasInstanceSourceLoc = path.node.attributes.some(
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  (attr: any) =>
                    attr.type === "JSXAttribute" &&
                    attr.name?.name === "data-instance-source-loc"
                );

                // Create data-source-loc attribute
                const attr = {
                  type: "JSXAttribute",
                  name: { type: "JSXIdentifier", name: "data-source-loc" },
                  value: {
                    type: "StringLiteral",
                    value: `${filename}:${loc.line}:${loc.column}`,
                  },
                };

                path.node.attributes.unshift(attr);

                // Mark component instances (PascalCase JSX tags) for instance-first editing.
                // Example: <Button /> in App.tsx should be edited at the callsite.
                const isPascalComponent =
                  name.type === "JSXIdentifier" &&
                  /^[A-Z]/.test(name.name);

                if (isPascalComponent && !hasInstanceSourceLoc) {
                  const instanceAttr = {
                    type: "JSXAttribute",
                    name: { type: "JSXIdentifier", name: "data-instance-source-loc" },
                    value: {
                      type: "StringLiteral",
                      value: `${filename}:${loc.line}:${loc.column}`,
                    },
                  };
                  path.node.attributes.unshift(instanceAttr);
                }
              },
            },
          };
        },
      ],
      retainLines: true, // Critical: preserve line numbers for accurate mapping
    });

    return { code: result?.code || code, success: true };
  } catch (error) {
    console.warn(`[AST] Failed to instrument ${filename}:`, error);
    return { code, success: false, error: String(error) };
  }
}
