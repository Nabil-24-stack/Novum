"use client";

import { useChat } from "@ai-sdk/react";
import { useEffect, useRef, useState, useCallback, DragEvent, ClipboardEvent, FormEvent } from "react";
import { Send, Loader2, X, ImagePlus, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { useChatContextStore } from "@/hooks/useChatContextStore";
import { runGatekeeper } from "@/lib/ai/gatekeeper";
import type { FileUIPart } from "ai";

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
}

// Regex to match code blocks with file attribute
// Matches: ```lang file="path" or ```lang file="/path"
const CODE_BLOCK_REGEX = /```(\w+)?\s+file="([^"]+)"\n([\s\S]*?)```/g;

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

export function ChatTab({ writeFile, files }: ChatTabProps) {
  const [input, setInput] = useState("");
  const [selectedModel, setSelectedModel] = useState<ModelId>("gemini-2.5-pro");
  const [stagedImages, setStagedImages] = useState<FileUIPart[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const processedBlocksRef = useRef<Set<string>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { pinnedElements, unpinElement, clearPinnedElements } = useChatContextStore();

  const { messages, sendMessage, status, error } = useChat({
    onError: (err) => {
      console.error("Chat error:", err);
    },
  });

  const isLoading = status === "submitted" || status === "streaming";

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
          if (!processedBlocksRef.current.has(blockKey)) {
            processedBlocksRef.current.add(blockKey);
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
  }, [messages, writeFile]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

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

  // --- Submit ---

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    const hasText = input.trim().length > 0;
    const hasImages = stagedImages.length > 0;

    if ((!hasText && !hasImages) || isLoading) return;

    const messageText = input.trim();
    const imagesToSend = [...stagedImages];

    // Clear input state immediately
    setInput("");
    setStagedImages([]);

    // Build context from current VFS files so AI knows what exists
    // Note: We don't send tokens.json directly - the system prompt explains semantic tokens
    const contextFiles = ["/design-system.tsx", "/App.tsx", "/components/ui/index.ts"];
    const fileContextParts = contextFiles
      .filter((path) => files[path])
      .map((path) => `Current ${path}:\n\`\`\`tsx\n${files[path]}\n\`\`\``);

    // Add a reminder about semantic tokens
    const tokenReminder = `## IMPORTANT: Color Usage Reminder
Use ONLY semantic token classes (bg-primary, bg-card, text-foreground, text-muted-foreground, border-border, etc.).
NEVER use hardcoded colors (bg-blue-500, bg-gray-100, text-gray-600, etc.) as they break the user's theme customization.`;

    let vfsContext =
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

    // Build the message payload
    const messagePayload: { text?: string; files?: FileUIPart[] } = {};
    if (hasText) messagePayload.text = messageText;
    if (hasImages) messagePayload.files = imagesToSend;

    // Send user's clean message for display
    // Pass context via request-level body option (hidden from UI, sent to API)
    await sendMessage(
      messagePayload as { text: string; files?: FileUIPart[] },
      { body: { vfsContext, modelId: selectedModel } }
    );

    // Clear pinned elements after sending
    clearPinnedElements();
  };

  // Helper to get message text content
  const getMessageText = (message: typeof messages[0]): string => {
    // Try parts first (AI SDK v6 format)
    if (message.parts && Array.isArray(message.parts)) {
      const text = message.parts
        .filter((part): part is { type: "text"; text: string } => part.type === "text")
        .map((part) => part.text)
        .join("");
      if (text) return text;
    }
    // Fallback to content property (older format)
    if ("content" in message && typeof message.content === "string") {
      return message.content;
    }
    return "";
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
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="text-center text-neutral-500 text-base py-8">
            <p>Ask me to modify your UI!</p>
            <p className="mt-2 text-sm text-neutral-400">
              Try: &quot;Change the button to red&quot;
            </p>
          </div>
        )}

        {messages.map((message) => (
          <div
            key={message.id}
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
              <MessageContent content={getMessageText(message)} />
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-neutral-100 rounded-lg px-3 py-2">
              <Loader2 className="w-4 h-4 animate-spin text-neutral-500" />
            </div>
          </div>
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
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onPaste={handlePaste}
            placeholder={hasImages ? "Add a message or send images..." : "Ask me to modify your UI..."}
            className="flex-1 px-3 py-2 text-base border border-neutral-200 rounded-md focus:outline-none focus:ring-2 focus:ring-neutral-900 focus:border-transparent"
            disabled={isLoading}
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

// Component to render inline image thumbnails from message parts
function MessageImages({ parts, isUser }: { parts: Array<{ type: string; [key: string]: unknown }>; isUser: boolean }) {
  const fileParts = parts.filter(
    (part): part is FileUIPart => part.type === "file" && typeof (part as FileUIPart).url === "string"
  );

  if (fileParts.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2 mb-2">
      {fileParts.map((file, index) => (
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
function MessageContent({ content }: { content: string }) {
  if (!content) return null;

  // Simple rendering - split by code blocks
  const parts = content.split(/(```[\s\S]*?```)/g);

  return (
    <div className="space-y-2">
      {parts.map((part, index) => {
        if (part.startsWith("```")) {
          // Extract language and file info
          const firstLine = part.split("\n")[0];
          const fileMatch = firstLine.match(/file="([^"]+)"/);
          const fileName = fileMatch ? fileMatch[1] : null;

          return (
            <div key={index} className="mt-2">
              {fileName && (
                <div className="text-sm text-neutral-500 mb-1 font-mono">
                  {fileName}
                </div>
              )}
              <pre className="bg-neutral-800 text-neutral-100 p-2 rounded text-xs overflow-x-auto">
                <code>
                  {part
                    .replace(/```\w*\s*(file="[^"]+")?\n?/, "")
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
