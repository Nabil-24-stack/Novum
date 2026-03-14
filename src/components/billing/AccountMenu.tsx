"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Zap, Loader2 } from "lucide-react";
import { useBillingStatus } from "@/hooks/useBillingStatus";
import { createClient } from "@/lib/supabase/client";

interface AccountMenuProps {
  /** Extra classes on the wrapper div (use to override positioning) */
  className?: string;
  /** Show the Upgrade pill button next to the name (default: true) */
  showUpgradePill?: boolean;
}

export function AccountMenu({ className, showUpgradePill = true }: AccountMenuProps) {
  const router = useRouter();
  const { status } = useBillingStatus();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const [upgradeLoadingSource, setUpgradeLoadingSource] = useState<"pill" | "dropdown" | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userName, setUserName] = useState<string | null>(null);

  const isPro = status?.planTier === "pro";
  const initial = userName?.charAt(0).toUpperCase() ?? "";

  const resetDate = status?.usageResetAt
    ? new Date(status.usageResetAt).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : null;

  // Fetch user info
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      const email = user?.email ?? null;
      setUserEmail(email);
      const fullName = user?.user_metadata?.full_name || user?.user_metadata?.name;
      if (fullName) {
        setUserName(fullName);
      } else if (email) {
        const local = email.split("@")[0].split(/[._-]/)[0];
        setUserName(local.charAt(0).toUpperCase() + local.slice(1));
      }
    });
  }, []);

  // Close on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const handleUpgrade = async (source: "pill" | "dropdown") => {
    setUpgradeLoadingSource(source);
    try {
      const res = await fetch("/api/billing/checkout", { method: "POST" });
      const data = await res.json();
      if (data.url) {
        window.open(data.url, "_blank");
      } else {
        console.error("[AccountMenu] Checkout response missing URL:", data);
      }
    } catch (err) {
      console.error("[AccountMenu] Checkout error:", err);
    } finally {
      setUpgradeLoadingSource(null);
    }
  };

  const handleManage = async () => {
    try {
      const res = await fetch("/api/billing/portal", { method: "POST" });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        console.error("[AccountMenu] Portal response missing URL:", data);
      }
    } catch (err) {
      console.error("[AccountMenu] Portal error:", err);
    }
  };

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  };

  if (!userName) return null;

  return (
    <div ref={menuRef} className={className ?? "fixed top-0 right-0 p-4 z-50 flex items-center gap-2"}>
      {/* Upgrade pill (only on dashboard for free users) */}
      {showUpgradePill && !isPro && status && (
        <button
          onClick={() => handleUpgrade("pill")}
          disabled={upgradeLoadingSource !== null}
          className="inline-flex items-center gap-1.5 px-4 py-2 bg-neutral-900 text-white text-sm font-medium rounded-full hover:bg-neutral-800 transition-colors disabled:opacity-70"
        >
          {upgradeLoadingSource === "pill" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
          Upgrade
        </button>
      )}

      {/* Avatar trigger */}
      <button
        onClick={() => setOpen(!open)}
        className="w-8 h-8 rounded-full bg-neutral-400 text-white flex items-center justify-center text-sm font-semibold hover:bg-neutral-500 transition-colors"
      >
        {initial}
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute top-full right-0 mt-1 w-72 bg-white rounded-2xl shadow-lg border border-neutral-200 overflow-hidden z-[100]">
          {/* User info */}
          <div className="flex items-center gap-3 p-4">
            <div className="w-10 h-10 rounded-full bg-neutral-400 text-white flex items-center justify-center text-sm font-semibold shrink-0">
              {initial}
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-neutral-900 truncate">{userName}</div>
              <div className="text-xs text-neutral-500 truncate">{userEmail}</div>
            </div>
          </div>

          {/* Full-width divider */}
          <div className="border-t border-neutral-200" />

          {/* Usage + plan + actions */}
          {status && (
            <div className="px-4 pt-4 pb-2 space-y-4">
              {isPro ? (
                <div>
                  <div className="text-sm text-neutral-900 mb-2">
                    {status.usagePercent}% budget used
                  </div>
                  <div className="h-2 bg-neutral-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-neutral-300 rounded-full transition-all"
                      style={{ width: `${Math.min(status.usagePercent, 100)}%` }}
                    />
                  </div>
                </div>
              ) : (
                <>
                  <div>
                    <div className="text-sm text-neutral-900 mb-2">
                      {status.freeGenerationsUsed} / {status.freeGenerationsLimit} build used
                    </div>
                    <div className="h-2 bg-neutral-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-neutral-300 rounded-full transition-all"
                        style={{ width: `${Math.min(status.usagePercent, 100)}%` }}
                      />
                    </div>
                  </div>
                  <div>
                    <div className="text-sm text-neutral-900 mb-2">
                      {status.freeSharedUsagePercent}% AI edits used
                    </div>
                    <div className="h-2 bg-neutral-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-neutral-300 rounded-full transition-all"
                        style={{ width: `${Math.min(status.freeSharedUsagePercent, 100)}%` }}
                      />
                    </div>
                  </div>
                </>
              )}

              {/* Plan badge + reset date */}
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center px-3 py-1 bg-neutral-100 text-neutral-600 text-xs font-medium rounded-md">
                  {isPro ? "Pro" : "Free"}
                </span>
                {resetDate && (
                  <span className="text-xs text-neutral-500">Resets {resetDate}</span>
                )}
              </div>

              {/* Action button */}
              {isPro ? (
                <button
                  onClick={handleManage}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 bg-neutral-900 text-white text-sm font-medium rounded-full hover:bg-neutral-800 transition-colors"
                >
                  Manage Subscription
                </button>
              ) : (
                <button
                  onClick={() => handleUpgrade("dropdown")}
                  disabled={upgradeLoadingSource !== null}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 bg-neutral-900 text-white text-sm font-medium rounded-full hover:bg-neutral-800 transition-colors disabled:opacity-70"
                >
                  {upgradeLoadingSource === "dropdown" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                  Upgrade
                </button>
              )}

              <button
                onClick={handleSignOut}
                className="w-full text-sm text-neutral-900 underline underline-offset-2 hover:text-neutral-600 transition-colors py-1"
              >
                Sign out
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
