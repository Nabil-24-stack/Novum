"use client";

import { useChat } from "@ai-sdk/react";
import { useEffect, useRef, useState, useCallback, useMemo, DragEvent, ClipboardEvent, FormEvent } from "react";
import { Send, Loader2, X, ImagePlus, ChevronDown, ArrowRight, Check, AlertTriangle, Square, FileText } from "lucide-react";
import { toast } from "sonner";
import { useChatContextStore } from "@/hooks/useChatContextStore";
import { useStreamingStore } from "@/hooks/useStreamingStore";
import { useProductBrainStore } from "@/hooks/useProductBrainStore";
import { useStrategyStore, type StrategyPhase, type ConfidenceData, type PersonaData, type IdeaData, type KeyFeaturesData, type JourneyMapData, type JourneyStage, type UserFlow, type FlowData } from "@/hooks/useStrategyStore";
import { useDocumentStore, type InsightData, type InsightsCardData } from "@/hooks/useDocumentStore";
import { buildInsightsContext } from "@/lib/ai/insights-prompt";
import { useParallelBuild } from "@/hooks/useParallelBuild";
import { toPascalCase } from "@/lib/vfs/app-generator";
import { ConfidenceBar } from "./ConfidenceBar";
import { BuildProgressCards } from "./BuildProgressCards";
import { runGatekeeper } from "@/lib/ai/gatekeeper";
import { parseStreamingContent } from "@/lib/streaming-parser";
import type { FileUIPart } from "ai";

const FILE_CODE_BLOCK_RE = /```\w*\s+file="[^"]+"/;
function hasFileCodeBlocks(content: string): boolean {
  return FILE_CODE_BLOCK_RE.test(content);
}

/** Strip strategy JSON blocks from text (manifesto, flow, options, page-built, confidence, personas, etc.) */
function stripStrategyBlocks(text: string): string {
  // Strip closed strategy blocks
  let cleaned = text.replace(/```json\s+type="(?:options|manifesto|personas|flow|ia|page-built|confidence|journey-maps|ideas|user-flows|features|decision-connections|insights)"[\s\S]*?```/g, "");
  // Strip open (still-streaming) strategy blocks
  cleaned = cleaned.replace(/```json\s+type="(?:options|manifesto|personas|flow|ia|page-built|confidence|journey-maps|ideas|user-flows|features|decision-connections|insights)"[\s\S]*$/, "");
  return cleaned.trim();
}

const ACCEPTED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"];
const MAX_IMAGE_SIZE_BYTES = 4 * 1024 * 1024; // 4MB
const MAX_IMAGES_PER_MESSAGE = 5;

type ModelId = "gemini-2.5-pro" | "gemini-3-pro-preview" | "claude-sonnet-4-6";

const MODEL_OPTIONS: { id: ModelId; label: string; provider: string }[] = [
  { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro", provider: "Google" },
  { id: "gemini-3-pro-preview", label: "Gemini 3 Pro", provider: "Google" },
  { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6", provider: "Anthropic" },
];

interface ChatTabProps {
  writeFile: (path: string, content: string) => void;
  files: Record<string, string>;
  getLatestFile: (path: string) => string | undefined;
  strategyPhase?: StrategyPhase;
  onPhaseAction?: (action: "approve-problem-overview" | "approve-ideation" | "approve-solution-design") => void;
  /** Called when user sends their first message in hero phase (phase transition to manifesto) */
  onHeroSubmit?: () => void;
  /** Called when user approves a built page and wants to build the next one */
  onApproveAndBuildNext?: (nextPageId: string) => void;
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


interface OptionBlock {
  question: string;
  options: string[];
}

// Module-scoped sets to survive component remounts (e.g., docked → floating switch)
const processedBlocksSet = new Set<string>();
const processedStrategyBlocksSet = new Set<string>();

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

export function ChatTab({ writeFile, files, getLatestFile, strategyPhase, onPhaseAction, onHeroSubmit, onApproveAndBuildNext }: ChatTabProps) {
  const [input, setInput] = useState("");
  const [selectedModel, setSelectedModel] = useState<ModelId>("claude-sonnet-4-6");
  const [stagedImages, setStagedImages] = useState<FileUIPart[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
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
  const currentBuildingPage = useStrategyStore((s) => s.currentBuildingPage);
  const pendingApprovalPage = useStrategyStore((s) => s.pendingApprovalPage);
  const parallelMode = useStreamingStore((s) => s.parallelMode);
  const pageBuilds = useStreamingStore((s) => s.pageBuilds);
  const annotationEvaluation = useStreamingStore((s) => s.annotationEvaluation);

  // Parallel build orchestrator
  const parallelBuild = useParallelBuild({ writeFile, files, getLatestFile });
  const parallelBuildConfigRef = useRef<{
    pages: { pageId: string; pageName: string; componentName: string; pageRoute: string }[];
    sharedContext: { manifestoContext: string; personaContext: string; flowContext: string };
  } | null>(null);
  const parallelPageNamesRef = useRef<Record<string, { name: string; route: string }>>({});

  const { messages, sendMessage, status, error, stop } = useChat({
    onError: (err) => {
      console.error("Chat error:", err);
    },
  });

  const isLoading = status === "submitted" || status === "streaming";

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
    const docContext = buildInsightsContext(docs);
    sendMessage(
      { text: "I've uploaded additional documents. Skip questions — immediately re-analyze ALL documents together and regenerate every artifact: output the updated insights block, then updated manifesto, personas, and journey maps. Incorporate new findings from the additional documents." },
      {
        body: {
          vfsContext: "",
          modelId: selectedModel,
          strategyPhase: "problem-overview",
          documentContext: docContext,
          hasUploadedDocuments: true,
        },
      }
    );
  }, [pendingReanalysis, isLoading, sendMessage, selectedModel]);

  // --- Pending address gaps: auto-send message when "Address Gaps with AI" clicked ---
  useEffect(() => {
    if (!pendingAddressGaps || isLoading) return;

    // Clear the flag immediately to prevent re-fires
    useChatContextStore.getState().setPendingAddressGaps(null);

    const { unaddressedJtbds } = pendingAddressGaps;
    if (unaddressedJtbds.length === 0) return;

    // Build user-visible message
    const jtbdList = unaddressedJtbds
      .map((j) => `${j.index + 1}. "${j.text}"`)
      .join("\n");

    const text = `Address the following unaddressed jobs-to-be-done by enhancing existing pages or adding minimal new ones. Do NOT rewrite or significantly change existing pages — only add what's needed to cover these gaps.\n\n${jtbdList}\n\nFor each change, output a decision-connections block mapping the new/modified components to the JTBD indices they address.`;

    // Build VFS context (building phase format: Record<string, string>)
    const storeState = useStrategyStore.getState();

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

    // Include existing product brain connections so AI knows what's already addressed
    const brainData = useProductBrainStore.getState().brainData;
    const existingConnections = brainData
      ? `## Existing Product Brain Connections\n\n${JSON.stringify(brainData.pages.map((p) => ({ pageId: p.pageId, connections: p.connections })), null, 2)}`
      : "";

    const vfsContext: Record<string, string> = {
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
      existingConnections,
      gapContext: `## Unaddressed Jobs-To-Be-Done (GAPS)\n\nThese JTBDs are not yet covered by any page component. Address them by enhancing existing pages or adding new features.\n\n${jtbdList}`,
    };

    sendMessage(
      { text },
      { body: { vfsContext, modelId: selectedModel, strategyPhase: "building" } }
    );
  }, [pendingAddressGaps, isLoading, sendMessage, selectedModel, files]);

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
      // Only clear streaming state if final data was successfully parsed.
      // If the AI response was truncated, keep streaming data visible on canvas.
      const store = useStrategyStore.getState();
      if (store.streamingOverview && store.manifestoData) {
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
  }, [messages, isLoading]);

  // --- Stream partial insights data to the canvas in real-time ---
  useEffect(() => {
    if (!isLoading) {
      const docStore = useDocumentStore.getState();
      if (docStore.streamingInsights && docStore.insightsData) {
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
  }, [messages, isLoading]);

  // --- Stream partial persona data to the canvas in real-time ---
  useEffect(() => {
    if (!isLoading) {
      const store = useStrategyStore.getState();
      if (store.streamingPersonas && store.personaData) {
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
      if (store.streamingJourneyMaps && store.journeyMapData) {
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

  // --- Stream partial idea data to the canvas in real-time ---
  useEffect(() => {
    if (!isLoading) {
      const store = useStrategyStore.getState();
      if (store.streamingIdeas && store.ideaData) {
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
                + gated.report.layoutDeclarationAdditions.length;
              toast.info(`Gatekeeper: ${total} design system fix${total > 1 ? "es" : ""} applied`);
              console.log("[Gatekeeper] Applied fixes:", gated.report);
            }
            writeFile(block.path, gated.code);
          }
        });
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps -- files is read via closure at call-time; adding it would re-run gatekeeper on every VFS change
  }, [messages, writeFile]);

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
              useStrategyStore.getState().setJourneyMapData(parsed);
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
              store.setPendingApprovalPage(parsed.pageId);
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
      const buildingPage = useStrategyStore.getState().currentBuildingPage;
      store.startStreaming(buildingPage);
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
    }

    // Track completed files
    parsed.completedBlocks.forEach((block) => store.markFileComplete(block.path));
  }, [messages, isLoading]);

  // Sync targetPageId when currentBuildingPage changes mid-stream
  useEffect(() => {
    const store = useStreamingStore.getState();
    if (store.isStreaming && currentBuildingPage) {
      store.setTargetPageId(currentBuildingPage);
    }
  }, [currentBuildingPage]);

  // Auto-scroll to bottom
  useEffect(() => {
    const behavior = status === "streaming" ? "instant" : "smooth";
    messagesEndRef.current?.scrollIntoView({ behavior });
  }, [messages, status, currentOptionBlocks.length, strategyPhase, pendingApprovalPage, annotationEvaluation.status]);

  // --- Self-healing verification loop ---
  const prevStatusRef = useRef(status);
  const verifyAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const wasActive = prevStatusRef.current !== "ready";
    prevStatusRef.current = status;

    if (wasActive && status === "ready") {
      const store = useStreamingStore.getState();
      if (store.completedFilePaths.length === 0) return; // No code written
      if (store.parallelMode) return; // Skip during parallel builds

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
          modelId: selectedModel,
          pageId: targetPageId,
          signal: controller.signal,
        }).then((result) => {
          if (controller.signal.aborted) return;
          if (result.status === "fixed") {
            toast.success(`Auto-fixed ${result.fixCount} issue${result.fixCount > 1 ? "s" : ""}`);
          } else if (result.status === "failed") {
            toast.warning("Could not auto-fix all issues");
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
  }, [status, selectedModel]);

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
        { body: { vfsContext, modelId: selectedModel, strategyPhase, isDeepDive: useStrategyStore.getState().isDeepDive } }
      );
    },
    [isLoading, sendMessage, selectedModel, strategyPhase]
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
      { body: { vfsContext, modelId: selectedModel, strategyPhase: "problem-overview", isDeepDive: true } }
    );
  }, [isLoading, sendMessage, selectedModel]);

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
      { body: { vfsContext, modelId: selectedModel, strategyPhase: "problem-overview", isDeepDive: true } }
    );
  }, [isLoading, stop, sendMessage, selectedModel]);

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

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    const hasText = input.trim().length > 0;
    const hasImages = stagedImages.length > 0;

    if ((!hasText && !hasImages) || isLoading) return;

    const messageText = input.trim();
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
    } else if (effectivePhase === "building") {
      // In build phase, send full VFS context plus strategy context
      const storeState = useStrategyStore.getState();
      const contextFiles = ["/design-system.tsx", "/App.tsx", "/components/ui/index.ts"];
      const fileContextParts = contextFiles
        .filter((path) => files[path])
        .map((path) => `Current ${path}:\n\`\`\`tsx\n${files[path]}\n\`\`\``);

      const tokenReminder = `## IMPORTANT: Color Usage Reminder
Use ONLY semantic token classes (bg-primary, bg-card, text-foreground, text-muted-foreground, border-border, etc.).
NEVER use hardcoded colors (bg-blue-500, bg-gray-100, text-gray-600, etc.) as they break the user's theme customization.`;

      const vfs = fileContextParts.length > 0
        ? `## Current VFS State (use this as your source of truth)\n\n${fileContextParts.join("\n\n")}\n\n${tokenReminder}`
        : tokenReminder;

      vfsContext = {
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
      };
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

    // Include current building page info for the build prompt
    const buildingStore = useStrategyStore.getState();
    const buildingPageId = buildingStore.currentBuildingPage;
    const buildingPageName = buildingPageId
      ? buildingStore.flowData?.nodes.find((n) => n.id === buildingPageId)?.label
      : undefined;

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

    // Send user's clean message for display
    // Pass context via request-level body option (hidden from UI, sent to API)
    await sendMessage(
      messagePayload as { text: string; files?: FileUIPart[] },
      { body: { vfsContext, modelId: selectedModel, strategyPhase: effectivePhase, currentPageId: buildingPageId, currentPageName: buildingPageName, documentContext, hasUploadedDocuments } }
    );

    // Clear pinned elements after sending
    clearPinnedElements();
  };

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

        {/* Strategy phase approve + discuss more buttons */}
        {strategyPhase === "problem-overview" && manifestoData && personaData && journeyMapData && !isLoading && !isDeepDive && (
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
                  { body: { vfsContext: context, modelId: selectedModel, strategyPhase: "ideation" } }
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
                  { body: { vfsContext: { vfs: context, selectedIdeaContext }, modelId: selectedModel, strategyPhase: "solution-design" } }
                );
              }}
              className="inline-flex items-center gap-2 px-4 py-2 bg-neutral-900 text-white text-sm font-medium rounded-lg hover:bg-neutral-800 transition-colors shadow-sm"
            >
              Approve Idea & Design Solution
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
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

                // Build per-page configs
                const pages = pageNodes.map((node, index) => {
                  const route = index === 0 ? "/" : `/${node.id}`;
                  return {
                    pageId: node.id,
                    pageName: node.label,
                    componentName: toPascalCase(node.label),
                    pageRoute: route,
                  };
                });

                // Store config for retry
                parallelBuildConfigRef.current = { pages, sharedContext };
                const nameMap: Record<string, { name: string; route: string }> = {};
                for (const p of pages) {
                  nameMap[p.pageId] = { name: p.pageName, route: p.pageRoute };
                }
                parallelPageNamesRef.current = nameMap;

                // Fire all builds in parallel
                parallelBuild.startBuild(pages, sharedContext, selectedModel);
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
            <div className="text-xs text-neutral-500 mb-2 px-1">Building all pages in parallel...</div>
            <BuildProgressCards
              pageBuilds={pageBuilds}
              pageNames={parallelPageNamesRef.current}
              onRetry={(pageId) => {
                if (parallelBuildConfigRef.current) {
                  parallelBuild.retryPage(
                    pageId,
                    parallelBuildConfigRef.current.pages,
                    parallelBuildConfigRef.current.sharedContext
                  );
                }
              }}
              onRetryVerification={(pageId) => {
                parallelBuild.retryVerification(pageId);
              }}
              onRetryAllFailed={() => {
                if (!parallelBuildConfigRef.current) return;
                const failedIds = Object.entries(pageBuilds)
                  .filter(([, s]) => s.status === "error")
                  .map(([id]) => id);
                for (const pageId of failedIds) {
                  parallelBuild.retryPage(
                    pageId,
                    parallelBuildConfigRef.current.pages,
                    parallelBuildConfigRef.current.sharedContext
                  );
                }
              }}
              onReviewAll={() => {
                useStrategyStore.getState().setPhase("complete");
                useStreamingStore.getState().endParallelStreaming();
                useStrategyStore.getState().setBuildingPages([]);
              }}
            />
          </div>
        )}

        {/* Annotation evaluation status — shown as assistant-style message after builds */}
        {strategyPhase === "building" && parallelMode && annotationEvaluation.status !== "idle" && (
          <div className="flex items-start gap-3 px-4 py-3">
            <div className="w-7 h-7 rounded-full bg-neutral-100 flex items-center justify-center flex-shrink-0 mt-0.5">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-neutral-500">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              {annotationEvaluation.status === "evaluating" && (
                <div className="space-y-2">
                  <p className="text-sm text-neutral-800">
                    Now I&apos;m evaluating strategy annotations across all pages. I&apos;m reviewing each UI section to identify which ones represent deliberate product decisions tied to your personas and jobs-to-be-done...
                  </p>
                  <div className="flex items-center gap-2 text-xs text-neutral-500">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    <span>Analyzing sections and mapping to strategy artifacts</span>
                  </div>
                </div>
              )}
              {annotationEvaluation.status === "done" && (
                <div className="space-y-1">
                  <p className="text-sm text-neutral-800">
                    {annotationEvaluation.connectionCount > 0
                      ? <>Strategy evaluation complete — I mapped <strong>{annotationEvaluation.connectionCount}</strong> annotation{annotationEvaluation.connectionCount > 1 ? "s" : ""} across your pages. Each one connects a UI section to a specific persona need or job-to-be-done. Toggle the annotation button on any frame header to see them.</>

                      : "Strategy evaluation complete — no sections warranted annotations. The pages are utility-focused without strong strategic connections to flag."}
                  </p>
                  <div className="flex items-center gap-2 text-xs text-emerald-600">
                    <Check className="w-3 h-3" />
                    <span>Evaluation complete</span>
                  </div>
                </div>
              )}
              {annotationEvaluation.status === "error" && (
                <div className="space-y-1">
                  <p className="text-sm text-neutral-800">
                    I couldn&apos;t complete the strategy annotation evaluation, but your pages are fully built and working. You can still use the app — annotations just won&apos;t be available.
                  </p>
                  <div className="flex items-center gap-2 text-xs text-amber-600">
                    <AlertTriangle className="w-3 h-3" />
                    <span>{annotationEvaluation.errorMessage || "Evaluation failed"}</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Page approval button during building phase (sequential mode only) */}
        {strategyPhase === "building" && !parallelMode && pendingApprovalPage && !isLoading && (() => {
          const storeState = useStrategyStore.getState();
          const pageNodes = storeState.flowData?.nodes.filter((n) => n.type === "page") || [];
          const nextPage = pageNodes.find((n) => !completedPages.includes(n.id));
          const isLastPage = !nextPage;
          const approvedPageName = pageNodes.find((n) => n.id === pendingApprovalPage)?.label || pendingApprovalPage;

          return (
            <div className="flex justify-center pt-2">
              <button
                onClick={() => {
                  storeState.setPendingApprovalPage(null);

                  if (isLastPage) {
                    // All pages built
                    storeState.setPhase("complete");
                    return;
                  }

                  // Ensure next page is in /flow.json so its FlowFrame mounts immediately
                  // (the AI may have overwritten flow.json with only built pages)
                  const flowJsonRaw = files["/flow.json"];
                  if (flowJsonRaw) {
                    try {
                      const flow = JSON.parse(flowJsonRaw);
                      if (Array.isArray(flow.pages) && !flow.pages.some((p: { id: string }) => p.id === nextPage!.id)) {
                        flow.pages.push({
                          id: nextPage!.id,
                          name: nextPage!.label,
                          route: `/${nextPage!.id}`,
                        });
                        if (!flow.connections) flow.connections = [];
                        flow.connections.push({
                          from: pendingApprovalPage,
                          to: nextPage!.id,
                        });
                        writeFile("/flow.json", JSON.stringify(flow, null, 2));
                      }
                    } catch {
                      // Fail-safe: if parsing fails, continue without pre-populating
                    }
                  }

                  // Build next page
                  storeState.setBuildingPage(nextPage!.id);
                  useStreamingStore.getState().startStreaming(nextPage!.id);
                  onApproveAndBuildNext?.(nextPage!.id);

                  sendMessage(
                    { text: `"${approvedPageName}" looks great! Now build the next page: "${nextPage!.label}" (${nextPage!.id}).` },
                    { body: { vfsContext: "", modelId: selectedModel, strategyPhase: "building", currentPageId: nextPage!.id, currentPageName: nextPage!.label } }
                  );
                }}
                className="inline-flex items-center gap-2 px-4 py-2 bg-neutral-900 text-white text-sm font-medium rounded-lg hover:bg-neutral-800 transition-colors shadow-sm"
              >
                {isLastPage ? (
                  <>
                    Approve & Finish
                    <Check className="w-4 h-4" />
                  </>
                ) : (
                  <>
                    Approve & Build Next Page
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          );
        })()}

        {isLoading && messages[messages.length - 1]?.role !== "assistant" && (
          <StreamingStatus />
        )}

        {error && (
          <div className="bg-red-100 text-red-700 text-base p-3 rounded-lg">
            Error: {error.message}
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
        {/* Model selector */}
        <div className="mt-2 flex items-center">
          <div className="relative">
            <select
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value as ModelId)}
              disabled={isLoading}
              className="appearance-none text-xs text-neutral-500 bg-neutral-50 border border-neutral-200 rounded-md pl-2 pr-6 py-1 cursor-pointer hover:bg-neutral-100 focus:outline-none focus:ring-1 focus:ring-neutral-400 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {MODEL_OPTIONS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 text-neutral-400 pointer-events-none" />
          </div>
        </div>
      </form>
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
  const blockPattern = /```json\s+type="(options|manifesto|personas|flow|ia|page-built|confidence|journey-maps|ideas|user-flows|features|insights|decision-connections)"/g;
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
