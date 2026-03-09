/**
 * Self-healing verification loop.
 * After AI writes code to VFS, detects errors and auto-fixes them.
 *
 * Error detection strategy (layered):
 * 1. Deterministic pre-validation (missing imports, missing deps)
 * 2. Sandpack native error API (compilation/bundler errors via global store)
 * 3. Iframe DOM scanning (runtime errors via postMessage)
 *
 * Max 3 attempts. Supports both global and page-scoped state.
 */

import { queryIframeErrors } from "./screenshot-capture";
import { preValidate, buildExportsMap } from "./pre-validator";
import {
  useSandpackErrorStore,
  waitForSandpackSettle,
} from "@/hooks/useSandpackErrorStore";
import { useStreamingStore } from "@/hooks/useStreamingStore";
import { runGatekeeper } from "@/lib/ai/gatekeeper";

const MAX_ATTEMPTS = 3;
/** Max number of times to wait for a dependency that's already in package.json */
const MAX_DEP_WAITS = 3;
/** Timeout for iframe error query postMessage round-trip */
const ERROR_QUERY_TIMEOUT_MS = 3000;
/** Extra delay after Sandpack settles before checking errors (lets DOM render) */
const POST_SETTLE_DELAY_MS = 500;
/** How long to wait for Sandpack to install a dependency that's already in package.json */
const DEP_INSTALL_WAIT_MS = 3000;

// Regex to match code blocks with file attribute (same as ChatTab)
const CODE_BLOCK_REGEX = /```(\w+)?\s+file="([^"]+)"\n([\s\S]*?)```/g;

function extractCodeBlocks(
  text: string
): Array<{ path: string; content: string }> {
  const blocks: Array<{ path: string; content: string }> = [];
  let match;

  while ((match = CODE_BLOCK_REGEX.exec(text)) !== null) {
    const path = match[2].startsWith("/") ? match[2] : `/${match[2]}`;
    const content = match[3].trim();
    blocks.push({ path, content });
  }

  CODE_BLOCK_REGEX.lastIndex = 0;
  return blocks;
}

// Ensure React star import for Sandpack's classic JSX transform
function ensureReactImport(code: string): string {
  if (/import\s+\*\s+as\s+React\s+from\s+["']react["']/.test(code))
    return code;
  if (/import\s+\{[^}]*\}\s+from\s+["']react["']/.test(code)) {
    return code.replace(
      /import\s+\{([^}]*)\}\s+from\s+["']react["']/,
      'import * as React from "react";\nimport {$1} from "react"'
    );
  }
  return 'import * as React from "react";\n' + code;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true }
    );
  });
}

/**
 * Check if an error is a missing dependency that's already in package.json.
 * This means Sandpack just needs more time to install it — not a code fix issue.
 */
function isDependencyError(error: string, allFiles: Record<string, string>): boolean {
  const depMatch = error.match(/Could not find dependency:\s*'([^']+)'/);
  if (!depMatch) return false;
  const depName = depMatch[1];

  try {
    const pkg = JSON.parse(allFiles["/package.json"] || "{}");
    return !!(pkg.dependencies?.[depName]);
  } catch {
    return false;
  }
}

export interface VerificationResult {
  status: "passed" | "fixed" | "failed";
  attempts: number;
  fixCount: number;
  lastError?: string;
  fixSummary?: string;
}

/** Callbacks for updating verification state. Allows page-scoped state in parallel mode. */
export interface VerificationStateCallbacks {
  startVerification: () => void;
  setCapturing: () => void;
  setReviewing: () => void;
  setFixing: (issues: string[]) => void;
  setPassed: () => void;
  setFailed: (issues: string[]) => void;
  reset: () => void;
  addLog: (message: string) => void;
}

export interface VerificationParams {
  completedFiles: string[];
  allFiles: Record<string, string>;
  writeFile: (path: string, content: string) => void;
  modelId: string;
  pageId?: string;
  signal?: AbortSignal;
  /** Optional: page-scoped state callbacks for parallel mode. Falls back to global store. */
  stateCallbacks?: VerificationStateCallbacks;
}

/** Build default state callbacks that update the global streaming store. */
function globalCallbacks(): VerificationStateCallbacks {
  const store = useStreamingStore.getState();
  return {
    startVerification: () => store.startVerification(),
    setCapturing: () => store.setVerificationCapturing(),
    setReviewing: () => store.setVerificationReviewing(),
    setFixing: (issues) => store.setVerificationFixing(issues),
    setPassed: () => store.setVerificationPassed(),
    setFailed: (issues) => store.setVerificationFailed(issues),
    reset: () => store.resetVerification(),
    addLog: (message) => console.log(`[verify] ${message}`),
  };
}

/**
 * Detect errors using a layered approach:
 * 1. Sandpack native error (compilation/bundler) — most reliable
 * 2. Iframe DOM scanning (runtime errors) — catches what Sandpack misses
 */
async function detectErrors(
  pageId?: string,
  signal?: AbortSignal
): Promise<string | null> {
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

  const storeKey = pageId || "prototype";

  // Layer 1: Check Sandpack native error from global store
  const entry = useSandpackErrorStore.getState().entries[storeKey];
  if (entry?.error) {
    const parts = [entry.error.message];
    if (entry.error.path) parts.push(`File: ${entry.error.path}`);
    if (entry.error.line) parts.push(`Line: ${entry.error.line}`);
    if (entry.error.title) parts.unshift(entry.error.title);
    return parts.join(" | ");
  }

  // Layer 2: Query iframe for runtime errors (DOM text scanning)
  try {
    const runtimeError = await queryIframeErrors(pageId, ERROR_QUERY_TIMEOUT_MS);
    if (runtimeError) return runtimeError;
  } catch {
    // Query failed — assume no runtime errors
  }

  return null;
}

export async function runVerificationLoop(
  params: VerificationParams
): Promise<VerificationResult> {
  const {
    completedFiles,
    allFiles,
    writeFile,
    modelId,
    pageId,
    signal,
    stateCallbacks,
  } = params;
  const cb = stateCallbacks ?? globalCallbacks();

  // Build the files map of what was written (for context to the AI)
  const writtenFiles: Record<string, string> = {};
  for (const filePath of completedFiles) {
    if (allFiles[filePath]) {
      writtenFiles[filePath] = allFiles[filePath];
    }
  }

  if (Object.keys(writtenFiles).length === 0) {
    return { status: "passed", attempts: 0, fixCount: 0 };
  }

  let totalFixes = 0;
  let lastDetectedError: string | undefined;
  let lastFixSummary: string | undefined;

  cb.startVerification();

  try {
    // --- Phase 0: Deterministic pre-validation ---
    cb.addLog("Running pre-validation checks...");
    try {
      const preResult = preValidate(completedFiles, allFiles, writeFile);

      for (const fix of preResult.autoFixed) {
        cb.addLog(`Auto-fixed: ${fix}`);
        totalFixes++;
      }

      // If there are unresolved errors from pre-validation, include them
      // as context for the AI fix loop (they'll be detected as Sandpack errors too,
      // but having precise messages helps the AI)
      if (preResult.unresolvedErrors.length > 0) {
        cb.addLog(
          `Pre-validation found ${preResult.unresolvedErrors.length} issue(s)`
        );
        // Store for later use in AI context
        lastDetectedError = preResult.unresolvedErrors.join("\n");
      }
      // If pre-validation auto-fixed anything (especially deps), wait for Sandpack to re-settle
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
      console.warn("[verify] Pre-validation failed, continuing:", err);
    }

    let depWaitCount = 0;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

      // --- Phase 1: Wait for Sandpack to settle ---
      cb.setCapturing();
      cb.addLog(
        attempt === 1
          ? "Waiting for Sandpack to compile..."
          : "Re-checking after fix..."
      );

      // Use status-based waiting instead of fixed timer
      try {
        await waitForSandpackSettle(pageId, 15000, signal);
      } catch (err) {
        if ((err as Error).name === "AbortError") throw err;
        cb.addLog("Sandpack settle timeout — checking anyway");
      }

      // Small extra delay for DOM to render after bundle completes
      await sleep(POST_SETTLE_DELAY_MS, signal);

      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

      // --- Phase 2: Detect errors (layered) ---
      cb.addLog("Checking for errors...");
      const detectedError = await detectErrors(pageId, signal);

      // --- Phase 3: No error — success ---
      if (!detectedError) {
        cb.addLog(
          totalFixes > 0
            ? `Verified after ${totalFixes} fix(es)`
            : "No errors detected"
        );
        cb.setPassed();
        return {
          status: totalFixes > 0 ? "fixed" : "passed",
          attempts: attempt,
          fixCount: totalFixes,
          lastError: lastDetectedError,
          fixSummary: lastFixSummary,
        };
      }

      // --- Phase 4: Error detected — check if dependency timing issue first ---
      lastDetectedError = detectedError;
      cb.addLog(`Error detected: ${detectedError.slice(0, 150)}`);

      // If this is a dependency error and the dep is already in package.json,
      // Sandpack just needs more time to install it — don't waste an AI attempt
      if (isDependencyError(detectedError, allFiles) && depWaitCount < MAX_DEP_WAITS) {
        depWaitCount++;
        cb.addLog(`Dependency still installing — waiting (${depWaitCount}/${MAX_DEP_WAITS})...`);
        await sleep(DEP_INSTALL_WAIT_MS, signal);
        attempt--; // Don't consume an AI fix attempt for dep timing issues
        continue;
      }

      cb.setReviewing();
      cb.addLog(`Sending error to AI for fix (attempt ${attempt}/${MAX_ATTEMPTS})...`);

      // Build rich context for the AI
      const vfsFilePaths = Object.keys(allFiles);
      const availableExports = buildExportsMap(allFiles);

      let verifyResult: {
        status: string;
        issues?: string[];
        fixCode?: string;
      };
      try {
        const response = await fetch("/api/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            files: writtenFiles,
            contextFiles: allFiles,
            modelId,
            errorText: detectedError,
            vfsFilePaths,
            availableExports,
          }),
          signal,
        });

        if (!response.ok) {
          const errorBody = await response.text().catch(() => "");
          console.warn(`[verify] API returned HTTP ${response.status}:`, errorBody.slice(0, 300));
          if (attempt === MAX_ATTEMPTS) {
            cb.setFailed([`API error: HTTP ${response.status}`]);
            return {
              status: "failed",
              attempts: attempt,
              fixCount: totalFixes,
              lastError: lastDetectedError,
              fixSummary: lastFixSummary,
            };
          }
          cb.addLog(`API error (HTTP ${response.status}), attempt ${attempt}/${MAX_ATTEMPTS}`);
          continue;
        }

        verifyResult = await response.json();
      } catch (err) {
        if ((err as Error).name === "AbortError") throw err;
        console.warn("[verify] API call failed:", err);
        if (attempt === MAX_ATTEMPTS) {
          cb.setFailed([
            `Verify API error: ${(err as Error).message || "unknown"}`,
          ]);
          return {
            status: "failed",
            attempts: attempt,
            fixCount: totalFixes,
            lastError: lastDetectedError,
            fixSummary: lastFixSummary,
          };
        }
        cb.addLog(
          `API call failed (attempt ${attempt}/${MAX_ATTEMPTS}), retrying...`
        );
        continue;
      }

      // --- Phase 5: Extract and apply fix ---
      const issues = verifyResult.issues || [detectedError.slice(0, 120)];
      console.log(
        `[verify] Attempt ${attempt}/${MAX_ATTEMPTS} — issues:`,
        issues
      );
      cb.addLog(`AI found: ${issues[0]}`);

      if (!verifyResult.fixCode) {
        if (attempt === MAX_ATTEMPTS) {
          cb.addLog("Could not fix all issues");
          cb.setFailed(issues);
          return {
            status: "failed",
            attempts: attempt,
            fixCount: totalFixes,
            lastError: lastDetectedError,
            fixSummary: lastFixSummary,
          };
        }
        cb.setFixing(issues);
        continue;
      }

      cb.setFixing(issues);
      const fixBlocks = extractCodeBlocks(verifyResult.fixCode);

      if (fixBlocks.length === 0) {
        if (attempt === MAX_ATTEMPTS) {
          cb.setFailed(issues);
          return {
            status: "failed",
            attempts: attempt,
            fixCount: totalFixes,
            lastError: lastDetectedError,
            fixSummary: lastFixSummary,
          };
        }
        continue;
      }

      const fixedPaths: string[] = [];
      for (const block of fixBlocks) {
        // Run through gatekeeper (same as ChatTab)
        const gated = runGatekeeper(block.content, allFiles, block.path);
        let finalContent = gated.code;

        // Ensure React import for .tsx/.jsx files (Sandpack classic transform)
        const ext = block.path.split(".").pop() || "";
        if (ext === "tsx" || ext === "jsx") {
          finalContent = ensureReactImport(finalContent);
        }

        writeFile(block.path, finalContent);

        // Update the tracked files for next iteration
        writtenFiles[block.path] = finalContent;
        allFiles[block.path] = finalContent;
        totalFixes++;
        fixedPaths.push(block.path);
      }

      lastFixSummary = `Fixed ${fixedPaths.join(", ")} (${issues[0] || "unknown issue"})`;
      cb.addLog(
        `Fix applied (attempt ${attempt}/${MAX_ATTEMPTS}), re-checking...`
      );

      // Loop continues — next iteration will re-check for errors after fix
    }

    // Exhausted all attempts
    cb.addLog("Could not fix all issues");
    cb.setFailed(["Exhausted all verification attempts"]);
    return {
      status: "failed",
      attempts: MAX_ATTEMPTS,
      fixCount: totalFixes,
      lastError: lastDetectedError,
      fixSummary: lastFixSummary,
    };
  } catch (err) {
    if ((err as Error).name === "AbortError") {
      cb.reset();
      return { status: "passed", attempts: 0, fixCount: 0 };
    }
    // Unexpected error — mark as failed so the UI doesn't show a green checkmark
    console.error("[verify] Unexpected error:", err);
    cb.setFailed([`Unexpected error: ${(err as Error).message || "unknown"}`]);
    return {
      status: "failed",
      attempts: 0,
      fixCount: 0,
      lastError: lastDetectedError,
    };
  }
}
