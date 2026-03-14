import type { FlowPage } from "../flow/types.ts";
import { toPascalCase } from "../vfs/app-generator.ts";

export interface AutoAnnotationRequest {
  writtenFiles: string[];
  fallbackPageIds: string[];
  addedPageIds: string[];
  removedPageIds: string[];
}

export interface ResolvedAutoAnnotationTargets {
  targetPageIds: string[];
  removedPageIds: string[];
}

const PAGE_FILE_REGEX = /^\/pages\/([^/]+)\.tsx$/;

function dedupe(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    if (!value || seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }

  return result;
}

function normalizeToManifest(pageIds: string[], validPageIds: Set<string>): string[] {
  return dedupe(pageIds).filter((pageId) => validPageIds.has(pageId));
}

function mapWrittenFilesToPageIds(
  writtenFiles: string[],
  flowPages: FlowPage[],
): string[] {
  const componentNameToPageId = new Map(
    flowPages.map((page) => [toPascalCase(page.name), page.id]),
  );

  const pageIds: string[] = [];
  for (const filePath of writtenFiles) {
    const match = filePath.match(PAGE_FILE_REGEX);
    if (!match) continue;

    const pageId = componentNameToPageId.get(match[1]);
    if (pageId) pageIds.push(pageId);
  }

  return dedupe(pageIds);
}

export function resolveAutoAnnotationTargets({
  writtenFiles,
  flowPages,
  fallbackPageIds,
  addedPageIds,
  removedPageIds,
}: AutoAnnotationRequest & { flowPages: FlowPage[] }): ResolvedAutoAnnotationTargets {
  const validPageIds = new Set(flowPages.map((page) => page.id));
  const directPageIds = mapWrittenFilesToPageIds(writtenFiles, flowPages);
  const addedTargets = normalizeToManifest(addedPageIds, validPageIds);

  const targetPageIds = dedupe([...directPageIds, ...addedTargets]);

  if (targetPageIds.length === 0 && writtenFiles.length > 0) {
    targetPageIds.push(...normalizeToManifest(fallbackPageIds, validPageIds));
  }

  return {
    targetPageIds,
    removedPageIds: dedupe(removedPageIds).filter((pageId) => !validPageIds.has(pageId)),
  };
}
