"use strict";
const root = document.querySelector("#notch");
let last = "",
  clickTimer;
let renderRevision = 0, lastLayoutKey = "";
const progressValues = new Map();
// Forwarded movement keeps the transparent native canvas click-through.
window.addEventListener("mousemove", () => macNotch.pointer());
window.addEventListener("mouseleave", () => macNotch.pointer());
root.addEventListener("contextmenu", event => {
  event.preventDefault(); clearTimeout(clickTimer); macNotch.gesture("right");
});
root.addEventListener("dblclick", event => {
  event.preventDefault(); clearTimeout(clickTimer); macNotch.gesture("double");
});
// Apply the silhouette only to the compact header, never to expanded panels.
function updateContour() {
  // Native viewport resize and state IPC can arrive in either order. The
  // silhouette must follow the measured header, never the old panel viewport.
  const { left, width, height } = root.getBoundingClientRect();
  const d = notchOutline(left, width, height, true);
  document.querySelector("#surface").style.setProperty("--collapsed-contour", `path("${d}")`);
}
window.addEventListener("resize", () => { settleNotchResize(); updateContour(); });
async function render(data) {
  // Background quota/activity updates must not restart the same in-flight fold.
  // The completion handshake asks main for the latest state after the exit.
  if (data.collapse && notchMotionId === data.collapse.id) {
    lastLayoutKey = "";
    return;
  }
  const previousPositions = headerPositions();
  const closingDashboard = data.collapse?.fromMode === "expanded";
  renderNotification(data.notification, Boolean(data.collapse) && !closingDashboard);
  document.body.classList.toggle("closing-dashboard", closingDashboard);
  document.body.classList.toggle("expanded", data.expanded);
  document.documentElement.style.setProperty(
    "--bar-height",
    `${data.geometry?.height || 32}px`,
  );
  updateContour();
  document.querySelector("#dashboard").hidden = !data.expanded && !closingDashboard;
  // Main already filters by enabled providers. Idle tools remain launchers;
  // activity must never remove the other provider or select the single layout.
  const tasks = data.tasks;
  const showQuota = data.settings?.idleQuota === true;
  document.body.classList.toggle("idle-quota-enabled", showQuota);
  const key = JSON.stringify([tasks, showQuota, data.remainingQuota, data.quotas, data.settings?.swapGestures]);
  const layoutKey = JSON.stringify([key, data.expanded, Boolean(data.notification),
    data.tasks, data.geometry?.centerX, data.geometry?.gap, data.geometry?.height, data.geometry?.y,
    (data.expanded || data.notification || data.collapse) ? data.frame : null, data.collapse?.id]);
  if (layoutKey === lastLayoutKey) return;
  lastLayoutKey = layoutKey;
  const revision = ++renderRevision;
  if (key !== last) {
    last = key;
    root.replaceChildren();
    for (const task of tasks) {
      const button = document.createElement("button");
      button.className = `tool ${task.provider} state-${task.state}${(task.animating ?? task.state === "running") ? " animating" : ""}${task.progress && task.state === "running" ? " has-progress" : ""}${tasks.length === 1 ? " single" : ""}`;
      button.title = `${task.provider === "claude" ? "Claude" : "Codex"} · ${{ idle: "空闲", running: "执行中", waiting: "需要协助", ended: "已完成" }[task.state]} · 单击打开工具`;
      button.title += data.settings?.swapGestures ? " · 双击打开控制页 · 右击查看额度" : " · 右击打开控制页 · 双击查看额度";
      if (task.progress)
        button.title += ` · 已完成 ${task.progress.done}/${task.progress.total}`;
      button.setAttribute("aria-label", button.title);
      const logo = document.createElement("img");
      logo.className = "logo";
      logo.src = `../../assets/${task.provider}.svg`;
      logo.alt = task.provider;
      const status = document.createElement("span");
      status.className = "status";
      if (task.state === "running" && task.progress) {
        const progress = document.createElement("span");
        const value = `${task.progress.done}/${task.progress.total}`;
        progress.className = "progress";
        if (
          progressValues.has(task.provider) &&
          progressValues.get(task.provider) !== value
        )
          progress.classList.add("changing");
        progressValues.set(task.provider, value);
        for (const [cls, content] of [
          ["done", task.progress.done],
          ["divider", "/"],
          ["total", task.progress.total],
        ]) {
          const span = document.createElement("span");
          span.className = cls;
          span.textContent = String(content);
          progress.append(span);
        }
        status.append(progress);
      } else if (task.state === "running") {
        const dots = document.createElement("span");
        dots.className = "dots";
        for (let i = 0; i < 3; i++) dots.append(document.createElement("i"));
        status.append(dots);
      }
      if (task.state === "waiting") {
        const q = document.createElement("span");
        q.className = "question";
        q.textContent = "?";
        status.append(q);
      }
      if (task.state === "ended") {
        const check = document.createElement("span");
        check.className = "check";
        status.append(check);
      }
      if (task.state === "idle" && showQuota) {
        const quota = document.createElement("span");
        quota.className = "idle-quota";
        const value = data.remainingQuota?.[task.provider];
        const q = data.quotas?.[task.provider];
        quota.textContent = Number.isFinite(value) ? `${value}%` : "—";
        quota.classList.toggle("stale", Boolean(q?.stale));
        button.title += ` · 剩余额度（最紧张窗口）：${quota.textContent}${q?.stale ? "（缓存）" : ""}${q?.error ? " · " + q.error : ""}`;
        button.setAttribute("aria-label", button.title);
        button.append(logo, quota);
      } else {
        button.append(logo);
        if (task.state !== "idle") button.append(status);
      }
      button.addEventListener("click", (event) => {
        clearTimeout(clickTimer);
        if (event.detail > 1) {
          return;
        }
        clickTimer = setTimeout(() => macNotch.open(task.provider), 350);
      });
      button.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          macNotch.open(task.provider);
        }
      });
      root.append(button);
    }
  }
  // Computed layout widths are unaffected by logo rotation, bounce, and progress transitions.
  // Measure intrinsic child boxes before sizing either the camera spacer or window.
  const buttons = [...root.querySelectorAll(".tool")];
  const single = buttons.length <= 1;
  root.classList.toggle("single-layout", single);
  const boxWidth = node => node ? Math.ceil(parseFloat(getComputedStyle(node).width)) : 0;
  const groupWidth = button => [...button.children].reduce((sum, node) => sum + boxWidth(node), 0)
    + Math.max(0, button.children.length - 1) * 4;
  const left = single ? boxWidth(buttons[0]?.firstElementChild) : groupWidth(buttons[0]);
  const right = single ? boxWidth(buttons[0]?.children[1]) : groupWidth(buttons[1]);
  const measurementKey = JSON.stringify([data.tasks, showQuota, data.remainingQuota]);
  if (!root.dataset.measuredWidth) root.style.visibility = "hidden";
  const measured = await macNotch.measure({ left, right, single, key: measurementKey });
  if (revision !== renderRevision) return;
  if (!measured) { lastLayoutKey = ""; return; }
  const { geometry: g, frame } = measured;
  stopNotchMotion();
  // Main may have cancelled this fold while measuring a changed screen/state.
  if (data.collapse && measured.collapse?.id !== data.collapse.id) {
    renderNotification(data.notification, false);
    document.body.classList.remove("closing-dashboard");
    document.querySelector("#dashboard").hidden = !data.expanded;
  }
  document.body.classList.toggle("notifying", Boolean(data.notification));
  root.style.setProperty("--content-left", `${left}px`);
  root.style.setProperty("--content-right", `${right}px`);
  root.style.setProperty("--content-spacer", `${g.spacer}px`);
  // A notification has its own card edges. Compact/usage headers keep their
  // camera-relative position; notification icons align with the card body.
  root.style.width = `${data.notification ? frame.width : g.width}px`;
  root.style.left = `${data.notification ? 0 : g.x - frame.x}px`;
  root.style.visibility = "";
  root.dataset.cameraLeft = g.cameraLeft ?? "";
  root.dataset.cameraGap = g.gap;
  root.dataset.measuredWidth = g.width;
  updateContour();
  if (data.collapse && measured.collapse?.id === data.collapse.id)
    foldNotification(measured.collapse, g, frame, previousPositions);
}
macNotch.onState(render);
macNotch.get().then(render);

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") macNotch.collapse();
});
