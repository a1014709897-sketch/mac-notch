"use strict";
(() => {
  const $ = (id) => document.getElementById(id),
    number = (n) => Math.round(n).toLocaleString(),
    money = (n) => `$${n.toFixed(2)}`;
  const compact = (n) =>
    new Intl.NumberFormat("zh-CN", {
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(n);
  let latest, selected;
  function el(tag, text, cls) {
    const e = document.createElement(tag);
    if (text !== undefined) e.textContent = text;
    if (cls) e.className = cls;
    return e;
  }
  function render(data) {
    latest = data;
    const u = data.usage,
      enabled = Object.keys(data.settings.providers).filter(
        (p) => data.settings.providers[p],
      );
    const day = u.days.find((d) => d.date === selected) || u.today;
    $("day-label").textContent =
      day.date === u.today.date
        ? "今日 Token"
        : `${day.date.slice(5).replace("-", "月")}日 Token`;
    $("tokens").textContent = u.loading ? "—" : number(day.tokens);
    $("tokens").style.fontSize = day.tokens >= 1e9 ? "32px" : "";
    $("cost").textContent = u.loading
      ? "正在读取本机用量…"
      : day.unpricedTokens === day.tokens && day.tokens > 0
        ? "暂无对应模型的价格"
        : `API 费用估算 ${money(day.cost)}${day.unpricedTokens ? " 起" : ""}`;
    $("breakdown").replaceChildren(
      ...enabled.map((p) =>
        el(
          "span",
          `${p === "claude" ? "Claude" : "Codex"} ${compact(day[p])}`,
          p,
        ),
      ),
    );
    $("week-tokens").textContent =
      `${compact(u.days.reduce((n, d) => n + d.tokens, 0))} Token`;
    const max = Math.max(1, ...u.days.map((d) => d.tokens));
    $("chart").replaceChildren(
      ...u.days.map((d) => {
        const b = el(
          "button",
          undefined,
          d.date === day.date ? "selected" : "",
        );
        b.title = `${d.date} · ${number(d.tokens)} Token`;
        b.setAttribute("aria-label", b.title);
        b.setAttribute("aria-pressed", String(d.date === day.date));
        const column = el("span", undefined, "column");
        column.style.height = `${Math.max(3, (d.tokens / max) * 94)}px`;
        for (const p of enabled) {
          const segment = el("span", undefined, p);
          segment.style.height = `${d.tokens ? (d[p] / d.tokens) * 100 : 0}%`;
          column.append(segment);
        }
        b.append(
          column,
          el(
            "span",
            d.date === u.today.date ? "今天" : String(Number(d.date.slice(-2))),
          ),
        );
        b.onclick = () => {
          selected = d.date;
          render(latest);
        };
        return b;
      }),
    );
    $("quotas").classList.toggle("single", enabled.length === 1);
    $("quotas").replaceChildren(
      ...enabled.map((p) => {
        const q = data.quotas[p],
          article = el("article"),
          title = el("h2", p === "claude" ? "Claude" : "Codex"),
          image = el("img");
        image.src = `../../assets/${p}.svg`;
        image.alt = "";
        title.prepend(image);
        article.append(title);
        for (const w of q.windows) {
          const row = el("div", undefined, "quota-row");
          row.append(
            el("span", w.label),
            el("b", `${Math.round(w.remaining)}% 剩余`),
          );
          const track = el("div", undefined, "quota-track"),
            fill = el("div", undefined, "quota-fill");
          fill.style.width = `${w.remaining}%`;
          track.append(fill);
          track.setAttribute("role", "meter");
          track.setAttribute("aria-label", w.label + "剩余额度");
          track.setAttribute("aria-valuenow", String(w.remaining));
          track.setAttribute("aria-valuemin", "0");
          track.setAttribute("aria-valuemax", "100");
          article.append(row, track);
          if (w.resetAt)
            article.append(
              el(
                "small",
                `${new Date(w.resetAt).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })} 重置`,
                "reset",
              ),
            );
        }
        if (q.error)
          article.append(
            el("p", `${q.stale ? "上次额度 · " : ""}${q.error}`, "quota-error"),
          );
        return article;
      }),
    );
    $("updated").textContent = u.loading
      ? ""
      : `本机用量 ${new Date(u.updatedAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}`;
    $("usage-note").textContent =
      "仅统计本机记录 · 费用为标准 API 价格估算，不是订阅账单" +
      (u.days.some((d) => d.unpricedTokens) ? " · 部分模型未计价" : "");
    $("notice").textContent =
      u.error || (u.incomplete ? "部分记录暂时无法读取，下次刷新将重试" : "");
  }
  $("refresh").onclick = () => {
    macNotch.refresh();
    $("notice").textContent = "正在刷新…";
  };
  $("settings").onclick = () => macNotch.settings();
  $("collapse").onclick = () => macNotch.collapse();
  macNotch.onState(render);
  macNotch.get().then(render);
})();
