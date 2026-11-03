"use strict";
const root = document.querySelector("#notch");
let last = "",
  clickTimer;
function render(data) {
  const active = data.tasks.filter((t) => t.state !== "idle");
  const tasks = active.length ? active : data.tasks;
  const key = JSON.stringify(tasks);
  if (key === last) return;
  last = key;
  root.replaceChildren();
  for (const task of tasks) {
    const button = document.createElement("button");
    button.className = `tool ${task.provider} state-${task.state}${tasks.length === 1 ? " single" : ""}`;
    button.title = `${task.provider === "claude" ? "Claude" : "Codex"} · ${{ idle: "空闲", running: "执行中", waiting: "需要协助", ended: "已完成" }[task.state]} · 单击打开，双击额度`;
    button.setAttribute("aria-label", button.title);
    const logo = document.createElement("img");
    logo.className = "logo";
    logo.src = `../../assets/${task.provider}.svg`;
    logo.alt = task.provider;
    const status = document.createElement("span");
    status.className = "status";
    if (task.state === "running") {
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
    button.append(logo, status);
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
