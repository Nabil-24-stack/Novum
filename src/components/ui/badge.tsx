import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex cursor-default select-none items-center gap-1 border border-solid px-2.5 py-0.5 text-caption",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground",
        secondary: "border-transparent bg-secondary text-secondary-foreground",
        success: "border-transparent bg-success text-success-foreground",
        warning: "border-transparent bg-warning text-warning-foreground",
        info: "border-transparent bg-info text-info-foreground",
        destructive: "border-transparent bg-destructive text-destructive-foreground",
        outline: "border-input bg-background text-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

const Badge = React.forwardRef<HTMLDivElement, BadgeProps>(
  ({ className, variant, style, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(badgeVariants({ variant }), className)}
      style={{
        borderRadius: "var(--badge-radius, var(--radius-md))",
        borderWidth: "var(--badge-border-width, 0px)",
        boxShadow: "var(--badge-shadow, none)",
        ...style,
      }}
      {...props}
    />
  )
);
Badge.displayName = "Badge";

export { Badge, badgeVariants };
