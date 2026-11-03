"use strict";
const notificationElement = document.querySelector("#notification");
const notificationBody = document.querySelector("#notification-body");
const notificationClose = document.querySelector("#notification-close");
const countdown = document.querySelector("#notification-countdown");
let notificationData = null;
let countdownFrame;
function paintCountdown() {
  cancelAnimationFrame(countdownFrame);
  if (!notificationData) return;
  const remaining = notificationData.expiresAt === null ? notificationData.remaining : notificationData.expiresAt - Date.now();
  countdown.style.transform = `scaleX(${Math.min(1, Math.max(0, remaining / (notificationData.duration || 5000)))})`;
  if (notificationData.expiresAt !== null) countdownFrame = requestAnimationFrame(paintCountdown);
}
function renderNotification(value, closing = false) {
  const changed = notificationData?.key !== value?.key;
  notificationData = value;
  // During a fold the renderer owns the header's class change after measuring;
  // repeated state messages must not switch it back to the card layout.
  if (!closing) document.body.classList.toggle("notifying", Boolean(value));
  document.body.classList.toggle("closing-notification", closing);
  notificationElement.hidden = !value && !closing;
  if (!value && closing) { cancelAnimationFrame(countdownFrame); return; }
  notificationElement.dataset.kind = value?.kind || "ended";
  const badge = document.querySelector("#notification-status");
  badge.className = !value ? "" : value.kind === "waiting" ? "question" : "check";
  badge.textContent = value?.kind === "waiting" ? "?" : "";
  if (!value) { cancelAnimationFrame(countdownFrame); return; }
  const source = value.provider === "codex" ? "Codex" : "Claude";
  document.querySelector("#notification-source").textContent = source;
  notificationElement.setAttribute("aria-label", `${source} 通知`);
  document.querySelector("#notification-title-text").textContent = value.title;
  document.querySelector("#notification-description").textContent = value.description;
  notificationBody.setAttribute("aria-label", `${source}，${value.title}，${value.kind === "waiting" ? "需要你处理" : "任务已完成"}，${value.description}，点击打开会话`);
  if (changed) {
    // A new card can appear beneath an already stationary pointer.
    macNotch.notification("hover", value.key, notificationElement.matches(":hover"));
  }
  paintCountdown();
}
notificationBody.addEventListener("click", () => {
  if (notificationData) macNotch.notification("open", notificationData.key);
});
notificationClose.addEventListener("click", () => {
  if (notificationData) macNotch.notification("dismiss", notificationData.key);
});
for (const [event, value] of [["mouseenter", true], ["mouseleave", false]])
  notificationElement.addEventListener(event, () => {
    if (notificationData) macNotch.notification("hover", notificationData.key, value);
  });
notificationElement.addEventListener("focusin", () => {
  if (notificationData) macNotch.notification("focus", notificationData.key, true);
});
notificationElement.addEventListener("focusout", event => {
  if (notificationData && !notificationElement.contains(event.relatedTarget))
    macNotch.notification("focus", notificationData.key, false);
});
document.addEventListener("keydown", event => {
  if (event.key === "Escape" && notificationData)
    macNotch.notification("dismiss", notificationData.key);
});
