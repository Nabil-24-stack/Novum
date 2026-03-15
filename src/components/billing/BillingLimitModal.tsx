"use client";

import { useRouter } from "next/navigation";
import { useBillingStore } from "@/hooks/useBillingStore";
import { useBillingStatus } from "@/hooks/useBillingStatus";
import { X, Zap } from "lucide-react";

export function BillingLimitModal() {
  const { limitModalOpen, limitReason, closeLimitModal } = useBillingStore();
  const { status } = useBillingStatus();

  const router = useRouter();

  if (!limitModalOpen) return null;

  const isPro = status?.planTier === "pro";
  const resetDate = status?.usageResetAt
    ? new Date(status.usageResetAt).toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    : null;

  const handleUpgrade = () => {
    closeLimitModal();
    router.push("/pricing");
  };

  const handleManage = () => {
    closeLimitModal();
    router.push("/pricing");
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={closeLimitModal} />

      {/* Modal */}
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 p-6">
        <button
          onClick={closeLimitModal}
          className="absolute top-4 right-4 text-neutral-400 hover:text-neutral-600 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="text-center">
          <div className="w-12 h-12 bg-neutral-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Zap className="w-6 h-6 text-neutral-600" />
          </div>

          <h2 className="text-lg font-semibold text-neutral-900 mb-2">
            {isPro ? "Budget Limit Reached" : "Free Plan Limit Reached"}
          </h2>

          <p className="text-sm text-neutral-500 mb-4">
            {limitReason}
          </p>

          {resetDate && (
            <p className="text-xs text-neutral-400 mb-6">
              Your usage resets on {resetDate}
            </p>
          )}

          <div className="flex flex-col gap-2">
            {isPro ? (
              <button
                onClick={handleManage}
                className="w-full px-4 py-2.5 bg-neutral-900 text-white text-sm font-medium rounded-lg hover:bg-neutral-800 transition-colors"
              >
                Manage Subscription
              </button>
            ) : (
              <button
                onClick={handleUpgrade}
                className="w-full px-4 py-2.5 bg-neutral-900 text-white text-sm font-medium rounded-lg hover:bg-neutral-800 transition-colors flex items-center justify-center gap-2"
              >
                <Zap className="w-4 h-4" />
                Upgrade to Pro
              </button>
            )}
            <button
              onClick={closeLimitModal}
              className="w-full px-4 py-2.5 text-neutral-600 text-sm font-medium rounded-lg border border-neutral-200 hover:bg-neutral-50 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
