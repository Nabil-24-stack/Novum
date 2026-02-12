/**
 * Parses streaming AI response text to extract partial/complete code blocks
 * and the pre-code description text.
 */

interface ParsedBlock {
  path: string;
  content: string;
}

interface ParseResult {
  /** Text before the first code block (status description) */
  preText: string;
  /** Fully closed code blocks with file="..." attribute */
  completedBlocks: ParsedBlock[];
  /** The currently open (still streaming) code block, if any */
  currentFile: ParsedBlock | null;
}

const OPENING_FENCE_RE = /^```(\w+)?\s+file="([^"]+)"\s*$/;
const CLOSING_FENCE_RE = /^```\s*$/;

export function parseStreamingContent(text: string): ParseResult {
  const lines = text.split("\n");

  let preText = "";
  let foundFirstBlock = false;
  let insideBlock = false;
  let currentPath = "";
  let currentContent: string[] = [];

  const completedBlocks: ParsedBlock[] = [];
  let currentFile: ParsedBlock | null = null;

  for (const line of lines) {
    if (!insideBlock) {
      const openMatch = line.match(OPENING_FENCE_RE);
      if (openMatch) {
        foundFirstBlock = true;
        insideBlock = true;
        currentPath = openMatch[2].startsWith("/") ? openMatch[2] : `/${openMatch[2]}`;
        currentContent = [];
      } else if (!foundFirstBlock) {
        // Accumulate pre-text (before any code block)
        preText += (preText ? "\n" : "") + line;
      }
      // Lines between completed blocks and next opening are ignored for preText
    } else {
      // Inside a block
      if (CLOSING_FENCE_RE.test(line)) {
        // Block is complete
        completedBlocks.push({
          path: currentPath,
          content: currentContent.join("\n"),
        });
        insideBlock = false;
        currentPath = "";
        currentContent = [];
      } else {
        currentContent.push(line);
      }
    }
  }

  // If we're still inside an open block at end of text, it's the current streaming file
  if (insideBlock) {
    currentFile = {
      path: currentPath,
      content: currentContent.join("\n"),
    };
  }

  return { preText: preText.trim(), completedBlocks, currentFile };
}
