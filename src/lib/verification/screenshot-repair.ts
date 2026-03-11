/**
 * Screenshot-assisted repair for parallel builds.
 *
 * Single-attempt flow: detect error → capture screenshot → one AI repair call → re-check.
 * Used only by the parallel build verification queue. Single-page chat/self-heal
 * continues using `runVerificationLoop` unchanged.
 */

import { preValidate, buildExportsMap } from "./pre-validator";
import {
  captureIframeScreenshot,
  pollForVisibleError,
} from "./screenshot-capture";
import {
  detectErrors,
  extractCodeBlocks,
  canBabelParse,
  ensureReactImport,
  isDependencyError,
  tryDeterministicSyntaxFix,
  enrichSyntaxError,
  sleep,
  POST_SETTLE_DELAY_MS,
  DEP_INSTALL_WAIT_MS,
  type VerificationStateCallbacks,
} from "./verify-loop";
import { waitForSandpackSettle } from "@/hooks/useSandpackErrorStore";
import { runGatekeeper } from "@/lib/ai/gatekeeper";

/** Max number of times to wait for a dependency that's already in package.json */
const MAX_DEP_WAITS = 3;

export interface ScreenshotRepairParams {
  completedFiles: string[];
  allFiles: Record<string, string>;
  writeFile: (path: string, content: string) => void;
  modelId: string;
  pageId: string;
  signal?: AbortSignal;
  stateCallbacks: VerificationStateCallbacks;
}

export interface ScreenshotRepairResult {
  status: "passed" | "fixed" | "failed";
  fixCount: number;
  fixedPaths: string[];
  lastError?: string;
  fixSummary?: string;
  /** File path extracted from the detected error, for cross-page ownership. */
  detectedErrorPath?: string;
}

export async function runScreenshotRepair(
  params: ScreenshotRepairParams
): Promise<ScreenshotRepairResult> {
  const {
    completedFiles,
    allFiles,
    writeFile,
    modelId,
    pageId,
    signal,
    stateCallbacks: cb,
  } = params;

  // Build the files map of what was written (for context to the AI)
  const writtenFiles: Record<string, string> = {};
  for (const filePath of completedFiles) {
    if (allFiles[filePath]) {
      writtenFiles[filePath] = allFiles[filePath];
    }
  }

  if (Object.keys(writtenFiles).length === 0) {
    return { status: "passed", fixCount: 0, fixedPaths: [] };
  }

  let totalFixes = 0;
  let lastDetectedError: string | undefined;
  let lastFixSummary: string | undefined;
  let detectedErrorPath: string | undefined;
  const allFixedPaths = new Set<string>();

  cb.startVerification();

  try {
    // ─── Phase 0: Deterministic pre-validation ─────────────────────────
    cb.addLog("Running pre-validation checks...");
    try {
      const preResult = preValidate(completedFiles, allFiles, writeFile);

      for (const fix of preResult.autoFixed) {
        cb.addLog(`Auto-fixed: ${fix}`);
        totalFixes++;
      }

      if (preResult.unresolvedErrors.length > 0) {
        cb.addLog(`Pre-validation found ${preResult.unresolvedErrors.length} issue(s)`);
        lastDetectedError = preResult.unresolvedErrors.join("\n");
      }

      // If pre-validation auto-fixed anything, wait for Sandpack to re-settle
      if (preResult.autoFixed.length > 0) {
        cb.addLog("Waiting for auto-fixes to take effect...");
        try {
          await waitForSandpackSettle(pageId, 15000, signal);
          await sleep(1000, signal);
        } catch (err) {
          if ((err as Error).name === "AbortError") throw err;
        }
      }
    } catch (err) {
      if ((err as Error).name === "AbortError") throw err;
      console.warn("[screenshot-repair] Pre-validation failed, continuing:", err);
    }

    // ─── Phase 1: Settle + detect errors ───────────────────────────────
    cb.setCapturing();
    cb.addLog("Waiting for Sandpack to compile...");

    try {
      await waitForSandpackSettle(pageId, 15000, signal);
    } catch (err) {
      if ((err as Error).name === "AbortError") throw err;
      cb.addLog("Sandpack settle timeout — checking anyway");
    }

    await sleep(POST_SETTLE_DELAY_MS, signal);

    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

    cb.addLog("Checking for errors...");
    let detectedError = await detectErrors(pageId, signal);

    // ─── Phase 2: No error = pass ──────────────────────────────────────
    if (!detectedError) {
      cb.addLog(totalFixes > 0 ? `Verified after ${totalFixes} fix(es)` : "No errors detected");
      cb.setPassed();
      return {
        status: totalFixes > 0 ? "fixed" : "passed",
        fixCount: totalFixes,
        fixedPaths: [...allFixedPaths],
        lastError: lastDetectedError,
        fixSummary: lastFixSummary,
      };
    }

    // ─── Phase 3: Dep timing + deterministic syntax fix ────────────────
    lastDetectedError = detectedError;
    cb.addLog(`Error detected: ${detectedError.slice(0, 150)}`);

    // Extract error file path early for cross-page ownership
    const errorFileMatch = detectedError.match(/(?:\/[^\s:|]+\.(?:tsx?|jsx?|js))/);
    if (errorFileMatch) {
      detectedErrorPath = errorFileMatch[0];
    }

    // Dependency timing: wait for Sandpack to install deps already in package.json
    let depWaitCount = 0;
    while (
      isDependencyError(detectedError, allFiles) &&
      depWaitCount < MAX_DEP_WAITS
    ) {
      depWaitCount++;
      cb.addLog(`Dependency still installing — waiting (${depWaitCount}/${MAX_DEP_WAITS})...`);
      await sleep(DEP_INSTALL_WAIT_MS, signal);
      try {
        await waitForSandpackSettle(pageId, 15000, signal);
      } catch (err) {
        if ((err as Error).name === "AbortError") throw err;
      }
      await sleep(POST_SETTLE_DELAY_MS, signal);
      detectedError = await detectErrors(pageId, signal);
      if (!detectedError) {
        cb.addLog(totalFixes > 0 ? `Verified after ${totalFixes} fix(es)` : "No errors detected");
        cb.setPassed();
        return {
          status: totalFixes > 0 ? "fixed" : "passed",
          fixCount: totalFixes,
          fixedPaths: [...allFixedPaths],
          lastError: lastDetectedError,
          fixSummary: lastFixSummary,
        };
      }
      lastDetectedError = detectedError;
    }

    // Deterministic syntax fix (one attempt)
    if (detectedError.includes("SyntaxError")) {
      const deterministicFix = tryDeterministicSyntaxFix(detectedError, allFiles);
      if (deterministicFix) {
        cb.addLog(`Deterministic fix: ${deterministicFix.description}`);
        writeFile(deterministicFix.filePath, deterministicFix.fixedCode);
        allFiles[deterministicFix.filePath] = deterministicFix.fixedCode;
        writtenFiles[deterministicFix.filePath] = deterministicFix.fixedCode;
        totalFixes++;
        allFixedPaths.add(deterministicFix.filePath);
        lastFixSummary = `Deterministic fix: ${deterministicFix.description} in ${deterministicFix.filePath}`;

        // Re-check after deterministic fix
        try {
          await waitForSandpackSettle(pageId, 15000, signal);
        } catch (err) {
          if ((err as Error).name === "AbortError") throw err;
        }
        await sleep(POST_SETTLE_DELAY_MS, signal);
        detectedError = await detectErrors(pageId, signal);
        if (!detectedError) {
          cb.addLog(`Verified after deterministic fix`);
          cb.setPassed();
          return {
            status: "fixed",
            fixCount: totalFixes,
            fixedPaths: [...allFixedPaths],
            lastError: lastDetectedError,
            fixSummary: lastFixSummary,
            detectedErrorPath,
          };
        }
        lastDetectedError = detectedError;
      }
    }

    // ─── Phase 4: Screenshot capture ───────────────────────────────────
    cb.setCapturing();
    cb.addLog("Capturing error screenshot...");

    // Poll for visible error text in the iframe (wait for error overlay to render)
    const visibleError = await pollForVisibleError(pageId, {
      maxWaitMs: 2000,
      intervalMs: 250,
      signal,
    }).catch(() => null);

    // Use visible error text if richer than what Sandpack store reported
    if (visibleError && visibleError.length > (detectedError?.length ?? 0)) {
      detectedError = visibleError;
      lastDetectedError = visibleError;
    }

    // Capture screenshot
    const screenshotDataUrl = await captureIframeScreenshot(pageId, 3000);
    if (screenshotDataUrl) {
      cb.addLog("Screenshot captured");
    } else {
      cb.addLog("Screenshot capture timed out — proceeding with error text only");
    }

    // ─── Phase 5: AI repair request ────────────────────────────────────
    cb.setReviewing();
    cb.addLog("Sending error to AI for screenshot-assisted repair...");

    // Enrich error with source context
    const enrichedError = enrichSyntaxError(detectedError!, allFiles);

    // Promote cross-page file to primary context
    if (detectedErrorPath && allFiles[detectedErrorPath] && !writtenFiles[detectedErrorPath]) {
      writtenFiles[detectedErrorPath] = allFiles[detectedErrorPath];
      cb.addLog(`Promoted ${detectedErrorPath} to primary context (cross-page error)`);
    }

    const vfsFilePaths = Object.keys(allFiles);
    const availableExports = buildExportsMap(allFiles);

    let verifyResult: {
      status: string;
      issues?: string[];
      fixCode?: string;
    };

    try {
      const response = await fetch("/api/repair-screenshot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          files: writtenFiles,
          contextFiles: allFiles,
          modelId,
          errorText: enrichedError,
          screenshotDataUrl: screenshotDataUrl || undefined,
          vfsFilePaths,
          availableExports,
        }),
        signal,
      });

      if (!response.ok) {
        const errorBody = await response.text().catch(() => "");
        console.warn(`[screenshot-repair] API returned HTTP ${response.status}:`, errorBody.slice(0, 300));
        cb.setFailed([`API error: HTTP ${response.status}`]);
        return {
          status: "failed",
          fixCount: totalFixes,
          fixedPaths: [...allFixedPaths],
          lastError: lastDetectedError,
          fixSummary: lastFixSummary,
          detectedErrorPath,
        };
      }

      verifyResult = await response.json();
    } catch (err) {
      if ((err as Error).name === "AbortError") throw err;
      console.warn("[screenshot-repair] API call failed:", err);
      cb.setFailed([`Repair API error: ${(err as Error).message || "unknown"}`]);
      return {
        status: "failed",
        fixCount: totalFixes,
        fixedPaths: [...allFixedPaths],
        lastError: lastDetectedError,
        fixSummary: lastFixSummary,
        detectedErrorPath,
      };
    }

    // ─── Phase 6: Apply fix ────────────────────────────────────────────
    const issues = verifyResult.issues || [detectedError!.slice(0, 120)];
    cb.addLog(`AI found: ${issues[0]}`);

    if (!verifyResult.fixCode) {
      cb.addLog("No fix code returned by AI");
      cb.setFailed(issues);
      return {
        status: "failed",
        fixCount: totalFixes,
        fixedPaths: [...allFixedPaths],
        lastError: lastDetectedError,
        fixSummary: lastFixSummary,
        detectedErrorPath,
      };
    }

    cb.setFixing(issues);
    const fixBlocks = extractCodeBlocks(verifyResult.fixCode);

    if (fixBlocks.length === 0) {
      cb.addLog("No code blocks in AI response");
      cb.setFailed(issues);
      return {
        status: "failed",
        fixCount: totalFixes,
        fixedPaths: [...allFixedPaths],
        lastError: lastDetectedError,
        fixSummary: lastFixSummary,
        detectedErrorPath,
      };
    }

    const fixedPaths: string[] = [];
    for (const block of fixBlocks) {
      const candidateContent = block.content;

      // Run gatekeeper + React import
      const gated = runGatekeeper(candidateContent, allFiles, block.path);
      let finalContent = gated.code;

      const ext = block.path.split(".").pop() || "";
      if (ext === "tsx" || ext === "jsx") {
        finalContent = ensureReactImport(finalContent);
      }

      // Parse validation: reject if final content doesn't parse
      if (!canBabelParse(finalContent)) {
        cb.addLog(`AI fix for ${block.path} still fails parse — rejecting write`);
        continue;
      }

      writeFile(block.path, finalContent);
      writtenFiles[block.path] = finalContent;
      allFiles[block.path] = finalContent;
      totalFixes++;
      fixedPaths.push(block.path);
      allFixedPaths.add(block.path);
    }

    if (fixedPaths.length === 0) {
      cb.addLog("No valid fixes applied");
      cb.setFailed(issues);
      return {
        status: "failed",
        fixCount: totalFixes,
        fixedPaths: [...allFixedPaths],
        lastError: lastDetectedError,
        fixSummary: lastFixSummary,
        detectedErrorPath,
      };
    }

    lastFixSummary = `Fixed ${fixedPaths.join(", ")} (${issues[0] || "unknown issue"})`;
    cb.addLog(`Fix applied to ${fixedPaths.join(", ")}, re-checking...`);

    // ─── Phase 7: Post-fix re-check ────────────────────────────────────
    try {
      await waitForSandpackSettle(pageId, 15000, signal);
    } catch (err) {
      if ((err as Error).name === "AbortError") throw err;
      cb.addLog("Post-fix settle timeout — checking anyway");
    }

    await sleep(POST_SETTLE_DELAY_MS, signal);

    const postFixError = await detectErrors(pageId, signal);
    if (postFixError) {
      cb.addLog(`Still broken after repair: ${postFixError.slice(0, 150)}`);
      cb.setFailed([postFixError.slice(0, 120)]);
      return {
        status: "failed",
        fixCount: totalFixes,
        fixedPaths: [...allFixedPaths],
        lastError: postFixError,
        fixSummary: lastFixSummary,
        detectedErrorPath,
      };
    }

    cb.addLog(`Verified after screenshot repair (${totalFixes} fix(es))`);
    cb.setPassed();
    return {
      status: "fixed",
      fixCount: totalFixes,
      fixedPaths: [...allFixedPaths],
      lastError: lastDetectedError,
      fixSummary: lastFixSummary,
      detectedErrorPath,
    };
  } catch (err) {
    if ((err as Error).name === "AbortError") {
      // Rethrow so the caller (processVerificationQueue / stopVerification)
      // controls how to handle the abort — never silently return "passed".
      // Do NOT call cb.reset() here: the caller (e.g. stopVerification) has
      // already set the page to "Stopped by user" / verify_failed, and
      // resetting would clear that state.
      throw err;
    }
    console.error("[screenshot-repair] Unexpected error:", err);
    cb.setFailed([`Unexpected error: ${(err as Error).message || "unknown"}`]);
    return {
      status: "failed",
      fixCount: 0,
      fixedPaths: [...allFixedPaths],
      lastError: lastDetectedError,
      detectedErrorPath,
    };
  }
}
