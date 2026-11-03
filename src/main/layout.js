"use strict";
// Fixed wings contain icons only. Never put text under the hardware camera.
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
  const width = hardware ? Math.ceil(gap) + 120 : 264;
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
  };
}
function expandedLayout(display, collapsed) {
  const width = Math.min(680, display.bounds.width - 24);
  return {
    x: Math.round(
      Math.max(
        display.bounds.x,
        Math.min(
          collapsed.x + collapsed.width / 2 - width / 2,
          display.bounds.x + display.bounds.width - width,
        ),
      ),
    ),
    y: display.bounds.y,
    width,
    height: Math.min(440 + collapsed.height, display.workArea.height),
  };
}
module.exports = { layout, expandedLayout };
