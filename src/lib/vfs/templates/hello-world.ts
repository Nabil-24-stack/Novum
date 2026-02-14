import { packageJsonTemplate } from "./package-json";
import { designSystemRichTemplate } from "./design-system-rich";
import { tokensJsonTemplate, globalsCssTemplate } from "./tokens-template";
import {
  badgeTemplate,
  avatarTemplate,
  switchTemplate,
  sliderTemplate,
  inputTemplate,
  labelTemplate,
  selectTemplate,
  separatorTemplate,
  checkboxTemplate,
  tabsTemplate,
  dialogTemplate,
  accordionTemplate,
  textareaTemplate,
  progressTemplate,
  alertTemplate,
  skeletonTemplate,
  radioGroupTemplate,
  toggleTemplate,
  tableTemplate,
  breadcrumbTemplate,
  aspectRatioTemplate,
  tooltipTemplate,
  popoverTemplate,
  toastTemplate,
  datePickerTemplate,
} from "./shadcn-core";

// Default flow manifest with single home page
const flowJsonTemplate = `{
  "pages": [
    { "id": "home", "name": "Home", "route": "/" }
  ],
  "connections": []
}`;

// Pre-compile all UI components for instant HMR during drag-and-drop
const warmupTemplate = `// Pre-compile all UI components for instant HMR
import "./components/ui/button";
import "./components/ui/card";
import "./components/ui/input";
import "./components/ui/badge";
import "./components/ui/checkbox";
import "./components/ui/switch";
import "./components/ui/tabs";
import "./components/ui/avatar";
import "./components/ui/slider";
import "./components/ui/separator";
import "./components/ui/label";
import "./components/ui/select";
import "./components/ui/dialog";
import "./components/ui/accordion";
import "./components/ui/textarea";
import "./components/ui/progress";
import "./components/ui/alert";
import "./components/ui/skeleton";
import "./components/ui/radio-group";
import "./components/ui/toggle";
import "./components/ui/table";
import "./components/ui/breadcrumb";
import "./components/ui/aspect-ratio";
import "./components/ui/tooltip";
import "./components/ui/popover";
import "./components/ui/toast";
import "./components/ui/date-picker";
`;

export const helloWorldTemplate: Record<string, string> = {
  "/package.json": packageJsonTemplate,
  "/tokens.json": tokensJsonTemplate,
  "/flow.json": flowJsonTemplate,
  "/warmup.ts": warmupTemplate,
  "/design-system.tsx": designSystemRichTemplate,

  "/App.tsx": `import * as React from "react";
import { Button } from "./components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./components/ui/card";
import "./globals.css";

export function App() {
  return (
    <div className="min-h-screen bg-background p-8 flex items-center justify-center">
      <Card className="w-[350px]">
        <CardHeader>
          <CardTitle>Welcome to Novum</CardTitle>
          <CardDescription>
            A code-first UI builder powered by Sandpack
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            Edit the files in the virtual file system to see live changes.
          </p>
          <Button onClick={() => alert("Hello from Novum!")}>
            Click Me
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
`,

  "/lib/router.tsx": `import * as React from "react";

// Parse route from URL (supports both path and hash-based routes)
export function getRouteFromUrl(): string {
  const path = window.location.pathname;
  const hash = window.location.hash;

  // Design system route (special case)
  if (path.includes("design-system") || hash.includes("design-system")) {
    return "design-system";
  }

  // Hash-based routing: #/dashboard -> /dashboard
  if (hash.startsWith("#/")) {
    return hash.slice(1); // Remove the # prefix
  }

  // Pathname-based routing
  if (path && path !== "/") {
    return path;
  }

  return "/";
}

// Router context to share current route with components
export const RouterContext = React.createContext<{
  route: string;
  navigate: (to: string) => void;
}>({ route: "/", navigate: () => {} });

export function useRouter() {
  return React.useContext(RouterContext);
}

// Extend Window interface for flow mode navigation interception
declare global {
  interface Window {
    __novumFlowModeActive?: boolean;
    __novumInterceptNavigation?: (route: string) => void;
  }
}
`,

  "/index.tsx": `import * as React from "react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { getRouteFromUrl, RouterContext } from "./lib/router";

// Re-export useRouter for backwards compatibility
export { useRouter } from "./lib/router";

// Pre-compile all UI components for instant drag-and-drop
import "./warmup";

// Lazy load DesignSystem to catch import errors
const DesignSystem = React.lazy(() => import("./design-system").then(mod => ({ default: mod.DesignSystem })));

// Error boundary for catching component errors
class ErrorBoundary extends React.Component<
  { children: React.ReactNode; fallback: React.ReactNode },
  { hasError: boolean; error?: Error }
> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="p-8 text-center">
          <h2 className="text-xl font-bold text-red-600 mb-2">Component Error</h2>
          <p className="text-gray-600 mb-4">{this.state.error?.message}</p>
          <p className="text-sm text-gray-500">Check the console for details. The Design System page may have import errors.</p>
        </div>
      );
    }
    return this.props.children;
  }
}

// Simple routing based on URL path or hash
function Router() {
  const [route, setRoute] = React.useState(getRouteFromUrl);

  const navigate = React.useCallback((to: string) => {
    // In Flow View mode, intercept navigation and notify parent instead
    if (window.__novumFlowModeActive && window.__novumInterceptNavigation) {
      window.__novumInterceptNavigation(to);
      return; // Don't navigate - parent will handle viewport animation
    }
    window.location.hash = to;
  }, []);

  React.useEffect(() => {
    const handleChange = () => {
      setRoute(getRouteFromUrl());
    };

    window.addEventListener("hashchange", handleChange);
    window.addEventListener("popstate", handleChange);
    return () => {
      window.removeEventListener("hashchange", handleChange);
      window.removeEventListener("popstate", handleChange);
    };
  }, []);

  // Notify host app when route changes
  React.useEffect(() => {
    if (route !== "design-system") {
      window.parent.postMessage({ type: "novum:route-changed", payload: { route } }, "*");
    }
  }, [route]);

  if (route === "design-system") {
    return (
      <ErrorBoundary fallback={<div>Error loading Design System</div>}>
        <React.Suspense fallback={<div className="p-8 text-center">Loading Design System...</div>}>
          <DesignSystem />
        </React.Suspense>
      </ErrorBoundary>
    );
  }

  // Pass the current route to App for page-level routing
  return (
    <RouterContext.Provider value={{ route, navigate }}>
      <App />
    </RouterContext.Provider>
  );
}

const rootElement = document.getElementById("root");
if (rootElement) {
  const root = createRoot(rootElement);
  root.render(
    <StrictMode>
      <Router />
    </StrictMode>
  );
}
`,

  "/globals.css": globalsCssTemplate,

  "/components/ui/button.tsx": `import * as React from "react";
import { cn } from "../../lib/utils";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link";
  size?: "default" | "sm" | "lg" | "icon";
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "default", ...props }, ref) => {
    const baseStyles = "inline-flex items-center justify-center whitespace-nowrap text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border-solid border-input";

    const variants = {
      default: "bg-primary text-primary-foreground hover:bg-primary/90",
      destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
      outline: "border border-input bg-background text-foreground hover:bg-accent hover:text-accent-foreground",
      secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
      ghost: "text-foreground hover:bg-accent hover:text-accent-foreground",
      link: "text-primary underline-offset-4 hover:underline",
    };

    const sizes = {
      default: "h-10 px-4 py-2",
      sm: "h-9 px-3",
      lg: "h-11 px-8",
      icon: "h-10 w-10",
    };

    return (
      <button
        className={cn(baseStyles, variants[variant], sizes[size], className)}
        style={{
          borderRadius: "var(--button-radius, var(--radius))",
          borderWidth: "var(--button-border-width, 0px)",
          boxShadow: "var(--button-shadow, none)",
        }}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button };
`,

  "/components/ui/card.tsx": `import * as React from "react";
import { cn } from "../../lib/utils";

const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "border border-border bg-card text-card-foreground",
        className
      )}
      style={{
        borderRadius: "var(--card-radius, var(--radius-lg))",
        borderWidth: "var(--card-border-width, 1px)",
        boxShadow: "var(--card-shadow, none)",
      }}
      {...props}
    />
  )
);
Card.displayName = "Card";

const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn("flex flex-col space-y-1.5 p-6", className)}
      {...props}
    />
  )
);
CardHeader.displayName = "CardHeader";

const CardTitle = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h3
      ref={ref}
      className={cn("text-2xl font-semibold leading-none tracking-tight text-card-foreground", className)}
      {...props}
    />
  )
);
CardTitle.displayName = "CardTitle";

const CardDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <p
      ref={ref}
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  )
);
CardDescription.displayName = "CardDescription";

const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("p-6 pt-0 text-card-foreground", className)} {...props} />
  )
);
CardContent.displayName = "CardContent";

const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn("flex items-center p-6 pt-0", className)}
      {...props}
    />
  )
);
CardFooter.displayName = "CardFooter";

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent };
`,

  // All the additional Shadcn components from shadcn-core
  "/components/ui/badge.tsx": badgeTemplate,
  "/components/ui/avatar.tsx": avatarTemplate,
  "/components/ui/switch.tsx": switchTemplate,
  "/components/ui/slider.tsx": sliderTemplate,
  "/components/ui/input.tsx": inputTemplate,
  "/components/ui/label.tsx": labelTemplate,
  "/components/ui/select.tsx": selectTemplate,
  "/components/ui/separator.tsx": separatorTemplate,
  "/components/ui/checkbox.tsx": checkboxTemplate,
  "/components/ui/tabs.tsx": tabsTemplate,
  "/components/ui/dialog.tsx": dialogTemplate,
  "/components/ui/accordion.tsx": accordionTemplate,
  "/components/ui/textarea.tsx": textareaTemplate,
  "/components/ui/progress.tsx": progressTemplate,
  "/components/ui/alert.tsx": alertTemplate,
  "/components/ui/skeleton.tsx": skeletonTemplate,
  "/components/ui/radio-group.tsx": radioGroupTemplate,
  "/components/ui/toggle.tsx": toggleTemplate,
  "/components/ui/table.tsx": tableTemplate,
  "/components/ui/breadcrumb.tsx": breadcrumbTemplate,
  "/components/ui/aspect-ratio.tsx": aspectRatioTemplate,
  "/components/ui/tooltip.tsx": tooltipTemplate,
  "/components/ui/popover.tsx": popoverTemplate,
  "/components/ui/toast.tsx": toastTemplate,
  "/components/ui/date-picker.tsx": datePickerTemplate,

  "/lib/utils.ts": `import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
`,

  "/tailwind.config.js": `/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["class"],
  content: ["./**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-sans)"],
      },
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
    },
  },
  plugins: [],
};
`,
};
