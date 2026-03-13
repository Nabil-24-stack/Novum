import { anthropic } from "@ai-sdk/anthropic";

export function getModel() {
  return anthropic("claude-sonnet-4-6");
}
