import type {
  JourneyStage,
  ManifestoData,
  PersonaData,
} from "@/hooks/useStrategyStore";
import type { TraceableTextItem } from "./traceable.ts";

export function buildPainPointRegistry(
  manifestoData: ManifestoData | null | undefined
): Map<string, TraceableTextItem> {
  return new Map((manifestoData?.painPoints ?? []).map((painPoint) => [painPoint.id, painPoint]));
}

export function resolvePainPointsByIds(
  ids: string[] | null | undefined,
  manifestoData: ManifestoData | null | undefined
): TraceableTextItem[] {
  const registry = buildPainPointRegistry(manifestoData);
  return (ids ?? [])
    .map((id) => registry.get(id))
    .filter((painPoint): painPoint is TraceableTextItem => Boolean(painPoint));
}

export function resolvePersonaPainPoints(
  persona: PersonaData | null | undefined,
  manifestoData: ManifestoData | null | undefined
): TraceableTextItem[] {
  return resolvePainPointsByIds(persona?.painPointIds, manifestoData);
}

export function resolveJourneyPainPoints(
  stage: JourneyStage | null | undefined,
  manifestoData: ManifestoData | null | undefined
): TraceableTextItem[] {
  return resolvePainPointsByIds(stage?.painPointIds, manifestoData);
}

export function getPainPointText(
  painPointId: string,
  manifestoData: ManifestoData | null | undefined
): string | null {
  return buildPainPointRegistry(manifestoData).get(painPointId)?.text ?? null;
}

export function buildPainPointOptions(
  manifestoData: ManifestoData | null | undefined
): { id: string; label: string; source: string }[] {
  return (manifestoData?.painPoints ?? []).map((painPoint) => ({
    id: painPoint.id,
    label: painPoint.text,
    source: "Overview",
  }));
}
