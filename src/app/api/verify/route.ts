import { generateText } from "ai";
import { google } from "@ai-sdk/google";
import { anthropic } from "@ai-sdk/anthropic";
import { openai } from "@ai-sdk/openai";
import { requireAuth } from "@/lib/supabase/auth-guard";

type ModelId = "gemini-2.5-pro" | "gemini-3-pro-preview" | "claude-sonnet-4-6" | "gpt-5.2";

function getModel(modelId: ModelId) {
  switch (modelId) {
    case "gemini-2.5-pro":
      return google("gemini-2.5-pro");
    case "gemini-3-pro-preview":
      return google("gemini-3-pro-preview");
    case "claude-sonnet-4-6":
      return anthropic("claude-sonnet-4-6");
    case "gpt-5.2":
      return openai("gpt-5.2");
    default:
      return google("gemini-2.5-pro");
  }
}

export const maxDuration = 60;

const ERROR_FIX_SYSTEM_PROMPT = `You are a code-level QA reviewer for a React web application running in Sandpack.
The page has an error. Analyze the error text, source code, and available project files, then provide a fix.

CRITICAL RULES:
- ALWAYS use named exports (export function X, export const X). NEVER use export default — it crashes Sandpack.
- Import paths must be absolute from project root (e.g., "/components/ui/button", "/lib/utils"). NO @/ aliases.
- All .tsx/.jsx files MUST have: import * as React from "react"
- If a module is not found, check the available files list — the file may exist at a different path or with a different name.
- If an import references a file that doesn't exist, either create the missing file OR remove the import and inline the code.
- Only use npm packages listed in the available dependencies.

Respond with ONLY valid JSON (no markdown fencing):
- {"status":"fail","issues":["description of the issue"],"fixCode":"<code blocks>"}

For fixCode, use markdown code blocks with file="path" attributes, e.g.:
\`\`\`tsx file="/App.tsx"
// fixed code here
\`\`\`

Common issues:
- "Element type is invalid" — usually a missing or wrong import/export (e.g., using default import for a named export)
- "is not defined" — missing import statement
- "Cannot read prop" — accessing property on undefined/null, often from a bad import
- "Module not found" / "Cannot find module" — importing from a path that doesn't exist
- "does not provide an export" — named export doesn't exist in the target module
- Export mismatch — importing { X } but the file exports { Y }. Check the availableExports map.

Keep fixes minimal — only fix the specific error. When creating a missing file, include all necessary imports and exports.`;

export async function POST(req: Request) {
  try {
    const auth = await requireAuth();
    if (auth.response) return auth.response;

    const body = await req.json();
    const {
      files,
      contextFiles,
      modelId = "claude-sonnet-4-6",
      errorText,
      vfsFilePaths,
      availableExports,
    } = body as {
      files: Record<string, string>;
      contextFiles?: Record<string, string>;
      modelId?: ModelId;
      errorText?: string;
      vfsFilePaths?: string[];
      availableExports?: Record<string, string[]>;
    };

    if (!errorText) {
      return Response.json({ status: "pass" });
    }

    // Build file context — written files are primary context
    const fileContext = Object.entries(files)
      .map(([path, content]) => `File: ${path}\n\`\`\`tsx\n${content}\n\`\`\``)
      .join("\n\n");

    // Build additional context from the full VFS (structural files the AI might need)
    let additionalContext = "";
    if (contextFiles) {
      const STRUCTURAL_PATTERNS = [
        "/App.tsx",
        "/index.tsx",
        "/lib/router.tsx",
        "/lib/utils.ts",
        "/flow.json",
        "/package.json",
      ];

      // Parse error text for referenced module paths to prioritize them
      const referencedPaths = new Set<string>();
      if (errorText) {
        // Match patterns like: Cannot find module '../shared/Sidebar', './components/Nav', '/pages/Home'
        const moduleRefs = errorText.matchAll(/['"]([./][^'"]+)['"]/g);
        for (const m of moduleRefs) {
          let ref = m[1];
          // Normalize relative paths: "../shared/Sidebar" → "/shared/Sidebar"
          ref = ref.replace(/^\.\.?\/?/, "/");
          if (!ref.endsWith(".tsx") && !ref.endsWith(".ts")) {
            referencedPaths.add(ref + ".tsx");
            referencedPaths.add(ref + ".ts");
          }
          referencedPaths.add(ref);
        }
      }

      const structuralFiles: [string, string][] = [];
      const pageFiles: [string, string][] = [];
      const referencedFiles: [string, string][] = [];
      const componentFiles: [string, string][] = [];

      for (const [path, content] of Object.entries(contextFiles)) {
        if (files[path]) continue; // Skip files already in primary context
        const isStructural = STRUCTURAL_PATTERNS.includes(path);
        const isPage = path.startsWith("/pages/");
        const isComponent = path.startsWith("/components/ui/");
        const isReferenced = referencedPaths.has(path) || [...referencedPaths].some((rp) => path.endsWith(rp));

        if (isReferenced) referencedFiles.push([path, content]);
        else if (isStructural) structuralFiles.push([path, content]);
        else if (isPage) pageFiles.push([path, content]);
        else if (isComponent) componentFiles.push([path, content]);
      }

      // Prioritize: referenced files first, then structural, then ALL pages, then components (capped at 10)
      const extraFiles = [
        ...referencedFiles,
        ...structuralFiles,
        ...pageFiles,
        ...componentFiles.slice(0, 10),
      ];

      if (extraFiles.length > 0) {
        additionalContext = "\n\nAdditional project files (for context):\n" +
          extraFiles.map(([path, content]) => `File: ${path}\n\`\`\`tsx\n${content}\n\`\`\``).join("\n\n");
      }
    }

    // Build VFS structure context so AI knows what files and exports are available
    let vfsStructureContext = "";
    if (vfsFilePaths && vfsFilePaths.length > 0) {
      vfsStructureContext += "\n\nAll files in VFS:\n" + vfsFilePaths.join("\n");
    }
    if (availableExports && Object.keys(availableExports).length > 0) {
      vfsStructureContext += "\n\nAvailable exports per file:\n";
      for (const [path, exports] of Object.entries(availableExports)) {
        // Only include files with exports (skip empty)
        if (exports.length > 0) {
          vfsStructureContext += `${path}: ${exports.join(", ")}\n`;
        }
      }
    }

    // Build deps context
    let depsContext = "";
    try {
      const pkgContent = contextFiles?.["/package.json"] || files["/package.json"];
      if (pkgContent) {
        const pkg = JSON.parse(pkgContent);
        if (pkg.dependencies) {
          depsContext = "\n\nInstalled npm dependencies:\n" +
            Object.entries(pkg.dependencies).map(([name, ver]) => `- ${name}@${ver}`).join("\n");
        }
      }
    } catch {
      // Ignore
    }

    const model = getModel(modelId);

    const result = await generateText({
      model,
      system: ERROR_FIX_SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `The page shows this error:\n\n"${errorText}"\n\nFiles that were just written:\n${fileContext}${additionalContext}${vfsStructureContext}${depsContext}\n\nDiagnose the error and provide a fix. Respond with JSON only.`,
        },
      ],
      providerOptions: {
        openai: { store: false },
      },
    });

    // Parse response - try to extract JSON
    const text = result.text.trim();

    // Try to parse as JSON directly
    try {
      const parsed = JSON.parse(text);
      return Response.json(parsed);
    } catch {
      // Try to extract JSON from markdown fences
      const jsonMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[1].trim());
          return Response.json(parsed);
        } catch {
          // Fall through
        }
      }

      // Try to find JSON object in the text
      const braceMatch = text.match(/\{[\s\S]*\}/);
      if (braceMatch) {
        try {
          const parsed = JSON.parse(braceMatch[0]);
          return Response.json(parsed);
        } catch {
          // Fall through
        }
      }

      // Couldn't parse — treat as fail so errors aren't hidden
      console.warn("[verify] Could not parse AI response as JSON:", text);
      return Response.json({
        status: "fail",
        issues: ["AI response could not be parsed — raw text returned"],
        fixCode: text, // Pass raw text through; extractCodeBlocks will try to find code blocks
      });
    }
  } catch (err) {
    console.error("[verify] Error:", err);
    return Response.json(
      { status: "fail", issues: [`Server error: ${(err as Error).message || "unknown"}`] },
      { status: 500 }
    );
  }
}
