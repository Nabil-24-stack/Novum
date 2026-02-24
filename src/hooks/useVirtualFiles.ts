"use client";

import { useState, useCallback, useRef } from "react";
import { helloWorldTemplate } from "@/lib/vfs/templates/hello-world";

export interface UseVirtualFilesReturn {
  files: Record<string, string>;
  readFile: (path: string) => string | undefined;
  writeFile: (path: string, content: string) => void;
  deleteFile: (path: string) => void;
  getAllFiles: () => Record<string, string>;
  resetFiles: (newFiles: Record<string, string>) => void;
  /** Read a file's latest content synchronously (includes writes not yet in React state) */
  getLatestFile: (path: string) => string | undefined;
}

export function useVirtualFiles(): UseVirtualFilesReturn {
  const [files, setFiles] = useState<Record<string, string>>(helloWorldTemplate);

  // Immediate ref updated synchronously in writeFile, before setFiles settles.
  // This lets consumers read the latest content without waiting for React re-render.
  const immediateFilesRef = useRef<Record<string, string>>(helloWorldTemplate);

  const readFile = useCallback(
    (path: string): string | undefined => {
      return files[path];
    },
    [files]
  );

  const writeFile = useCallback((path: string, content: string): void => {
    // Update the immediate ref synchronously so getLatestFile sees it right away
    immediateFilesRef.current = { ...immediateFilesRef.current, [path]: content };
    setFiles((prev) => ({
      ...prev,
      [path]: content,
    }));
  }, []);

  const deleteFile = useCallback((path: string): void => {
    const next = { ...immediateFilesRef.current };
    delete next[path];
    immediateFilesRef.current = next;
    setFiles((prev) => {
      const n = { ...prev };
      delete n[path];
      return n;
    });
  }, []);

  const getAllFiles = useCallback((): Record<string, string> => {
    return { ...files };
  }, [files]);

  const resetFiles = useCallback((newFiles: Record<string, string>) => {
    immediateFilesRef.current = newFiles;
    setFiles(newFiles);
  }, []);

  const getLatestFile = useCallback((path: string): string | undefined => {
    return immediateFilesRef.current[path];
  }, []);

  return {
    files,
    readFile,
    writeFile,
    deleteFile,
    getAllFiles,
    resetFiles,
    getLatestFile,
  };
}
