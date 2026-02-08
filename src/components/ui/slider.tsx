"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export interface SliderProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "onChange"> {
  value?: number;
  min?: number;
  max?: number;
  step?: number;
  onValueChange?: (value: number) => void;
}

const Slider = React.forwardRef<HTMLDivElement, SliderProps>(
  ({ className, value = 50, min = 0, max = 100, step = 1, onValueChange, ...props }, ref) => {
    const trackRef = React.useRef<HTMLDivElement>(null);
    const [isDragging, setIsDragging] = React.useState(false);
    const percentage = ((value - min) / (max - min)) * 100;

    const calculateValue = React.useCallback((clientX: number) => {
      const track = trackRef.current;
      if (!track) return value;

      const rect = track.getBoundingClientRect();
      const percent = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      const newValue = Math.round((percent * (max - min) + min) / step) * step;
      return Math.max(min, Math.min(max, newValue));
    }, [min, max, step, value]);

    const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
      e.currentTarget.setPointerCapture(e.pointerId);
      setIsDragging(true);
      const newValue = calculateValue(e.clientX);
      onValueChange?.(newValue);
    };

    const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
      if (!isDragging) return;
      const newValue = calculateValue(e.clientX);
      onValueChange?.(newValue);
    };

    const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
      e.currentTarget.releasePointerCapture(e.pointerId);
      setIsDragging(false);
    };

    return (
      <div
        ref={ref}
        className={cn("relative flex w-full touch-none select-none items-center cursor-pointer", className)}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        {...props}
      >
        <div
          ref={trackRef}
          className="relative h-2 w-full grow overflow-hidden rounded-full bg-secondary"
        >
          <div
            className="absolute h-full bg-primary"
            style={{ width: `${percentage}%` }}
          />
        </div>
        <div
          className={cn(
            "absolute block h-5 w-5 rounded-full border-2 border-primary bg-background ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
            !isDragging && "transition-[left]"
          )}
          style={{ left: `calc(${percentage}% - 10px)` }}
        />
      </div>
    );
  }
);
Slider.displayName = "Slider";

export { Slider };
