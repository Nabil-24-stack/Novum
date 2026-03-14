"use client";

import { useChat } from "@ai-sdk/react";
import { useEffect, useRef, useState, useCallback, useMemo, DragEvent, ClipboardEvent, FormEvent } from "react";
import { Send, Loader2, X, ImagePlus, ArrowRight, Check, AlertTriangle, Square, FileText, RotateCcw, Zap } from "lucide-react";
import { toast } from "sonner";
import { useChatContextStore, type PinnedElement, type AddressGapsPayload } from "@/hooks/useChatContextStore";
import { useStreamingStore } from "@/hooks/useStreamingStore";
import { useProductBrainStore } from "@/hooks/useProductBrainStore";
import {
  useStrategyStore,
  type StrategyPhase,
  type ConfidenceData,
  type PersonaData,
  type IdeaData,
  type KeyFeaturesData,
  type JourneyMapData,
  type JourneyStage,
  type UserFlow,
  type FlowData,
  type EditContext,
  type EditScope,
} from "@/hooks/useStrategyStore";
import { useDocumentStore, type InsightData, type InsightsCardData } from "@/hooks/useDocumentStore";
import { buildInsightsContext } from "@/lib/ai/insights-prompt";
import { useParallelBuild } from "@/hooks/useParallelBuild";
import { toPascalCase } from "@/lib/vfs/app-generator";
import type { ProductBrainData } from "@/lib/product-brain/types";
import { ConfidenceBar } from "./ConfidenceBar";
import { BuildProgressCards } from "./BuildProgressCards";
import { runGatekeeper } from "@/lib/ai/gatekeeper";
import { trackEvent } from "@/lib/analytics/track-event";
import { useBillingStore } from "@/hooks/useBillingStore";
import { notifyUsageChanged, useBillingStatus } from "@/hooks/useBillingStatus";
import { checkRouteConsistency } from "@/lib/ai/route-consistency";
import type { AutoAnnotationRequest } from "@/lib/ai/annotation-targets";
import { parseStreamingContent } from "@/lib/streaming-parser";
import { runVerificationLoop } from "@/lib/verification/verify-loop";
import type { FileUIPart } from "ai";

const FILE_CODE_BLOCK_RE = /```\w*\s+file="[^"]+"/;
function hasFileCodeBlocks(content: string): boolean {
  return FILE_CODE_BLOCK_RE.test(content);
}

/** Strip strategy JSON blocks from text (manifesto, flow, options, page-built, confidence, personas, etc.) */
function stripStrategyBlocks(text: string): string {
  // Strip closed strategy blocks
  let cleaned = text.replace(/```json\s+type="(?:options|manifesto|personas|flow|ia|page-built|confidence|journey-maps|ideas|user-flows|features|decision-connections|insights|alignment-check)"[\s\S]*?```/g, "");
  // Strip open (still-streaming) strategy blocks
  cleaned = cleaned.replace(/```json\s+type="(?:options|manifesto|personas|flow|ia|page-built|confidence|journey-maps|ideas|user-flows|features|decision-connections|insights|alignment-check)"[\s\S]*$/, "");
  return cleaned.trim();
}

const ACCEPTED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"];
const MAX_IMAGE_SIZE_BYTES = 4 * 1024 * 1024; // 4MB
const MAX_IMAGES_PER_MESSAGE = 5;


interface ChatTabProps {
  writeFile: (path: string, content: string) => void;
  files: Record<string, string>;
  getLatestFile: (path: string) => string | undefined;
  strategyPhase?: StrategyPhase;
  activePageId?: string | null;
  activePageName?: string | null;
  activeRoute?: string | null;
  onPhaseAction?: (action: "approve-problem-overview" | "approve-ideation" | "approve-solution-design") => void;
  /** Called when user sends their first message in hero phase (phase transition to manifesto) */
  onHeroSubmit?: () => void;
  /** Restore previous chat messages (e.g. from Supabase) */
  initialMessages?: import("ai").UIMessage[];
  /** Called when messages change for persistence */
  onMessagesChange?: (messages: import("ai").UIMessage[]) => void;
  /** Pre-fill the input field on mount (for new projects from dashboard) */
  initialInput?: string;
  /** Auto-submit on mount after initialInput is set */
  autoSubmit?: boolean;
  /** Draft inserted when the user chooses the explicit Fix in Chat recovery path */
  pendingRepairDraft?: RepairChatDraft | null;
  /** Called when an AI response that wrote code files completes — used to auto re-evaluate annotations */
  onBuildingResponseComplete?: (request: AutoAnnotationRequest) => void;
  /** Project ID for analytics tracking */
  projectId?: string;
}

export interface RepairChatDraft {
  pageId: string;
  pageName: string;
  route: string;
  errorText: string;
  errorPath?: string;
  nonce: number;
}

// Regex to match code blocks with file attribute
// Matches: ```lang file="path" or ```lang file="/path"
const CODE_BLOCK_REGEX = /```(\w+)?\s+file="([^"]+)"\n([\s\S]*?)```/g;

// Regex to match strategy JSON blocks
const MANIFESTO_REGEX = /```json\s+type="manifesto"\n([\s\S]*?)```/g;
const PERSONA_REGEX = /```json\s+type="personas"\n([\s\S]*?)```/g;
const FLOW_REGEX = /```json\s+type="(?:flow|ia)"\n([\s\S]*?)```/g;
const OPTIONS_REGEX = /```json\s+type="options"\n([\s\S]*?)```/g;
const PAGE_BUILT_REGEX = /```json\s+type="page-built"\n([\s\S]*?)```/g;
const CONFIDENCE_REGEX = /```json\s+type="confidence"\n([\s\S]*?)```/g;
const JOURNEY_MAPS_REGEX = /```json\s+type="journey-maps"\n([\s\S]*?)```/g;
const IDEAS_REGEX = /```json\s+type="ideas"\n([\s\S]*?)```/g;
const DECISION_CONNECTIONS_REGEX = /```json\s+type="decision-connections"\n([\s\S]*?)```/g;
const USER_FLOWS_REGEX = /```json\s+type="user-flows"\n([\s\S]*?)```/g;
const FEATURES_REGEX = /```json\s+type="features"\n([\s\S]*?)```/g;
const INSIGHTS_REGEX = /```json\s+type="insights"\n([\s\S]*?)```/g;
const ALIGNMENT_CHECK_REGEX = /```json\s+type="alignment-check"\n([\s\S]*?)```/g;


/**
 * Builds the full VFS context object for building-phase follow-ups and address-gaps.
 * Includes all page files, core files, strategy context, product brain, insights, and user flows.
 */
function buildBuildingPhaseVfsContext(
  files: Record<string, string>,
  options?: {
    /** Extra keys to merge into the returned context object */
    extra?: Record<string, string>;
  }
): Record<string, string> {
  const storeState = useStrategyStore.getState();
  const brainData = useProductBrainStore.getState().brainData;
  const docStore = useDocumentStore.getState();

  // Include all page files so AI can see what's already built
  const pageFiles = Object.entries(files)
    .filter(([path]) => path.startsWith("/pages/") && path.endsWith(".tsx"))
    .map(([path, content]) => `Current ${path}:\n\`\`\`tsx\n${content}\n\`\`\``);

  const coreFiles = ["/App.tsx", "/design-system.tsx", "/components/ui/index.ts"];
  const coreFileParts = coreFiles
    .filter((path) => files[path])
    .map((path) => `Current ${path}:\n\`\`\`tsx\n${files[path]}\n\`\`\``);

  const tokenReminder = `## IMPORTANT: Color Usage Reminder
Use ONLY semantic token classes (bg-primary, bg-card, text-foreground, text-muted-foreground, border-border, etc.).
NEVER use hardcoded colors (bg-blue-500, bg-gray-100, text-gray-600, etc.) as they break the user's theme customization.`;

  const allFileParts = [...coreFileParts, ...pageFiles];
  const vfs = allFileParts.length > 0
    ? `## Current VFS State (use this as your source of truth)\n\n${allFileParts.join("\n\n")}\n\n${tokenReminder}`
    : tokenReminder;

  const ctx: Record<string, string> = {
    vfs,
    manifestoContext: storeState.manifestoData
      ? `## Product Overview\n\nTitle: ${storeState.manifestoData.title}\nProblem: ${storeState.manifestoData.problemStatement}\nTarget User: ${storeState.manifestoData.targetUser}\nWhat ${storeState.manifestoData.targetUser} Need To Get Done:\n${storeState.manifestoData.jtbd.map((j, i) => `${i + 1}. ${j}`).join("\n")}\nHow Might We:\n${storeState.manifestoData.hmw.map((q, i) => `${i + 1}. ${q}`).join("\n")}`
      : "",
    personaContext: storeState.personaData
      ? `## User Personas\n\n${storeState.personaData.map((p, i) => `### Persona ${i + 1}: ${p.name}\nRole: ${p.role}\nBio: ${p.bio}\nGoals:\n${p.goals.map((g) => `- ${g}`).join("\n")}\nPain Points:\n${p.painPoints.map((pp) => `- ${pp}`).join("\n")}\nQuote: "${p.quote}"`).join("\n\n")}`
      : "",
    flowContext: storeState.flowData
      ? `## App Architecture\n\nPages to build:\n${storeState.flowData.nodes.filter((n) => n.type === "page").map((n) => `- ${n.label} (${n.id}): ${n.description || "No description"}`).join("\n")}`
      : "",
    existingConnections: brainData?.pages?.length
      ? `## Existing Product Brain Connections\n\n${JSON.stringify(brainData.pages.map((p) => ({ pageId: p.pageId, connections: p.connections })), null, 2)}`
      : "",
  };

  // Add insights context if available
  if (docStore.insightsData) {
    ctx.insightsContext = `## Research Insights\n\n${docStore.insightsData.insights.map((ins, i) => {
      const parts = [`${i + 1}. ${ins.insight}`];
      if (ins.sourceDocument) parts.push(`Source: ${ins.sourceDocument}`);
      if (ins.quote) parts.push(`Quote: "${ins.quote}"`);
      return parts.join(" — ");
    }).join("\n")}`;
  }

  // Add user flow context if available
  if (storeState.userFlowsData) {
    ctx.userFlowContext = `## User Flows (JTBD → Persona → Steps)\n\n${storeState.userFlowsData.map((flow) =>
      `### JTBD ${flow.jtbdIndex + 1}: ${flow.jtbdText}\nPersonas: ${flow.personaNames.join(", ")}\nSteps:\n${flow.steps.map((s, i) => `${i + 1}. [${s.nodeId}] ${s.action}`).join("\n")}`
    ).join("\n\n")}`;
  }

  // Merge any extra keys
  if (options?.extra) {
    Object.assign(ctx, options.extra);
  }

  return ctx;
}

/**
 * Builds a text summary of all existing strategy artifacts for document re-analysis.
 * Sent to the AI so it can compare new insights against current artifacts and decide
 * what needs updating vs. what remains valid.
 */
function buildExistingArtifactsContext(): string {
  const s = useStrategyStore.getState();
  const docStore = useDocumentStore.getState();
  const sections: string[] = [];

  // Insights
  if (docStore.insightsData && docStore.insightsData.insights.length > 0) {
    sections.push(`### EXISTING INSIGHTS\n\n${docStore.insightsData.insights.map((ins, i) => {
      const parts = [`${i + 1}. ${ins.insight}`];
      if (ins.sourceDocument) parts.push(`Source: ${ins.sourceDocument}`);
      if (ins.quote) parts.push(`Quote: "${ins.quote}"`);
      if (ins.source) parts.push(`(${ins.source})`);
      return parts.join(" — ");
    }).join("\n")}`);
  }

  // Manifesto
  if (s.manifestoData) {
    const m = s.manifestoData;
    sections.push(`### EXISTING MANIFESTO\n\nTitle: ${m.title}\nProblem Statement: ${m.problemStatement}\nTarget User: ${m.targetUser}\nJTBDs:\n${m.jtbd.map((j, i) => `${i + 1}. ${j}`).join("\n")}\nHMW:\n${m.hmw.map((q, i) => `${i + 1}. ${q}`).join("\n")}`);
  }

  // Personas
  if (s.personaData) {
    sections.push(`### EXISTING PERSONAS\n\n${s.personaData.map((p, i) =>
      `#### Persona ${i + 1}: ${p.name}\nRole: ${p.role}\nBio: ${p.bio}\nGoals:\n${p.goals.map((g) => `- ${g}`).join("\n")}\nPain Points:\n${p.painPoints.map((pp) => `- ${pp}`).join("\n")}\nQuote: "${p.quote}"`
    ).join("\n\n")}`);
  }

  // Journey Maps (abbreviated — stage names only to save tokens)
  if (s.journeyMapData) {
    sections.push(`### EXISTING JOURNEY MAPS\n\n${s.journeyMapData.map((jm) =>
      `#### ${jm.personaName}\nStages: ${jm.stages.map((st) => st.stage).join(" → ")}\nKey pain points: ${jm.stages.flatMap((st) => st.painPoints).slice(0, 5).join("; ")}`
    ).join("\n\n")}`);
  }

  // Key Features
  if (s.keyFeaturesData) {
    const kf = s.keyFeaturesData;
    sections.push(`### EXISTING KEY FEATURES (Idea: "${kf.ideaTitle}")\n\n${kf.features.map((f, i) =>
      `${i + 1}. **${f.name}** [${f.priority}]: ${f.description}`
    ).join("\n")}`);
  }

  // User Flows
  if (s.userFlowsData) {
    sections.push(`### EXISTING USER FLOWS\n\n${s.userFlowsData.map((flow) =>
      `#### JTBD ${flow.jtbdIndex + 1}: ${flow.jtbdText}\nPersonas: ${flow.personaNames.join(", ")}\nSteps:\n${flow.steps.map((step, i) => `${i + 1}. [${step.nodeId}] ${step.action}`).join("\n")}`
    ).join("\n\n")}`);
  }

  if (sections.length === 0) return "";
  return `## EXISTING ARTIFACTS (evaluate each against new insights)\n\n${sections.join("\n\n")}`;
}

function findPageNodeByComponentName(
  componentName: string,
  flowData: FlowData | null | undefined,
) {
  return flowData?.nodes.find(
    (node) => node.type === "page" && toPascalCase(node.label) === componentName
  );
}

function findPageIdForFilePath(
  filePath: string | undefined,
  flowData: FlowData | null | undefined,
): string | null {
  if (!filePath) return null;
  const match = filePath.match(/^\/pages\/([^/]+)\.tsx$/);
  if (!match) return null;
  return findPageNodeByComponentName(match[1], flowData)?.id ?? null;
}

function resolvePinnedPageIds(
  pinnedElements: PinnedElement[],
  flowData: FlowData | null | undefined,
): string[] {
  const pageIds = new Set<string>();
  for (const element of pinnedElements) {
    const pageId = findPageIdForFilePath(element.source.fileName, flowData);
    if (pageId) pageIds.add(pageId);
  }
  return [...pageIds];
}

function inferExplicitPageIdsFromPrompt(
  text: string,
  flowData: FlowData | null | undefined,
): string[] {
  const normalized = text.toLowerCase();
  if (!flowData) return [];

  const matches = new Set<string>();
  for (const node of flowData.nodes) {
    if (node.type !== "page") continue;
    const label = node.label.toLowerCase();
    const id = node.id.toLowerCase();
    const route = id === "home" ? "/" : `/${id}`;
    if (
      normalized.includes(label) ||
      normalized.includes(id) ||
      (route !== "/" && normalized.includes(route))
    ) {
      matches.add(node.id);
    }
  }
  return [...matches];
}

function inferPageIdsFromIaOrUserFlows(
  text: string,
  flowData: FlowData | null | undefined,
  userFlowsData: UserFlow[] | null | undefined,
): string[] {
  const normalized = text.toLowerCase();
  const matches = new Set<string>();

  flowData?.nodes.forEach((node) => {
    if (node.type !== "page" || !node.description) return;
    const description = node.description.toLowerCase();
    if (description.length >= 8 && normalized.includes(description)) {
      matches.add(node.id);
    }
  });

  userFlowsData?.forEach((flow) => {
    flow.steps.forEach((step) => {
      if (step.action && normalized.includes(step.action.toLowerCase())) {
        matches.add(step.nodeId);
      }
    });
  });

  return [...matches];
}

function inferInitialEditTargetPageIds(
  messageText: string,
  flowData: FlowData | null | undefined,
  userFlowsData: UserFlow[] | null | undefined,
  editContext: EditContext,
): string[] {
  if (editContext.pinnedPageIds.length > 0) return editContext.pinnedPageIds;
  if (editContext.activePageId) return [editContext.activePageId];

  const explicitMatches = inferExplicitPageIdsFromPrompt(messageText, flowData);
  if (explicitMatches.length > 0) return explicitMatches;

  return inferPageIdsFromIaOrUserFlows(messageText, flowData, userFlowsData);
}

function inferGapTargetPageIds(
  payload: AddressGapsPayload,
  userFlowsData: UserFlow[] | null | undefined,
  brainData: ProductBrainData | null | undefined,
): string[] {
  const pageIds = new Set<string>();
  const jtbdIndices = new Set(payload.unaddressedJtbds.map((jtbd) => jtbd.index));
  const jtbdTexts = new Set(
    payload.unaddressedJtbds.map((jtbd) => jtbd.text.trim().toLowerCase()).filter(Boolean)
  );
  const personaNames = new Set<string>();

  payload.gaps?.forEach((gap) => {
    const personaMatch = gap.match(/^([^:]+):\s*JTBD\s*#/i);
    if (personaMatch?.[1]) {
      personaNames.add(personaMatch[1].trim());
    }

    const jtbdMatch = gap.match(/"([^"]+)"/);
    if (jtbdMatch?.[1]) {
      jtbdTexts.add(jtbdMatch[1].trim().toLowerCase());
    }
  });

  userFlowsData?.forEach((flow) => {
    const matchesJtbd =
      jtbdIndices.has(flow.jtbdIndex) ||
      jtbdTexts.has(flow.jtbdText.trim().toLowerCase());
    const matchesPersona =
      personaNames.size > 0 &&
      flow.personaNames.some((personaName) => personaNames.has(personaName));

    if (!matchesJtbd && !matchesPersona) return;

    flow.steps.forEach((step) => {
      if (step.nodeId) {
        pageIds.add(step.nodeId);
      }
    });
  });

  brainData?.pages.forEach((page) => {
    const matchesJtbd = page.connections.some((connection) =>
      connection.jtbdIndices.some((index) => jtbdIndices.has(index))
    );
    const matchesPersona =
      personaNames.size > 0 &&
      page.connections.some((connection) =>
        connection.personaNames.some((personaName) => personaNames.has(personaName))
      );

    if (matchesJtbd || matchesPersona) {
      pageIds.add(page.pageId);
    }
  });

  return [...pageIds];
}

function normalizeAlignmentCheck(parsed: unknown): EditScope | null {
  if (!parsed || typeof parsed !== "object") return null;
  const data = parsed as Record<string, unknown>;
  if (typeof data.aligned !== "boolean") return null;

  const normalizeStringArray = (value: unknown): string[] =>
    Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];

  const rawChangeMode = data.changeMode;
  const changeMode =
    rawChangeMode === "address-gaps" ||
    rawChangeMode === "strategy-rebuild" ||
    rawChangeMode === "untracked"
      ? rawChangeMode
      : "follow-up-edit";

  return {
    aligned: data.aligned,
    targetPageIds: normalizeStringArray(data.targetPageIds),
    unchangedPageIds: normalizeStringArray(data.unchangedPageIds),
    addedPageIds: normalizeStringArray(data.addedPageIds),
    removedPageIds: normalizeStringArray(data.removedPageIds),
    requiresClarification: data.requiresClarification === true,
    requiresArtifactUpdateDecision: data.requiresArtifactUpdateDecision === true,
    concerns: normalizeStringArray(data.concerns),
    changeMode,
  };
}

function classifyArtifactEditPhase(messageText: string): StrategyPhase | null {
  const normalized = messageText.toLowerCase();
  if (
    /\b(ia|information architecture|user flow|user flows|architecture|key feature|key features)\b/.test(normalized)
  ) {
    return "solution-design";
  }
  if (
    /\b(persona|personas|jtbd|jobs to be done|jobs-to-be-done|journey map|journey maps|problem overview|problem statement|manifesto|target user|hmw|how might we|insight|insights|strategy)\b/.test(normalized)
  ) {
    return "problem-overview";
  }
  return null;
}

function buildCanonicalFlowForEdit(
  files: Record<string, string>,
  flowData: FlowData | null | undefined,
  editScope: EditScope | null,
): { pages: Array<{ id: string; name: string; route: string }>; connections: Array<{ from: string; to: string; label?: string }> } | null {
  if (!editScope) return null;
  if (editScope.addedPageIds.length === 0 && editScope.removedPageIds.length === 0) {
    return null;
  }

  let currentFlow: { pages: Array<{ id: string; name: string; route: string }>; connections: Array<{ from: string; to: string; label?: string }> };
  try {
    currentFlow = files["/flow.json"]
      ? JSON.parse(files["/flow.json"])
      : { pages: [], connections: [] };
  } catch {
    currentFlow = { pages: [], connections: [] };
  }

  const removedIds = new Set(editScope.removedPageIds);
  const pages = (currentFlow.pages || []).filter((page) => !removedIds.has(page.id));
  const connections = (currentFlow.connections || []).filter(
    (connection) => !removedIds.has(connection.from) && !removedIds.has(connection.to)
  );

  for (const pageId of editScope.addedPageIds) {
    if (pages.some((page) => page.id === pageId)) continue;
    const strategyNode = flowData?.nodes.find((node) => node.type === "page" && node.id === pageId);
    if (!strategyNode) continue;

    pages.push({
      id: pageId,
      name: strategyNode.label,
      route: pageId === "home" ? "/" : `/${pageId}`,
    });

    flowData?.connections
      .filter((connection) => connection.from === pageId || connection.to === pageId)
      .forEach((connection) => {
        if (removedIds.has(connection.from) || removedIds.has(connection.to)) return;
        if (!pages.some((page) => page.id === connection.from) || !pages.some((page) => page.id === connection.to)) {
          return;
        }
        const exists = connections.some(
          (item) =>
            item.from === connection.from &&
            item.to === connection.to &&
            item.label === connection.label
        );
        if (!exists) {
          connections.push({
            from: connection.from,
            to: connection.to,
            label: connection.label,
          });
        }
      });
  }

  return { pages, connections };
}

interface OptionBlock {
  question: string;
  options: string[];
}

// Module-scoped sets to survive component remounts (e.g., docked → floating switch)
const processedBlocksSet = new Set<string>();
const processedStrategyBlocksSet = new Set<string>();
const flowJsonSyncedMessages = new Set<string>();
const routeConsistencySyncedMessages = new Set<string>();
/** Track which files were written per assistant message ID — used by verification loop */
const writtenFilesPerMessage = new Map<string, string[]>();
/** Track which messages have already been verified */
const verifiedMessages = new Set<string>();

function extractCodeBlocks(text: string): Array<{ path: string; content: string }> {
  const blocks: Array<{ path: string; content: string }> = [];
  let match;

  while ((match = CODE_BLOCK_REGEX.exec(text)) !== null) {
    const path = match[2].startsWith("/") ? match[2] : `/${match[2]}`;
    const content = match[3].trim();
    blocks.push({ path, content });
  }

  // Reset regex state
  CODE_BLOCK_REGEX.lastIndex = 0;

  return blocks;
}

// --- Partial overview extraction for real-time streaming ---

function extractJsonStringValue(content: string, key: string): string | undefined {
  const keyPattern = `"${key}"`;
  const keyIdx = content.indexOf(keyPattern);
  if (keyIdx === -1) return undefined;

  // Find the colon after the key
  let i = keyIdx + keyPattern.length;
  while (i < content.length && content[i] !== ':') i++;
  if (i >= content.length) return undefined;
  i++; // skip colon

  // Find opening quote
  while (i < content.length && content[i] !== '"') i++;
  if (i >= content.length) return undefined;
  i++; // skip opening quote

  // Read until closing quote or end of content
  let value = '';
  while (i < content.length) {
    if (content[i] === '\\' && i + 1 < content.length) {
      const next = content[i + 1];
      if (next === '"') value += '"';
      else if (next === 'n') value += '\n';
      else if (next === '\\') value += '\\';
      else value += next;
      i += 2;
    } else if (content[i] === '"') {
      return value; // complete value
    } else {
      value += content[i];
      i++;
    }
  }
  // No closing quote — partial value still being streamed
  return value;
}

function extractJsonArrayItems(content: string, key: string): string[] | undefined {
  const keyPattern = `"${key}"`;
  const keyIdx = content.indexOf(keyPattern);
  if (keyIdx === -1) return undefined;

  let i = keyIdx + keyPattern.length;
  while (i < content.length && content[i] !== '[') i++;
  if (i >= content.length) return undefined;
  i++; // skip [

  const items: string[] = [];
  while (i < content.length) {
    while (i < content.length && /[\s,]/.test(content[i])) i++;
    if (i >= content.length || content[i] === ']') break;

    if (content[i] === '"') {
      i++; // skip opening quote
      let value = '';
      let closed = false;
      while (i < content.length) {
        if (content[i] === '\\' && i + 1 < content.length) {
          const next = content[i + 1];
          if (next === '"') value += '"';
          else if (next === 'n') value += '\n';
          else if (next === '\\') value += '\\';
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
      if (!closed) break; // partial item — stop here
    } else {
      i++;
    }
  }
  return items.length > 0 ? items : undefined;
}

function extractPartialOverview(text: string): Partial<import("@/hooks/useStrategyStore").ManifestoData> | null {
  const marker = '```json type="manifesto"';
  const blockStart = text.indexOf(marker);
  if (blockStart === -1) return null;

  const content = text.slice(blockStart + marker.length);
  const result: Partial<import("@/hooks/useStrategyStore").ManifestoData> = {};

  const title = extractJsonStringValue(content, 'title');
  if (title !== undefined) result.title = title;

  const problemStatement = extractJsonStringValue(content, 'problemStatement');
  if (problemStatement !== undefined) result.problemStatement = problemStatement;

  const targetUser = extractJsonStringValue(content, 'targetUser');
  if (targetUser !== undefined) result.targetUser = targetUser;

  const jtbd = extractJsonArrayItems(content, 'jtbd');
  if (jtbd !== undefined) result.jtbd = jtbd;

  const hmw = extractJsonArrayItems(content, 'hmw');
  if (hmw !== undefined) result.hmw = hmw;

  return Object.keys(result).length > 0 ? result : null;
}

function extractPartialPersonas(text: string): Partial<PersonaData>[] | null {
  const marker = '```json type="personas"';
  const blockStart = text.indexOf(marker);
  if (blockStart === -1) return null;

  const content = text.slice(blockStart + marker.length);

  // Try to find personas by looking for object boundaries in the array
  const personas: Partial<PersonaData>[] = [];
  let depth = 0;
  let inString = false;
  let escape = false;
  let objectStart = -1;

  for (let i = 0; i < content.length; i++) {
    const ch = content[i];

    if (escape) {
      escape = false;
      continue;
    }

    if (ch === '\\' && inString) {
      escape = true;
      continue;
    }

    if (ch === '"') {
      inString = !inString;
      continue;
    }

    if (inString) continue;

    if (ch === '{') {
      if (depth === 0) objectStart = i;
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0 && objectStart !== -1) {
        const objStr = content.slice(objectStart, i + 1);
        try {
          const parsed = JSON.parse(objStr);
          if (parsed.name || parsed.role) {
            personas.push(parsed);
          }
        } catch {
          // Incomplete object — try partial extraction
          const partial: Partial<PersonaData> = {};
          const name = extractJsonStringValue(objStr, 'name');
          if (name !== undefined) partial.name = name;
          const role = extractJsonStringValue(objStr, 'role');
          if (role !== undefined) partial.role = role;
          const bio = extractJsonStringValue(objStr, 'bio');
          if (bio !== undefined) partial.bio = bio;
          const goals = extractJsonArrayItems(objStr, 'goals');
          if (goals !== undefined) partial.goals = goals;
          const painPoints = extractJsonArrayItems(objStr, 'painPoints');
          if (painPoints !== undefined) partial.painPoints = painPoints;
          const quote = extractJsonStringValue(objStr, 'quote');
          if (quote !== undefined) partial.quote = quote;
          if (Object.keys(partial).length > 0) {
            personas.push(partial);
          }
        }
        objectStart = -1;
      }
    }
  }

  // Handle currently-streaming object (depth > 0 means unclosed)
  if (depth > 0 && objectStart !== -1) {
    const partialStr = content.slice(objectStart);
    const partial: Partial<PersonaData> = {};
    const name = extractJsonStringValue(partialStr, 'name');
    if (name !== undefined) partial.name = name;
    const role = extractJsonStringValue(partialStr, 'role');
    if (role !== undefined) partial.role = role;
    const bio = extractJsonStringValue(partialStr, 'bio');
    if (bio !== undefined) partial.bio = bio;
    const goals = extractJsonArrayItems(partialStr, 'goals');
    if (goals !== undefined) partial.goals = goals;
    const painPoints = extractJsonArrayItems(partialStr, 'painPoints');
    if (painPoints !== undefined) partial.painPoints = painPoints;
    const quote = extractJsonStringValue(partialStr, 'quote');
    if (quote !== undefined) partial.quote = quote;
    if (Object.keys(partial).length > 0) {
      personas.push(partial);
    }
  }

  return personas.length > 0 ? personas : null;
}

// --- Partial journey map extraction for real-time streaming ---

function extractPartialJourneyMaps(text: string): Partial<JourneyMapData>[] | null {
  const marker = '```json type="journey-maps"';
  const blockStart = text.indexOf(marker);
  if (blockStart === -1) return null;

  const content = text.slice(blockStart + marker.length);

  const maps: Partial<JourneyMapData>[] = [];
  let depth = 0;
  let inString = false;
  let escape = false;
  let objectStart = -1;

  for (let i = 0; i < content.length; i++) {
    const ch = content[i];

    if (escape) { escape = false; continue; }
    if (ch === '\\' && inString) { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;

    if (ch === '{') {
      if (depth === 0) objectStart = i;
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0 && objectStart !== -1) {
        const objStr = content.slice(objectStart, i + 1);
        try {
          const parsed = JSON.parse(objStr);
          if (parsed.personaName) {
            maps.push(parsed);
          }
        } catch {
          const partial = extractPartialJourneyMap(objStr);
          if (partial) maps.push(partial);
        }
        objectStart = -1;
      }
    }
  }

  // Handle currently-streaming object
  if (depth > 0 && objectStart !== -1) {
    const partialStr = content.slice(objectStart);
    const partial = extractPartialJourneyMap(partialStr);
    if (partial) maps.push(partial);
  }

  return maps.length > 0 ? maps : null;
}

function extractPartialJourneyMap(objStr: string): Partial<JourneyMapData> | null {
  const partial: Partial<JourneyMapData> = {};
  const personaName = extractJsonStringValue(objStr, 'personaName');
  if (personaName !== undefined) partial.personaName = personaName;

  // Extract complete stage objects from the "stages" array
  const stagesIdx = objStr.indexOf('"stages"');
  if (stagesIdx !== -1) {
    const stages = extractCompleteStages(objStr.slice(stagesIdx));
    if (stages.length > 0) partial.stages = stages as JourneyStage[];
  }

  return Object.keys(partial).length > 0 ? partial : null;
}

function extractCompleteStages(stagesStr: string): Partial<JourneyStage>[] {
  let arrayStart = stagesStr.indexOf('[');
  if (arrayStart === -1) return [];
  arrayStart++;

  const stages: Partial<JourneyStage>[] = [];
  let depth = 0;
  let inString = false;
  let escape = false;
  let objectStart = -1;

  for (let i = arrayStart; i < stagesStr.length; i++) {
    const ch = stagesStr[i];

    if (escape) { escape = false; continue; }
    if (ch === '\\' && inString) { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;

    if (ch === '{') {
      if (depth === 0) objectStart = i;
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0 && objectStart !== -1) {
        const objStr = stagesStr.slice(objectStart, i + 1);
        try {
          const parsed = JSON.parse(objStr);
          if (parsed.stage) stages.push(parsed);
        } catch { /* skip */ }
        objectStart = -1;
      }
    } else if (ch === ']' && depth === 0) {
      break;
    }
  }

  // Handle streaming partial stage
  if (depth > 0 && objectStart !== -1) {
    const partialStr = stagesStr.slice(objectStart);
    const stage: Partial<JourneyStage> = {};
    const stageName = extractJsonStringValue(partialStr, 'stage');
    if (stageName !== undefined) stage.stage = stageName;
    const actions = extractJsonArrayItems(partialStr, 'actions');
    if (actions !== undefined) stage.actions = actions;
    const thoughts = extractJsonArrayItems(partialStr, 'thoughts');
    if (thoughts !== undefined) stage.thoughts = thoughts;
    const emotion = extractJsonStringValue(partialStr, 'emotion');
    if (emotion !== undefined) stage.emotion = emotion;
    const painPoints = extractJsonArrayItems(partialStr, 'painPoints');
    if (painPoints !== undefined) stage.painPoints = painPoints;
    const opportunities = extractJsonArrayItems(partialStr, 'opportunities');
    if (opportunities !== undefined) stage.opportunities = opportunities;
    if (Object.keys(stage).length > 0) stages.push(stage);
  }

  return stages;
}

// --- Partial idea extraction for real-time streaming ---

function extractPartialIdeas(text: string): Partial<IdeaData>[] | null {
  const marker = '```json type="ideas"';
  const blockStart = text.indexOf(marker);
  if (blockStart === -1) return null;

  const content = text.slice(blockStart + marker.length);

  const ideas: Partial<IdeaData>[] = [];
  let depth = 0;
  let inString = false;
  let escape = false;
  let objectStart = -1;

  for (let i = 0; i < content.length; i++) {
    const ch = content[i];

    if (escape) { escape = false; continue; }
    if (ch === '\\' && inString) { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;

    if (ch === '{') {
      if (depth === 0) objectStart = i;
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0 && objectStart !== -1) {
        const objStr = content.slice(objectStart, i + 1);
        try {
          const parsed = JSON.parse(objStr);
          if (parsed.id || parsed.title) {
            ideas.push(parsed);
          }
        } catch {
          const partial: Partial<IdeaData> = {};
          const id = extractJsonStringValue(objStr, 'id');
          if (id !== undefined) partial.id = id;
          const title = extractJsonStringValue(objStr, 'title');
          if (title !== undefined) partial.title = title;
          const description = extractJsonStringValue(objStr, 'description');
          if (description !== undefined) partial.description = description;
          const illustration = extractJsonStringValue(objStr, 'illustration');
          if (illustration !== undefined) partial.illustration = illustration;
          if (Object.keys(partial).length > 0) {
            ideas.push(partial);
          }
        }
        objectStart = -1;
      }
    }
  }

  // Handle currently-streaming object (depth > 0 means unclosed)
  if (depth > 0 && objectStart !== -1) {
    const partialStr = content.slice(objectStart);
    const partial: Partial<IdeaData> = {};
    const id = extractJsonStringValue(partialStr, 'id');
    if (id !== undefined) partial.id = id;
    const title = extractJsonStringValue(partialStr, 'title');
    if (title !== undefined) partial.title = title;
    const description = extractJsonStringValue(partialStr, 'description');
    if (description !== undefined) partial.description = description;
    const illustration = extractJsonStringValue(partialStr, 'illustration');
    if (illustration !== undefined) partial.illustration = illustration;
    if (Object.keys(partial).length > 0) {
      ideas.push(partial);
    }
  }

  return ideas.length > 0 ? ideas : null;
}

// --- Partial user flow extraction for real-time streaming ---

function extractPartialUserFlows(text: string): Partial<UserFlow>[] | null {
  const marker = '```json type="user-flows"';
  const blockStart = text.indexOf(marker);
  if (blockStart === -1) return null;

  const content = text.slice(blockStart + marker.length);

  // Try full parse first
  const closingIdx = content.indexOf('```');
  if (closingIdx !== -1) {
    try {
      const parsed = JSON.parse(content.slice(0, closingIdx));
      if (Array.isArray(parsed)) return parsed;
    } catch { /* fall through to partial */ }
  }

  // Partial: extract complete flow objects from the array
  const arrStart = content.indexOf('[');
  if (arrStart === -1) return null;

  const flows: Partial<UserFlow>[] = [];
  let depth = 0;
  let inString = false;
  let escape = false;
  let objectStart = -1;

  for (let i = arrStart + 1; i < content.length; i++) {
    const ch = content[i];

    if (escape) { escape = false; continue; }
    if (ch === '\\' && inString) { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;

    if (ch === '{') {
      if (depth === 0) objectStart = i;
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0 && objectStart !== -1) {
        const objStr = content.slice(objectStart, i + 1);
        try {
          const parsed = JSON.parse(objStr);
          if (parsed.id && parsed.steps) {
            flows.push(parsed);
          }
        } catch { /* skip incomplete */ }
        objectStart = -1;
      }
    } else if (ch === ']' && depth === 0) {
      break;
    }
  }

  return flows.length > 0 ? flows : null;
}

// --- Partial key features extraction for real-time streaming ---

function extractPartialKeyFeatures(text: string): Partial<KeyFeaturesData> | null {
  const marker = '```json type="features"';
  const blockStart = text.indexOf(marker);
  if (blockStart === -1) return null;

  const content = text.slice(blockStart + marker.length);

  // Try full parse first
  const closingIdx = content.indexOf('```');
  if (closingIdx !== -1) {
    try {
      const parsed = JSON.parse(content.slice(0, closingIdx));
      if (parsed.features && Array.isArray(parsed.features)) {
        return parsed;
      }
    } catch { /* fall through to partial */ }
  }

  // Partial extraction
  const result: Partial<KeyFeaturesData> = {};
  const ideaTitle = extractJsonStringValue(content, 'ideaTitle');
  if (ideaTitle !== undefined) result.ideaTitle = ideaTitle;

  // Extract complete + currently-streaming feature objects from the "features" array
  const featuresIdx = content.indexOf('"features"');
  if (featuresIdx !== -1) {
    const features: { name: string; description: string; priority: "high" | "medium" | "low" }[] = [];
    let arrStart = content.indexOf('[', featuresIdx);
    if (arrStart !== -1) {
      arrStart++;
      let depth = 0;
      let inString = false;
      let escape = false;
      let objectStart = -1;
      let lastIncompleteStart = -1;

      for (let i = arrStart; i < content.length; i++) {
        const ch = content[i];
        if (escape) { escape = false; continue; }
        if (ch === '\\' && inString) { escape = true; continue; }
        if (ch === '"') { inString = !inString; continue; }
        if (inString) continue;

        if (ch === '{') {
          if (depth === 0) objectStart = i;
          depth++;
        } else if (ch === '}') {
          depth--;
          if (depth === 0 && objectStart !== -1) {
            const objStr = content.slice(objectStart, i + 1);
            try {
              const parsed = JSON.parse(objStr);
              if (parsed.name) features.push(parsed);
            } catch { /* skip incomplete */ }
            objectStart = -1;
          }
        } else if (ch === ']' && depth === 0) {
          break;
        }
      }

      // If there's an unclosed object being streamed, extract partial fields from it
      if (depth > 0 && objectStart !== -1) {
        lastIncompleteStart = objectStart;
      }

      if (lastIncompleteStart !== -1) {
        const partialObj = content.slice(lastIncompleteStart);
        const name = extractJsonStringValue(partialObj, 'name');
        if (name) {
          const description = extractJsonStringValue(partialObj, 'description') ?? '';
          const priorityRaw = extractJsonStringValue(partialObj, 'priority');
          const priority = (priorityRaw === 'high' || priorityRaw === 'medium' || priorityRaw === 'low') ? priorityRaw : undefined;
          features.push({ name, description, priority: priority ?? 'medium' });
        }
      }
    }
    if (features.length > 0) result.features = features;
  }

  return Object.keys(result).length > 0 ? result : null;
}

// --- User flow serialization for build context ---

function serializeUserFlows(flows: UserFlow[], flowData: FlowData | null): string {
  return flows.map((flow) => {
    const personas = flow.personaNames.join(", ");
    const steps = flow.steps.map((step, i) => {
      const node = flowData?.nodes.find((n) => n.id === step.nodeId);
      const label = node?.label ?? step.nodeId;
      return `${i + 1}. ${label} → ${step.action}`;
    }).join("\n");
    return `### JTBD: "${flow.jtbdText}"\nPersonas: ${personas}\nSteps:\n${steps}`;
  }).join("\n\n");
}

// --- Partial insights extraction for real-time streaming ---
function extractPartialInsights(text: string): Partial<InsightsCardData> | null {
  const marker = '```json type="insights"';
  const blockStart = text.indexOf(marker);
  if (blockStart === -1) return null;

  const content = text.slice(blockStart + marker.length);
  const result: Partial<InsightsCardData> = {};

  // Extract insights array
  const insightsArrayStart = content.indexOf('"insights"');
  if (insightsArrayStart !== -1) {
    // Find the opening bracket of the insights array
    let i = insightsArrayStart + '"insights"'.length;
    while (i < content.length && content[i] !== '[') i++;
    if (i < content.length) {
      i++; // skip [
      const insights: Partial<InsightData>[] = [];
      let depth = 0;
      let inString = false;
      let escape = false;
      let objectStart = -1;

      for (let j = i; j < content.length; j++) {
        const ch = content[j];
        if (escape) { escape = false; continue; }
        if (ch === '\\') { escape = true; continue; }
        if (ch === '"') { inString = !inString; continue; }
        if (inString) continue;

        if (ch === '{') {
          if (depth === 0) objectStart = j;
          depth++;
        } else if (ch === '}') {
          depth--;
          if (depth === 0 && objectStart !== -1) {
            const objectStr = content.slice(objectStart, j + 1);
            try {
              const parsed = JSON.parse(objectStr);
              insights.push(parsed);
            } catch {
              // Partial object — try extracting fields manually
              const partial: Partial<InsightData> = {};
              const insight = extractJsonStringValue(objectStr, 'insight');
              if (insight) partial.insight = insight;
              const quote = extractJsonStringValue(objectStr, 'quote');
              if (quote) partial.quote = quote;
              const sourceDocument = extractJsonStringValue(objectStr, 'sourceDocument');
              if (sourceDocument) partial.sourceDocument = sourceDocument;
              if (Object.keys(partial).length > 0) insights.push(partial);
            }
            objectStart = -1;
          }
        } else if (ch === ']' && depth === 0) {
          break;
        }
      }

      // Handle partial last object (still being streamed)
      if (objectStart !== -1 && depth > 0) {
        const partialStr = content.slice(objectStart);
        const partial: Partial<InsightData> = {};
        const insight = extractJsonStringValue(partialStr, 'insight');
        if (insight) partial.insight = insight;
        const quote = extractJsonStringValue(partialStr, 'quote');
        if (quote) partial.quote = quote;
        const sourceDocument = extractJsonStringValue(partialStr, 'sourceDocument');
        if (sourceDocument) partial.sourceDocument = sourceDocument;
        if (Object.keys(partial).length > 0) insights.push(partial);
      }

      if (insights.length > 0) result.insights = insights as InsightData[];
    }
  }

  // Extract documents array
  const docsArrayStart = content.indexOf('"documents"');
  if (docsArrayStart !== -1) {
    let i = docsArrayStart + '"documents"'.length;
    while (i < content.length && content[i] !== '[') i++;
    if (i < content.length) {
      i++;
      const docs: { name: string; uploadedAt: string }[] = [];
      let depth = 0;
      let inString = false;
      let escape = false;
      let objectStart = -1;

      for (let j = i; j < content.length; j++) {
        const ch = content[j];
        if (escape) { escape = false; continue; }
        if (ch === '\\') { escape = true; continue; }
        if (ch === '"') { inString = !inString; continue; }
        if (inString) continue;

        if (ch === '{') {
          if (depth === 0) objectStart = j;
          depth++;
        } else if (ch === '}') {
          depth--;
          if (depth === 0 && objectStart !== -1) {
            const objectStr = content.slice(objectStart, j + 1);
            try {
              const parsed = JSON.parse(objectStr);
              if (parsed.name) docs.push(parsed);
            } catch {
              // ignore partial doc objects
            }
            objectStart = -1;
          }
        } else if (ch === ']' && depth === 0) {
          break;
        }
      }

      if (docs.length > 0) result.documents = docs;
    }
  }

  return Object.keys(result).length > 0 ? result : null;
}

function extractOptionBlocks(text: string): OptionBlock[] {
  const blocks: OptionBlock[] = [];
  let match;
  while ((match = OPTIONS_REGEX.exec(text)) !== null) {
    try {
      const parsed = JSON.parse(match[1]);
      if (parsed.question && Array.isArray(parsed.options) && parsed.options.length >= 2) {
        blocks.push({ question: parsed.question, options: parsed.options });
      }
    } catch {
      // Skip invalid JSON
    }
  }
  OPTIONS_REGEX.lastIndex = 0;
  return blocks;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Message type varies across AI SDK versions
function getMessageText(message: any): string {
  // Try parts first (AI SDK v6 format)
  if (message.parts && Array.isArray(message.parts)) {
    const text = message.parts
      .filter((part: { type: string }) => part.type === "text")
      .map((part: { text: string }) => part.text)
      .join("");
    if (text) return text;
  }
  // Fallback to content property (older format)
  if ("content" in message && typeof message.content === "string") {
    return message.content;
  }
  return "";
}

export function ChatTab({
  writeFile,
  files,
  getLatestFile,
  strategyPhase,
  activePageId,
  activePageName,
  activeRoute,
  onPhaseAction,
  onHeroSubmit,
  initialMessages,
  onMessagesChange,
  initialInput,
  autoSubmit,
  pendingRepairDraft,
  onBuildingResponseComplete,
  projectId,
}: ChatTabProps) {
  const [input, setInput] = useState(initialInput ?? "");
  const [stagedImages, setStagedImages] = useState<FileUIPart[]>([]);
  const showLimitModal = useBillingStore((s) => s.showLimitModal);
  const billingLimitReached = useBillingStore((s) => s.billingLimitReached);
  const [isDragOver, setIsDragOver] = useState(false);
  const [activeRepairContext, setActiveRepairContext] = useState<RepairChatDraft | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { pinnedElements, unpinElement, clearPinnedElements } = useChatContextStore();
  const pendingAddressGaps = useChatContextStore((s) => s.pendingAddressGaps);
  const manifestoData = useStrategyStore((s) => s.manifestoData);
  const personaData = useStrategyStore((s) => s.personaData);
  const journeyMapData = useStrategyStore((s) => s.journeyMapData);
  const ideaData = useStrategyStore((s) => s.ideaData);
  const selectedIdeaId = useStrategyStore((s) => s.selectedIdeaId);
  const flowData = useStrategyStore((s) => s.flowData);
  const confidenceData = useStrategyStore((s) => s.confidenceData);
  const isDeepDive = useStrategyStore((s) => s.isDeepDive);
  const uploadedDocuments = useDocumentStore((s) => s.documents);
  const isDocUploading = useDocumentStore((s) => s.isUploading);
  const pendingReanalysis = useDocumentStore((s) => s.pendingReanalysis);
  const docFileInputRef = useRef<HTMLInputElement>(null);
  const completedPages = useStrategyStore((s) => s.completedPages);
  const userFlowsData = useStrategyStore((s) => s.userFlowsData);
  const currentBuildingPage = useStrategyStore((s) => s.currentBuildingPage);
  const editScope = useStrategyStore((s) => s.editScope);
  const activeEditingPageIds = useStrategyStore((s) => s.activeEditingPageIds);
  const brainData = useProductBrainStore((s) => s.brainData);
  const isJourneyMapContinuing = useStrategyStore((s) => s.isJourneyMapContinuing);
  const journeyMapContinueAttempts = useStrategyStore((s) => s.journeyMapContinueAttempts);
  const parallelMode = useStreamingStore((s) => s.parallelMode);
  const pageBuilds = useStreamingStore((s) => s.pageBuilds);
  const buildPhase = useStreamingStore((s) => s.buildPhase);
  const foundationPageId = useStreamingStore((s) => s.foundationPageId);
  const foundationBuild = useStreamingStore((s) => s.foundationBuild);
  const annotationEvaluation = useStreamingStore((s) => s.annotationEvaluation);
  const verificationPaused = useStreamingStore((s) => s.verificationPaused);
  const verificationPausedPageId = useStreamingStore((s) => s.verificationPausedPageId);
  const requestRepairInChat = useStreamingStore((s) => s.requestRepairInChat);

  // Strategy alignment check state
  const [alignmentCheckPending, setAlignmentCheckPending] = useState(false);
  const alignmentCheckOriginalRequest = useRef<string | null>(null);

  // Parallel build orchestrator
  const parallelBuild = useParallelBuild({ writeFile, files, getLatestFile, projectId });
  const cancelParallelBuildRef = useRef(parallelBuild.cancelAll);
  const parallelBuildConfigRef = useRef<{
    pages: { pageId: string; pageName: string; componentName: string; pageRoute: string }[];
    sharedContext: { manifestoContext: string; personaContext: string; flowContext: string };
  } | null>(null);
  const parallelPageNamesRef = useRef<Record<string, { name: string; route: string }>>({});
  const failedAnnotationPageNames = useMemo(
    () =>
      annotationEvaluation.failedPageIds.map(
        (pageId) => parallelPageNamesRef.current[pageId]?.name ?? pageId
      ),
    [annotationEvaluation.failedPageIds]
  );
  const annotationProcessedPages = annotationEvaluation.completedPages + annotationEvaluation.failedPages;
  const annotationActiveStep = Math.min(
    annotationEvaluation.totalPages,
    annotationProcessedPages + (annotationEvaluation.activePageId ? 1 : 0)
  );

  useEffect(() => {
    cancelParallelBuildRef.current = parallelBuild.cancelAll;
  }, [parallelBuild.cancelAll]);

  useEffect(() => {
    return () => {
      cancelParallelBuildRef.current();
    };
  }, []);

  const { messages, sendMessage, status, error, stop } = useChat({
    messages: initialMessages,
    onError: (err) => {
      console.error("Chat error:", err);
      // AI SDK v6 puts the response body in err.message (no .status property)
      try {
        const body = JSON.parse(err.message);
        if (body.code === "BILLING_LIMIT") {
          showLimitModal(body.message || "Usage limit reached");
          return;
        }
      } catch {
        // Not JSON — fall through to generic handler
      }
      toast.error("AI response failed — please try again");
      trackEvent("ai_response_error", projectId, { error: String(err).slice(0, 500) });
    },
  });

  // Pre-populate dedup sets with restored messages so they don't re-trigger VFS writes
  const didPrePopulateRef = useRef(false);
  useEffect(() => {
    if (didPrePopulateRef.current || !initialMessages?.length) return;
    didPrePopulateRef.current = true;
    for (const msg of initialMessages) {
      if (msg.role !== "assistant") continue;
      const text = getMessageText(msg);
      if (!text) continue;
      // Mark file code blocks as already processed
      let m;
      while ((m = CODE_BLOCK_REGEX.exec(text)) !== null) {
        const path = m[2].startsWith("/") ? m[2] : `/${m[2]}`;
        const content = m[3].trim();
        processedBlocksSet.add(`${msg.id}-${path}-${content.length}`);
      }
      CODE_BLOCK_REGEX.lastIndex = 0;
      // Mark strategy blocks as already processed (keys must match processing format: `${prefix}-${msgId}-${matchIndex}`)
      const strategyRegexWithPrefix: [RegExp, string][] = [
        [INSIGHTS_REGEX, "insights"],
        [MANIFESTO_REGEX, "manifesto"],
        [PERSONA_REGEX, "personas"],
        [JOURNEY_MAPS_REGEX, "journey-maps"],
        [IDEAS_REGEX, "ideas"],
        [FLOW_REGEX, "flow"],
        [FEATURES_REGEX, "features"],
        [USER_FLOWS_REGEX, "user-flows"],
        [PAGE_BUILT_REGEX, "page-built"],
        [DECISION_CONNECTIONS_REGEX, "decision-connections"],
        [ALIGNMENT_CHECK_REGEX, "alignment-check"],
        [CONFIDENCE_REGEX, "confidence"],
        [OPTIONS_REGEX, "options"],
      ];
      for (const [re, prefix] of strategyRegexWithPrefix) {
        let sm;
        while ((sm = re.exec(text)) !== null) {
          processedStrategyBlocksSet.add(`${prefix}-${msg.id}-${sm.index}`);
        }
        re.lastIndex = 0;
      }
      // Mark flow.json and route consistency synced
      if (hasFileCodeBlocks(text)) {
        flowJsonSyncedMessages.add(msg.id);
        routeConsistencySyncedMessages.add(msg.id);
      }
    }
  }, [initialMessages]);

  // Ref to trigger submit programmatically from effects
  const pendingSubmitRef = useRef<string | null>(null);
  const didAutoSubmitRef = useRef(false);
  const lastRepairDraftNonceRef = useRef<number | null>(null);
  const requestPhaseRef = useRef<StrategyPhase | null>(null);

  const isLoading = status === "submitted" || status === "streaming";

  const beginEditingRequest = useCallback((
    context: EditContext,
    messageText: string,
    seededPageIds?: string[],
  ) => {
    const strategyStore = useStrategyStore.getState();
    strategyStore.setEditContext(context);
    strategyStore.setEditScope(null);
    strategyStore.setActiveEditingPageIds(
      seededPageIds && seededPageIds.length > 0
        ? seededPageIds
        : inferInitialEditTargetPageIds(messageText, flowData, userFlowsData, context)
    );
    strategyStore.setPhase("editing");
  }, [flowData, userFlowsData]);

  useEffect(() => {
    if (!pendingRepairDraft) return;
    if (lastRepairDraftNonceRef.current === pendingRepairDraft.nonce) return;

    lastRepairDraftNonceRef.current = pendingRepairDraft.nonce;
    setActiveRepairContext(pendingRepairDraft);
    setInput(
      `I hit a preview error on ${pendingRepairDraft.pageName} (${pendingRepairDraft.route}). I'm attaching a screenshot of the error. Please fix the code causing it.`
    );

    setTimeout(() => inputRef.current?.focus(), 50);
  }, [pendingRepairDraft]);

  // Clear alignment check state when a new message is being sent
  useEffect(() => {
    if (isLoading) {
      setAlignmentCheckPending(false);
    }
  }, [isLoading]);

  // Notify parent of message changes for persistence.
  // Only fires when NOT streaming, to avoid excessive parent re-renders during AI
  // response generation that can disrupt viewport animations and layout calculations.
  useEffect(() => {
    if (isLoading) return;
    onMessagesChange?.(messages);
  }, [messages, isLoading, onMessagesChange]);

  // Is ideation currently streaming?
  const isIdeationStreaming = isLoading && strategyPhase === "ideation";

  // Computed confidence overall (average of dimension scores)
  const computedConfidenceOverall = useMemo(() => {
    if (!confidenceData) return 0;
    const scores = Object.values(confidenceData.dimensions).map((d) => d.score);
    return scores.length > 0
      ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
      : 0;
  }, [confidenceData]);

  // Stop ideation and commit whatever partial ideas have been generated so far
  const handleStopIdeation = useCallback(() => {
    stop();
    const storeState = useStrategyStore.getState();
    const partialIdeas = storeState.streamingIdeas;
    if (partialIdeas && partialIdeas.length > 0) {
      // Commit partial ideas as final — filter to ones that have at least a title
      const viable = partialIdeas.filter((idea): idea is IdeaData =>
        !!(idea.id && idea.title)
      );
      if (viable.length > 0) {
        storeState.setIdeaData(viable);
      }
      storeState.setStreamingIdeas(null);
    }
  }, [stop]);

  // --- Document Upload Handler ---
  const handleDocumentUpload = useCallback(async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;

    const validFiles = Array.from(fileList).filter((f) => {
      const ext = f.name.split(".").pop()?.toLowerCase();
      return ext === "pdf" || ext === "docx";
    });

    if (validFiles.length === 0) {
      toast.error("Please upload PDF or DOCX files only");
      return;
    }

    useDocumentStore.getState().setUploading(true);

    try {
      const formData = new FormData();
      validFiles.forEach((f) => formData.append("files", f));

      const res = await fetch("/api/extract-document", { method: "POST", body: formData });
      if (!res.ok) throw new Error("Upload failed");

      const data = await res.json();
      const docs = (data.documents as { name: string; text: string }[]).map((d) => ({
        id: crypto.randomUUID(),
        name: d.name,
        text: d.text,
        uploadedAt: new Date().toISOString(),
      }));

      useDocumentStore.getState().addDocuments(docs);
      toast.success(`${docs.length} document${docs.length > 1 ? "s" : ""} uploaded`);
    } catch (err) {
      console.error("[DocumentUpload]", err);
      toast.error("Failed to extract document text");
    } finally {
      useDocumentStore.getState().setUploading(false);
      // Reset file input
      if (docFileInputRef.current) docFileInputRef.current.value = "";
    }
  }, []);

  // --- Pending re-analysis: auto-send message when new docs uploaded after initial insights ---
  useEffect(() => {
    if (!pendingReanalysis || isLoading) return;

    useDocumentStore.getState().setPendingReanalysis(false);

    // Auto-send re-analysis request
    const docs = useDocumentStore.getState().documents;
    if (docs.length === 0) return; // Safety: nothing to analyze

    const docContext = buildInsightsContext(docs);
    const existingArtifactsContext = buildExistingArtifactsContext();

    const docNames = docs.map((d) => `"${d.name}"`).join(", ");
    const messageText = `I've uploaded new documents: ${docNames}. Re-analyze ALL ${docs.length} document(s) together with the existing artifacts. Compare your new insights against each existing artifact — only update artifacts where the new evidence reveals gaps, contradictions, or missing elements. Keep artifacts that still align with the new insights unchanged. Explain what changed and why, or confirm what remains valid.`;

    sendMessage(
      { text: messageText },
      {
        body: {
          vfsContext: existingArtifactsContext ? { vfs: existingArtifactsContext } : "",

          strategyPhase: "problem-overview",
          documentContext: docContext,
          hasUploadedDocuments: true,
        },
      }
    );
  }, [pendingReanalysis, isLoading, sendMessage]);

  // --- Pending address gaps: auto-send message when "Address Gaps with AI" clicked ---
  useEffect(() => {
    if (!pendingAddressGaps || isLoading) return;

    // Clear the flag immediately to prevent re-fires
    useChatContextStore.getState().setPendingAddressGaps(null);

    const { unaddressedJtbds, gaps } = pendingAddressGaps;

    // Use per-persona gaps if available, fall back to globally unaddressed JTBDs
    let gapList: string;
    if (gaps && gaps.length > 0) {
      gapList = gaps.map((g, i) => `${i + 1}. ${g}`).join("\n");
    } else if (unaddressedJtbds.length > 0) {
      gapList = unaddressedJtbds
        .map((j) => `${j.index + 1}. "${j.text}"`)
        .join("\n");
    } else {
      return; // Nothing to address
    }

    const text = `Address the following unaddressed jobs-to-be-done by enhancing existing pages or adding minimal new ones. Do NOT rewrite or significantly change existing pages — only add what's needed to cover these gaps.\n\n${gapList}\n\nFor each change, output a decision-connections block mapping the new/modified components to the JTBD indices they address.`;

    const editContext: EditContext = {
      source: "address-gaps",
      activePageId: activePageId ?? null,
      activePageName: activePageName ?? null,
      activeRoute: activeRoute ?? null,
      pinnedPageIds: resolvePinnedPageIds(pinnedElements, flowData),
      gapContext: gapList,
    };
    const gapTargetPageIds = inferGapTargetPageIds(
      pendingAddressGaps,
      userFlowsData,
      brainData,
    );
    beginEditingRequest(editContext, text, gapTargetPageIds);

    // Build VFS context using shared helper (includes all pages, brain, insights, user flows)
    const vfsContext = buildBuildingPhaseVfsContext(files, {
      extra: {
        gapContext: `## Unaddressed Jobs-To-Be-Done (GAPS)\n\nThese JTBDs are not yet covered for all personas. Address them by enhancing existing pages or adding new features.\n\n${gapList}`,
        editContext: `## Edit Context\n\nSource: address-gaps\nActive Page ID: ${editContext.activePageId || "unknown"}\nActive Page Name: ${editContext.activePageName || "unknown"}\nActive Route: ${editContext.activeRoute || "unknown"}\nPinned Page IDs: ${editContext.pinnedPageIds.join(", ") || "none"}`,
      },
    });

    requestPhaseRef.current = "editing";
    sendMessage(
      { text },
      { body: { vfsContext, strategyPhase: "editing", editContext } }
    );
  }, [pendingAddressGaps, isLoading, sendMessage, files, activePageId, activePageName, activeRoute, pinnedElements, flowData, beginEditingRequest, userFlowsData, brainData]);

  // --- Question Tabs State ---
  const [questionAnswers, setQuestionAnswers] = useState<Record<number, string>>({});
  const [questionActiveTab, setQuestionActiveTab] = useState(0);
  const [questionWriteOwn, setQuestionWriteOwn] = useState<number | null>(null);
  const lastOptionsMsgId = useRef<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Compute current option blocks from last assistant message
  const currentOptionBlocks = useMemo(() => {
    if (isLoading) return [];
    const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
    if (!lastAssistant) return [];
    const text =
      lastAssistant.parts
        ?.filter((p): p is { type: "text"; text: string } => p.type === "text")
        .map((p) => p.text)
        .join("") ||
      ("content" in lastAssistant && typeof lastAssistant.content === "string"
        ? lastAssistant.content
        : "");
    return extractOptionBlocks(text);
  }, [messages, isLoading]);

  // Show question tabs before manifesto is generated OR during deep-dive re-questioning
  const hasActiveQuestions = currentOptionBlocks.length > 0 && (!manifestoData || isDeepDive);

  // Reset question state when a new set of options arrives
  const lastAssistantId = useMemo(() => {
    if (!hasActiveQuestions) return null;
    const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
    return lastAssistant?.id ?? null;
  }, [messages, hasActiveQuestions]);

  useEffect(() => {
    if (!lastAssistantId) return;
    if (lastAssistantId !== lastOptionsMsgId.current) {
      lastOptionsMsgId.current = lastAssistantId;
      setQuestionAnswers({});
      setQuestionActiveTab(0);
      setQuestionWriteOwn(null);
    }
  }, [lastAssistantId]);

  // --- Stream partial overview data to the canvas in real-time ---
  useEffect(() => {
    if (!isLoading) {
      const store = useStrategyStore.getState();
      if (store.streamingOverview && store.manifestoData) {
        // Normal completion: final data was parsed, clear streaming
        store.setStreamingOverview(null);
      } else if (store.streamingOverview && !store.manifestoData) {
        // Truncation: promote partial streaming data to final
        const partial = store.streamingOverview;
        if (partial.title || partial.problemStatement) {
          store.setManifestoData({
            title: partial.title || "Untitled",
            problemStatement: partial.problemStatement || "",
            targetUser: partial.targetUser || "",
            jtbd: partial.jtbd || [],
            hmw: partial.hmw || [],
          });
          toast.warning("Response was truncated — partial overview saved", { id: "stream-truncated" });
        }
        store.setStreamingOverview(null);
      }
      return;
    }

    const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
    if (!lastAssistant) return;

    let textContent = "";
    if (lastAssistant.parts && Array.isArray(lastAssistant.parts)) {
      textContent = lastAssistant.parts
        .filter((p): p is { type: "text"; text: string } => p.type === "text")
        .map((p) => p.text)
        .join("");
    }
    if (!textContent && "content" in lastAssistant && typeof lastAssistant.content === "string") {
      textContent = lastAssistant.content;
    }

    const partial = extractPartialOverview(textContent);
    if (partial) {
      useStrategyStore.getState().setStreamingOverview(partial);
    }
  }, [messages, isLoading, flowData]);

  // --- Stream partial insights data to the canvas in real-time ---
  useEffect(() => {
    if (!isLoading) {
      const docStore = useDocumentStore.getState();
      if (docStore.streamingInsights && docStore.insightsData) {
        docStore.setStreamingInsights(null);
      } else if (docStore.streamingInsights && !docStore.insightsData) {
        const partial = docStore.streamingInsights;
        if (partial.insights && partial.insights.length > 0) {
          docStore.setInsightsData(partial as InsightsCardData);
          toast.warning("Response was truncated — partial insights saved", { id: "stream-truncated" });
        }
        docStore.setStreamingInsights(null);
      }
      return;
    }

    const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
    if (!lastAssistant) return;

    let textContent = "";
    if (lastAssistant.parts && Array.isArray(lastAssistant.parts)) {
      textContent = lastAssistant.parts
        .filter((p): p is { type: "text"; text: string } => p.type === "text")
        .map((p) => p.text)
        .join("");
    }
    if (!textContent && "content" in lastAssistant && typeof lastAssistant.content === "string") {
      textContent = lastAssistant.content;
    }

    const partialInsights = extractPartialInsights(textContent);
    if (partialInsights) {
      useDocumentStore.getState().setStreamingInsights(partialInsights);
    }
  }, [messages, isLoading, flowData]);

  // --- Stream partial persona data to the canvas in real-time ---
  useEffect(() => {
    if (!isLoading) {
      const store = useStrategyStore.getState();
      if (store.streamingPersonas && store.personaData) {
        store.setStreamingPersonas(null);
      } else if (store.streamingPersonas && !store.personaData) {
        const viable = store.streamingPersonas.filter(
          (p): p is PersonaData => !!(p.name && p.role)
        );
        if (viable.length > 0) {
          store.setPersonaData(viable);
          toast.warning("Response was truncated — partial persona data saved", { id: "stream-truncated" });
        }
        store.setStreamingPersonas(null);
      }
      return;
    }

    const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
    if (!lastAssistant) return;

    let textContent = "";
    if (lastAssistant.parts && Array.isArray(lastAssistant.parts)) {
      textContent = lastAssistant.parts
        .filter((p): p is { type: "text"; text: string } => p.type === "text")
        .map((p) => p.text)
        .join("");
    }
    if (!textContent && "content" in lastAssistant && typeof lastAssistant.content === "string") {
      textContent = lastAssistant.content;
    }

    const partialPersonas = extractPartialPersonas(textContent);
    if (partialPersonas) {
      useStrategyStore.getState().setStreamingPersonas(partialPersonas);
    }
  }, [messages, isLoading]);

  // --- Stream partial journey map data to the canvas in real-time ---
  useEffect(() => {
    if (!isLoading) {
      const store = useStrategyStore.getState();
      if (store.streamingJourneyMaps && store.isJourneyMapContinuing && store.journeyMapData) {
        // Continuation was truncated — merge what we got
        const viable = store.streamingJourneyMaps.filter(
          (m): m is JourneyMapData => !!(m.personaName && m.stages && m.stages.length > 0)
        );
        if (viable.length > 0) {
          const existingNames = new Set(store.journeyMapData.map((jm) => jm.personaName));
          const newMaps = viable.filter((jm) => !existingNames.has(jm.personaName));
          if (newMaps.length > 0) {
            store.setJourneyMapData([...store.journeyMapData, ...newMaps]);
          }
        }
        store.setStreamingJourneyMaps(null);
        store.setIsJourneyMapContinuing(false);
      } else if (store.streamingJourneyMaps && store.journeyMapData) {
        store.setStreamingJourneyMaps(null);
      } else if (store.streamingJourneyMaps && !store.journeyMapData) {
        const viable = store.streamingJourneyMaps.filter(
          (m): m is JourneyMapData => !!(m.personaName && m.stages && m.stages.length > 0)
        );
        if (viable.length > 0) {
          store.setJourneyMapData(viable);
          toast.warning("Response was truncated — partial journey map data saved", { id: "stream-truncated" });
        }
        store.setStreamingJourneyMaps(null);
      }
      return;
    }

    const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
    if (!lastAssistant) return;

    let textContent = "";
    if (lastAssistant.parts && Array.isArray(lastAssistant.parts)) {
      textContent = lastAssistant.parts
        .filter((p): p is { type: "text"; text: string } => p.type === "text")
        .map((p) => p.text)
        .join("");
    }
    if (!textContent && "content" in lastAssistant && typeof lastAssistant.content === "string") {
      textContent = lastAssistant.content;
    }

    const partialMaps = extractPartialJourneyMaps(textContent);
    if (partialMaps) {
      useStrategyStore.getState().setStreamingJourneyMaps(partialMaps);
    }
  }, [messages, isLoading]);

  // --- Auto-continue: detect incomplete journey maps and request missing ones ---
  useEffect(() => {
    if (isLoading) return;
    if (strategyPhase !== "problem-overview") return;
    if (!personaData || !journeyMapData) return;
    if (isJourneyMapContinuing) return;

    const store = useStrategyStore.getState();
    if (store.journeyMapContinueAttempts >= 2) return;

    // Check completeness: do we have a journey map for every persona?
    const coveredNames = new Set(journeyMapData.map((jm) => jm.personaName));
    const missingPersonas = personaData.filter((p) => !coveredNames.has(p.name));

    if (missingPersonas.length === 0) {
      // All personas covered — reset attempt counter
      if (store.journeyMapContinueAttempts > 0) {
        store.setJourneyMapContinueAttempts(0);
      }
      return;
    }

    console.log(`[Journey Map Auto-Continue] Missing maps for: ${missingPersonas.map(p => p.name).join(", ")}. Attempt ${store.journeyMapContinueAttempts + 1}/2`);

    store.setIsJourneyMapContinuing(true);
    store.setJourneyMapContinueAttempts(store.journeyMapContinueAttempts + 1);

    // Build context for continuation
    const parts: string[] = [];
    if (store.manifestoData) {
      parts.push(`## Current Overview\n\n${JSON.stringify(store.manifestoData, null, 2)}`);
    }
    if (store.personaData) {
      parts.push(`## All Personas\n\n${JSON.stringify(store.personaData, null, 2)}`);
    }
    parts.push(`## Already Generated Journey Maps\n\n${JSON.stringify(journeyMapData, null, 2)}`);

    const missingNames = missingPersonas.map((p) => p.name);
    const vfsContext = parts.join("\n\n");

    const timer = setTimeout(() => {
      sendMessage(
        {
          text: `The journey maps are incomplete. You generated maps for ${coveredNames.size} out of ${personaData.length} personas. Please generate ONLY the missing journey maps for: ${missingNames.join(", ")}. Output them as a single \`\`\`json type="journey-maps"\`\`\` block containing ONLY the missing maps (do NOT repeat the ones already generated).`,
        },
        {
          body: {
            vfsContext,
  
            strategyPhase: "problem-overview",
          },
        }
      );
    }, 500);

    return () => clearTimeout(timer);
  }, [isLoading, strategyPhase, personaData, journeyMapData, isJourneyMapContinuing, sendMessage]);

  // --- Stream partial idea data to the canvas in real-time ---
  useEffect(() => {
    if (!isLoading) {
      const store = useStrategyStore.getState();
      if (store.streamingIdeas && store.ideaData) {
        store.setStreamingIdeas(null);
      } else if (store.streamingIdeas && !store.ideaData) {
        const viable = store.streamingIdeas.filter(
          (idea): idea is IdeaData => !!(idea.id && idea.title)
        );
        if (viable.length > 0) {
          store.setIdeaData(viable);
          toast.warning("Response was truncated — partial ideas saved", { id: "stream-truncated" });
        }
        store.setStreamingIdeas(null);
      }
      return;
    }

    const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
    if (!lastAssistant) return;

    let textContent = "";
    if (lastAssistant.parts && Array.isArray(lastAssistant.parts)) {
      textContent = lastAssistant.parts
        .filter((p): p is { type: "text"; text: string } => p.type === "text")
        .map((p) => p.text)
        .join("");
    }
    if (!textContent && "content" in lastAssistant && typeof lastAssistant.content === "string") {
      textContent = lastAssistant.content;
    }

    const partialIdeas = extractPartialIdeas(textContent);
    if (partialIdeas) {
      useStrategyStore.getState().setStreamingIdeas(partialIdeas);
    }
  }, [messages, isLoading]);

  // --- Stream partial user flow data to the canvas in real-time ---
  useEffect(() => {
    if (strategyPhase !== "solution-design" || !isLoading) {
      const store = useStrategyStore.getState();
      if (store.streamingUserFlows && store.userFlowsData) {
        store.setStreamingUserFlows(null);
      } else if (store.streamingUserFlows && !store.userFlowsData) {
        const viable = store.streamingUserFlows.filter(
          (f): f is UserFlow => !!(f.id && f.steps && f.steps.length > 0)
        );
        if (viable.length > 0) {
          store.setUserFlowsData(viable);
          toast.warning("Response was truncated — partial user flows saved", { id: "stream-truncated" });
        }
        store.setStreamingUserFlows(null);
      }
      return;
    }

    const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
    if (!lastAssistant) return;

    let textContent = "";
    if (lastAssistant.parts && Array.isArray(lastAssistant.parts)) {
      textContent = lastAssistant.parts
        .filter((p): p is { type: "text"; text: string } => p.type === "text")
        .map((p) => p.text)
        .join("");
    }
    if (!textContent && "content" in lastAssistant && typeof lastAssistant.content === "string") {
      textContent = lastAssistant.content;
    }

    const partialUserFlows = extractPartialUserFlows(textContent);
    if (partialUserFlows) {
      useStrategyStore.getState().setStreamingUserFlows(partialUserFlows);
    }
  }, [messages, isLoading, strategyPhase]);

  // --- Stream partial key features data to the canvas in real-time ---
  useEffect(() => {
    if (strategyPhase !== "solution-design" || !isLoading) {
      const store = useStrategyStore.getState();
      if (store.streamingKeyFeatures && store.keyFeaturesData) {
        store.setStreamingKeyFeatures(null);
      } else if (store.streamingKeyFeatures && !store.keyFeaturesData) {
        const partial = store.streamingKeyFeatures;
        if (partial.features && partial.features.length > 0) {
          store.setKeyFeaturesData(partial as KeyFeaturesData);
          toast.warning("Response was truncated — partial features saved", { id: "stream-truncated" });
        }
        store.setStreamingKeyFeatures(null);
      }
      return;
    }

    const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
    if (!lastAssistant) return;

    let textContent = "";
    if (lastAssistant.parts && Array.isArray(lastAssistant.parts)) {
      textContent = lastAssistant.parts
        .filter((p): p is { type: "text"; text: string } => p.type === "text")
        .map((p) => p.text)
        .join("");
    }
    if (!textContent && "content" in lastAssistant && typeof lastAssistant.content === "string") {
      textContent = lastAssistant.content;
    }

    const partialFeatures = extractPartialKeyFeatures(textContent);
    if (partialFeatures) {
      useStrategyStore.getState().setStreamingKeyFeatures(partialFeatures);
    }
  }, [messages, isLoading, strategyPhase]);

  // Log for debugging
  useEffect(() => {
    console.log("Chat status:", status, "Messages:", messages.length, "Error:", error);
  }, [status, messages, error]);

  // Process messages for code blocks and write to VFS
  useEffect(() => {
    messages.forEach((message) => {
      if (message.role === "assistant") {
        // Get the text content from the message - try multiple approaches
        let textContent = "";

        // Approach 1: Use parts array (AI SDK v6 format)
        if (message.parts && Array.isArray(message.parts)) {
          textContent = message.parts
            .filter((part): part is { type: "text"; text: string } => part.type === "text")
            .map((part) => part.text)
            .join("");
        }

        // Approach 2: Fallback to content property (older format)
        if (!textContent && "content" in message && typeof message.content === "string") {
          textContent = message.content;
        }

        const blocks = extractCodeBlocks(textContent);
        blocks.forEach((block) => {
          // Create a unique key for this block
          const blockKey = `${message.id}-${block.path}-${block.content.length}`;

          // Only write if we haven't processed this exact block before
          if (!processedBlocksSet.has(blockKey)) {
            processedBlocksSet.add(blockKey);
            const gated = runGatekeeper(block.content, files, block.path);
            if (gated.report.hadChanges) {
              const total = (gated.report.importFixes?.length || 0)
                + gated.report.colorViolations.length
                + gated.report.spacingViolations.length
                + gated.report.layoutViolations.length
                + gated.report.typographyViolations.length
                + gated.report.componentPromotions.length
                + gated.report.layoutDeclarationAdditions.length
                + gated.report.buttonNormalizations.length
                + gated.report.badgeNormalizations.length
                + gated.report.tabsNormalizations.length;
              toast.info(`Gatekeeper: ${total} design system fix${total > 1 ? "es" : ""} applied`);
              console.log("[Gatekeeper] Applied fixes:", gated.report);
            }
            // Detect removed data-strategy-id attributes (AI-initiated annotation deletion)
            try {
              const oldContent = files[block.path];
              if (oldContent) {
                const oldIds = new Set(Array.from(oldContent.matchAll(/data-strategy-id="([^"]+)"/g)).map((m) => m[1]));
                const newIds = new Set(Array.from(gated.code.matchAll(/data-strategy-id="([^"]+)"/g)).map((m) => m[1]));
                const removedIds = [...oldIds].filter((id) => !newIds.has(id));
                if (removedIds.length > 0) {
                  const brainStore = useProductBrainStore.getState();
                  for (const sid of removedIds) {
                    brainStore.removeConnection(sid);
                  }
                  toast.info(`AI removed ${removedIds.length} annotated section(s) — connections cleaned from product brain`);
                }
              }
            } catch {
              // Fail-safe: don't break on regex/brain errors
            }

            writeFile(block.path, gated.code);
            trackEvent("code_generated", projectId, { filePath: block.path, gatekeeperChanges: gated.report.hadChanges });

            // Track written files for verification loop
            const existing = writtenFilesPerMessage.get(message.id) || [];
            if (!existing.includes(block.path)) {
              existing.push(block.path);
              writtenFilesPerMessage.set(message.id, existing);
            }
          }
        });
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps -- files is read via closure at call-time; adding it would re-run gatekeeper on every VFS change
  }, [messages, writeFile]);

  // Sync flow.json after AI writes: remove pages whose files were deleted
  useEffect(() => {
    if (isLoading) return; // Wait until streaming completes
    if (editScope) return; // Scoped editing owns App/flow sync deterministically
    messages.forEach((message) => {
      if (message.role !== "assistant") return;
      if (flowJsonSyncedMessages.has(message.id)) return;

      let textContent = "";
      if (message.parts && Array.isArray(message.parts)) {
        textContent = message.parts
          .filter((part): part is { type: "text"; text: string } => part.type === "text")
          .map((part) => part.text)
          .join("");
      }
      if (!textContent && "content" in message && typeof message.content === "string") {
        textContent = message.content;
      }

      const blocks = extractCodeBlocks(textContent);
      if (blocks.length === 0) return;

      flowJsonSyncedMessages.add(message.id);

      try {
        const flowRaw = files["/flow.json"];
        if (!flowRaw) return;

        const flow = JSON.parse(flowRaw);
        if (!Array.isArray(flow.pages)) return;

        const deletedPageIds: string[] = [];
        const appTsx = files["/App.tsx"] || "";
        const updatedPages = flow.pages.filter((page: { id: string; route: string }) => {
          // Check by route match in App.tsx — if the route is no longer referenced, page was removed
          const routeExists = appTsx.includes(`"${page.route}"`) || appTsx.includes(`'${page.route}'`) || page.route === "/";

          if (!routeExists && page.route !== "/") {
            deletedPageIds.push(page.id);
            return false;
          }
          return true;
        });

        if (deletedPageIds.length > 0) {
          const updatedConnections = (flow.connections || []).filter(
            (conn: { from: string; to: string }) =>
              !deletedPageIds.includes(conn.from) && !deletedPageIds.includes(conn.to)
          );

          const cleanedFlow = { ...flow, pages: updatedPages, connections: updatedConnections };
          writeFile("/flow.json", JSON.stringify(cleanedFlow, null, 2));
          toast.info(`Cleaned flow.json: removed ${deletedPageIds.length} deleted page(s)`);
        }
      } catch {
        // Fail-safe: don't break on bad flow.json
      }
    });
  }, [messages, isLoading, writeFile, files, editScope]);

  // Route consistency: ensure App.tsx + flow.json include all page files
  useEffect(() => {
    if (isLoading) return;
    messages.forEach((message) => {
      if (message.role !== "assistant") return;
      if (routeConsistencySyncedMessages.has(message.id)) return;

      let textContent = "";
      if (message.parts && Array.isArray(message.parts)) {
        textContent = message.parts
          .filter((part): part is { type: "text"; text: string } => part.type === "text")
          .map((part) => part.text)
          .join("");
      }
      if (!textContent && "content" in message && typeof message.content === "string") {
        textContent = message.content;
      }

      const blocks = extractCodeBlocks(textContent);
      if (blocks.length === 0) return;

      routeConsistencySyncedMessages.add(message.id);

      try {
        const canonicalFlow = buildCanonicalFlowForEdit(files, flowData, editScope);
        if (editScope && !canonicalFlow) {
          return;
        }

        const result = canonicalFlow
          ? checkRouteConsistency(files, { canonicalFlow })
          : checkRouteConsistency(files);
        if (result.fixes.length > 0) {
          for (const fix of result.fixes) {
            writeFile(fix.path, fix.content);
          }
          const reasons = result.fixes.map((f) => f.reason).join("; ");
          toast.info(`Route consistency: ${reasons}`);
          console.log("[RouteConsistency] Applied fixes:", result.fixes.map((f) => f.path));
        }
      } catch {
        // Fail-safe
      }
    });
  }, [messages, isLoading, writeFile, files, flowData, editScope]);

  // Extract strategy JSON (manifesto/flow) from AI responses
  useEffect(() => {
    messages.forEach((message) => {
      if (message.role !== "assistant") return;

      let textContent = "";
      if (message.parts && Array.isArray(message.parts)) {
        textContent = message.parts
          .filter((part): part is { type: "text"; text: string } => part.type === "text")
          .map((part) => part.text)
          .join("");
      }
      if (!textContent && "content" in message && typeof message.content === "string") {
        textContent = message.content;
      }
      if (!textContent) return;

      // Extract insights blocks
      let match;
      while ((match = INSIGHTS_REGEX.exec(textContent)) !== null) {
        const blockKey = `insights-${message.id}-${match.index}`;
        if (!processedStrategyBlocksSet.has(blockKey)) {
          processedStrategyBlocksSet.add(blockKey);
          try {
            const parsed = JSON.parse(match[1]);
            if (parsed.insights && Array.isArray(parsed.insights)) {
              useDocumentStore.getState().setInsightsData(parsed);
            }
          } catch (e) {
            console.warn("[Strategy] Failed to parse insights JSON:", e);
          }
        }
      }
      INSIGHTS_REGEX.lastIndex = 0;

      // Extract manifesto blocks
      while ((match = MANIFESTO_REGEX.exec(textContent)) !== null) {
        const blockKey = `manifesto-${message.id}-${match.index}`;
        if (!processedStrategyBlocksSet.has(blockKey)) {
          processedStrategyBlocksSet.add(blockKey);
          try {
            const parsed = JSON.parse(match[1]);
            if (parsed.title && parsed.problemStatement && parsed.targetUser && Array.isArray(parsed.jtbd) && Array.isArray(parsed.hmw)) {
              useStrategyStore.getState().setManifestoData(parsed);
            }
          } catch (e) {
            console.warn("[Strategy] Failed to parse manifesto JSON:", e);
          }
        }
      }
      MANIFESTO_REGEX.lastIndex = 0;

      // Extract persona blocks
      while ((match = PERSONA_REGEX.exec(textContent)) !== null) {
        const blockKey = `personas-${message.id}-${match.index}`;
        if (!processedStrategyBlocksSet.has(blockKey)) {
          processedStrategyBlocksSet.add(blockKey);
          try {
            const parsed = JSON.parse(match[1]);
            if (Array.isArray(parsed) && parsed.length > 0 && (parsed[0].name || parsed[0].role)) {
              useStrategyStore.getState().setPersonaData(parsed);
            }
          } catch (e) {
            console.warn("[Strategy] Failed to parse personas JSON:", e);
          }
        }
      }
      PERSONA_REGEX.lastIndex = 0;

      // Extract journey map blocks
      while ((match = JOURNEY_MAPS_REGEX.exec(textContent)) !== null) {
        const blockKey = `journey-maps-${message.id}-${match.index}`;
        if (!processedStrategyBlocksSet.has(blockKey)) {
          processedStrategyBlocksSet.add(blockKey);
          try {
            const parsed = JSON.parse(match[1]);
            if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].personaName) {
              const store = useStrategyStore.getState();
              if (store.isJourneyMapContinuing && store.journeyMapData) {
                // Merge: combine existing maps with newly received maps
                const existingNames = new Set(store.journeyMapData.map((jm: JourneyMapData) => jm.personaName));
                const newMaps = parsed.filter((jm: JourneyMapData) => !existingNames.has(jm.personaName));
                store.setJourneyMapData([...store.journeyMapData, ...newMaps]);
                store.setIsJourneyMapContinuing(false);
              } else {
                store.setJourneyMapData(parsed);
              }
            }
          } catch (e) {
            console.warn("[Strategy] Failed to parse journey-maps JSON:", e);
          }
        }
      }
      JOURNEY_MAPS_REGEX.lastIndex = 0;

      // Extract ideas blocks
      while ((match = IDEAS_REGEX.exec(textContent)) !== null) {
        const blockKey = `ideas-${message.id}-${match.index}`;
        if (!processedStrategyBlocksSet.has(blockKey)) {
          processedStrategyBlocksSet.add(blockKey);
          try {
            const parsed = JSON.parse(match[1]);
            if (Array.isArray(parsed) && parsed.length > 0 && (parsed[0].id || parsed[0].title)) {
              useStrategyStore.getState().setIdeaData(parsed);
            }
          } catch (e) {
            console.warn("[Strategy] Failed to parse ideas JSON:", e);
          }
        }
      }
      IDEAS_REGEX.lastIndex = 0;

      // Extract flow blocks
      while ((match = FLOW_REGEX.exec(textContent)) !== null) {
        const blockKey = `flow-${message.id}-${match.index}`;
        if (!processedStrategyBlocksSet.has(blockKey)) {
          processedStrategyBlocksSet.add(blockKey);
          try {
            const parsed = JSON.parse(match[1]);
            if (Array.isArray(parsed.nodes) && Array.isArray(parsed.connections)) {
              useStrategyStore.getState().setFlowData(parsed);
            }
          } catch (e) {
            console.warn("[Strategy] Failed to parse flow JSON:", e);
          }
        }
      }
      FLOW_REGEX.lastIndex = 0;

      // Extract features blocks (key features from solution-design phase)
      while ((match = FEATURES_REGEX.exec(textContent)) !== null) {
        const blockKey = `features-${message.id}-${match.index}`;
        if (!processedStrategyBlocksSet.has(blockKey)) {
          processedStrategyBlocksSet.add(blockKey);
          try {
            const parsed = JSON.parse(match[1]);
            if (parsed.features && Array.isArray(parsed.features)) {
              useStrategyStore.getState().setKeyFeaturesData(parsed);
            }
          } catch (e) {
            console.warn("[Strategy] Failed to parse features JSON:", e);
          }
        }
      }
      FEATURES_REGEX.lastIndex = 0;

      // Extract user-flows blocks
      while ((match = USER_FLOWS_REGEX.exec(textContent)) !== null) {
        const blockKey = `user-flows-${message.id}-${match.index}`;
        if (!processedStrategyBlocksSet.has(blockKey)) {
          processedStrategyBlocksSet.add(blockKey);
          try {
            const parsed = JSON.parse(match[1]);
            if (Array.isArray(parsed)) {
              useStrategyStore.getState().setUserFlowsData(parsed);
            }
          } catch (e) {
            console.warn("[Strategy] Failed to parse user-flows JSON:", e);
          }
        }
      }
      USER_FLOWS_REGEX.lastIndex = 0;

      // Extract page-built blocks
      while ((match = PAGE_BUILT_REGEX.exec(textContent)) !== null) {
        const blockKey = `page-built-${message.id}-${match.index}`;
        if (!processedStrategyBlocksSet.has(blockKey)) {
          processedStrategyBlocksSet.add(blockKey);
          try {
            const parsed = JSON.parse(match[1]);
            if (parsed.pageId) {
              const store = useStrategyStore.getState();
              store.addCompletedPage(parsed.pageId);
              store.setBuildingPage(null);
            }
          } catch (e) {
            console.warn("[Strategy] Failed to parse page-built JSON:", e);
          }
        }
      }
      PAGE_BUILT_REGEX.lastIndex = 0;

      // Extract decision-connections blocks (Product Brain)
      while ((match = DECISION_CONNECTIONS_REGEX.exec(textContent)) !== null) {
        const blockKey = `decision-connections-${message.id}-${match.index}`;
        if (!processedStrategyBlocksSet.has(blockKey)) {
          processedStrategyBlocksSet.add(blockKey);
          try {
            const parsed = JSON.parse(match[1]);
            if (parsed.pageId && Array.isArray(parsed.connections)) {
              const brainStore = useProductBrainStore.getState();
              brainStore.addPageDecisions({
                pageId: parsed.pageId,
                pageName: parsed.pageName || parsed.pageId,
                connections: parsed.connections,
              });
              // Persist product brain to VFS
              const brainData = useProductBrainStore.getState().brainData;
              if (brainData) {
                writeFile("/product-brain.json", JSON.stringify(brainData, null, 2));
              }
            }
          } catch (e) {
            console.warn("[Strategy] Failed to parse decision-connections JSON:", e);
          }
        }
      }
      DECISION_CONNECTIONS_REGEX.lastIndex = 0;

      // Extract alignment-check blocks (strategy alignment validation)
      while ((match = ALIGNMENT_CHECK_REGEX.exec(textContent)) !== null) {
        const blockKey = `alignment-check-${message.id}-${match.index}`;
        if (!processedStrategyBlocksSet.has(blockKey)) {
          processedStrategyBlocksSet.add(blockKey);
          try {
            const parsed = normalizeAlignmentCheck(JSON.parse(match[1]));
            if (parsed) {
              useStrategyStore.getState().setEditScope(parsed);
            }
            if (parsed?.aligned === false) {
              setAlignmentCheckPending(true);
            }
          } catch (e) {
            console.warn("[Strategy] Failed to parse alignment-check JSON:", e);
          }
        }
      }
      ALIGNMENT_CHECK_REGEX.lastIndex = 0;

      // Extract confidence blocks (always use the latest one)
      while ((match = CONFIDENCE_REGEX.exec(textContent)) !== null) {
        const blockKey = `confidence-${message.id}-${match.index}`;
        if (!processedStrategyBlocksSet.has(blockKey)) {
          processedStrategyBlocksSet.add(blockKey);
          try {
            const parsed = JSON.parse(match[1]) as ConfidenceData;
            if (typeof parsed.overall === "number" && parsed.dimensions) {
              useStrategyStore.getState().setConfidenceData(parsed);
            }
          } catch (e) {
            console.warn("[Strategy] Failed to parse confidence JSON:", e);
          }
        }
      }
      CONFIDENCE_REGEX.lastIndex = 0;
    });
  }, [messages, writeFile]);

  // --- Stream code overlay state ---
  useEffect(() => {
    const store = useStreamingStore.getState();

    if (!isLoading) {
      if (store.isStreaming) store.endStreaming();
      return;
    }

    const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
    if (!lastAssistant) return;

    const text = getMessageText(lastAssistant);
    const parsed = parseStreamingContent(text);

    // Start streaming on first code block detection
    if (!store.isStreaming && (parsed.currentFile || parsed.completedBlocks.length > 0)) {
      const strategyStore = useStrategyStore.getState();
      const targetPageIds = strategyStore.activeEditingPageIds.length > 0
        ? strategyStore.activeEditingPageIds
        : strategyStore.currentBuildingPage
          ? [strategyStore.currentBuildingPage]
          : [];
      store.startStreaming(targetPageIds);
    }

    // Update status text (first sentence of pre-code text)
    if (parsed.preText) {
      const firstSentence = parsed.preText.split(/[.!\n]/)[0].trim();
      if (firstSentence) {
        store.setStatusText(firstSentence);
      }
    }

    // Update current streaming file
    if (parsed.currentFile) {
      store.setCurrentFile(parsed.currentFile.path, parsed.currentFile.content);
      const filePageId = findPageIdForFilePath(parsed.currentFile.path, flowData);
      if (filePageId) {
        store.setTargetPageIds([filePageId]);
      }
    }

    // Track completed files
    parsed.completedBlocks.forEach((block) => store.markFileComplete(block.path));
  }, [messages, isLoading, flowData]);

  // Sync targeted page scope when build/edit targets change mid-stream
  useEffect(() => {
    const store = useStreamingStore.getState();
    if (!store.isStreaming) return;

    if (activeEditingPageIds.length > 0) {
      store.setTargetPageIds(activeEditingPageIds);
      return;
    }

    if (currentBuildingPage) {
      store.setTargetPageIds([currentBuildingPage]);
    }
  }, [activeEditingPageIds, currentBuildingPage]);

  // Auto-scroll to bottom
  useEffect(() => {
    const behavior = status === "streaming" ? "instant" : "smooth";
    messagesEndRef.current?.scrollIntoView({ behavior });
  }, [messages, status, currentOptionBlocks.length, strategyPhase, annotationEvaluation.status]);

  useEffect(() => {
    if (isLoading) return;
    if (requestPhaseRef.current === "editing") {
      const strategyStore = useStrategyStore.getState();
      strategyStore.setPhase("complete");
      if (!alignmentCheckPending) {
        strategyStore.clearEditSession();
      }
    }
    requestPhaseRef.current = null;
  }, [alignmentCheckPending, isLoading]);

  // --- Self-healing verification loop ---
  const prevStatusRef = useRef(status);
  const verifyAbortRef = useRef<AbortController | null>(null);
  const autoRetryCountRef = useRef(0);
  const MAX_CHAT_AUTO_RETRIES = 1;

  useEffect(() => {
    const wasActive = prevStatusRef.current !== "ready";
    prevStatusRef.current = status;

    // Reset auto-retry counter when user sends a new message (submitted → streaming transition)
    if (status === "submitted" || status === "streaming") {
      autoRetryCountRef.current = 0;
    }

    if (wasActive && status === "ready") {
      // Refresh billing usage after any AI response completes
      notifyUsageChanged();

      const store = useStreamingStore.getState();
      if (store.completedFilePaths.length === 0) return; // No code written
      if (store.parallelMode) return; // Skip during parallel builds
      trackEvent("ai_response_complete", projectId, { filesWritten: store.completedFilePaths.length });

      const completedFiles = [...store.completedFilePaths];
      const targetPageId = store.targetPageId ?? undefined;

      // Cancel any in-progress verification
      verifyAbortRef.current?.abort();
      const controller = new AbortController();
      verifyAbortRef.current = controller;

      // Dynamic import to avoid loading verification code until needed
      import("@/lib/verification/verify-loop").then(({ runVerificationLoop }) => {
        runVerificationLoop({
          completedFiles,
          allFiles: files,
          writeFile,

          pageId: targetPageId,
          signal: controller.signal,
        }).then((result) => {
          if (controller.signal.aborted) return;
          trackEvent("verification_result", projectId, { status: result.status, attempts: result.attempts, fixCount: result.fixCount });
          if (result.status === "fixed") {
            toast.success(`Auto-fixed ${result.fixCount} issue${result.fixCount > 1 ? "s" : ""}`);
          } else if (result.status === "failed") {
            // Auto-retry: send the error back to the AI as a follow-up message
            if (autoRetryCountRef.current < MAX_CHAT_AUTO_RETRIES && result.lastError) {
              autoRetryCountRef.current++;
              toast.info("Sending error to AI for a fix...");

              const errorContext = buildBuildingPhaseVfsContext(files);
              sendMessage(
                { text: `The code you just wrote has this runtime error:\n\n"${result.lastError}"\n\nPlease fix the error. Write the corrected file(s) with full content.` },
                { body: { vfsContext: Object.values(errorContext).filter(Boolean).join("\n\n"), strategyPhase: "building" } }
              );
            } else {
              toast.warning("Could not auto-fix all issues");
            }
          }
          // "passed" → silent (no toast)
        });
      });
    }

    return () => {
      // Cancel verification on new message or unmount
      if (status === "submitted" || status === "streaming") {
        verifyAbortRef.current?.abort();
        useStreamingStore.getState().resetVerification();
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- files/writeFile read at call-time
  }, [status]);

  // --- Deep-dive round completion detection ---
  // When AI finishes streaming during deep-dive, check if it output updated blocks.
  // If so, exit deep-dive mode to re-show the approve/discuss buttons.
  // IMPORTANT: Only check on loading→not-loading transition to avoid a race condition
  // where isDeepDive is set to true (via Zustand) before isLoading catches up,
  // which would cause the old assistant message (with artifacts) to falsely match.
  const deepDivePrevLoadingRef = useRef(isLoading);
  useEffect(() => {
    const wasLoading = deepDivePrevLoadingRef.current;
    deepDivePrevLoadingRef.current = isLoading;

    // Only run on transition from loading to not-loading
    if (isLoading || !wasLoading) return;
    if (!useStrategyStore.getState().isDeepDive) return;

    const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
    if (!lastAssistant) return;

    const text = getMessageText(lastAssistant);
    const hasManifesto = /```json\s+type="manifesto"[\s\S]*?```/.test(text);
    const hasPersonas = /```json\s+type="personas"[\s\S]*?```/.test(text);
    const hasJourneyMaps = /```json\s+type="journey-maps"[\s\S]*?```/.test(text);

    if (hasManifesto || hasPersonas || hasJourneyMaps) {
      useStrategyStore.getState().setDeepDive(false);
    }
  }, [messages, isLoading]);

  // --- Auto re-evaluate annotations after AI writes code ---
  const buildCompletePrevLoadingRef = useRef(isLoading);
  useEffect(() => {
    const wasLoading = buildCompletePrevLoadingRef.current;
    buildCompletePrevLoadingRef.current = isLoading;
    if (isLoading || !wasLoading) return;

    const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
    if (!lastAssistant) return;
    const text = getMessageText(lastAssistant);
    if (!CODE_BLOCK_REGEX.test(text)) return;
    CODE_BLOCK_REGEX.lastIndex = 0; // reset stateful regex

    const writtenFiles = writtenFilesPerMessage.get(lastAssistant.id) ?? [];

    if (parallelMode && verificationPaused && verificationPausedPageId) {
      parallelBuild.resumePausedVerification();
    } else if (writtenFiles.length > 0) {
      onBuildingResponseComplete?.({
        writtenFiles: [...writtenFiles],
        fallbackPageIds: [...activeEditingPageIds],
        addedPageIds: [...(editScope?.addedPageIds ?? [])],
        removedPageIds: [...(editScope?.removedPageIds ?? [])],
      });
    }

    // --- Run verification loop on written files ---
    if (writtenFiles && writtenFiles.length > 0 && !verifiedMessages.has(lastAssistant.id)) {
      verifiedMessages.add(lastAssistant.id);

      // Skip verification if we're in the parallel build pipeline (it has its own verification)
      const isBuildingPhase = useStrategyStore.getState().currentBuildingPages.length > 0;
      if (!isBuildingPhase) {
        // Build latest files map
        const latestFiles: Record<string, string> = {};
        for (const [path, content] of Object.entries(files)) {
          latestFiles[path] = content;
        }
        // Also get latest versions of written files via ref
        for (const fp of writtenFiles) {
          const latest = getLatestFile(fp);
          if (latest) latestFiles[fp] = latest;
        }

        const controller = new AbortController();

        runVerificationLoop({
          completedFiles: writtenFiles,
          allFiles: latestFiles,
          writeFile,

          signal: controller.signal,
        }).then((result) => {
          if (result.status === "fixed") {
            toast.success(`Auto-fixed ${result.fixCount} issue${result.fixCount > 1 ? "s" : ""}`);
          } else if (result.status === "failed" && result.lastError) {
            toast.warning("Could not auto-fix all issues. Check the preview for errors.");
          }
          // Auto-dismiss verification status after a delay
          setTimeout(() => {
            useStreamingStore.getState().resetVerification();
          }, 3000);
        }).catch(() => {
          // Verification failed silently
          useStreamingStore.getState().resetVerification();
        });
      }
    }
  }, [messages, isLoading, onBuildingResponseComplete, files, getLatestFile, writeFile, parallelMode, verificationPaused, verificationPausedPageId, parallelBuild, activeEditingPageIds, editScope]);

  // --- Image upload helpers ---

  const validateAndStageFiles = useCallback((fileList: FileList | File[]) => {
    const filesToProcess = Array.from(fileList);
    const validFiles: File[] = [];

    for (const file of filesToProcess) {
      if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
        console.warn(`Rejected file "${file.name}": unsupported type ${file.type}`);
        continue;
      }
      if (file.size > MAX_IMAGE_SIZE_BYTES) {
        console.warn(`Rejected file "${file.name}": exceeds 4MB limit`);
        continue;
      }
      validFiles.push(file);
    }

    if (validFiles.length === 0) return;

    // Convert files to FileUIPart via FileReader (outside state updater to avoid StrictMode double-fire)
    validFiles.forEach((file) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const dataUrl = e.target?.result as string;
        const part: FileUIPart = {
          type: "file",
          mediaType: file.type,
          filename: file.name,
          url: dataUrl,
        };
        setStagedImages((current) => {
          if (current.length >= MAX_IMAGES_PER_MESSAGE) return current;
          return [...current, part];
        });
      };
      reader.readAsDataURL(file);
    });
  }, []);

  const handlePaste = useCallback((e: ClipboardEvent<HTMLInputElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    const imageFiles: File[] = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.kind === "file" && ACCEPTED_IMAGE_TYPES.includes(item.type)) {
        const file = item.getAsFile();
        if (file) imageFiles.push(file);
      }
    }

    if (imageFiles.length > 0) {
      validateAndStageFiles(imageFiles);
    }
  }, [validateAndStageFiles]);

  const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (e.dataTransfer.types.includes("Files")) {
      setIsDragOver(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    // Only clear if leaving the container (not entering a child)
    const rect = e.currentTarget.getBoundingClientRect();
    const { clientX, clientY } = e;
    if (
      clientX <= rect.left ||
      clientX >= rect.right ||
      clientY <= rect.top ||
      clientY >= rect.bottom
    ) {
      setIsDragOver(false);
    }
  }, []);

  const handleDrop = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);

    const droppedFiles = e.dataTransfer.files;
    if (droppedFiles.length > 0) {
      validateAndStageFiles(droppedFiles);
    }
  }, [validateAndStageFiles]);

  const handleFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = e.target.files;
    if (selectedFiles && selectedFiles.length > 0) {
      validateAndStageFiles(selectedFiles);
    }
    // Reset input so the same file can be selected again
    e.target.value = "";
  }, [validateAndStageFiles]);

  const removeStagedImage = useCallback((index: number) => {
    setStagedImages((prev) => prev.filter((_, i) => i !== index));
  }, []);

  // --- Quick reply (option click) ---

  const sendQuickReply = useCallback(
    (text: string) => {
      if (isLoading) return;

      // Build context (same as manifesto/persona/flow phases)
      const storeState = useStrategyStore.getState();
      const parts: string[] = [];
      if (storeState.manifestoData) {
        parts.push(`## Current Overview\n\n${JSON.stringify(storeState.manifestoData, null, 2)}`);
      }
      if (storeState.personaData) {
        parts.push(`## Current Personas\n\n${JSON.stringify(storeState.personaData, null, 2)}`);
      }
      if (storeState.journeyMapData) {
        parts.push(`## Current Journey Maps\n\n${JSON.stringify(storeState.journeyMapData, null, 2)}`);
      }
      if (storeState.ideaData) {
        parts.push(`## Current Ideas\n\n${JSON.stringify(storeState.ideaData, null, 2)}`);
        if (storeState.selectedIdeaId) {
          parts.push(`## Selected Idea ID: ${storeState.selectedIdeaId}`);
        }
      }
      if (storeState.flowData) {
        parts.push(`## Current Flow Architecture\n\n${JSON.stringify(storeState.flowData, null, 2)}`);
      }
      const vfsContext = parts.join("\n\n");

      sendMessage(
        { text },
        { body: { vfsContext, strategyPhase, isDeepDive: useStrategyStore.getState().isDeepDive } }
      );
    },
    [isLoading, sendMessage, strategyPhase]
  );

  // --- "Discuss the problem more" handler ---

  const handleDiscussMore = useCallback(() => {
    if (isLoading) return;
    useStrategyStore.getState().setDeepDive(true);

    const storeState = useStrategyStore.getState();
    const parts: string[] = [];
    if (storeState.manifestoData) {
      parts.push(`## Current Overview\n\n${JSON.stringify(storeState.manifestoData, null, 2)}`);
    }
    if (storeState.personaData) {
      parts.push(`## Current Personas\n\n${JSON.stringify(storeState.personaData, null, 2)}`);
    }
    if (storeState.journeyMapData) {
      parts.push(`## Current Journey Maps\n\n${JSON.stringify(storeState.journeyMapData, null, 2)}`);
    }
    if (storeState.confidenceData) {
      parts.push(`## Current Confidence\n\n${JSON.stringify(storeState.confidenceData, null, 2)}`);
    }
    const vfsContext = parts.join("\n\n");

    sendMessage(
      { text: "I'd like to discuss the problem more before moving on. What areas should we go deeper on?" },
      { body: { vfsContext, strategyPhase: "problem-overview", isDeepDive: true } }
    );
  }, [isLoading, sendMessage]);

  // --- "Build Anyway" handler (strategy alignment override) ---

  const handleBuildAnyway = useCallback(() => {
    if (isLoading) return;

    const originalRequest = alignmentCheckOriginalRequest.current;
    if (!originalRequest) return;

    // Clear alignment check state
    setAlignmentCheckPending(false);
    alignmentCheckOriginalRequest.current = null;

    // Build VFS context (same as building phase)
    const vfsContext = buildBuildingPhaseVfsContext(files);

    const strategyStore = useStrategyStore.getState();
    const currentEditContext = strategyStore.editContext ?? {
      source: "follow-up-edit" as const,
      activePageId: activePageId ?? null,
      activePageName: activePageName ?? null,
      activeRoute: activeRoute ?? null,
      pinnedPageIds: resolvePinnedPageIds(pinnedElements, flowData),
    };
    beginEditingRequest(currentEditContext, originalRequest);

    // Build document context if documents are uploaded
    const docStore = useDocumentStore.getState();
    const hasUploadedDocuments = docStore.documents.length > 0;
    const documentContext = hasUploadedDocuments ? buildInsightsContext(docStore.documents) : undefined;

    requestPhaseRef.current = "editing";
    sendMessage(
      { text: `Build it anyway, mark as untracked. Original request: ${originalRequest}` },
      {
        body: {
          vfsContext: {
            ...vfsContext,
            editContext: `## Edit Context\n\nSource: ${currentEditContext.source}\nActive Page ID: ${currentEditContext.activePageId || "unknown"}\nActive Page Name: ${currentEditContext.activePageName || "unknown"}\nActive Route: ${currentEditContext.activeRoute || "unknown"}\nPinned Page IDs: ${currentEditContext.pinnedPageIds.join(", ") || "none"}`,
          },

          strategyPhase: "editing",
          documentContext,
          hasUploadedDocuments,
          buildAnyway: true,
          isSubsequentEdit: true,
          editContext: currentEditContext,
        },
      }
    );
  }, [isLoading, files, sendMessage, activePageId, activePageName, activeRoute, pinnedElements, flowData, beginEditingRequest]);

  // --- "Finish discussion" handler ---

  const handleFinishDiscussion = useCallback(() => {
    if (isLoading) {
      stop();
    }

    const storeState = useStrategyStore.getState();
    const parts: string[] = [];
    if (storeState.manifestoData) {
      parts.push(`## Current Overview\n\n${JSON.stringify(storeState.manifestoData, null, 2)}`);
    }
    if (storeState.personaData) {
      parts.push(`## Current Personas\n\n${JSON.stringify(storeState.personaData, null, 2)}`);
    }
    if (storeState.journeyMapData) {
      parts.push(`## Current Journey Maps\n\n${JSON.stringify(storeState.journeyMapData, null, 2)}`);
    }
    if (storeState.confidenceData) {
      parts.push(`## Current Confidence\n\n${JSON.stringify(storeState.confidenceData, null, 2)}`);
    }
    const vfsContext = parts.join("\n\n");

    sendMessage(
      { text: "Let's wrap up this discussion. Based on everything we've discussed, update the overview, personas, and journey maps where needed." },
      { body: { vfsContext, strategyPhase: "problem-overview", isDeepDive: true } }
    );
  }, [isLoading, stop, sendMessage]);

  // --- "I'm ready" / "Finish discussion" override for confidence gating ---

  const handleConfidenceReady = useCallback(() => {
    if (isLoading) return;
    if (isDeepDive) {
      handleFinishDiscussion();
      return;
    }
    sendQuickReply("I'm ready — generate the product overview now with what you know.");
  }, [isLoading, sendQuickReply, isDeepDive, handleFinishDiscussion]);

  // Show confidence bar during manifesto phase (both initial and deep-dive)
  const showConfidenceBar = strategyPhase === "problem-overview" && confidenceData !== null;

  // --- Question Tab Handlers ---

  const handleOptionSelect = useCallback(
    (questionIdx: number, answer: string) => {
      setQuestionAnswers((prev) => ({ ...prev, [questionIdx]: answer }));
      setQuestionWriteOwn(null);
      // Auto-advance to next tab (including Submit tab at the end)
      const nextTab = questionIdx + 1;
      if (nextTab <= currentOptionBlocks.length) {
        setQuestionActiveTab(nextTab);
      }
    },
    [currentOptionBlocks.length]
  );

  const handleWriteOwnSelect = useCallback((questionIdx: number) => {
    setQuestionWriteOwn(questionIdx);
    setQuestionActiveTab(questionIdx);
    // Focus the main input after a tick
    setTimeout(() => inputRef.current?.focus(), 50);
  }, []);

  const handleSubmitAllAnswers = useCallback(() => {
    const parts = currentOptionBlocks.map((block, idx) => {
      const answer = questionAnswers[idx];
      return `**${block.question}**\n${answer || "(skipped)"}`;
    });
    sendQuickReply(parts.join("\n\n"));
    // Reset state
    setQuestionAnswers({});
    setQuestionActiveTab(0);
    setQuestionWriteOwn(null);
    lastOptionsMsgId.current = null;
  }, [currentOptionBlocks, questionAnswers, sendQuickReply]);

  // --- Submit ---

  const handleSubmit = async (e?: FormEvent) => {
    e?.preventDefault();

    // Check for programmatic submit override
    const overrideText = pendingSubmitRef.current;
    pendingSubmitRef.current = null;

    const effectiveInput = overrideText ?? input;
    const hasText = effectiveInput.trim().length > 0;
    const hasImages = stagedImages.length > 0;

    if ((!hasText && !hasImages) || isLoading) return;

    // Pre-check billing limit for build/edit phases
    const billingStatus = useBillingStatus.getState().status;
    if (
      (strategyPhase === "building" || strategyPhase === "editing" || strategyPhase === "complete") &&
      billingStatus &&
      !billingStatus.canRunBuildUsage
    ) {
      showLimitModal(
        billingStatus.planTier === "free"
          ? "Free plan AI usage budget exhausted. Upgrade to Pro for more."
          : "Monthly budget exhausted."
      );
      return;
    }

    const messageText = effectiveInput.trim();
    const imagesToSend = [...stagedImages];

    // If "Write my own" is active, capture text as the answer for that question
    if (hasActiveQuestions && questionWriteOwn !== null && hasText) {
      setInput("");
      handleOptionSelect(questionWriteOwn, messageText);
      return;
    }

    // Clear input state immediately
    setInput("");
    setStagedImages([]);

    // Hero phase: transition to problem-overview before sending
    let effectivePhase = strategyPhase;
    if (strategyPhase === "hero") {
      useStrategyStore.getState().setUserPrompt(messageText);
      useStrategyStore.getState().setPhase("problem-overview");
      effectivePhase = "problem-overview";
      onHeroSubmit?.();
    } else if ((strategyPhase === "complete" || strategyPhase === "editing") && completedPages.length > 0) {
      const artifactPhase = classifyArtifactEditPhase(messageText);
      if (artifactPhase) {
        useStrategyStore.getState().clearEditSession();
        useStrategyStore.getState().setPhase(artifactPhase);
        effectivePhase = artifactPhase;
      } else {
        effectivePhase = "editing";
      }
    }

    // Build context based on strategy phase
    let vfsContext: string | Record<string, string> = "";

    if (effectivePhase === "problem-overview" || effectivePhase === "ideation" || effectivePhase === "solution-design") {
      // In strategy phases, send manifesto/persona/flow/idea data as context instead of VFS
      const storeState = useStrategyStore.getState();
      const parts: string[] = [];
      if (storeState.manifestoData) {
        parts.push(`## Current Overview\n\n${JSON.stringify(storeState.manifestoData, null, 2)}`);
      }
      if (storeState.personaData) {
        parts.push(`## Current Personas\n\n${JSON.stringify(storeState.personaData, null, 2)}`);
      }
      if (storeState.journeyMapData) {
        parts.push(`## Current Journey Maps\n\n${JSON.stringify(storeState.journeyMapData, null, 2)}`);
      }
      if (storeState.ideaData) {
        parts.push(`## Current Ideas\n\n${JSON.stringify(storeState.ideaData, null, 2)}`);
        if (storeState.selectedIdeaId) {
          parts.push(`## Selected Idea ID: ${storeState.selectedIdeaId}`);
        }
      }
      if (storeState.flowData) {
        parts.push(`## Current Flow Architecture\n\n${JSON.stringify(storeState.flowData, null, 2)}`);
      }
      vfsContext = parts.join("\n\n");
    } else if (effectivePhase === "building" || effectivePhase === "editing") {
      // In build phase, send full VFS context plus strategy context
      vfsContext = buildBuildingPhaseVfsContext(files);
    } else {
      // Default: existing VFS context behavior
      const contextFiles = ["/design-system.tsx", "/App.tsx", "/components/ui/index.ts"];
      const fileContextParts = contextFiles
        .filter((path) => files[path])
        .map((path) => `Current ${path}:\n\`\`\`tsx\n${files[path]}\n\`\`\``);

      const tokenReminder = `## IMPORTANT: Color Usage Reminder
Use ONLY semantic token classes (bg-primary, bg-card, text-foreground, text-muted-foreground, border-border, etc.).
NEVER use hardcoded colors (bg-blue-500, bg-gray-100, text-gray-600, etc.) as they break the user's theme customization.`;

      vfsContext =
        fileContextParts.length > 0
          ? `## Current VFS State (use this as your source of truth)\n\n${fileContextParts.join("\n\n")}\n\n${tokenReminder}`
          : tokenReminder;

      // Include pinned element context
      const elementContextParts = pinnedElements
        .map((el) => {
          const fileContent = files[el.source.fileName];
          if (!fileContent) return null;

          const lines = fileContent.split("\n");
          const annotated = lines
            .map((line, i) => {
              const num = i + 1;
              const marker = num === el.source.line ? ">>> " : "    ";
              return `${marker}${String(num).padStart(4)}| ${line}`;
            })
            .join("\n");

          return `### Selected Element: ${el.displayLabel}\nFile: ${el.source.fileName} (line ${el.source.line})\nTag: <${el.tagName}>\n${el.className ? `Classes: ${el.className}` : ""}\n${el.textContent ? `Text: "${el.textContent}"` : ""}\n\n\`\`\`tsx\n${annotated}\n\`\`\``;
        })
        .filter(Boolean);

      if (elementContextParts.length > 0) {
        vfsContext +=
          "\n\n## Selected Elements (user pinned these for context - focus edits on these)\n\n" +
          elementContextParts.join("\n\n");
      }
    }

    // Build the message payload
    const messagePayload: { text?: string; files?: FileUIPart[] } = {};
    if (hasText) messagePayload.text = messageText;
    if (hasImages) messagePayload.files = imagesToSend;

    const pinnedPageIds = resolvePinnedPageIds(pinnedElements, flowData);
    const editContext: EditContext | undefined = effectivePhase === "editing"
      ? {
          source: activeRepairContext ? "repair" : "follow-up-edit",
          activePageId: activePageId ?? null,
          activePageName: activePageName ?? null,
          activeRoute: activeRoute ?? null,
          pinnedPageIds,
        }
      : undefined;

    if (editContext) {
      beginEditingRequest(editContext, messageText);
      if (typeof vfsContext === "object") {
        vfsContext.editContext = `## Edit Context\n\nSource: ${editContext.source}\nActive Page ID: ${editContext.activePageId || "unknown"}\nActive Page Name: ${editContext.activePageName || "unknown"}\nActive Route: ${editContext.activeRoute || "unknown"}\nPinned Page IDs: ${editContext.pinnedPageIds.join(", ") || "none"}`;
      }
    }

    // Include current building page info for the build prompt
    const buildingStore = useStrategyStore.getState();
    const buildingPageId = editContext?.activePageId ?? buildingStore.currentBuildingPage;
    const buildingPageName = editContext?.activePageName ?? (
      buildingPageId
        ? buildingStore.flowData?.nodes.find((n) => n.id === buildingPageId)?.label
        : undefined
    );

    // Build document context if documents are uploaded
    const docStore = useDocumentStore.getState();
    const hasUploadedDocuments = docStore.documents.length > 0;
    const documentContext = hasUploadedDocuments ? buildInsightsContext(docStore.documents) : undefined;

    // Include existing insights in strategy phase context
    if (hasUploadedDocuments && docStore.insightsData && typeof vfsContext === "string") {
      vfsContext += `\n\n## Existing Research Insights\n\n${JSON.stringify(docStore.insightsData, null, 2)}`;
    } else if (hasUploadedDocuments && docStore.insightsData && typeof vfsContext === "object") {
      (vfsContext as Record<string, string>).insightsContext = `## Research Insights\n\n${JSON.stringify(docStore.insightsData, null, 2)}`;
    }

    // Determine if this is a subsequent edit (for strategy alignment check)
    const isSubsequentEdit =
      (effectivePhase === "building" || effectivePhase === "editing") && completedPages.length > 0;

    // Store original request for potential "Build Anyway" re-send
    if (isSubsequentEdit) {
      alignmentCheckOriginalRequest.current = messageText;
    }

    // Send user's clean message for display
    // Pass context via request-level body option (hidden from UI, sent to API)
    const repairContext = activeRepairContext
      ? {
          pageId: activeRepairContext.pageId,
          pageName: activeRepairContext.pageName,
          route: activeRepairContext.route,
          errorText: activeRepairContext.errorText,
          errorPath: activeRepairContext.errorPath,
        }
      : undefined;

    requestPhaseRef.current = effectivePhase ?? null;

    await sendMessage(
      messagePayload as { text: string; files?: FileUIPart[] },
      {
        body: {
          vfsContext,

          strategyPhase: effectivePhase,
          currentPageId: buildingPageId,
          currentPageName: buildingPageName,
          documentContext,
          hasUploadedDocuments,
          isSubsequentEdit,
          repairContext,
          editContext,
        },
      }
    );
    trackEvent("chat_message_sent", projectId, { phase: effectivePhase });

    if (repairContext) {
      setActiveRepairContext(null);
    }

    // Clear pinned elements after sending
    clearPinnedElements();
  };

  // Auto-submit initial message from dashboard
  useEffect(() => {
    if (!autoSubmit || !initialInput || didAutoSubmitRef.current) return;
    didAutoSubmitRef.current = true;
    const timer = setTimeout(() => {
      pendingSubmitRef.current = initialInput;
      handleSubmit();
    }, 200);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoSubmit, initialInput]);

  const hasImages = stagedImages.length > 0;
  const atImageLimit = stagedImages.length >= MAX_IMAGES_PER_MESSAGE;

  return (
    <div
      className="flex flex-col h-full relative"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Drag overlay */}
      {isDragOver && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-blue-50/80 border-2 border-dashed border-blue-400 rounded-lg pointer-events-none">
          <div className="text-blue-600 font-medium text-sm">Drop images here</div>
        </div>
      )}

      {/* Confidence Bar */}
      {showConfidenceBar && (
        <ConfidenceBar data={confidenceData} onReady={handleConfidenceReady} isDeepDive={isDeepDive} />
      )}

      {/* Messages */}
      <div className={`flex-1 p-4 space-y-4 ${messages.length === 0 ? "overflow-hidden" : "overflow-y-auto"}`}>
        {messages.length === 0 && (
          <div className="text-center text-neutral-500 text-base flex flex-col items-center justify-center h-full">
            {strategyPhase === "hero" ? (
              <>
                <h2 className="text-2xl font-semibold text-neutral-900 text-center leading-tight">
                  What problem do you want to solve?
                </h2>
                <p className="mt-3 text-sm text-neutral-500 text-center max-w-sm">
                  Describe the problem, and I&apos;ll help you design and build a web app to solve it.
                </p>

                {/* Document Upload Area */}
                <div className="mt-6 w-full max-w-sm">
                  {uploadedDocuments.length > 0 ? (
                    <div className="space-y-2">
                      {uploadedDocuments.map((doc) => (
                        <div key={doc.id} className="flex items-center gap-2 text-sm text-neutral-600 bg-neutral-50 rounded-lg px-3 py-2">
                          <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                          <span className="truncate">{doc.name}</span>
                        </div>
                      ))}
                      <button
                        onClick={() => docFileInputRef.current?.click()}
                        disabled={isDocUploading}
                        className="w-full mt-1 py-2 text-xs text-neutral-400 hover:text-blue-500 transition-colors flex items-center justify-center gap-1"
                      >
                        {isDocUploading ? (
                          <><Loader2 className="w-3 h-3 animate-spin" /> Uploading...</>
                        ) : (
                          <>+ Add more documents</>
                        )}
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => docFileInputRef.current?.click()}
                      disabled={isDocUploading}
                      className="w-full py-3 border-2 border-dashed border-neutral-200 rounded-xl text-sm text-neutral-400 hover:border-blue-300 hover:text-blue-500 hover:bg-blue-50/30 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      {isDocUploading ? (
                        <><Loader2 className="w-4 h-4 animate-spin" /> Extracting text...</>
                      ) : (
                        <>
                          <FileText className="w-4 h-4" />
                          Upload Interview Transcripts or Notes
                        </>
                      )}
                    </button>
                  )}
                  <input
                    ref={docFileInputRef}
                    type="file"
                    accept=".pdf,.docx"
                    multiple
                    className="hidden"
                    onChange={(e) => handleDocumentUpload(e.target.files)}
                  />
                  {uploadedDocuments.length === 0 && (
                    <p className="text-xs text-neutral-400 mt-1.5 text-center">PDF or DOCX files</p>
                  )}
                </div>
              </>
            ) : strategyPhase === "problem-overview" ? (
              <>
                <p>I&apos;m analyzing your problem...</p>
                <p className="mt-2 text-sm text-neutral-400">
                  I&apos;ll help you define a clear product overview and personas.
                </p>
              </>
            ) : strategyPhase === "ideation" ? (
              <>
                <p>Exploring creative ideas...</p>
                <p className="mt-2 text-sm text-neutral-400">
                  I&apos;ll generate 8 distinct approaches to solving your problem.
                </p>
              </>
            ) : strategyPhase === "solution-design" ? (
              <>
                <p>Let&apos;s design the solution...</p>
                <p className="mt-2 text-sm text-neutral-400">
                  I&apos;ll design the Information Architecture and map user flows for your app.
                </p>
              </>
            ) : (
              <>
                <p>Ask me to modify your UI!</p>
                <p className="mt-2 text-sm text-neutral-400">
                  Try: &quot;Change the button to red&quot;
                </p>
              </>
            )}
          </div>
        )}

        {messages.map((message, messageIndex) => {
          const text = getMessageText(message);
          const isLastAssistant =
            message.role === "assistant" &&
            messageIndex === messages.length - 1;

          return (
            <div key={message.id}>
              <div
                className={`flex ${
                  message.role === "user" ? "justify-end" : "justify-start"
                }`}
              >
                <div
                  className={`max-w-[85%] rounded-lg px-3 py-2 text-base ${
                    message.role === "user"
                      ? "bg-neutral-900 text-white"
                      : "bg-neutral-100 text-neutral-800"
                  }`}
                >
                  <MessageImages parts={message.parts} isUser={message.role === "user"} />
                  {isLoading && isLastAssistant ? (
                    <StreamingMessageContent content={text} />
                  ) : message.role === "assistant" && hasFileCodeBlocks(text) ? (
                    <CollapsedMessageContent content={text} />
                  ) : (
                    <MessageContent content={text} />
                  )}
                </div>
              </div>

              {/* Tabbed question interface — only for the last assistant message */}
              {isLastAssistant && !isLoading && currentOptionBlocks.length > 0 && (
                <QuestionTabs
                  blocks={currentOptionBlocks}
                  answers={questionAnswers}
                  activeTab={questionActiveTab}
                  writeOwnIdx={questionWriteOwn}
                  onTabChange={setQuestionActiveTab}
                  onSelectOption={handleOptionSelect}
                  onWriteOwn={handleWriteOwnSelect}
                  onSubmit={handleSubmitAllAnswers}
                />
              )}
            </div>
          );
        })}

        {/* Auto-continuing journey maps indicator */}
        {strategyPhase === "problem-overview" && isJourneyMapContinuing && (
          <div className="flex items-center justify-center gap-2 py-3">
            <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
            <span className="text-sm text-neutral-600">
              Completing journey maps ({journeyMapData?.length || 0}/{personaData?.length || 0} personas)...
            </span>
          </div>
        )}

        {/* Strategy phase approve + discuss more buttons */}
        {strategyPhase === "problem-overview" && manifestoData && personaData && journeyMapData && !isLoading && !isDeepDive && !isJourneyMapContinuing && (journeyMapData.length >= personaData.length || journeyMapContinueAttempts >= 2) && (
          <div className="flex flex-col items-center gap-2 pt-2">
            <button
              onClick={() => {
                onPhaseAction?.("approve-problem-overview");
                // Send follow-up message to trigger ideation (Crazy 8's)
                const storeState = useStrategyStore.getState();
                const parts: string[] = [];
                if (storeState.manifestoData) {
                  parts.push(`## Approved Overview\n\n${JSON.stringify(storeState.manifestoData, null, 2)}`);
                }
                if (storeState.personaData) {
                  parts.push(`## Approved Personas\n\n${JSON.stringify(storeState.personaData, null, 2)}`);
                }
                if (storeState.journeyMapData) {
                  parts.push(`## Approved Journey Maps\n\n${JSON.stringify(storeState.journeyMapData, null, 2)}`);
                }
                const context = parts.join("\n\n");
                sendMessage(
                  { text: "The overview, personas, and journey maps are approved. Generate 8 Crazy 8's ideas for solving this problem." },
                  { body: { vfsContext: context, strategyPhase: "ideation" } }
                );
              }}
              className="inline-flex items-center gap-2 px-4 py-2 bg-neutral-900 text-white text-sm font-medium rounded-lg hover:bg-neutral-800 transition-colors shadow-sm"
            >
              Approve & Ideate
              <ArrowRight className="w-4 h-4" />
            </button>
            <button
              onClick={handleDiscussMore}
              className="inline-flex items-center gap-2 px-4 py-2 text-neutral-600 text-sm font-medium rounded-lg border border-neutral-200 hover:bg-neutral-100 transition-colors"
            >
              Discuss the problem more
            </button>
          </div>
        )}

        {/* "Finish discussion" button at 100% confidence during deep-dive */}
        {strategyPhase === "problem-overview" && isDeepDive && computedConfidenceOverall >= 100 && (
          <div className="flex justify-center pt-2">
            <button
              onClick={handleFinishDiscussion}
              className="inline-flex items-center gap-2 px-4 py-2 bg-neutral-900 text-white text-sm font-medium rounded-lg hover:bg-neutral-800 transition-colors shadow-sm"
            >
              <Check className="w-4 h-4" />
              Finish discussion
            </button>
          </div>
        )}

        {/* Strategy alignment check: "Build Anyway" override */}
        {(strategyPhase === "building" || strategyPhase === "editing" || strategyPhase === "complete") && alignmentCheckPending && !isLoading && (
          <div className="flex justify-center pt-2">
            <button
              onClick={handleBuildAnyway}
              className="inline-flex items-center gap-2 px-4 py-2 text-neutral-600 text-sm font-medium rounded-lg border border-neutral-200 hover:bg-neutral-100 transition-colors"
            >
              Build Anyway
            </button>
          </div>
        )}

        {/* Ideation phase: stop generating ideas */}
        {isIdeationStreaming && (
          <div className="flex justify-center pt-2">
            <button
              onClick={handleStopIdeation}
              className="inline-flex items-center gap-2 px-4 py-2 bg-neutral-100 text-neutral-700 text-sm font-medium rounded-lg hover:bg-neutral-200 transition-colors shadow-sm border border-neutral-200"
            >
              <Square className="w-3.5 h-3.5 fill-current" />
              Stop Generating
            </button>
          </div>
        )}

        {/* Ideation phase: approve selected idea */}
        {strategyPhase === "ideation" && ideaData && selectedIdeaId && !isLoading && (
          <div className="flex justify-center pt-2">
            <button
              onClick={() => {
                onPhaseAction?.("approve-ideation");
                const storeState = useStrategyStore.getState();
                const selectedIdea = storeState.ideaData?.find((i) => i.id === storeState.selectedIdeaId);
                const parts: string[] = [];
                if (storeState.manifestoData) {
                  parts.push(`## Approved Overview\n\n${JSON.stringify(storeState.manifestoData, null, 2)}`);
                }
                if (storeState.personaData) {
                  parts.push(`## Approved Personas\n\n${JSON.stringify(storeState.personaData, null, 2)}`);
                }
                if (storeState.journeyMapData) {
                  parts.push(`## Approved Journey Maps\n\n${JSON.stringify(storeState.journeyMapData, null, 2)}`);
                }
                const context = parts.join("\n\n");
                const selectedIdeaContext = selectedIdea
                  ? `## Selected Idea: ${selectedIdea.title}\n\n${selectedIdea.description}`
                  : "";
                sendMessage(
                  { text: `I've selected the idea "${selectedIdea?.title}". Now design the Information Architecture AND map user flows for each job-to-be-done based on this idea.` },
                  { body: { vfsContext: { vfs: context, selectedIdeaContext }, strategyPhase: "solution-design" } }
                );
              }}
              className="inline-flex items-center gap-2 px-4 py-2 bg-neutral-900 text-white text-sm font-medium rounded-lg hover:bg-neutral-800 transition-colors shadow-sm"
            >
              Approve Idea & Design Solution
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {strategyPhase === "ideation" && ideaData && !isLoading && (
          <p className="text-center text-xs text-neutral-400 pt-1">
            {selectedIdeaId
              ? "You can also describe changes to refine this idea, or suggest a new one."
              : "Click an idea card to select it, or tell me how to refine one."}
          </p>
        )}

        {strategyPhase === "solution-design" && flowData && !isLoading && (
          <div className="flex justify-center pt-2">
            <button
              onClick={() => {
                onPhaseAction?.("approve-solution-design");

                // Transition to parallel building — fire all pages at once
                const storeState = useStrategyStore.getState();
                const pageNodes = storeState.flowData?.nodes.filter((n) => n.type === "page") || [];
                if (pageNodes.length === 0) return;

                // Serialize user flow data for build context
                const userFlowContext = storeState.userFlowsData
                  ? serializeUserFlows(storeState.userFlowsData, storeState.flowData)
                  : "";

                // Build shared context
                const sharedContext = {
                  manifestoContext: storeState.manifestoData
                    ? `## Product Overview\n\nTitle: ${storeState.manifestoData.title}\nProblem: ${storeState.manifestoData.problemStatement}\nTarget User: ${storeState.manifestoData.targetUser}\n\nJobs to be Done:\n${storeState.manifestoData.jtbd.map((j, i) => `${i}. ${j}`).join("\n")}`
                    : "",
                  personaContext: storeState.personaData
                    ? `## Personas\n\n${storeState.personaData.map((p) => `### ${p.name}\nRole: ${p.role}\nGoals: ${p.goals.join(", ")}\nPain Points: ${p.painPoints.join(", ")}`).join("\n\n")}`
                    : "",
                  flowContext: storeState.flowData
                    ? `## App Architecture\n\nPages to build:\n${storeState.flowData.nodes.filter((n) => n.type === "page").map((n) => `- ${n.label} (${n.id}): ${n.description || "No description"}`).join("\n")}`
                    : "",
                  userFlowContext,
                };

                // Detect rebuild: if we already have completed pages, this is a subsequent build
                const isRebuild = storeState.completedPages.length > 0;

                // Build per-page configs, collecting existing code for rebuilds
                const pages = pageNodes.map((node, index) => {
                  const route = index === 0 ? "/" : `/${node.id}`;
                  const componentName = toPascalCase(node.label);
                  const existingCode = isRebuild
                    ? (getLatestFile(`/pages/${componentName}.tsx`) || files[`/pages/${componentName}.tsx`] || undefined)
                    : undefined;
                  return {
                    pageId: node.id,
                    pageName: node.label,
                    componentName,
                    pageRoute: route,
                    existingCode,
                  };
                });

                // Add isRebuild flag to shared context
                const enrichedSharedContext = { ...sharedContext, isRebuild };

                // Store config for retry
                parallelBuildConfigRef.current = { pages, sharedContext: enrichedSharedContext };
                const nameMap: Record<string, { name: string; route: string }> = {};
                for (const p of pages) {
                  nameMap[p.pageId] = { name: p.pageName, route: p.pageRoute };
                }
                parallelPageNamesRef.current = nameMap;

                // Fire build
                parallelBuild.startBuild(pages, enrichedSharedContext);
              }}
              className="inline-flex items-center gap-2 px-4 py-2 bg-neutral-900 text-white text-sm font-medium rounded-lg hover:bg-neutral-800 transition-colors shadow-sm"
            >
              Approve & Start Building
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Parallel build progress cards */}
        {strategyPhase === "building" && parallelMode && (
          <div className="px-2 py-3">
            <BuildProgressCards
              pageBuilds={pageBuilds}
              pageNames={parallelPageNamesRef.current}
              buildPhase={buildPhase}
              foundationPageId={foundationPageId}
              foundationBuild={foundationBuild}
              verificationPaused={verificationPaused}
              verificationPausedPageId={verificationPausedPageId}
              onRetry={(pageId) => {
                if (parallelBuildConfigRef.current) {
                  parallelBuild.retryPage(
                    pageId,
                    parallelBuildConfigRef.current.pages,
                    parallelBuildConfigRef.current.sharedContext
                  );
                }
              }}
              onFixInChat={(pageId) => {
                requestRepairInChat(pageId);
              }}
              onRetryAllFailed={() => {
                if (!parallelBuildConfigRef.current) return;
                for (const [pageId, s] of Object.entries(pageBuilds)) {
                  if (s.buildStage === "build_failed" || s.status === "error") {
                    // Build failed — re-generate from scratch
                    parallelBuild.retryPage(
                      pageId,
                      parallelBuildConfigRef.current.pages,
                      parallelBuildConfigRef.current.sharedContext
                    );
                  }
                }
              }}
              onStopVerification={(pageId) => {
                parallelBuild.stopVerification(pageId);
              }}
              onRetryAnnotation={(pageId) => {
                parallelBuild.retryAnnotation(pageId);
              }}
            />
          </div>
        )}

        {/* Annotation evaluation status — shown as assistant-style chat bubble */}
        {annotationEvaluation.status !== "idle" && (
          <div className="flex justify-start">
            <div className="max-w-[85%] rounded-lg px-3 py-2 text-base bg-neutral-100 text-neutral-800">
              {annotationEvaluation.status === "evaluating" && (
                <div className="space-y-2">
                  <p>
                    {annotationEvaluation.totalPages > 0
                      ? <>Annotating {annotationEvaluation.activePageName || "the next screen"} ({annotationActiveStep} of {annotationEvaluation.totalPages}). I&apos;m reviewing tagged sections and keeping only the ones that clearly reflect a deliberate product decision tied to your personas and jobs-to-be-done.</>
                      : "I'm annotating the generated screens and mapping strategic decisions back to your personas and jobs-to-be-done."}
                  </p>
                  <div className="flex items-center gap-2 text-xs text-neutral-500">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    <span>
                      {annotationEvaluation.completedPages > 0 || annotationEvaluation.failedPages > 0
                        ? `${annotationProcessedPages} page${annotationProcessedPages === 1 ? "" : "s"} finished so far`
                        : "Analyzing sections and mapping them to strategy artifacts"}
                    </span>
                  </div>
                </div>
              )}
              {annotationEvaluation.status === "done" && (
                <div className="space-y-1">
                  <p>
                    {annotationEvaluation.connectionCount > 0
                      ? <>Strategy annotation complete - I mapped <strong>{annotationEvaluation.connectionCount}</strong> annotation{annotationEvaluation.connectionCount > 1 ? "s" : ""} across {annotationEvaluation.completedPages} page{annotationEvaluation.completedPages === 1 ? "" : "s"}. Toggle the annotation button on any frame header to inspect them.</>
                      : "Strategy annotation complete - no sections warranted annotations. The pages are utility-focused without strong strategic connections to flag."}
                  </p>
                  <div className="flex items-center gap-2 text-xs text-emerald-600">
                    <Check className="w-3 h-3" />
                    <span>Annotation complete</span>
                  </div>
                </div>
              )}
              {annotationEvaluation.status === "error" && (
                <div className="space-y-2">
                  <p>
                    {annotationEvaluation.connectionCount > 0
                      ? "I annotated part of the app, but a few screens still need annotation retries. Your current convergence score reflects the pages that were evaluated successfully."
                      : "I couldn't complete the strategy annotation pass, so convergence couldn't be calculated from this run yet."}
                  </p>
                  <div className="flex items-center gap-2 text-xs text-amber-600">
                    <AlertTriangle className="w-3 h-3" />
                    <span>
                      {annotationEvaluation.errorMessage || "Annotation evaluation failed"}
                      {failedAnnotationPageNames.length > 0 ? ` — ${failedAnnotationPageNames.join(", ")}` : ""}
                    </span>
                  </div>
                  {annotationEvaluation.failedPageIds.length > 0 && (
                    <div className="flex flex-wrap gap-2 pt-1">
                      {annotationEvaluation.failedPageIds.map((pageId) => (
                        <button
                          key={pageId}
                          onClick={() => {
                            parallelBuild.retryAnnotation(pageId);
                          }}
                          className="inline-flex items-center gap-1 rounded-md border border-amber-300 bg-white px-2 py-1 text-xs font-medium text-amber-900 transition-colors hover:bg-amber-100"
                        >
                          <RotateCcw className="w-3 h-3" />
                          Retry {parallelPageNamesRef.current[pageId]?.name ?? pageId}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {isLoading && messages[messages.length - 1]?.role !== "assistant" && (
          <StreamingStatus />
        )}

        {error && !billingLimitReached && (
          <div className="bg-red-100 text-red-700 text-sm p-3 rounded-lg">
            Something went wrong. Please try again.
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Pinned Element Chips */}
      {pinnedElements.length > 0 && (
        <div className="px-4 pt-3 pb-1 border-t border-neutral-200 flex flex-wrap items-center gap-1.5">
          {pinnedElements.map((el) => (
            <span
              key={el.id}
              className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 text-xs font-mono rounded-md border border-blue-200 px-2 py-1"
            >
              {el.displayLabel}
              <button
                onClick={() => unpinElement(el.id)}
                className="hover:text-blue-900 transition-colors"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
          {pinnedElements.length > 1 && (
            <button
              onClick={clearPinnedElements}
              className="text-xs text-blue-600 hover:text-blue-800 underline transition-colors"
            >
              Clear all
            </button>
          )}
        </div>
      )}

      {/* Staged Image Preview Strip */}
      {hasImages && (
        <div className="px-4 pt-2 pb-1 border-t border-neutral-200 flex items-center gap-2 overflow-x-auto">
          {stagedImages.map((img, index) => (
            <div key={index} className="relative group shrink-0">
              {/* eslint-disable-next-line @next/next/no-img-element -- data URL from local file input */}
              <img
                src={img.url}
                alt={img.filename || "Staged image"}
                className="w-16 h-16 object-cover rounded-md border border-neutral-200"
              />
              <button
                onClick={() => removeStagedImage(index)}
                className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-neutral-900 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Input */}
      {billingLimitReached ? (
        <div className="p-4 border-t border-neutral-200">
          <div className="flex items-center gap-3 rounded-lg bg-neutral-50 border border-neutral-200 px-4 py-3">
            <p className="flex-1 text-sm text-neutral-500">
              You&apos;ve reached your monthly usage limit.
            </p>
            <button
              type="button"
              onClick={async () => {
                try {
                  const res = await fetch("/api/billing/checkout", { method: "POST" });
                  const data = await res.json();
                  if (data.url) window.location.href = data.url;
                } catch { /* ignore */ }
              }}
              className="shrink-0 px-4 py-2 bg-neutral-900 text-white text-sm font-medium rounded-lg hover:bg-neutral-800 transition-colors flex items-center gap-1.5"
            >
              <Zap className="w-3.5 h-3.5" />
              Upgrade
            </button>
          </div>
        </div>
      ) : (
      <form onSubmit={handleSubmit} className="p-4 border-t border-neutral-200">
        <div className="flex gap-2">
          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/gif,image/webp"
            multiple
            className="hidden"
            onChange={handleFileInputChange}
          />
          {/* Image upload button */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isLoading || atImageLimit}
            className="px-2 py-2 text-neutral-500 hover:text-neutral-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            title={atImageLimit ? `Max ${MAX_IMAGES_PER_MESSAGE} images` : "Attach images"}
          >
            <ImagePlus className="w-5 h-5" />
          </button>
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onPaste={handlePaste}
            placeholder={
              hasActiveQuestions && questionWriteOwn !== null
                ? "Type your answer..."
                : hasImages
                ? "Add a message or send images..."
                : strategyPhase === "hero"
                ? "e.g. My team wastes hours coordinating who's working on what..."
                : strategyPhase === "problem-overview"
                ? "Refine the overview, personas, or journey maps..."
                : strategyPhase === "ideation"
                ? "Discuss or refine the selected idea..."
                : strategyPhase === "solution-design"
                ? "Adjust the IA or user flows..."
                : "Ask me to modify your UI..."
            }
            className="flex-1 px-3 py-2 text-base border border-neutral-200 rounded-md focus:outline-none focus:ring-2 focus:ring-neutral-900 focus:border-transparent disabled:bg-neutral-50 disabled:text-neutral-400"
            disabled={isLoading || (hasActiveQuestions && questionWriteOwn === null)}
          />
          <button
            type="submit"
            disabled={isLoading || (!input.trim() && !hasImages)}
            className="px-3 py-2 bg-neutral-900 text-white rounded-md hover:bg-neutral-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </form>
      )}
    </div>
  );
}

// Tabbed question interface for strategy clarifying questions
function QuestionTabs({
  blocks,
  answers,
  activeTab,
  writeOwnIdx,
  onTabChange,
  onSelectOption,
  onWriteOwn,
  onSubmit,
}: {
  blocks: OptionBlock[];
  answers: Record<number, string>;
  activeTab: number;
  writeOwnIdx: number | null;
  onTabChange: (tab: number) => void;
  onSelectOption: (questionIdx: number, answer: string) => void;
  onWriteOwn: (questionIdx: number) => void;
  onSubmit: () => void;
}) {
  const isSubmitTab = activeTab === blocks.length;
  const answeredCount = Object.keys(answers).length;
  const allAnswered = answeredCount === blocks.length;

  return (
    <div className="mt-3">
      {/* Tab bar */}
      <div className="flex border-b border-neutral-200 overflow-x-auto">
        {blocks.map((_, idx) => (
          <button
            key={idx}
            onClick={() => onTabChange(idx)}
            className={`shrink-0 px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === idx
                ? "border-neutral-900 text-neutral-900"
                : answers[idx]
                ? "border-transparent text-neutral-500 hover:text-neutral-700"
                : "border-transparent text-neutral-400 hover:text-neutral-600"
            }`}
          >
            Question {idx + 1}
            {answers[idx] !== undefined && (
              <Check className="inline-block w-3 h-3 ml-1 text-green-500" />
            )}
          </button>
        ))}
        <button
          onClick={() => onTabChange(blocks.length)}
          className={`shrink-0 px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
            isSubmitTab
              ? "border-neutral-900 text-neutral-900"
              : "border-transparent text-neutral-400 hover:text-neutral-600"
          }`}
        >
          Submit
        </button>
      </div>

      {/* Tab content */}
      <div className="pt-4 pb-1">
        {!isSubmitTab ? (
          <div>
            <p className="text-sm font-medium text-neutral-900 mb-3">
              {blocks[activeTab].question}
            </p>
            <div className="space-y-2">
              {blocks[activeTab].options.map((option, optIdx) => {
                const isSelected = answers[activeTab] === option;
                return (
                  <button
                    key={optIdx}
                    onClick={() => onSelectOption(activeTab, option)}
                    className={`flex items-center gap-3 w-full text-left px-3 py-2.5 rounded-lg border transition-colors ${
                      isSelected
                        ? "border-neutral-900 bg-neutral-50"
                        : "border-neutral-200 hover:border-neutral-300 hover:bg-neutral-50"
                    }`}
                  >
                    <div
                      className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${
                        isSelected ? "border-neutral-900" : "border-neutral-300"
                      }`}
                    >
                      {isSelected && (
                        <div className="w-2 h-2 rounded-full bg-neutral-900" />
                      )}
                    </div>
                    <span className="text-sm text-neutral-700">{option}</span>
                  </button>
                );
              })}

              {/* Write my own option */}
              <button
                onClick={() => onWriteOwn(activeTab)}
                className={`flex items-center gap-3 w-full text-left px-3 py-2.5 rounded-lg border transition-colors ${
                  writeOwnIdx === activeTab
                    ? "border-neutral-900 bg-neutral-50"
                    : "border-dashed border-neutral-300 hover:border-neutral-400 hover:bg-neutral-50"
                }`}
              >
                <div
                  className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${
                    writeOwnIdx === activeTab
                      ? "border-neutral-900"
                      : "border-neutral-300"
                  }`}
                >
                  {writeOwnIdx === activeTab && (
                    <div className="w-2 h-2 rounded-full bg-neutral-900" />
                  )}
                </div>
                <span className="text-sm text-neutral-500">Write my own</span>
              </button>
            </div>
          </div>
        ) : (
          /* Submit / Review tab */
          <div>
            <p className="text-sm font-medium text-neutral-900 mb-3">
              Review your answers
            </p>

            {!allAnswered && (
              <div className="mb-3 flex items-start gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>
                  {answeredCount} of {blocks.length} questions answered.
                  Unanswered questions are marked below.
                </span>
              </div>
            )}

            <div className="space-y-3 mb-4">
              {blocks.map((block, idx) => (
                <button
                  key={idx}
                  onClick={() => onTabChange(idx)}
                  className="w-full text-left group"
                >
                  <p className="text-xs text-neutral-500">{block.question}</p>
                  <p
                    className={`mt-0.5 text-sm ${
                      answers[idx]
                        ? "text-neutral-900"
                        : "text-amber-500 italic"
                    } group-hover:underline`}
                  >
                    {answers[idx] || "Not answered — click to answer"}
                  </p>
                </button>
              ))}
            </div>

            <button
              onClick={onSubmit}
              className="w-full px-4 py-2.5 bg-neutral-900 text-white text-sm font-medium rounded-lg hover:bg-neutral-800 transition-colors"
            >
              Submit Answers
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// Component to render inline image thumbnails from message parts
function MessageImages({ parts, isUser }: { parts: Array<{ type: string; [key: string]: unknown }>; isUser: boolean }) {
  const fileParts = parts.filter(
    (part): part is FileUIPart => part.type === "file" && typeof (part as FileUIPart).url === "string"
  );

  if (fileParts.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2 mb-2">
      {fileParts.map((file, index) => (
        /* eslint-disable-next-line @next/next/no-img-element -- inline data URL from AI response */
        <img
          key={index}
          src={file.url}
          alt={file.filename || "Image"}
          className={`max-w-[200px] max-h-[200px] object-contain rounded-md border ${
            isUser ? "border-neutral-700" : "border-neutral-300"
          }`}
        />
      ))}
    </div>
  );
}

// Render inline markdown: **bold**, *italic*, `code`
function renderInlineMarkdown(text: string): React.ReactNode[] {
  const tokens: React.ReactNode[] = [];
  // Match **bold**, *italic*, `code` — bold must be checked before italic
  const regex = /(\*\*(.+?)\*\*|\*(.+?)\*|`([^`]+)`)/g;
  let lastIndex = 0;
  let match;
  let key = 0;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      tokens.push(text.slice(lastIndex, match.index));
    }
    if (match[2]) {
      // **bold**
      tokens.push(<strong key={key++}>{match[2]}</strong>);
    } else if (match[3]) {
      // *italic*
      tokens.push(<em key={key++}>{match[3]}</em>);
    } else if (match[4]) {
      // `code`
      tokens.push(
        <code key={key++} className="bg-neutral-200 text-neutral-800 px-1 py-0.5 rounded text-xs">
          {match[4]}
        </code>
      );
    }
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    tokens.push(text.slice(lastIndex));
  }
  return tokens;
}

// Component to render message content with code block highlighting
// Hides strategy JSON blocks (options, manifesto, flow) — those are rendered as UI elements
function MessageContent({ content }: { content: string }) {
  if (!content) return null;

  // Strip strategy blocks (including incomplete/open ones from truncated responses)
  const cleaned = stripStrategyBlocks(content);

  // Simple rendering - split by code blocks
  const parts = cleaned.split(/(```[\s\S]*?```)/g);

  return (
    <div className="space-y-2">
      {parts.map((part, index) => {
        // Hide all code blocks entirely — no code shown in chat
        if (part.startsWith("```")) {
          return null;
        }

        // Regular text — render inline markdown (bold, italic, code)
        return part.trim() ? (
          <p key={index} className="whitespace-pre-wrap">
            {renderInlineMarkdown(part)}
          </p>
        ) : null;
      })}
    </div>
  );
}

// Detect which strategy block type is currently streaming (open, not yet closed)
function getStreamingBlockType(text: string): string | null {
  const blockPattern = /```json\s+type="(options|manifesto|personas|flow|ia|page-built|confidence|journey-maps|ideas|user-flows|features|insights|decision-connections|alignment-check)"/g;
  let lastMatch: RegExpExecArray | null = null;
  let match: RegExpExecArray | null;
  while ((match = blockPattern.exec(text)) !== null) {
    lastMatch = match;
  }
  if (!lastMatch) return null;
  // Check if this last block has been closed
  const afterOpening = text.slice(lastMatch.index + lastMatch[0].length);
  if (/```/.test(afterOpening)) return null;
  return lastMatch[1];
}

function getStreamingBlockLabel(
  blockType: string,
  opts: {
    isDeepDive: boolean;
    manifestoData: unknown;
    personaData: unknown;
    journeyMapData: unknown;
    userFlowsData: unknown;
    insightsData: unknown;
    pendingReanalysis: boolean;
    currentBuildingPage: string | null;
  }
): string | null {
  switch (blockType) {
    case "options":
      return opts.isDeepDive ? "Refining questions..." : "Generating questions...";
    case "confidence":
      return "Updating confidence...";
    case "manifesto":
      return opts.manifestoData && opts.isDeepDive ? "Refining product overview..."
        : opts.manifestoData ? "Regenerating product overview..."
        : "Generating product overview...";
    case "personas":
      return opts.personaData && opts.isDeepDive ? "Refining personas..."
        : opts.personaData ? "Regenerating personas..."
        : "Generating personas...";
    case "journey-maps":
      return opts.journeyMapData && opts.isDeepDive ? "Refining journey maps..."
        : opts.journeyMapData ? "Regenerating journey maps..."
        : "Generating journey maps...";
    case "ideas":
      return "Generating ideas...";
    case "features":
      return "Generating key features...";
    case "flow":
    case "ia":
      return "Generating Information Architecture...";
    case "user-flows":
      return opts.userFlowsData ? "Refining user flows..." : "Generating user flows...";
    case "insights":
      return opts.pendingReanalysis ? "Re-analyzing documents..."
        : opts.insightsData ? "Refining document insights..."
        : "Analyzing documents...";
    case "decision-connections":
      return opts.currentBuildingPage ? `Mapping strategy for ${opts.currentBuildingPage}...` : "Mapping strategy connections...";
    case "page-built":
      return opts.currentBuildingPage ? `Building ${opts.currentBuildingPage}...` : "Building page...";
    case "alignment-check":
      return "Checking strategy alignment...";
    default:
      return null;
  }
}

// Streaming message content — hides code, shows preText + compact file indicators
function StreamingMessageContent({ content }: { content: string }) {
  const currentFile = useStreamingStore((s) => s.currentFile);
  const completedFilePaths = useStreamingStore((s) => s.completedFilePaths);
  const phase = useStrategyStore((s) => s.phase);
  const confidenceData = useStrategyStore((s) => s.confidenceData);
  const manifestoData = useStrategyStore((s) => s.manifestoData);
  const isDeepDive = useStrategyStore((s) => s.isDeepDive);
  const personaData = useStrategyStore((s) => s.personaData);
  const journeyMapData = useStrategyStore((s) => s.journeyMapData);
  const userFlowsData = useStrategyStore((s) => s.userFlowsData);
  const currentBuildingPage = useStrategyStore((s) => s.currentBuildingPage);
  const insightsData = useDocumentStore((s) => s.insightsData);
  const hasDocuments = useDocumentStore((s) => s.documents.length > 0);
  const pendingReanalysis = useDocumentStore((s) => s.pendingReanalysis);

  const parsed = useMemo(() => parseStreamingContent(content), [content]);

  // Clean preText: strip strategy blocks
  const cleanPreText = useMemo(() => stripStrategyBlocks(parsed.preText), [parsed.preText]);

  const hasCode = parsed.currentFile !== null || parsed.completedBlocks.length > 0;

  // Detect which strategy block type is actively streaming
  const streamingBlockType = useMemo(() => getStreamingBlockType(content), [content]);
  const streamingLabel = useMemo(() =>
    streamingBlockType
      ? getStreamingBlockLabel(streamingBlockType, {
          isDeepDive, manifestoData, personaData, journeyMapData,
          userFlowsData, insightsData, pendingReanalysis, currentBuildingPage,
        })
      : null,
    [streamingBlockType, isDeepDive, manifestoData, personaData, journeyMapData, userFlowsData, insightsData, pendingReanalysis, currentBuildingPage]
  );

  // No text and no code yet → phase-aware typing indicator
  if (!cleanPreText && !hasCode && !streamingBlockType) {
    const phaseHint =
      phase === "hero" || phase === "problem-overview"
        ? isDeepDive ? "Going deeper..."
        : hasDocuments && !insightsData ? "Analyzing uploaded documents..."
        : pendingReanalysis ? "Re-analyzing documents..."
        : manifestoData ? "Refining product overview..."
        : confidenceData && confidenceData.overall >= 80 ? "Generating product overview..."
        : "Thinking about what to ask you..."
      : phase === "ideation" ? "Generating creative ideas..."
      : phase === "solution-design"
        ? userFlowsData ? "Refining solution design..."
        : "Designing solution..."
      : phase === "editing"
        ? "Preparing a targeted edit..."
      : phase === "building"
        ? currentBuildingPage ? `Preparing to build ${currentBuildingPage}...`
        : "Writing code..."
      : null;

    if (phaseHint) {
      return (
        <div className="flex items-center gap-2 py-1">
          <Loader2 className="w-3.5 h-3.5 animate-spin text-neutral-400 shrink-0" />
          <span className="text-sm text-neutral-500">{phaseHint}</span>
        </div>
      );
    }

    return (
      <div className="flex items-center gap-1 py-1">
        <span className="w-1.5 h-1.5 rounded-full bg-neutral-400 animate-pulse" />
        <span className="w-1.5 h-1.5 rounded-full bg-neutral-400 animate-pulse [animation-delay:150ms]" />
        <span className="w-1.5 h-1.5 rounded-full bg-neutral-400 animate-pulse [animation-delay:300ms]" />
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {cleanPreText && <p className="whitespace-pre-wrap">{renderInlineMarkdown(cleanPreText)}</p>}

      {/* Strategy block streaming indicator */}
      {streamingLabel && (
        <div className="flex items-center gap-1.5 text-xs text-blue-600">
          <Loader2 className="w-3 h-3 animate-spin shrink-0" />
          <span className="font-medium">{streamingLabel}</span>
        </div>
      )}

      {/* Completed file badges */}
      {completedFilePaths.map((path) => (
        <div key={path} className="flex items-center gap-1.5 text-xs text-green-700">
          <Check className="w-3 h-3 shrink-0" />
          <span className="font-mono truncate">{path}</span>
        </div>
      ))}

      {/* Currently streaming file indicator */}
      {currentFile && !completedFilePaths.includes(currentFile.path) && (
        <div className="flex items-center gap-1.5 text-xs text-blue-600">
          <Loader2 className="w-3 h-3 animate-spin shrink-0" />
          <span className="font-mono truncate">Writing {currentFile.path}...</span>
        </div>
      )}
    </div>
  );
}

// Collapsed message for completed assistant messages that contain file code blocks
function CollapsedMessageContent({ content }: { content: string }) {
  const [expanded, setExpanded] = useState(false);

  const { summary, filePaths } = useMemo(() => {
    const parsed = parseStreamingContent(content);
    const cleanPre = stripStrategyBlocks(parsed.preText);

    // Extract first sentence as summary
    const sentenceMatch = cleanPre.match(/^(.+?[.!?])(?:\s|$)/);
    const summaryText = sentenceMatch ? sentenceMatch[1] : cleanPre.split("\n")[0] || "Code generated.";

    // Collect all file paths from code blocks
    const paths = parsed.completedBlocks.map((b) => b.path);

    return { summary: summaryText, filePaths: paths };
  }, [content]);

  if (expanded) {
    return (
      <div className="space-y-2">
        <MessageContent content={content} />
        <button
          onClick={() => setExpanded(false)}
          className="text-xs text-neutral-400 hover:text-neutral-600 transition-colors"
        >
          Collapse
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <p className="text-sm">{summary}</p>
      {filePaths.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {filePaths.map((path) => (
            <span
              key={path}
              className="inline-flex items-center gap-1 text-xs font-mono bg-neutral-200/60 text-neutral-600 rounded px-1.5 py-0.5"
            >
              <Check className="w-2.5 h-2.5 text-green-600 shrink-0" />
              {path}
            </span>
          ))}
        </div>
      )}
      <button
        onClick={() => setExpanded(true)}
        className="text-xs text-neutral-400 hover:text-neutral-600 transition-colors"
      >
        Show full response
      </button>
    </div>
  );
}

// Phase-aware spinner shown before the first assistant token arrives
function StreamingStatus() {
  const phase = useStrategyStore((s) => s.phase);
  const isDeepDive = useStrategyStore((s) => s.isDeepDive);
  const currentBuildingPage = useStrategyStore((s) => s.currentBuildingPage);
  const hasDocuments = useDocumentStore((s) => s.documents.length > 0);
  const pendingReanalysis = useDocumentStore((s) => s.pendingReanalysis);

  const message =
    phase === "hero" || phase === "problem-overview"
      ? isDeepDive ? "Going deeper into the problem..."
      : pendingReanalysis ? "Re-analyzing all documents..."
      : hasDocuments ? "Analyzing your problem and documents..."
      : "Analyzing your problem..."
    : phase === "ideation" ? "Generating ideas..."
    : phase === "solution-design" ? "Designing solution..."
    : phase === "editing" ? "Preparing a targeted edit..."
    : phase === "building"
      ? currentBuildingPage ? `Preparing to build ${currentBuildingPage}...`
      : "Preparing to build..."
    : null;

  return (
    <div className="flex justify-start">
      <div className="bg-neutral-100 rounded-lg px-3 py-2 flex items-center gap-2">
        <Loader2 className="w-4 h-4 animate-spin text-neutral-500 shrink-0" />
        {message && <span className="text-sm text-neutral-500">{message}</span>}
      </div>
    </div>
  );
}
