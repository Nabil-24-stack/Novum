export const designSystemRichTemplate = `import * as React from "react";
import { Button } from "./components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "./components/ui/card";
import { Badge } from "./components/ui/badge";
import { Avatar, AvatarImage, AvatarFallback } from "./components/ui/avatar";
import { Switch } from "./components/ui/switch";
import { Slider } from "./components/ui/slider";
import { Input } from "./components/ui/input";
import { Label } from "./components/ui/label";
import { Select, SelectOption } from "./components/ui/select";
import { Separator } from "./components/ui/separator";
import { Checkbox } from "./components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "./components/ui/tabs";
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "./components/ui/dialog";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "./components/ui/accordion";
import { Textarea } from "./components/ui/textarea";
import { Progress } from "./components/ui/progress";
import { Alert, AlertTitle, AlertDescription } from "./components/ui/alert";
import { Skeleton } from "./components/ui/skeleton";
import { RadioGroup, RadioGroupItem } from "./components/ui/radio-group";
import { Toggle } from "./components/ui/toggle";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "./components/ui/table";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbSeparator, BreadcrumbPage } from "./components/ui/breadcrumb";
import { AspectRatio } from "./components/ui/aspect-ratio";
import { Tooltip, TooltipProvider, TooltipTrigger, TooltipContent } from "./components/ui/tooltip";
import { Popover, PopoverTrigger, PopoverContent } from "./components/ui/popover";
import { ToastComponent, ToastTitle, ToastDescription } from "./components/ui/toast";
import { DatePicker } from "./components/ui/date-picker";
import "./globals.css";

// Interactive wrappers for stateful components
function InteractiveSwitch({ defaultChecked = false }: { defaultChecked?: boolean }) {
  const [checked, setChecked] = React.useState(defaultChecked);
  return <Switch checked={checked} onCheckedChange={setChecked} />;
}

function InteractiveSlider({ defaultValue = 50 }: { defaultValue?: number }) {
  const [value, setValue] = React.useState(defaultValue);
  return <Slider value={value} onValueChange={setValue} />;
}

function InteractiveCheckbox({ label, defaultChecked = false }: { label: string; defaultChecked?: boolean }) {
  const [checked, setChecked] = React.useState(defaultChecked);
  return (
    <div className="flex items-center gap-2">
      <Checkbox checked={checked} onCheckedChange={setChecked} />
      <Label>{label}</Label>
    </div>
  );
}

// Registry of all components with their showcases
const componentRegistry: Array<{
  name: string;
  showcase: React.ReactNode;
}> = [
  {
    name: "Button",
    showcase: (
      <div className="flex flex-wrap gap-2">
        <Button>Default</Button>
        <Button variant="secondary">Secondary</Button>
        <Button variant="outline">Outline</Button>
        <Button variant="ghost">Ghost</Button>
        <Button variant="destructive">Destructive</Button>
      </div>
    ),
  },
  {
    name: "Card",
    showcase: (
      <Card className="w-full">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Card Title</CardTitle>
          <CardDescription>Card description</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Content area</p>
        </CardContent>
      </Card>
    ),
  },
  {
    name: "Badge",
    showcase: (
      <div className="flex flex-wrap gap-2">
        <Badge>Default</Badge>
        <Badge variant="secondary">Secondary</Badge>
        <Badge variant="outline">Outline</Badge>
        <Badge variant="destructive">Destructive</Badge>
      </div>
    ),
  },
  {
    name: "Avatar",
    showcase: (
      <div className="flex gap-2">
        <Avatar>
          <AvatarFallback>CN</AvatarFallback>
        </Avatar>
        <Avatar>
          <AvatarFallback>JD</AvatarFallback>
        </Avatar>
        <Avatar>
          <AvatarFallback>AB</AvatarFallback>
        </Avatar>
      </div>
    ),
  },
  {
    name: "Switch",
    showcase: (
      <div className="flex items-center gap-4">
        <InteractiveSwitch />
        <InteractiveSwitch defaultChecked />
      </div>
    ),
  },
  {
    name: "Slider",
    showcase: (
      <div className="w-full space-y-4">
        <InteractiveSlider defaultValue={30} />
        <InteractiveSlider defaultValue={70} />
      </div>
    ),
  },
  {
    name: "Input",
    showcase: (
      <div className="w-full space-y-2">
        <Input placeholder="Enter text..." />
        <Input placeholder="Disabled" disabled />
      </div>
    ),
  },
  {
    name: "Label",
    showcase: (
      <div className="space-y-2">
        <Label htmlFor="demo">Email Address</Label>
        <Input id="demo" placeholder="you@example.com" />
      </div>
    ),
  },
  {
    name: "Select",
    showcase: (
      <Select defaultValue="option1">
        <SelectOption value="option1">Option 1</SelectOption>
        <SelectOption value="option2">Option 2</SelectOption>
        <SelectOption value="option3">Option 3</SelectOption>
      </Select>
    ),
  },
  {
    name: "Checkbox",
    showcase: (
      <div className="flex items-center gap-4">
        <InteractiveCheckbox label="Option 1" />
        <InteractiveCheckbox label="Option 2" defaultChecked />
      </div>
    ),
  },
  {
    name: "Separator",
    showcase: (
      <div className="space-y-2 w-full">
        <p className="text-sm">Above</p>
        <Separator />
        <p className="text-sm">Below</p>
      </div>
    ),
  },
  {
    name: "Tabs",
    showcase: (
      <Tabs defaultValue="tab1" className="w-full">
        <TabsList>
          <TabsTrigger value="tab1">Tab 1</TabsTrigger>
          <TabsTrigger value="tab2">Tab 2</TabsTrigger>
        </TabsList>
        <TabsContent value="tab1">
          <p className="text-sm text-muted-foreground">Content for tab 1</p>
        </TabsContent>
        <TabsContent value="tab2">
          <p className="text-sm text-muted-foreground">Content for tab 2</p>
        </TabsContent>
      </Tabs>
    ),
  },
  {
    name: "Dialog",
    showcase: (
      <Dialog>
        <DialogTrigger>
          <Button variant="outline">Open Dialog</Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Dialog Title</DialogTitle>
            <DialogDescription>This is a dialog description.</DialogDescription>
          </DialogHeader>
          <p className="text-sm">Dialog content goes here.</p>
        </DialogContent>
      </Dialog>
    ),
  },
  {
    name: "Accordion",
    showcase: (
      <Accordion className="w-full">
        <AccordionItem>
          <AccordionTrigger>Is it accessible?</AccordionTrigger>
          <AccordionContent>Yes. It follows WAI-ARIA guidelines.</AccordionContent>
        </AccordionItem>
        <AccordionItem>
          <AccordionTrigger>Is it styled?</AccordionTrigger>
          <AccordionContent>Yes. It uses Tailwind CSS.</AccordionContent>
        </AccordionItem>
      </Accordion>
    ),
  },
  {
    name: "Textarea",
    showcase: (
      <Textarea placeholder="Enter your message..." className="w-full" />
    ),
  },
  {
    name: "Progress",
    showcase: (
      <div className="w-full space-y-2">
        <Progress value={30} />
        <Progress value={60} />
        <Progress value={90} />
      </div>
    ),
  },
  {
    name: "Alert",
    showcase: (
      <div className="w-full space-y-2">
        <Alert>
          <AlertTitle>Heads up!</AlertTitle>
          <AlertDescription>You can add components using the cli.</AlertDescription>
        </Alert>
        <Alert variant="destructive">
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>Something went wrong.</AlertDescription>
        </Alert>
      </div>
    ),
  },
  {
    name: "Skeleton",
    showcase: (
      <div className="flex items-center space-x-4 w-full">
        <Skeleton className="h-12 w-12 rounded-full" />
        <div className="space-y-2 flex-1">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </div>
      </div>
    ),
  },
  {
    name: "Radio Group",
    showcase: (
      <RadioGroup defaultValue="option-1">
        <div className="flex items-center space-x-2">
          <RadioGroupItem value="option-1" id="demo-r1" />
          <Label htmlFor="demo-r1">Option 1</Label>
        </div>
        <div className="flex items-center space-x-2">
          <RadioGroupItem value="option-2" id="demo-r2" />
          <Label htmlFor="demo-r2">Option 2</Label>
        </div>
      </RadioGroup>
    ),
  },
  {
    name: "Toggle",
    showcase: (
      <div className="flex gap-2">
        <Toggle aria-label="Toggle bold">B</Toggle>
        <Toggle aria-label="Toggle italic" variant="outline">I</Toggle>
        <Toggle aria-label="Toggle underline" defaultPressed>U</Toggle>
      </div>
    ),
  },
  {
    name: "Table",
    showcase: (
      <Table>
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
          <TableRow>
            <TableCell>Item 2</TableCell>
            <TableCell>Pending</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    ),
  },
  {
    name: "Breadcrumb",
    showcase: (
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
  },
  {
    name: "Aspect Ratio",
    showcase: (
      <AspectRatio ratio={16 / 9} className="bg-muted rounded-md flex items-center justify-center w-full">
        <span className="text-sm text-muted-foreground">16:9</span>
      </AspectRatio>
    ),
  },
  {
    name: "Tooltip",
    showcase: (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger className="px-3 py-1.5 border rounded-md text-sm">
            Hover me
          </TooltipTrigger>
          <TooltipContent>
            <p>Add to library</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    ),
  },
  {
    name: "Popover",
    showcase: (
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline">Open popover</Button>
        </PopoverTrigger>
        <PopoverContent className="w-60">
          <div className="space-y-2">
            <h4 className="font-medium text-sm">Dimensions</h4>
            <p className="text-xs text-muted-foreground">Set the dimensions.</p>
          </div>
        </PopoverContent>
      </Popover>
    ),
  },
  {
    name: "Toast",
    showcase: (
      <ToastComponent variant="default" className="w-full">
        <div className="grid gap-1">
          <ToastTitle>Notification</ToastTitle>
          <ToastDescription>Your message has been sent.</ToastDescription>
        </div>
      </ToastComponent>
    ),
  },
  {
    name: "Date Picker",
    showcase: (
      <DatePicker placeholder="Pick a date" className="w-full" />
    ),
  },
];

export function DesignSystem() {
  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground">Design System</h1>
          <p className="text-muted-foreground mt-2">
            {componentRegistry.length} components available
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {componentRegistry.map(({ name, showcase }) => (
            <div
              key={name}
              className="rounded-lg border bg-card p-6 shadow-sm"
            >
              <h3 className="font-semibold text-lg mb-4 text-card-foreground">
                {name}
              </h3>
              <div className="min-h-[80px] flex items-center">
                {showcase}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
`;
