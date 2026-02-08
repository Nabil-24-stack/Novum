"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export interface ToggleProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  pressed?: boolean;
  defaultPressed?: boolean;
  onPressedChange?: (pressed: boolean) => void;
  variant?: "default" | "outline";
  size?: "default" | "sm" | "lg";
}

export function Toggle({
  className,
  pressed,
  defaultPressed = false,
  onPressedChange,
  variant = "default",
  size = "default",
  children,
  ...props
}: ToggleProps) {
  const [internalPressed, setInternalPressed] = React.useState(defaultPressed);
  const isPressed = pressed ?? internalPressed;

  const handleClick = () => {
    const newPressed = !isPressed;
    setInternalPressed(newPressed);
    onPressedChange?.(newPressed);
  };

  const variants = {
    default: "bg-transparent",
    outline: "border border-input bg-transparent hover:bg-accent hover:text-accent-foreground",
  };

  const sizes = {
    default: "h-10 px-3",
    sm: "h-9 px-2.5",
    lg: "h-11 px-5",
  };

  return (
    <button
      type="button"
      aria-pressed={isPressed}
      onClick={handleClick}
      className={cn(
        "inline-flex items-center justify-center rounded-md text-sm font-medium",
        "ring-offset-background transition-colors",
        "hover:bg-muted hover:text-muted-foreground",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        "disabled:pointer-events-none disabled:opacity-50",
        isPressed && "bg-accent text-accent-foreground",
        variants[variant],
        sizes[size],
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}
