"use strict";
const root = document.querySelector("#notch");
let last = "",
  clickTimer;
const progressValues = new Map();
// Apply the silhouette only to the compact header, never to expanded panels.
function updateContour() {
  const w = window.innerWidth;
  const h = root.getBoundingClientRect().height;
  const shoulder = 18;
  const middle = h / 2;
  const d = `M 0 0 H ${w} C ${w-shoulder} 0 ${w-shoulder} ${middle/2} ${w-shoulder} ${middle} C ${w-shoulder} ${h} ${w-shoulder*1.5} ${h} ${w-shoulder*2} ${h} H ${shoulder*2} C ${shoulder*1.5} ${h} ${shoulder} ${h} ${shoulder} ${middle} C ${shoulder} ${middle/2} ${shoulder} 0 0 0 Z`;
  document.querySelector("#surface").style.setProperty("--collapsed-contour", `path("${d}")`);
}
window.addEventListener("resize", updateContour);
function render(data) {
  renderNotification(data.notification);
  document.body.classList.toggle("expanded", data.expanded);
  document.documentElement.style.setProperty(
    "--bar-height",
    `${data.geometry?.height || 32}px`,
  );
  updateContour();
  document.querySelector("#dashboard").hidden = !data.expanded;
  const active = data.tasks.filter((t) => t.state !== "idle");
  const tasks = active.length ? active : data.tasks;
  const showQuota = data.settings?.idleQuota === true;
  document.body.classList.toggle("idle-quota-enabled", showQuota);
  const key = JSON.stringify([tasks, showQuota, data.remainingQuota, data.quotas]);
  if (key === last) return;
  last = key;
  root.replaceChildren();
  for (const task of tasks) {
    const button = document.createElement("button");
    button.className = `tool ${task.provider} state-${task.state}${(task.animating ?? task.state === "running") ? " animating" : ""}${task.progress && task.state === "running" ? " has-progress" : ""}${tasks.length === 1 ? " single" : ""}`;
    button.title = `${task.provider === "claude" ? "Claude" : "Codex"} · ${{ idle: "空闲", running: "执行中", waiting: "需要协助", ended: "已完成" }[task.state]} · 单击打开，双击额度`;
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
    } else button.append(logo, status);
    button.addEventListener("click", (event) => {
      clearTimeout(clickTimer);
      if (event.detail > 1) {
        macNotch.panel();
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
macNotch.onState(render);
macNotch.get().then(render);

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") macNotch.collapse();
});
