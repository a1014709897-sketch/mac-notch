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
      frame?.size?.width === display.bounds.width,
  );
  const width = hardware ? Math.ceil(gap) + 136 : 280;
  const height = hardware ? native.safeTop : 32;
  const cx = hardware
    ? display.bounds.x +
      (right.origin.x + left.origin.x + left.size.width) / 2 -
      frame.origin.x
    : display.bounds.x + display.bounds.width / 2;
  return {
    x: Math.round(cx - width / 2),
    y: display.bounds.y + (hardware ? 0 : 6),
    width,
    height,
    gap: hardware ? gap : 0,
    hardware,
  };
}
module.exports = { layout };
