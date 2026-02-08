"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export interface AspectRatioProps extends React.HTMLAttributes<HTMLDivElement> {
  ratio?: number;
}

export function AspectRatio({ ratio = 1, className, style, children, ...props }: AspectRatioProps) {
  return (
    <div
      className={cn("relative w-full", className)}
      style={{ ...style, aspectRatio: String(ratio) }}
      {...props}
    >
      {children}
    </div>
  );
}
