import type {
  DecisionConnection,
  PageDecisions,
  ProductBrainData,
} from "./types";

export interface ProductBrainExpectedPage {
  pageId: string;
  pageName: string;
}

export interface ProductBrainEvaluationPage {
  pageId?: string;
  pageName?: string;
  connections?: unknown;
}

export interface PersistedProductBrainRecord<TInsights = unknown> {
  version?: unknown;
  pages?: unknown;
  insightsData?: TInsights;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function normalizeStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function normalizeNumberArray(value: unknown): number[] {
  return Array.isArray(value)
    ? value.filter((item): item is number => typeof item === "number" && Number.isFinite(item))
    : [];
}

function normalizeJourneyStages(value: unknown): DecisionConnection["journeyStages"] {
  if (!Array.isArray(value)) return undefined;

  const stages = value
    .map((entry) => {
      if (!isRecord(entry)) return null;
      if (typeof entry.personaName !== "string" || typeof entry.stageIndex !== "number") {
        return null;
      }
      return {
        personaName: entry.personaName,
        stageIndex: entry.stageIndex,
      };
    })
    .filter((entry): entry is NonNullable<DecisionConnection["journeyStages"]>[number] => entry !== null);

  return stages.length > 0 ? stages : undefined;
}

function normalizeSourceLocation(value: unknown): DecisionConnection["sourceLocation"] {
  if (!isRecord(value) || typeof value.fileName !== "string") return undefined;
  return {
    fileName: value.fileName,
    sectionLabel: typeof value.sectionLabel === "string" ? value.sectionLabel : undefined,
  };
}

function normalizeConnection(
  value: unknown,
  inheritedPageId: string
): DecisionConnection | null {
  if (!isRecord(value)) return null;

  const pageId = typeof value.pageId === "string" ? value.pageId : inheritedPageId;
  if (
    typeof value.id !== "string" ||
    typeof value.componentDescription !== "string" ||
    typeof value.rationale !== "string"
  ) {
    return null;
  }

  return {
    id: value.id,
    pageId,
    componentDescription: value.componentDescription,
    sourceLocation: normalizeSourceLocation(value.sourceLocation),
    personaNames: normalizeStringArray(value.personaNames),
    jtbdIndices: normalizeNumberArray(value.jtbdIndices),
    journeyStages: normalizeJourneyStages(value.journeyStages),
    rationale: value.rationale,
    insightIndices: normalizeNumberArray(value.insightIndices),
    isUntracked: value.isUntracked === true ? true : undefined,
  };
}

function normalizePage(
  value: unknown,
  fallback?: ProductBrainExpectedPage
): PageDecisions | null {
  if (!isRecord(value) && !fallback) return null;

  const pageId = isRecord(value) && typeof value.pageId === "string" ? value.pageId : fallback?.pageId;
  if (!pageId) return null;

  const pageName =
    isRecord(value) && typeof value.pageName === "string"
      ? value.pageName
      : fallback?.pageName ?? pageId;

  const rawConnections = isRecord(value) && Array.isArray(value.connections) ? value.connections : [];
  const connections = rawConnections
    .map((entry) => normalizeConnection(entry, pageId))
    .filter((entry): entry is DecisionConnection => entry !== null);

  return {
    pageId,
    pageName,
    connections,
  };
}

export function createEmptyProductBrain(): ProductBrainData {
  return {
    version: 1,
    pages: [],
  };
}

export function normalizeProductBrainSnapshot(value: unknown): ProductBrainData | null {
  if (!isRecord(value) || !("pages" in value)) return null;

  const rawPages = Array.isArray(value.pages) ? value.pages : [];
  const pages = rawPages
    .map((entry) => normalizePage(entry))
    .filter((entry): entry is PageDecisions => entry !== null);

  return {
    version: 1,
    pages,
  };
}

export function buildProductBrainFromEvaluation(
  pages: ProductBrainEvaluationPage[] | null | undefined,
  expectedPages: ProductBrainExpectedPage[]
): ProductBrainData {
  const normalizedById = new Map<string, PageDecisions>();
  const expectedById = new Map(expectedPages.map((page) => [page.pageId, page]));

  for (const page of pages ?? []) {
    const fallback = page.pageId ? expectedById.get(page.pageId) : undefined;
    const normalized = normalizePage(page, fallback);
    if (!normalized) continue;
    if (expectedPages.length > 0 && !expectedById.has(normalized.pageId)) continue;
    normalizedById.set(normalized.pageId, normalized);
  }

  if (expectedPages.length === 0) {
    return {
      version: 1,
      pages: [...normalizedById.values()],
    };
  }

  return {
    version: 1,
    pages: expectedPages.map(
      (page) =>
        normalizedById.get(page.pageId) ?? {
          pageId: page.pageId,
          pageName: page.pageName,
          connections: [],
        }
    ),
  };
}

export function buildPersistedProductBrainRecord<TInsights>(
  brainData: ProductBrainData | null,
  insightsData: TInsights | null | undefined
): PersistedProductBrainRecord<TInsights> | null {
  const snapshot = brainData ? normalizeProductBrainSnapshot(brainData) : null;

  if (snapshot && insightsData != null) {
    return { ...snapshot, insightsData };
  }

  if (snapshot) return snapshot;
  if (insightsData != null) return { insightsData };
  return null;
}
