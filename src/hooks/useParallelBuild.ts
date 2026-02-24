"use client";

import { useRef, useCallback } from "react";
import { useStreamingStore } from "./useStreamingStore";
import { useStrategyStore } from "./useStrategyStore";
import { useProductBrainStore } from "./useProductBrainStore";
import { parseStreamingContent } from "@/lib/streaming-parser";
import { runGatekeeper } from "@/lib/ai/gatekeeper";
import { generateAppTsx } from "@/lib/vfs/app-generator";
import { runVerificationLoop, type VerificationStateCallbacks } from "@/lib/verification/verify-loop";
import { toast } from "sonner";

export interface PageBuildConfig {
  pageId: string;
  pageName: string;
  componentName: string;
  pageRoute: string;
}

interface SharedContext {
  manifestoContext: string;
  personaContext: string;
  flowContext: string;
  wireframeContext?: string;
}

// Ensure every .tsx file has `import * as React from "react"` so JSX works in Sandpack's classic transform
function ensureReactImport(code: string): string {
  // Already has the star import
  if (/import\s+\*\s+as\s+React\s+from\s+["']react["']/.test(code)) return code;
  // Has a named import like `import { useState } from "react"` — prepend the star import before it
  if (/import\s+\{[^}]*\}\s+from\s+["']react["']/.test(code)) {
    return code.replace(
      /import\s+\{([^}]*)\}\s+from\s+["']react["']/,
      'import * as React from "react";\nimport {$1} from "react"'
    );
  }
  // No react import at all — add at top (after any leading comments)
  return 'import * as React from "react";\n' + code;
}

// Regex for decision-connections blocks
const DECISION_CONNECTIONS_RE = /```json\s+type="decision-connections"\n([\s\S]*?)```/g;

function extractDecisionConnections(text: string) {
  const matches: unknown[] = [];
  let match;
  while ((match = DECISION_CONNECTIONS_RE.exec(text)) !== null) {
    try {
      matches.push(JSON.parse(match[1]));
    } catch { /* ignore parse errors */ }
  }
  DECISION_CONNECTIONS_RE.lastIndex = 0;
  return matches;
}

export function useParallelBuild({
  writeFile,
  files,
}: {
  writeFile: (path: string, content: string) => void;
  files: Record<string, string>;
}) {
  const abortControllersRef = useRef<Map<string, AbortController>>(new Map());
  const modelIdRef = useRef<string>("gemini-2.5-pro");
  const allPagesRef = useRef<PageBuildConfig[]>([]);

  // Rebuild /App.tsx with only completed pages so Sandpack never imports missing modules
  const rebuildAppTsx = useCallback(() => {
    const completed = useStrategyStore.getState().completedPages;
    const completedPages = allPagesRef.current.filter((p) =>
      completed.includes(p.pageId)
    );
    if (completedPages.length === 0) return;
    const appCode = generateAppTsx(
      completedPages.map((p) => ({
        id: p.pageId,
        label: p.pageName,
        route: p.pageRoute,
      }))
    );
    writeFile("/App.tsx", appCode);
  }, [writeFile]);

  const startBuild = useCallback(
    (pages: PageBuildConfig[], sharedContext: SharedContext, modelId: string) => {
      modelIdRef.current = modelId;
      allPagesRef.current = pages;
      const pageIds = pages.map((p) => p.pageId);

      // Pre-add common dependencies to /package.json so pages can import them
      try {
        const pkgRaw = files["/package.json"];
        const pkg = pkgRaw ? JSON.parse(pkgRaw) : { name: "novum-app", version: "1.0.0", dependencies: {} };
        let changed = false;
        const commonDeps: Record<string, string> = {
          "lucide-react": "^0.460.0",
          "recharts": "^2.12.0",
          "date-fns": "^3.6.0",
        };
        for (const [dep, ver] of Object.entries(commonDeps)) {
          if (!pkg.dependencies[dep]) {
            pkg.dependencies[dep] = ver;
            changed = true;
          }
        }
        if (changed) {
          writeFile("/package.json", JSON.stringify(pkg, null, 2));
        }
      } catch {
        // Fail-safe: if parsing fails, continue without pre-populating
      }

      // Initialize stores
      useStreamingStore.getState().startParallelStreaming(pageIds);
      useStrategyStore.getState().setBuildingPages(pageIds);

      // Launch all page builds
      for (const page of pages) {
        const controller = new AbortController();
        abortControllersRef.current.set(page.pageId, controller);

        buildPage(page, sharedContext, controller.signal, modelId);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [writeFile, files]
  );

  const buildPage = async (
    page: PageBuildConfig,
    sharedContext: SharedContext,
    signal: AbortSignal,
    modelId: string,
  ) => {
    const { updatePageBuild, completePageBuild, failPageBuild } =
      useStreamingStore.getState();

    updatePageBuild(page.pageId, { status: "streaming" });

    try {
      const response = await fetch("/api/build-page", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pageId: page.pageId,
          pageName: page.pageName,
          componentName: page.componentName,
          pageRoute: page.pageRoute,
          manifestoContext: sharedContext.manifestoContext,
          personaContext: sharedContext.personaContext,
          flowContext: sharedContext.flowContext,
          wireframeContext: sharedContext.wireframeContext || "",
          modelId,
        }),
        signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let fullText = "";
      const writtenPaths = new Set<string>();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });

        // Plain text stream (from toTextStreamResponse)
        fullText += chunk;

        // Parse streaming content
        const parsed = parseStreamingContent(fullText);

        // Update current file in store (for overlay)
        if (parsed.currentFile) {
          updatePageBuild(page.pageId, {
            currentFile: parsed.currentFile,
          });
        }

        // Write completed blocks
        for (const block of parsed.completedBlocks) {
          if (!writtenPaths.has(block.path + "|" + block.content.length)) {
            writtenPaths.add(block.path + "|" + block.content.length);

            // Run gatekeeper on code files
            const ext = block.path.split(".").pop() || "";
            let finalContent = block.content;
            if (["tsx", "ts", "jsx", "js"].includes(ext)) {
              const gated = runGatekeeper(block.content, files, block.path);
              finalContent = gated.code;
              if (gated.report.hadChanges) {
                const total =
                  gated.report.colorViolations.length +
                  gated.report.spacingViolations.length +
                  gated.report.layoutViolations.length +
                  gated.report.componentPromotions.length +
                  gated.report.layoutDeclarationAdditions.length;
                toast.info(
                  `Gatekeeper (${page.pageName}): ${total} design system fix${total > 1 ? "es" : ""} applied`
                );
              }
              // Ensure React is in scope for Sandpack's classic JSX transform
              if (ext === "tsx" || ext === "jsx") {
                finalContent = ensureReactImport(finalContent);
              }
            }

            writeFile(block.path, finalContent);

            // Update completed file paths
            const current = useStreamingStore.getState().pageBuilds[page.pageId];
            if (current) {
              updatePageBuild(page.pageId, {
                completedFilePaths: [...current.completedFilePaths, block.path],
              });
            }
          }
        }
      }

      // Extract decision connections
      const dcMatches = extractDecisionConnections(fullText);
      for (const dc of dcMatches) {
        const dcTyped = dc as { pageId: string; pageName: string; connections: unknown[] };
        if (dcTyped.pageId && dcTyped.connections) {
          useProductBrainStore.getState().addPageDecisions({
            pageId: dcTyped.pageId,
            pageName: dcTyped.pageName,
            connections: dcTyped.connections as never[],
          });
        }
      }

      // Mark as completed + rebuild App.tsx so this page is renderable
      completePageBuild(page.pageId);
      useStrategyStore.getState().addCompletedPage(page.pageId);
      rebuildAppTsx();

      // Run screenshot verification loop for this page
      if (!signal.aborted) {
        const completedFilePaths = useStreamingStore.getState().pageBuilds[page.pageId]?.completedFilePaths || [];
        const pageCallbacks: VerificationStateCallbacks = {
          startVerification: () =>
            useStreamingStore.getState().updatePageVerification(page.pageId, "capturing", { attempt: 1 }),
          setCapturing: () =>
            useStreamingStore.getState().updatePageVerification(page.pageId, "capturing"),
          setReviewing: () =>
            useStreamingStore.getState().updatePageVerification(page.pageId, "reviewing"),
          setFixing: (issues) =>
            useStreamingStore.getState().updatePageVerification(page.pageId, "fixing", {
              attempt: (useStreamingStore.getState().pageBuilds[page.pageId]?.verificationAttempt ?? 0) + 1,
              issues,
            }),
          setPassed: () =>
            useStreamingStore.getState().updatePageVerification(page.pageId, "passed"),
          setFailed: (issues) =>
            useStreamingStore.getState().updatePageVerification(page.pageId, "failed", { issues }),
          reset: () =>
            useStreamingStore.getState().updatePageVerification(page.pageId, "idle", { attempt: 0, issues: [] }),
        };

        try {
          const result = await runVerificationLoop({
            completedFiles: completedFilePaths,
            allFiles: files,
            writeFile,
            modelId,
            pageId: page.pageId,
            signal,
            stateCallbacks: pageCallbacks,
          });

          if (result.status === "fixed") {
            toast.success(`${page.pageName}: auto-fixed ${result.fixCount} issue${result.fixCount > 1 ? "s" : ""}`);
          } else if (result.status === "failed") {
            toast.warning(`${page.pageName}: could not auto-fix all issues`);
          }
        } catch {
          // Verification failed — page is still usable, just not verified
        }
      }
    } catch (err: unknown) {
      if (signal.aborted) return; // Don't report aborted fetches as errors
      const message = err instanceof Error ? err.message : "Unknown error";
      failPageBuild(page.pageId, message);
      console.error(`[ParallelBuild] Failed to build ${page.pageName}:`, err);
    } finally {
      abortControllersRef.current.delete(page.pageId);
    }
  };

  const retryPage = useCallback(
    (pageId: string, pages: PageBuildConfig[], sharedContext: SharedContext) => {
      const page = pages.find((p) => p.pageId === pageId);
      if (!page) return;

      const controller = new AbortController();
      abortControllersRef.current.set(pageId, controller);

      useStreamingStore.getState().updatePageBuild(pageId, {
        status: "pending",
        error: undefined,
        currentFile: null,
        completedFilePaths: [],
        verificationStatus: "idle",
        verificationAttempt: 0,
        verificationIssues: [],
      });

      buildPage(page, sharedContext, controller.signal, modelIdRef.current);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [writeFile, files]
  );

  const cancelAll = useCallback(() => {
    for (const [, controller] of abortControllersRef.current) {
      controller.abort();
    }
    abortControllersRef.current.clear();
    useStreamingStore.getState().endParallelStreaming();
    useStrategyStore.getState().setBuildingPages([]);
  }, []);

  return { startBuild, retryPage, cancelAll };
}
