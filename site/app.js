"use strict";
(() => {
  const display = document.querySelector("#demo-display");
  const notch = document.querySelector("#demo-notch");
  const quota = document.querySelector("#quota-panel");
  const toast = document.querySelector("#demo-toast");
  const copyButton = document.querySelector("#copy-command");
  let state = "running", tool = "both", clickTimer, toastTimer, copyTimer;
  let lastQuotaTrigger = null;
  const names = { both: "Claude + Codex", claude: "Claude", codex: "Codex" };
  const descriptions = {
    idle: ["暂无进行中的任务", "随时可以开始新的任务"],
    running: ["正在制作产品官网", "页面设计与功能实现"],
    waiting: ["请选择一个方案", "等待你确认页面样式"],
    ended: ["产品官网已完成", "回到客户端查看结果"],
  };
  const indicators = {
    idle: "",
    running: '<span class="dots"><i></i><i></i><i></i></span>',
    waiting: '<span class="question">?</span>',
    ended: '<svg class="done"><use href="#check"/></svg>',
  };
  function render() {
    display.dataset.state = state;
    display.dataset.tool = state === "idle" ? "both" : tool;
    const visibleTool = display.dataset.tool;
    notch.querySelector(".single-hit").hidden = visibleTool === "both";
    notch.querySelectorAll(".notch-tool").forEach(button => { button.tabIndex = visibleTool === "both" ? 0 : -1; });
    notch.querySelector(".single-hit").setAttribute("aria-label", `演示打开 ${names[visibleTool]} 客户端`);
    document.querySelectorAll(".task-indicator").forEach(el => { el.innerHTML = indicators[state]; });
    document.querySelectorAll(".state-controls button").forEach(el => el.setAttribute("aria-pressed", String(el.dataset.state === state)));
    document.querySelectorAll(".tool-controls button").forEach(el => {
      el.setAttribute("aria-pressed", String(el.dataset.tool === tool));
      el.disabled = state === "idle" && el.dataset.tool !== "both";
    });
    const [title, description] = descriptions[state];
    document.querySelector("#client-name").textContent = names[visibleTool];
    document.querySelector("#work-title").textContent = title;
    document.querySelector("#work-description").textContent = description;
    const stateLabel = document.querySelector(`.state-controls button[data-state="${state}"]`).textContent;
    document.querySelector("#demo-status").textContent = `${names[visibleTool]}：${stateLabel}`;
    document.querySelector(".window-claude").hidden = visibleTool === "codex";
    document.querySelector(".window-codex").hidden = visibleTool === "claude";
  }
  function closeQuota(restoreFocus = false) {
    if (quota.hidden) return;
    quota.hidden = true;
    if (restoreFocus && lastQuotaTrigger && !lastQuotaTrigger.hidden) lastQuotaTrigger.focus();
  }
  function toggleQuota(trigger) {
    clearTimeout(clickTimer);
    if (!quota.hidden) { closeQuota(true); return; }
    lastQuotaTrigger = trigger;
    quota.hidden = false;
    document.querySelector("#close-quotas").focus();
  }
  function showToast(message) {
    clearTimeout(toastTimer);
    toast.textContent = message;
    toast.classList.add("visible");
    toastTimer = setTimeout(() => toast.classList.remove("visible"), 3200);
  }
  document.querySelectorAll(".state-controls button").forEach(button => button.addEventListener("click", () => {
    clearTimeout(clickTimer); state = button.dataset.state;
    if (state === "idle") tool = "both";
    closeQuota(); render();
  }));
  document.querySelectorAll(".tool-controls button").forEach(button => button.addEventListener("click", () => {
    clearTimeout(clickTimer); tool = button.dataset.tool; closeQuota(); render();
  }));
  function openClient(event) {
    const button = event.target.closest("button");
    if (!button) return;
    const client = button.classList.contains("single-hit") ? tool : button.dataset.client;
    clearTimeout(clickTimer);
    clickTimer = setTimeout(() => {
      closeQuota();
      document.querySelector("#client-name").textContent = names[client];
      const window = document.querySelector("#work-window");
      window.classList.add("focused");
      showToast(`演示：切换到 ${names[client]} 客户端`);
      setTimeout(() => window.classList.remove("focused"), 1200);
    }, event.detail === 0 ? 0 : 350);
  }
  notch.addEventListener("click", openClient);
  notch.addEventListener("dblclick", event => {
    clearTimeout(clickTimer); event.preventDefault();
    toggleQuota(event.target.closest("button") || notch.querySelector("button"));
  });
  // Keyboard users can open the same quota preview without a double click.
  notch.addEventListener("keydown", event => {
    if (event.key.toLowerCase() === "q") {
      event.preventDefault(); clearTimeout(clickTimer);
      toggleQuota(event.target.closest("button"));
    }
  });
  document.querySelector("#close-quotas").addEventListener("click", () => closeQuota(true));
  document.addEventListener("keydown", event => { if (event.key === "Escape") closeQuota(true); });
  document.addEventListener("click", event => { if (!quota.contains(event.target) && !notch.contains(event.target)) closeQuota(); });
  copyButton.addEventListener("click", async () => {
    const command = document.querySelector("#install-command").textContent;
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(command);
      clearTimeout(copyTimer); copyButton.classList.add("copied");
      copyButton.querySelector("span").textContent = "已复制";
      document.querySelector("#copy-result").textContent = "安装命令已复制到剪贴板。";
      copyTimer = setTimeout(() => {
        copyButton.classList.remove("copied"); copyButton.querySelector("span").textContent = "复制命令";
      }, 3500);
    } catch {
      const range = document.createRange(); range.selectNodeContents(document.querySelector("#install-command"));
      window.getSelection().removeAllRanges(); window.getSelection().addRange(range);
      document.querySelector("#copy-result").textContent = "剪贴板权限不可用，已选中命令，请手动复制。";
      copyButton.querySelector("span").textContent = "按 ⌘C 复制";
    }
  });
  render();
})();
