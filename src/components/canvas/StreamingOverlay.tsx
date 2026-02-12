"use client";

import { useEffect, useRef, useSyncExternalStore, useCallback } from "react";
import { useStreamingStore } from "@/hooks/useStreamingStore";

const FADE_DURATION = 400; // ms

type Phase = "hidden" | "active" | "fading";

export function StreamingOverlay({ pageId, forceShow }: { pageId?: string; forceShow?: boolean }) {
  const isStreaming = useStreamingStore((s) => s.isStreaming);
  const targetPageId = useStreamingStore((s) => s.targetPageId);
  const currentFile = useStreamingStore((s) => s.currentFile);
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

  // Only activate if this overlay's pageId matches the target
  // targetPageId === null means "all frames" (prototype mode)
  // forceShow overrides targeting — used for the active frame in Prototype View
  const shouldBeActive = isStreaming && (targetPageId === null || targetPageId === pageId || forceShow === true);

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
    if (currentFile?.content) {
      codeEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [currentFile?.content]);

  if (phase === "hidden") return null;

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
      {/* File path header */}
      {currentFile && (
        <div className="flex items-center px-3 py-2 border-b border-[#21262d] shrink-0">
          <span className="text-[#8b949e] text-xs font-mono truncate">
            {currentFile.path}
          </span>
          <div className="ml-auto flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
            <span className="text-[#8b949e] text-[10px]">streaming</span>
          </div>
        </div>
      )}

      {/* Code content or waiting state */}
      <div className="flex-1 overflow-auto p-3">
        {currentFile ? (
          <pre className="text-[#c9d1d9] text-xs font-mono leading-relaxed whitespace-pre-wrap break-words">
            {currentFile.content}
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
      `}</style>
    </div>
  );
}
