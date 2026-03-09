import { create } from "zustand";

export interface SandpackErrorEntry {
  error: {
    message: string;
    line?: number;
    column?: number;
    path?: string;
    title?: string;
  } | null;
  status: string; // "initial" | "idle" | "running" | "timeout" | "done"
  lastSettledAt: number; // timestamp when status last became "idle"
}

interface SandpackErrorStore {
  entries: Record<string, SandpackErrorEntry>;
  setEntry: (key: string, entry: SandpackErrorEntry) => void;
  removeEntry: (key: string) => void;
  getError: (key?: string) => SandpackErrorEntry | null;
}

export const useSandpackErrorStore = create<SandpackErrorStore>((set, get) => ({
  entries: {},

  setEntry: (key, entry) =>
    set((s) => ({
      entries: { ...s.entries, [key]: entry },
    })),

  removeEntry: (key) =>
    set((s) => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { [key]: _, ...rest } = s.entries;
      return { entries: rest };
    }),

  getError: (key) => {
    const k = key || "prototype";
    return get().entries[k] ?? null;
  },
}));

/**
 * Wait for a Sandpack instance to settle (status === "idle") by polling the store.
 * Returns when settled or throws on timeout.
 */
export function waitForSandpackSettle(
  key?: string,
  timeoutMs = 15000,
  signal?: AbortSignal
): Promise<void> {
  const k = key || "prototype";
  const POLL_INTERVAL = 300;

  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }

    const start = Date.now();

    const check = () => {
      if (signal?.aborted) {
        reject(new DOMException("Aborted", "AbortError"));
        return;
      }

      const entry = useSandpackErrorStore.getState().entries[k];

      // Settled = status is "idle"
      if (entry?.status === "idle") {
        resolve();
        return;
      }

      // Timeout
      if (Date.now() - start > timeoutMs) {
        // Resolve anyway — don't block verification, just proceed with whatever state we have
        console.warn(`[SandpackErrorStore] waitForSettle timed out after ${timeoutMs}ms for key "${k}"`);
        resolve();
        return;
      }

      setTimeout(check, POLL_INTERVAL);
    };

    // Small initial delay to let file writes propagate to Sandpack
    setTimeout(check, 500);

    signal?.addEventListener(
      "abort",
      () => reject(new DOMException("Aborted", "AbortError")),
      { once: true }
    );
  });
}
