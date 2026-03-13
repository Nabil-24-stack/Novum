"use client";

import { useBillingStatus } from "@/hooks/useBillingStatus";
import { Crown } from "lucide-react";

export function BillingBadge() {
  const { status, isLoading } = useBillingStatus();

  if (isLoading || !status) return null;

  const isPro = status.planTier === "pro";

  const badgeColor =
    status.warningLevel === "exceeded"
      ? "bg-red-100 text-red-700"
      : status.warningLevel === "critical"
        ? "bg-orange-100 text-orange-700"
        : status.warningLevel === "warn"
          ? "bg-amber-100 text-amber-700"
          : isPro
            ? "bg-amber-100 text-amber-800"
            : "bg-neutral-100 text-neutral-600";

  const label = isPro
    ? `Pro · ${status.usagePercent}%`
    : `${status.freeGenerationsUsed}/${status.freeGenerationsLimit} builds`;

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full ${badgeColor}`}>
      {isPro && <Crown className="w-3 h-3" />}
      {label}
    </span>
  );
}
