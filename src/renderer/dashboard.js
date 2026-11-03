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
  let latest, selected, period = "day";
  function el(tag, text, cls) {
    const e = document.createElement(tag);
    if (text !== undefined) e.textContent = text;
    if (cls) e.className = cls;
    return e;
  }
  function render(data) {
    latest = data;
    // Preserve the visible content during exit; rebuild on the next expansion.
    if (!data.expanded) return;
    const u = data.usage,
      enabled = Object.keys(data.settings.providers).filter(
        (p) => data.settings.providers[p],
      );
    const view = u.periods?.[period] || {bins:u.days, total:u.today};
    const bins = view.bins;
    // A retained date can disappear when the calendar week or month rolls over.
    const selectedBin = bins.find(d => d.date === selected);
    if (!selectedBin) selected = undefined;
    const day = selectedBin || view.total;
    const labels = {day:"今日",week:"本周",month:"本月"};
    $("day-label").textContent = (selected ? selected : labels[period]) + " Token";
    $("tokens").textContent = u.loading ? "—" : number(day.tokens);
    $("tokens").classList.toggle("large-total", day.tokens >= 1e9);
    $("cost").textContent = u.loading ? "正在读取本机用量…" :
      day.unpricedTokens === day.tokens && day.tokens > 0 ? "暂无对应模型的价格" :
      `API 费用估算 ${money(day.cost)}${day.unpricedTokens ? " 起" : ""}`;
    $("breakdown").replaceChildren(...enabled.map(p => el("span", `${p === "claude" ? "Claude" : "Codex"} ${compact(day[p])}`,p)));
    $("trend-label").textContent = period === "day" ? "今日 · 按小时" :
      `${period === "week" ? "本周 · 周一至今" : "本月 · 1日至今"}`;
    for (const button of document.querySelectorAll("[data-period]")) button.setAttribute("aria-pressed",String(button.dataset.period === period));
    $("chart").classList.toggle("dense", bins.length > 12);
    $("chart").setAttribute("aria-label",labels[period] + " Token 用量");
    const max = Math.max(1,...bins.map(d=>d.tokens));
    $("chart").replaceChildren(...bins.map((d,i)=>{
      const b=el("button",undefined,d.date===selected ? "selected" : "");
      b.title=`${d.date} · ${number(d.tokens)} Token`;
      b.setAttribute("aria-label",b.title); b.setAttribute("aria-pressed",String(d.date===selected));
      const column=el("span",undefined,"column");
      column.style.height=`${Math.max(3,d.tokens/max*78)}px`;
      for(const p of enabled){const segment=el("span",undefined,p);segment.style.height=`${d.tokens ? d[p]/d.tokens*100 : 0}%`;column.append(segment);}
      const label=period === "day" ? String(i) : String(Number(d.date.slice(-2)));
      b.append(column,el("span",bins.length<=12 || i% (period === "day" ? 6 : 5)===0 || i===bins.length-1 ? label : "\u00a0"));
      b.onclick=()=>{selected=selected===d.date ? undefined : d.date;render(latest);};
      return b;
    }));
    $("quotas").classList.toggle("single", enabled.length === 1);
    $("quotas").replaceChildren(
      ...enabled.map((p) => {
        const q = data.quotas[p],
          article = el("article"),
          identity = el("div", undefined, "quota-identity"),
          title = el("h2", p === "claude" ? "Claude" : "Codex"),
          image = el("img"),
          windows = el("div", undefined, "quota-windows");
        image.src = `../../assets/${p}.svg`;
        image.alt = "";
        title.prepend(image);
        windows.style.setProperty("--quota-columns", Math.max(2, q.windows.length));
        identity.append(title);
        article.append(identity, windows);
        for (const w of q.windows) {
          const cell = el("div", undefined, "quota-window"),
            row = el("div", undefined, "quota-row");
          row.append(
            el("span", w.label),
            el("b", `${Math.round(w.remaining)}%`),
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
          cell.append(row, track);
          if (w.resetAt)
            cell.append(
              el(
                "small",
                `${new Date(w.resetAt).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })} 重置`,
                "reset",
              ),
            );
          windows.append(cell);
        }
        if (q.error) {
          if (q.windows.length) {
            const warning = el("span", "暂未更新", "quota-stale");
            warning.title = `当前显示上次额度。${q.error}`;
            warning.tabIndex = 0;
            warning.setAttribute("aria-label", warning.title);
            identity.append(warning);
            article.classList.add("stale");
          } else windows.append(el("p", q.error, "quota-error"));
        } else if (!q.windows.length) windows.append(el("p", "正在读取额度…", "quota-empty"));
        return article;
      }),
    );
    $("updated").textContent = u.loading
      ? ""
      : `${new Date(u.updatedAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })} 更新`;
    $("notice").textContent =
      u.error || (u.incomplete ? "部分记录暂时无法读取，稍后自动重试" : "");
  }
  for (const button of document.querySelectorAll("[data-period]")) button.onclick = () => {
    period = button.dataset.period; selected = undefined; render(latest);
  };
  $("collapse").onclick = () => macNotch.collapse();
  macNotch.onState(render);
  macNotch.get().then(render);
})();
