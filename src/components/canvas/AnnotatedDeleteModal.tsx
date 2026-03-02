"use client";

import { AlertTriangle, X } from "lucide-react";
import type { DecisionConnection } from "@/lib/product-brain/types";

export interface AnnotatedDeleteInfo {
  tagName: string;
  previewText?: string;
  connections: DecisionConnection[];
  onConfirm: () => void;
}

interface AnnotatedDeleteModalProps {
  info: AnnotatedDeleteInfo;
  onClose: () => void;
  manifestoJtbd?: string[];
}

export function AnnotatedDeleteModal({ info, onClose, manifestoJtbd }: AnnotatedDeleteModalProps) {
  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-white rounded-lg shadow-xl w-[420px] max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-200">
          <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />
          <h3 className="text-sm font-semibold text-gray-900">Delete Annotated Element</h3>
          <button onClick={onClose} className="ml-auto text-gray-400 hover:text-gray-600">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-4 py-3 space-y-3">
          <p className="text-sm text-gray-600">
            <span className="font-mono text-xs bg-gray-100 px-1 py-0.5 rounded">&lt;{info.tagName}&gt;</span>
            {info.previewText && (
              <span className="ml-1 text-gray-500 truncate">— &quot;{info.previewText.slice(0, 60)}{info.previewText.length > 60 ? "..." : ""}&quot;</span>
            )}
          </p>
          <p className="text-xs text-gray-500">
            This element has {info.connections.length} strategy annotation{info.connections.length > 1 ? "s" : ""} linked to it. Deleting it will remove these connections from the product brain.
          </p>

          {/* Connection details */}
          <div className="space-y-2">
            {info.connections.map((conn) => (
              <div key={conn.id} className="bg-gray-50 rounded p-2.5 text-xs space-y-1">
                <div className="font-medium text-gray-800">{conn.componentDescription}</div>
                <div className="text-gray-500">
                  <span className="font-medium">Personas:</span> {conn.personaNames.join(", ")}
                </div>
                {conn.jtbdIndices.length > 0 && (
                  <div className="text-gray-500">
                    <span className="font-medium">JTBDs:</span>{" "}
                    {conn.jtbdIndices.map((i) =>
                      manifestoJtbd?.[i] ? `"${manifestoJtbd[i]}"` : `#${i + 1}`
                    ).join("; ")}
                  </div>
                )}
                {conn.rationale && (
                  <div className="text-gray-400 italic">{conn.rationale}</div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-4 py-3 border-t border-gray-200">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={() => {
              info.onConfirm();
              onClose();
            }}
            className="px-3 py-1.5 text-xs font-medium text-white bg-red-600 rounded hover:bg-red-700"
          >
            Delete Anyway
          </button>
        </div>
      </div>
    </div>
  );
}
