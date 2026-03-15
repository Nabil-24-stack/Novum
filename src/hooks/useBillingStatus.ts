"use client";

import { create } from "zustand";
import type { BillingStatus } from "@/lib/billing/types";

interface BillingStatusState {
  status: BillingStatus | null;
  isLoading: boolean;
  refresh: () => Promise<void>;
}

export const useBillingStatus = create<BillingStatusState>((set) => {
  const refresh = async () => {
    try {
      const res = await fetch("/api/billing/status");
      if (res.ok) {
        const data = await res.json();
        set({ status: data });
      }
    } catch {
      // Silently fail — billing status is non-critical
    } finally {
      set({ isLoading: false });
    }
  };

  // Auto-fetch on module load (client-side only)
  if (typeof window !== "undefined") {
    setTimeout(() => refresh(), 0);

    // Live-update when builds/chat complete (dedup rapid events within 500ms)
    let lastRefreshTriggeredAt = 0;
    window.addEventListener("billing:usage-changed", () => {
      const now = Date.now();
      if (now - lastRefreshTriggeredAt < 500) return;
      lastRefreshTriggeredAt = now;
      refresh();
    });

    // Refresh when user returns to this tab (e.g. after Stripe checkout in new tab)
    let lastVisibilityRefreshAt = 0;
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") {
        const now = Date.now();
        if (now - lastVisibilityRefreshAt > 5000) {
          lastVisibilityRefreshAt = now;
          refresh();
        }
      }
    });
  }

  return {
    status: null,
    isLoading: true,
    refresh,
  };
});

/**
 * Dispatch this after any action that changes usage (build, chat, etc.).
 * Pass `{ delayedRefetch: true }` when the server records usage asynchronously
 * (fire-and-forget) so the client re-fetches after the DB has been updated.
 */
let delayedRefetchTimers: ReturnType<typeof setTimeout>[] = [];

export function notifyUsageChanged(options?: { delayedRefetch?: boolean }) {
  if (typeof window === "undefined") return;

  window.dispatchEvent(new Event("billing:usage-changed"));

  if (options?.delayedRefetch) {
    // Clear any pending delayed refetches to avoid stacking
    delayedRefetchTimers.forEach(clearTimeout);
    delayedRefetchTimers = [];

    for (const delay of [2000, 5000]) {
      delayedRefetchTimers.push(
        setTimeout(() => {
          window.dispatchEvent(new Event("billing:usage-changed"));
        }, delay)
      );
    }
  }
}
