"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { DOMTreeNode, InspectionMessage } from "@/lib/inspection/types";

export interface UseLayersOptions {
  inspectionMode: boolean;
  onElementSelected?: (selector: string) => void;
}

export interface UseLayersReturn {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  domTree: DOMTreeNode | null;
  expandedNodes: Set<string>;
  toggleExpanded: (nodeId: string) => void;
  expandAll: () => void;
  collapseAll: () => void;
  hoveredNodeId: string | null;
  setHoveredNodeId: (nodeId: string | null) => void;
  requestDOMTree: () => void;
  highlightElement: (selector: string) => void;
  clearHighlight: () => void;
  selectElement: (selector: string) => void;
}

export function useLayers(options: UseLayersOptions): UseLayersReturn {
  const { inspectionMode, onElementSelected } = options;
  const [isOpenInternal, setIsOpenInternal] = useState(false);
  const [domTree, setDomTree] = useState<DOMTreeNode | null>(null);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const pendingSelectRef = useRef<string | null>(null);

  // Derive actual isOpen state - panel is closed when inspection mode is off
  const isOpen = inspectionMode && isOpenInternal;

  // Wrapper for setIsOpen that updates internal state
  const setIsOpen = useCallback((open: boolean) => {
    setIsOpenInternal(open);
  }, []);

  // Get all Sandpack iframes
  const getIframes = useCallback(() => {
    return document.querySelectorAll<HTMLIFrameElement>(
      'iframe[title="Sandpack Preview"]'
    );
  }, []);

  // Send message to all iframes
  const broadcastMessage = useCallback(
    (message: InspectionMessage) => {
      const iframes = getIframes();
      iframes.forEach((iframe) => {
        try {
          iframe.contentWindow?.postMessage(message, "*");
        } catch (err) {
          console.warn("Failed to send message to iframe:", err);
        }
      });
    },
    [getIframes]
  );

  // Request DOM tree from iframe
  const requestDOMTree = useCallback(() => {
    broadcastMessage({ type: "novum:request-dom-tree" });
  }, [broadcastMessage]);

  // Highlight element by selector
  const highlightElement = useCallback(
    (selector: string) => {
      broadcastMessage({
        type: "novum:highlight-element",
        payload: { selector },
      });
    },
    [broadcastMessage]
  );

  // Clear highlight
  const clearHighlight = useCallback(() => {
    broadcastMessage({ type: "novum:clear-highlight" });
  }, [broadcastMessage]);

  // Select element (triggers click in iframe)
  const selectElement = useCallback(
    (selector: string) => {
      // Store the selector for after we get the element info
      pendingSelectRef.current = selector;

      // First highlight the element, then we'll need to simulate a click
      // For now, we'll trigger the selection through postMessage
      const iframes = getIframes();
      iframes.forEach((iframe) => {
        try {
          // We need to send a message that will trigger the element selection
          // The iframe script will respond with novum:element-selected
          iframe.contentWindow?.postMessage(
            {
              type: "novum:select-element",
              payload: { selector },
            },
            "*"
          );
        } catch (err) {
          console.warn("Failed to select element in iframe:", err);
        }
      });

      // Also call the callback
      onElementSelected?.(selector);
    },
    [getIframes, onElementSelected]
  );

  // Toggle expanded state for a node
  const toggleExpanded = useCallback((nodeId: string) => {
    setExpandedNodes((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  }, []);

  // Expand all nodes
  const expandAll = useCallback(() => {
    if (domTree) {
      // Collect all node IDs from tree
      const collectNodeIds = (node: DOMTreeNode, ids: string[] = []): string[] => {
        ids.push(node.nodeId);
        node.children.forEach((child) => collectNodeIds(child, ids));
        return ids;
      };
      const allIds = collectNodeIds(domTree);
      setExpandedNodes(new Set(allIds));
    }
  }, [domTree]);

  // Collapse all nodes
  const collapseAll = useCallback(() => {
    setExpandedNodes(new Set());
  }, []);

  // Auto-expand first 2 levels when DOM tree loads
  const autoExpandFirstLevels = useCallback((tree: DOMTreeNode) => {
    const idsToExpand: string[] = [];

    const traverse = (node: DOMTreeNode, depth: number) => {
      if (depth < 2) {
        idsToExpand.push(node.nodeId);
        node.children.forEach((child) => traverse(child, depth + 1));
      }
    };

    traverse(tree, 0);
    setExpandedNodes(new Set(idsToExpand));
  }, []);

  // Listen for DOM tree response
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const data = event.data as InspectionMessage;

      if (data?.type === "novum:dom-tree-response" && data.payload) {
        const tree = data.payload as DOMTreeNode;
        setDomTree(tree);
        autoExpandFirstLevels(tree);
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [autoExpandFirstLevels]);

  // Request DOM tree when panel opens
  useEffect(() => {
    if (isOpen) {
      requestDOMTree();
    }
  }, [isOpen, requestDOMTree]);

  return {
    isOpen,
    setIsOpen,
    domTree,
    expandedNodes,
    toggleExpanded,
    expandAll,
    collapseAll,
    hoveredNodeId,
    setHoveredNodeId,
    requestDOMTree,
    highlightElement,
    clearHighlight,
    selectElement,
  };
}
