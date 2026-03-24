export interface TraceableTextItem {
  id: string;
  text: string;
}

export type TraceableTextLike = TraceableTextItem | string;

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

export function getTraceableText(value: TraceableTextLike | null | undefined): string {
  if (!value) return "";
  return typeof value === "string" ? value : value.text;
}

export function getTraceableTexts(values: TraceableTextLike[] | null | undefined): string[] {
  return (values ?? []).map(getTraceableText).map((value) => value.trim()).filter(Boolean);
}

export function normalizeTraceableTextList(params: {
  values: TraceableTextLike[] | null | undefined;
  prefix: string;
  previous?: TraceableTextItem[] | null | undefined;
}): TraceableTextItem[] {
  const { values, prefix, previous } = params;
  const previousItems = previous ?? [];
  const previousByText = new Map<string, TraceableTextItem[]>();
  const usedIds = new Set<string>();

  for (const item of previousItems) {
    const key = item.text.trim();
    const queue = previousByText.get(key);
    if (queue) {
      queue.push(item);
    } else {
      previousByText.set(key, [item]);
    }
  }

  return (values ?? [])
    .map((item, index) => {
      const text = getTraceableText(item).trim();
      if (!text) return null;

      if (isTraceableTextItem(item) && item.id.trim()) {
        usedIds.add(item.id);
        return {
          id: item.id.trim(),
          text,
        };
      }

      const sameIndex = previousItems[index];
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
