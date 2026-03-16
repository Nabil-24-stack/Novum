"use client";

import { create } from "zustand";

interface BillingStore {
  limitModalOpen: boolean;
  limitReason: string;
  /** Stays true after modal is closed — disables chat input until billing refreshes or page reload */
  billingLimitReached: boolean;
  showLimitModal: (reason: string) => void;
  closeLimitModal: () => void;
  resetLimit: () => void;
}

export const useBillingStore = create<BillingStore>((set) => ({
  limitModalOpen: false,
  limitReason: "",
  billingLimitReached: false,
  showLimitModal: (reason) => set({ limitModalOpen: true, limitReason: reason, billingLimitReached: true }),
  closeLimitModal: () => set({ limitModalOpen: false }),
  resetLimit: () => set({ billingLimitReached: false }),
}));
