"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

interface TooltipContextValue {
  open: boolean;
  setOpen: (open: boolean) => void;
  triggerRect: DOMRect | null;
  setTriggerRect: (rect: DOMRect | null) => void;
}

const TooltipContext = React.createContext<TooltipContextValue | null>(null);

export interface TooltipProviderProps {
  children: React.ReactNode;
  delayDuration?: number;
}

export function TooltipProvider({ children }: TooltipProviderProps) {
  return <>{children}</>;
}

export interface TooltipProps {
  children: React.ReactNode;
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function Tooltip({ children, defaultOpen = false, open: controlledOpen, onOpenChange }: TooltipProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(defaultOpen);
  const [triggerRect, setTriggerRect] = React.useState<DOMRect | null>(null);

  const open = controlledOpen ?? uncontrolledOpen;
  const setOpen = React.useCallback((newOpen: boolean) => {
    setUncontrolledOpen(newOpen);
    onOpenChange?.(newOpen);
  }, [onOpenChange]);

  return (
    <TooltipContext.Provider value={{ open, setOpen, triggerRect, setTriggerRect }}>
      {children}
    </TooltipContext.Provider>
  );
}

export interface TooltipTriggerProps extends React.HTMLAttributes<HTMLButtonElement> {
  asChild?: boolean;
}

export const TooltipTrigger = React.forwardRef<HTMLButtonElement, TooltipTriggerProps>(
  ({ children, ...props }, forwardedRef) => {
    const context = React.useContext(TooltipContext);
    if (!context) throw new Error("TooltipTrigger must be used within Tooltip");

    const { setOpen, setTriggerRect } = context;
    const buttonRef = React.useRef<HTMLButtonElement>(null);

    const updateRect = () => {
      if (buttonRef.current) {
        setTriggerRect(buttonRef.current.getBoundingClientRect());
      }
    };

    return (
      <button
        ref={(node) => {
          (buttonRef as React.MutableRefObject<HTMLButtonElement | null>).current = node;
          if (typeof forwardedRef === "function") forwardedRef(node);
          else if (forwardedRef) forwardedRef.current = node;
        }}
        onMouseEnter={() => {
          updateRect();
          setOpen(true);
        }}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => {
          updateRect();
          setOpen(true);
        }}
        onBlur={() => setOpen(false)}
        {...props}
      >
        {children}
      </button>
    );
  }
);
TooltipTrigger.displayName = "TooltipTrigger";

export interface TooltipContentProps extends React.HTMLAttributes<HTMLDivElement> {
  side?: "top" | "right" | "bottom" | "left";
  sideOffset?: number;
}

export function TooltipContent({ className, side = "top", sideOffset = 4, children, ...props }: TooltipContentProps) {
  const context = React.useContext(TooltipContext);
  if (!context) throw new Error("TooltipContent must be used within Tooltip");

  const { open, triggerRect } = context;
  const [position, setPosition] = React.useState({ top: 0, left: 0 });
  const contentRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open || !triggerRect || !contentRef.current) return;

    const content = contentRef.current.getBoundingClientRect();

    let top = 0;
    let left = 0;

    switch (side) {
      case "top":
        top = triggerRect.top - content.height - sideOffset;
        left = triggerRect.left + triggerRect.width / 2 - content.width / 2;
        break;
      case "bottom":
        top = triggerRect.bottom + sideOffset;
        left = triggerRect.left + triggerRect.width / 2 - content.width / 2;
        break;
      case "left":
        top = triggerRect.top + triggerRect.height / 2 - content.height / 2;
        left = triggerRect.left - content.width - sideOffset;
        break;
      case "right":
        top = triggerRect.top + triggerRect.height / 2 - content.height / 2;
        left = triggerRect.right + sideOffset;
        break;
    }

    setPosition({ top, left });
  }, [open, side, sideOffset, triggerRect]);

  if (!open) return null;

  return (
    <div
      ref={contentRef}
      className={cn(
        "fixed z-50 overflow-hidden rounded-md border bg-popover px-3 py-1.5 text-sm text-popover-foreground shadow-md animate-in fade-in-0 zoom-in-95",
        className
      )}
      style={{ top: position.top, left: position.left }}
      {...props}
    >
      {children}
    </div>
  );
}
