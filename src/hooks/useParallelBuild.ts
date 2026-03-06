"use client";

import { useRef, useCallback } from "react";
import { useStreamingStore } from "./useStreamingStore";
import { useStrategyStore } from "./useStrategyStore";
import { useProductBrainStore } from "./useProductBrainStore";
import { useDocumentStore } from "./useDocumentStore";
import { parseStreamingContent } from "@/lib/streaming-parser";
import { runGatekeeper } from "@/lib/ai/gatekeeper";
import { generateAppTsx, toPascalCase } from "@/lib/vfs/app-generator";
import { runVerificationLoop, type VerificationStateCallbacks } from "@/lib/verification/verify-loop";
import { isIframeAvailable, queryIframeErrors } from "@/lib/verification/screenshot-capture";
import { toast } from "sonner";

export interface PageBuildConfig {
  pageId: string;
  pageName: string;
  componentName: string;
  pageRoute: string;
  existingCode?: string;
}

interface SharedContext {
  manifestoContext: string;
  personaContext: string;
  flowContext: string;
  userFlowContext?: string;
  isRebuild?: boolean;
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

/**
 * Standalone annotation evaluation function — can be called independently of the build pipeline.
 * Used by the "Re-evaluate Annotations" button after strategy changes.
 * Includes retry with exponential backoff for transient model/API failures.
 */
export async function evaluateAnnotationsStandalone(
  files: Record<string, string>,
  manifestoContext: string,
  personaContext: string,
  insightsContext: string | undefined,
  modelId: string,
  flowManifestPages?: { id: string; name: string; route: string }[],
): Promise<{ pages: Array<{ pageId: string; pageName: string; connections: import("@/lib/product-brain/types").DecisionConnection[] }> } | null> {
  // Collect code for all page files in VFS
  const pagesCode: { pageId: string; pageName: string; code: string }[] = [];
  for (const [path, content] of Object.entries(files)) {
    if (path.startsWith("/pages/") && path.endsWith(".tsx") && content?.trim()) {
      const fileName = path.replace("/pages/", "").replace(".tsx", "");
      // Match against flow manifest to get the canonical pageId (avoids camelCase vs kebab-case mismatch)
      const manifestPage = flowManifestPages?.find(
        (p) => toPascalCase(p.name) === fileName
      );
      const pageId = manifestPage?.id ?? fileName.charAt(0).toLowerCase() + fileName.slice(1);
      const pageName = manifestPage?.name ?? fileName;
      pagesCode.push({ pageId, pageName, code: content });
    }
  }

  if (pagesCode.length === 0) return null;

  const MAX_RETRIES = 2;
  const RETRY_DELAYS = [3000, 8000]; // 3s, 8s backoff

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      const delay = RETRY_DELAYS[attempt - 1] ?? 8000;
      console.log(`[evaluateAnnotationsStandalone] Retry ${attempt}/${MAX_RETRIES} in ${delay}ms...`);
      await new Promise((r) => setTimeout(r, delay));
    }

    try {
      const response = await fetch("/api/evaluate-annotations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pages: pagesCode,
          manifestoContext,
          personaContext,
          insightsContext,
          modelId,
        }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        console.warn(`[evaluateAnnotationsStandalone] Attempt ${attempt + 1} failed:`, body?.detail || response.status);
        continue; // Retry
      }

      return await response.json();
    } catch (err) {
      console.warn(`[evaluateAnnotationsStandalone] Attempt ${attempt + 1} error:`, err);
      continue; // Retry
    }
  }

  console.warn("[evaluateAnnotationsStandalone] Failed after all retries");
  return null;
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

  // Core rebuild logic — generates and writes /App.tsx with only completed pages
  const doRebuildAppTsx = useCallback(() => {
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

  // Rebuild /App.tsx with only completed pages so Sandpack never imports missing modules.
  // Debounced (500ms) so multiple page completions collapse into a single write,
  // preventing cascading re-syncs across all FlowFrame SandpackFileSyncs.
  const rebuildAppTsx = useCallback(() => {
    if (rebuildTimerRef.current) clearTimeout(rebuildTimerRef.current);
    rebuildTimerRef.current = setTimeout(() => {
      rebuildTimerRef.current = null;
      doRebuildAppTsx();
    }, 500);
  }, [doRebuildAppTsx]);

  // Immediately execute any pending debounced rebuild — call before verification
  // so App.tsx is guaranteed up-to-date when Sandpack settles.
  const flushRebuildAppTsx = useCallback(() => {
    if (rebuildTimerRef.current) {
      clearTimeout(rebuildTimerRef.current);
      rebuildTimerRef.current = null;
      doRebuildAppTsx();
    }
  }, [doRebuildAppTsx]);

  // After ALL pages are built, run a single evaluation pass to generate annotations.
  // Retries with exponential backoff on model/API failures.
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

    const MAX_RETRIES = 3;
    const RETRY_DELAYS = [3000, 8000, 15000]; // 3s, 8s, 15s backoff

    let lastError: unknown = null;
    let success = false;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      // Brief delay before first attempt to let the model API cool down after the build
      if (attempt === 0) {
        await new Promise((r) => setTimeout(r, 2000));
      } else {
        // Exponential backoff for retries
        const delay = RETRY_DELAYS[attempt - 1] ?? 15000;
        console.log(`[Build] Annotation evaluation retry ${attempt}/${MAX_RETRIES} in ${delay}ms...`);
        await new Promise((r) => setTimeout(r, delay));
      }

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
          const body = await response.json().catch(() => ({}));
          const detail = body?.detail || `HTTP ${response.status}`;
          console.warn(`[Build] Annotation evaluation attempt ${attempt + 1} failed:`, detail);
          lastError = new Error(detail);
          continue; // Retry
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
          success = true;
          break; // Success — exit retry loop
        }
      } catch (err) {
        console.warn(`[Build] Annotation evaluation attempt ${attempt + 1} error:`, err);
        lastError = err;
        continue; // Retry
      }
    }

    if (!success) {
      console.warn("[Build] Annotation evaluation failed after all retries:", lastError);
      useStreamingStore.getState().setAnnotationError("Annotation evaluation failed — use the retry button to try again");
      toast.error("Annotations could not be generated. Click the retry button to try again.");
    }

    // Always transition to complete, even on failure
    useStrategyStore.getState().setPhase("complete");
    useStreamingStore.getState().endParallelStreaming();
    useStrategyStore.getState().setBuildingPages([]);
    // Auto-dismiss annotation status after user has time to read it
    setTimeout(() => {
      useStreamingStore.getState().resetAnnotationEvaluation();
    }, 6000);
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

  // Map a file path like "/pages/Dashboard.tsx" to the matching PageBuildConfig
  const findPageForPath = useCallback((filePath: string): PageBuildConfig | undefined => {
    const match = filePath.match(/^\/pages\/([^/]+)\.tsx$/);
    if (!match) return undefined;
    const componentName = match[1];
    return allPagesRef.current.find((p) => p.componentName === componentName);
  }, []);

  // Build verification callbacks for a given page
  const makeVerificationCallbacks = useCallback((pageId: string): VerificationStateCallbacks => ({
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
  }), []);

  // Run verification for a single page — returns result for error history tracking
  const verifyPage = async (page: PageBuildConfig, signal: AbortSignal): Promise<import("@/lib/verification/verify-loop").VerificationResult | null> => {
    const completedFilePaths = useStreamingStore.getState().pageBuilds[page.pageId]?.completedFilePaths || [];

    // Build latest files map — `files` is a stale React closure, so
    // we must read directly from the VFS store via getLatestFile.
    const latestFiles: Record<string, string> = { ...files };
    for (const fp of completedFilePaths) {
      const latest = getLatestFile(fp);
      if (latest) latestFiles[fp] = latest;
    }

    try {
      const result = await runVerificationLoop({
        completedFiles: completedFilePaths,
        allFiles: latestFiles,
        writeFile,
        modelId: modelIdRef.current,
        pageId: page.pageId,
        signal,
        stateCallbacks: makeVerificationCallbacks(page.pageId),
      });

      if (result.status === "fixed") {
        toast.success(`${page.pageName}: auto-fixed ${result.fixCount} issue${result.fixCount > 1 ? "s" : ""}`);
      } else if (result.status === "failed") {
        toast.warning(`${page.pageName}: could not auto-fix all issues`);
      }

      return result;
    } catch {
      // Verification failed — page is still usable, just not verified
      return null;
    }
  };

  // Process a completed code block: run gatekeeper, write to VFS, update store
  const processCompletedBlock = (block: { path: string; content: string }) => {
    const ext = block.path.split(".").pop() || "";
    let finalContent = block.content;
    const page = findPageForPath(block.path);

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
        const pageName = page?.pageName || block.path;
        toast.info(
          `Gatekeeper (${pageName}): ${total} design system fix${total > 1 ? "es" : ""} applied`
        );
      }
      // Ensure React is in scope for Sandpack's classic JSX transform
      if (ext === "tsx" || ext === "jsx") {
        finalContent = ensureReactImport(finalContent);
      }
    }

    writeFile(block.path, finalContent);

    // Update page status if this block corresponds to a known page
    if (page) {
      const { updatePageBuild, completePageBuild } = useStreamingStore.getState();
      const current = useStreamingStore.getState().pageBuilds[page.pageId];
      if (current) {
        updatePageBuild(page.pageId, {
          completedFilePaths: [...current.completedFilePaths, block.path],
        });
      }
      completePageBuild(page.pageId);
      useStrategyStore.getState().addCompletedPage(page.pageId);
      rebuildAppTsx();
    }
  };

  // Smart polling: wait for Sandpack to settle after file writes.
  // 1.5s initial wait, then poll iframe every 500ms for up to 8s.
  // Falls back to proceeding after 10s total.
  const waitForSandpackSettle = async (pageId: string, signal: AbortSignal): Promise<void> => {
    const INITIAL_WAIT = 1500;
    const POLL_INTERVAL = 500;
    const MAX_TOTAL = 10000;
    const start = Date.now();

    // Initial wait for HMR to kick in
    await new Promise<void>((resolve, reject) => {
      if (signal.aborted) { reject(new DOMException("Aborted", "AbortError")); return; }
      const t = setTimeout(resolve, INITIAL_WAIT);
      signal.addEventListener("abort", () => { clearTimeout(t); reject(new DOMException("Aborted", "AbortError")); }, { once: true });
    });

    // Poll until iframe responds or timeout
    while (Date.now() - start < MAX_TOTAL) {
      if (signal.aborted) throw new DOMException("Aborted", "AbortError");
      if (!isIframeAvailable(pageId)) {
        // Iframe not in DOM yet — wait and retry
        await new Promise<void>((resolve, reject) => {
          const t = setTimeout(resolve, POLL_INTERVAL);
          signal.addEventListener("abort", () => { clearTimeout(t); reject(new DOMException("Aborted", "AbortError")); }, { once: true });
        });
        continue;
      }
      // Try querying — if we get a response (even null = no error), Sandpack is ready
      try {
        await queryIframeErrors(pageId, 2000);
        return; // Got a response — Sandpack is settled
      } catch {
        // Query timed out — iframe not ready yet, keep polling
      }
      await new Promise<void>((resolve, reject) => {
        const t = setTimeout(resolve, POLL_INTERVAL);
        signal.addEventListener("abort", () => { clearTimeout(t); reject(new DOMException("Aborted", "AbortError")); }, { once: true });
      });
    }
    // Timeout — proceed anyway
  };

  // Build pages one at a time, verifying each before proceeding.
  // Error context from earlier pages is forwarded to subsequent builds.
  const buildPagesSequentially = async (
    pages: PageBuildConfig[],
    sharedContext: SharedContext,
    signal: AbortSignal,
    modelId: string,
  ) => {
    const errorHistory: Array<{ pageName: string; error: string; fix?: string }> = [];

    try {
      for (const page of pages) {
        if (signal.aborted) break;

        const { updatePageBuild, completePageBuild, failPageBuild } =
          useStreamingStore.getState();

        updatePageBuild(page.pageId, { status: "streaming" });

        try {
          // Build single page via /api/build-page with error context
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
              previousErrors: errorHistory.length > 0 ? errorHistory : undefined,
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
            fullText += chunk;

            const parsed = parseStreamingContent(fullText);

            if (parsed.currentFile) {
              updatePageBuild(page.pageId, { currentFile: parsed.currentFile });
            }

            for (const block of parsed.completedBlocks) {
              const dedupKey = block.path + "|" + block.content.length;
              if (!writtenPaths.has(dedupKey)) {
                writtenPaths.add(dedupKey);

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
                  if (ext === "tsx" || ext === "jsx") {
                    finalContent = ensureReactImport(finalContent);
                  }
                }

                writeFile(block.path, finalContent);

                const current = useStreamingStore.getState().pageBuilds[page.pageId];
                if (current) {
                  updatePageBuild(page.pageId, {
                    completedFilePaths: [...current.completedFilePaths, block.path],
                  });
                }
              }
            }
          }

          // Flush final streaming block if incomplete
          const finalParsed = parseStreamingContent(fullText);
          if (finalParsed.currentFile) {
            const dedupKey = finalParsed.currentFile.path + "|" + finalParsed.currentFile.content.length;
            if (!writtenPaths.has(dedupKey)) {
              writtenPaths.add(dedupKey);

              const ext = finalParsed.currentFile.path.split(".").pop() || "";
              let finalContent = finalParsed.currentFile.content;
              if (["tsx", "ts", "jsx", "js"].includes(ext)) {
                const gated = runGatekeeper(finalContent, files, finalParsed.currentFile.path);
                finalContent = gated.code;
                if (ext === "tsx" || ext === "jsx") {
                  finalContent = ensureReactImport(finalContent);
                }
              }

              writeFile(finalParsed.currentFile.path, finalContent);

              const current = useStreamingStore.getState().pageBuilds[page.pageId];
              if (current) {
                updatePageBuild(page.pageId, {
                  completedFilePaths: [...current.completedFilePaths, finalParsed.currentFile.path],
                });
              }
            }
          }

          completePageBuild(page.pageId);
          useStrategyStore.getState().addCompletedPage(page.pageId);
          rebuildAppTsx();
          flushRebuildAppTsx();

          // Wait for Sandpack to settle before verifying
          if (!signal.aborted) {
            await waitForSandpackSettle(page.pageId, signal);

            const result = await verifyPage(page, signal);

            // Track errors for subsequent pages
            if (result && (result.status === "fixed" || result.status === "failed") && result.lastError) {
              errorHistory.push({
                pageName: page.pageName,
                error: result.lastError.slice(0, 200),
                fix: result.fixSummary,
              });
            }
          }
        } catch (err: unknown) {
          if (signal.aborted) break;
          const message = err instanceof Error ? err.message : "Unknown error";
          failPageBuild(page.pageId, message);
          console.error(`[Build] Failed to build ${page.pageName}:`, err);

          // Track build failures in error history too
          errorHistory.push({
            pageName: page.pageName,
            error: message.slice(0, 200),
          });
        }
      }

      // All pages processed — trigger annotation evaluation
      checkAllPagesComplete();
    } finally {
      abortControllersRef.current.delete("__build__");
    }
  };

  // Single-call sequential build: one API call generates all pages
  const buildAllPages = async (
    pages: PageBuildConfig[],
    sharedContext: SharedContext,
    signal: AbortSignal,
    modelId: string,
  ) => {
    const isRebuild = sharedContext.isRebuild || false;

    try {
      // Build existingPages map for rebuild context
      const existingPages: Record<string, string> | undefined = isRebuild
        ? Object.fromEntries(
            pages
              .filter((p) => p.existingCode)
              .map((p) => [p.componentName, p.existingCode!])
          )
        : undefined;

      const response = await fetch("/api/build-app", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pages: pages.map((p) => ({
            pageId: p.pageId,
            pageName: p.pageName,
            componentName: p.componentName,
            pageRoute: p.pageRoute,
          })),
          manifestoContext: sharedContext.manifestoContext,
          personaContext: sharedContext.personaContext,
          flowContext: sharedContext.flowContext,
          userFlowContext: sharedContext.userFlowContext || "",
          modelId,
          ...(isRebuild ? { isRebuild: true, existingPages } : {}),
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
        fullText += chunk;

        // Parse streaming content — returns all completed + current streaming blocks
        const parsed = parseStreamingContent(fullText);

        // Update current file in store — match to page for status tracking
        if (parsed.currentFile) {
          const currentPage = findPageForPath(parsed.currentFile.path);
          if (currentPage) {
            const { updatePageBuild } = useStreamingStore.getState();
            const build = useStreamingStore.getState().pageBuilds[currentPage.pageId];
            // Only set to streaming if not already completed
            // During rebuild, allow pre-completed pages to transition back to streaming
            if (build && (build.status !== "completed" || isRebuild)) {
              updatePageBuild(currentPage.pageId, {
                status: "streaming",
                currentFile: parsed.currentFile,
              });
            }
          }
        }

        // Write completed blocks (deduped)
        for (const block of parsed.completedBlocks) {
          const dedupKey = block.path + "|" + block.content.length;
          if (!writtenPaths.has(dedupKey)) {
            writtenPaths.add(dedupKey);
            processCompletedBlock(block);
          }
        }
      }

      // Stream ended — flush any incomplete final block (output truncation)
      const finalParsed = parseStreamingContent(fullText);
      if (finalParsed.currentFile) {
        const dedupKey = finalParsed.currentFile.path + "|" + finalParsed.currentFile.content.length;
        if (!writtenPaths.has(dedupKey)) {
          writtenPaths.add(dedupKey);
          processCompletedBlock(finalParsed.currentFile);
        }
      }

      // Flush App.tsx and check completion
      flushRebuildAppTsx();
      checkAllPagesComplete();

      // Track which pages actually received new code blocks during rebuild
      const rebuiltPageIds = new Set(
        Array.from(writtenPaths).map((key) => {
          const path = key.split("|")[0];
          return findPageForPath(path)?.pageId;
        }).filter(Boolean) as string[]
      );

      // Mark any pages that never got a code block
      for (const page of pages) {
        const build = useStreamingStore.getState().pageBuilds[page.pageId];
        if (build && build.status !== "completed") {
          if (isRebuild && page.existingCode) {
            // During rebuild, pages without code blocks are unchanged — mark as completed
            useStreamingStore.getState().completePageBuild(page.pageId);
            useStrategyStore.getState().addCompletedPage(page.pageId);
            rebuildAppTsx();
          } else {
            // New pages or initial build — missing code block is an error
            useStreamingStore.getState().failPageBuild(
              page.pageId,
              "Page was not generated (possible output truncation)"
            );
          }
        }
      }

      // Run verification only on pages that received new code blocks
      if (!signal.aborted) {
        const completedPages = pages.filter((p) => {
          const build = useStreamingStore.getState().pageBuilds[p.pageId];
          if (build?.status !== "completed") return false;
          // During rebuild, only verify pages that were actually rebuilt
          if (isRebuild && !rebuiltPageIds.has(p.pageId)) return false;
          return true;
        });

        for (const page of completedPages) {
          if (signal.aborted) break;
          await verifyPage(page, signal);
        }

        // Re-check completion after verification (in case all were already complete)
        checkAllPagesComplete();
      }
    } catch (err: unknown) {
      if (signal.aborted) return;
      const message = err instanceof Error ? err.message : "Unknown error";
      console.error("[Build] Failed to build app:", err);

      // Mark all non-completed pages as errored
      for (const page of pages) {
        const build = useStreamingStore.getState().pageBuilds[page.pageId];
        if (build && build.status !== "completed") {
          useStreamingStore.getState().failPageBuild(page.pageId, message);
        }
      }
    } finally {
      abortControllersRef.current.delete("__build__");
    }
  };

  // Build a single page via /api/build-page (used for retries)
  const buildSinglePage = async (
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
        fullText += chunk;

        const parsed = parseStreamingContent(fullText);

        if (parsed.currentFile) {
          updatePageBuild(page.pageId, { currentFile: parsed.currentFile });
        }

        for (const block of parsed.completedBlocks) {
          if (!writtenPaths.has(block.path + "|" + block.content.length)) {
            writtenPaths.add(block.path + "|" + block.content.length);

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
              if (ext === "tsx" || ext === "jsx") {
                finalContent = ensureReactImport(finalContent);
              }
            }

            writeFile(block.path, finalContent);

            const current = useStreamingStore.getState().pageBuilds[page.pageId];
            if (current) {
              updatePageBuild(page.pageId, {
                completedFilePaths: [...current.completedFilePaths, block.path],
              });
            }
          }
        }
      }

      completePageBuild(page.pageId);
      useStrategyStore.getState().addCompletedPage(page.pageId);
      rebuildAppTsx();
      checkAllPagesComplete();
      flushRebuildAppTsx();

      // Run verification
      if (!signal.aborted) {
        await verifyPage(page, signal);
      }
    } catch (err: unknown) {
      if (signal.aborted) return;
      const message = err instanceof Error ? err.message : "Unknown error";
      failPageBuild(page.pageId, message);
      console.error(`[Build] Failed to build ${page.pageName}:`, err);
    } finally {
      abortControllersRef.current.delete(page.pageId);
    }
  };

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

      // Initialize stores — all pages visible immediately
      useStreamingStore.getState().startParallelStreaming(pageIds);
      useStrategyStore.getState().setBuildingPages(pageIds);

      // During rebuild, immediately pre-complete pages that have existing code
      // This prevents the StreamingOverlay from showing the black terminal for unchanged pages
      if (sharedContext.isRebuild) {
        for (const page of pages) {
          if (page.existingCode) {
            useStreamingStore.getState().completePageBuild(page.pageId);
            useStrategyStore.getState().addCompletedPage(page.pageId);
          }
        }
        rebuildAppTsx();
      }

      const controller = new AbortController();
      abortControllersRef.current.set("__build__", controller);

      if (sharedContext.isRebuild) {
        // Rebuilds use single API call (buildAllPages) since pages may be unchanged
        buildAllPages(pages, sharedContext, controller.signal, modelId);
      } else {
        // Fresh builds: build each page sequentially with inline verification
        buildPagesSequentially(pages, sharedContext, controller.signal, modelId);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [writeFile, files]
  );

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
        verificationLog: [],
      });

      // Retry individual page via /api/build-page
      buildSinglePage(page, sharedContext, controller.signal, modelIdRef.current);
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

      runVerificationLoop({
        completedFiles: completedFilePaths,
        allFiles: latestFiles,
        writeFile,
        modelId: modelIdRef.current,
        pageId,
        signal: controller.signal,
        stateCallbacks: makeVerificationCallbacks(pageId),
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
    [writeFile, files, getLatestFile, makeVerificationCallbacks]
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
