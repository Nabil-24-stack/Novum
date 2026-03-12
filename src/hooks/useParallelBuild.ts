"use client";

import { useRef, useCallback } from "react";
import { useStreamingStore, type FoundationArtifact } from "./useStreamingStore";
import { useStrategyStore } from "./useStrategyStore";
import { useProductBrainStore } from "./useProductBrainStore";
import { useDocumentStore } from "./useDocumentStore";
import { parse as babelParse } from "@babel/parser";
import { parseStreamingContent } from "@/lib/streaming-parser";
import { runGatekeeper } from "@/lib/ai/gatekeeper";
import { trackEvent } from "@/lib/analytics/track-event";
import { generateAppTsx, toPascalCase } from "@/lib/vfs/app-generator";
import { runVerificationLoop, detectErrors, sleep, POST_SETTLE_DELAY_MS, type VerificationStateCallbacks } from "@/lib/verification/verify-loop";
import { isIframeAvailable } from "@/lib/verification/screenshot-capture";
import { waitForSandpackSettle as waitForSandpackSettleStore } from "@/hooks/useSandpackErrorStore";
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

const MAX_CONCURRENCY = 3;

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
 * Validate that code parses as valid JSX/TSX via Babel.
 */
function canBabelParse(code: string): boolean {
  try {
    babelParse(code, {
      sourceType: "module",
      plugins: ["jsx", "typescript"],
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Extract named exports from a file using simple regex.
 */
function extractNamedExports(code: string): string[] {
  const exports: string[] = [];
  const re = /export\s+(?:function|const|class|type|interface)\s+(\w+)/g;
  let m;
  while ((m = re.exec(code))) {
    exports.push(m[1]);
  }
  return exports;
}

/**
 * Extract local import paths from a file (relative imports only).
 */
function extractLocalImports(code: string): string[] {
  const imports: string[] = [];
  const re = /import\s+(?:.*?)\s+from\s+["'](\.[^"']+)["']/g;
  let m;
  while ((m = re.exec(code))) {
    imports.push(m[1]);
  }
  return imports;
}

/**
 * Resolve a relative import path from a given file to an absolute VFS path.
 */
function resolveImport(fromFile: string, importPath: string): string {
  const fromDir = fromFile.substring(0, fromFile.lastIndexOf("/"));
  const parts = [...fromDir.split("/"), ...importPath.split("/")];
  const resolved: string[] = [];
  for (const p of parts) {
    if (p === "." || p === "") continue;
    if (p === "..") { resolved.pop(); continue; }
    resolved.push(p);
  }
  let abs = "/" + resolved.join("/");
  if (!abs.match(/\.\w+$/)) abs += ".tsx";
  return abs;
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
  projectId,
}: {
  writeFile: (path: string, content: string) => void;
  files: Record<string, string>;
  getLatestFile: (path: string) => string | undefined;
  projectId?: string;
}) {
  const abortControllersRef = useRef<Map<string, AbortController>>(new Map());
  const modelIdRef = useRef<string>("gemini-2.5-pro");
  const allPagesRef = useRef<PageBuildConfig[]>([]);
  const sharedContextRef = useRef<SharedContext | null>(null);
  const evaluationTriggeredRef = useRef(false);
  const rebuildTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Mutable build-local VFS snapshot for parallel builds
  const latestBuildFilesRef = useRef<Record<string, string>>({});
  // Accumulated error/fix summaries across the build session
  const knownFailuresRef = useRef<Array<{ pageName: string; error: string; fix?: string }>>([]);

  // Core rebuild logic — generates and writes /App.tsx with only appropriate pages
  const doRebuildAppTsx = useCallback(() => {
    const pageBuilds = useStreamingStore.getState().pageBuilds;
    const isParallelFreshBuild = useStreamingStore.getState().parallelMode
      && !sharedContextRef.current?.isRebuild;

    let eligiblePages: PageBuildConfig[];

    if (isParallelFreshBuild) {
      // In parallel fresh builds, only include pages that are verifying or verified
      // NOT verify_failed — a broken import kills the entire bundle
      eligiblePages = allPagesRef.current.filter((p) => {
        const stage = pageBuilds[p.pageId]?.buildStage;
        return stage === "verifying" || stage === "verified";
      });
    } else {
      // Legacy path (rebuilds, sequential): use completedPages from strategy store
      const completed = useStrategyStore.getState().completedPages;
      eligiblePages = allPagesRef.current.filter((p) =>
        completed.includes(p.pageId)
      );
    }

    const appCode = eligiblePages.length > 0
      ? generateAppTsx(
          eligiblePages.map((p) => ({
            id: p.pageId,
            label: p.pageName,
            route: p.pageRoute,
          }))
        )
      : // No eligible pages — write a stub App.tsx so Sandpack doesn't import broken modules
        `import * as React from "react";\nimport { ToastProvider, Toaster } from "./components/ui/toast";\nimport "./globals.css";\n\nexport function App() {\n  return (\n    <ToastProvider>\n      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>\n        <p>Building pages...</p>\n      </div>\n      <Toaster />\n    </ToastProvider>\n  );\n}\n`;
    writeFile("/App.tsx", appCode);
    latestBuildFilesRef.current["/App.tsx"] = appCode;
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

  // Check if all pages are done and trigger evaluation (parallel fresh build path)
  const checkAllPagesComplete = useCallback(() => {
    if (evaluationTriggeredRef.current) return;

    const allPages = allPagesRef.current;
    if (allPages.length === 0) return;

    if (useStreamingStore.getState().verificationPaused) return;

    const pageBuilds = useStreamingStore.getState().pageBuilds;
    const isParallelFreshBuild = useStreamingStore.getState().parallelMode
      && !sharedContextRef.current?.isRebuild;

    if (isParallelFreshBuild) {
      // In parallel fresh builds, check buildStage
      const hasIncomplete = allPages.some((p) => {
        const stage = pageBuilds[p.pageId]?.buildStage;
        return stage !== "verified" && stage !== "build_failed" && stage !== "verify_failed";
      });
      if (hasIncomplete) return;

      const hasFailed = allPages.some((p) => {
        const stage = pageBuilds[p.pageId]?.buildStage;
        return stage === "build_failed" || stage === "verify_failed";
      });

      if (hasFailed) {
        // Keep session open for retry — don't trigger evaluation
        // But transition to complete if all are terminal (no more in-flight)
        return;
      }

      // All verified — trigger annotation evaluation
      evaluationTriggeredRef.current = true;
      evaluateAnnotations();
    } else {
      // Legacy path: check completedPages
      const completed = useStrategyStore.getState().completedPages;
      const allDone = allPages.every((p) => completed.includes(p.pageId));
      if (!allDone) return;

      evaluationTriggeredRef.current = true;

      // Check if any page failed verification — broken bundle makes annotations useless
      const hasFailedVerification = allPages.some(
        (p) => pageBuilds[p.pageId]?.verificationStatus === "failed"
      );

      if (hasFailedVerification) {
        // Skip annotations, transition to complete
        useStrategyStore.getState().setPhase("complete");
        useStreamingStore.getState().endParallelStreaming();
        useStrategyStore.getState().setBuildingPages([]);
      } else {
        evaluateAnnotations();
      }
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
  const verifyPage = async (page: PageBuildConfig, signal: AbortSignal, useLatestRef = false): Promise<import("@/lib/verification/verify-loop").VerificationResult | null> => {
    const completedFilePaths = useStreamingStore.getState().pageBuilds[page.pageId]?.completedFilePaths || [];

    // For parallel builds, include foundation files in the import closure
    const foundationBuild = useStreamingStore.getState().foundationBuild;
    const expandedPaths = [...completedFilePaths];
    if (foundationBuild.filePaths.length > 0) {
      // Parse the page file to find which foundation files it imports
      const pageFilePath = `/pages/${page.componentName}.tsx`;
      const pageCode = useLatestRef
        ? latestBuildFilesRef.current[pageFilePath]
        : (getLatestFile(pageFilePath) || files[pageFilePath]);
      if (pageCode) {
        const localImports = extractLocalImports(pageCode);
        for (const imp of localImports) {
          const resolved = resolveImport(pageFilePath, imp);
          if (foundationBuild.filePaths.includes(resolved) && !expandedPaths.includes(resolved)) {
            expandedPaths.push(resolved);
          }
        }
      }
    }

    // Build latest files map
    const latestFiles: Record<string, string> = useLatestRef
      ? { ...latestBuildFilesRef.current }
      : { ...files };
    if (!useLatestRef) {
      for (const fp of expandedPaths) {
        const latest = getLatestFile(fp);
        if (latest) latestFiles[fp] = latest;
      }
    }

    // Wrap writeFile to also update latestBuildFilesRef
    const wrappedWriteFile = (path: string, content: string) => {
      writeFile(path, content);
      latestBuildFilesRef.current[path] = content;
    };

    try {
      const result = await runVerificationLoop({
        completedFiles: expandedPaths,
        allFiles: latestFiles,
        writeFile: wrappedWriteFile,
        modelId: modelIdRef.current,
        pageId: page.pageId,
        signal,
        stateCallbacks: makeVerificationCallbacks(page.pageId),
      });

      trackEvent("verification_result", projectId, { status: result.status, pageId: page.pageId, attempts: result.attempts, fixCount: result.fixCount });
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
  const processCompletedBlock = (block: { path: string; content: string }, filesSnapshot?: Record<string, string>) => {
    const ext = block.path.split(".").pop() || "";
    let finalContent = block.content;
    const page = findPageForPath(block.path);
    const filesForGatekeeper = filesSnapshot || files;

    if (["tsx", "ts", "jsx", "js"].includes(ext)) {
      const gated = runGatekeeper(block.content, filesForGatekeeper, block.path);
      finalContent = gated.code;
      if (gated.report.hadChanges) {
        const total =
          (gated.report.importFixes?.length || 0) +
          gated.report.colorViolations.length +
          gated.report.spacingViolations.length +
          gated.report.layoutViolations.length +
          gated.report.componentPromotions.length +
          gated.report.layoutDeclarationAdditions.length +
          gated.report.buttonNormalizations.length +
          gated.report.badgeNormalizations.length +
          gated.report.tabsNormalizations.length;
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
    latestBuildFilesRef.current[block.path] = finalContent;

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

  // Wait for Sandpack to settle after file writes using the global error store.
  // Falls back to iframe availability polling if the store entry doesn't exist yet.
  const waitForSandpackSettle = async (pageId: string, signal: AbortSignal): Promise<void> => {
    try {
      await waitForSandpackSettleStore(pageId, 15000, signal);
    } catch (err) {
      if ((err as Error).name === "AbortError") throw err;
      // Store-based settle failed — fall back to iframe availability check
      const POLL_INTERVAL = 500;
      const MAX_TOTAL = 10000;
      const start = Date.now();
      while (Date.now() - start < MAX_TOTAL) {
        if (signal.aborted) throw new DOMException("Aborted", "AbortError");
        if (isIframeAvailable(pageId)) return;
        await new Promise<void>((resolve, reject) => {
          const t = setTimeout(resolve, POLL_INTERVAL);
          signal.addEventListener("abort", () => { clearTimeout(t); reject(new DOMException("Aborted", "AbortError")); }, { once: true });
        });
      }
    }
  };

  // ─── Phase 1: Foundation Build ───────────────────────────────────────

  const buildFoundation = async (
    sharedContext: SharedContext,
    pages: PageBuildConfig[],
    signal: AbortSignal,
    modelId: string,
  ): Promise<FoundationArtifact[]> => {
    const store = useStreamingStore.getState();
    store.setFoundationBuild({ status: "streaming" });

    try {
      const response = await fetch("/api/build-page", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          isFoundation: true,
          manifestoContext: sharedContext.manifestoContext,
          personaContext: sharedContext.personaContext,
          flowContext: sharedContext.flowContext,
          modelId,
          pages: pages.map((p) => ({ pageName: p.pageName, pageRoute: p.pageRoute })),
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
      const foundationFiles: { path: string; content: string }[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        fullText += chunk;

        const parsed = parseStreamingContent(fullText);

        for (const block of parsed.completedBlocks) {
          const dedupKey = block.path + "|" + block.content.length;
          if (!writtenPaths.has(dedupKey) && block.path.startsWith("/components/layout/")) {
            writtenPaths.add(dedupKey);

            const ext = block.path.split(".").pop() || "";
            let finalContent = block.content;
            if (["tsx", "ts", "jsx", "js"].includes(ext)) {
              const gated = runGatekeeper(block.content, latestBuildFilesRef.current, block.path);
              finalContent = gated.code;
              if (ext === "tsx" || ext === "jsx") {
                finalContent = ensureReactImport(finalContent);
              }
            }

            writeFile(block.path, finalContent);
            latestBuildFilesRef.current[block.path] = finalContent;
            foundationFiles.push({ path: block.path, content: finalContent });
          }
        }
      }

      // Flush any remaining block
      const finalParsed = parseStreamingContent(fullText);
      if (finalParsed.currentFile && finalParsed.currentFile.path.startsWith("/components/layout/")) {
        const dedupKey = finalParsed.currentFile.path + "|" + finalParsed.currentFile.content.length;
        if (!writtenPaths.has(dedupKey)) {
          const ext = finalParsed.currentFile.path.split(".").pop() || "";
          let finalContent = finalParsed.currentFile.content;
          if (["tsx", "ts", "jsx", "js"].includes(ext)) {
            const gated = runGatekeeper(finalContent, latestBuildFilesRef.current, finalParsed.currentFile.path);
            finalContent = gated.code;
            if (ext === "tsx" || ext === "jsx") {
              finalContent = ensureReactImport(finalContent);
            }
          }
          writeFile(finalParsed.currentFile.path, finalContent);
          latestBuildFilesRef.current[finalParsed.currentFile.path] = finalContent;
          foundationFiles.push({ path: finalParsed.currentFile.path, content: finalContent });
        }
      }

      if (foundationFiles.length === 0) {
        throw new Error("Foundation generated no files");
      }

      // Validation: Babel parse + import closure
      const validFiles = new Set(foundationFiles.map((f) => f.path));
      const invalidFiles = new Set<string>();

      // Phase 1: Exclude files that don't parse
      for (const file of foundationFiles) {
        if (!canBabelParse(file.content)) {
          console.warn(`[Build] Foundation: ${file.path} failed Babel parse, excluding`);
          invalidFiles.add(file.path);
        }
      }

      // Phase 2: Check which files have broken imports to other foundation files
      for (const file of foundationFiles) {
        if (invalidFiles.has(file.path)) continue;
        const imports = extractLocalImports(file.content);
        for (const imp of imports) {
          const resolved = resolveImport(file.path, imp);
          // If it imports another /components/layout/ file that failed to generate, mark it
          if (resolved.startsWith("/components/layout/") && !validFiles.has(resolved)) {
            invalidFiles.add(file.path);
          }
        }
      }

      // Also invalidate files that import an invalid file
      let changed = true;
      while (changed) {
        changed = false;
        for (const file of foundationFiles) {
          if (invalidFiles.has(file.path)) continue;
          const imports = extractLocalImports(file.content);
          for (const imp of imports) {
            const resolved = resolveImport(file.path, imp);
            if (invalidFiles.has(resolved)) {
              invalidFiles.add(file.path);
              changed = true;
            }
          }
        }
      }

      // Build artifacts manifest from valid files only
      const artifacts: FoundationArtifact[] = foundationFiles
        .filter((f) => !invalidFiles.has(f.path))
        .map((f) => ({
          path: f.path,
          exports: extractNamedExports(f.content),
          purpose: inferPurpose(f.path),
        }));

      const filePaths = artifacts.map((a) => a.path);

      useStreamingStore.getState().setFoundationBuild({
        status: "completed",
        artifacts,
        filePaths,
      });

      if (invalidFiles.size > 0) {
        console.warn("[Build] Foundation: excluded files with broken imports:", [...invalidFiles]);
      }

      return artifacts;
    } catch (err) {
      if (signal.aborted) throw err;
      console.error("[Build] Foundation build failed:", err);
      useStreamingStore.getState().setFoundationBuild({
        status: "error",
        error: err instanceof Error ? err.message : "Unknown error",
      });
      toast.info("Building pages without shared layout components.");
      return [];
    }
  };

  // ─── Phase 2: Parallel Page Generation ──────────────────────────────

  const buildPagesInParallel = async (
    pages: PageBuildConfig[],
    sharedContext: SharedContext,
    signal: AbortSignal,
    modelId: string,
    foundationArtifacts: FoundationArtifact[],
  ) => {
    await runWithSemaphore(pages, MAX_CONCURRENCY, signal, async (page) => {
      if (signal.aborted) return;
      useStreamingStore.getState().setPageBuildStage(page.pageId, "streaming");
      useStreamingStore.getState().updatePageBuild(page.pageId, { status: "streaming" });
      await buildSinglePageParallel(page, sharedContext, signal, modelId, foundationArtifacts);
    });
  };

  // Semaphore utility for bounded concurrency
  const runWithSemaphore = async <T>(
    items: T[],
    maxConcurrent: number,
    signal: AbortSignal,
    fn: (item: T) => Promise<void>,
  ) => {
    let running = 0;
    let idx = 0;
    const results: Promise<void>[] = [];

    return new Promise<void>((resolve) => {
      const tryNext = () => {
        while (running < maxConcurrent && idx < items.length && !signal.aborted) {
          const item = items[idx++];
          running++;
          const p = fn(item).catch(() => {}).finally(() => {
            running--;
            tryNext();
          });
          results.push(p);
        }
        if (running === 0) {
          resolve();
        }
      };
      tryNext();
    });
  };

  // Build a single page in parallel mode (no inline verification)
  const buildSinglePageParallel = async (
    page: PageBuildConfig,
    sharedContext: SharedContext,
    signal: AbortSignal,
    modelId: string,
    foundationArtifacts: FoundationArtifact[],
  ) => {
    const { updatePageBuild } = useStreamingStore.getState();

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
          foundationArtifacts: foundationArtifacts.length > 0 ? foundationArtifacts : undefined,
          knownFailures: knownFailuresRef.current.length > 0 ? knownFailuresRef.current : undefined,
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
            // File path enforcement: only accept the expected page file
            const expectedPath = `/pages/${page.componentName}.tsx`;
            if (block.path !== expectedPath) {
              console.warn(`[Build] ${page.pageName}: discarding unexpected file ${block.path}`);
              continue;
            }
            writtenPaths.add(dedupKey);

            const ext = block.path.split(".").pop() || "";
            let finalContent = block.content;
            if (["tsx", "ts", "jsx", "js"].includes(ext)) {
              const gated = runGatekeeper(block.content, latestBuildFilesRef.current, block.path);
              finalContent = gated.code;
              if (gated.report.hadChanges) {
                const total =
                  (gated.report.importFixes?.length || 0) +
                  gated.report.colorViolations.length +
                  gated.report.spacingViolations.length +
                  gated.report.layoutViolations.length +
                  gated.report.componentPromotions.length +
                  gated.report.layoutDeclarationAdditions.length +
                  gated.report.buttonNormalizations.length +
                  gated.report.badgeNormalizations.length +
                  gated.report.tabsNormalizations.length;
                toast.info(
                  `Gatekeeper (${page.pageName}): ${total} design system fix${total > 1 ? "es" : ""} applied`
                );
              }
              if (ext === "tsx" || ext === "jsx") {
                finalContent = ensureReactImport(finalContent);
              }
            }

            writeFile(block.path, finalContent);
            latestBuildFilesRef.current[block.path] = finalContent;

            const current = useStreamingStore.getState().pageBuilds[page.pageId];
            if (current) {
              useStreamingStore.getState().updatePageBuild(page.pageId, {
                completedFilePaths: [...current.completedFilePaths, block.path],
              });
            }
          }
        }
      }

      // Flush final streaming block
      const finalParsed = parseStreamingContent(fullText);
      if (finalParsed.currentFile) {
        const expectedPath = `/pages/${page.componentName}.tsx`;
        const dedupKey = finalParsed.currentFile.path + "|" + finalParsed.currentFile.content.length;
        if (!writtenPaths.has(dedupKey) && finalParsed.currentFile.path === expectedPath) {
          writtenPaths.add(dedupKey);

          const ext = finalParsed.currentFile.path.split(".").pop() || "";
          let finalContent = finalParsed.currentFile.content;
          if (["tsx", "ts", "jsx", "js"].includes(ext)) {
            const gated = runGatekeeper(finalContent, latestBuildFilesRef.current, finalParsed.currentFile.path);
            finalContent = gated.code;
            if (ext === "tsx" || ext === "jsx") {
              finalContent = ensureReactImport(finalContent);
            }
          }

          writeFile(finalParsed.currentFile.path, finalContent);
          latestBuildFilesRef.current[finalParsed.currentFile.path] = finalContent;

          const current = useStreamingStore.getState().pageBuilds[page.pageId];
          if (current) {
            useStreamingStore.getState().updatePageBuild(page.pageId, {
              completedFilePaths: [...current.completedFilePaths, finalParsed.currentFile.path],
            });
          }
        }
      }

      // Mark as generated -> queued for verification
      useStreamingStore.getState().setPageBuildStage(page.pageId, "generated");
      useStrategyStore.getState().addCompletedPage(page.pageId);

      // Enqueue for verification
      useStreamingStore.getState().setPageBuildStage(page.pageId, "queued_verification");
      useStreamingStore.getState().enqueueVerification(page.pageId);

      // Trigger the verification queue processor
      processVerificationQueue(signal);

    } catch (err: unknown) {
      if (signal.aborted) return;
      const message = err instanceof Error ? err.message : "Unknown error";
      useStreamingStore.getState().failPageBuild(page.pageId, message);
      useStreamingStore.getState().setPageBuildStage(page.pageId, "build_failed");
      console.error(`[Build] Failed to build ${page.pageName}:`, err);

      // Track build failures
      knownFailuresRef.current.push({
        pageName: page.pageName,
        error: message.slice(0, 200),
      });
    }
  };

  // ─── Phase 3: Verification Queue ────────────────────────────────────

  // Lock to prevent multiple queue processors from running simultaneously
  const verificationProcessingRef = useRef(false);
  const processVerificationQueueRef = useRef<(signal: AbortSignal) => Promise<void>>(async () => {});

  /**
   * Settle Sandpack, detect errors, and extract the broken file path.
   * Used by the queue processor to decide ownership BEFORE starting repair.
   */
  const detectVerificationTarget = async (
    pageId: string,
    sig: AbortSignal
  ): Promise<{ detectedError: string | null; detectedErrorPath: string | undefined }> => {
    // Wait for Sandpack to settle
    try {
      await waitForSandpackSettle(pageId, sig);
    } catch (err) {
      if ((err as Error).name === "AbortError") throw err;
    }
    await sleep(POST_SETTLE_DELAY_MS, sig);

    if (sig.aborted) throw new DOMException("Aborted", "AbortError");

    const detectedError = await detectErrors(pageId, sig);
    let detectedErrorPath: string | undefined;
    if (detectedError) {
      const fileMatch = detectedError.match(/(?:\/[^\s:|]+\.(?:tsx?|jsx?|js))/);
      if (fileMatch) detectedErrorPath = fileMatch[0];
    }
    return { detectedError, detectedErrorPath };
  };

  const processVerificationQueue = async (signal: AbortSignal) => {
    // Prevent concurrent queue processing
    if (verificationProcessingRef.current) return;
    verificationProcessingRef.current = true;

    try {
      while (!signal.aborted) {
        const store = useStreamingStore.getState();
        if (store.verificationPaused) break;
        if (store.verificationActive) break; // Already verifying something

        const nextPageId = store.dequeueVerification();
        if (!nextPageId) break; // Queue empty

        const page = allPagesRef.current.find((p) => p.pageId === nextPageId);
        if (!page) continue;

        store.setVerificationActive(nextPageId);
        store.setPageBuildStage(nextPageId, "verifying");

        // Per-page abort controller cascaded from the build-level signal
        const verifyController = new AbortController();
        abortControllersRef.current.set(`verify-${nextPageId}`, verifyController);
        const onBuildAbort = () => verifyController.abort();
        signal.addEventListener("abort", onBuildAbort, { once: true });

        try {
          // Add to App.tsx for verification
          doRebuildAppTsx();

          useStreamingStore.getState().updatePageVerification(nextPageId, "capturing", {
            attempt: 1,
            issues: [],
          });

          // ── Early detection: settle + detect error + extract broken file ──
          const {
            detectedError: earlyError,
            detectedErrorPath: earlyErrorPath,
          } = await detectVerificationTarget(nextPageId, verifyController.signal);

          // ── Cross-page ownership check BEFORE repair ──
          // If the broken file belongs to a different page, reassign immediately.
          if (earlyError && earlyErrorPath) {
            const ownerPage = findPageForPath(earlyErrorPath);
            if (ownerPage && ownerPage.pageId !== nextPageId) {
              const ownerStage =
                useStreamingStore.getState().pageBuilds[ownerPage.pageId]?.buildStage;

              console.log(
                `[parallel-build] Cross-page ownership: error in ${earlyErrorPath} belongs to ${ownerPage.pageName} (not ${page.pageName}) — reassigning`
              );

              if (ownerStage === "verified" || ownerStage === "queued_verification" || ownerStage === "verifying") {
                useStreamingStore.getState().setPageBuildStage(ownerPage.pageId, "verify_failed");
              }
              useStreamingStore.getState().updatePageVerification(ownerPage.pageId, "failed", {
                attempt: 1,
                issues: [earlyError],
              });
              useStreamingStore.getState().addPageVerificationLog(
                ownerPage.pageId,
                `Verification paused — unresolved error belongs to ${ownerPage.pageName}`
              );

              // Requeue the innocent page for later verification after the failed page is fixed in chat.
              useStreamingStore.getState().updatePageVerification(nextPageId, "idle", {
                attempt: 0,
                issues: [],
              });
              useStreamingStore.getState().setPageBuildStage(nextPageId, "queued_verification");
              useStreamingStore.getState().enqueueVerification(nextPageId);

              useStreamingStore.getState().pauseVerification(ownerPage.pageId, earlyError, earlyErrorPath);
              doRebuildAppTsx();

              // Release the active slot and pause the queue until the user fixes the page in chat.
              useStreamingStore.getState().setVerificationActive(null);
              signal.removeEventListener("abort", onBuildAbort);
              abortControllersRef.current.delete(`verify-${nextPageId}`);
              break;
            }
          }

          // ── No error detected = page is clean ──
          if (!earlyError) {
            useStreamingStore.getState().setPageBuildStage(nextPageId, "verified");
            useStrategyStore.getState().addVerifiedPage(nextPageId);
            useStreamingStore.getState().updatePageVerification(nextPageId, "passed");
            useStreamingStore.getState().addPageVerificationLog(nextPageId, "No errors detected");
            useStreamingStore.getState().setVerificationActive(null);
            signal.removeEventListener("abort", onBuildAbort);
            abortControllersRef.current.delete(`verify-${nextPageId}`);
            continue;
          }

          // ── Error belongs to this page — pause verification and send the user to chat ──
          useStreamingStore.getState().setPageBuildStage(nextPageId, "verify_failed");
          useStreamingStore.getState().updatePageVerification(nextPageId, "failed", {
            attempt: 1,
            issues: [earlyError],
          });
          useStreamingStore.getState().addPageVerificationLog(
            nextPageId,
            "Verification paused — take a screenshot of this error and send it in chat."
          );
          useStreamingStore.getState().pauseVerification(nextPageId, earlyError, earlyErrorPath);
          doRebuildAppTsx();
          useStreamingStore.getState().setVerificationActive(null);
          signal.removeEventListener("abort", onBuildAbort);
          abortControllersRef.current.delete(`verify-${nextPageId}`);
          break;
        } catch (err) {
          if ((err as Error).name === "AbortError") {
            if (!signal.aborted) {
              const currentStage = useStreamingStore.getState().pageBuilds[nextPageId]?.buildStage;
              if (currentStage !== "verify_failed") {
                useStreamingStore.getState().setPageBuildStage(nextPageId, "verify_failed");
                useStreamingStore.getState().updatePageVerification(nextPageId, "failed", {
                  issues: ["Aborted"],
                });
                useStreamingStore.getState().pauseVerification(nextPageId, "Aborted");
                doRebuildAppTsx();
              }
            } else {
              break;
            }
          } else {
            // Unexpected error — mark as verify_failed
            useStreamingStore.getState().setPageBuildStage(nextPageId, "verify_failed");
            useStreamingStore.getState().updatePageVerification(nextPageId, "failed", {
              issues: ["Verification failed unexpectedly"],
            });
            useStreamingStore.getState().pauseVerification(nextPageId, "Verification failed unexpectedly");
            doRebuildAppTsx();
            break;
          }
        } finally {
          signal.removeEventListener("abort", onBuildAbort);
          abortControllersRef.current.delete(`verify-${nextPageId}`);
        }

        useStreamingStore.getState().setVerificationActive(null);
      }
    } finally {
      verificationProcessingRef.current = false;
    }

    // Check if all pages are done
    checkAllPagesComplete();
  };
  processVerificationQueueRef.current = processVerificationQueue;

  // Single-call sequential build: one API call generates all pages (used for rebuilds)
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
            useStreamingStore.getState().setPageBuildStage(page.pageId, "unchanged");
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

  // Build a single page via /api/build-page (used for retries in legacy mode)
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
                  gated.report.layoutDeclarationAdditions.length +
                  gated.report.buttonNormalizations.length +
                  gated.report.badgeNormalizations.length +
                  gated.report.tabsNormalizations.length;
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

  // ─── startBuild ─────────────────────────────────────────────────────

  const startBuild = useCallback(
    (pages: PageBuildConfig[], sharedContext: SharedContext, modelId: string) => {
      modelIdRef.current = modelId;
      allPagesRef.current = pages;
      sharedContextRef.current = sharedContext;
      evaluationTriggeredRef.current = false;
      knownFailuresRef.current = [];
      verificationProcessingRef.current = false;

      // Initialize latestBuildFilesRef from current VFS
      latestBuildFilesRef.current = { ...files };

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
          latestBuildFilesRef.current["/package.json"] = JSON.stringify(pkg, null, 2);
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
            useStreamingStore.getState().setPageBuildStage(page.pageId, "unchanged");
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
        // Fresh builds: 3-phase parallel pipeline
        // NOTE: We do NOT delete the __build__ controller here. It must stay alive
        // so that cancelAll() can abort the verification queue (Phase 3) which runs
        // asynchronously after buildPagesInParallel returns. The controller is cleaned
        // up by cancelAll() or endParallelStreaming() at the end of the build lifecycle.
        (async () => {
          try {
            // Phase 1: Foundation
            const foundationArtifacts = await buildFoundation(
              sharedContext,
              pages,
              controller.signal,
              modelId,
            );

            if (controller.signal.aborted) return;

            // Phase 2: Parallel page generation -> Phase 3: Verification queue (auto-triggered)
            await buildPagesInParallel(
              pages,
              sharedContext,
              controller.signal,
              modelId,
              foundationArtifacts,
            );

            // Phase 3 verification may still be processing — the queue processor
            // will call checkAllPagesComplete when done, which triggers evaluateAnnotations
            // -> endParallelStreaming, cleaning up the controller.
          } catch (err) {
            if (controller.signal.aborted) return;
            console.error("[Build] Pipeline error:", err);
          }
        })();
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

      const isParallelFresh = useStreamingStore.getState().parallelMode
        && !sharedContext.isRebuild;

      useStreamingStore.getState().updatePageBuild(pageId, {
        status: "pending",
        error: undefined,
        currentFile: null,
        completedFilePaths: [],
        verificationStatus: "idle",
        verificationAttempt: 0,
        verificationIssues: [],
        verificationLog: [],
        buildStage: "pending",
      });

      if (isParallelFresh) {
        // Use parallel path with foundation artifacts
        const artifacts = useStreamingStore.getState().foundationBuild.artifacts;
        (async () => {
          try {
            useStreamingStore.getState().setPageBuildStage(pageId, "streaming");
            useStreamingStore.getState().updatePageBuild(pageId, { status: "streaming" });
            await buildSinglePageParallel(page, sharedContext, controller.signal, modelIdRef.current, artifacts);
          } finally {
            abortControllersRef.current.delete(pageId);
          }
        })();
      } else {
        // Legacy retry path
        buildSinglePage(page, sharedContext, controller.signal, modelIdRef.current);
      }
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

      const isParallelFresh = useStreamingStore.getState().parallelMode
        && !sharedContextRef.current?.isRebuild;

      if (isParallelFresh) {
        useStreamingStore.getState().resumeVerification();
        // Re-enqueue for verification queue
        useStreamingStore.getState().setPageBuildStage(pageId, "queued_verification");
        useStreamingStore.getState().prependVerification(pageId);
        processVerificationQueue(controller.signal);
        return;
      }

      // Legacy path
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
        trackEvent("verification_result", projectId, { status: result.status, pageId, attempts: result.attempts, fixCount: result.fixCount });
        if (result.status === "fixed") {
          toast.success(`Auto-fixed ${result.fixCount} issue${result.fixCount > 1 ? "s" : ""}`);
        } else if (result.status === "failed") {
          toast.warning("Could not auto-fix all issues");
        }

        // In parallel mode, update buildStage and check completion
        if (isParallelFresh) {
          if (result.status === "passed" || result.status === "fixed") {
            useStreamingStore.getState().setPageBuildStage(pageId, "verified");
            useStrategyStore.getState().addVerifiedPage(pageId);
            doRebuildAppTsx();
          } else {
            useStreamingStore.getState().setPageBuildStage(pageId, "verify_failed");
            doRebuildAppTsx();
          }
          checkAllPagesComplete();
        }
      }).catch(() => {
        // Verification failed silently
      }).finally(() => {
        abortControllersRef.current.delete(`verify-${pageId}`);
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- processVerificationQueue is a stable closure over refs
    [writeFile, files, getLatestFile, makeVerificationCallbacks, projectId, doRebuildAppTsx, checkAllPagesComplete]
  );

  const stopVerification = useCallback(
    (pageId: string) => {
      // Abort only this page's verify controller
      const controller = abortControllersRef.current.get(`verify-${pageId}`);
      if (controller) {
        controller.abort();
        abortControllersRef.current.delete(`verify-${pageId}`);
      }

      // Mark page as failed
      useStreamingStore.getState().setPageBuildStage(pageId, "verify_failed");
      useStreamingStore.getState().updatePageVerification(pageId, "failed", {
        issues: ["Stopped by user"],
      });
      useStreamingStore.getState().addPageVerificationLog(pageId, "Verification stopped by user");
      const page = allPagesRef.current.find((item) => item.pageId === pageId);
      useStreamingStore.getState().pauseVerification(
        pageId,
        "Stopped by user",
        page ? `/pages/${page.componentName}.tsx` : undefined,
      );
      doRebuildAppTsx();

      // If this was the active verification, clear it but keep the queue paused.
      if (useStreamingStore.getState().verificationActive === pageId) {
        useStreamingStore.getState().setVerificationActive(null);
      }

      checkAllPagesComplete();
    },
    [doRebuildAppTsx, checkAllPagesComplete]
  );

  const resumePausedVerification = useCallback(() => {
    const store = useStreamingStore.getState();
    const pausedPageId = store.verificationPausedPageId;
    if (!store.verificationPaused || !pausedPageId) return;

    store.resumeVerification();
    store.updatePageVerification(pausedPageId, "idle", { attempt: 0, issues: [] });
    store.addPageVerificationLog(pausedPageId, "Manual fix received — resuming verification");
    store.setPageBuildStage(pausedPageId, "queued_verification");
    store.prependVerification(pausedPageId);
    doRebuildAppTsx();

    const buildController = abortControllersRef.current.get("__build__");
    if (buildController && !buildController.signal.aborted) {
      processVerificationQueueRef.current(buildController.signal);
    }
  }, [doRebuildAppTsx]);

  const cancelAll = useCallback(() => {
    for (const [, controller] of abortControllersRef.current) {
      controller.abort();
    }
    abortControllersRef.current.clear();

    // Clear verification queue state
    const store = useStreamingStore.getState();
    // Reset verification queue manually since endParallelStreaming will clear it
    store.setVerificationActive(null);

    // Clear mutable refs
    latestBuildFilesRef.current = {};
    knownFailuresRef.current = [];
    verificationProcessingRef.current = false;

    // Flush/cancel any pending rebuildAppTsx debounce timer
    if (rebuildTimerRef.current) {
      clearTimeout(rebuildTimerRef.current);
      rebuildTimerRef.current = null;
    }

    useStreamingStore.getState().endParallelStreaming();
    useStrategyStore.getState().setBuildingPages([]);
  }, []);

  return { startBuild, retryPage, retryVerification, stopVerification, resumePausedVerification, cancelAll };
}

// Helper: infer purpose from foundation file path
function inferPurpose(path: string): string {
  const name = path.split("/").pop()?.replace(".tsx", "") || "";
  switch (name.toLowerCase()) {
    case "navbar": return "Top navigation bar with links to all pages";
    case "footer": return "Page footer with app info";
    case "applayout": return "Page wrapper with Navbar and Footer";
    default: return `Shared layout component: ${name}`;
  }
}
