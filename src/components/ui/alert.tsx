import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { CircleAlert, CircleCheckBig, Info, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";

const alertVariants = cva("relative overflow-hidden border px-4 py-3 text-foreground", {
  variants: {
    variant: {
      default: "border-border bg-muted/35",
      success: "border-success/20 bg-success/10",
      warning: "border-warning/25 bg-warning/10",
      info: "border-info/20 bg-info/10",
      destructive: "border-destructive/20 bg-destructive/10",
    },
  },
  defaultVariants: {
    variant: "default",
  },
});

const alertAccentVariants: Record<NonNullable<VariantProps<typeof alertVariants>["variant"]>, string> = {
  default: "bg-foreground/15",
  success: "bg-success",
  warning: "bg-warning",
  info: "bg-info",
  destructive: "bg-destructive",
};

const alertIconVariants: Record<NonNullable<VariantProps<typeof alertVariants>["variant"]>, string> = {
  default: "text-foreground/70",
  success: "text-success",
  warning: "text-warning",
  info: "text-info",
  destructive: "text-destructive",
};

const alertIcons = {
  default: CircleAlert,
  success: CircleCheckBig,
  warning: TriangleAlert,
  info: Info,
  destructive: CircleAlert,
} satisfies Record<NonNullable<VariantProps<typeof alertVariants>["variant"]>, React.ComponentType<React.SVGProps<SVGSVGElement>>>;

type AlertVariant = NonNullable<VariantProps<typeof alertVariants>["variant"]>;

const Alert = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof alertVariants>
>(({ className, variant = "default", style, children, ...props }, ref) => {
  const Icon = alertIcons[variant as AlertVariant];

  return (
    <div
      ref={ref}
      role="alert"
      className={cn(alertVariants({ variant }), className)}
      style={{
        borderRadius: "var(--alert-radius, var(--radius-lg))",
        borderWidth: "var(--alert-border-width, 1px)",
        boxShadow: "var(--alert-shadow, none)",
        ...style,
      }}
      {...props}
    >
      <div
        aria-hidden="true"
        className={cn("absolute inset-y-0 left-0 w-1", alertAccentVariants[variant as AlertVariant])}
      />
      <div className="grid grid-cols-[auto_1fr] items-start gap-3 pl-1">
        <span
          aria-hidden="true"
          className={cn(
            "mt-0.5 flex size-8 items-center justify-center rounded-full border border-current/10 bg-background/70",
            alertIconVariants[variant as AlertVariant]
          )}
        >
          <Icon className="size-4" />
        </span>
        <div className="grid gap-1.5">{children}</div>
      </div>
    </div>
  );
});
Alert.displayName = "Alert";

const AlertTitle = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h5
    ref={ref}
    className={cn("text-body leading-none text-foreground", className)}
    {...props}
  />
));
AlertTitle.displayName = "AlertTitle";

const AlertDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("text-body-sm text-foreground/80 [&_p]:leading-relaxed", className)}
    {...props}
  />
));
AlertDescription.displayName = "AlertDescription";

export { Alert, AlertTitle, AlertDescription };
