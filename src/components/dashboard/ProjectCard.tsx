"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import type { ProjectMeta } from "@/hooks/useProjects";

function timeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

interface ProjectCardProps {
  project: ProjectMeta;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
}

export function ProjectCard({ project, onRename, onDelete }: ProjectCardProps) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(project.name);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isRenaming) inputRef.current?.select();
  }, [isRenaming]);

  useEffect(() => {
    if (!menuOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
        setConfirmDelete(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [menuOpen]);

  const handleRenameSubmit = () => {
    const trimmed = renameValue.trim();
    if (trimmed && trimmed !== project.name) {
      onRename(project.id, trimmed);
    }
    setIsRenaming(false);
  };

  return (
    <div
      className="group relative bg-white rounded-lg border border-neutral-200 hover:border-neutral-300 hover:shadow-md transition-all cursor-pointer overflow-hidden"
      onClick={() => !isRenaming && router.push(`/project/${project.id}`)}
    >
      {/* Color swatch */}
      <div
        className="h-32 w-full"
        style={{ backgroundColor: project.brand_color || "#6366f1" }}
      />

      {/* Info */}
      <div className="p-3">
        {isRenaming ? (
          <input
            ref={inputRef}
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onBlur={handleRenameSubmit}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleRenameSubmit();
              if (e.key === "Escape") setIsRenaming(false);
            }}
            onClick={(e) => e.stopPropagation()}
            className="w-full text-sm font-medium text-neutral-900 bg-transparent border-b border-blue-500 outline-none px-0 py-0.5"
          />
        ) : (
          <p className="text-sm font-medium text-neutral-900 truncate">{project.name}</p>
        )}
        <p className="text-xs text-neutral-500 mt-1">
          {timeAgo(project.updated_at)}
        </p>
      </div>

      {/* Menu button */}
      <div className="absolute top-2 right-2" ref={menuRef}>
        <button
          onClick={(e) => {
            e.stopPropagation();
            setMenuOpen(!menuOpen);
            setConfirmDelete(false);
          }}
          className="opacity-0 group-hover:opacity-100 p-1.5 bg-white/80 backdrop-blur-sm rounded-md hover:bg-white transition-all shadow-sm"
        >
          <MoreHorizontal className="w-4 h-4 text-neutral-600" />
        </button>

        {menuOpen && (
          <div className="absolute right-0 top-full mt-1 w-36 bg-white rounded-md shadow-lg border border-neutral-200 py-1 z-50">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpen(false);
                setIsRenaming(true);
                setRenameValue(project.name);
              }}
              className="flex items-center gap-2 w-full px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-50"
            >
              <Pencil className="w-3.5 h-3.5" />
              Rename
            </button>
            {confirmDelete ? (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(project.id);
                  setMenuOpen(false);
                }}
                className="flex items-center gap-2 w-full px-3 py-1.5 text-sm text-red-600 hover:bg-red-50"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Confirm delete
              </button>
            ) : (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setConfirmDelete(true);
                }}
                className="flex items-center gap-2 w-full px-3 py-1.5 text-sm text-red-600 hover:bg-red-50"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Delete
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
