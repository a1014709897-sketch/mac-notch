"use strict";
const $ = (id) => document.getElementById(id);
let initial = false;
function text(tag, value, cls) {
  const n = document.createElement(tag);
  n.textContent = value;
  if (cls) n.className = cls;
  return n;
}
function render(data) {
  $("quotas").replaceChildren();
  for (const provider of ["claude", "codex"]) {
    const q = data.quotas[provider],
      article = document.createElement("article"),
      title = text("h2", provider === "claude" ? "Claude" : "Codex"),
      image = document.createElement("img");
    image.src = `../../assets/${provider}.svg`;
    image.alt = "";
    title.prepend(image);
    article.append(title);
    for (const w of q.windows) {
      const row = document.createElement("div");
      row.className = "row";
      row.append(
        text("span", w.label),
        text("b", `${Math.round(w.remaining)}% 剩余`),
      );
      const bar = document.createElement("progress");
      bar.max = 100;
      bar.value = w.remaining;
      article.append(row, bar);
      if (w.resetAt)
        article.append(
          text("small", `重置 ${new Date(w.resetAt).toLocaleString()}`),
        );
    }
    if (q.error)
      article.append(
        text("p", `${q.stale ? "缓存数据 · " : ""}${q.error}`, "error"),
      );
    if (q.updatedAt)
      article.append(
        text(
          "div",
          `更新于 ${new Date(q.updatedAt).toLocaleTimeString()}`,
          "muted",
        ),
      );
    $("quotas").append(article);
  }
  if (!initial) {
    $("login").checked = data.settings.startAtLogin;
    $("proxy").value = data.settings.proxy;
    initial = true;
  }
  $("cookieState").textContent = data.settings.hasClaudeCookie
    ? "已加密保存网页凭据"
    : "未保存网页凭据";
  $("demo").hidden = !data.demo;
}
$("refresh").onclick = () => macNotch.refresh();
$("close").onclick = () => macNotch.panel();
$("quit").onclick = () => macNotch.quit();
$("settings").onsubmit = async (e) => {
  e.preventDefault();
  const result = await macNotch.save({
    startAtLogin: $("login").checked,
    proxy: $("proxy").value,
    claudeCookie: $("cookie").value,
  });
  $("notice").textContent = result.ok ? "已保存" : result.error;
  $("cookie").value = "";
};
$("clear").onclick = async () => {
  const result = await macNotch.save({ clearCookie: true });
  $("notice").textContent = result.ok ? "网页凭据已清除" : result.error;
};
for (const b of document.querySelectorAll("[data-state]"))
  b.onclick = () => macNotch.demo(b.dataset.state);
macNotch.onNotice((t) => ($("notice").textContent = t));
macNotch.onState(render);
macNotch.get().then(render);
