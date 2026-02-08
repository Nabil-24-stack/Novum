"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export type BreadcrumbProps = React.HTMLAttributes<HTMLElement>;

export function Breadcrumb({ className, ...props }: BreadcrumbProps) {
  return (
    <nav
      aria-label="breadcrumb"
      className={cn("flex flex-wrap items-center gap-1.5 break-words text-sm text-muted-foreground", className)}
      {...props}
    />
  );
}

export type BreadcrumbItemProps = React.HTMLAttributes<HTMLLIElement>;

export function BreadcrumbItem({ className, ...props }: BreadcrumbItemProps) {
  return (
    <li
      className={cn("inline-flex items-center gap-1.5", className)}
      {...props}
    />
  );
}

export interface BreadcrumbLinkProps extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
  asChild?: boolean;
}

export function BreadcrumbLink({ className, href, children, ...props }: BreadcrumbLinkProps) {
  return (
    <a
      href={href}
      className={cn("transition-colors hover:text-foreground", className)}
      {...props}
    >
      {children}
    </a>
  );
}

export type BreadcrumbSeparatorProps = React.HTMLAttributes<HTMLSpanElement>;

export function BreadcrumbSeparator({ className, children, ...props }: BreadcrumbSeparatorProps) {
  return (
    <span
      role="presentation"
      aria-hidden="true"
      className={cn("[&>svg]:w-3.5 [&>svg]:h-3.5", className)}
      {...props}
    >
      {children || (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="m9 18 6-6-6-6" />
        </svg>
      )}
    </span>
  );
}

export type BreadcrumbPageProps = React.HTMLAttributes<HTMLSpanElement>;

export function BreadcrumbPage({ className, ...props }: BreadcrumbPageProps) {
  return (
    <span
      role="link"
      aria-disabled="true"
      aria-current="page"
      className={cn("font-normal text-foreground", className)}
      {...props}
    />
  );
}
