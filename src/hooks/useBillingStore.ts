"use client";

import { create } from "zustand";

interface BillingStore {
  limitModalOpen: boolean;
  limitReason: string;
  showLimitModal: (reason: string) => void;
  closeLimitModal: () => void;
}

export const useBillingStore = create<BillingStore>((set) => ({
  limitModalOpen: false,
  limitReason: "",
  showLimitModal: (reason) => set({ limitModalOpen: true, limitReason: reason }),
  closeLimitModal: () => set({ limitModalOpen: false, limitReason: "" }),
}));
