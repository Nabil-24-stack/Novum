"use client";

import { useRef, useCallback } from "react";
import { useStreamingStore } from "./useStreamingStore";
import { useStrategyStore } from "./useStrategyStore";
import { useProductBrainStore } from "./useProductBrainStore";
import { useDocumentStore } from "./useDocumentStore";
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
  userFlowContext?: string;
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

export function useParallelBuild({
  writeFile,
  files,
  getLatestFile,
}: {
  writeFile: (path: string, content: string) => void;
  files: Record<string, string>;
  getLatestFile: (path: string) => string | undefined;
}) {
  const abortControllersRef = useRef<Map<string, AbortController>>(new Map());
  const modelIdRef = useRef<string>("gemini-2.5-pro");
  const allPagesRef = useRef<PageBuildConfig[]>([]);
  const sharedContextRef = useRef<SharedContext | null>(null);
  const evaluationTriggeredRef = useRef(false);
  const rebuildTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Rebuild /App.tsx with only completed pages so Sandpack never imports missing modules.
  // Debounced (500ms) so multiple page completions collapse into a single write,
  // preventing cascading re-syncs across all FlowFrame SandpackFileSyncs.
  const rebuildAppTsx = useCallback(() => {
    if (rebuildTimerRef.current) clearTimeout(rebuildTimerRef.current);
    rebuildTimerRef.current = setTimeout(() => {
      rebuildTimerRef.current = null;
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
    }, 500);
  }, [writeFile]);

  // After ALL pages are built, run a single evaluation pass to generate annotations
  const evaluateAnnotations = useCallback(async () => {
    const context = sharedContextRef.current;
    if (!context) return;

    const pages = allPagesRef.current;

    // Collect code for all completed pages using getLatestFile (bypasses stale React state)
    const pagesCode: { pageId: string; pageName: string; code: string }[] = [];
    for (const page of pages) {
      const filePath = `/pages/${page.componentName}.tsx`;
      const code = getLatestFile(filePath);
      if (code) {
        pagesCode.push({ pageId: page.pageId, pageName: page.pageName, code });
      }
    }

    if (pagesCode.length === 0) return;

    useStreamingStore.getState().setAnnotationEvaluating();

    // Get insights context if available
    const insightsData = useDocumentStore.getState().insightsData;
    const insightsContext = insightsData
      ? insightsData.insights.map((ins, i) => {
          const parts = [`${i}. ${ins.insight}`];
          if (ins.sourceDocument) parts.push(`Source: ${ins.sourceDocument}`);
          if (ins.quote) parts.push(`Quote: "${ins.quote}"`);
          if (ins.source === "conversation") parts.push(`(from conversation)`);
          return parts.join(" — ");
        }).join("\n")
      : undefined;

    try {
      const response = await fetch("/api/evaluate-annotations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pages: pagesCode,
          manifestoContext: context.manifestoContext,
          personaContext: context.personaContext,
          insightsContext,
          modelId: modelIdRef.current,
        }),
      });

      if (!response.ok) {
        console.warn("[ParallelBuild] Annotation evaluation failed:", response.status);
        useStreamingStore.getState().setAnnotationError("Evaluation request failed");
        return;
      }

      const result = await response.json();
      const evaluatedPages = result?.pages;

      if (Array.isArray(evaluatedPages)) {
        let totalConnections = 0;
        for (const page of evaluatedPages) {
          if (page.pageId && Array.isArray(page.connections)) {
            useProductBrainStore.getState().addPageDecisions({
              pageId: page.pageId,
              pageName: page.pageName || page.pageId,
              connections: page.connections,
            });
            totalConnections += page.connections.length;
          }
        }
        useStreamingStore.getState().setAnnotationDone(totalConnections);
      }
    } catch (err) {
      console.warn("[ParallelBuild] Annotation evaluation error:", err);
      useStreamingStore.getState().setAnnotationError("Could not evaluate annotations");
    }
  }, [getLatestFile]);

  // Check if all pages are done and trigger evaluation
  const checkAllPagesComplete = useCallback(() => {
    if (evaluationTriggeredRef.current) return;

    const completed = useStrategyStore.getState().completedPages;
    const allPages = allPagesRef.current;
    if (allPages.length === 0) return;

    const allDone = allPages.every((p) => completed.includes(p.pageId));
    if (allDone) {
      evaluationTriggeredRef.current = true;
      evaluateAnnotations();
    }
  }, [evaluateAnnotations]);

  const startBuild = useCallback(
    (pages: PageBuildConfig[], sharedContext: SharedContext, modelId: string) => {
      modelIdRef.current = modelId;
      allPagesRef.current = pages;
      sharedContextRef.current = sharedContext;
      evaluationTriggeredRef.current = false;
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
          userFlowContext: sharedContext.userFlowContext || "",
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
                  (gated.report.importFixes?.length || 0) +
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

      // Mark as completed + rebuild App.tsx so this page is renderable
      completePageBuild(page.pageId);
      useStrategyStore.getState().addCompletedPage(page.pageId);
      rebuildAppTsx();

      // Check if all pages are done to trigger annotation evaluation
      checkAllPagesComplete();

      // Run screenshot verification loop for this page
      if (!signal.aborted) {
        const completedFilePaths = useStreamingStore.getState().pageBuilds[page.pageId]?.completedFilePaths || [];

        // Build latest files map — `files` is a stale React closure, so
        // we must read directly from the VFS store via getLatestFile.
        const latestFiles: Record<string, string> = { ...files };
        for (const fp of completedFilePaths) {
          const latest = getLatestFile(fp);
          if (latest) latestFiles[fp] = latest;
        }

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
          addLog: (message) =>
            useStreamingStore.getState().addPageVerificationLog(page.pageId, message),
        };

        try {
          const result = await runVerificationLoop({
            completedFiles: completedFilePaths,
            allFiles: latestFiles,
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

  const retryVerification = useCallback(
    (pageId: string) => {
      // Reset verification state (clears log)
      useStreamingStore.getState().updatePageVerification(pageId, "idle", { attempt: 0, issues: [] });

      const controller = new AbortController();
      abortControllersRef.current.set(`verify-${pageId}`, controller);

      const completedFilePaths = useStreamingStore.getState().pageBuilds[pageId]?.completedFilePaths || [];

      // Build latest files map using getLatestFile
      const latestFiles: Record<string, string> = { ...files };
      for (const filePath of completedFilePaths) {
        const latest = getLatestFile(filePath);
        if (latest) latestFiles[filePath] = latest;
      }

      const pageCallbacks: VerificationStateCallbacks = {
        startVerification: () =>
          useStreamingStore.getState().updatePageVerification(pageId, "capturing", { attempt: 1 }),
        setCapturing: () =>
          useStreamingStore.getState().updatePageVerification(pageId, "capturing"),
        setReviewing: () =>
          useStreamingStore.getState().updatePageVerification(pageId, "reviewing"),
        setFixing: (issues) =>
          useStreamingStore.getState().updatePageVerification(pageId, "fixing", {
            attempt: (useStreamingStore.getState().pageBuilds[pageId]?.verificationAttempt ?? 0) + 1,
            issues,
          }),
        setPassed: () =>
          useStreamingStore.getState().updatePageVerification(pageId, "passed"),
        setFailed: (issues) =>
          useStreamingStore.getState().updatePageVerification(pageId, "failed", { issues }),
        reset: () =>
          useStreamingStore.getState().updatePageVerification(pageId, "idle", { attempt: 0, issues: [] }),
        addLog: (message) =>
          useStreamingStore.getState().addPageVerificationLog(pageId, message),
      };

      runVerificationLoop({
        completedFiles: completedFilePaths,
        allFiles: latestFiles,
        writeFile,
        modelId: modelIdRef.current,
        pageId,
        signal: controller.signal,
        stateCallbacks: pageCallbacks,
      }).then((result) => {
        if (result.status === "fixed") {
          toast.success(`Auto-fixed ${result.fixCount} issue${result.fixCount > 1 ? "s" : ""}`);
        } else if (result.status === "failed") {
          toast.warning("Could not auto-fix all issues");
        }
      }).catch(() => {
        // Verification failed silently
      }).finally(() => {
        abortControllersRef.current.delete(`verify-${pageId}`);
      });
    },
    [writeFile, files, getLatestFile]
  );

  const cancelAll = useCallback(() => {
    for (const [, controller] of abortControllersRef.current) {
      controller.abort();
    }
    abortControllersRef.current.clear();
    useStreamingStore.getState().endParallelStreaming();
    useStrategyStore.getState().setBuildingPages([]);
  }, []);

  return { startBuild, retryPage, retryVerification, cancelAll };
}
