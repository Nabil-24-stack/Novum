/**
 * Viewport animation utilities for smooth canvas transitions
 */

export interface ViewportState {
  x: number;
  y: number;
  scale: number;
}

export interface NodeRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Ease-out cubic function for smooth deceleration
 */
function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

/**
 * Linearly interpolate between two values
 */
function lerp(start: number, end: number, t: number): number {
  return start + (end - start) * t;
}

/**
 * Animate viewport from current state to target state
 * @param from - Starting viewport state
 * @param to - Target viewport state
 * @param onUpdate - Callback called with interpolated viewport state each frame
 * @param options - Animation options
 * @returns Cancel function to stop the animation
 */
export function animateViewport(
  from: ViewportState,
  to: ViewportState,
  onUpdate: (state: ViewportState) => void,
  options?: { duration?: number }
): () => void {
  const duration = options?.duration ?? 300; // Default 300ms
  const startTime = performance.now();
  let animationFrameId: number | null = null;
  let isCancelled = false;

  function animate(currentTime: number) {
    if (isCancelled) return;

    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const easedProgress = easeOutCubic(progress);

    const interpolatedState: ViewportState = {
      x: lerp(from.x, to.x, easedProgress),
      y: lerp(from.y, to.y, easedProgress),
      scale: lerp(from.scale, to.scale, easedProgress),
    };

    onUpdate(interpolatedState);

    if (progress < 1) {
      animationFrameId = requestAnimationFrame(animate);
    }
  }

  animationFrameId = requestAnimationFrame(animate);

  // Return cancel function
  return () => {
    isCancelled = true;
    if (animationFrameId !== null) {
      cancelAnimationFrame(animationFrameId);
    }
  };
}

/**
 * Calculate viewport state that fits all given node rects with padding.
 * Scale is clamped to max 1 (never zoom in past 100%).
 */
export function calculateFitAllViewport(
  nodeRects: NodeRect[],
  containerWidth: number,
  containerHeight: number,
  padding = 80
): ViewportState {
  if (nodeRects.length === 0) {
    return { x: 0, y: 0, scale: 1 };
  }

  // Find bounding box of all rects
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const rect of nodeRects) {
    minX = Math.min(minX, rect.x);
    minY = Math.min(minY, rect.y);
    maxX = Math.max(maxX, rect.x + rect.width);
    maxY = Math.max(maxY, rect.y + rect.height);
  }

  const contentWidth = maxX - minX;
  const contentHeight = maxY - minY;

  // Available space after padding
  const availableWidth = containerWidth - padding * 2;
  const availableHeight = containerHeight - padding * 2;

  // Scale to fit, clamped to max 1
  const scale = Math.min(
    1,
    availableWidth / contentWidth,
    availableHeight / contentHeight
  );

  // Center the content in the viewport
  const contentCenterX = minX + contentWidth / 2;
  const contentCenterY = minY + contentHeight / 2;

  return {
    x: containerWidth / 2 - contentCenterX * scale,
    y: containerHeight / 2 - contentCenterY * scale,
    scale,
  };
}

/**
 * Calculate viewport state that centers a node at 100% zoom
 * @param nodePosition - The position and dimensions of the node to center
 * @param containerWidth - Width of the viewport container
 * @param containerHeight - Height of the viewport container
 * @returns Viewport state that centers the node at scale 1
 */
export function calculateCenteredViewport(
  nodePosition: NodeRect,
  containerWidth: number,
  containerHeight: number
): ViewportState {
  // At scale 1, we want the center of the node to be at the center of the container
  // The viewport x/y represents the offset of the world origin from the container origin

  // Center of the node in world coordinates
  const nodeCenterX = nodePosition.x + nodePosition.width / 2;
  const nodeCenterY = nodePosition.y + nodePosition.height / 2;

  // Center of the container in screen coordinates
  const containerCenterX = containerWidth / 2;
  const containerCenterY = containerHeight / 2;

  // At scale 1:
  // screenX = worldX * scale + viewport.x
  // containerCenterX = nodeCenterX * 1 + viewport.x
  // viewport.x = containerCenterX - nodeCenterX

  return {
    x: containerCenterX - nodeCenterX,
    y: containerCenterY - nodeCenterY,
    scale: 1,
  };
}
