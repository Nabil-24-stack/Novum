"use client";

import { useState, useCallback } from "react";
import { helloWorldTemplate } from "@/lib/vfs/templates/hello-world";

export interface UseVirtualFilesReturn {
  files: Record<string, string>;
  readFile: (path: string) => string | undefined;
  writeFile: (path: string, content: string) => void;
  deleteFile: (path: string) => void;
  getAllFiles: () => Record<string, string>;
}

export function useVirtualFiles(): UseVirtualFilesReturn {
  const [files, setFiles] = useState<Record<string, string>>(helloWorldTemplate);

  const readFile = useCallback(
    (path: string): string | undefined => {
      return files[path];
    },
    [files]
  );

  const writeFile = useCallback((path: string, content: string): void => {
    setFiles((prev) => ({
      ...prev,
      [path]: content,
    }));
  }, []);

  const deleteFile = useCallback((path: string): void => {
    setFiles((prev) => {
      const next = { ...prev };
      delete next[path];
      return next;
    });
  }, []);

  const getAllFiles = useCallback((): Record<string, string> => {
    return { ...files };
  }, [files]);

  return {
    files,
    readFile,
    writeFile,
    deleteFile,
    getAllFiles,
  };
}
