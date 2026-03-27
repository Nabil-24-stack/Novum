export interface TraceableTextItem {
  id: string;
  text: string;
}

export interface PartialTraceableTextItem {
  id?: string;
  text: string;
}

export type TraceableTextLike = TraceableTextItem | PartialTraceableTextItem | string;

function randomId(): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return uuid;
  return Math.random().toString(36).slice(2, 10);
}

export function createTraceableId(prefix: string): string {
  return `${prefix}-${randomId()}`;
}

export function createDeterministicTraceableId(prefix: string, seed: string): string {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
  }
  return `${prefix}-${hash.toString(36)}`;
}

export function isTraceableTextItem(value: unknown): value is TraceableTextItem {
  return Boolean(
    value &&
      typeof value === "object" &&
      "id" in value &&
      "text" in value &&
      typeof (value as { id: unknown }).id === "string" &&
      typeof (value as { text: unknown }).text === "string"
  );
}

function trimString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeExistingTraceableItem(value: unknown): TraceableTextItem | null {
  if (!isTraceableTextItem(value)) return null;

  const id = trimString(value.id);
  const text = trimString(value.text);
  if (!id || !text) return null;

  return { id, text };
}

export function getTraceableText(value: TraceableTextLike | null | undefined): string {
  if (typeof value === "string") return value;
  const normalizedValue = normalizeExistingTraceableItem(value);
  if (normalizedValue) return normalizedValue.text;
  if (value && typeof value === "object" && "text" in value && typeof value.text === "string") {
    return value.text;
  }
  return "";
}

export function getTraceableTexts(values: TraceableTextLike[] | null | undefined): string[] {
  return (values ?? []).map(getTraceableText).map(trimString).filter(Boolean);
}

export function normalizeTraceableTextList(params: {
  values: TraceableTextLike[] | null | undefined;
  prefix: string;
  previous?: TraceableTextLike[] | null | undefined;
}): TraceableTextItem[] {
  const { values, prefix, previous } = params;
  const previousItems = previous ?? [];
  const previousByText = new Map<string, TraceableTextItem[]>();
  const usedIds = new Set<string>();

  for (const previousItem of previousItems) {
    const item = normalizeExistingTraceableItem(previousItem);
    if (!item) continue;

    const key = item.text;
    const queue = previousByText.get(key);
    if (queue) {
      queue.push(item);
    } else {
      previousByText.set(key, [item]);
    }
  }

  return (values ?? [])
    .map((item, index) => {
      const text = trimString(getTraceableText(item));
      if (!text) return null;

      const normalizedItem = normalizeExistingTraceableItem(item);
      if (normalizedItem) {
        usedIds.add(normalizedItem.id);
        return {
          id: normalizedItem.id,
          text,
        };
      }

      const sameIndex = normalizeExistingTraceableItem(previousItems[index]);
      if (sameIndex && !usedIds.has(sameIndex.id)) {
        usedIds.add(sameIndex.id);
        return {
          id: sameIndex.id,
          text,
        };
      }

      const textMatches = previousByText.get(text);
      const match = textMatches?.find((candidate) => !usedIds.has(candidate.id));
      if (match) {
        usedIds.add(match.id);
        return {
          id: match.id,
          text,
        };
      }

      const id = createDeterministicTraceableId(prefix, `${index}:${text}`);
      usedIds.add(id);
      return {
        id,
        text,
      };
    })
    .filter((item): item is TraceableTextItem => Boolean(item));
}
