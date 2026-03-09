"use client";

import { useStreamingStore } from "@/hooks/useStreamingStore";
import { Loader2, Check, AlertTriangle } from "lucide-react";

/**
 * Subtle verification status indicator overlaid on the Frame preview.
 * Shows checking/fixing/passed/failed states during auto-fix loop.
 */
export function VerificationIndicator() {
  const status = useStreamingStore((s) => s.verificationStatus);
  const attempt = useStreamingStore((s) => s.verificationAttempt);

  if (status === "idle") return null;

  return (
    <div className="absolute top-2 right-2 z-50 pointer-events-none">
      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium shadow-sm backdrop-blur-sm">
        {(status === "capturing" || status === "reviewing") && (
          <>
            <Loader2 className="w-3 h-3 animate-spin text-blue-500" />
            <span className="text-blue-700 bg-blue-50/90 px-2 py-0.5 rounded-full">
              Checking...
            </span>
          </>
        )}
        {status === "fixing" && (
          <>
            <Loader2 className="w-3 h-3 animate-spin text-amber-500" />
            <span className="text-amber-700 bg-amber-50/90 px-2 py-0.5 rounded-full">
              Fixing ({attempt}/3)...
            </span>
          </>
        )}
        {status === "passed" && (
          <>
            <Check className="w-3 h-3 text-emerald-500" />
            <span className="text-emerald-700 bg-emerald-50/90 px-2 py-0.5 rounded-full">
              Verified
            </span>
          </>
        )}
        {status === "failed" && (
          <>
            <AlertTriangle className="w-3 h-3 text-red-500" />
            <span className="text-red-700 bg-red-50/90 px-2 py-0.5 rounded-full">
              Issues found
            </span>
          </>
        )}
      </div>
    </div>
  );
}
