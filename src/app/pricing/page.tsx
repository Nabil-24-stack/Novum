"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Check, Zap, Loader2, ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useBillingStatus } from "@/hooks/useBillingStatus";

type AuthState = "loading" | "anonymous" | "free" | "pro";

const FREE_FEATURES = [
  "2 app builds per month",
  "Shared AI refinement budget",
  "All design system features",
  "Full visual editor",
  "Token Studio presets",
  "Flow View",
  "Multi-model AI chat",
];

const PRO_FEATURES = [
  "Unlimited builds",
  "$10/month AI budget",
  "Everything in Free, plus:",
  "Priority support",
  "Higher token limits",
  "Advanced strategy tools",
];

export default function PricingPage() {
  const router = useRouter();
  const { status } = useBillingStatus();
  const [authState, setAuthState] = useState<AuthState>("loading");
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [portalLoading, setPortalLoading] = useState(false);

  // Detect auth state
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        setAuthState("anonymous");
      }
    });
  }, []);

  // Sync billing status to auth state
  useEffect(() => {
    if (status) {
      setAuthState(status.planTier === "pro" ? "pro" : "free");
    }
  }, [status]);

  // Override overflow (same pattern as dashboard)
  useEffect(() => {
    document.documentElement.style.overflow = "auto";
    document.body.style.overflow = "auto";
    return () => {
      document.documentElement.style.overflow = "";
      document.body.style.overflow = "";
    };
  }, []);

  const handleCheckout = async () => {
    setCheckoutLoading(true);
    try {
      const res = await fetch("/api/billing/checkout", { method: "POST" });
      const data = await res.json();
      if (data.url) {
        if (data.sessionId) {
          sessionStorage.setItem("novum-stripe-session", data.sessionId);
        }
        window.open(data.url, "_blank");
      }
    } catch {
      // Silently fail
    } finally {
      setCheckoutLoading(false);
    }
  };

  const handlePortal = async () => {
    setPortalLoading(true);
    try {
      const res = await fetch("/api/billing/portal", { method: "POST" });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      }
    } catch {
      // Silently fail
    } finally {
      setPortalLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-neutral-50">
      <div className="max-w-4xl mx-auto px-4 py-16">
        {/* Back link */}
        <button
          onClick={() => router.push("/")}
          className="inline-flex items-center gap-1.5 text-sm text-neutral-500 hover:text-neutral-900 transition-colors mb-12"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>

        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-semibold text-neutral-900 tracking-tight">
            Choose your plan
          </h1>
          <p className="text-neutral-500 mt-3 max-w-md mx-auto">
            Start building for free. Upgrade to Pro for unlimited builds and a
            larger AI budget.
          </p>
        </div>

        {/* Plan cards */}
        <div className="flex flex-col md:flex-row gap-6 max-w-3xl mx-auto">
          {/* Free plan card */}
          <div className="flex-1 bg-white border border-neutral-200 rounded-2xl p-8 flex flex-col">
            <h2 className="text-xl font-semibold text-neutral-900">Free</h2>
            <div className="mt-4 flex items-baseline gap-1">
              <span className="text-4xl font-semibold text-neutral-900">$0</span>
              <span className="text-sm text-neutral-500">/month</span>
            </div>
            <p className="text-sm text-neutral-500 mt-2">
              Get started with the essentials
            </p>

            {/* CTA */}
            <div className="mt-6">
              {authState === "loading" ? (
                <button
                  disabled
                  className="w-full py-3 bg-neutral-100 text-neutral-400 text-sm font-medium rounded-full flex items-center justify-center"
                >
                  <Loader2 className="w-4 h-4 animate-spin" />
                </button>
              ) : authState === "anonymous" ? (
                <button
                  onClick={() => router.push("/login")}
                  className="w-full py-3 border border-neutral-200 text-neutral-600 text-sm font-medium rounded-full hover:bg-neutral-50 transition-colors"
                >
                  Get started
                </button>
              ) : authState === "free" ? (
                <button
                  disabled
                  className="w-full py-3 bg-neutral-100 text-neutral-400 text-sm font-medium rounded-full cursor-default"
                >
                  Current plan
                </button>
              ) : (
                <button
                  onClick={handlePortal}
                  disabled={portalLoading}
                  className="w-full py-3 border border-neutral-200 text-neutral-600 text-sm font-medium rounded-full hover:bg-neutral-50 transition-colors disabled:opacity-70"
                >
                  {portalLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin mx-auto" />
                  ) : (
                    "Downgrade to free plan"
                  )}
                </button>
              )}
            </div>

            {/* Feature list */}
            <div className="border-t border-neutral-200 mt-6 pt-6 space-y-3 flex-1">
              {FREE_FEATURES.map((feature) => (
                <div key={feature} className="flex items-start gap-3">
                  <Check className="w-5 h-5 text-neutral-400 shrink-0 mt-0.5" />
                  <span className="text-sm text-neutral-600">{feature}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Pro plan card */}
          <div className="flex-1 bg-white border border-neutral-900 rounded-2xl p-8 flex flex-col relative">
            {/* Recommended badge */}
            <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-neutral-900 text-white text-xs font-medium rounded-full">
              Recommended
            </span>

            <h2 className="text-xl font-semibold text-neutral-900">Pro</h2>
            <div className="mt-4 flex items-baseline gap-1">
              <span className="text-sm text-neutral-500">A$</span>
              <span className="text-4xl font-semibold text-neutral-900">30</span>
              <span className="text-sm text-neutral-500">/month</span>
            </div>
            <p className="text-sm text-neutral-500 mt-2">
              Unlock unlimited builds and more AI power
            </p>

            {/* CTA */}
            <div className="mt-6">
              {authState === "loading" ? (
                <button
                  disabled
                  className="w-full py-3 bg-neutral-100 text-neutral-400 text-sm font-medium rounded-full flex items-center justify-center"
                >
                  <Loader2 className="w-4 h-4 animate-spin" />
                </button>
              ) : authState === "anonymous" ? (
                <button
                  onClick={() => router.push("/login")}
                  className="w-full py-3 bg-neutral-900 text-white text-sm font-medium rounded-full hover:bg-neutral-800 transition-colors"
                >
                  Get started
                </button>
              ) : authState === "free" ? (
                <button
                  onClick={handleCheckout}
                  disabled={checkoutLoading}
                  className="w-full py-3 bg-neutral-900 text-white text-sm font-medium rounded-full hover:bg-neutral-800 transition-colors disabled:opacity-70 flex items-center justify-center gap-2"
                >
                  {checkoutLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      <Zap className="w-4 h-4" />
                      Choose plan
                    </>
                  )}
                </button>
              ) : (
                <button
                  disabled
                  className="w-full py-3 bg-neutral-100 text-neutral-400 text-sm font-medium rounded-full cursor-default"
                >
                  Current plan
                </button>
              )}
            </div>

            {/* Feature list */}
            <div className="border-t border-neutral-200 mt-6 pt-6 space-y-3 flex-1">
              {PRO_FEATURES.map((feature, i) => (
                <div key={feature} className="flex items-start gap-3">
                  {i === 2 ? (
                    <div className="w-5 shrink-0" />
                  ) : (
                    <Check className="w-5 h-5 text-neutral-900 shrink-0 mt-0.5" />
                  )}
                  <span
                    className={`text-sm ${
                      i === 2
                        ? "text-neutral-400 font-medium"
                        : "text-neutral-600"
                    }`}
                  >
                    {feature}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
