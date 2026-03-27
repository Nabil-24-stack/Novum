import type { ManifestoData } from "../../hooks/useStrategyStore.ts";
import { resolvePainPointsByIds } from "./pain-points.ts";

export const JTBD_CLUSTER_EMPTY_PAIN_POINTS_TEXT = "No linked pain points yet.";

export interface JtbdClusterViewModel {
  key: string;
  label: string;
  text: string;
  personaCount: number;
  painPoints: Array<{ id: string; text: string }>;
}

export function buildJtbdClusterViewModels(
  manifestoData: Partial<ManifestoData>,
): JtbdClusterViewModel[] {
  const jtbds = manifestoData.jtbd ?? [];

  return jtbds.map((jtbd, jtbdIndex) => {
    const jtbdId = typeof jtbd.id === "string" ? jtbd.id : "";
    const jtbdText = typeof jtbd.text === "string" ? jtbd.text : "";
    const personaNames = Array.isArray(jtbd.personaNames) ? jtbd.personaNames : [];
    const painPoints = resolvePainPointsByIds(
      Array.isArray(jtbd.painPointIds) ? jtbd.painPointIds : [],
      manifestoData as ManifestoData,
    ).map((painPoint) => ({
      id: painPoint.id,
      text: painPoint.text,
    }));

    return {
      key: `jtbd-${jtbdId || jtbdText || "item"}-${jtbdIndex}`,
      label: jtbdId || `JTBD ${jtbdIndex + 1}`,
      text: jtbdText || "JTBD wording is still streaming in.",
      personaCount: personaNames.length,
      painPoints,
    };
  });
}
