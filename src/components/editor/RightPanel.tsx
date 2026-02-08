"use client";

import { useState, useCallback, useMemo, useEffect, useRef, Component, type ReactNode } from "react";
import { PanelRightClose, PanelRight, MessageSquare, Palette, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { ChatTab } from "./ChatTab";
import { PropertiesTab } from "./PropertiesTab";
import { GroupPropertiesTab } from "./GroupPropertiesTab";
import { useWriter } from "@/hooks/useWriter";
import { useCanvasStore } from "@/hooks/useCanvasStore";
import { useDraftEditor, type DraftState } from "@/hooks/useDraftEditor";
import { useKeyboardMove } from "@/hooks/useKeyboardMove";
import { useKeyboardDelete } from "@/hooks/useKeyboardDelete";
import { useMouseMove } from "@/hooks/useMouseMove";
import type { SelectedElement, OptimisticMovePayload, SourceLocation } from "@/lib/inspection/types";

// Error boundary to catch PropertiesTab rendering errors
interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class PropertiesTabErrorBoundary extends Component<
  { children: ReactNode; onReset?: () => void },
  ErrorBoundaryState
> {
  constructor(props: { children: ReactNode; onReset?: () => void }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("[PropertiesTab Error]:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center h-full text-center p-8">
          <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mb-4">
            <AlertCircle className="w-6 h-6 text-red-500" />
          </div>
          <p className="text-neutral-600 font-medium text-base">Properties panel error</p>
          <p className="text-neutral-400 text-sm mt-2 mb-4">
            {this.state.error?.message || "An unexpected error occurred"}
          </p>
          <button
            onClick={() => {
              this.setState({ hasError: false, error: null });
              this.props.onReset?.();
            }}
            className="px-3 py-1.5 text-sm font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-md transition-colors"
          >
            Try Again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

type TabType = "chat" | "design";

interface RightPanelProps {
  writeFile: (path: string, content: string) => void;
  files: Record<string, string>;
  selectedElement: SelectedElement | null;
  inspectionMode: boolean;
  className?: string;
  /** Controls the active tab externally */
  activeTab?: TabType;
  /** Called when user manually switches tabs */
  onTabChange?: (tab: TabType) => void;
  /** Called when keyboard reordering updates the element's source location */
  onSelectedElementSourceUpdate?: (source: SourceLocation) => void;
  /** Called when keyboard delete removes the selected element */
  onClearSelection?: () => void;
}

export function RightPanel({
  writeFile,
  files,
  selectedElement,
  inspectionMode,
  className,
  activeTab: controlledActiveTab,
  onTabChange,
  onSelectedElementSourceUpdate,
  onClearSelection,
}: RightPanelProps) {
  const [isOpen, setIsOpen] = useState(true);
  const [internalActiveTab, setInternalActiveTab] = useState<TabType>("chat");

  // Track the "working className" and "working textContent" - these are the values as we've
  // modified them locally, which may differ from selectedElement until the iframe re-reports.
  // This prevents the element from becoming "read-only" after an edit.
  const [workingClassName, setWorkingClassName] = useState<string | null>(null);
  const [workingTextContent, setWorkingTextContent] = useState<string | null>(null);
  const lastInspectionMode = useRef<boolean>(inspectionMode);

  // Track the "committed" className - the anchor we know exists in VFS after a draft commits.
  // This persists after draft clears, until element is reselected.
  // Solves the race condition where draft clears before iframe syncs the new className.
  // Uses sourceId (from data-source-loc) as stable identity since selector includes className which changes.
  const [lastCommittedClassName, setLastCommittedClassName] = useState<{
    sourceId: string;
    className: string;
  } | null>(null);

  // Track previous draft state to detect when a draft commits
  const prevDraftRef = useRef<DraftState | null>(null);

  // Use controlled tab if provided, otherwise use internal state
  const activeTab = controlledActiveTab ?? internalActiveTab;

  // Initialize the writer hook for VFS class updates
  const writer = useWriter({ files, writeFile });

  // Check for canvas group selection
  const canvasSelection = useCanvasStore((state) => state.selection);
  const canvasNodes = useCanvasStore((state) => state.nodes);
  const selectedCanvasNode = canvasSelection.primaryId
    ? canvasNodes.get(canvasSelection.primaryId)
    : null;
  // Show group properties if a canvas node is selected (regardless of children)
  const showCanvasProperties = selectedCanvasNode !== null && selectedCanvasNode !== undefined;

  // Initialize the draft editor for optimistic UI updates (no debounce - commit on exit)
  const draftEditor = useDraftEditor({
    files,
    writeFile,
    onError: (message) => toast.error(message),
  });

  // Helper: Get stable element identity from source location (doesn't change when className changes)
  // Falls back to selector for elements without source instrumentation
  const getElementId = useCallback((element: SelectedElement | null): string | null => {
    if (!element) return null;
    if (element.selectionId) {
      return element.selectionId;
    }
    if (element.source) {
      return `${element.source.fileName}:${element.source.line}:${element.source.column}`;
    }
    return element.selector ?? null;
  }, []);

  const currentElementId = getElementId(selectedElement);

  // Track previous element ID for change detection
  const lastSelectedElementId = useRef<string | null>(null);

  // Trigger 1: Commit on selection change
  useEffect(() => {
    if (currentElementId !== lastSelectedElementId.current) {
      // Flush any pending draft changes for the PREVIOUS element before switching
      if (lastSelectedElementId.current !== null) {
        draftEditor.flush();
      }

      // Element changed - reset the committed anchor
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Syncing state on prop change
      setLastCommittedClassName(null);

      lastSelectedElementId.current = currentElementId;
       
      setWorkingClassName(null);
       
      setWorkingTextContent(null);
    }
  }, [currentElementId, draftEditor]);

  // Track when draft commits successfully to preserve the anchor className
  useEffect(() => {
    const prevDraft = prevDraftRef.current;
    const currentDraft = draftEditor.draft;

    // Draft was cleared (went from something to null)
    // Use currentElementId (source-based) for stable comparison
    if (prevDraft && !currentDraft && currentElementId) {
      // Draft just committed - save the NEW className as our anchor
      // This is the className we know exists in VFS because we just wrote it
      setLastCommittedClassName({
        sourceId: currentElementId,
        className: prevDraft.draftClassName,
      });
    }

    prevDraftRef.current = currentDraft;
  }, [draftEditor.draft, currentElementId]);

  // Trigger 2: Commit when inspection mode is turned off
  useEffect(() => {
    const wasInspecting = lastInspectionMode.current;
    const isInspecting = inspectionMode;

    if (wasInspecting && !isInspecting) {
      // Inspection mode turned off - flush pending changes
      draftEditor.flush();
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Cleanup on mode change
      setWorkingClassName(null);
       
      setWorkingTextContent(null);
    }

    lastInspectionMode.current = isInspecting;
  }, [inspectionMode, draftEditor]);

  // Handler for manual tab switches
  const handleTabChange = (tab: TabType) => {
    if (onTabChange) {
      onTabChange(tab);
    } else {
      setInternalActiveTab(tab);
    }
  };

  // The effective className is the working className if set, otherwise the selected element's className
  // This is what we DISPLAY in the UI
  const effectiveClassName = workingClassName ?? selectedElement?.className ?? null;

  // The effective text content
  const effectiveTextContent = workingTextContent ?? selectedElement?.textContent ?? null;

  // The validation className is what we use to check editability.
  // When drafting, use the ORIGINAL className (which still exists in VFS).
  // This prevents the UI from locking while the user is editing.
  const validationClassName = useMemo(() => {
    // 1. If we have an active draft, use its original className
    if (
      draftEditor.draft &&
      currentElementId &&
      ((draftEditor.draft.selectionId && draftEditor.draft.selectionId === currentElementId) ||
        (!draftEditor.draft.selectionId && draftEditor.draft.selector === selectedElement?.selector))
    ) {
      return draftEditor.draft.originalClassName;
    }

    // 2. If draft just committed but iframe hasn't synced yet, use the NEW className
    //    (which we know exists in VFS because we just wrote it)
    //    Use source-based ID for stable comparison (selector changes when className changes)
    if (
      lastCommittedClassName &&
      lastCommittedClassName.sourceId === currentElementId
    ) {
      return lastCommittedClassName.className;
    }

    // 3. Fallback to selectedElement's className
    return selectedElement?.className ?? null;
  }, [draftEditor.draft, selectedElement?.selector, selectedElement?.className, lastCommittedClassName, currentElementId]);

  const classCapability = useMemo(
    () => writer.getClassEditCapability(validationClassName, selectedElement?.source),
    [writer, validationClassName, selectedElement?.source]
  );

  // Check editability using the VALIDATION className (the anchor in VFS)
  const editability = useMemo(() => {
    return {
      isEditable: classCapability.mode === "FULL_EDIT",
      file: classCapability.file,
      reason: classCapability.reason,
    };
  }, [classCapability]);

  // Check editability of text content (use validation className for consistency)
  const textEditability = useMemo(() => {
    if (!effectiveTextContent || !selectedElement?.isTextElement) {
      return { isEditable: false, reason: "Not a text element" };
    }
    return writer.checkTextEditability(effectiveTextContent, validationClassName || "");
  }, [effectiveTextContent, validationClassName, selectedElement?.isTextElement, writer]);

  // Get component props when an element is selected with a source location
  const componentProps = useMemo(() => {
    const source = selectedElement?.instanceSource ?? selectedElement?.source;
    if (!source) {
      return null;
    }
    const result = writer.getComponentProps(source);
    if (result.success && result.props) {
      return result.props;
    }
    return null;
  }, [selectedElement, writer]);

  // Handler for class updates from PropertiesTab
  // Uses optimistic UI via draftEditor - instant visual feedback, debounced VFS write
  const handleClassUpdate = useCallback(
    (selector: string, originalClassName: string, newClassName: string) => {
      const effectiveSelector = selectedElement?.preciseSelector || selector;
      // Use draft editor for optimistic updates with source location
      draftEditor.updateClasses(
        effectiveSelector,
        originalClassName,
        newClassName,
        selectedElement?.source,
        selectedElement?.selectionId
      );

      // Update working className immediately for editability checks
      setWorkingClassName(newClassName);
    },
    [draftEditor, selectedElement?.source, selectedElement?.preciseSelector, selectedElement?.selectionId]
  );

  // Handler for text updates from PropertiesTab (non-optimistic, immediate VFS write)
  const handleTextUpdate = useCallback(
    (originalText: string, newText: string) => {
      const result = writer.updateElementText(
        originalText,
        newText,
        effectiveClassName || "",
        selectedElement?.source
      );

      if (result.success && result.file) {
        // Update succeeded - update the working text content
        setWorkingTextContent(newText);
      }
    },
    [writer, effectiveClassName, selectedElement?.source]
  );

  // Handler for optimistic text updates from PropertiesTab (instant DOM, debounced VFS)
  // Note: We do NOT update workingTextContent here - that would trigger editability recomputation
  // which would fail since the new text isn't in VFS yet. The textarea uses its own local state,
  // and workingTextContent only updates after successful VFS commit.
  const handleOptimisticTextUpdate = useCallback(
    (newText: string) => {
      const selector = selectedElement?.preciseSelector || selectedElement?.selector;
      if (!selector) return;

      const originalText = selectedElement.textContent || "";
      draftEditor.updateText(
        selector,
        originalText,
        newText,
        selectedElement.source,
        selectedElement.selectionId
      );
    },
    [selectedElement, draftEditor]
  );

  // Handler for prop updates from PropertiesTab
  // Uses HMR (write to VFS, Sandpack refreshes) - no optimistic UI for props
  const handlePropUpdate = useCallback(
    (propName: string, value: string | boolean) => {
      const source = selectedElement?.instanceSource ?? selectedElement?.source;
      if (!source) return;

      const result = writer.updateComponentProp(
        source,
        propName,
        value
      );

      if (!result.success) {
        toast.error(result.error || "Failed to update prop");
      }
    },
    [selectedElement, writer]
  );

  // Handler for prop removal from PropertiesTab
  const handlePropRemove = useCallback(
    (propName: string) => {
      const source = selectedElement?.instanceSource ?? selectedElement?.source;
      if (!source) return;

      const result = writer.removeComponentProp(
        source,
        propName
      );

      if (!result.success) {
        toast.error(result.error || "Failed to remove prop");
      }
    },
    [selectedElement, writer]
  );

  // Broadcast swap message to all Sandpack iframes (optimistic DOM update)
  const broadcastSwap = useCallback(
    (selector: string, direction: "prev" | "next") => {
      const iframes = document.querySelectorAll<HTMLIFrameElement>(
        'iframe[title="Sandpack Preview"]'
      );
      iframes.forEach((iframe) => {
        iframe.contentWindow?.postMessage(
          { type: "novum:swap-elements", payload: { selector, direction } },
          "*"
        );
      });
    },
    []
  );

  // Broadcast move message to all Sandpack iframes (optimistic DOM update for drag-drop)
  const broadcastMove = useCallback(
    (payload: OptimisticMovePayload) => {
      const iframes = document.querySelectorAll<HTMLIFrameElement>(
        'iframe[title="Sandpack Preview"]'
      );
      iframes.forEach((iframe) => {
        iframe.contentWindow?.postMessage(
          { type: "novum:optimistic-move", payload },
          "*"
        );
      });
    },
    []
  );

  // Enable keyboard reordering when an element is selected
  useKeyboardMove({
    files,
    writeFile,
    selectedElement,
    flushDraft: draftEditor.flush,
    onOptimisticSwap: broadcastSwap,
    onSourceLocationUpdate: onSelectedElementSourceUpdate,
  });

  // Enable keyboard delete when an element is selected
  useKeyboardDelete({
    files,
    writeFile,
    selectedElement,
    inspectionMode,
    cancelDraft: draftEditor.cancel,
    onClearSelection: onClearSelection ?? (() => {}),
  });

  // Enable mouse drag-and-drop for element reordering
  useMouseMove({
    files,
    writeFile,
    flushDraft: draftEditor.flush,
    onOptimisticMove: broadcastMove,
  });

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className={`absolute top-4 right-4 z-50 p-2 bg-white rounded-md shadow-md border border-neutral-200 hover:bg-neutral-50 transition-colors ${className ?? ""}`}
        aria-label="Open panel"
      >
        <PanelRight className="w-5 h-5 text-neutral-600" />
      </button>
    );
  }

  return (
    <div className={`w-96 h-full bg-white border-l border-neutral-200 flex flex-col ${className ?? ""}`}>
      {/* Header with Tabs */}
      <div className="flex items-center justify-between px-2 py-2 border-b border-neutral-200">
        {/* Tab Switcher */}
        <div className="flex bg-neutral-100 rounded-lg p-0.5">
          <button
            onClick={() => handleTabChange("chat")}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-base font-medium rounded-md transition-colors ${
              activeTab === "chat"
                ? "bg-white text-neutral-900 shadow-sm"
                : "text-neutral-600 hover:text-neutral-900"
            }`}
          >
            <MessageSquare className="w-4 h-4" />
            Chat
          </button>
          <button
            onClick={() => handleTabChange("design")}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-base font-medium rounded-md transition-colors ${
              activeTab === "design"
                ? "bg-white text-neutral-900 shadow-sm"
                : "text-neutral-600 hover:text-neutral-900"
            }`}
          >
            <Palette className="w-4 h-4" />
            Design
            {(selectedElement || showCanvasProperties) && (
              <span className={`w-2 h-2 rounded-full ${showCanvasProperties ? "bg-purple-500" : "bg-blue-500"}`} />
            )}
          </button>
        </div>

        {/* Close Button */}
        <button
          onClick={() => setIsOpen(false)}
          className="p-1 hover:bg-neutral-100 rounded transition-colors"
          aria-label="Close panel"
        >
          <PanelRightClose className="w-5 h-5 text-neutral-500" />
        </button>
      </div>

      {/* Tab Content - ChatTab always mounted to preserve history */}
      <div className="flex-1 overflow-hidden relative">
        <div className={`absolute inset-0 ${activeTab === "chat" ? "" : "hidden"}`}>
          <ChatTab writeFile={writeFile} files={files} />
        </div>
        {activeTab === "design" && (
          showCanvasProperties && selectedCanvasNode ? (
            // Show canvas group/frame properties when a canvas node is selected
            <PropertiesTabErrorBoundary>
              <GroupPropertiesTab node={selectedCanvasNode} />
            </PropertiesTabErrorBoundary>
          ) : (
            // Show element properties when an iframe element is selected
            <PropertiesTabErrorBoundary>
              <PropertiesTab
                selectedElement={
                  selectedElement
                    ? {
                        ...selectedElement,
                        selector: selectedElement.preciseSelector || selectedElement.selector,
                        className: effectiveClassName ?? "",
                        textContent: effectiveTextContent ?? undefined,
                      }
                    : null
                }
                inspectionMode={inspectionMode}
                onClassUpdate={handleClassUpdate}
                onTextUpdate={handleTextUpdate}
                onOptimisticTextUpdate={handleOptimisticTextUpdate}
                draftText={draftEditor.textDraft?.draftText}
                isEditable={editability.isEditable}
                editableFile={editability.file}
                notEditableReason={editability.reason}
                classEditMode={classCapability.mode}
                isTextEditable={textEditability.isEditable}
                textEditableFile={textEditability.file}
                isPending={draftEditor.isPending}
                componentProps={componentProps}
                onPropUpdate={handlePropUpdate}
                onPropRemove={handlePropRemove}
              />
            </PropertiesTabErrorBoundary>
          )
        )}
      </div>
    </div>
  );
}

// Re-export for external use
export type { TabType as RightPanelTab };
