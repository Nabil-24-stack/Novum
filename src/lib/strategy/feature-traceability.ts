import type {
  KeyFeatureData,
  KeyFeaturesData,
  ManifestoData,
} from "@/hooks/useStrategyStore";

function normalizeIds(values: string[] | null | undefined): string[] {
  return (values ?? []).filter((value): value is string => typeof value === "string" && value.trim().length > 0);
}

export function hasExplicitPainPointTraceability(
  manifestoData: ManifestoData | null | undefined,
  keyFeaturesData?: KeyFeaturesData | null | undefined,
): boolean {
  const hasRegistry = (manifestoData?.painPoints?.length ?? 0) > 0;
  if (!hasRegistry) return false;

  const hasJtbdLinks = (manifestoData?.jtbd ?? []).some((jtbd) => (jtbd.painPointIds ?? []).length > 0);
  const hasFeatureLinks = (keyFeaturesData?.features ?? []).some(
    (feature) => normalizeIds(feature.painPointIds).length > 0,
  );

  return hasJtbdLinks || hasFeatureLinks;
}

export function derivePainPointIdsFromJtbds(
  jtbdIds: string[] | null | undefined,
  manifestoData: ManifestoData | null | undefined,
): string[] {
  const validPainPointIds = new Set((manifestoData?.painPoints ?? []).map((painPoint) => painPoint.id));
  const jtbdById = new Map((manifestoData?.jtbd ?? []).map((jtbd) => [jtbd.id, jtbd]));
  const derived = new Set<string>();

  for (const jtbdId of normalizeIds(jtbdIds)) {
    const painPointIds = jtbdById.get(jtbdId)?.painPointIds ?? [];
    for (const painPointId of painPointIds) {
      if (validPainPointIds.has(painPointId)) {
        derived.add(painPointId);
      }
    }
  }

  return [...derived];
}

export function derivePainPointIdsFromHmws(
  hmwIds: string[] | null | undefined,
  manifestoData: ManifestoData | null | undefined,
): string[] {
  const validPainPointIds = new Set((manifestoData?.painPoints ?? []).map((painPoint) => painPoint.id));
  const hmwById = new Map((manifestoData?.hmw ?? []).map((hmw) => [hmw.id, hmw]));
  const derived = new Set<string>();

  for (const hmwId of normalizeIds(hmwIds)) {
    const painPointIds = hmwById.get(hmwId)?.painPointIds ?? [];
    for (const painPointId of painPointIds) {
      if (validPainPointIds.has(painPointId)) {
        derived.add(painPointId);
      }
    }
  }

  return [...derived];
}

export function deriveHmwIdsFromJtbds(
  jtbdIds: string[] | null | undefined,
  manifestoData: ManifestoData | null | undefined,
): string[] {
  const validJtbdIds = new Set(normalizeIds(jtbdIds));
  if (validJtbdIds.size === 0) return [];

  return (manifestoData?.hmw ?? [])
    .filter((hmw) => normalizeIds(hmw.jtbdIds).some((jtbdId) => validJtbdIds.has(jtbdId)))
    .map((hmw) => hmw.id);
}

export function derivePersonaNamesFromJtbds(
  jtbdIds: string[] | null | undefined,
  manifestoData: ManifestoData | null | undefined,
): string[] {
  const jtbdById = new Map((manifestoData?.jtbd ?? []).map((jtbd) => [jtbd.id, jtbd]));
  const names = new Set<string>();

  for (const jtbdId of normalizeIds(jtbdIds)) {
    for (const personaName of jtbdById.get(jtbdId)?.personaNames ?? []) {
      if (typeof personaName === "string" && personaName.trim().length > 0) {
        names.add(personaName);
      }
    }
  }

  return [...names];
}

export function getResolvedFeaturePainPointIds(
  feature: Partial<KeyFeatureData> | null | undefined,
  manifestoData: ManifestoData | null | undefined,
): string[] {
  const explicitPainPointIds = normalizeIds(feature?.painPointIds);
  if (explicitPainPointIds.length > 0) {
    const validPainPointIds = new Set((manifestoData?.painPoints ?? []).map((painPoint) => painPoint.id));
    return explicitPainPointIds.filter((painPointId) => validPainPointIds.has(painPointId));
  }

  return [
    ...new Set([
      ...derivePainPointIdsFromJtbds(feature?.jtbdIds, manifestoData),
      ...derivePainPointIdsFromHmws(feature?.hmwIds, manifestoData),
    ]),
  ];
}

export function isFeatureExportableForManifesto(
  feature: Partial<KeyFeatureData> | null | undefined,
  manifestoData: ManifestoData | null | undefined,
  keyFeaturesData?: KeyFeaturesData | null | undefined,
): boolean {
  if (!feature) return false;

  const kind = feature.kind === "supporting" ? "supporting" : "core";
  if (kind === "supporting") {
    return Boolean(feature.supportingJustification?.trim());
  }

  const hasJtbdLinks = normalizeIds(feature.jtbdIds).length > 0;
  const hasHmwLinks = normalizeIds(feature.hmwIds).length > 0;
  const hasPersonaLinks = normalizeIds(feature.personaNames).length > 0;
  if (!hasJtbdLinks) return false;
  if (!hasHmwLinks) return false;
  if (!hasPersonaLinks) return false;

  const hasPainPointRegistry = (manifestoData?.painPoints?.length ?? 0) > 0;
  if (!hasPainPointRegistry && !hasExplicitPainPointTraceability(manifestoData, keyFeaturesData)) {
    return true;
  }

  return getResolvedFeaturePainPointIds(feature, manifestoData).length > 0;
}
