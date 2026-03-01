/**
 * Self-healing verification loop.
 * After AI writes code to VFS, waits for Sandpack HMR to settle,
 * then programmatically checks the iframe for runtime errors.
 * If an error is found, sends it to an AI for a fix. Max 3 attempts.
 *
 * No screenshots or vision models — purely text-based detection + fix.
 *
 * Supports both global state (single-build mode) and page-scoped state
 * (parallel mode) via optional `stateCallbacks`.
 */

import { queryIframeErrors } from "./screenshot-capture";
import { useStreamingStore } from "@/hooks/useStreamingStore";
import { runGatekeeper } from "@/lib/ai/gatekeeper";

const MAX_ATTEMPTS = 3;
/** Settle time for Sandpack HMR after file writes */
const SETTLE_DELAY_MS = 3000;
/** Delay between re-checks after applying a fix */
const RECHECK_DELAY_MS = 2000;
/** Timeout for error query postMessage round-trip */
const ERROR_QUERY_TIMEOUT_MS = 3000;

// Regex to match code blocks with file attribute (same as ChatTab)
const CODE_BLOCK_REGEX = /```(\w+)?\s+file="([^"]+)"\n([\s\S]*?)```/g;

function extractCodeBlocks(text: string): Array<{ path: string; content: string }> {
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
  if (/import\s+\*\s+as\s+React\s+from\s+["']react["']/.test(code)) return code;
  if (/import\s+\{[^}]*\}\s+from\s+["']react["']/.test(code)) {
    return code.replace(
      /import\s+\{([^}]*)\}\s+from\s+["']react["']/,
      'import * as React from "react";\nimport {$1} from "react"'
    );
  }
  return 'import * as React from "react";\n' + code;
}

export interface VerificationResult {
  status: "passed" | "fixed" | "failed";
  attempts: number;
  fixCount: number;
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

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    }, { once: true });
  });
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

export async function runVerificationLoop(
  params: VerificationParams
): Promise<VerificationResult> {
  const { completedFiles, allFiles, writeFile, modelId, pageId, signal, stateCallbacks } = params;
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

  cb.startVerification();

  try {
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

      // 1. Wait for Sandpack HMR to settle
      cb.setCapturing();
      cb.addLog("Waiting for page to render...");

      const delayMs = attempt === 1 ? SETTLE_DELAY_MS : RECHECK_DELAY_MS;
      await sleep(delayMs, signal);

      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

      // 2. Check for runtime errors programmatically
      let detectedError: string | null = null;
      try {
        detectedError = await queryIframeErrors(pageId, ERROR_QUERY_TIMEOUT_MS);
      } catch {
        // Query failed — assume no errors
      }

      // 3. No error detected — page is good
      if (!detectedError) {
        cb.addLog(totalFixes > 0 ? `Verified after ${totalFixes} fix(es)` : "No errors detected");
        cb.setPassed();
        return {
          status: totalFixes > 0 ? "fixed" : "passed",
          attempts: attempt,
          fixCount: totalFixes,
        };
      }

      // 4. Error detected — send to AI for fix
      cb.addLog(`Error detected: ${detectedError.slice(0, 100)}`);
      cb.setReviewing();
      cb.addLog("Sending error to AI for fix...");

      let verifyResult: { status: string; issues?: string[]; fixCode?: string };
      try {
        const response = await fetch("/api/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            files: writtenFiles,
            contextFiles: allFiles,
            modelId,
            errorText: detectedError,
          }),
          signal,
        });
        verifyResult = await response.json();
      } catch (err) {
        if ((err as Error).name === "AbortError") throw err;
        console.warn("[verify] API call failed:", err);
        if (attempt === MAX_ATTEMPTS) {
          cb.setFailed([`Verify API error: ${(err as Error).message || "unknown"}`]);
          return { status: "failed", attempts: attempt, fixCount: totalFixes };
        }
        cb.addLog(`API call failed (attempt ${attempt}/${MAX_ATTEMPTS}), retrying...`);
        continue;
      }

      // 5. Extract and apply fix
      const issues = verifyResult.issues || [detectedError.slice(0, 120)];
      console.log(`[verify] Attempt ${attempt}/${MAX_ATTEMPTS} — issues:`, issues);
      cb.addLog(`AI found: ${issues[0]}`);

      if (!verifyResult.fixCode) {
        if (attempt === MAX_ATTEMPTS) {
          cb.addLog("Could not fix all issues");
          cb.setFailed(issues);
          return { status: "failed", attempts: attempt, fixCount: totalFixes };
        }
        cb.setFixing(issues);
        continue;
      }

      cb.setFixing(issues);
      const fixBlocks = extractCodeBlocks(verifyResult.fixCode);

      if (fixBlocks.length === 0) {
        if (attempt === MAX_ATTEMPTS) {
          cb.setFailed(issues);
          return { status: "failed", attempts: attempt, fixCount: totalFixes };
        }
        continue;
      }

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
      }

      cb.addLog(`Fix applied (attempt ${attempt}/${MAX_ATTEMPTS}), re-checking...`);

      // Loop continues — next iteration will re-check for errors after fix
    }

    // Exhausted all attempts
    cb.addLog("Could not fix all issues");
    cb.setFailed(["Exhausted all verification attempts"]);
    return { status: "failed", attempts: MAX_ATTEMPTS, fixCount: totalFixes };
  } catch (err) {
    if ((err as Error).name === "AbortError") {
      cb.reset();
      return { status: "passed", attempts: 0, fixCount: 0 };
    }
    // Unexpected error — mark as failed so the UI doesn't show a green checkmark
    console.error("[verify] Unexpected error:", err);
    cb.setFailed([`Unexpected error: ${(err as Error).message || "unknown"}`]);
    return { status: "failed", attempts: 0, fixCount: 0 };
  }
}
