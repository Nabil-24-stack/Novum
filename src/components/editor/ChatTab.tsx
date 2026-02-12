"use client";

import { useChat } from "@ai-sdk/react";
import { useEffect, useRef, useState, useCallback, useMemo, DragEvent, ClipboardEvent, FormEvent } from "react";
import { Send, Loader2, X, ImagePlus, ChevronDown, ArrowRight, Check, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { useChatContextStore } from "@/hooks/useChatContextStore";
import { useStreamingStore } from "@/hooks/useStreamingStore";
import { useStrategyStore, type StrategyPhase } from "@/hooks/useStrategyStore";
import { runGatekeeper } from "@/lib/ai/gatekeeper";
import { parseStreamingContent } from "@/lib/streaming-parser";
import type { FileUIPart } from "ai";

const FILE_CODE_BLOCK_RE = /```\w*\s+file="[^"]+"/;
function hasFileCodeBlocks(content: string): boolean {
  return FILE_CODE_BLOCK_RE.test(content);
}

/** Strip strategy JSON blocks from text (manifesto, flow, options, page-built) */
function stripStrategyBlocks(text: string): string {
  // Strip closed strategy blocks
  let cleaned = text.replace(/```json\s+type="(?:options|manifesto|flow|page-built)"[\s\S]*?```/g, "");
  // Strip open (still-streaming) strategy blocks
  cleaned = cleaned.replace(/```json\s+type="(?:options|manifesto|flow|page-built)"[\s\S]*$/, "");
  return cleaned.trim();
}

const ACCEPTED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"];
const MAX_IMAGE_SIZE_BYTES = 4 * 1024 * 1024; // 4MB
const MAX_IMAGES_PER_MESSAGE = 5;

type ModelId = "gemini-2.5-pro" | "gemini-3-pro-preview" | "claude-sonnet-4-5";

const MODEL_OPTIONS: { id: ModelId; label: string; provider: string }[] = [
  { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro", provider: "Google" },
  { id: "gemini-3-pro-preview", label: "Gemini 3 Pro", provider: "Google" },
  { id: "claude-sonnet-4-5", label: "Claude Sonnet 4.5", provider: "Anthropic" },
];

interface ChatTabProps {
  writeFile: (path: string, content: string) => void;
  files: Record<string, string>;
  strategyPhase?: StrategyPhase;
  onPhaseAction?: (action: "approve-manifesto" | "approve-flow") => void;
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
const FLOW_REGEX = /```json\s+type="flow"\n([\s\S]*?)```/g;
const OPTIONS_REGEX = /```json\s+type="options"\n([\s\S]*?)```/g;
const PAGE_BUILT_REGEX = /```json\s+type="page-built"\n([\s\S]*?)```/g;

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

  const solution = extractJsonStringValue(content, 'solution');
  if (solution !== undefined) result.solution = solution;

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

export function ChatTab({ writeFile, files, strategyPhase, onPhaseAction, onHeroSubmit, onApproveAndBuildNext }: ChatTabProps) {
  const [input, setInput] = useState("");
  const [selectedModel, setSelectedModel] = useState<ModelId>("gemini-2.5-pro");
  const [stagedImages, setStagedImages] = useState<FileUIPart[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { pinnedElements, unpinElement, clearPinnedElements } = useChatContextStore();
  const manifestoData = useStrategyStore((s) => s.manifestoData);
  const flowData = useStrategyStore((s) => s.flowData);
  const completedPages = useStrategyStore((s) => s.completedPages);
  const currentBuildingPage = useStrategyStore((s) => s.currentBuildingPage);
  const pendingApprovalPage = useStrategyStore((s) => s.pendingApprovalPage);

  const { messages, sendMessage, status, error } = useChat({
    onError: (err) => {
      console.error("Chat error:", err);
    },
  });

  const isLoading = status === "submitted" || status === "streaming";

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

  // Only show question tabs before manifesto is generated (clarifying phase)
  const hasActiveQuestions = currentOptionBlocks.length > 0 && !manifestoData;

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
      // When streaming ends, clear streaming state (full parse in the extraction effect sets manifestoData)
      if (useStrategyStore.getState().streamingOverview) {
        useStrategyStore.getState().setStreamingOverview(null);
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
              const total = gated.report.colorViolations.length
                + gated.report.spacingViolations.length
                + gated.report.layoutViolations.length
                + gated.report.componentPromotions.length;
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

      // Extract manifesto blocks
      let match;
      while ((match = MANIFESTO_REGEX.exec(textContent)) !== null) {
        const blockKey = `manifesto-${message.id}-${match.index}`;
        if (!processedStrategyBlocksSet.has(blockKey)) {
          processedStrategyBlocksSet.add(blockKey);
          try {
            const parsed = JSON.parse(match[1]);
            if (parsed.title && parsed.problemStatement && parsed.targetUser && Array.isArray(parsed.jtbd) && parsed.solution) {
              useStrategyStore.getState().setManifestoData(parsed);
            }
          } catch (e) {
            console.warn("[Strategy] Failed to parse manifesto JSON:", e);
          }
        }
      }
      MANIFESTO_REGEX.lastIndex = 0;

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
    });
  }, [messages]);

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
  }, [messages, status, currentOptionBlocks.length, strategyPhase, pendingApprovalPage]);

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

      // Build context (same as manifesto/flow phases)
      const storeState = useStrategyStore.getState();
      const parts: string[] = [];
      if (storeState.manifestoData) {
        parts.push(`## Current Overview\n\n${JSON.stringify(storeState.manifestoData, null, 2)}`);
      }
      if (storeState.flowData) {
        parts.push(`## Current Flow Architecture\n\n${JSON.stringify(storeState.flowData, null, 2)}`);
      }
      const vfsContext = parts.join("\n\n");

      sendMessage(
        { text },
        { body: { vfsContext, modelId: selectedModel, strategyPhase } }
      );
    },
    [isLoading, sendMessage, selectedModel, strategyPhase]
  );

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

    // Hero phase: transition to manifesto before sending
    let effectivePhase = strategyPhase;
    if (strategyPhase === "hero") {
      useStrategyStore.getState().setUserPrompt(messageText);
      useStrategyStore.getState().setPhase("manifesto");
      effectivePhase = "manifesto";
      onHeroSubmit?.();
    }

    // Build context based on strategy phase
    let vfsContext: string | Record<string, string> = "";

    if (effectivePhase === "manifesto" || effectivePhase === "flow") {
      // In strategy phases, send manifesto/flow data as context instead of VFS
      const storeState = useStrategyStore.getState();
      const parts: string[] = [];
      if (storeState.manifestoData) {
        parts.push(`## Current Overview\n\n${JSON.stringify(storeState.manifestoData, null, 2)}`);
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
          ? `## Product Overview\n\nTitle: ${storeState.manifestoData.title}\nProblem: ${storeState.manifestoData.problemStatement}\nTarget User: ${storeState.manifestoData.targetUser}\nWhat ${storeState.manifestoData.targetUser} Need To Get Done:\n${storeState.manifestoData.jtbd.map((j, i) => `${i + 1}. ${j}`).join("\n")}\nSolution: ${storeState.manifestoData.solution}`
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

    // Send user's clean message for display
    // Pass context via request-level body option (hidden from UI, sent to API)
    await sendMessage(
      messagePayload as { text: string; files?: FileUIPart[] },
      { body: { vfsContext, modelId: selectedModel, strategyPhase: effectivePhase, currentPageId: buildingPageId, currentPageName: buildingPageName } }
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
              </>
            ) : strategyPhase === "manifesto" ? (
              <>
                <p>I&apos;m analyzing your problem...</p>
                <p className="mt-2 text-sm text-neutral-400">
                  I&apos;ll help you define a clear product overview.
                </p>
              </>
            ) : strategyPhase === "flow" ? (
              <>
                <p>Let&apos;s design the architecture...</p>
                <p className="mt-2 text-sm text-neutral-400">
                  I&apos;ll map out the pages and flows for your app.
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

        {/* Strategy phase approve buttons */}
        {strategyPhase === "manifesto" && manifestoData && !isLoading && (
          <div className="flex justify-center pt-2">
            <button
              onClick={() => {
                onPhaseAction?.("approve-manifesto");
                // Send follow-up message to trigger flow generation
                const storeState = useStrategyStore.getState();
                const context = `## Approved Overview\n\n${JSON.stringify(storeState.manifestoData, null, 2)}`;
                sendMessage(
                  { text: "The overview is approved. Now design the app architecture as a logical flow of pages, actions, and decisions." },
                  { body: { vfsContext: context, modelId: selectedModel, strategyPhase: "flow" } }
                );
              }}
              className="inline-flex items-center gap-2 px-4 py-2 bg-neutral-900 text-white text-sm font-medium rounded-lg hover:bg-neutral-800 transition-colors shadow-sm"
            >
              Approve Overview & Design Architecture
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {strategyPhase === "flow" && flowData && !isLoading && (
          <div className="flex justify-center pt-2">
            <button
              onClick={() => {
                onPhaseAction?.("approve-flow");
                // Send follow-up message to trigger building the FIRST page only
                const storeState = useStrategyStore.getState();
                const pageNodes = storeState.flowData?.nodes.filter((n) => n.type === "page") || [];
                const firstPage = pageNodes[0];
                if (!firstPage) return;

                const pageList = pageNodes.map((n) => `- ${n.label} (${n.id}): ${n.description || "No description"}`).join("\n");
                storeState.setBuildingPage(firstPage.id);
                useStreamingStore.getState().startStreaming(firstPage.id);

                sendMessage(
                  { text: `The architecture is approved. Here are all the pages to build:\n${pageList}\n\nStart by building the first page: "${firstPage.label}" (/).` },
                  { body: { vfsContext: "", modelId: selectedModel, strategyPhase: "building", currentPageId: firstPage.id, currentPageName: firstPage.label } }
                );
              }}
              className="inline-flex items-center gap-2 px-4 py-2 bg-neutral-900 text-white text-sm font-medium rounded-lg hover:bg-neutral-800 transition-colors shadow-sm"
            >
              Approve Architecture & Start Building
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Page approval button during building phase */}
        {strategyPhase === "building" && pendingApprovalPage && !isLoading && (() => {
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
                      if (Array.isArray(flow.pages) && !flow.pages.some((p: any) => p.id === nextPage!.id)) {
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
                : strategyPhase === "manifesto"
                ? "Refine the vision..."
                : strategyPhase === "flow"
                ? "Adjust the architecture..."
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

// Component to render message content with code block highlighting
// Hides strategy JSON blocks (options, manifesto, flow) — those are rendered as UI elements
function MessageContent({ content }: { content: string }) {
  if (!content) return null;

  // Simple rendering - split by code blocks
  const parts = content.split(/(```[\s\S]*?```)/g);

  return (
    <div className="space-y-2">
      {parts.map((part, index) => {
        if (part.startsWith("```")) {
          const firstLine = part.split("\n")[0];

          // Hide strategy JSON blocks, page-built markers, and file code blocks entirely
          if (
            firstLine.includes('type="options"') ||
            firstLine.includes('type="manifesto"') ||
            firstLine.includes('type="flow"') ||
            firstLine.includes('type="page-built"') ||
            firstLine.includes('file="')
          ) {
            return null;
          }

          // Non-file code blocks (e.g., plain code snippets) still shown
          return (
            <div key={index} className="mt-2">
              <pre className="bg-neutral-800 text-neutral-100 p-2 rounded text-xs overflow-x-auto">
                <code>
                  {part
                    .replace(/```\w*\s*\n?/, "")
                    .replace(/```$/, "")
                    .trim()}
                </code>
              </pre>
            </div>
          );
        }

        // Regular text
        return part.trim() ? (
          <p key={index} className="whitespace-pre-wrap">
            {part}
          </p>
        ) : null;
      })}
    </div>
  );
}

// Detect if the content contains an open (still-streaming) options/strategy block
function hasStreamingStrategyBlock(text: string): boolean {
  // Check for an open strategy block that hasn't closed yet
  return /```json\s+type="(?:options|manifesto|flow|page-built)"[\s\S]*$/.test(text) &&
    !/```json\s+type="(?:options|manifesto|flow|page-built)"[\s\S]*?```\s*$/.test(text);
}

// Streaming message content — hides code, shows preText + compact file indicators
function StreamingMessageContent({ content }: { content: string }) {
  const currentFile = useStreamingStore((s) => s.currentFile);
  const completedFilePaths = useStreamingStore((s) => s.completedFilePaths);
  const phase = useStrategyStore((s) => s.phase);

  const parsed = useMemo(() => parseStreamingContent(content), [content]);

  // Clean preText: strip strategy blocks
  const cleanPreText = useMemo(() => stripStrategyBlocks(parsed.preText), [parsed.preText]);

  const hasCode = parsed.currentFile !== null || parsed.completedBlocks.length > 0;

  // Detect if questions/strategy blocks are actively being generated
  const isStreamingQuestions = useMemo(() => hasStreamingStrategyBlock(content), [content]);

  // No text and no code yet → phase-aware typing indicator
  if (!cleanPreText && !hasCode && !isStreamingQuestions) {
    const phaseHint =
      phase === "hero" || phase === "manifesto" ? "Thinking about what to ask you..."
      : phase === "flow" ? "Designing architecture..."
      : phase === "building" ? "Writing code..."
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
      {cleanPreText && <p className="whitespace-pre-wrap">{cleanPreText}</p>}

      {/* Questions being generated indicator */}
      {isStreamingQuestions && (
        <div className="flex items-center gap-1.5 text-xs text-blue-600">
          <Loader2 className="w-3 h-3 animate-spin shrink-0" />
          <span className="font-medium">Generating questions...</span>
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

  const message =
    phase === "hero" || phase === "manifesto" ? "Analyzing your problem..."
    : phase === "flow" ? "Designing app architecture..."
    : phase === "building" ? "Preparing to build..."
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
