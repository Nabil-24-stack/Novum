"use client";

import * as React from "react";
import { CircleAlert, CircleCheckBig, Info, TriangleAlert, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface Toast {
  id: string;
  title?: string;
  description?: string;
  variant?: "default" | "success" | "warning" | "info" | "destructive";
  duration?: number;
}

interface ToastRecord extends Toast {
  closing?: boolean;
}

interface ToastContextValue {
  toasts: ToastRecord[];
  toast: (props: Omit<Toast, "id">) => string;
  dismiss: (id: string) => void;
}

const ToastContext = React.createContext<ToastContextValue | null>(null);

let toastCount = 0;
function genId() {
  return String(toastCount++);
}

const TOAST_EXIT_MS = 180;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<ToastRecord[]>([]);

  const dismiss = React.useCallback((id: string) => {
    setToasts((prev) =>
      prev.map((toast) => (toast.id === id ? { ...toast, closing: true } : toast))
    );

    setTimeout(() => {
      setToasts((prev) => prev.filter((toast) => toast.id !== id));
    }, TOAST_EXIT_MS);
  }, []);

  const toast = React.useCallback(
    (props: Omit<Toast, "id">) => {
      const id = genId();
      const nextToast: ToastRecord = {
        ...props,
        id,
        closing: false,
        duration: props.duration ?? 5000,
      };

      setToasts((prev) => [...prev, nextToast]);

      if (nextToast.duration && nextToast.duration > 0) {
        setTimeout(() => dismiss(id), nextToast.duration);
      }

      return id;
    },
    [dismiss]
  );

  return (
    <ToastContext.Provider value={{ toasts, toast, dismiss }}>
      {children}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = React.useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within ToastProvider");
  }
  return context;
}

export interface ToastProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "success" | "warning" | "info" | "destructive";
  onClose?: () => void;
}

type ToastVariant = NonNullable<ToastProps["variant"]>;

const toastVariants: Record<
  ToastVariant,
  { accent: string; iconWrap: string; icon: React.ComponentType<React.SVGProps<SVGSVGElement>>; surface: string }
> = {
  default: {
    accent: "bg-foreground/15",
    iconWrap: "border-border bg-muted text-foreground",
    icon: CircleAlert,
    surface: "border-border bg-background/95 text-foreground",
  },
  success: {
    accent: "bg-success",
    iconWrap: "border-success/20 bg-success/10 text-success",
    icon: CircleCheckBig,
    surface: "border-success/25 bg-background/95 text-foreground",
  },
  warning: {
    accent: "bg-warning",
    iconWrap: "border-warning/20 bg-warning/10 text-warning",
    icon: TriangleAlert,
    surface: "border-warning/25 bg-background/95 text-foreground",
  },
  info: {
    accent: "bg-info",
    iconWrap: "border-info/20 bg-info/10 text-info",
    icon: Info,
    surface: "border-info/25 bg-background/95 text-foreground",
  },
  destructive: {
    accent: "bg-destructive",
    iconWrap: "border-destructive/20 bg-destructive/10 text-destructive",
    icon: CircleAlert,
    surface: "border-destructive/25 bg-background/95 text-foreground",
  },
};

export function ToastComponent({
  className,
  variant = "default",
  onClose,
  children,
  style,
  ...props
}: ToastProps) {
  const meta = toastVariants[variant];
  const Icon = meta.icon;

  return (
    <div
      className={cn(
        "group pointer-events-auto relative isolate w-full overflow-hidden border p-4 pr-12 backdrop-blur-sm transition-[transform,opacity,box-shadow] duration-200",
        "supports-[backdrop-filter]:bg-background/80",
        meta.surface,
        className
      )}
      style={{
        borderRadius: "var(--toast-radius, var(--radius-lg))",
        borderWidth: "var(--toast-border-width, 1px)",
        boxShadow: "var(--toast-shadow, 0 18px 40px -24px rgb(15 23 42 / 0.45))",
        ...style,
      }}
      {...props}
    >
      <div aria-hidden="true" className={cn("absolute inset-x-0 top-0 h-1", meta.accent)} />
      <div className="flex min-w-0 items-start gap-3">
        <span
          aria-hidden="true"
          className={cn(
            "mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full border",
            meta.iconWrap
          )}
        >
          <Icon className="size-4" />
        </span>
        <div className="grid min-w-0 flex-1 gap-1">{children}</div>
      </div>
      {onClose ? (
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 rounded-full border border-border/60 bg-background/85 p-1.5 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <X className="size-4" />
          <span className="sr-only">Dismiss notification</span>
        </button>
      ) : null}
    </div>
  );
}

export function ToastTitle({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("text-body text-foreground", className)} {...props} />;
}

export function ToastDescription({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("text-body-sm text-foreground/75", className)} {...props} />;
}

export function Toaster() {
  const { toasts, dismiss } = useToast();

  return (
    <div className="pointer-events-none fixed bottom-0 right-0 z-[100] flex max-h-screen w-full flex-col-reverse gap-3 p-4 sm:bottom-0 sm:right-0 sm:top-auto sm:flex-col md:max-w-[420px]">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={cn(
            "pointer-events-auto transition-all duration-200",
            toast.closing
              ? "animate-out fade-out-0 slide-out-to-right-full zoom-out-95"
              : "animate-in fade-in-0 slide-in-from-bottom-2 sm:slide-in-from-right-5 zoom-in-95"
          )}
        >
          <ToastComponent variant={toast.variant} onClose={() => dismiss(toast.id)}>
            <div className="grid gap-1">
              {toast.title ? <ToastTitle>{toast.title}</ToastTitle> : null}
              {toast.description ? (
                <ToastDescription>{toast.description}</ToastDescription>
              ) : null}
            </div>
          </ToastComponent>
        </div>
      ))}
    </div>
  );
}
