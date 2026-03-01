/**
 * Deterministic /App.tsx generator for parallel page builds.
 * Generates a complete App.tsx with routing for all pages — no AI needed.
 */

export function toPascalCase(str: string): string {
  return str
    .replace(/[^a-zA-Z0-9\s]/g, "")
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join("");
}

export function generateAppTsx(
  pages: { id: string; label: string; route: string }[]
): string {
  const pageComponents = pages.map((p) => ({
    ...p,
    componentName: toPascalCase(p.label),
  }));

  const imports = pageComponents
    .map(
      (p) =>
        `import { ${p.componentName} } from "./pages/${p.componentName}";`
    )
    .join("\n");

  const cases = pageComponents
    .filter((p) => p.route !== "/")
    .map(
      (p) =>
        `    case "${p.route}":\n      page = <${p.componentName} />;\n      break;`
    )
    .join("\n");

  const defaultPage = pageComponents.find((p) => p.route === "/");
  const defaultReturn = defaultPage
    ? `      page = <${defaultPage.componentName} />;`
    : `      page = <div>No pages configured</div>;`;

  return `import * as React from "react";
import { useRouter } from "./lib/router";
import { ToastProvider, Toaster } from "./components/ui/toast";
${imports}
import "./globals.css";

export function App() {
  const { route } = useRouter();

  let page: React.ReactNode;
  switch (route) {
${cases}
    default:
${defaultReturn}
  }

  return (
    <ToastProvider>
      {page}
      <Toaster />
    </ToastProvider>
  );
}
`;
}
