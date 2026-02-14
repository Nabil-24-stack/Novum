"use client";

import { useMemo } from "react";
import { SandpackProvider, SandpackPreview } from "@codesandbox/sandpack-react";
import { defaultPackageJson } from "@/lib/vfs/templates/package-json";
import { getTailwindConfigDataUrl } from "@/lib/tailwind-config";

interface PublishedAppViewerProps {
  name: string;
  files: Record<string, string>;
}

function parseDependencies(files: Record<string, string>): Record<string, string> {
  const packageJsonContent = files["/package.json"];
  if (!packageJsonContent) return defaultPackageJson.dependencies;

  try {
    const parsed = JSON.parse(packageJsonContent);
    if (parsed.dependencies && typeof parsed.dependencies === "object") {
      return parsed.dependencies;
    }
  } catch {
    // fallback
  }

  return defaultPackageJson.dependencies;
}

export function PublishedAppViewer({ name, files }: PublishedAppViewerProps) {
  const dependencies = useMemo(() => parseDependencies(files), [files]);

  const sandpackFiles = useMemo(() => {
    const filtered = { ...files };
    delete filtered["/package.json"];
    delete filtered["/tokens.json"];
    return filtered;
  }, [files]);

  const externalResources = useMemo(
    () => [
      "https://cdn.tailwindcss.com",
      getTailwindConfigDataUrl(),
    ],
    []
  );

  return (
    <div className="w-screen h-screen flex flex-col bg-white">
      <div className="flex-1 min-h-0">
        <SandpackProvider
          template="react-ts"
          files={sandpackFiles}
          customSetup={{ dependencies }}
          options={{
            externalResources,
            classes: {
              "sp-wrapper": "!h-full",
              "sp-layout": "!h-full",
              "sp-stack": "!h-full",
            },
          }}
          theme="light"
        >
          <SandpackPreview
            showNavigator={false}
            showOpenInCodeSandbox={false}
            style={{ height: "100%" }}
          />
        </SandpackProvider>
      </div>

      {/* Built with Novum banner */}
      <div className="h-8 bg-neutral-900 flex items-center justify-center shrink-0">
        <span className="text-xs text-neutral-400">
          Built with{" "}
          <a
            href="/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-white font-medium hover:underline"
          >
            Novum
          </a>
        </span>
      </div>
    </div>
  );
}
