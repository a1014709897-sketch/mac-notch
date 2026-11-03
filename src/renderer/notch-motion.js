"use strict";
let notchMotion = [], notchMotionId = null, notchFoldTarget = null;
// Matching path commands let the card contour interpolate into the compact
// concave outline without a final silhouette swap.
function notchOutline(x, w, h, compact, radius = 16) {
  const shoulder = compact ? 18 : 0;
  const side = compact ? h / 2 : h - radius;
  const bottomInset = compact ? 36 : radius;
  return `M ${x} 0 H ${x+w} C ${x+w-shoulder} 0 ${x+w-shoulder} ${compact ? side/2 : 0} ${x+w-shoulder} ${side} C ${x+w-shoulder} ${h} ${x+w-(compact ? 27 : 0)} ${h} ${x+w-bottomInset} ${h} H ${x+bottomInset} C ${x+(compact ? 27 : 0)} ${h} ${x+shoulder} ${h} ${x+shoulder} ${side} C ${x+shoulder} ${compact ? side/2 : 0} ${x+shoulder} 0 ${x} 0 Z`;
}
function headerPositions() {
  return new Map([...document.querySelectorAll('#notch .logo,#notch .status,#notch .idle-quota')].map(node =>
    [node.closest('.tool').querySelector('.logo').alt + ':' + node.className.split(' ')[0], {
      left: screenX + node.getBoundingClientRect().left,
      hidden: [...node.children].some(child => getComputedStyle(child).visibility === 'hidden'),
    }]));
}
function stopNotchMotion() {
  notchMotionId = null;
  notchFoldTarget = null;
  for (const animation of notchMotion) animation.cancel();
  notchMotion = [];
}
function settleNotchResize() {
  if (!notchFoldTarget || innerWidth !== notchFoldTarget.width || innerHeight !== notchFoldTarget.height) return;
  // Rebase the final frame during the native resize event, before its paint.
  stopNotchMotion();
  document.querySelector('#notch').style.left = '0px';
  document.body.classList.remove('closing-notification', 'notifying', 'closing-dashboard');
  document.querySelector('#notification').hidden = true;
  const dashboard = document.querySelector('#dashboard');
  if (dashboard) dashboard.hidden = true;
}
function foldNotification(collapse, geometry, frame, previousPositions) {
  const { id, from } = collapse;
  stopNotchMotion();
  notchMotionId = id;
  notchFoldTarget = geometry;
  const closingDashboard = collapse.fromMode === 'expanded';
  const duration = matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : closingDashboard ? 320 : 240;
  const options = { duration, easing: closingDashboard ? 'cubic-bezier(.4, 0, .2, 1)' : 'cubic-bezier(.22, 1, .36, 1)', fill: 'forwards' };
  const surface = document.querySelector('#surface');
  const targetLeft = geometry.x - frame.x;
  notchMotion.push(surface.animate([
    { clipPath: `path("${notchOutline(from.x-frame.x, from.width, from.height, false, closingDashboard ? 28 : 16)}")` },
    { clipPath: `path("${notchOutline(targetLeft, geometry.width, geometry.height, true)}")` },
  ], options));
  notchMotion.push(document.querySelector(closingDashboard ? '#dashboard' : '#notification').animate([
    { opacity: 1, translate: '0 0' }, { opacity: 0, translate: '0 -8px' },
  ], { ...options, duration: duration * .65 }));
  for (const node of document.querySelectorAll('#notch .logo,#notch .status,#notch .idle-quota')) {
    const key = node.closest('.tool').querySelector('.logo').alt + ':' + node.className.split(' ')[0];
    const previous = previousPositions.get(key);
    if (previous === undefined) continue;
    // Separate translate from the logo's existing rotation/bounce transform.
    notchMotion.push(node.animate([
      { translate: `${previous.left-frame.x-node.getBoundingClientRect().left}px 0`, opacity: previous.hidden ? 0 : 1 },
      { translate: '0 0', opacity: 1 },
    ], options));
  }
  Promise.all(notchMotion.map(animation => animation.finished)).then(() => {
    if (notchMotionId === id) return macNotch.finishCollapse(id);
  }).catch(() => {}); // A newer notification, lock, or panel interrupts this fold.
}
