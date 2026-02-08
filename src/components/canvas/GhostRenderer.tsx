"use client";

import { useCallback } from "react";
import type { CanvasNode, CanvasTool, GhostElement } from "@/lib/canvas/types";
import { useCanvasStore } from "@/hooks/useCanvasStore";
import { GhostFrame } from "./GhostFrame";
import { GhostText } from "./GhostText";
import { GhostComponent } from "./GhostComponent";

interface GhostRendererProps {
  node: CanvasNode;
  /** Offset for canvas overlay positioning */
  offset: number;
  /** Canvas scale for drag correction */
  scale: number;
  /** Currently active tool */
  activeTool: CanvasTool;
  /** VFS files for design system styling */
  files: Record<string, string>;
  /** Callback when a ghost drag ends */
  onDragEnd?: (nodeId: string) => void;
  /** Callback during ghost drag for drop zone feedback */
  onDragMove?: (ghost: GhostElement) => void;
  /** Callback to change the active tool */
  onToolChange?: (tool: CanvasTool) => void;
}

/**
 * Recursively renders a node and its children.
 * Handles coordinate transformation and selection state.
 */
export function GhostRenderer({
  node,
  offset,
  scale,
  activeTool,
  files,
  onDragEnd,
  onDragMove,
  onToolChange,
}: GhostRendererProps) {
  const {
    nodes,
    selection,
    selectNode,
    toggleSelection,
    updateNode,
    removeNode,
    getChildren,
    getWorldPosition,
  } = useCanvasStore();

  // Get parent node dimensions for "Fill" mode calculations
  const parentNode = node.parentId ? nodes.get(node.parentId) : null;
  const parentLayout = parentNode?.layout;
  const parentPadding = parentLayout?.padding || 0;
  // Calculate available space inside parent (accounting for padding)
  const parentInnerWidth = parentNode ? parentNode.width - (parentPadding * 2) : undefined;
  const parentInnerHeight = parentNode ? parentNode.height - (parentPadding * 2) : undefined;

  // Get world position for this node
  const worldPos = getWorldPosition(node.id);

  // Selection state
  const isSelected = selection.selectedIds.has(node.id);
  const isPrimary = selection.primaryId === node.id;

  // Get children for recursive rendering
  const children = getChildren(node.id);

  // Create ghost object with offset coordinates for rendering
  const offsetGhost: GhostElement = {
    ...node,
    x: worldPos.x + offset,
    y: worldPos.y + offset,
  };

  // Handle selection with support for Shift+click
  const handleSelect = useCallback(
    (e?: React.MouseEvent | React.PointerEvent) => {
      if (e && (e.shiftKey || e.metaKey || e.ctrlKey)) {
        toggleSelection(node.id);
      } else {
        selectNode(node.id);
      }
    },
    [node.id, selectNode, toggleSelection]
  );

  // Handle updates - convert back from offset coordinates
  const handleUpdate = useCallback(
    (updates: Partial<CanvasNode>) => {
      const realUpdates = { ...updates };
      if (updates.x !== undefined) realUpdates.x = updates.x - offset;
      if (updates.y !== undefined) realUpdates.y = updates.y - offset;
      updateNode(node.id, realUpdates);
    },
    [node.id, offset, updateNode]
  );

  // Handle remove
  const handleRemove = useCallback(() => {
    removeNode(node.id);
  }, [node.id, removeNode]);

  // Handle drag end
  const handleDragEnd = useCallback(() => {
    onDragEnd?.(node.id);
  }, [node.id, onDragEnd]);

  // Handle drag move (convert back from offset)
  const handleDragMove = useCallback(
    (ghost: GhostElement) => {
      onDragMove?.({
        ...ghost,
        x: ghost.x - offset,
        y: ghost.y - offset,
      });
    },
    [offset, onDragMove]
  );

  // Render node based on type
  const renderNode = () => {
    switch (node.type) {
      case "frame":
        return (
          <GhostFrame
            ghost={offsetGhost}
            isSelected={isSelected}
            isPrimary={isPrimary}
            onSelect={handleSelect}
            onUpdate={handleUpdate}
            onRemove={handleRemove}
            onDragEnd={handleDragEnd}
            onDragMove={handleDragMove}
            scale={scale}
            activeTool={activeTool}
            layout={node.layout}
            nodeStyle={node.style}
            isGroup={children.length > 0}
          />
        );
      case "text":
        return (
          <GhostText
            ghost={offsetGhost}
            isSelected={isSelected}
            isPrimary={isPrimary}
            onSelect={handleSelect}
            onUpdate={handleUpdate}
            onRemove={handleRemove}
            onDragEnd={handleDragEnd}
            onDragMove={handleDragMove}
            scale={scale}
            activeTool={activeTool}
            hasParent={!!node.parentId}
            layout={node.layout}
            onToolChange={onToolChange}
            parentWidth={parentInnerWidth}
            parentHeight={parentInnerHeight}
          />
        );
      case "component":
        return (
          <GhostComponent
            ghost={offsetGhost}
            isSelected={isSelected}
            isPrimary={isPrimary}
            onSelect={handleSelect}
            onUpdate={handleUpdate}
            onRemove={handleRemove}
            onDragEnd={handleDragEnd}
            onDragMove={handleDragMove}
            scale={scale}
            activeTool={activeTool}
            files={files}
            hasParent={!!node.parentId}
          />
        );
      default:
        return null;
    }
  };

  // For groups (nodes with children), render children inside
  if (children.length > 0) {
    // Groups are rendered as frame containers with children inside
    return (
      <>
        {/* Render the group itself */}
        {renderNode()}
        {/* Render children recursively - children use relative coords already */}
        {children.map((child) => (
          <GhostRenderer
            key={child.id}
            node={child}
            offset={offset}
            scale={scale}
            activeTool={activeTool}
            files={files}
            onDragEnd={onDragEnd}
            onDragMove={onDragMove}
            onToolChange={onToolChange}
          />
        ))}
      </>
    );
  }

  // Leaf node (no children)
  return renderNode();
}

interface GhostTreeRendererProps {
  /** Offset for canvas overlay positioning */
  offset: number;
  /** Canvas scale for drag correction */
  scale: number;
  /** Currently active tool */
  activeTool: CanvasTool;
  /** VFS files for design system styling */
  files: Record<string, string>;
  /** Callback when a ghost drag ends */
  onDragEnd?: (nodeId: string) => void;
  /** Callback during ghost drag for drop zone feedback */
  onDragMove?: (ghost: GhostElement) => void;
  /** Callback to change the active tool */
  onToolChange?: (tool: CanvasTool) => void;
}

/**
 * Renders all root nodes and their children recursively.
 * This is the top-level component used by CanvasOverlay.
 */
export function GhostTreeRenderer({
  offset,
  scale,
  activeTool,
  files,
  onDragEnd,
  onDragMove,
  onToolChange,
}: GhostTreeRendererProps) {
  const rootIds = useCanvasStore((state) => state.rootIds);
  const nodes = useCanvasStore((state) => state.nodes);

  return (
    <>
      {rootIds.map((id) => {
        const node = nodes.get(id);
        if (!node) return null;

        return (
          <GhostRenderer
            key={id}
            node={node}
            offset={offset}
            scale={scale}
            activeTool={activeTool}
            files={files}
            onDragEnd={onDragEnd}
            onDragMove={onDragMove}
            onToolChange={onToolChange}
          />
        );
      })}
    </>
  );
}
