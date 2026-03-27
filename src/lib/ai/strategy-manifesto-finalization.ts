import type { ManifestoData } from "../../hooks/useStrategyStore.ts";
import { normalizeManifestoData } from "../strategy/artifact-edit-sync.ts";

type ManifestoBlockCandidate = Partial<{
  title: unknown;
  problemStatement: unknown;
  targetUser: unknown;
  environmentContext: unknown;
  painPoints: unknown;
  jtbd: unknown;
  hmw: unknown;
}>;

export function finalizeManifestoBlockData(value: unknown): ManifestoData | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as ManifestoBlockCandidate;
  if (
    typeof candidate.problemStatement !== "string" ||
    typeof candidate.targetUser !== "string" ||
    !Array.isArray(candidate.painPoints) ||
    !Array.isArray(candidate.jtbd) ||
    !Array.isArray(candidate.hmw)
  ) {
    return null;
  }

  const normalized = normalizeManifestoData({
    title: typeof candidate.title === "string" ? candidate.title : "",
    problemStatement: candidate.problemStatement,
    targetUser: candidate.targetUser,
    environmentContext: typeof candidate.environmentContext === "string" ? candidate.environmentContext : "",
    painPoints: candidate.painPoints as NonNullable<ManifestoData["painPoints"]>,
    jtbd: candidate.jtbd as ManifestoData["jtbd"],
    hmw: candidate.hmw as ManifestoData["hmw"],
  });

  if (!normalized.problemStatement || !normalized.targetUser) {
    return null;
  }

  return normalized;
}
