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

    // Live-update when builds/chat complete
    window.addEventListener("billing:usage-changed", () => {
      refresh();
    });

    // Refresh when user returns to this tab (e.g. after Stripe checkout in new tab)
    let lastRefreshAt = 0;
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") {
        const now = Date.now();
        if (now - lastRefreshAt > 5000) {
          lastRefreshAt = now;
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

/** Dispatch this after any action that changes usage (build, chat, etc.) */
export function notifyUsageChanged() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("billing:usage-changed"));
  }
}
