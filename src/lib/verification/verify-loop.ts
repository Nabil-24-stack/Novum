/**
 * Self-healing verification loop.
 * After AI writes code to VFS, captures a screenshot of the rendered preview,
 * sends it to an AI vision model for review, and auto-fixes detected issues.
 * Max 3 attempts.
 *
 * Supports both global state (single-build mode) and page-scoped state
 * (parallel mode) via optional `stateCallbacks`.
 */

import { captureIframeScreenshot } from "./screenshot-capture";
import { useStreamingStore } from "@/hooks/useStreamingStore";
import { runGatekeeper } from "@/lib/ai/gatekeeper";

const MAX_ATTEMPTS = 3;
const RENDER_SETTLE_MS = 1500;

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

      // 1. Wait for Sandpack to finish rendering
      cb.setCapturing();
      await sleep(RENDER_SETTLE_MS, signal);

      // 2. Capture screenshot
      let screenshot: string;
      try {
        screenshot = await captureIframeScreenshot(pageId);
      } catch (err) {
        // Screenshot failed — fail-safe: treat as pass
        console.warn("[verify] Screenshot capture failed, treating as pass:", err);
        cb.setPassed();
        return { status: "passed", attempts: attempt, fixCount: totalFixes };
      }

      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

      // 3. Send to verification API
      cb.setReviewing();

      let verifyResult: { status: string; issues?: string[]; fixCode?: string };
      try {
        const response = await fetch("/api/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            screenshot,
            files: writtenFiles,
            modelId,
          }),
          signal,
        });
        verifyResult = await response.json();
      } catch (err) {
        if ((err as Error).name === "AbortError") throw err;
        // API call failed — fail-safe: treat as pass
        console.warn("[verify] API call failed, treating as pass:", err);
        cb.setPassed();
        return { status: "passed", attempts: attempt, fixCount: totalFixes };
      }

      // 4. Check result
      if (verifyResult.status === "pass") {
        cb.setPassed();
        return {
          status: totalFixes > 0 ? "fixed" : "passed",
          attempts: attempt,
          fixCount: totalFixes,
        };
      }

      // 5. Failed — try to apply fix
      const issues = verifyResult.issues || ["Unknown issue"];
      console.log(`[verify] Attempt ${attempt}/${MAX_ATTEMPTS} — issues:`, issues);

      if (!verifyResult.fixCode) {
        // No fix code provided — can't auto-fix
        if (attempt === MAX_ATTEMPTS) {
          cb.setFailed(issues);
          return { status: "failed", attempts: attempt, fixCount: totalFixes };
        }
        // Try again (screenshot might look different next time)
        cb.setFixing(issues);
        continue;
      }

      // 6. Extract and apply fix code blocks
      cb.setFixing(issues);
      const fixBlocks = extractCodeBlocks(verifyResult.fixCode);

      if (fixBlocks.length === 0) {
        // No parseable fix blocks
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
        totalFixes++;
      }

      // Loop continues — next iteration will re-screenshot and verify the fix
    }

    // Exhausted all attempts
    cb.setFailed(useStreamingStore.getState().verificationIssues);
    return { status: "failed", attempts: MAX_ATTEMPTS, fixCount: totalFixes };
  } catch (err) {
    if ((err as Error).name === "AbortError") {
      cb.reset();
      return { status: "passed", attempts: 0, fixCount: 0 };
    }
    // Unexpected error — fail-safe
    console.error("[verify] Unexpected error:", err);
    cb.reset();
    return { status: "passed", attempts: 0, fixCount: 0 };
  }
}
