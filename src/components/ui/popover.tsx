"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

interface PopoverContextValue {
  open: boolean;
  setOpen: (open: boolean) => void;
  triggerRect: DOMRect | null;
  setTriggerRect: (rect: DOMRect | null) => void;
}

const PopoverContext = React.createContext<PopoverContextValue | null>(null);

export interface PopoverProps {
  children: React.ReactNode;
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function Popover({ children, defaultOpen = false, open: controlledOpen, onOpenChange }: PopoverProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(defaultOpen);
  const [triggerRect, setTriggerRect] = React.useState<DOMRect | null>(null);

  const open = controlledOpen ?? uncontrolledOpen;
  const setOpen = React.useCallback((newOpen: boolean) => {
    setUncontrolledOpen(newOpen);
    onOpenChange?.(newOpen);
  }, [onOpenChange]);

  return (
    <PopoverContext.Provider value={{ open, setOpen, triggerRect, setTriggerRect }}>
      {children}
    </PopoverContext.Provider>
  );
}

export interface PopoverTriggerProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  asChild?: boolean;
}

export const PopoverTrigger = React.forwardRef<HTMLButtonElement, PopoverTriggerProps>(
  ({ children, onClick, ...props }, forwardedRef) => {
    const context = React.useContext(PopoverContext);
    if (!context) throw new Error("PopoverTrigger must be used within Popover");

    const { open, setOpen, setTriggerRect } = context;
    const buttonRef = React.useRef<HTMLButtonElement>(null);

    return (
      <button
        ref={(node) => {
          (buttonRef as React.MutableRefObject<HTMLButtonElement | null>).current = node;
          if (typeof forwardedRef === "function") forwardedRef(node);
          else if (forwardedRef) forwardedRef.current = node;
        }}
        onClick={(e) => {
          if (buttonRef.current) {
            setTriggerRect(buttonRef.current.getBoundingClientRect());
          }
          setOpen(!open);
          onClick?.(e);
        }}
        {...props}
      >
        {children}
      </button>
    );
  }
);
PopoverTrigger.displayName = "PopoverTrigger";

export interface PopoverContentProps extends React.HTMLAttributes<HTMLDivElement> {
  side?: "top" | "right" | "bottom" | "left";
  sideOffset?: number;
  align?: "start" | "center" | "end";
}

export function PopoverContent({
  className,
  side = "bottom",
  sideOffset = 4,
  align = "center",
  children,
  ...props
}: PopoverContentProps) {
  const context = React.useContext(PopoverContext);
  if (!context) throw new Error("PopoverContent must be used within Popover");

  const { open, setOpen, triggerRect } = context;
  const [position, setPosition] = React.useState({ top: 0, left: 0 });
  const contentRef = React.useRef<HTMLDivElement>(null);

  // Click outside to close
  React.useEffect(() => {
    if (!open) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (
        contentRef.current &&
        !contentRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };

    // Delay to avoid immediate close from trigger click
    const timeoutId = setTimeout(() => {
      document.addEventListener("mousedown", handleClickOutside);
    }, 0);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [open, setOpen]);

  // Position calculation
  React.useEffect(() => {
    if (!open || !triggerRect || !contentRef.current) return;

    const content = contentRef.current.getBoundingClientRect();

    let top = 0;
    let left = 0;

    // Calculate vertical position
    switch (side) {
      case "top":
        top = triggerRect.top - content.height - sideOffset;
        break;
      case "bottom":
        top = triggerRect.bottom + sideOffset;
        break;
      case "left":
      case "right":
        top = triggerRect.top + triggerRect.height / 2 - content.height / 2;
        break;
    }

    // Calculate horizontal position
    switch (side) {
      case "left":
        left = triggerRect.left - content.width - sideOffset;
        break;
      case "right":
        left = triggerRect.right + sideOffset;
        break;
      case "top":
      case "bottom":
        if (align === "start") {
          left = triggerRect.left;
        } else if (align === "end") {
          left = triggerRect.right - content.width;
        } else {
          left = triggerRect.left + triggerRect.width / 2 - content.width / 2;
        }
        break;
    }

    setPosition({ top, left });
  }, [open, side, sideOffset, align, triggerRect]);

  if (!open) return null;

  return (
    <div
      ref={contentRef}
      className={cn(
        "fixed z-50 w-72 rounded-md border bg-popover p-4 text-popover-foreground shadow-md outline-none animate-in fade-in-0 zoom-in-95",
        className
      )}
      style={{ top: position.top, left: position.left }}
      {...props}
    >
      {children}
    </div>
  );
}
