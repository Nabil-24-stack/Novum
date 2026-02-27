import { streamText } from "ai";
import { google } from "@ai-sdk/google";
import { anthropic } from "@ai-sdk/anthropic";
import { buildParallelPagePrompt } from "@/lib/ai/strategy-prompts";

type ModelId = "gemini-2.5-pro" | "gemini-3-pro-preview" | "claude-sonnet-4-5";

function getModel(modelId: ModelId) {
  switch (modelId) {
    case "gemini-2.5-pro":
      return google("gemini-2.5-pro");
    case "gemini-3-pro-preview":
      return google("gemini-3-pro-preview");
    case "claude-sonnet-4-5":
      return anthropic("claude-sonnet-4-5-20250929");
    default:
      return google("gemini-2.5-pro");
  }
}

export const maxDuration = 120;

// Design system rules (same as SYSTEM_PROMPT in /api/chat)
const DESIGN_SYSTEM_RULES = `
## STRICT EXPORT RULE (CRITICAL)

1. You must **NEVER** use \`export default\`. This causes crashes.
2. You must **ALWAYS** use Named Exports: \`export function ComponentName() { ... }\`
3. When importing, ALWAYS use named imports: \`import { ComponentName } from "./path";\`

## PRE-INSTALLED COMPONENT LIBRARY (USE THESE!)

| Component | Path | Exports |
|-----------|------|---------|
| Button | /components/ui/button.tsx | Button |
| Card | /components/ui/card.tsx | Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter |
| Badge | /components/ui/badge.tsx | Badge |
| Avatar | /components/ui/avatar.tsx | Avatar, AvatarImage, AvatarFallback |
| Switch | /components/ui/switch.tsx | Switch |
| Slider | /components/ui/slider.tsx | Slider |
| Input | /components/ui/input.tsx | Input |
| Label | /components/ui/label.tsx | Label |
| Select | /components/ui/select.tsx | Select, SelectOption |
| Separator | /components/ui/separator.tsx | Separator |
| Checkbox | /components/ui/checkbox.tsx | Checkbox |
| Tabs | /components/ui/tabs.tsx | Tabs, TabsList, TabsTrigger, TabsContent |
| Dialog | /components/ui/dialog.tsx | Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription |
| Accordion | /components/ui/accordion.tsx | Accordion, AccordionItem, AccordionTrigger, AccordionContent |
| Textarea | /components/ui/textarea.tsx | Textarea |
| Progress | /components/ui/progress.tsx | Progress |
| Alert | /components/ui/alert.tsx | Alert, AlertTitle, AlertDescription |
| Skeleton | /components/ui/skeleton.tsx | Skeleton |
| Radio Group | /components/ui/radio-group.tsx | RadioGroup, RadioGroupItem |
| Toggle | /components/ui/toggle.tsx | Toggle |
| Table | /components/ui/table.tsx | Table, TableHeader, TableBody, TableRow, TableHead, TableCell |
| Breadcrumb | /components/ui/breadcrumb.tsx | Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbSeparator, BreadcrumbPage |
| Tooltip | /components/ui/tooltip.tsx | Tooltip, TooltipProvider, TooltipTrigger, TooltipContent |
| Popover | /components/ui/popover.tsx | Popover, PopoverTrigger, PopoverContent |
| Toast | /components/ui/toast.tsx | ToastProvider, Toaster, useToast |
| Date Picker | /components/ui/date-picker.tsx | DatePicker |

**CRITICAL:** Do NOT recreate these components. Import from their paths. Use RELATIVE paths (not @/ aliases).
- From /pages/*.tsx: \`import { Button } from "../components/ui/button";\`
- From /pages/*.tsx: \`import { cn } from "../lib/utils";\`
- From /pages/*.tsx: \`import { useRouter } from "../lib/router";\`

## Rules

1. **EVERY .tsx file MUST start with \`import * as React from "react";\`** — this is required for JSX compilation. Never skip this import.
2. Wrap code in a markdown code block with a \`file\` attribute: \`\`\`tsx file="/pages/PageName.tsx"\`\`\`
3. Write the FULL file content — never partial snippets.
4. Use semantic token classes (bg-primary, text-foreground, etc.) — NEVER hardcoded Tailwind colors.
5. Use semantic typography classes: text-h1, text-h2, text-h3, text-h4, text-body, text-body-sm, text-caption.
6. NEVER use text-xs, text-sm, text-base, text-lg, text-xl, etc.
7. Use generous padding (p-6, p-8) and gaps (gap-6, gap-8).
8. Every container element MUST have explicit layout (flex or grid).

## DESIGN PHILOSOPHY

1. **Visual Hierarchy:** Use font weights and text colors to guide the eye.
2. **Whitespace is Luxury:** Generous padding and gaps.
3. **Container Strategy:** Group related info in Card > CardHeader > CardContent.
4. **Interactive Polish:** Use hover:bg-accent/50 on interactive elements.`;

export async function POST(req: Request) {
  const {
    pageId,
    pageName,
    componentName,
    pageRoute,
    manifestoContext,
    personaContext,
    flowContext,
    userFlowContext,
    modelId,
  } = await req.json();

  const systemPrompt =
    buildParallelPagePrompt(
      manifestoContext || "",
      flowContext || "",
      personaContext || "",
      pageId,
      pageName,
      componentName || pageName,
      userFlowContext || undefined,
    ) +
    "\n\n" +
    DESIGN_SYSTEM_RULES;

  const result = streamText({
    model: getModel(modelId || "gemini-2.5-pro"),
    system: systemPrompt,
    messages: [
      {
        role: "user",
        content: `Build the "${pageName}" page (route: ${pageRoute}). Write it to \`/pages/${componentName || pageName}.tsx\` with \`export function ${componentName || pageName}()\`. Make it polished and production-ready using the component library.`,
      },
    ],
  });

  return result.toTextStreamResponse();
}
