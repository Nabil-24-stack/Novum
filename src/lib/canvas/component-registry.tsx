"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Toggle } from "@/components/ui/toggle";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbSeparator, BreadcrumbPage } from "@/components/ui/breadcrumb";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip";
import { ToastComponent, ToastTitle, ToastDescription } from "@/components/ui/toast";
import { DatePicker } from "@/components/ui/date-picker";
import { Component } from "lucide-react";

/**
 * Component definitions for the Component Tool picker.
 */
export interface ComponentDefinition {
  name: string;
  defaultWidth: number;
  defaultHeight: number;
  preview: React.ReactNode;
  // Code generation metadata
  importPath: string;      // e.g., "./components/ui/button"
  componentName: string;   // e.g., "Button"
  defaultCode: string;     // e.g., "<Button>Click me</Button>"
  namedExport?: boolean;   // true for { Button }, false for default export
}

/**
 * Interactive Slider preview with internal state
 */
function SliderPreview() {
  const [value, setValue] = React.useState(50);
  return <Slider value={value} onValueChange={setValue} className="w-full" />;
}

/**
 * Interactive Switch preview with internal state
 */
function SwitchPreview() {
  const [checked, setChecked] = React.useState(true);
  return <Switch checked={checked} onCheckedChange={setChecked} className="shrink-0" />;
}

/**
 * Interactive Checkbox preview with internal state
 */
function CheckboxPreview() {
  const [checked, setChecked] = React.useState(false);
  return (
    <div className="flex items-center space-x-2">
      <Checkbox
        id="preview-checkbox"
        checked={checked}
        onCheckedChange={(value) => setChecked(value === true)}
      />
      <Label htmlFor="preview-checkbox" className="text-sm">Check me</Label>
    </div>
  );
}

/**
 * Static registry of known components with their preview configurations.
 * These have hand-crafted previews that look good in the picker.
 * Exported for use in GhostComponent to render actual previews on canvas.
 */
export const KNOWN_COMPONENTS: Record<string, Omit<ComponentDefinition, "name">> = {
  "button": {
    defaultWidth: 100,
    defaultHeight: 40,
    preview: <Button size="sm">Button</Button>,
    importPath: "./components/ui/button",
    componentName: "Button",
    defaultCode: "<Button>Click me</Button>",
    namedExport: true,
  },
  "input": {
    defaultWidth: 200,
    defaultHeight: 40,
    preview: <Input placeholder="Enter text..." className="h-9" />,
    importPath: "./components/ui/input",
    componentName: "Input",
    defaultCode: '<Input placeholder="Enter text..." />',
    namedExport: true,
  },
  "card": {
    defaultWidth: 300,
    defaultHeight: 180,
    preview: (
      <Card className="w-full">
        <CardHeader className="p-3">
          <CardTitle className="text-base">Card Title</CardTitle>
          <CardDescription className="text-xs">Card description</CardDescription>
        </CardHeader>
        <CardContent className="p-3 pt-0">
          <p className="text-xs text-muted-foreground">Content goes here.</p>
        </CardContent>
      </Card>
    ),
    importPath: "./components/ui/card",
    componentName: "Card",
    defaultCode: `<Card>
  <CardHeader>
    <CardTitle>Card Title</CardTitle>
    <CardDescription>Card description</CardDescription>
  </CardHeader>
  <CardContent>
    <p>Content goes here.</p>
  </CardContent>
</Card>`,
    namedExport: true,
  },
  "badge": {
    defaultWidth: 80,
    defaultHeight: 24,
    preview: (
      <div className="flex items-center justify-center w-full h-full">
        <Badge>Badge</Badge>
      </div>
    ),
    importPath: "./components/ui/badge",
    componentName: "Badge",
    defaultCode: "<Badge>Badge</Badge>",
    namedExport: true,
  },
  "checkbox": {
    defaultWidth: 120,
    defaultHeight: 24,
    preview: <CheckboxPreview />,
    importPath: "./components/ui/checkbox",
    componentName: "Checkbox",
    defaultCode: '<div className="flex items-center space-x-2">\n  <Checkbox id="checkbox" />\n  <Label htmlFor="checkbox">Accept terms</Label>\n</div>',
    namedExport: true,
  },
  "switch": {
    defaultWidth: 44,
    defaultHeight: 24,
    preview: (
      <div className="flex items-center justify-center w-full h-full">
        <SwitchPreview />
      </div>
    ),
    importPath: "./components/ui/switch",
    componentName: "Switch",
    defaultCode: "<Switch />",
    namedExport: true,
  },
  "tabs": {
    defaultWidth: 200,
    defaultHeight: 40,
    preview: (
      <Tabs defaultValue="tab1">
        <TabsList className="h-8">
          <TabsTrigger value="tab1" className="text-xs h-6">Tab 1</TabsTrigger>
          <TabsTrigger value="tab2" className="text-xs h-6">Tab 2</TabsTrigger>
        </TabsList>
      </Tabs>
    ),
    importPath: "./components/ui/tabs",
    componentName: "Tabs",
    defaultCode: `<Tabs defaultValue="tab1">
  <TabsList>
    <TabsTrigger value="tab1">Tab 1</TabsTrigger>
    <TabsTrigger value="tab2">Tab 2</TabsTrigger>
  </TabsList>
  <TabsContent value="tab1">Content for tab 1</TabsContent>
  <TabsContent value="tab2">Content for tab 2</TabsContent>
</Tabs>`,
    namedExport: true,
  },
  "avatar": {
    defaultWidth: 40,
    defaultHeight: 40,
    preview: (
      <Avatar className="h-8 w-8">
        <AvatarFallback className="text-xs">JD</AvatarFallback>
      </Avatar>
    ),
    importPath: "./components/ui/avatar",
    componentName: "Avatar",
    defaultCode: '<Avatar>\n  <AvatarFallback>JD</AvatarFallback>\n</Avatar>',
    namedExport: true,
  },
  "slider": {
    defaultWidth: 200,
    defaultHeight: 40,
    preview: <SliderPreview />,
    importPath: "./components/ui/slider",
    componentName: "Slider",
    defaultCode: "<Slider value={50} max={100} step={1} />",
    namedExport: true,
  },
  "separator": {
    defaultWidth: 200,
    defaultHeight: 20,
    preview: <Separator />,
    importPath: "./components/ui/separator",
    componentName: "Separator",
    defaultCode: "<Separator />",
    namedExport: true,
  },
  "label": {
    defaultWidth: 80,
    defaultHeight: 20,
    preview: <Label>Label</Label>,
    importPath: "./components/ui/label",
    componentName: "Label",
    defaultCode: "<Label>Label text</Label>",
    namedExport: true,
  },
  "select": {
    defaultWidth: 180,
    defaultHeight: 40,
    preview: (
      <select className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm">
        <option value="">Select...</option>
        <option value="option1">Option 1</option>
        <option value="option2">Option 2</option>
      </select>
    ),
    importPath: "./components/ui/select",
    componentName: "Select",
    defaultCode: `<Select defaultValue="">
  <SelectOption value="">Select...</SelectOption>
  <SelectOption value="option1">Option 1</SelectOption>
  <SelectOption value="option2">Option 2</SelectOption>
</Select>`,
    namedExport: true,
  },
  "dialog": {
    defaultWidth: 300,
    defaultHeight: 120,
    preview: (
      <div className="rounded-lg border bg-card p-4 shadow-sm w-full">
        <h3 className="text-sm font-semibold">Dialog Title</h3>
        <p className="text-xs text-muted-foreground mt-1">Dialog content preview</p>
        <div className="flex justify-end gap-2 mt-3">
          <Button variant="outline" size="sm" className="h-7 text-xs">Cancel</Button>
          <Button size="sm" className="h-7 text-xs">Confirm</Button>
        </div>
      </div>
    ),
    importPath: "./components/ui/dialog",
    componentName: "Dialog",
    defaultCode: `<Dialog>
  <DialogTrigger asChild>
    <Button>Open Dialog</Button>
  </DialogTrigger>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Dialog Title</DialogTitle>
      <DialogDescription>Dialog description text.</DialogDescription>
    </DialogHeader>
  </DialogContent>
</Dialog>`,
    namedExport: true,
  },
  "accordion": {
    defaultWidth: 250,
    defaultHeight: 100,
    preview: (
      <Accordion type="single" collapsible className="w-full">
        <AccordionItem value="item-1" className="border-b">
          <AccordionTrigger className="text-sm py-2">Section 1</AccordionTrigger>
          <AccordionContent className="text-xs">
            Content for section 1
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    ),
    importPath: "./components/ui/accordion",
    componentName: "Accordion",
    defaultCode: `<Accordion type="single" collapsible>
  <AccordionItem value="item-1">
    <AccordionTrigger>Section 1</AccordionTrigger>
    <AccordionContent>Content for section 1</AccordionContent>
  </AccordionItem>
</Accordion>`,
    namedExport: true,
  },
  "textarea": {
    defaultWidth: 200,
    defaultHeight: 80,
    preview: <Textarea placeholder="Enter your message..." className="h-16" />,
    importPath: "./components/ui/textarea",
    componentName: "Textarea",
    defaultCode: '<Textarea placeholder="Enter your message..." />',
    namedExport: true,
  },
  "progress": {
    defaultWidth: 200,
    defaultHeight: 16,
    preview: <Progress value={60} className="w-full" />,
    importPath: "./components/ui/progress",
    componentName: "Progress",
    defaultCode: "<Progress value={60} />",
    namedExport: true,
  },
  "alert": {
    defaultWidth: 300,
    defaultHeight: 80,
    preview: (
      <Alert className="w-full">
        <AlertTitle className="text-sm">Alert Title</AlertTitle>
        <AlertDescription className="text-xs">Alert description message.</AlertDescription>
      </Alert>
    ),
    importPath: "./components/ui/alert",
    componentName: "Alert",
    defaultCode: `<Alert>
  <AlertTitle>Heads up!</AlertTitle>
  <AlertDescription>You can add components to your app using the CLI.</AlertDescription>
</Alert>`,
    namedExport: true,
  },
  "skeleton": {
    defaultWidth: 200,
    defaultHeight: 20,
    preview: (
      <div className="flex items-center space-x-4 w-full">
        <Skeleton className="h-10 w-10 rounded-full" />
        <div className="space-y-2 flex-1">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </div>
      </div>
    ),
    importPath: "./components/ui/skeleton",
    componentName: "Skeleton",
    defaultCode: '<Skeleton className="h-4 w-[200px]" />',
    namedExport: true,
  },
  "radio-group": {
    defaultWidth: 150,
    defaultHeight: 80,
    preview: (
      <RadioGroup defaultValue="option-1" className="flex flex-col gap-2">
        <div className="flex items-center space-x-2">
          <RadioGroupItem value="option-1" id="r1" />
          <Label htmlFor="r1" className="text-sm">Option 1</Label>
        </div>
        <div className="flex items-center space-x-2">
          <RadioGroupItem value="option-2" id="r2" />
          <Label htmlFor="r2" className="text-sm">Option 2</Label>
        </div>
      </RadioGroup>
    ),
    importPath: "./components/ui/radio-group",
    componentName: "RadioGroup",
    defaultCode: `<RadioGroup defaultValue="option-1">
  <div className="flex items-center space-x-2">
    <RadioGroupItem value="option-1" id="r1" />
    <Label htmlFor="r1">Option 1</Label>
  </div>
  <div className="flex items-center space-x-2">
    <RadioGroupItem value="option-2" id="r2" />
    <Label htmlFor="r2">Option 2</Label>
  </div>
</RadioGroup>`,
    namedExport: true,
  },
  "toggle": {
    defaultWidth: 80,
    defaultHeight: 40,
    preview: (
      <div className="flex gap-2">
        <Toggle aria-label="Toggle bold" size="sm">B</Toggle>
        <Toggle aria-label="Toggle italic" size="sm" variant="outline">I</Toggle>
      </div>
    ),
    importPath: "./components/ui/toggle",
    componentName: "Toggle",
    defaultCode: '<Toggle aria-label="Toggle">Toggle</Toggle>',
    namedExport: true,
  },
  "table": {
    defaultWidth: 350,
    defaultHeight: 150,
    preview: (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="text-xs">Name</TableHead>
            <TableHead className="text-xs">Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell className="text-xs py-2">Item 1</TableCell>
            <TableCell className="text-xs py-2">Active</TableCell>
          </TableRow>
          <TableRow>
            <TableCell className="text-xs py-2">Item 2</TableCell>
            <TableCell className="text-xs py-2">Pending</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    ),
    importPath: "./components/ui/table",
    componentName: "Table",
    defaultCode: `<Table>
  <TableHeader>
    <TableRow>
      <TableHead>Name</TableHead>
      <TableHead>Status</TableHead>
    </TableRow>
  </TableHeader>
  <TableBody>
    <TableRow>
      <TableCell>Item 1</TableCell>
      <TableCell>Active</TableCell>
    </TableRow>
  </TableBody>
</Table>`,
    namedExport: true,
  },
  "breadcrumb": {
    defaultWidth: 250,
    defaultHeight: 24,
    preview: (
      <Breadcrumb>
        <BreadcrumbItem>
          <BreadcrumbLink href="#">Home</BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbSeparator />
        <BreadcrumbItem>
          <BreadcrumbLink href="#">Products</BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbSeparator />
        <BreadcrumbItem>
          <BreadcrumbPage>Current</BreadcrumbPage>
        </BreadcrumbItem>
      </Breadcrumb>
    ),
    importPath: "./components/ui/breadcrumb",
    componentName: "Breadcrumb",
    defaultCode: `<Breadcrumb>
  <BreadcrumbItem>
    <BreadcrumbLink href="#">Home</BreadcrumbLink>
  </BreadcrumbItem>
  <BreadcrumbSeparator />
  <BreadcrumbItem>
    <BreadcrumbPage>Current Page</BreadcrumbPage>
  </BreadcrumbItem>
</Breadcrumb>`,
    namedExport: true,
  },
  "aspect-ratio": {
    defaultWidth: 200,
    defaultHeight: 150,
    preview: (
      <AspectRatio ratio={16 / 9} className="bg-muted rounded-md flex items-center justify-center">
        <span className="text-xs text-muted-foreground">16:9</span>
      </AspectRatio>
    ),
    importPath: "./components/ui/aspect-ratio",
    componentName: "AspectRatio",
    defaultCode: `<AspectRatio ratio={16 / 9} className="bg-muted">
  <img src="https://images.unsplash.com/photo-1535025183041-0991a977e25b?w=300" alt="Image" className="rounded-md object-cover w-full h-full" />
</AspectRatio>`,
    namedExport: true,
  },
  "tooltip": {
    defaultWidth: 100,
    defaultHeight: 40,
    preview: (
      <TooltipProvider>
        <Tooltip defaultOpen>
          <TooltipTrigger className="px-3 py-1 border rounded-md text-sm">Hover me</TooltipTrigger>
          <TooltipContent>
            <p>Tooltip content</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    ),
    importPath: "./components/ui/tooltip",
    componentName: "Tooltip",
    defaultCode: `<TooltipProvider>
  <Tooltip>
    <TooltipTrigger>Hover me</TooltipTrigger>
    <TooltipContent>
      <p>Add to library</p>
    </TooltipContent>
  </Tooltip>
</TooltipProvider>`,
    namedExport: true,
  },
  "popover": {
    defaultWidth: 100,
    defaultHeight: 40,
    preview: (
      <Button variant="outline" size="sm">Open popover</Button>
    ),
    importPath: "./components/ui/popover",
    componentName: "Popover",
    defaultCode: `<Popover>
  <PopoverTrigger asChild>
    <Button variant="outline">Open popover</Button>
  </PopoverTrigger>
  <PopoverContent>
    <div className="grid gap-4">
      <div className="space-y-2">
        <h4 className="font-medium leading-none">Dimensions</h4>
        <p className="text-sm text-muted-foreground">Set the dimensions for the layer.</p>
      </div>
    </div>
  </PopoverContent>
</Popover>`,
    namedExport: true,
  },
  "toast": {
    defaultWidth: 300,
    defaultHeight: 80,
    preview: (
      <ToastComponent variant="default" className="w-full">
        <div className="grid gap-1">
          <ToastTitle>Notification</ToastTitle>
          <ToastDescription>Your message has been sent.</ToastDescription>
        </div>
      </ToastComponent>
    ),
    importPath: "./components/ui/toast",
    componentName: "ToastProvider",
    defaultCode: `{/* Add ToastProvider to your app root, then use useToast hook */}
<ToastProvider>
  {/* Your app content */}
  <Toaster />
</ToastProvider>

{/* In a component: */}
const { toast } = useToast();
toast({ title: "Success", description: "Your message has been sent." });`,
    namedExport: true,
  },
  "date-picker": {
    defaultWidth: 200,
    defaultHeight: 40,
    preview: (
      <DatePicker placeholder="Pick a date" />
    ),
    importPath: "./components/ui/date-picker",
    componentName: "DatePicker",
    defaultCode: `<DatePicker
  value={date}
  onChange={setDate}
  placeholder="Select a date"
/>`,
    namedExport: true,
  },
};

/**
 * Generic placeholder preview for components without a known preview.
 */
function GenericComponentPreview({ name }: { name: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 p-4 rounded-lg border border-dashed border-border bg-muted/30 w-full h-full min-h-[60px]">
      <Component className="w-5 h-5 text-muted-foreground" />
      <span className="text-xs text-muted-foreground">{name}</span>
    </div>
  );
}

/**
 * Scan VFS files to discover all components in /components/ui/
 * Returns component names (e.g., "button", "input", "custom-widget")
 */
function discoverVfsComponents(files: Record<string, string>): string[] {
  const componentNames: string[] = [];
  const uiComponentPattern = /^\/components\/ui\/([^/]+)\.tsx$/;

  for (const filePath of Object.keys(files)) {
    const match = filePath.match(uiComponentPattern);
    if (match) {
      componentNames.push(match[1]); // e.g., "button", "input"
    }
  }

  return componentNames;
}

/**
 * Format component name for display (e.g., "button" -> "Button", "date-picker" -> "Date Picker")
 */
function formatComponentName(name: string): string {
  return name
    .split("-")
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/**
 * Build component registry dynamically from VFS files.
 * Known components get hand-crafted previews, unknown ones get generic placeholders.
 */
export function buildComponentRegistry(files: Record<string, string>): ComponentDefinition[] {
  const vfsComponents = discoverVfsComponents(files);
  const registry: ComponentDefinition[] = [];

  for (const componentName of vfsComponents) {
    const knownConfig = KNOWN_COMPONENTS[componentName];
    const displayName = formatComponentName(componentName);
    // Convert to PascalCase for component name (e.g., "date-picker" -> "DatePicker")
    const pascalName = componentName
      .split("-")
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join("");

    if (knownConfig) {
      // Known component with hand-crafted preview
      registry.push({
        name: displayName,
        ...knownConfig,
      });
    } else {
      // Unknown component (AI-added) with generic placeholder
      registry.push({
        name: displayName,
        defaultWidth: 150,
        defaultHeight: 60,
        preview: <GenericComponentPreview name={displayName} />,
        importPath: `./components/ui/${componentName}`,
        componentName: pascalName,
        defaultCode: `<${pascalName} />`,
        namedExport: true,
      });
    }
  }

  // Sort alphabetically
  registry.sort((a, b) => a.name.localeCompare(b.name));

  return registry;
}

/**
 * Filter components by search query (matches name).
 */
export function filterComponents(components: ComponentDefinition[], query: string): ComponentDefinition[] {
  if (!query.trim()) return components;

  const lowerQuery = query.toLowerCase();
  return components.filter(
    c => c.name.toLowerCase().includes(lowerQuery)
  );
}
