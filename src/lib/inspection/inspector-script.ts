/**
 * Generates a data URL script that runs inside the Sandpack iframe
 * to enable element inspection with hover outlines and click selection.
 */
export function getInspectorScriptDataUrl(enabled: boolean): string {
  const script = `
(function() {
  // State
  let inspectionMode = ${enabled};
  let flowModeActive = false; // Flow mode navigation interception
  let currentHighlight = null;
  let highlightOverlay = null;
  let layersHighlightOverlay = null;
  let dropZoneOverlay = null;
  let placeholderElement = null;
  let nodeIdCounter = 0;
  let currentSelectedElement = null;
  let currentSelectedSelector = null; // Precise selector for re-selection after Sandpack re-render
  let currentSelectionId = null;
  let reselectionObserver = null;
  let hoverRafId = null;
  let pendingHoverTarget = null;
  let selectedOverlayRafId = null;

  // Drag-and-drop state
  let isDragging = false;
  let dragSourceElement = null;
  let dragSourceLocation = null;
  let dragGhostElement = null;
  let dragStartX = 0;
  let dragStartY = 0;
  let lastDropTarget = null;
  let lastDropPosition = null;
  let dropIndicator = null;
  const DRAG_THRESHOLD = 5;

  // Flow mode navigation interception state
  let lastKnownHash = '';
  let isRestoringHash = false; // Flag to prevent infinite loops

  // Get current route from URL hash
  function getCurrentRoute() {
    const hash = lastKnownHash || window.location.hash;
    if (hash.startsWith('#/')) {
      return hash.slice(1); // Remove # prefix, keep the /
    }
    if (hash.startsWith('#')) {
      return hash.slice(1) || '/';
    }
    return '/';
  }

  // Parse a hash string to get the route
  function hashToRoute(hash) {
    if (hash.startsWith('#/')) {
      return hash.slice(1);
    }
    if (hash.startsWith('#')) {
      return hash.slice(1) || '/';
    }
    return '/';
  }

  // Post navigation intent to parent
  function postNavigationIntent(targetRoute, sourceRoute) {
    window.parent.postMessage({
      type: 'novum:navigation-intent',
      payload: {
        targetRoute: targetRoute,
        sourceRoute: sourceRoute,
      },
    }, '*');
  }

  // Set up flow mode navigation interception
  // Intercepts hash changes to prevent navigation in Flow View
  function setupFlowModeInterception() {
    lastKnownHash = window.location.hash;

    // Use window.__novumFlowModeActive (global) instead of closure variable
    // to avoid stale closure issues when iframe reloads
    window.addEventListener('hashchange', function(e) {
      // Skip if we're restoring the hash ourselves
      if (isRestoringHash) {
        isRestoringHash = false;
        return;
      }

      // Skip if flow mode is not active
      if (!window.__novumFlowModeActive) {
        lastKnownHash = window.location.hash;
        return;
      }

      const newHash = window.location.hash;
      const sourceRoute = hashToRoute(lastKnownHash);
      const targetRoute = hashToRoute(newHash);

      // Only intercept if the route actually changed
      if (sourceRoute !== targetRoute) {
        postNavigationIntent(targetRoute, sourceRoute);

        // Restore previous hash to prevent navigation in this frame
        isRestoringHash = true;
        history.replaceState(null, '', lastKnownHash || '#/');
      }
    }, true); // Capture phase for early interception

    // Global function for Router template compatibility
    window.__novumInterceptNavigation = function(targetRoute) {
      postNavigationIntent(targetRoute, getCurrentRoute());
    };
  }

  // Update flow mode state
  function setFlowModeActive(enabled) {
    flowModeActive = enabled;
    window.__novumFlowModeActive = enabled;

    // Store current hash when enabling for restoration during interception
    if (enabled) {
      lastKnownHash = window.location.hash;
    }
  }

  // Get or create highlight overlay element (lazy retrieval - self-heals after HMR)
  function getOverlay() {
    // Check if element exists in live DOM (may have been deleted by HMR)
    let el = document.getElementById('novum-inspector-overlay');
    if (el) {
      highlightOverlay = el;
      return el;
    }

    // Create new overlay
    highlightOverlay = document.createElement('div');
    highlightOverlay.id = 'novum-inspector-overlay';
    highlightOverlay.style.cssText = \`
      position: fixed;
      pointer-events: none;
      border: 2px solid #3b82f6;
      z-index: 999999;
      transition: all 0.1s ease-out;
      display: none;
    \`;
    document.body.appendChild(highlightOverlay);
    return highlightOverlay;
  }

  // Apply selection outline directly on the element (moves with it naturally)
  function applySelectionStyle(element) {
    if (!element) return;
    element.style.outline = '2px solid #3b82f6';
    element.style.outlineOffset = '0px';
  }

  // Remove selection outline from an element
  function removeSelectionStyle(element) {
    if (element && element.isConnected) {
      element.style.outline = '';
      element.style.outlineOffset = '';
    }
  }

  // Re-find selected element after Sandpack re-render (element replaced in DOM)
  function scheduleSelectionRevalidation() {
    if (selectedOverlayRafId !== null) return;
    selectedOverlayRafId = requestAnimationFrame(() => {
      selectedOverlayRafId = null;
      if (currentSelectedElement && currentSelectedElement.isConnected) {
        // Element still exists - ensure outline is applied (may have been lost during HMR)
        applySelectionStyle(currentSelectedElement);
        return;
      }
      if (!currentSelectedSelector) return;
      try {
        const next = document.querySelector(currentSelectedSelector);
        if (next) {
          currentSelectedElement = next;
          applySelectionStyle(next);
        }
      } catch (err) {
        // ignore
      }
    });
  }

  // Clear selection state and remove outline from current element
  function hideSelectionOverlay() {
    removeSelectionStyle(currentSelectedElement);
    currentSelectedElement = null;
    currentSelectedSelector = null;
    currentSelectionId = null;
  }

  // Set up observer to detect when Sandpack re-renders and re-select the element
  function setupReselectionObserver() {
    if (reselectionObserver) return;

    reselectionObserver = new MutationObserver(() => {
      scheduleSelectionRevalidation();

      // Check if the selected element is still in the DOM
      if (currentSelectedElement && !currentSelectedElement.isConnected) {
        // Element was removed (Sandpack re-rendered), try to re-find it
        if (currentSelectedSelector) {
          try {
            const newElement = document.querySelector(currentSelectedSelector);
            if (newElement) {
              currentSelectedElement = newElement;
              applySelectionStyle(newElement);
              const payload = buildSelectionPayload(newElement);
              currentSelectionId = payload.selectionId;
              window.parent.postMessage({
                type: 'novum:selection-revalidated',
                payload: payload,
              }, '*');
            } else {
              // Element not found, clear selection
              hideSelectionOverlay();
            }
          } catch (err) {
            hideSelectionOverlay();
          }
        } else {
          hideSelectionOverlay();
        }
      }
    });

    // Observe the body for child changes (Sandpack re-renders replace children)
    reselectionObserver.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  // Get or create layers overlay (lazy retrieval - self-heals after HMR)
  function getLayersOverlay() {
    // Check if element exists in live DOM
    let el = document.getElementById('novum-layers-highlight-overlay');
    if (el) {
      layersHighlightOverlay = el;
      return el;
    }

    // Create new overlay
    layersHighlightOverlay = document.createElement('div');
    layersHighlightOverlay.id = 'novum-layers-highlight-overlay';
    layersHighlightOverlay.style.cssText = \`
      position: fixed;
      pointer-events: none;
      border: 2px solid #3b82f6;
      z-index: 999998;
      transition: all 0.1s ease-out;
      display: none;
    \`;
    document.body.appendChild(layersHighlightOverlay);
    return layersHighlightOverlay;
  }

  // Highlight an element by selector (for layers panel hover)
  function highlightBySelector(selector) {
    const overlay = getLayersOverlay();

    try {
      const element = document.querySelector(selector);
      if (element) {
        const rect = element.getBoundingClientRect();
        overlay.style.display = 'block';
        overlay.style.top = rect.top + 'px';
        overlay.style.left = rect.left + 'px';
        overlay.style.width = rect.width + 'px';
        overlay.style.height = rect.height + 'px';
      }
    } catch (err) {
      console.warn('Failed to highlight element:', selector, err);
    }
  }

  // Clear layers highlight
  function clearLayersHighlight() {
    const overlay = document.getElementById('novum-layers-highlight-overlay');
    if (overlay) {
      overlay.style.display = 'none';
    }
  }

  // Get or create drop zone overlay (lazy retrieval - self-heals after HMR)
  function getDropZoneOverlay() {
    // Check if element exists in live DOM
    let el = document.getElementById('novum-drop-zone-overlay');
    if (el) {
      dropZoneOverlay = el;
      return el;
    }

    // Create new overlay
    dropZoneOverlay = document.createElement('div');
    dropZoneOverlay.id = 'novum-drop-zone-overlay';
    dropZoneOverlay.style.cssText = \`
      position: fixed;
      pointer-events: none;
      border: 2px dashed #22c55e;
      background: rgba(34, 197, 94, 0.1);
      z-index: 999997;
      transition: all 0.1s ease-out;
      border-radius: 4px;
      display: none;
    \`;
    document.body.appendChild(dropZoneOverlay);
    return dropZoneOverlay;
  }

  // Show drop zone at coordinates (finds valid container at point)
  function showDropZone(x, y) {
    const overlay = getDropZoneOverlay();

    // Valid container element tags that support nesting
    const containerTags = ['div', 'section', 'article', 'main', 'aside', 'nav', 'header', 'footer', 'form', 'fieldset'];

    // Invalid target tags that trigger traversal up to parent
    const invalidTargetTags = ['body', 'html', 'span', 'p', 'button', 'a', 'label', 'input', 'textarea', 'img', 'svg'];

    const element = document.elementFromPoint(x, y);

    if (!element) {
      hideDropZone();
      return;
    }

    // Traverse up to find a valid container
    let target = element;
    while (target && target !== document.body && target !== document.documentElement) {
      const tagName = target.tagName.toLowerCase();

      // Skip our overlay elements
      if (target.id === 'novum-inspector-overlay' ||
          target.id === 'novum-layers-highlight-overlay' ||
          target.id === 'novum-drop-zone-overlay') {
        target = target.parentElement;
        continue;
      }

      // If it's an invalid/inline element, keep traversing
      if (invalidTargetTags.includes(tagName)) {
        target = target.parentElement;
        continue;
      }

      // Check if it's a valid container
      const isContainer = containerTags.includes(tagName) || target.hasAttribute('data-component');

      if (isContainer) {
        const rect = target.getBoundingClientRect();
        overlay.style.display = 'block';
        overlay.style.top = rect.top + 'px';
        overlay.style.left = rect.left + 'px';
        overlay.style.width = rect.width + 'px';
        overlay.style.height = rect.height + 'px';
        return;
      }

      target = target.parentElement;
    }

    // No valid container found, hide the overlay
    hideDropZone();
  }

  // Hide drop zone overlay
  function hideDropZone() {
    const overlay = document.getElementById('novum-drop-zone-overlay');
    if (overlay) {
      overlay.style.display = 'none';
    }
  }

  // ============================================================================
  // Drop Preview System (live placeholder inside container during drag)
  // ============================================================================

  let dropPreviewElement = null;
  let dropPreviewContainer = null;

  // Component-specific placeholder dimensions
  const previewConfigs = {
    'Button': { h: 40, w: 100, r: '6px', label: 'Button' },
    'Badge': { h: 24, w: 60, r: '9999px', label: 'Badge' },
    'Input': { h: 40, w: 200, r: '6px', label: 'Input' },
    'Select': { h: 40, w: 180, r: '6px', label: 'Select' },
    'Card': { h: 120, w: 280, r: '8px', label: 'Card' },
    'Dialog': { h: 150, w: 300, r: '8px', label: 'Dialog' },
    'Accordion': { h: 100, w: 240, r: '6px', label: 'Accordion' },
    'Switch': { h: 24, w: 44, r: '12px', label: 'Switch' },
    'Checkbox': { h: 20, w: 20, r: '4px', label: '' },
    'Avatar': { h: 40, w: 40, r: '9999px', label: '' },
    'Tabs': { h: 40, w: 200, r: '6px', label: 'Tabs' },
    'Slider': { h: 20, w: 200, r: '9999px', label: 'Slider' },
    'Separator': { h: 2, w: null, r: '0', label: '' },
    'Label': { h: 20, w: 80, r: '0', label: 'Label' },
    'Textarea': { h: 80, w: 200, r: '6px', label: 'Textarea' },
    'Progress': { h: 8, w: 200, r: '9999px', label: '' },
    'Skeleton': { h: 40, w: 200, r: '6px', label: 'Skeleton' },
    'Table': { h: 120, w: 300, r: '6px', label: 'Table' },
    'Alert': { h: 60, w: 280, r: '6px', label: 'Alert' },
    'Tooltip': { h: 32, w: 100, r: '6px', label: 'Tooltip' },
    'Popover': { h: 100, w: 200, r: '8px', label: 'Popover' },
    'RadioGroup': { h: 80, w: 160, r: '6px', label: 'Radio' },
    'Toggle': { h: 36, w: 36, r: '6px', label: '' },
    'DatePicker': { h: 40, w: 200, r: '6px', label: 'DatePicker' },
    'Breadcrumb': { h: 24, w: 200, r: '0', label: 'Breadcrumb' },
    'AspectRatio': { h: 120, w: 200, r: '6px', label: 'AspectRatio' },
  };

  // Show drop preview at coordinates (finds container, inserts placeholder as last child)
  function showDropPreview(x, y, componentType, ghostType, textContent) {
    const overlay = getDropZoneOverlay();

    // Valid container element tags
    const containerTags = ['div', 'section', 'article', 'main', 'aside', 'nav', 'header', 'footer', 'form', 'fieldset'];
    const invalidTargetTags = ['body', 'html', 'span', 'p', 'button', 'a', 'label', 'input', 'textarea', 'img', 'svg'];

    // Hide the preview element temporarily so it doesn't interfere with elementFromPoint
    if (dropPreviewElement) {
      dropPreviewElement.style.display = 'none';
    }

    const element = document.elementFromPoint(x, y);

    if (!element) {
      hideDropPreview();
      return;
    }

    // Traverse up to find a valid container
    let target = element;
    while (target && target !== document.body && target !== document.documentElement) {
      const tagName = target.tagName.toLowerCase();

      // Skip our overlay/preview elements
      if (target.id && target.id.startsWith('novum-')) {
        target = target.parentElement;
        continue;
      }

      // If it's an invalid/inline element, keep traversing
      if (invalidTargetTags.includes(tagName)) {
        target = target.parentElement;
        continue;
      }

      // Check if it's a valid container
      const isContainer = containerTags.includes(tagName) || target.hasAttribute('data-component');

      if (isContainer) {
        // Show green container outline (same as existing drop zone)
        const rect = target.getBoundingClientRect();
        overlay.style.display = 'block';
        overlay.style.top = rect.top + 'px';
        overlay.style.left = rect.left + 'px';
        overlay.style.width = rect.width + 'px';
        overlay.style.height = rect.height + 'px';

        // Get config for this component
        const config = previewConfigs[componentType] || { h: 40, w: 120, r: '6px', label: componentType || ghostType };
        const label = config.label || componentType || ghostType || '';
        const showLabel = config.h >= 24 && label;

        // Create or reuse the preview element
        if (!dropPreviewElement) {
          dropPreviewElement = document.createElement('div');
          dropPreviewElement.id = 'novum-drop-preview';
        }

        dropPreviewElement.style.cssText = \`
          height: \${config.h}px;
          width: \${config.w ? config.w + 'px' : '100%'};
          max-width: 100%;
          opacity: 0.6;
          border: 2px dashed #3b82f6;
          background: rgba(59, 130, 246, 0.08);
          border-radius: \${config.r};
          color: #3b82f6;
          font-size: 11px;
          font-weight: 500;
          display: flex;
          align-items: center;
          justify-content: center;
          pointer-events: none;
          box-sizing: border-box;
          flex-shrink: 0;
          transition: opacity 0.15s ease;
        \`;

        dropPreviewElement.textContent = showLabel ? label : '';

        // If container changed, move the preview to the new container
        if (dropPreviewContainer !== target) {
          // Remove from old container
          if (dropPreviewElement.parentNode) {
            dropPreviewElement.parentNode.removeChild(dropPreviewElement);
          }
          // Append as last child of new container
          target.appendChild(dropPreviewElement);
          dropPreviewContainer = target;
        } else if (!dropPreviewElement.parentNode) {
          // Re-append if somehow detached
          target.appendChild(dropPreviewElement);
        }

        dropPreviewElement.style.display = 'flex';
        return;
      }

      target = target.parentElement;
    }

    // No valid container found
    hideDropPreview();
  }

  // Hide drop preview and green outline
  function hideDropPreview() {
    // Remove preview element from container
    if (dropPreviewElement && dropPreviewElement.parentNode) {
      dropPreviewElement.parentNode.removeChild(dropPreviewElement);
    }
    dropPreviewContainer = null;

    // Hide green outline
    hideDropZone();
  }

  // ============================================================================
  // Drag-and-Drop System
  // ============================================================================

  // Get or create drag ghost element
  function createDragGhost(sourceElement) {
    if (dragGhostElement) {
      removeDragGhost();
    }

    dragGhostElement = sourceElement.cloneNode(true);
    dragGhostElement.id = 'novum-drag-ghost';
    dragGhostElement.style.cssText = \`
      position: fixed;
      pointer-events: none;
      z-index: 1000001;
      opacity: 0.7;
      transform: scale(0.95);
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      border-radius: 4px;
      transition: transform 0.1s ease;
    \`;

    // Set initial size based on original element
    const rect = sourceElement.getBoundingClientRect();
    dragGhostElement.style.width = rect.width + 'px';
    dragGhostElement.style.height = rect.height + 'px';

    document.body.appendChild(dragGhostElement);
    return dragGhostElement;
  }

  // Update ghost position
  function updateDragGhost(x, y) {
    if (!dragGhostElement) return;

    // Center the ghost on the cursor
    const rect = dragGhostElement.getBoundingClientRect();
    dragGhostElement.style.left = (x - rect.width / 2) + 'px';
    dragGhostElement.style.top = (y - rect.height / 2) + 'px';
  }

  // Remove drag ghost
  function removeDragGhost() {
    if (dragGhostElement && dragGhostElement.parentNode) {
      dragGhostElement.parentNode.removeChild(dragGhostElement);
    }
    dragGhostElement = null;
  }

  // Get or create drop indicator element
  function getDropIndicator() {
    let el = document.getElementById('novum-drop-indicator');
    if (el) {
      dropIndicator = el;
      return el;
    }

    dropIndicator = document.createElement('div');
    dropIndicator.id = 'novum-drop-indicator';
    dropIndicator.style.cssText = \`
      position: fixed;
      pointer-events: none;
      z-index: 1000000;
      display: none;
    \`;
    document.body.appendChild(dropIndicator);
    return dropIndicator;
  }

  // Show drop indicator at a position
  function showDropIndicator(targetElement, position) {
    const indicator = getDropIndicator();
    const rect = targetElement.getBoundingClientRect();
    const styles = window.getComputedStyle(targetElement);
    const display = styles.display;
    const flexDir = styles.flexDirection;

    // Determine if layout is horizontal or vertical
    const isHorizontal = display === 'flex' && (flexDir === 'row' || flexDir === 'row-reverse');
    const parentStyles = targetElement.parentElement ? window.getComputedStyle(targetElement.parentElement) : null;
    const parentIsHorizontal = parentStyles && parentStyles.display === 'flex' &&
      (parentStyles.flexDirection === 'row' || parentStyles.flexDirection === 'row-reverse');

    if (position === 'inside') {
      // Blue outline for inside drop
      indicator.style.cssText = \`
        position: fixed;
        pointer-events: none;
        z-index: 1000000;
        display: block;
        border: 2px solid #3b82f6;
        background: rgba(59, 130, 246, 0.1);
        border-radius: 4px;
        top: \${rect.top}px;
        left: \${rect.left}px;
        width: \${rect.width}px;
        height: \${rect.height}px;
      \`;
    } else if (position === 'before') {
      if (parentIsHorizontal) {
        // Vertical line on left side
        indicator.style.cssText = \`
          position: fixed;
          pointer-events: none;
          z-index: 1000000;
          display: block;
          background: #22c55e;
          width: 4px;
          height: \${rect.height}px;
          top: \${rect.top}px;
          left: \${rect.left - 2}px;
          border-radius: 2px;
        \`;
      } else {
        // Horizontal line on top
        indicator.style.cssText = \`
          position: fixed;
          pointer-events: none;
          z-index: 1000000;
          display: block;
          background: #22c55e;
          width: \${rect.width}px;
          height: 4px;
          top: \${rect.top - 2}px;
          left: \${rect.left}px;
          border-radius: 2px;
        \`;
      }
    } else if (position === 'after') {
      if (parentIsHorizontal) {
        // Vertical line on right side
        indicator.style.cssText = \`
          position: fixed;
          pointer-events: none;
          z-index: 1000000;
          display: block;
          background: #22c55e;
          width: 4px;
          height: \${rect.height}px;
          top: \${rect.top}px;
          left: \${rect.right - 2}px;
          border-radius: 2px;
        \`;
      } else {
        // Horizontal line on bottom
        indicator.style.cssText = \`
          position: fixed;
          pointer-events: none;
          z-index: 1000000;
          display: block;
          background: #22c55e;
          width: \${rect.width}px;
          height: 4px;
          top: \${rect.bottom - 2}px;
          left: \${rect.left}px;
          border-radius: 2px;
        \`;
      }
    }
  }

  // Hide drop indicator
  function hideDropIndicator() {
    const indicator = document.getElementById('novum-drop-indicator');
    if (indicator) {
      indicator.style.display = 'none';
    }
    lastDropTarget = null;
    lastDropPosition = null;
  }

  // Valid container tags for "inside" drops
  const containerTags = ['div', 'section', 'article', 'main', 'aside', 'nav', 'header', 'footer', 'form', 'fieldset'];

  // Invalid target tags (skip these entirely)
  const invalidTargetTags = ['body', 'html', 'script', 'style', 'svg', 'path', 'circle', 'rect', 'line', 'polygon'];

  // Determine drop position based on cursor position relative to element
  function getDropPosition(element, x, y) {
    const rect = element.getBoundingClientRect();
    const styles = window.getComputedStyle(element);
    const parentStyles = element.parentElement ? window.getComputedStyle(element.parentElement) : null;

    // Check parent layout direction
    const parentDisplay = parentStyles ? parentStyles.display : 'block';
    const parentFlexDir = parentStyles ? parentStyles.flexDirection : 'column';
    const isHorizontalLayout = parentDisplay === 'flex' &&
      (parentFlexDir === 'row' || parentFlexDir === 'row-reverse');

    // Check if element is a valid container for "inside" drops
    const tagName = element.tagName.toLowerCase();
    const isContainer = containerTags.includes(tagName) || element.hasAttribute('data-component');

    if (isHorizontalLayout) {
      // Horizontal layout: left 25% = before, right 25% = after, middle = inside (if container)
      const relX = (x - rect.left) / rect.width;

      if (relX < 0.25) return 'before';
      if (relX > 0.75) return 'after';
      if (isContainer) return 'inside';
      return relX < 0.5 ? 'before' : 'after';
    } else {
      // Vertical layout: top 25% = before, bottom 25% = after, middle = inside (if container)
      const relY = (y - rect.top) / rect.height;

      if (relY < 0.25) return 'before';
      if (relY > 0.75) return 'after';
      if (isContainer) return 'inside';
      return relY < 0.5 ? 'before' : 'after';
    }
  }

  // Check if an element is a descendant of another
  function isDescendant(child, parent) {
    let node = child;
    while (node) {
      if (node === parent) return true;
      node = node.parentElement;
    }
    return false;
  }

  // Find valid drop target at coordinates
  function findDropTarget(x, y, sourceElement) {
    const elements = document.elementsFromPoint(x, y);

    for (const element of elements) {
      // Skip overlay elements
      if (element.id && element.id.startsWith('novum-')) continue;

      // Skip invalid tags
      const tagName = element.tagName.toLowerCase();
      if (invalidTargetTags.includes(tagName)) continue;

      // Skip the source element itself
      if (element === sourceElement) continue;

      // Skip if dropping onto a descendant of source (would create circular structure)
      if (isDescendant(element, sourceElement)) continue;

      // Element must have data-source-loc for AST targeting
      if (!element.hasAttribute('data-source-loc')) continue;

      return element;
    }

    return null;
  }

  // Handle drag start (mousedown on element)
  function handleDragStart(e) {
    if (!inspectionMode) return;

    const target = e.target;

    // Skip overlay elements
    if (target.id && target.id.startsWith('novum-')) return;

    // Skip invalid elements
    const tagName = target.tagName.toLowerCase();
    if (invalidTargetTags.includes(tagName)) return;

    // Must have data-source-loc
    if (!target.hasAttribute('data-source-loc')) return;

    // Store potential drag source
    dragSourceElement = target;
    dragSourceLocation = parseSourceLoc(target);
    dragStartX = e.clientX;
    dragStartY = e.clientY;

    // Add temporary listeners for drag
    document.addEventListener('mousemove', handleDragMove, true);
    document.addEventListener('mouseup', handleDragEnd, true);
  }

  // Handle drag move
  function handleDragMove(e) {
    if (!dragSourceElement) return;

    const dx = e.clientX - dragStartX;
    const dy = e.clientY - dragStartY;
    const distance = Math.sqrt(dx * dx + dy * dy);

    // Start drag only after threshold
    if (!isDragging && distance >= DRAG_THRESHOLD) {
      isDragging = true;

      // Create ghost
      createDragGhost(dragSourceElement);

      // Hide hover overlay during drag
      hideOverlay();

      // Notify parent that drag started
      window.parent.postMessage({
        type: 'novum:drag-start',
        payload: {
          source: dragSourceLocation,
          selector: generatePreciseSelector(dragSourceElement),
        },
      }, '*');
    }

    if (!isDragging) return;

    // Update ghost position
    updateDragGhost(e.clientX, e.clientY);

    // Find drop target
    const dropTarget = findDropTarget(e.clientX, e.clientY, dragSourceElement);

    if (dropTarget) {
      const position = getDropPosition(dropTarget, e.clientX, e.clientY);
      showDropIndicator(dropTarget, position);
      lastDropTarget = dropTarget;
      lastDropPosition = position;
    } else {
      hideDropIndicator();
    }
  }

  // Handle drag end
  function handleDragEnd(e) {
    // Remove temporary listeners
    document.removeEventListener('mousemove', handleDragMove, true);
    document.removeEventListener('mouseup', handleDragEnd, true);

    if (isDragging && lastDropTarget && lastDropPosition && dragSourceLocation) {
      const targetLocation = parseSourceLoc(lastDropTarget);

      if (targetLocation) {
        // Send move request to parent
        window.parent.postMessage({
          type: 'novum:move-element',
          payload: {
            sourceSelector: generatePreciseSelector(dragSourceElement),
            sourceLocation: dragSourceLocation,
            targetSelector: generatePreciseSelector(lastDropTarget),
            targetLocation: targetLocation,
            position: lastDropPosition,
          },
        }, '*');
      }
    }

    // Clean up
    removeDragGhost();
    hideDropIndicator();
    isDragging = false;
    dragSourceElement = null;
    dragSourceLocation = null;
    lastDropTarget = null;
    lastDropPosition = null;
  }

  // Cancel drag (e.g., on Escape or mode change)
  function cancelDrag() {
    document.removeEventListener('mousemove', handleDragMove, true);
    document.removeEventListener('mouseup', handleDragEnd, true);
    removeDragGhost();
    hideDropIndicator();
    isDragging = false;
    dragSourceElement = null;
    dragSourceLocation = null;
    lastDropTarget = null;
    lastDropPosition = null;
  }

  // Generate a unique selector for an element (more precise for DOM tree)
  function generatePreciseSelector(element, includeNthChild = true) {
    if (element.id) {
      return '#' + element.id;
    }

    const parts = [];
    let current = element;

    while (current && current !== document.body && current !== document.documentElement) {
      let selector = current.tagName.toLowerCase();

      if (current.id) {
        parts.unshift('#' + current.id);
        break;
      }

      if (includeNthChild) {
        const parent = current.parentElement;
        if (parent) {
          const siblings = Array.from(parent.children).filter(
            child => child.tagName === current.tagName
          );
          if (siblings.length > 1) {
            const index = siblings.indexOf(current) + 1;
            selector += ':nth-of-type(' + index + ')';
          }
        }
      }

      parts.unshift(selector);
      current = current.parentElement;
    }

    return parts.join(' > ');
  }

  // Serialize the DOM tree starting from a root element
  function serializeDOMTree(root, depth = 0, maxDepth = 10) {
    if (!root || depth > maxDepth) return null;

    // Skip script, style, and our own overlay elements
    const skipTags = ['SCRIPT', 'STYLE', 'NOSCRIPT', 'SVG'];
    if (skipTags.includes(root.tagName) ||
        root.id === 'novum-inspector-overlay' ||
        root.id === 'novum-layers-highlight-overlay') {
      return null;
    }

    const nodeId = 'node-' + (nodeIdCounter++);
    const tagName = root.tagName.toLowerCase();
    const className = root.className && typeof root.className === 'string' ? root.className : '';
    const id = root.id || undefined;

    // Get text preview (first 30 chars of direct text content)
    let textPreview = undefined;
    const directText = Array.from(root.childNodes)
      .filter(node => node.nodeType === Node.TEXT_NODE)
      .map(node => node.textContent?.trim())
      .filter(Boolean)
      .join(' ')
      .trim();
    if (directText && directText.length > 0) {
      textPreview = directText.length > 30 ? directText.slice(0, 30) + '...' : directText;
    }

    // Recursively serialize children
    const children = [];
    const childElements = Array.from(root.children);
    for (const child of childElements) {
      const serialized = serializeDOMTree(child, depth + 1, maxDepth);
      if (serialized) {
        children.push(serialized);
      }
    }

    return {
      nodeId: nodeId,
      tagName: tagName,
      className: className,
      id: id,
      textPreview: textPreview,
      hasChildren: children.length > 0,
      children: children,
      selector: generatePreciseSelector(root),
      depth: depth,
      source: parseSourceLoc(root),
    };
  }

  // Update overlay position
  function updateOverlay(element) {
    if (!element) return;

    const overlay = getOverlay();
    const rect = element.getBoundingClientRect();
    overlay.style.display = 'block';
    overlay.style.top = rect.top + 'px';
    overlay.style.left = rect.left + 'px';
    overlay.style.width = rect.width + 'px';
    overlay.style.height = rect.height + 'px';
  }

  // Hide overlay
  function hideOverlay() {
    const overlay = document.getElementById('novum-inspector-overlay');
    if (overlay) {
      overlay.style.display = 'none';
    }
  }

  // Generate a CSS selector for an element
  function generateSelector(element) {
    if (element.id) {
      return '#' + element.id;
    }

    const parts = [];
    let current = element;

    while (current && current !== document.body && parts.length < 3) {
      let selector = current.tagName.toLowerCase();

      if (current.className && typeof current.className === 'string') {
        const classes = current.className.trim().split(/\\s+/).slice(0, 2).join('.');
        if (classes) {
          selector += '.' + classes;
        }
      }

      parts.unshift(selector);
      current = current.parentElement;
    }

    return parts.join(' > ');
  }

  // Get computed styles for an element
  function getComputedStylesForElement(element) {
    const styles = window.getComputedStyle(element);
    return {
      width: styles.width,
      height: styles.height,
      padding: styles.padding,
      margin: styles.margin,
      backgroundColor: styles.backgroundColor,
      color: styles.color,
      fontSize: styles.fontSize,
      fontFamily: styles.fontFamily,
      borderRadius: styles.borderRadius,
      display: styles.display,
    };
  }

  // Check if element is a simple text element (only text nodes, no element children)
  function getTextInfo(element) {
    const childNodes = element.childNodes;
    let hasElementChildren = false;
    let textContent = '';

    for (let i = 0; i < childNodes.length; i++) {
      const node = childNodes[i];
      if (node.nodeType === Node.ELEMENT_NODE) {
        hasElementChildren = true;
        break;
      } else if (node.nodeType === Node.TEXT_NODE) {
        textContent += node.textContent;
      }
    }

    // Trim the text content
    textContent = textContent.trim();

    return {
      isTextElement: !hasElementChildren && textContent.length > 0,
      textContent: textContent || undefined,
    };
  }

  // Handle mouse move (hover)
  function handleMouseMove(e) {
    if (!inspectionMode) return;

    // Skip hover highlighting during drag
    if (isDragging) return;

    const target = e.target;
    // Skip our overlay elements
    if (target.id === 'novum-inspector-overlay' ||
        target.id === 'novum-layers-highlight-overlay' ||
        target.id === 'novum-drop-zone-overlay' ||
        target.id === 'novum-drag-ghost' ||
        target.id === 'novum-drop-indicator') return;

    pendingHoverTarget = target;
    if (hoverRafId !== null) return;

    hoverRafId = requestAnimationFrame(() => {
      hoverRafId = null;
      const nextTarget = pendingHoverTarget;
      if (!nextTarget || !inspectionMode || isDragging) return;
      if (currentHighlight !== nextTarget) {
        currentHighlight = nextTarget;
        updateOverlay(nextTarget);
        return;
      }
      // Re-sync hover overlay position for moving targets.
      updateOverlay(nextTarget);
    });
  }

  // Parse source location attributes to extract file/line/column
  function parseSourceLocValue(sourceLoc) {
    if (!sourceLoc || typeof sourceLoc !== 'string') return null;
    const parts = sourceLoc.split(':');
    if (parts.length >= 3) {
      // Handle paths with colons (unlikely but safe)
      const column = parseInt(parts[parts.length - 1], 10);
      const line = parseInt(parts[parts.length - 2], 10);
      const fileName = parts.slice(0, -2).join(':');

      if (!isNaN(line) && !isNaN(column) && fileName) {
        return { fileName, line, column };
      }
    }
    return null;
  }

  function parseSourceLoc(element) {
    return parseSourceLocValue(element?.dataset?.sourceLoc);
  }

  function parseInstanceSourceLoc(element) {
    return parseSourceLocValue(element?.dataset?.instanceSourceLoc);
  }

  function getNearestInstanceSource(element) {
    let current = element;
    while (current && current !== document.body && current !== document.documentElement) {
      const source = parseInstanceSourceLoc(current);
      if (source) return source;
      current = current.parentElement;
    }
    return null;
  }

  function getStableAncestryMarker(element) {
    let current = element?.parentElement;
    let depth = 0;
    while (current && current !== document.body && current !== document.documentElement && depth < 4) {
      const source = parseSourceLoc(current);
      if (source) {
        return source.fileName + ':' + source.line + ':' + source.column;
      }
      if (current.id) {
        return 'id:' + current.id;
      }
      if (current.className && typeof current.className === 'string') {
        const firstClass = current.className.trim().split(/\\s+/)[0];
        if (firstClass) {
          return 'class:' + firstClass;
        }
      }
      current = current.parentElement;
      depth += 1;
    }
    return 'root';
  }

  function generateSelectionId(element, source, preciseSelector) {
    const ownMarker = source
      ? source.fileName + ':' + source.line + ':' + source.column
      : 'dom:' + preciseSelector;
    return ownMarker + '|' + element.tagName.toLowerCase() + '|' + getStableAncestryMarker(element);
  }

  function inferLayoutInfoFromElement(element) {
    const styles = window.getComputedStyle(element);
    const display = styles.display;
    const flexDir = styles.flexDirection;

    let layout = 'block';
    let direction = 'column';
    let isReverse = false;
    let numCols = undefined;
    let hasExplicitPlacement = false;

    if (display === 'flex' || display === 'inline-flex') {
      layout = 'flex';
      isReverse = flexDir.includes('reverse');
      direction = flexDir.startsWith('row') ? 'row' : 'column';
    } else if (display === 'grid' || display === 'inline-grid') {
      layout = 'grid';
      direction = 'row';

      // Detect grid column count
      const className =
        typeof element.className === 'string'
          ? element.className
          : (element.getAttribute && element.getAttribute('class')) || '';

      // Try className pattern first: grid-cols-N
      const colsMatch = className.match(/(?:^|\\s)grid-cols-(\\d+)(?:\\s|$)/);
      if (colsMatch) {
        numCols = parseInt(colsMatch[1], 10);
      } else {
        // Fallback: count tracks from computed gridTemplateColumns
        const templateCols = styles.gridTemplateColumns;
        if (templateCols && templateCols !== 'none') {
          numCols = templateCols.trim().split(/\\s+/).length;
        }
      }

      // Check if children have explicit grid placement (col-start-*, row-start-*)
      const children = Array.from(element.children);
      hasExplicitPlacement = children.some(function(child) {
        const childClass = typeof child.className === 'string' ? child.className : '';
        return /(?:^|\\s)(?:col-start-|row-start-)/.test(childClass);
      });
    }

    // Fallback to class-intent detection when computed styles are not reliable.
    if (layout !== 'flex' && layout !== 'grid') {
      const className =
        typeof element.className === 'string'
          ? element.className
          : (element.getAttribute && element.getAttribute('class')) || '';
      const tokens = className.trim().split(/\\s+/).filter(Boolean);
      const hasFlexIntent = tokens.some(token =>
        token === 'flex' ||
        token === 'inline-flex' ||
        /(^|:)!?flex$/.test(token) ||
        /(^|:)!?inline-flex$/.test(token)
      );

      if (hasFlexIntent) {
        layout = 'flex';

        const hasColReverse = tokens.some(token => /(^|:)!?flex-col-reverse$/.test(token));
        const hasRowReverse = tokens.some(token => /(^|:)!?flex-row-reverse$/.test(token));
        const hasCol = tokens.some(token => /(^|:)!?flex-col$/.test(token));
        const hasRow = tokens.some(token => /(^|:)!?flex-row$/.test(token));

        if (hasColReverse) {
          direction = 'column';
          isReverse = true;
        } else if (hasRowReverse) {
          direction = 'row';
          isReverse = true;
        } else if (hasCol) {
          direction = 'column';
          isReverse = false;
        } else if (hasRow) {
          direction = 'row';
          isReverse = false;
        }
      }
    }

    var result = { layout: layout, direction: direction, isReverse: isReverse, display: display };
    if (numCols !== undefined) result.numCols = numCols;
    if (hasExplicitPlacement) result.hasExplicitPlacement = hasExplicitPlacement;
    return result;
  }

  // Get parent layout information for keyboard reordering.
  // Resolves effective layout across display:contents wrappers.
  function getParentLayoutInfo(element) {
    let parent = element.parentElement;
    if (!parent || parent === document.body) {
      return { layout: 'block', direction: 'column', isReverse: false };
    }

    // Track the immediate parent as fallback source.
    let fallbackSource = parseSourceLoc(parent);

    while (parent && parent !== document.body && parent !== document.documentElement) {
      const inferred = inferLayoutInfoFromElement(parent);

      if (inferred.layout === 'flex' || inferred.layout === 'grid') {
        return {
          layout: inferred.layout,
          direction: inferred.direction,
          isReverse: inferred.isReverse,
          parentSource: parseSourceLoc(parent) || fallbackSource,
        };
      }

      // Walk through transparent wrappers where children participate
      // in an ancestor layout context.
      if (inferred.display === 'contents') {
        parent = parent.parentElement;
        continue;
      }

      // Non-layout parent ends traversal.
      break;
    }

    return {
      layout: 'block',
      direction: 'column',
      isReverse: false,
      parentSource: fallbackSource,
    };
  }

  // Collect all data-strategy-id values from element up to body
  function collectStrategyIds(element) {
    var ids = [];
    var current = element;
    while (current && current !== document.body && current !== document.documentElement) {
      var sid = current.getAttribute('data-strategy-id');
      if (sid) ids.push(sid);
      current = current.parentElement;
    }
    return ids;
  }

  function buildSelectionPayload(target) {
    const rect = target.getBoundingClientRect();
    const textInfo = getTextInfo(target);
    const source = parseSourceLoc(target);
    const instanceSource = getNearestInstanceSource(target);
    const parentLayout = getParentLayoutInfo(target);
    const preciseSelector = generatePreciseSelector(target);
    const selectionId = generateSelectionId(target, source || instanceSource, preciseSelector);
    const strategyIds = collectStrategyIds(target);

    var payload = {
      tagName: target.tagName.toLowerCase(),
      className: target.className || '',
      id: target.id || undefined,
      textContent: textInfo.textContent,
      isTextElement: textInfo.isTextElement,
      computedStyles: getComputedStylesForElement(target),
      boundingRect: {
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height,
      },
      selector: preciseSelector,
      preciseSelector: preciseSelector,
      selectionId: selectionId,
      source: source,
      instanceSource: instanceSource,
      editScope: instanceSource ? 'instance' : 'component',
      parentLayout: parentLayout,
    };
    if (strategyIds.length > 0) {
      payload.strategyIds = strategyIds;
    }
    return payload;
  }

  // Handle click (selection)
  function handleClick(e) {
    if (!inspectionMode) return;

    // If we just finished dragging, don't treat as a click
    // (The drag end handler already processed the drop)
    if (isDragging) return;

    e.preventDefault();
    e.stopPropagation();

    const target = e.target;
    // Skip our overlay elements
    if (target.id === 'novum-inspector-overlay' ||
        target.id === 'novum-layers-highlight-overlay' ||
        target.id === 'novum-drop-zone-overlay' ||
        target.id === 'novum-drag-ghost' ||
        target.id === 'novum-drop-indicator') return;

    // Remove outline from previous selection, then apply to new target
    removeSelectionStyle(currentSelectedElement);
    currentSelectedElement = target;
    currentSelectedSelector = generatePreciseSelector(target);
    applySelectionStyle(target);
    setupReselectionObserver();
    const payload = buildSelectionPayload(target);
    currentSelectionId = payload.selectionId;
    currentSelectedSelector = payload.preciseSelector;

    // Post message to parent
    window.parent.postMessage({
      type: 'novum:element-selected',
      payload: payload,
    }, '*');
  }

  // Handle right-click (context menu for "Add to AI Chat")
  function handleContextMenu(e) {
    if (!inspectionMode) return;
    if (isDragging) return;

    e.preventDefault();
    e.stopPropagation();

    const target = e.target;
    // Skip our overlay elements
    if (target.id === 'novum-inspector-overlay' ||
        target.id === 'novum-layers-highlight-overlay' ||
        target.id === 'novum-drop-zone-overlay' ||
        target.id === 'novum-drag-ghost' ||
        target.id === 'novum-drop-indicator') return;

    // Select the element (same logic as handleClick)
    removeSelectionStyle(currentSelectedElement);
    currentSelectedElement = target;
    currentSelectedSelector = generatePreciseSelector(target);
    applySelectionStyle(target);
    setupReselectionObserver();
    const payload = buildSelectionPayload(target);
    currentSelectionId = payload.selectionId;
    currentSelectedSelector = payload.preciseSelector;

    // Post element-selected first (so host updates selection state)
    window.parent.postMessage({
      type: 'novum:element-selected',
      payload: payload,
    }, '*');

    // Post context-menu with iframe-local cursor coords
    window.parent.postMessage({
      type: 'novum:context-menu',
      payload: Object.assign({}, payload, {
        menuX: e.clientX,
        menuY: e.clientY,
      }),
    }, '*');
  }

  // Handle mouse leave
  function handleMouseLeave() {
    if (!inspectionMode) return;
    if (hoverRafId !== null) {
      cancelAnimationFrame(hoverRafId);
      hoverRafId = null;
    }
    pendingHoverTarget = null;
    hideOverlay();
    currentHighlight = null;
  }

  // Handle keyboard events (forward to parent for keyboard reordering)
  function handleKeyDown(e) {
    if (!inspectionMode) return;

    // Only forward arrow keys and Delete/Backspace
    if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Delete', 'Backspace'].includes(e.key)) {
      return;
    }

    // Prevent default scrolling behavior
    e.preventDefault();

    const payload = { key: e.key };
    if (
      currentSelectedElement &&
      !currentSelectedElement.isConnected &&
      currentSelectedSelector
    ) {
      try {
        const reselected = document.querySelector(currentSelectedSelector);
        if (reselected) {
          currentSelectedElement = reselected;
        }
      } catch (err) {
        // ignore selector parse failures
      }
    }
    if (currentSelectedElement) {
      payload.parentLayout = getParentLayoutInfo(currentSelectedElement);
      payload.selectionId = currentSelectionId;
    }

    // Forward to parent
    window.parent.postMessage({
      type: 'novum:keyboard-event',
      payload: payload,
    }, '*');
  }

  // Listen for messages from parent
  window.addEventListener('message', function(e) {
    if (!e.data || !e.data.type) return;

    // Handle inspection mode toggle
    if (e.data.type === 'novum:inspection-mode') {
      inspectionMode = e.data.payload.enabled;

      if (!inspectionMode) {
        hideOverlay();
        hideSelectionOverlay();
        clearLayersHighlight();
        currentHighlight = null;
        currentSelectionId = null;
        if (selectedOverlayRafId !== null) {
          cancelAnimationFrame(selectedOverlayRafId);
          selectedOverlayRafId = null;
        }
        // Cancel any in-progress drag
        cancelDrag();
        if (reselectionObserver) {
          reselectionObserver.disconnect();
          reselectionObserver = null;
        }
      }
    }

    // Handle flow mode state toggle (navigation interception)
    if (e.data.type === 'novum:flow-mode-state') {
      setFlowModeActive(e.data.payload.enabled);
    }

    // Handle dark mode toggle via postMessage (avoids iframe remount)
    if (e.data.type === 'novum:toggle-dark-mode') {
      if (e.data.payload.isDark) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    }

    // Handle DOM tree request
    if (e.data.type === 'novum:request-dom-tree') {
      nodeIdCounter = 0; // Reset counter for consistent IDs
      const tree = serializeDOMTree(document.body);
      window.parent.postMessage({
        type: 'novum:dom-tree-response',
        payload: tree,
      }, '*');
    }

    // Handle highlight element request
    if (e.data.type === 'novum:highlight-element') {
      const selector = e.data.payload?.selector;
      if (selector) {
        highlightBySelector(selector);
      }
    }

    // Handle clear highlight request
    if (e.data.type === 'novum:clear-highlight') {
      clearLayersHighlight();
    }

    // Handle select element request (from layers panel click)
    if (e.data.type === 'novum:select-element') {
      const selector = e.data.payload?.selector;
      if (selector) {
        try {
          const element = document.querySelector(selector);
          if (element) {
            // Remove outline from previous selection, apply to new
            removeSelectionStyle(currentSelectedElement);
            currentSelectedElement = element;
            currentSelectedSelector = generatePreciseSelector(element);
            applySelectionStyle(element);
            setupReselectionObserver();
            const payload = buildSelectionPayload(element);
            currentSelectionId = payload.selectionId;
            currentSelectedSelector = payload.preciseSelector;

            window.parent.postMessage({
              type: 'novum:element-selected',
              payload: payload,
            }, '*');
          }
        } catch (err) {
          console.warn('Failed to select element:', selector, err);
        }
      }
    }

    // Instant class update (optimistic UI)
    if (e.data.type === 'novum:update-classes') {
      const { selector, newClassName } = e.data.payload || {};
      if (selector) {
        try {
          const element = document.querySelector(selector);
          if (element) {
            element.className = newClassName;
            if (element === currentSelectedElement) {
              currentSelectedSelector = generatePreciseSelector(element);
            }
          }
        } catch (err) {
          console.warn('Failed to update classes:', selector, err);
        }
      }
    }

    // Rollback on VFS write failure
    if (e.data.type === 'novum:rollback-classes') {
      const { selector, originalClassName } = e.data.payload || {};
      if (selector) {
        try {
          const element = document.querySelector(selector);
          if (element) {
            element.className = originalClassName;
            if (element === currentSelectedElement) {
              currentSelectedSelector = generatePreciseSelector(element);
            }
          }
        } catch (err) {
          console.warn('Failed to rollback classes:', selector, err);
        }
      }
    }

    // Handle instant text updates (optimistic UI)
    if (e.data.type === 'novum:update-text') {
      const { selector, newText } = e.data.payload || {};
      if (selector) {
        try {
          const element = document.querySelector(selector);
          if (element) {
            // Update text content - handles single text node case
            if (element.childNodes.length === 1 && element.childNodes[0].nodeType === Node.TEXT_NODE) {
              element.textContent = newText;
            } else {
              // Find first text node and update it (preserves child elements)
              for (const node of element.childNodes) {
                if (node.nodeType === Node.TEXT_NODE && node.textContent?.trim()) {
                  node.textContent = newText;
                  break;
                }
              }
            }
          }
        } catch (err) {
          console.warn('Failed to update text:', selector, err);
        }
      }
    }

    // Handle text rollback on VFS write failure
    if (e.data.type === 'novum:rollback-text') {
      const { selector, originalText } = e.data.payload || {};
      if (selector) {
        try {
          const element = document.querySelector(selector);
          if (element) {
            // Rollback text content - same logic as update
            if (element.childNodes.length === 1 && element.childNodes[0].nodeType === Node.TEXT_NODE) {
              element.textContent = originalText;
            } else {
              for (const node of element.childNodes) {
                if (node.nodeType === Node.TEXT_NODE && node.textContent?.trim()) {
                  node.textContent = originalText;
                  break;
                }
              }
            }
          }
        } catch (err) {
          console.warn('Failed to rollback text:', selector, err);
        }
      }
    }

    // Show drop zone indicator at coordinates (during ghost drag)
    if (e.data.type === 'novum:show-drop-zone') {
      const { x, y } = e.data.payload || {};
      if (typeof x === 'number' && typeof y === 'number') {
        showDropZone(x, y);
      }
    }

    // Hide drop zone indicator
    if (e.data.type === 'novum:hide-drop-zone') {
      hideDropZone();
    }

    // Show live drop preview (component placeholder inside container)
    if (e.data.type === 'novum:show-drop-preview') {
      const { x, y, componentType, ghostType, textContent } = e.data.payload || {};
      if (typeof x === 'number' && typeof y === 'number') {
        showDropPreview(x, y, componentType || '', ghostType || '', textContent);
      }
    }

    // Hide drop preview
    if (e.data.type === 'novum:hide-drop-preview') {
      hideDropPreview();
    }

    // Navigate to a route (sent from parent in Prototype View)
    if (e.data.type === 'novum:navigate-to') {
      const route = e.data.payload?.route;
      if (route) {
        // Disable flow mode so navigation proceeds normally
        setFlowModeActive(false);
        window.location.hash = '#' + route;
      }
    }

    // Remove placeholder after materialization completes
    if (e.data.type === 'novum:remove-placeholder') {
      if (placeholderElement && placeholderElement.parentNode) {
        placeholderElement.parentNode.removeChild(placeholderElement);
        placeholderElement = null;
      }
    }

    // Swap elements for keyboard reordering (optimistic DOM update with FLIP animation)
    if (e.data.type === 'novum:swap-elements') {
      const { direction } = e.data.payload || {};
      // Use the currently selected element directly - more reliable than selector
      // which can become ambiguous after swaps (siblings may have same classes)
      const element = currentSelectedElement;
      if (element && element.parentNode) {
        try {
          const sibling = direction === 'prev'
            ? element.previousElementSibling
            : element.nextElementSibling;
          if (sibling) {
            // FLIP Animation: First - record initial positions
            const elementRect = element.getBoundingClientRect();
            const siblingRect = sibling.getBoundingClientRect();

            // Perform the DOM swap
            if (direction === 'prev') {
              element.parentNode.insertBefore(element, sibling);
            } else {
              element.parentNode.insertBefore(sibling, element);
            }

            // FLIP Animation: Last - record final positions
            const elementFinalRect = element.getBoundingClientRect();
            const siblingFinalRect = sibling.getBoundingClientRect();

            // FLIP Animation: Invert - calculate deltas
            const elementDeltaX = elementRect.left - elementFinalRect.left;
            const elementDeltaY = elementRect.top - elementFinalRect.top;
            const siblingDeltaX = siblingRect.left - siblingFinalRect.left;
            const siblingDeltaY = siblingRect.top - siblingFinalRect.top;

            // Apply inverse transforms (put elements visually back where they were)
            element.style.transform = \`translate(\${elementDeltaX}px, \${elementDeltaY}px)\`;
            element.style.transition = 'none';
            sibling.style.transform = \`translate(\${siblingDeltaX}px, \${siblingDeltaY}px)\`;
            sibling.style.transition = 'none';

            // Force reflow
            element.offsetHeight;

            // FLIP Animation: Play - animate to final positions
            // (Selection outline follows the element automatically since it's inline)
            element.style.transition = 'transform 0.15s ease-out';
            element.style.transform = '';
            sibling.style.transition = 'transform 0.15s ease-out';
            sibling.style.transform = '';

            // Clean up transition styles after animation
            setTimeout(() => {
              element.style.transition = '';
              sibling.style.transition = '';
            }, 150);

            // Update the precise selector since position changed
            currentSelectedSelector = generatePreciseSelector(element);
            const payload = buildSelectionPayload(element);
            currentSelectionId = payload.selectionId;
            window.parent.postMessage({
              type: 'novum:selection-revalidated',
              payload: payload,
            }, '*');
          }
        } catch (err) {
          console.warn('Failed to swap elements:', err);
        }
      }
    }

    // Move element by N positions for grid row jumps (optimistic DOM update with FLIP animation)
    if (e.data.type === 'novum:move-element-by-offset') {
      var moveOffset = e.data.payload?.offset;
      var moveElement = currentSelectedElement;
      if (moveElement && moveElement.parentNode && typeof moveOffset === 'number') {
        try {
          // Collect element siblings
          var allSiblings = Array.from(moveElement.parentNode.children);
          var curIdx = allSiblings.indexOf(moveElement);
          var tgtIdx = curIdx + moveOffset;

          if (curIdx >= 0 && tgtIdx >= 0 && tgtIdx < allSiblings.length) {
            // FLIP: First - record positions of all affected elements
            var rangeStart = Math.min(curIdx, tgtIdx);
            var rangeEnd = Math.max(curIdx, tgtIdx);
            var affectedEls = [];
            for (var ai = rangeStart; ai <= rangeEnd; ai++) {
              affectedEls.push({
                el: allSiblings[ai],
                rect: allSiblings[ai].getBoundingClientRect()
              });
            }

            // Perform the DOM move
            if (moveOffset > 0) {
              // Moving forward - insert after target
              var afterTarget = allSiblings[tgtIdx].nextSibling;
              moveElement.parentNode.insertBefore(moveElement, afterTarget);
            } else {
              // Moving backward - insert before target
              moveElement.parentNode.insertBefore(moveElement, allSiblings[tgtIdx]);
            }

            // FLIP: Last + Invert - calculate deltas and apply inverse transforms
            for (var fi = 0; fi < affectedEls.length; fi++) {
              var aEl = affectedEls[fi].el;
              var oldRect = affectedEls[fi].rect;
              var newRect = aEl.getBoundingClientRect();
              var dx = oldRect.left - newRect.left;
              var dy = oldRect.top - newRect.top;
              aEl.style.transform = 'translate(' + dx + 'px, ' + dy + 'px)';
              aEl.style.transition = 'none';
            }

            // Force reflow
            moveElement.offsetHeight;

            // FLIP: Play - animate to final positions
            // (Selection outline follows the element automatically since it's inline)
            for (var pi = 0; pi < affectedEls.length; pi++) {
              affectedEls[pi].el.style.transition = 'transform 0.15s ease-out';
              affectedEls[pi].el.style.transform = '';
            }

            // Clean up transition styles
            setTimeout(function() {
              for (var ci = 0; ci < affectedEls.length; ci++) {
                affectedEls[ci].el.style.transition = '';
              }
            }, 150);

            // Update selector and notify parent
            currentSelectedSelector = generatePreciseSelector(moveElement);
            var movePayload = buildSelectionPayload(moveElement);
            currentSelectionId = movePayload.selectionId;
            window.parent.postMessage({
              type: 'novum:selection-revalidated',
              payload: movePayload,
            }, '*');
          }
        } catch (moveErr) {
          console.warn('Failed to move element by offset:', moveErr);
        }
      }
    }

    // Optimistic delete for keyboard delete (remove element from DOM instantly)
    if (e.data.type === 'novum:delete-element') {
      if (currentSelectedElement && currentSelectedElement.parentNode) {
        currentSelectedElement.parentNode.removeChild(currentSelectedElement);
      }
      hideSelectionOverlay();
      currentSelectedElement = null;
      currentSelectedSelector = null;
      currentSelectionId = null;
    }

    // Clear selection overlay (sent to non-active iframes in Flow View)
    if (e.data.type === 'novum:clear-selection') {
      hideSelectionOverlay();
    }

    // Capture screenshot of current page for verification
    if (e.data.type === 'novum:capture-screenshot') {
      (async function() {
        try {
          var maxW = 1280;
          var maxH = 960;
          var bodyW = document.documentElement.scrollWidth || document.body.scrollWidth;
          var bodyH = document.documentElement.scrollHeight || document.body.scrollHeight;
          var scale = Math.min(1, maxW / bodyW, maxH / bodyH);
          var canvasW = Math.round(bodyW * scale);
          var canvasH = Math.round(bodyH * scale);

          // Use html2canvas-style approach: render to an offscreen canvas via SVG foreignObject
          // First, clone the body and inline computed styles
          var clone = document.body.cloneNode(true);

          // Remove inspector overlays from clone
          var overlayIds = ['novum-inspector-overlay', 'novum-layers-highlight-overlay', 'novum-drop-zone-overlay', 'novum-drag-ghost', 'novum-drop-indicator', 'novum-drop-preview', 'novum-drop-placeholder', 'novum-placeholder-styles'];
          overlayIds.forEach(function(id) {
            var el = clone.querySelector('#' + id);
            if (el) el.parentNode.removeChild(el);
          });

          // Remove data-source-loc attributes to clean up
          var allEls = clone.querySelectorAll('[data-source-loc]');
          allEls.forEach(function(el) { el.removeAttribute('data-source-loc'); });

          // Inline computed styles for accurate rendering
          function inlineStyles(source, target) {
            if (source.nodeType !== 1) return;
            var computed = window.getComputedStyle(source);
            var cssText = '';
            for (var i = 0; i < computed.length; i++) {
              var prop = computed[i];
              cssText += prop + ':' + computed.getPropertyValue(prop) + ';';
            }
            target.style.cssText = cssText;

            var sourceChildren = source.children;
            var targetChildren = target.children;
            for (var j = 0; j < sourceChildren.length && j < targetChildren.length; j++) {
              inlineStyles(sourceChildren[j], targetChildren[j]);
            }
          }
          inlineStyles(document.body, clone);

          // Build SVG foreignObject
          var svgNS = 'http://www.w3.org/2000/svg';
          var xhtmlNS = 'http://www.w3.org/1999/xhtml';
          var svgStr = '<svg xmlns="' + svgNS + '" width="' + bodyW + '" height="' + bodyH + '">'
            + '<foreignObject width="100%" height="100%">'
            + '<div xmlns="' + xhtmlNS + '">'
            + clone.outerHTML
            + '</div></foreignObject></svg>';

          var svgBlob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
          var url = URL.createObjectURL(svgBlob);

          var img = new Image();
          img.onload = function() {
            var canvas = document.createElement('canvas');
            canvas.width = canvasW;
            canvas.height = canvasH;
            var ctx = canvas.getContext('2d');
            if (ctx) {
              ctx.scale(scale, scale);
              ctx.drawImage(img, 0, 0);
            }
            URL.revokeObjectURL(url);
            var dataUrl = canvas.toDataURL('image/png', 0.8);
            window.parent.postMessage({
              type: 'novum:screenshot-captured',
              payload: { dataUrl: dataUrl },
            }, '*');
          };
          img.onerror = function() {
            URL.revokeObjectURL(url);
            window.parent.postMessage({
              type: 'novum:screenshot-captured',
              payload: { dataUrl: null, error: 'Image render failed' },
            }, '*');
          };
          img.src = url;
        } catch (captureErr) {
          window.parent.postMessage({
            type: 'novum:screenshot-captured',
            payload: { dataUrl: null, error: String(captureErr) },
          }, '*');
        }
      })();
    }

    // Optimistic move for drag-and-drop (DOM update with FLIP animation)
    if (e.data.type === 'novum:optimistic-move') {
      const { sourceSelector, targetSelector, position } = e.data.payload || {};

      if (!sourceSelector || !targetSelector) return;

      try {
        const sourceEl = document.querySelector(sourceSelector);
        const targetEl = document.querySelector(targetSelector);

        if (!sourceEl || !targetEl) return;

        // FLIP Animation: First - record initial position
        const sourceRect = sourceEl.getBoundingClientRect();

        // Perform the DOM move
        if (position === 'before') {
          targetEl.parentNode.insertBefore(sourceEl, targetEl);
        } else if (position === 'after') {
          targetEl.parentNode.insertBefore(sourceEl, targetEl.nextSibling);
        } else {
          // inside - append as last child
          targetEl.appendChild(sourceEl);
        }

        // FLIP Animation: Last - record final position
        const sourceFinalRect = sourceEl.getBoundingClientRect();

        // FLIP Animation: Invert - calculate deltas
        const deltaX = sourceRect.left - sourceFinalRect.left;
        const deltaY = sourceRect.top - sourceFinalRect.top;

        // Apply inverse transform (put element visually back where it was)
        sourceEl.style.transform = \`translate(\${deltaX}px, \${deltaY}px)\`;
        sourceEl.style.transition = 'none';

        // Force reflow
        sourceEl.offsetHeight;

        // FLIP Animation: Play - animate to final position
        sourceEl.style.transition = 'transform 0.2s ease-out';
        sourceEl.style.transform = '';

        // Update selection if this element was selected
        // (Outline follows the element automatically since it's inline)
        if (sourceEl === currentSelectedElement) {
          currentSelectedSelector = generatePreciseSelector(sourceEl);
          const payload = buildSelectionPayload(sourceEl);
          currentSelectionId = payload.selectionId;
          window.parent.postMessage({
            type: 'novum:selection-revalidated',
            payload: payload,
          }, '*');
        }

        // Clean up transition styles after animation
        setTimeout(() => {
          sourceEl.style.transition = '';
        }, 200);
      } catch (err) {
        console.warn('Failed to move element:', err);
      }
    }

    // Find drop target at coordinates (for ghost materialization)
    if (e.data.type === 'novum:find-drop-target') {
      const { x, y } = e.data.payload || {};

      // Valid container element tags that support nesting
      const containerTags = ['div', 'section', 'article', 'main', 'aside', 'nav', 'header', 'footer', 'form', 'fieldset'];

      // Invalid target tags that trigger fallback to absolute positioning
      const invalidTargetTags = ['body', 'html', 'span', 'p', 'button', 'a', 'label', 'input', 'textarea', 'img', 'svg'];

      if (typeof x === 'number' && typeof y === 'number') {
        const element = document.elementFromPoint(x, y);

        if (element) {
          // Traverse up to find nearest element with data-source-loc
          let target = element;
          while (target && target !== document.body && target !== document.documentElement) {
            const source = parseSourceLoc(target);

            if (source) {
              const tagName = target.tagName.toLowerCase();
              // Check if it's a valid container (either a container tag or has data-component attribute)
              const isContainer = containerTags.includes(tagName) || target.hasAttribute('data-component');

              // If we found an inline/invalid element, keep traversing up to find a container
              if (invalidTargetTags.includes(tagName)) {
                target = target.parentElement;
                continue;
              }

              window.parent.postMessage({
                type: 'novum:drop-target-found',
                payload: {
                  tagName: tagName,
                  selector: generateSelector(target),
                  source: source,
                  isContainer: isContainer,
                },
              }, '*');
              return;
            }
            target = target.parentElement;
          }
        }

        // No valid target found - send empty response (triggers absolute positioning fallback)
        window.parent.postMessage({
          type: 'novum:drop-target-found',
          payload: {
            isContainer: false,
            source: null,
          },
        }, '*');
      }
    }

    // Insert optimistic placeholder at drop point
    if (e.data.type === 'novum:insert-placeholder') {
      const { x, y, componentName } = e.data.payload || {};

      // Remove any existing placeholder
      if (placeholderElement && placeholderElement.parentNode) {
        placeholderElement.parentNode.removeChild(placeholderElement);
        placeholderElement = null;
      }

      if (typeof x !== 'number' || typeof y !== 'number') return;

      // Find container at drop point
      const container = document.elementFromPoint(x, y);
      if (!container) return;

      // Valid container element tags that support nesting
      const containerTags = ['div', 'section', 'article', 'main', 'aside', 'nav', 'header', 'footer', 'form', 'fieldset'];

      // Traverse up to find valid container with data-source-loc
      let target = container;
      while (target && target !== document.body && target !== document.documentElement) {
        if (target.hasAttribute('data-source-loc')) {
          const tagName = target.tagName.toLowerCase();
          const isContainer = containerTags.includes(tagName) || target.hasAttribute('data-component');
          if (isContainer) break;
        }
        target = target.parentElement;
      }

      if (!target || target === document.body || target === document.documentElement) return;

      // Component-specific placeholder shapes for visual polish
      const placeholderConfigs = {
        'Button': { h: '40px', w: '100px', r: '6px' },
        'Badge': { h: '24px', w: '60px', r: '9999px' },
        'Input': { h: '40px', w: '200px', r: '6px' },
        'Select': { h: '40px', w: '180px', r: '6px' },
        'Card': { h: '120px', w: '280px', r: '8px' },
        'Dialog': { h: '150px', w: '300px', r: '8px' },
        'Accordion': { h: '100px', w: '240px', r: '6px' },
        'Switch': { h: '24px', w: '44px', r: '12px' },
        'Checkbox': { h: '20px', w: '20px', r: '4px' },
        'Avatar': { h: '40px', w: '40px', r: '9999px' },
        'Tabs': { h: '40px', w: '200px', r: '6px' },
        'Slider': { h: '20px', w: '200px', r: '9999px' },
        'Separator': { h: '2px', w: '100%', r: '0' },
        'Label': { h: '20px', w: '80px', r: '0' },
      };

      const config = placeholderConfigs[componentName] || { h: '40px', w: '120px', r: '6px' };
      const isSmall = parseInt(config.h) <= 24;

      // Create placeholder element with component-specific shape
      placeholderElement = document.createElement('div');
      placeholderElement.id = 'novum-drop-placeholder';
      placeholderElement.style.cssText = \`
        height: \${config.h};
        width: \${config.w};
        max-width: 100%;
        background: linear-gradient(90deg, #e0e7ff 0%, #c7d2fe 100%);
        border: 2px dashed #6366f1;
        border-radius: \${config.r};
        color: #4338ca;
        font-size: 12px;
        font-weight: 500;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        animation: novum-placeholder-pulse 1s ease-in-out infinite;
        box-sizing: border-box;
      \`;

      // Only show label for larger placeholders
      if (!isSmall) {
        placeholderElement.innerHTML = \`
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/>
            <path d="M12 6v6l4 2"/>
          </svg>
          \${componentName || 'Component'}
        \`;
      }

      // Append to container
      target.appendChild(placeholderElement);
    }
  });

  // Initialize
  function init() {
    // Set up flow mode navigation interception
    setupFlowModeInterception();

    // Pre-create overlays for immediate use (lazy getters will recreate if HMR deletes them)
    getOverlay();
    getLayersOverlay();
    getDropZoneOverlay();

    // Add CSS animation for placeholder pulse (check if already exists to avoid duplicates)
    if (!document.getElementById('novum-placeholder-styles')) {
      const style = document.createElement('style');
      style.id = 'novum-placeholder-styles';
      style.textContent = \`
        @keyframes novum-placeholder-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.7; }
        }
      \`;
      document.head.appendChild(style);
    }

    document.addEventListener('mousemove', handleMouseMove, true);
    document.addEventListener('click', handleClick, true);
    document.addEventListener('mouseleave', handleMouseLeave, true);
    document.addEventListener('keydown', handleKeyDown, true);
    document.addEventListener('mousedown', handleDragStart, true);
    document.addEventListener('contextmenu', handleContextMenu, true);

    // Signal to parent that inspector is ready (for state sync after iframe reload)
    window.parent.postMessage({ type: 'novum:inspector-ready' }, '*');

    // Cleanup on unload
    window.addEventListener('unload', function() {
      document.removeEventListener('mousemove', handleMouseMove, true);
      document.removeEventListener('click', handleClick, true);
      document.removeEventListener('mouseleave', handleMouseLeave, true);
      document.removeEventListener('keydown', handleKeyDown, true);
      document.removeEventListener('mousedown', handleDragStart, true);
      document.removeEventListener('contextmenu', handleContextMenu, true);
      cancelDrag(); // Clean up any in-progress drag
      if (hoverRafId !== null) {
        cancelAnimationFrame(hoverRafId);
        hoverRafId = null;
      }
      if (selectedOverlayRafId !== null) {
        cancelAnimationFrame(selectedOverlayRafId);
        selectedOverlayRafId = null;
      }
      if (reselectionObserver) {
        reselectionObserver.disconnect();
        reselectionObserver = null;
      }
      // Clean up drop preview
      if (dropPreviewElement && dropPreviewElement.parentNode) {
        dropPreviewElement.parentNode.removeChild(dropPreviewElement);
      }
      dropPreviewElement = null;
      dropPreviewContainer = null;

      // Clean up overlay elements by ID (more reliable than cached references)
      ['novum-inspector-overlay', 'novum-layers-highlight-overlay', 'novum-drop-zone-overlay', 'novum-drag-ghost', 'novum-drop-indicator'].forEach(function(id) {
        const el = document.getElementById(id);
        if (el && el.parentNode) {
          el.parentNode.removeChild(el);
        }
      });
    });
  }

  // Wait for DOM to be ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
`;

  return `data:text/javascript;charset=utf-8,${encodeURIComponent(script)}`;
}
