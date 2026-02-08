"use client";

import { memo, useCallback } from "react";
import {
  X,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  Box,
  Type,
  Image as ImageIcon,
  Link,
  List,
  FormInput,
  LayoutGrid,
  Heading,
  FileText,
} from "lucide-react";
import type { DOMTreeNode } from "@/lib/inspection/types";
import { useChatContextStore, type PinnedElement } from "@/hooks/useChatContextStore";

interface LayersPanelProps {
  isOpen: boolean;
  onClose: () => void;
  domTree: DOMTreeNode | null;
  expandedNodes: Set<string>;
  onToggleExpanded: (node: DOMTreeNode) => void;
  onExpandAll: () => void;
  onCollapseAll: () => void;
  onRefresh: () => void;
  hoveredNodeId: string | null;
  onHoverNode: (nodeId: string | null, selector?: string) => void;
  onSelectNode: (selector: string) => void;
  selectedSelector?: string;
  frameHeight?: number;
}

// Get icon based on tag name
function getTagIcon(tagName: string) {
  const iconClass = "w-3 h-3";

  switch (tagName) {
    case "h1":
    case "h2":
    case "h3":
    case "h4":
    case "h5":
    case "h6":
      return <Heading className={iconClass} />;
    case "p":
    case "span":
    case "label":
      return <Type className={iconClass} />;
    case "img":
      return <ImageIcon className={iconClass} />;
    case "a":
      return <Link className={iconClass} />;
    case "ul":
    case "ol":
    case "li":
      return <List className={iconClass} />;
    case "input":
    case "textarea":
    case "select":
    case "button":
      return <FormInput className={iconClass} />;
    case "table":
    case "thead":
    case "tbody":
    case "tr":
    case "td":
    case "th":
      return <LayoutGrid className={iconClass} />;
    case "article":
    case "section":
    case "main":
    case "aside":
    case "nav":
    case "header":
    case "footer":
      return <FileText className={iconClass} />;
    default:
      return <Box className={iconClass} />;
  }
}

// Get display name for a node
function getDisplayName(node: DOMTreeNode): string {
  if (node.id) {
    return `#${node.id}`;
  }
  if (node.className) {
    const firstClass = node.className.split(/\s+/)[0];
    if (firstClass) {
      return `.${firstClass}`;
    }
  }
  if (node.textPreview) {
    return `"${node.textPreview}"`;
  }
  return node.tagName;
}

interface TreeNodeProps {
  node: DOMTreeNode;
  expandedNodes: Set<string>;
  onToggleExpanded: (node: DOMTreeNode) => void;
  hoveredNodeId: string | null;
  onHoverNode: (nodeId: string | null, selector?: string) => void;
  onSelectNode: (selector: string) => void;
  selectedSelector?: string;
}

const TreeNode = memo(function TreeNode({
  node,
  expandedNodes,
  onToggleExpanded,
  hoveredNodeId,
  onHoverNode,
  onSelectNode,
  selectedSelector,
}: TreeNodeProps) {
  // Use source-based key for expansion state (stable across refreshes)
  const nodeKey = node.source
    ? `${node.source.fileName}:${node.source.line}:${node.source.column}`
    : node.selector;
  const isExpanded = expandedNodes.has(nodeKey);
  const isHovered = hoveredNodeId === node.nodeId;
  const isSelected = selectedSelector === node.selector;

  const handleMouseEnter = useCallback(() => {
    onHoverNode(node.nodeId, node.selector);
  }, [onHoverNode, node.nodeId, node.selector]);

  const handleMouseLeave = useCallback(() => {
    onHoverNode(null);
  }, [onHoverNode]);

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onSelectNode(node.selector);
    },
    [onSelectNode, node.selector]
  );

  const handleToggle = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onToggleExpanded(node);
    },
    [onToggleExpanded, node]
  );

  // Right-click to show "Add to AI Chat" context menu
  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();

      // Only show context menu if node has source location (AST-instrumented)
      if (!node.source) return;

      // Build display label: "<tagName.firstClass>" or "<tagName>"
      const firstClass = node.className ? node.className.split(/\s+/)[0] : "";
      const displayLabel = firstClass
        ? `<${node.tagName}.${firstClass}>`
        : `<${node.tagName}>`;

      const pinnedElement: PinnedElement = {
        id: `${node.source.fileName}:${node.source.line}:${node.source.column}`,
        tagName: node.tagName,
        displayLabel,
        source: node.source,
        className: node.className || undefined,
        textContent: node.textPreview,
      };

      useChatContextStore.getState().showContextMenu(e.clientX, e.clientY, pinnedElement);
    },
    [node]
  );

  return (
    <div>
      <div
        data-layer-selector={node.selector}
        className={`flex items-center gap-1 py-0.5 px-1 rounded cursor-pointer text-sm transition-colors ${
          isSelected
            ? "bg-blue-100 text-blue-800"
            : isHovered
            ? "bg-neutral-100"
            : "hover:bg-neutral-50"
        }`}
        style={{ paddingLeft: `${node.depth * 12 + 4}px` }}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
      >
        {/* Expand/collapse toggle */}
        {node.hasChildren ? (
          <button
            onClick={handleToggle}
            className="p-0.5 hover:bg-neutral-200 rounded -ml-0.5"
          >
            {isExpanded ? (
              <ChevronDown className="w-3 h-3 text-neutral-500" />
            ) : (
              <ChevronRight className="w-3 h-3 text-neutral-500" />
            )}
          </button>
        ) : (
          <span className="w-4" /> // Spacer for alignment
        )}

        {/* Tag icon */}
        <span className="text-neutral-400 shrink-0">
          {getTagIcon(node.tagName)}
        </span>

        {/* Tag name */}
        <span className="text-purple-600 font-mono">{node.tagName}</span>

        {/* Display name (id, class, or text preview) */}
        <span className="text-neutral-500 truncate" title={getDisplayName(node)}>
          {getDisplayName(node) !== node.tagName && getDisplayName(node)}
        </span>
      </div>

      {/* Children */}
      {isExpanded && node.hasChildren && (
        <div>
          {node.children.map((child) => (
            <TreeNode
              key={child.nodeId}
              node={child}
              expandedNodes={expandedNodes}
              onToggleExpanded={onToggleExpanded}
              hoveredNodeId={hoveredNodeId}
              onHoverNode={onHoverNode}
              onSelectNode={onSelectNode}
              selectedSelector={selectedSelector}
            />
          ))}
        </div>
      )}
    </div>
  );
});

const PANEL_WIDTH = 224; // 14rem = 224px
const PANEL_GAP = 8; // Gap between frame and panel

export function LayersPanel({
  isOpen,
  onClose,
  domTree,
  expandedNodes,
  onToggleExpanded,
  onExpandAll,
  onCollapseAll,
  onRefresh,
  hoveredNodeId,
  onHoverNode,
  onSelectNode,
  selectedSelector,
  frameHeight = 400,
}: LayersPanelProps) {
  if (!isOpen) return null;

  return (
    <div
      className="absolute bg-white rounded-lg shadow-lg border border-neutral-200 flex flex-col overflow-hidden z-10"
      style={{
        left: `calc(100% + ${PANEL_GAP}px)`,
        top: 0,
        width: PANEL_WIDTH,
        height: frameHeight + 36, // Add header height (36px) to match frame total height
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-neutral-200 bg-neutral-50 shrink-0">
        <span className="text-base font-medium text-neutral-700">Layers</span>
        <div className="flex items-center gap-1">
          <button
            onClick={onRefresh}
            className="p-1 hover:bg-neutral-200 rounded text-neutral-500 hover:text-neutral-700 transition-colors"
            title="Refresh tree"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onExpandAll}
            className="p-1 hover:bg-neutral-200 rounded text-neutral-500 hover:text-neutral-700 transition-colors"
            title="Expand all"
          >
            <ChevronsUpDown className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onCollapseAll}
            className="p-1 hover:bg-neutral-200 rounded text-neutral-500 hover:text-neutral-700 transition-colors"
            title="Collapse all"
          >
            <ChevronsDownUp className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onClose}
            className="p-1 hover:bg-neutral-200 rounded text-neutral-500 hover:text-neutral-700 transition-colors"
            title="Close"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Tree content */}
      <div className="flex-1 overflow-auto p-1">
        {domTree ? (
          <TreeNode
            node={domTree}
            expandedNodes={expandedNodes}
            onToggleExpanded={onToggleExpanded}
            hoveredNodeId={hoveredNodeId}
            onHoverNode={onHoverNode}
            onSelectNode={onSelectNode}
            selectedSelector={selectedSelector}
          />
        ) : (
          <div className="flex items-center justify-center h-20 text-sm text-neutral-400">
            Loading...
          </div>
        )}
      </div>
    </div>
  );
}
