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

import { parse } from "@babel/parser";
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
export const POST_SETTLE_DELAY_MS = 500;
/** How long to wait for Sandpack to install a dependency that's already in package.json */
export const DEP_INSTALL_WAIT_MS = 3000;
/** Max retries for server errors (5xx) that don't consume fix attempts */
const MAX_SERVER_ERROR_RETRIES = 2;
/** Cooldown before retrying after a server error */
const SERVER_ERROR_COOLDOWN_MS = 2000;

// Regex to match code blocks with file attribute (same as ChatTab)
const CODE_BLOCK_REGEX = /```(\w+)?\s+file="([^"]+)"\n([\s\S]*?)```/g;

export function extractCodeBlocks(
  text: string
): Array<{ path: string; content: string }> {
  const blocks: Array<{ path: string; content: string }> = [];
  let match;

  while ((match = CODE_BLOCK_REGEX.exec(text)) !== null) {
    const path = match[2].startsWith("/") ? match[2] : `/${match[2]}`;
    // Strip only trailing newline (not arbitrary whitespace) so section boundaries
    // are preserved for focused-mode splicing.
    const content = match[3].replace(/\n$/, "");
    blocks.push({ path, content });
  }

  CODE_BLOCK_REGEX.lastIndex = 0;
  return blocks;
}

// Ensure React star import for Sandpack's classic JSX transform
export function ensureReactImport(code: string): string {
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

/** Try to Babel-parse code. Returns true if it parses without error. */
export function canBabelParse(code: string): boolean {
  try {
    parse(code, { sourceType: "module", plugins: ["typescript", "jsx"] });
    return true;
  } catch {
    return false;
  }
}

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
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
export function isDependencyError(error: string, allFiles: Record<string, string>): boolean {
  // Match both: 'dep-name' and `dep-name` (Sandpack uses varying quote styles)
  const depMatch = error.match(/Could not find dependency:\s*['`"]([^'`"]+)['`"]/);
  if (!depMatch) return false;
  const depName = depMatch[1];

  try {
    const pkg = JSON.parse(allFiles["/package.json"] || "{}");
    return !!(pkg.dependencies?.[depName]);
  } catch {
    return false;
  }
}

/** Max deterministic fix attempts per verification run (prevents infinite loops) */
const MAX_DETERMINISTIC_ATTEMPTS = 2;

/**
 * Attempt to fix a nested-quote JSX attribute on a single line.
 * Pattern: attr="text "inner" text" → attr={`text "inner" text`}
 *
 * Finds the attribute whose value spans the error column, then wraps
 * the value in a JSX expression with a template literal.
 */
function tryFixNestedQuotesInJSXAttr(
  line: string,
  errorCol: number
): string | null {
  // Find the `="` that opens the attribute containing the error
  const beforeError = line.substring(0, errorCol);
  const attrStart = beforeError.lastIndexOf('="');
  if (attrStart === -1) return null;

  // Find the attribute name before `="`
  const nameMatch = line.substring(0, attrStart).match(/(\w[\w-]*)$/);
  if (!nameMatch) return null;

  const attrNameStart = attrStart - nameMatch[1].length;
  const valueStart = attrStart + 2; // position after `="`

  // Find the true closing quote: the last `"` before `>`, `/>`, or a new attribute
  const rest = line.substring(valueStart);
  const closingPattern = /"(?=\s+[\w-]+=|\s*\/?>|\s*$)/g;
  let lastClosing: RegExpExecArray | null = null;
  let closingMatch: RegExpExecArray | null;
  while ((closingMatch = closingPattern.exec(rest)) !== null) {
    lastClosing = closingMatch;
  }
  if (!lastClosing) return null;

  const valueEnd = valueStart + lastClosing.index;
  const rawValue = line.substring(valueStart, valueEnd);

  // Only proceed if the raw value contains double quotes (confirms nested quote issue)
  if (!rawValue.includes('"')) return null;

  // Escape backticks in the value if any, then wrap in template literal
  const escaped = rawValue.replace(/`/g, "\\`").replace(/\$/g, "\\$");
  const attrName = nameMatch[1];
  const replacement = `${attrName}={\`${escaped}\`}`;

  return (
    line.substring(0, attrNameStart) +
    replacement +
    line.substring(valueEnd + 1) // +1 to skip the closing `"`
  );
}

/**
 * Attempt to fix nested quotes inside a JS string literal (not JSX attribute).
 * Pattern: "text "inner" text" inside arrays/objects → `text "inner" text`
 *
 * Finds the outer extent of the intended string around the Babel error column,
 * converts to a template literal, and returns the full fixed code (or null).
 */
function tryFixNestedQuotesInStringLiteral(
  lines: string[],
  errLine: number,
  errCol: number
): string | null {
  const line = lines[errLine];
  if (!line) return null;

  // Collect all unescaped double-quote positions on this line
  const quotePositions: number[] = [];
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '"' && (i === 0 || line[i - 1] !== "\\")) {
      quotePositions.push(i);
    }
  }

  // Need at least 4 quotes for a nested-quote issue: open "..." inner "..." close
  if (quotePositions.length < 4) return null;

  // Find the opening quote: the last " before errCol that could start a string literal.
  // It should be preceded by a value-start character: [ ( : , = { + or start of line.
  let openIdx = -1;
  for (const pos of quotePositions) {
    if (pos >= errCol) break;
    const before = line.substring(0, pos).trimEnd();
    const lastChar = before.length > 0 ? before[before.length - 1] : "";
    if (!lastChar || /[[(=:,{+]/.test(lastChar)) {
      openIdx = pos;
    }
  }

  if (openIdx === -1) return null;

  // Find the true closing quote: the last " followed by a valid string-end context.
  // Valid terminators: , ] ) } ; or end of meaningful content.
  let closeIdx = -1;
  for (let i = quotePositions.length - 1; i >= 0; i--) {
    const pos = quotePositions[i];
    if (pos <= openIdx) break;
    const afterQuote = line.substring(pos + 1).trimStart();
    const nextChar = afterQuote.length > 0 ? afterQuote[0] : "";
    if (!nextChar || /[,\]});]/.test(nextChar)) {
      closeIdx = pos;
      break;
    }
  }

  if (closeIdx <= openIdx) return null;

  const innerContent = line.substring(openIdx + 1, closeIdx);

  // Must contain nested quotes to be a nested-quote issue
  if (!innerContent.includes('"')) return null;

  // Build template literal replacement, escaping ` and $
  const escaped = innerContent.replace(/`/g, "\\`").replace(/\$/g, "\\$");
  const fixedLine =
    line.substring(0, openIdx) + "`" + escaped + "`" + line.substring(closeIdx + 1);

  const fixedLines = [...lines];
  fixedLines[errLine] = fixedLine;
  return fixedLines.join("\n");
}

/**
 * Attempt to fix common syntax errors deterministically, without an AI call.
 * Returns the fixed code if successful, or null if the error can't be fixed.
 *
 * Every fix is verified by re-parsing with Babel — if the fix doesn't
 * resolve the parse error, null is returned and the AI path is used.
 */
export function tryDeterministicSyntaxFix(
  error: string,
  allFiles: Record<string, string>
): { filePath: string; fixedCode: string; description: string } | null {
  if (!error.includes("SyntaxError")) return null;

  const loc = parseSyntaxErrorLocation(error);
  if (!loc) return null;

  const code = allFiles[loc.filePath];
  if (!code) return null;

  // Parse with Babel to get precise error info
  interface ParseErrorLoc {
    message: string;
    loc?: { line: number; column: number };
  }
  let parseError: ParseErrorLoc | null = null;
  try {
    parse(code, {
      sourceType: "module",
      plugins: ["typescript", "jsx"],
    });
    return null; // No parse error — Sandpack may have a different parser
  } catch (err) {
    parseError = err as ParseErrorLoc;
  }

  if (!parseError?.loc) return null;

  const lines = code.split("\n");
  const errLine = parseError.loc.line - 1; // 0-indexed
  const errCol = parseError.loc.column; // 0-indexed

  // --- Fix 1: Nested quotes in JSX attribute ---
  // e.g. placeholder="text "quoted" text" → placeholder={`text "quoted" text`}
  if (parseError.message.includes("Unexpected token")) {
    const line = lines[errLine];
    if (line) {
      const fixedLine = tryFixNestedQuotesInJSXAttr(line, errCol);
      if (fixedLine && fixedLine !== line) {
        const fixedLines = [...lines];
        fixedLines[errLine] = fixedLine;
        const fixedCode = fixedLines.join("\n");
        try {
          parse(fixedCode, {
            sourceType: "module",
            plugins: ["typescript", "jsx"],
          });
          return {
            filePath: loc.filePath,
            fixedCode,
            description: "Fixed nested quotes in JSX attribute",
          };
        } catch {
          // Fix didn't resolve the error
        }
      }
    }
  }

  // --- Fix 2: Unterminated string literal ---
  if (parseError.message.includes("Unterminated string")) {
    const line = lines[errLine];
    if (line) {
      const doubleQuotes = (line.match(/(?<!\\)"/g) || []).length;
      if (doubleQuotes % 2 !== 0) {
        const fixedLines = [...lines];
        fixedLines[errLine] = line + '"';
        const fixedCode = fixedLines.join("\n");
        try {
          parse(fixedCode, {
            sourceType: "module",
            plugins: ["typescript", "jsx"],
          });
          return {
            filePath: loc.filePath,
            fixedCode,
            description: "Added missing closing quote",
          };
        } catch {
          // Fix didn't resolve the error
        }
      }
    }
  }

  // --- Fix 3: Nested quotes in JS string literal (not JSX) ---
  // e.g. "text "inner" text" in arrays/objects → `text "inner" text`
  if (parseError.message.includes("Unexpected token")) {
    const fixedCode = tryFixNestedQuotesInStringLiteral(lines, errLine, errCol);
    if (fixedCode) {
      if (canBabelParse(fixedCode)) {
        return {
          filePath: loc.filePath,
          fixedCode,
          description: "Fixed nested quotes in string literal (converted to template literal)",
        };
      }
    }
  }

  return null;
}

export interface VerificationResult {
  status: "passed" | "fixed" | "failed";
  attempts: number;
  fixCount: number;
  fixedPaths: string[];
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
  operationId?: string;
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

/** Format a Sandpack error entry into a human-readable error string. */
function formatSandpackError(entry: import("@/hooks/useSandpackErrorStore").SandpackErrorEntry): string {
  let message = entry.error!.message;
  const syntaxErrorMatch = message.match(/SyntaxError:\s*(.+)/);
  if (syntaxErrorMatch) {
    message = `SyntaxError: ${syntaxErrorMatch[1]}`;
  }
  const parts = [message];
  if (entry.error!.path) parts.push(`File: ${entry.error!.path}`);
  if (entry.error!.line) parts.push(`Line: ${entry.error!.line}`);
  if (entry.error!.title && !syntaxErrorMatch) parts.unshift(entry.error!.title);
  return parts.join(" | ");
}

/**
 * Detect errors using a layered approach:
 * 1. Sandpack native error (compilation/bundler) — most reliable
 * 2. Iframe DOM scanning (runtime errors) — catches what Sandpack misses
 */
export async function detectErrors(
  pageId?: string,
  signal?: AbortSignal
): Promise<string | null> {
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

  const storeKey = pageId || "prototype";

  // Layer 1: Check Sandpack native errors from global store.
  // All Sandpack frames compile the same App.tsx bundle, so a syntax error in
  // any file surfaces across all frames.  Check the page-scoped entry first,
  // then scan all other entries to catch errors another frame surfaced before
  // the current page's frame finished bundling.
  const allEntries = useSandpackErrorStore.getState().entries;
  const primaryEntry = allEntries[storeKey];
  const primarySettledAt = primaryEntry?.lastSettledAt ?? 0;

  // Check the primary (page-scoped) entry first — it was waited on by
  // waitForSandpackSettle so it reflects the latest bundle state.
  if (primaryEntry?.error) {
    return formatSandpackError(primaryEntry);
  }

  // Scan other entries as a safety net, but only trust those that:
  // 1. Have status "idle" (finished bundling — not still running with stale state)
  // 2. Settled at least as recently as the primary entry (same bundle generation)
  for (const key of Object.keys(allEntries)) {
    if (key === storeKey) continue;
    const entry = allEntries[key];
    if (
      entry?.error &&
      entry.status === "idle" &&
      entry.lastSettledAt >= primarySettledAt
    ) {
      return formatSandpackError(entry);
    }
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

/**
 * Parse a syntax error to extract file path and line number.
 * Returns null if the error doesn't match known syntax error patterns.
 */
function parseSyntaxErrorLocation(
  error: string
): { filePath: string; line: number } | null {
  // Only match actual SyntaxErrors, not dependency/runtime errors
  if (!error.includes("SyntaxError")) return null;

  const fileMatch = error.match(/(\/[^\s:|]+\.(?:tsx?|jsx?|js))/);
  const locMatch = error.match(/\((\d+):(\d+)\)/);
  if (!fileMatch || !locMatch) return null;
  return { filePath: fileMatch[1], line: parseInt(locMatch[1]) };
}

/** Min file size (lines) to trigger focused section mode */
const FOCUSED_MODE_THRESHOLD = 200;
/** Lines to include before the error in focused section */
const FOCUSED_LINES_BEFORE = 60;
/** Lines to include after the error in focused section */
const FOCUSED_LINES_AFTER = 40;

/**
 * Enrich a syntax error message with the relevant source lines.
 * Helps the AI immediately see the broken code.
 */
export function enrichSyntaxError(
  error: string,
  files: Record<string, string>
): string {
  // Match file path like /path/file.tsx
  const fileMatch = error.match(/(?:\/[^\s:|]+\.(?:tsx?|jsx?|js))/);
  // Match line:col patterns like (210:84) or (line 210, col 84)
  const lineMatch =
    error.match(/\((\d+):(\d+)\)/) ||
    error.match(/\(line\s+(\d+),\s*col\s+(\d+)\)/);
  if (!fileMatch || !lineMatch) return error;

  const filePath = fileMatch[0];
  const lineNum = parseInt(lineMatch[1], 10);
  const code = files[filePath];
  if (!code) return error;

  const lines = code.split("\n");
  const start = Math.max(0, lineNum - 3);
  const end = Math.min(lines.length, lineNum + 2);
  const context = lines
    .slice(start, end)
    .map(
      (l, i) =>
        `${start + i + 1 === lineNum ? ">" : " "} ${start + i + 1} | ${l}`
    )
    .join("\n");

  return `${error}\n\nSource context:\n${context}`;
}

export async function runVerificationLoop(
  params: VerificationParams
): Promise<VerificationResult> {
  const {
    completedFiles,
    allFiles,
    writeFile,
    operationId,
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
    return { status: "passed", attempts: 0, fixCount: 0, fixedPaths: [] };
  }

  let totalFixes = 0;
  let lastDetectedError: string | undefined;
  let lastFixSummary: string | undefined;
  const allFixedPaths = new Set<string>();

  cb.startVerification();

  // Files for which focused mode has been disabled (bad splice / parse failure)
  const focusedModeDisabledFor = new Set<string>();

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
    let serverErrorRetries = 0;
    let deterministicAttempts = 0;

    attemptLoop:
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
          fixedPaths: [...allFixedPaths],
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

      // --- Phase 3.5: Deterministic syntax fix attempt ---
      // Try to fix syntax errors without a slow AI API call
      if (
        detectedError.includes("SyntaxError") &&
        deterministicAttempts < MAX_DETERMINISTIC_ATTEMPTS
      ) {
        const deterministicFix = tryDeterministicSyntaxFix(
          detectedError,
          allFiles
        );
        if (deterministicFix) {
          deterministicAttempts++;
          cb.addLog(
            `Deterministic fix: ${deterministicFix.description}`
          );
          writeFile(deterministicFix.filePath, deterministicFix.fixedCode);
          allFiles[deterministicFix.filePath] =
            deterministicFix.fixedCode;
          writtenFiles[deterministicFix.filePath] =
            deterministicFix.fixedCode;
          totalFixes++;
          allFixedPaths.add(deterministicFix.filePath);
          lastFixSummary = `Deterministic fix: ${deterministicFix.description} in ${deterministicFix.filePath}`;
          attempt--; // Don't consume an AI fix attempt
          continue; // Re-check for errors
        }
      }

      cb.setReviewing();
      cb.addLog(`Sending error to AI for fix (attempt ${attempt}/${MAX_ATTEMPTS})...`);

      // Enrich syntax errors with source context lines
      let enrichedError = enrichSyntaxError(detectedError, allFiles);

      // Promote any file referenced in the error to primary AI context.
      // In parallel builds the error may reference a different page's file
      // imported via App.tsx — the AI needs it as primary context, not buried
      // in the extra-context section with a 60s route limit.
      const errorFileMatch = detectedError.match(/(?:\/[^\s:|]+\.(?:tsx?|jsx?|js))/);
      if (errorFileMatch) {
        const errorFilePath = errorFileMatch[0];
        if (allFiles[errorFilePath] && !writtenFiles[errorFilePath]) {
          writtenFiles[errorFilePath] = allFiles[errorFilePath];
          cb.addLog(`Promoted ${errorFilePath} to primary context (cross-page error)`);
        }
      }

      // --- Focused section mode for syntax errors in large files ---
      // Instead of sending a 1000-line file to the AI (causing 504 timeouts),
      // send only ~100 lines around the error. The AI fixes the section,
      // and we splice it back into the original file.
      let focusedSection: {
        filePath: string;
        startLine: number;
        endLine: number;
        fullLineCount: number;
      } | null = null;
      let apiFiles = writtenFiles;

      const syntaxLoc = parseSyntaxErrorLocation(detectedError);
      if (syntaxLoc && allFiles[syntaxLoc.filePath]) {
        const fileLines = allFiles[syntaxLoc.filePath].split("\n");
        if (
          fileLines.length > FOCUSED_MODE_THRESHOLD &&
          !focusedModeDisabledFor.has(syntaxLoc.filePath)
        ) {
          const startLine = Math.max(0, syntaxLoc.line - FOCUSED_LINES_BEFORE);
          const endLine = Math.min(
            fileLines.length,
            syntaxLoc.line + FOCUSED_LINES_AFTER
          );
          const section = fileLines.slice(startLine, endLine).join("\n");

          apiFiles = { ...writtenFiles, [syntaxLoc.filePath]: section };
          enrichedError += `\n\nIMPORTANT: The code below shows ONLY lines ${startLine + 1}\u2013${endLine} of ${syntaxLoc.filePath} (the full file is ${fileLines.length} lines). Fix the syntax error within this section. Return ONLY the fixed section as the code block \u2014 do NOT add imports or other code outside the shown range.`;

          focusedSection = {
            filePath: syntaxLoc.filePath,
            startLine,
            endLine,
            fullLineCount: fileLines.length,
          };
          cb.addLog(
            `Using focused mode: lines ${startLine + 1}\u2013${endLine} of ${syntaxLoc.filePath}`
          );
        }
      }

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
            files: apiFiles,
            contextFiles: allFiles,
            operationId,
            errorText: enrichedError,
            vfsFilePaths,
            availableExports,
            // Pass focused context so the route can strengthen the contract
            ...(focusedSection ? {
              focusedContext: {
                filePath: focusedSection.filePath,
                startLine: focusedSection.startLine,
                endLine: focusedSection.endLine,
                fullLineCount: focusedSection.fullLineCount,
              },
            } : {}),
          }),
          signal,
        });

        if (!response.ok) {
          const errorBody = await response.text().catch(() => "");
          console.warn(`[verify] API returned HTTP ${response.status}:`, errorBody.slice(0, 300));

          // Server errors (5xx) mean the API never returned a fix — don't waste a fix attempt
          if (response.status >= 500 && serverErrorRetries < MAX_SERVER_ERROR_RETRIES) {
            serverErrorRetries++;
            attempt--; // Don't consume an AI fix attempt
            cb.addLog(`Server error (HTTP ${response.status}) — retrying (${serverErrorRetries}/${MAX_SERVER_ERROR_RETRIES})...`);
            await sleep(SERVER_ERROR_COOLDOWN_MS, signal);
            continue;
          }

          if (attempt === MAX_ATTEMPTS) {
            cb.setFailed([`API error: HTTP ${response.status}`]);
            return {
              status: "failed",
              attempts: attempt,
              fixCount: totalFixes,
              fixedPaths: [...allFixedPaths],
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

        // Network errors also don't consume fix attempts (same as server errors)
        if (serverErrorRetries < MAX_SERVER_ERROR_RETRIES) {
          serverErrorRetries++;
          attempt--;
          cb.addLog(`Network error — retrying (${serverErrorRetries}/${MAX_SERVER_ERROR_RETRIES})...`);
          await sleep(SERVER_ERROR_COOLDOWN_MS, signal);
          continue;
        }

        if (attempt === MAX_ATTEMPTS) {
          cb.setFailed([
            `Verify API error: ${(err as Error).message || "unknown"}`,
          ]);
          return {
            status: "failed",
            attempts: attempt,
            fixCount: totalFixes,
            fixedPaths: [...allFixedPaths],
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
        // Focused mode produced no fix — fall back to whole-file before burning attempt
        if (focusedSection) {
          cb.addLog("No fix returned in focused mode — falling back to whole-file mode");
          focusedModeDisabledFor.add(focusedSection.filePath);
          attempt--; // Don't consume an attempt — infrastructure failure
          continue attemptLoop;
        }
        if (attempt === MAX_ATTEMPTS) {
          cb.addLog("Could not fix all issues");
          cb.setFailed(issues);
          return {
            status: "failed",
            attempts: attempt,
            fixCount: totalFixes,
            fixedPaths: [...allFixedPaths],
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
        // Focused mode produced no code blocks — fall back to whole-file
        if (focusedSection) {
          cb.addLog("No code blocks in focused mode response — falling back to whole-file mode");
          focusedModeDisabledFor.add(focusedSection.filePath);
          attempt--;
          continue attemptLoop;
        }
        if (attempt === MAX_ATTEMPTS) {
          cb.setFailed(issues);
          return {
            status: "failed",
            attempts: attempt,
            fixCount: totalFixes,
            fixedPaths: [...allFixedPaths],
            lastError: lastDetectedError,
            fixSummary: lastFixSummary,
          };
        }
        continue;
      }

      const fixedPaths: string[] = [];
      let focusedFileHandled = false;
      for (const block of fixBlocks) {
        let candidateContent = block.content;

        // In focused mode, skip blocks targeting unrelated files — the model
        // should only fix the focused file.  Writing an unrelated file from a
        // focused context is almost certainly wrong.
        if (focusedSection && block.path !== focusedSection.filePath) {
          cb.addLog(`Skipping block for ${block.path} — focused mode targets ${focusedSection.filePath}`);
          continue;
        }

        // --- Focused-mode splice ---
        if (focusedSection && block.path === focusedSection.filePath) {
          focusedFileHandled = true;
          const originalCode = allFiles[block.path];
          if (!originalCode) continue;
          const originalLines = originalCode.split("\n");
          const fixedSectionLines = candidateContent.split("\n");
          const merged = [...originalLines];
          merged.splice(
            focusedSection.startLine,
            focusedSection.endLine - focusedSection.startLine,
            ...fixedSectionLines
          );
          candidateContent = merged.join("\n");

          // Validate the merged file parses
          if (!canBabelParse(candidateContent)) {
            cb.addLog("Focused fix rejected — merged file still fails parse");
            cb.addLog("Falling back to whole-file mode");
            focusedModeDisabledFor.add(block.path);
            attempt--; // Don't consume an attempt — infrastructure failure
            continue attemptLoop; // Retry with whole-file context
          }

          cb.addLog("Spliced focused fix back into full file");
        }

        // --- Gatekeeper + React import ---
        const gated = runGatekeeper(candidateContent, allFiles, block.path);
        let finalContent = gated.code;

        const ext = block.path.split(".").pop() || "";
        if (ext === "tsx" || ext === "jsx") {
          finalContent = ensureReactImport(finalContent);
        }

        // --- Parse-safe validation: reject if final content doesn't parse ---
        if (!canBabelParse(finalContent)) {
          cb.addLog(`AI fix for ${block.path} still fails parse — rejecting write`);
          if (focusedSection && block.path === focusedSection.filePath) {
            // Focused-file fix broke after gatekeeper — fall back to whole-file
            cb.addLog("Falling back to whole-file mode");
            focusedModeDisabledFor.add(block.path);
            attempt--;
            continue attemptLoop;
          }
          continue; // Skip this block — don't write, don't mutate allFiles
        }

        writeFile(block.path, finalContent);

        // Update the tracked files for next iteration
        writtenFiles[block.path] = finalContent;
        allFiles[block.path] = finalContent;
        totalFixes++;
        fixedPaths.push(block.path);
        allFixedPaths.add(block.path);
      }

      // If focused mode was active but no fix was applied for the focused file
      // (all blocks targeted wrong file, or parse validation rejected them all),
      // fall back to whole-file mode without consuming the attempt.
      if (focusedSection && !focusedFileHandled) {
        cb.addLog("No valid fix for focused file — falling back to whole-file mode");
        focusedModeDisabledFor.add(focusedSection.filePath);
        attempt--;
        continue attemptLoop;
      }

      if (fixedPaths.length > 0) {
        lastFixSummary = `Fixed ${fixedPaths.join(", ")} (${issues[0] || "unknown issue"})`;
        cb.addLog(
          `Fix applied (attempt ${attempt}/${MAX_ATTEMPTS}), re-checking...`
        );
      } else {
        cb.addLog(
          `No valid fixes applied (attempt ${attempt}/${MAX_ATTEMPTS})`
        );
      }

      // Loop continues — next iteration will re-check for errors after fix
    }

    // Exhausted all attempts
    cb.addLog("Could not fix all issues");
    cb.setFailed(["Exhausted all verification attempts"]);
    return {
      status: "failed",
      attempts: MAX_ATTEMPTS,
      fixCount: totalFixes,
      fixedPaths: [...allFixedPaths],
      lastError: lastDetectedError,
      fixSummary: lastFixSummary,
    };
  } catch (err) {
    if ((err as Error).name === "AbortError") {
      cb.reset();
      return { status: "passed", attempts: 0, fixCount: 0, fixedPaths: [] };
    }
    // Unexpected error — mark as failed so the UI doesn't show a green checkmark
    console.error("[verify] Unexpected error:", err);
    cb.setFailed([`Unexpected error: ${(err as Error).message || "unknown"}`]);
    return {
      status: "failed",
      attempts: 0,
      fixCount: 0,
      fixedPaths: [...allFixedPaths],
      lastError: lastDetectedError,
    };
  }
}
