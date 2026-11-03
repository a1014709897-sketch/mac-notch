"use strict";
(() => {
  const display = document.querySelector("#demo-display");
  const notch = document.querySelector("#demo-notch");
  const quota = document.querySelector("#quota-panel");
  const toast = document.querySelector("#demo-toast");
  const motionButton = document.querySelector("#motion-toggle");
  const copyButton = document.querySelector("#copy-command");
  let state = "running", tool = "both", clickTimer, toastTimer, copyTimer;
  let lastQuotaTrigger = null;
  const names = { both: "Claude + Codex", claude: "Claude", codex: "Codex" };
  const descriptions = {
    idle: ["都在这里，随时开工。", "两位小搭档安静待命，不展开，不打断。", "没有任务时，两位小伙伴常驻。悬停不展开，单击即可回到客户端。"],
    running: ["各忙各的，也配合默契。", "Claude 在梳理思路，Codex 在实现代码。", "小怪兽轻跳，Codex 旋转。三个小点告诉你，它们还在忙。"],
    waiting: ["有个决定，留给你。", "淡金色问号，提醒你回到客户端协助。", "问号会等到实际回答或任务继续后才消失。仅点击打开客户端，不会当作已协助。"],
    ended: ["这轮搞定，等你来看。", "一个轻轻的勾，留住刚刚完成的进展。", "完成后显示细线勾。应用依据具体会话的已读信号消除提醒，不会批量清空其他任务。"],
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
    const [title, description, caption] = descriptions[state];
    document.querySelector("#client-name").textContent = names[visibleTool];
    document.querySelector("#work-title").textContent = state === "running" && tool !== "both" ? `${names[tool]} 正在专心工作。` : title;
    document.querySelector("#work-description").textContent = state === "running" && tool !== "both" ? "你继续手头的事，抬眼就能看到进度。" : description;
    document.querySelector("#state-caption").textContent = caption;
    document.querySelector(".window-claude").hidden = visibleTool === "codex";
    document.querySelector(".window-codex").hidden = visibleTool === "claude";
  }
  function closeQuota(restoreFocus = false) {
    if (quota.hidden) return;
    quota.hidden = true;
    if (restoreFocus && lastQuotaTrigger && !lastQuotaTrigger.hidden) lastQuotaTrigger.focus();
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
    lastQuotaTrigger = event.target.closest("button") || notch.querySelector("button");
    quota.hidden = !quota.hidden;
    if (!quota.hidden) document.querySelector("#close-quotas").focus();
  });
  // Keyboard users can open the same quota preview without a double click.
  notch.addEventListener("keydown", event => {
    if (event.key.toLowerCase() === "q") {
      event.preventDefault(); clearTimeout(clickTimer);
      lastQuotaTrigger = event.target.closest("button"); quota.hidden = false;
      document.querySelector("#close-quotas").focus();
    }
  });
  document.querySelector("#close-quotas").addEventListener("click", () => closeQuota(true));
  document.addEventListener("keydown", event => { if (event.key === "Escape") closeQuota(true); });
  document.addEventListener("click", event => { if (!quota.contains(event.target) && !notch.contains(event.target)) closeQuota(); });
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  function setMotion(paused) {
    document.body.classList.toggle("motion-paused", paused);
    motionButton.setAttribute("aria-pressed", String(paused));
    motionButton.textContent = paused ? "继续动画 ▷" : "暂停动画 Ⅱ";
    if (reducedMotion.matches) motionButton.textContent = "已遵循减少动态效果";
    motionButton.disabled = reducedMotion.matches;
  }
  setMotion(reducedMotion.matches);
  reducedMotion.addEventListener("change", () => setMotion(reducedMotion.matches));
  motionButton.addEventListener("click", () => setMotion(!document.body.classList.contains("motion-paused")));
  copyButton.addEventListener("click", async () => {
    const command = document.querySelector("#install-command").textContent;
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(command);
      clearTimeout(copyTimer); copyButton.classList.add("copied");
      copyButton.querySelector("span").textContent = "已复制，发给你的 Agent";
      document.querySelector("#copy-result").textContent = "安装命令已复制到剪贴板。";
      copyTimer = setTimeout(() => {
        copyButton.classList.remove("copied"); copyButton.querySelector("span").textContent = "复制安装命令";
      }, 3500);
    } catch {
      const range = document.createRange(); range.selectNodeContents(document.querySelector("#install-command"));
      window.getSelection().removeAllRanges(); window.getSelection().addRange(range);
      document.querySelector("#copy-result").textContent = "剪贴板权限不可用，已选中命令，请手动复制。";
      copyButton.querySelector("span").textContent = "已选中命令，请按 ⌘C 复制";
    }
  });
  render();
})();
