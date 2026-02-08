import { useMemo } from "react";
import { instrumentCode } from "@/lib/ast/instrument";

interface UseInstrumentedFilesReturn {
  /** Shadow files with data-source-loc attributes injected (for Sandpack) */
  shadowFiles: Record<string, string>;
  /** Any instrumentation errors keyed by file path */
  instrumentationErrors: Record<string, string>;
}

// Module-level cache (persists across renders, cleared on HMR)
const instrumentationCache = new Map<string, { content: string; result: string }>();

/**
 * Generates "shadow" versions of VFS files with data-source-loc attributes
 * injected on every JSX element. These instrumented files are fed to Sandpack
 * while the original clean files remain pristine for editing.
 *
 * Uses a module-level cache to avoid re-instrumenting unchanged files.
 */
export function useInstrumentedFiles(
  files: Record<string, string>
): UseInstrumentedFilesReturn {
  return useMemo(() => {
    const shadowFiles: Record<string, string> = {};
    const instrumentationErrors: Record<string, string> = {};

    for (const [path, content] of Object.entries(files)) {
      // Only instrument .tsx and .jsx files
      if (path.endsWith(".tsx") || path.endsWith(".jsx")) {
        // Check cache first
        const cached = instrumentationCache.get(path);
        if (cached && cached.content === content) {
          shadowFiles[path] = cached.result;
          continue;
        }

        // Instrument the file
        const result = instrumentCode(content, path);
        shadowFiles[path] = result.code;

        // Update cache
        instrumentationCache.set(path, { content, result: result.code });

        if (!result.success && result.error) {
          instrumentationErrors[path] = result.error;
        }
      } else {
        // Pass through non-JSX files unchanged
        shadowFiles[path] = content;
      }
    }

    return { shadowFiles, instrumentationErrors };
  }, [files]);
}
