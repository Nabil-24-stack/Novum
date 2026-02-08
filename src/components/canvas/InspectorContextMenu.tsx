"use client";

import { useEffect, useRef } from "react";
import { MessageSquarePlus } from "lucide-react";
import { useChatContextStore } from "@/hooks/useChatContextStore";

interface InspectorContextMenuProps {
  onAddToChat: () => void;
}

export function InspectorContextMenu({ onAddToChat }: InspectorContextMenuProps) {
  const { contextMenu, hideContextMenu, pinElement } = useChatContextStore();
  const menuRef = useRef<HTMLDivElement>(null);

  // Dismiss on click outside, Escape, or scroll
  useEffect(() => {
    if (!contextMenu.visible) return;

    // Delay adding listeners by one frame to avoid the contextmenu event itself dismissing the menu
    const rafId = requestAnimationFrame(() => {
      const handleClickOutside = (e: MouseEvent) => {
        if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
          hideContextMenu();
        }
      };

      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === "Escape") {
          hideContextMenu();
        }
      };

      const handleScroll = () => {
        hideContextMenu();
      };

      document.addEventListener("mousedown", handleClickOutside, true);
      document.addEventListener("keydown", handleKeyDown, true);
      document.addEventListener("scroll", handleScroll, true);

      // Store cleanup ref
      cleanupRef.current = () => {
        document.removeEventListener("mousedown", handleClickOutside, true);
        document.removeEventListener("keydown", handleKeyDown, true);
        document.removeEventListener("scroll", handleScroll, true);
      };
    });

    return () => {
      cancelAnimationFrame(rafId);
      cleanupRef.current?.();
      cleanupRef.current = null;
    };
  }, [contextMenu.visible, hideContextMenu]);

  const cleanupRef = useRef<(() => void) | null>(null);

  // Viewport-edge clamping
  const menuWidth = 200;
  const menuHeight = 40;
  let x = contextMenu.x;
  let y = contextMenu.y;

  if (typeof window !== "undefined") {
    if (x + menuWidth > window.innerWidth) {
      x = window.innerWidth - menuWidth - 8;
    }
    if (y + menuHeight > window.innerHeight) {
      y = window.innerHeight - menuHeight - 8;
    }
  }

  if (!contextMenu.visible || !contextMenu.element) return null;

  const handleAddToChat = () => {
    if (contextMenu.element) {
      pinElement(contextMenu.element);
      onAddToChat();
    }
    hideContextMenu();
  };

  return (
    <div
      ref={menuRef}
      className="fixed z-[99999] bg-white rounded-lg shadow-lg border border-neutral-200 py-1 min-w-[180px]"
      style={{ left: x, top: y }}
    >
      <button
        onClick={handleAddToChat}
        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-100 transition-colors"
      >
        <MessageSquarePlus className="w-4 h-4 text-blue-600" />
        Add to AI Chat
      </button>
    </div>
  );
}
