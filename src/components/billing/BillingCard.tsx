"use client";

import { useRouter } from "next/navigation";
import { useBillingStatus } from "@/hooks/useBillingStatus";
import { Loader2, Zap, Crown } from "lucide-react";

export function BillingCard() {
  const router = useRouter();
  const { status, isLoading } = useBillingStatus();

  if (isLoading) {
    return (
      <div className="bg-white border border-neutral-200 rounded-xl p-4 flex items-center justify-center">
        <Loader2 className="w-4 h-4 animate-spin text-neutral-400" />
      </div>
    );
  }

  if (!status) return null;

  const isPro = status.planTier === "pro";
  const resetDate = status.usageResetAt
    ? new Date(status.usageResetAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })
    : null;

  const warningColor =
    status.warningLevel === "exceeded"
      ? "text-red-600"
      : status.warningLevel === "critical"
        ? "text-orange-600"
        : status.warningLevel === "warn"
          ? "text-amber-600"
          : "text-neutral-600";

  const barColor =
    status.warningLevel === "exceeded"
      ? "bg-red-500"
      : status.warningLevel === "critical"
        ? "bg-orange-500"
        : status.warningLevel === "warn"
          ? "bg-amber-500"
          : "bg-neutral-900";

  const handleUpgrade = () => {
    router.push("/pricing");
  };

  const handleManage = async () => {
    try {
      const res = await fetch("/api/billing/portal", { method: "POST" });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
    } catch {
      // Silently fail
    }
  };

  return (
    <div className="bg-white border border-neutral-200 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {isPro ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-100 text-amber-800 text-xs font-medium rounded-full">
              <Crown className="w-3 h-3" />
              Pro
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-neutral-100 text-neutral-600 text-xs font-medium rounded-full">
              Free
            </span>
          )}
          {status.cancelAtPeriodEnd && (
            <span className="text-xs text-orange-600">Cancels at period end</span>
          )}
        </div>

        {isPro ? (
          <button
            onClick={handleManage}
            className="text-xs text-neutral-500 hover:text-neutral-900 transition-colors"
          >
            Manage subscription
          </button>
        ) : (
          <button
            onClick={handleUpgrade}
            className="inline-flex items-center gap-1 px-3 py-1 bg-neutral-900 text-white text-xs font-medium rounded-lg hover:bg-neutral-800 transition-colors"
          >
            <Zap className="w-3 h-3" />
            Upgrade to Pro
          </button>
        )}
      </div>

      {/* Usage display */}
      {isPro ? (
        <div>
          <div className="flex items-center justify-between text-xs mb-1">
            <span className={warningColor}>
              {status.usagePercent}% of budget used
            </span>
            {resetDate && <span className="text-neutral-400">Resets {resetDate}</span>}
          </div>
          <div className="h-1.5 bg-neutral-100 rounded-full overflow-hidden">
            <div
              className={`h-full ${barColor} rounded-full transition-all`}
              style={{ width: `${Math.min(status.usagePercent, 100)}%` }}
            />
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <div>
            <div className="flex items-center justify-between text-xs mb-1">
              <span className={warningColor}>
                {status.freeGenerationsUsed} / {status.freeGenerationsLimit} builds used
              </span>
              {resetDate && <span className="text-neutral-400">Resets {resetDate}</span>}
            </div>
            <div className="h-1.5 bg-neutral-100 rounded-full overflow-hidden">
              <div
                className={`h-full ${barColor} rounded-full transition-all`}
                style={{ width: `${Math.min(status.usagePercent, 100)}%` }}
              />
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="text-neutral-500">
                {status.freeSharedUsagePercent}% refinement budget used
              </span>
            </div>
            <div className="h-1.5 bg-neutral-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-neutral-400 rounded-full transition-all"
                style={{ width: `${Math.min(status.freeSharedUsagePercent, 100)}%` }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
