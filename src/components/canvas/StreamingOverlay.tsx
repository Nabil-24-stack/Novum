"use client";

import { useEffect, useRef, useSyncExternalStore, useCallback } from "react";
import { useStreamingStore, type VerificationStatus } from "@/hooks/useStreamingStore";

const FADE_DURATION = 400; // ms
const VERIFY_BADGE_VISIBLE_MS = 1500; // how long to show pass/fail badge

type Phase = "hidden" | "active" | "fading";

function VerificationBadge({ pageId }: { pageId?: string }) {
  const parallelMode = useStreamingStore((s) => s.parallelMode);
  // In parallel mode, read per-page verification state; otherwise global
  const verificationStatus = useStreamingStore((s) =>
    parallelMode && pageId ? (s.pageBuilds[pageId]?.verificationStatus ?? "idle") : s.verificationStatus
  );
  const verificationAttempt = useStreamingStore((s) =>
    parallelMode && pageId ? (s.pageBuilds[pageId]?.verificationAttempt ?? 0) : s.verificationAttempt
  );
  const resetVerification = useStreamingStore((s) => s.resetVerification);
  const updatePageVerification = useStreamingStore((s) => s.updatePageVerification);

  // Auto-hide passed/failed badges after a delay
  useEffect(() => {
    if (verificationStatus === "passed" || verificationStatus === "failed") {
      const timer = setTimeout(() => {
        if (parallelMode && pageId) {
          updatePageVerification(pageId, "idle", { attempt: 0, issues: [] });
        } else {
          resetVerification();
        }
      }, verificationStatus === "passed" ? VERIFY_BADGE_VISIBLE_MS : VERIFY_BADGE_VISIBLE_MS * 2);
      return () => clearTimeout(timer);
    }
  }, [verificationStatus, resetVerification, updatePageVerification, parallelMode, pageId]);

  if (verificationStatus === "idle") return null;

  const config: Record<VerificationStatus, { dot: string; text: string; animate?: boolean }> = {
    idle: { dot: "", text: "" },
    capturing: { dot: "bg-blue-400", text: "Capturing preview...", animate: true },
    reviewing: { dot: "bg-blue-400", text: "Reviewing...", animate: true },
    fixing: { dot: "bg-yellow-400", text: `Fixing (attempt ${verificationAttempt}/3)...`, animate: true },
    passed: { dot: "bg-green-400", text: "Verified" },
    failed: { dot: "bg-orange-400", text: "Issues detected" },
  };

  const { dot, text, animate } = config[verificationStatus];

  return (
    <div
      className="flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-medium text-white/90 backdrop-blur-sm"
      style={{
        backgroundColor: "rgba(13, 17, 23, 0.75)",
        animation: verificationStatus === "passed"
          ? `verify-fade-in 0.2s ease-out`
          : verificationStatus === "failed"
            ? `verify-fade-in 0.2s ease-out`
            : undefined,
      }}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full ${dot} ${animate ? "animate-pulse" : ""}`}
      />
      <span>{text}</span>
    </div>
  );
}

export function StreamingOverlay({ pageId, forceShow }: { pageId?: string; forceShow?: boolean }) {
  const isStreaming = useStreamingStore((s) => s.isStreaming);
  const targetPageId = useStreamingStore((s) => s.targetPageId);
  const targetPageIds = useStreamingStore((s) => s.targetPageIds);
  const currentFile = useStreamingStore((s) => s.currentFile);
  const parallelMode = useStreamingStore((s) => s.parallelMode);
  const pageBuild = useStreamingStore((s) =>
    s.parallelMode ? s.pageBuilds[pageId ?? ""] : null
  );
  const verificationStatus = useStreamingStore((s) =>
    s.parallelMode && pageId ? (s.pageBuilds[pageId]?.verificationStatus ?? "idle") : s.verificationStatus
  );
  const verificationPausedPageId = useStreamingStore((s) => s.verificationPausedPageId);
  const verificationPausedErrorText = useStreamingStore((s) => s.verificationPausedErrorText);
  const requestRepairInChat = useStreamingStore((s) => s.requestRepairInChat);

  const codeEndRef = useRef<HTMLDivElement>(null);
  const phaseRef = useRef<Phase>("hidden");
  const fadeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listenersRef = useRef(new Set<() => void>());

  // Manual subscribe/getSnapshot for phase to avoid setState-in-effect
  const subscribe = useCallback((cb: () => void) => {
    listenersRef.current.add(cb);
    return () => { listenersRef.current.delete(cb); };
  }, []);

  const getSnapshot = useCallback(() => phaseRef.current, []);

  const setPhase = useCallback((p: Phase) => {
    if (phaseRef.current !== p) {
      phaseRef.current = p;
      listenersRef.current.forEach((cb) => cb());
    }
  }, []);

  const phase = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  // Determine build stage for parallel mode overlay logic
  const buildStage = pageBuild?.buildStage;

  // Determine if this overlay should be active
  const isQueuedOrGenerated = parallelMode && (
    buildStage === "queued_verification" || buildStage === "generated"
  );
  const isFailedPrompt = parallelMode && buildStage === "verify_failed";

  const shouldBeActive = parallelMode
    ? pageBuild?.status === "streaming"
      || pageBuild?.status === "pending"
      || buildStage === "streaming"
      || buildStage === "pending"
      || buildStage === "generated"
      || buildStage === "queued_verification"
      || buildStage === "verify_failed"
    : isStreaming && (
      forceShow === true ||
      (pageId !== undefined && (targetPageIds.includes(pageId) || targetPageId === pageId))
    );

  // Select the display file based on mode
  const displayFile = parallelMode ? pageBuild?.currentFile : currentFile;

  // Drive phase transitions from shouldBeActive
  useEffect(() => {
    if (shouldBeActive) {
      if (fadeTimerRef.current) {
        clearTimeout(fadeTimerRef.current);
        fadeTimerRef.current = null;
      }
      setPhase("active");
    } else if (phaseRef.current === "active") {
      setPhase("fading");
      fadeTimerRef.current = setTimeout(() => {
        setPhase("hidden");
        fadeTimerRef.current = null;
      }, FADE_DURATION);
    }

    return () => {
      if (fadeTimerRef.current) {
        clearTimeout(fadeTimerRef.current);
      }
    };
  }, [shouldBeActive, setPhase]);

  // Auto-scroll to bottom as code streams in
  useEffect(() => {
    if (displayFile?.content) {
      codeEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [displayFile?.content]);

  // Show verification badge even when streaming overlay has faded
  const showVerificationOnly = phase === "hidden" && verificationStatus !== "idle";

  if (phase === "hidden" && !showVerificationOnly) return null;

  // Verification-only mode: just show the badge
  if (showVerificationOnly) {
    return (
      <div className="absolute inset-x-0 bottom-3 z-10 flex justify-center pointer-events-none">
        <VerificationBadge pageId={pageId} />
        <style>{`
          @keyframes verify-fade-in {
            from { opacity: 0; transform: translateY(4px); }
            to { opacity: 1; transform: translateY(0); }
          }
        `}</style>
      </div>
    );
  }

  const opacity = phase === "active" ? 1 : 0;

  return (
    <div
      className="absolute inset-0 z-10 flex flex-col overflow-hidden rounded-b-lg"
      style={{
        opacity,
        transition: `opacity ${FADE_DURATION}ms ease-in-out`,
        backgroundColor: "#0d1117",
      }}
    >
      {/* File path header — only for streaming, not for queued */}
      {displayFile && !isQueuedOrGenerated && (
        <div className="flex items-center px-3 py-2 border-b border-[#21262d] shrink-0">
          <span className="text-[#8b949e] text-xs font-mono truncate">
            {displayFile.path}
          </span>
          <div className="ml-auto flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
            <span className="text-[#8b949e] text-[10px]">streaming</span>
          </div>
        </div>
      )}

      {/* Code content, waiting state, or queued state */}
      <div className="flex-1 overflow-auto p-3">
        {isFailedPrompt ? (
          <div className="flex flex-col items-center justify-center h-full gap-4 text-center max-w-md mx-auto">
            <div className="space-y-2">
              <h3 className="text-white text-sm font-semibold">Preview error needs manual fix</h3>
              <p className="text-[#8b949e] text-xs leading-relaxed">
                Take a screenshot of this error and send it in chat. That is the fastest recovery path.
              </p>
              {verificationPausedPageId === pageId && verificationPausedErrorText && (
                <p className="text-[#c9d1d9] text-xs font-mono leading-relaxed whitespace-pre-wrap break-words">
                  {verificationPausedErrorText}
                </p>
              )}
            </div>
            {pageId && (
              <button
                onClick={() => requestRepairInChat(pageId)}
                className="inline-flex items-center justify-center px-3 py-2 text-xs font-medium rounded-md bg-white text-[#0d1117] hover:bg-neutral-200 transition-colors"
              >
                Fix in Chat
              </button>
            )}
          </div>
        ) : isQueuedOrGenerated ? (
          /* Queued for verification — distinct waiting UI */
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse [animation-delay:200ms]" />
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse [animation-delay:400ms]" />
            </div>
            <span className="text-[#8b949e] text-xs font-mono">
              Queued for verification...
            </span>
          </div>
        ) : displayFile ? (
          <pre className="text-[#c9d1d9] text-xs font-mono leading-relaxed whitespace-pre-wrap break-words">
            {displayFile.content}
            {/* Blinking cursor */}
            {phase === "active" && (
              <span className="inline-block w-[6px] h-[14px] bg-[#58a6ff] ml-0.5 align-middle animate-[blink_1s_steps(2)_infinite]" />
            )}
          </pre>
        ) : (
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[#58a6ff] animate-pulse" />
              <span className="w-1.5 h-1.5 rounded-full bg-[#58a6ff] animate-pulse [animation-delay:150ms]" />
              <span className="w-1.5 h-1.5 rounded-full bg-[#58a6ff] animate-pulse [animation-delay:300ms]" />
            </div>
            <span className="text-[#8b949e] text-xs font-mono">Generating code...</span>
          </div>
        )}
        <div ref={codeEndRef} />
      </div>

      {/* Inline keyframes for cursor blink */}
      <style>{`
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
        @keyframes verify-fade-in {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
