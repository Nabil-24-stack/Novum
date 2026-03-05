"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { useStrategyStore } from "./useStrategyStore";
import { useProductBrainStore } from "./useProductBrainStore";
import { useDocumentStore } from "./useDocumentStore";

interface PersistenceConfig {
  files: Record<string, string>;
  chatMessages: unknown[] | null;
}

const DEBOUNCE_MS = 5000;

// Fields from the strategy store to persist (exclude streaming/transient)
function getStrategySnapshot() {
  const s = useStrategyStore.getState();
  return {
    phase: s.phase,
    userPrompt: s.userPrompt,
    manifestoData: s.manifestoData,
    personaData: s.personaData,
    flowData: s.flowData,
    confidenceData: s.confidenceData,
    journeyMapData: s.journeyMapData,
    ideaData: s.ideaData,
    selectedIdeaId: s.selectedIdeaId,
    completedPages: s.completedPages,
    keyFeaturesData: s.keyFeaturesData,
    userFlowsData: s.userFlowsData,
    isDeepDive: s.isDeepDive,
    strategyUpdatedAfterBuild: s.strategyUpdatedAfterBuild,
  };
}

export function useProjectPersistence(
  projectId: string | null,
  config: PersistenceConfig
) {
  const { files, chatMessages } = config;
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<Record<string, unknown> | null>(null);
  const lastSavedRef = useRef<string>("");

  const flush = useCallback(async () => {
    if (!projectId || !pendingRef.current) return;
    const payload = pendingRef.current;
    pendingRef.current = null;
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    const key = JSON.stringify(payload);
    if (key === lastSavedRef.current) return;

    setSaveStatus("saving");
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        lastSavedRef.current = key;
        setSaveStatus("saved");
        setTimeout(() => setSaveStatus((s) => (s === "saved" ? "idle" : s)), 2000);
      } else {
        console.error("Save failed:", await res.text());
        setSaveStatus("idle");
      }
    } catch (err) {
      console.error("Save error:", err);
      setSaveStatus("idle");
    }
  }, [projectId]);

  const scheduleSave = useCallback(
    (payload: Record<string, unknown>) => {
      pendingRef.current = { ...pendingRef.current, ...payload };
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(flush, DEBOUNCE_MS);
    },
    [flush]
  );

  // Watch VFS files
  useEffect(() => {
    if (!projectId) return;
    scheduleSave({ files });
  }, [files, projectId, scheduleSave]);

  // Watch chat messages
  useEffect(() => {
    if (!projectId || chatMessages === null) return;
    scheduleSave({ chat_messages: chatMessages });
  }, [chatMessages, projectId, scheduleSave]);

  // Watch strategy store
  useEffect(() => {
    if (!projectId) return;
    const unsub = useStrategyStore.subscribe(() => {
      const snapshot = getStrategySnapshot();
      scheduleSave({ strategy: snapshot, phase: snapshot.phase });
    });
    return unsub;
  }, [projectId, scheduleSave]);

  // Watch product brain store
  useEffect(() => {
    if (!projectId) return;
    const unsub = useProductBrainStore.subscribe(() => {
      const brain = useProductBrainStore.getState().brainData;
      const insightsData = useDocumentStore.getState().insightsData;
      scheduleSave({ product_brain: { ...brain, insightsData: insightsData ?? undefined } });
    });
    return unsub;
  }, [projectId, scheduleSave]);

  // Watch document store
  useEffect(() => {
    if (!projectId) return;
    const unsub = useDocumentStore.subscribe(() => {
      const { documents, insightsData } = useDocumentStore.getState();
      scheduleSave({ documents: documents.map(({ id, name, text, uploadedAt }) => ({ id, name, text, uploadedAt })) });
      // Always save merged product_brain so insightsData and pages are never lost
      const brain = useProductBrainStore.getState().brainData;
      scheduleSave({ product_brain: { ...brain, insightsData: insightsData ?? undefined } });
    });
    return unsub;
  }, [projectId, scheduleSave]);

  // Extract brand color from tokens.json in VFS
  useEffect(() => {
    if (!projectId) return;
    try {
      const tokensJson = files["/tokens.json"];
      if (!tokensJson) return;
      const tokens = JSON.parse(tokensJson);
      const baseColors = tokens?.primitives?.baseColors;
      if (baseColors?.brand) {
        scheduleSave({ brand_color: baseColors.brand });
      }
    } catch {
      // Skip if tokens.json is invalid
    }
  }, [files, projectId, scheduleSave]);

  // Flush on unmount / page navigation
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (pendingRef.current && projectId) {
        // Use fetch with keepalive for best-effort save on page close
        const payload = pendingRef.current;
        pendingRef.current = null;
        fetch(`/api/projects/${projectId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          keepalive: true,
        }).catch(() => {});
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      // Flush on cleanup (navigation within SPA)
      flush();
    };
  }, [projectId, flush]);

  return { saveStatus, flush };
}
