"use strict";
// Hardware geometry is independent of content. All coordinates are logical pixels.
function layout(display, native) {
  const left = native?.left,
    right = native?.right,
    frame = native?.frame;
  const gap =
    (right?.origin?.x || 0) -
    ((left?.origin?.x || 0) + (left?.size?.width || 0));
  const hardware = Boolean(
    native?.safeTop > 0 &&
      gap > 0 &&
      Math.abs((frame?.size?.width || 0) - display.bounds.width) < 2,
  );
  const width = hardware ? Math.ceil(gap) + 164 : 308;
  const height = hardware ? native.safeTop : 32;
  const cx = hardware
    ? display.bounds.x +
      (right.origin.x + left.origin.x + left.size.width) / 2 -
      frame.origin.x
    : display.bounds.x + display.bounds.width / 2;
  return {
    x: Math.round(cx - width / 2),
    y: display.bounds.y,
    width,
    height,
    gap: hardware ? gap : 0,
    hardware,
    centerX: cx,
  };
}
function expandedLayout(display, collapsed) {
  const width = Math.min(680, display.bounds.width - 24);
  return {
    x: Math.round(
      Math.max(
        display.bounds.x,
        Math.min(
          (collapsed.centerX ?? collapsed.x + collapsed.width / 2) - width / 2,
          display.bounds.x + display.bounds.width - width,
        ),
      ),
    ),
    y: display.bounds.y,
    width,
    height: Math.min(400 + collapsed.height, display.workArea.height),
  };
}
function notificationLayout(display, collapsed) {
  const centerX = collapsed.centerX ?? collapsed.x + collapsed.width / 2;
  // A centered card must contain both asymmetric header wings.
  const headerWidth = 2 * Math.max(centerX - collapsed.x, collapsed.x + collapsed.width - centerX);
  const width = Math.min(Math.ceil(Math.max(360, headerWidth)), display.bounds.width - 24);
  return { x: Math.round(Math.max(display.bounds.x, Math.min((collapsed.centerX ?? collapsed.x + collapsed.width / 2) - width / 2,
    display.bounds.x + display.bounds.width - width))), y: collapsed.y, width, height: collapsed.height + 82 };
}
module.exports = { layout, expandedLayout, notificationLayout };

// Renderer measures untransformed layout boxes, so animation never resizes the window.
// Outer padding clears the concave silhouette; inner padding clears the camera.
const OUTER = 28, INNER = 6, TOOL_GAP = 12;
function contentLayout(base, { left, right, single }) {
  const centerX = base.centerX ?? base.x + base.width / 2;
  const spacer = base.hardware ? Math.ceil(base.gap) + INNER * 2 : (single ? (right ? 4 : 0) : TOOL_GAP);
  const width = OUTER * 2 + left + spacer + right;
  const x = base.hardware
    ? Math.round(centerX - base.gap / 2 - INNER - left - OUTER)
    : Math.round(centerX - width / 2);
  return { ...base, x, width, centerX, left, right, single, spacer, outer: OUTER,
    cameraLeft: base.hardware ? centerX - base.gap / 2 - x : null };
}
function contentKey(data) {
  return JSON.stringify([data.tasks, data.settings?.idleQuota === true, data.remainingQuota]);
}
module.exports.contentLayout = contentLayout;
module.exports.contentKey = contentKey;

// Keep the last expanded native canvas after folding. Only the visible contour
// shrinks, so AppKit and Chromium never have to rebase the final frame together.
function compactHostBounds(host, content) {
  if (!host || host.y !== content.y) return content;
  const x = Math.min(host.x, content.x);
  return {x, y: content.y, width: Math.max(host.x+host.width, content.x+content.width)-x,
    height: Math.max(host.height, content.height)};
}
function containsPoint(rect, point) {
  return point.x >= rect.x && point.x < rect.x+rect.width && point.y >= rect.y && point.y < rect.y+rect.height;
}
module.exports.compactHostBounds = compactHostBounds;
module.exports.containsPoint = containsPoint;
