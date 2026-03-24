import type { KeyFeatureData, StrategyNode } from "@/hooks/useStrategyStore";
import type { HandoffSnapshot } from "./types.ts";
import { getExportableFeatures, getParkedFeatureWarning } from "./snapshot.ts";

export const UNRESOLVED_JTBD_LINKAGE_TEXT =
  "Unresolved linkage: no JTBD mapping could be derived for this page.";
export const UNRESOLVED_FEATURE_LINKAGE_TEXT =
  "Unresolved linkage: no feature mapping could be derived for this page.";

export interface ResolvedPageTraceability {
  pageId: string;
  pageLabel: string;
  pageDescription?: string;
  jtbdIds: string[];
  featureIds: string[];
  unresolvedJtbds: boolean;
  unresolvedFeatures: boolean;
}

const TEXT_MATCH_STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "app",
  "are",
  "as",
  "at",
  "be",
  "by",
  "for",
  "from",
  "in",
  "into",
  "is",
  "of",
  "on",
  "or",
  "page",
  "screen",
  "the",
  "to",
  "view",
  "with",
]);

function uniqueIds(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function isPageNode(node: StrategyNode): node is StrategyNode & { type: "page" } {
  return node.type === "page";
}

function normalizeTextToken(token: string): string {
  const cleaned = token.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (cleaned.length <= 2) return "";
  if (cleaned.endsWith("s") && !cleaned.endsWith("ss") && cleaned.length > 3) {
    return cleaned.slice(0, -1);
  }
  return cleaned;
}

function tokenizeForMatching(value: string): string[] {
  return [...new Set(
    value
      .split(/[^a-zA-Z0-9]+/)
      .map(normalizeTextToken)
      .filter((token) => token && !TEXT_MATCH_STOPWORDS.has(token))
  )];
}

function buildPageFlowJtbdMap(snapshot: HandoffSnapshot): Map<string, string[]> {
  const pageJtbds = new Map<string, string[]>();
  const jtbdItems = snapshot.productOverview?.jtbd ?? [];

  for (const flow of snapshot.userFlows ?? []) {
    const jtbdId = jtbdItems[flow.jtbdIndex]?.id;
    if (!jtbdId) continue;

    for (const step of flow.steps) {
      pageJtbds.set(step.nodeId, uniqueIds([...(pageJtbds.get(step.nodeId) ?? []), jtbdId]));
    }
  }

  return pageJtbds;
}

function resolveFeatureIdsFromText(params: {
  page: StrategyNode & { type: "page" };
  features: KeyFeatureData[];
}): string[] {
  const { page, features } = params;
  const pageTokens = tokenizeForMatching(`${page.label} ${page.description ?? ""}`);
  if (pageTokens.length === 0 || features.length === 0) return [];

  const scored = features
    .map((feature) => {
      const featureTokens = tokenizeForMatching(`${feature.name} ${feature.description}`);
      const overlapCount = featureTokens.filter((token) => pageTokens.includes(token)).length;
      return { featureId: feature.id, overlapCount };
    })
    .filter((candidate) => candidate.overlapCount > 0)
    .sort((a, b) => b.overlapCount - a.overlapCount);

  if (scored.length === 0) return [];

  const [best, second] = scored;
  if (best.overlapCount < 2) return [];
  if (second && second.overlapCount === best.overlapCount) return [];

  return [best.featureId];
}

export function resolvePageTraceability(snapshot: HandoffSnapshot): ResolvedPageTraceability[] {
  const architecture = snapshot.informationArchitecture;
  if (!architecture) {
    return [];
  }

  const pageNodes = architecture.nodes.filter(isPageNode);
  const validJtbdIds = new Set((snapshot.productOverview?.jtbd ?? []).map((jtbd) => jtbd.id));
  const exportableFeatures = getExportableFeatures(snapshot.keyFeatures);
  const exportableFeatureIds = new Set(exportableFeatures.map((feature) => feature.id));
  const exportableFeaturesById = new Map(exportableFeatures.map((feature) => [feature.id, feature]));
  const flowJtbdsByPage = buildPageFlowJtbdMap(snapshot);

  return pageNodes.map((page) => {
    const hasExplicitTraceability =
      Array.isArray(page.jtbdIds) || Array.isArray(page.featureIds);

    let jtbdIds = uniqueIds((page.jtbdIds ?? []).filter((jtbdId) => validJtbdIds.has(jtbdId)));
    let featureIds = uniqueIds(
      (page.featureIds ?? []).filter((featureId) => exportableFeatureIds.has(featureId))
    );

    if (jtbdIds.length === 0 && featureIds.length > 0) {
      jtbdIds = uniqueIds(
        featureIds.flatMap((featureId) => exportableFeaturesById.get(featureId)?.jtbdIds ?? [])
      );
    }

    if (jtbdIds.length === 0) {
      jtbdIds = uniqueIds((flowJtbdsByPage.get(page.id) ?? []).filter((jtbdId) => validJtbdIds.has(jtbdId)));
    }

    if (featureIds.length === 0 && jtbdIds.length > 0) {
      featureIds = exportableFeatures
        .filter((feature) => feature.jtbdIds.some((jtbdId) => jtbdIds.includes(jtbdId)))
        .map((feature) => feature.id);
    }

    if (!hasExplicitTraceability && (jtbdIds.length === 0 || featureIds.length === 0)) {
      const matchedFeatureIds = resolveFeatureIdsFromText({ page, features: exportableFeatures });
      if (featureIds.length === 0 && matchedFeatureIds.length > 0) {
        featureIds = matchedFeatureIds;
      }
      if (jtbdIds.length === 0 && matchedFeatureIds.length > 0) {
        jtbdIds = uniqueIds(
          matchedFeatureIds.flatMap((featureId) => exportableFeaturesById.get(featureId)?.jtbdIds ?? [])
        );
      }
    }

    return {
      pageId: page.id,
      pageLabel: page.label,
      ...(page.description ? { pageDescription: page.description } : {}),
      jtbdIds,
      featureIds,
      unresolvedJtbds: jtbdIds.length === 0,
      unresolvedFeatures: featureIds.length === 0,
    };
  });
}

export function getUnresolvedPageTraceability(snapshot: HandoffSnapshot): ResolvedPageTraceability[] {
  return resolvePageTraceability(snapshot).filter(
    (page) => page.unresolvedJtbds || page.unresolvedFeatures
  );
}

function formatMissingLinkageKinds(page: ResolvedPageTraceability): string {
  const missingKinds: string[] = [];
  if (page.unresolvedJtbds) missingKinds.push("JTBDs");
  if (page.unresolvedFeatures) missingKinds.push("features");
  return missingKinds.join(", ");
}

export function getHandoffWarningMessage(snapshot: HandoffSnapshot): string | null {
  const warnings: string[] = [];

  const parkedFeatureWarning = getParkedFeatureWarning(snapshot.keyFeatures);
  if (parkedFeatureWarning) {
    warnings.push(parkedFeatureWarning);
  }

  const unresolvedPages = getUnresolvedPageTraceability(snapshot);
  if (unresolvedPages.length > 0) {
    warnings.push(
      `${unresolvedPages.length} screen${unresolvedPages.length === 1 ? "" : "s"} still ${unresolvedPages.length === 1 ? "has" : "have"} unresolved linkage: ${unresolvedPages
        .map((page) => `${page.pageId} (${formatMissingLinkageKinds(page)})`)
        .join(", ")}.`
    );
  }

  return warnings.length > 0 ? warnings.join("\n") : null;
}
