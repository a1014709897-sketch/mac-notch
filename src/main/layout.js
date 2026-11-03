"use strict";
// Idle quota shares the existing wings; toggling it must not resize the notch. Never put text under the hardware camera.
function layout(display, native, idleQuota = false) {
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
    height: Math.min(400 + collapsed.height, display.workArea.height),
  };
}
function notificationLayout(display, collapsed) {
  const width = Math.min(Math.max(360, collapsed.width), display.bounds.width - 24);
  return { x: Math.round(Math.max(display.bounds.x, Math.min(collapsed.x + collapsed.width / 2 - width / 2,
    display.bounds.x + display.bounds.width - width))), y: collapsed.y, width, height: collapsed.height + 82 };
}
module.exports = { layout, expandedLayout, notificationLayout };

// Reserve the complete count at a fixed 15px, without crossing the camera gap.
function taskLayout(base, tasks) {
  let wing = (base.width - base.gap) / 2;
  for (const task of tasks) {
    if (task.state !== "running" || !task.progress) continue;
    const count = `${task.progress.done}/${task.progress.total}`;
    // 24 outer + 4 button padding + 22 icon + 4 gap + glyph width + breathing room.
    wing = Math.max(wing, 62 + count.length * 10);
  }
  const width = Math.ceil(base.gap + wing * 2);
  return {...base, width, x:Math.round(base.x + (base.width-width)/2)};
}
module.exports.taskLayout = taskLayout;
