import type { ManifestoData } from "../../hooks/useStrategyStore.ts";
import { normalizeManifestoData } from "../strategy/artifact-edit-sync.ts";

function extractJsonStringValue(content: string, key: string): string | undefined {
  const keyPattern = `"${key}"`;
  const keyIdx = content.indexOf(keyPattern);
  if (keyIdx === -1) return undefined;

  let i = keyIdx + keyPattern.length;
  while (i < content.length && content[i] !== ":") i++;
  if (i >= content.length) return undefined;
  i++;

  while (i < content.length && content[i] !== '"') i++;
  if (i >= content.length) return undefined;
  i++;

  let value = "";
  while (i < content.length) {
    if (content[i] === "\\" && i + 1 < content.length) {
      const next = content[i + 1];
      if (next === '"') value += '"';
      else if (next === "n") value += "\n";
      else if (next === "\\") value += "\\";
      else value += next;
      i += 2;
    } else if (content[i] === '"') {
      return value;
    } else {
      value += content[i];
      i++;
    }
  }

  return value;
}

function extractJsonArrayItems(content: string, key: string): string[] | undefined {
  const keyPattern = `"${key}"`;
  const keyIdx = content.indexOf(keyPattern);
  if (keyIdx === -1) return undefined;

  let i = keyIdx + keyPattern.length;
  while (i < content.length && content[i] !== "[") i++;
  if (i >= content.length) return undefined;
  i++;

  const items: string[] = [];
  while (i < content.length) {
    while (i < content.length && /[\s,]/.test(content[i])) i++;
    if (i >= content.length || content[i] === "]") break;

    if (content[i] === '"') {
      i++;
      let value = "";
      let closed = false;

      while (i < content.length) {
        if (content[i] === "\\" && i + 1 < content.length) {
          const next = content[i + 1];
          if (next === '"') value += '"';
          else if (next === "n") value += "\n";
          else if (next === "\\") value += "\\";
          else value += next;
          i += 2;
        } else if (content[i] === '"') {
          closed = true;
          i++;
          break;
        } else {
          value += content[i];
          i++;
        }
      }

      items.push(value);
      if (!closed) break;
    } else {
      i++;
    }
  }

  return items.length > 0 ? items : undefined;
}

function extractPartialManifestoObjectArray(
  content: string,
  key: "painPoints" | "jtbd" | "hmw",
): Array<Record<string, unknown>> | undefined {
  const keyPattern = `"${key}"`;
  const keyIdx = content.indexOf(keyPattern);
  if (keyIdx === -1) return undefined;

  let i = keyIdx + keyPattern.length;
  while (i < content.length && content[i] !== "[") i++;
  if (i >= content.length) return undefined;
  i++;

  const items: Array<Record<string, unknown>> = [];
  let depth = 0;
  let inString = false;
  let escape = false;
  let objectStart = -1;

  for (; i < content.length; i++) {
    const ch = content[i];

    if (escape) {
      escape = false;
      continue;
    }
    if (ch === "\\" && inString) {
      escape = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;

    if (ch === "{") {
      if (depth === 0) objectStart = i;
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0 && objectStart !== -1) {
        const objStr = content.slice(objectStart, i + 1);
        try {
          const parsed = JSON.parse(objStr);
          if (parsed?.text) {
            items.push(parsed);
          }
        } catch {
          // Ignore malformed objects here; partial extraction below handles the final object.
        }
        objectStart = -1;
      }
    } else if (ch === "]" && depth === 0) {
      break;
    }
  }

  if (depth > 0 && objectStart !== -1) {
    const partialStr = content.slice(objectStart);
    const text = extractJsonStringValue(partialStr, "text");
    if (text) {
      const partial: Record<string, unknown> = { text };
      const id = extractJsonStringValue(partialStr, "id");
      if (id !== undefined) partial.id = id;

      if (key !== "painPoints") {
        const painPointIds = extractJsonArrayItems(partialStr, "painPointIds");
        if (painPointIds !== undefined) partial.painPointIds = painPointIds;
      }

      if (key === "jtbd") {
        const personaNames = extractJsonArrayItems(partialStr, "personaNames");
        if (personaNames !== undefined) partial.personaNames = personaNames;
      }

      if (key === "hmw") {
        const jtbdIds = extractJsonArrayItems(partialStr, "jtbdIds");
        if (jtbdIds !== undefined) partial.jtbdIds = jtbdIds;
      }

      items.push(partial);
    }
  }

  return items.length > 0 ? items : undefined;
}

export function extractPartialOverview(text: string): Partial<ManifestoData> | null {
  const marker = '```json type="manifesto"';
  const blockStart = text.indexOf(marker);
  if (blockStart === -1) return null;

  const content = text.slice(blockStart + marker.length);
  const result: Partial<ManifestoData> = {};

  const title = extractJsonStringValue(content, "title");
  if (title !== undefined) result.title = title;

  const problemStatement = extractJsonStringValue(content, "problemStatement");
  if (problemStatement !== undefined) result.problemStatement = problemStatement;

  const targetUser = extractJsonStringValue(content, "targetUser");
  if (targetUser !== undefined) result.targetUser = targetUser;

  const environmentContext = extractJsonStringValue(content, "environmentContext");
  if (environmentContext !== undefined) result.environmentContext = environmentContext;

  const linkedPainPoints = extractPartialManifestoObjectArray(content, "painPoints");
  if (linkedPainPoints !== undefined) {
    result.painPoints = linkedPainPoints as ManifestoData["painPoints"];
  } else {
    const painPoints = extractJsonArrayItems(content, "painPoints");
    if (painPoints !== undefined) {
      result.painPoints = painPoints as unknown as ManifestoData["painPoints"];
    }
  }

  const linkedJtbd = extractPartialManifestoObjectArray(content, "jtbd");
  if (linkedJtbd !== undefined) {
    result.jtbd = linkedJtbd as ManifestoData["jtbd"];
  } else {
    const jtbd = extractJsonArrayItems(content, "jtbd");
    if (jtbd !== undefined) {
      result.jtbd = jtbd as unknown as ManifestoData["jtbd"];
    }
  }

  const linkedHmw = extractPartialManifestoObjectArray(content, "hmw");
  if (linkedHmw !== undefined) {
    result.hmw = linkedHmw as ManifestoData["hmw"];
  } else {
    const hmw = extractJsonArrayItems(content, "hmw");
    if (hmw !== undefined) {
      result.hmw = hmw as unknown as ManifestoData["hmw"];
    }
  }

  return Object.keys(result).length > 0 ? result : null;
}

export function shapeStreamingOverview(
  partial: Partial<ManifestoData>,
  previous: Partial<ManifestoData> | null | undefined,
): Partial<ManifestoData> {
  const normalized = normalizeManifestoData({
    title: partial.title ?? previous?.title ?? "",
    problemStatement: partial.problemStatement ?? previous?.problemStatement ?? "",
    targetUser: partial.targetUser ?? previous?.targetUser ?? "",
    environmentContext: partial.environmentContext ?? previous?.environmentContext ?? "",
    painPoints: partial.painPoints ?? previous?.painPoints ?? [],
    jtbd: partial.jtbd ?? previous?.jtbd ?? [],
    hmw: partial.hmw ?? previous?.hmw ?? [],
  });

  const shaped: Partial<ManifestoData> = {};
  if (partial.title !== undefined) shaped.title = normalized.title;
  if (partial.problemStatement !== undefined) shaped.problemStatement = normalized.problemStatement;
  if (partial.targetUser !== undefined) shaped.targetUser = normalized.targetUser;
  if (partial.environmentContext !== undefined) shaped.environmentContext = normalized.environmentContext;
  if (partial.painPoints !== undefined) shaped.painPoints = normalized.painPoints;
  if (partial.jtbd !== undefined) shaped.jtbd = normalized.jtbd;
  if (partial.hmw !== undefined) shaped.hmw = normalized.hmw;

  return shaped;
}
