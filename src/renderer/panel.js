"use strict";
const $ = (id) => document.getElementById(id);
const fields = {
  workbuddy: ["providers", "workbuddy"],
  "menu-workbuddy": ["menuBar", "workbuddy"],
  claude: ["providers", "claude"],
  codex: ["providers", "codex"],
  "idle-quota": ["idleQuota"],
  "menu-claude": ["menuBar", "claude"],
  "menu-codex": ["menuBar", "codex"],
  login: ["startAtLogin"],
  notifications: ["notifications"],
  "assistance-notifications": ["assistanceNotifications"],
  "swap-gestures": ["swapGestures"],
};
let loginFlight;
let settings, queue = Promise.resolve(), revision = 0;
const pending = new Map(), errors = new Map();
const valueAt = (data, keys) => keys.reduce((value, key) => value?.[key], data);
function syncControls() {
  for (const [id, keys] of Object.entries(fields))
    if (!pending.has(id)) $(id).checked = valueAt(settings, keys) === true;
  $("gesture-description").textContent = $("swap-gestures").checked
    ? "双击打开控制页，右击查看用量与额度。" : "右击打开控制页，双击查看用量与额度。";
}
function render(data) {
  settings = data.settings;
  syncControls();
  $("version").textContent = `v${data.version}`;
  if (data.update) renderUpdate(data.update);
}
for (const [id, keys] of Object.entries(fields)) {
  $(id).onchange = () => {
    const checked = $(id).checked, version = ++revision;
    const patch = keys.length === 2
      ? { [keys[0]]: { [keys[1]]: checked } }
      : { [keys[0]]: checked };
    pending.set(id, version);
    if (id === "swap-gestures") $("gesture-feedback").textContent = "将同时交换两项操作，不会出现手势冲突。";
    errors.delete(id);
    $("notice").textContent = [...errors.values()].join("；");
    // Serialize partial updates: rapid clicks keep their order and never write
    // an old snapshot of another switch back over the user's latest choice.
    queue = queue.then(async () => {
      try {
        const wasWorkbuddyEnabled = settings?.providers?.workbuddy === true;
        const result = await macNotch.save({ ...patch, setupComplete: true });
        if (result.settings) settings = result.settings;
        if (!result.ok) throw new Error(result.error || "设置未能保存，请重试");
        if(id==='workbuddy' && checked && !wasWorkbuddyEnabled) void startWorkbuddyLogin(false);
        if(id==='workbuddy' && !checked && loginFlight) void macNotch.workbuddyCancel();
        if (id === "swap-gestures") $("gesture-feedback").textContent = result.settings.swapGestures
          ? "已交换：双击打开控制页，右击查看额度。" : "已恢复：右击打开控制页，双击查看额度。";
      } catch (error) {
        if (pending.get(id) === version)
          errors.set(id, `修改未生效：${error.message}`);
      } finally {
        if (pending.get(id) === version) pending.delete(id);
        syncControls();
        $("notice").textContent = [...errors.values()].join("；");
      }
    });
  };
}
$("settings").onsubmit = (event) => event.preventDefault();
$("quit").onclick = () => macNotch.quit();
macNotch.onNotice((text) => ($("notice").textContent = text));
macNotch.onState(render);
macNotch.get().then(render);

function renderUpdate(update) {
  const busy = ["checking", "downloading"].includes(update.status);
  $("check-update").disabled = busy;
  $("download-update").hidden = !update.version || !["available", "error"].includes(update.status);
  $("open-update").hidden = update.status !== "downloaded";
  $("update-progress").hidden = update.status !== "downloading";
  $("update-progress").value = update.progress || 0;
  $("release-notes").hidden = !update.notes;
  $("release-notes-text").textContent = update.notes || "";
  $("update-status").textContent = {
    idle: `当前版本 v${update.current}，可手动检查更新。`, checking: "正在检查更新…",
    current: `当前 v${update.current} 已是所选渠道的最新版本。`,
    available: `发现新版本 v${update.version}，可下载安装包。`,
    downloading: `正在下载 v${update.version} · ${update.progress || 0}%`,
    downloaded: `v${update.version} 下载并校验完成，打开安装包进行更新。`,
    error: update.error || "检查失败，请稍后重试。"
  }[update.status];
}
for (const [id, action] of [["check-update", "checkUpdate"], ["download-update", "downloadUpdate"], ["open-update", "openUpdate"]])
  $(id).onclick = async () => { try { await macNotch[action](); } catch (error) { $("update-status").textContent = error.message; } };
for (const button of document.querySelectorAll("[data-preview]"))
  button.onclick = () => macNotch.previewNotification(button.dataset.preview);

function startWorkbuddyLogin(force) {
  if(loginFlight)return loginFlight;
  const button=$('workbuddy-login'), cancel=$('workbuddy-cancel'), status=$('workbuddy-login-status');
  button.disabled=true;cancel.hidden=false;status.textContent='请在浏览器完成 WorkBuddy 授权；任务状态仍可正常使用。';
  loginFlight=macNotch.workbuddyLogin(force).then(result=>{
    status.textContent=result.ok ? (result.skipped?'已有登录，无需重复授权。':'授权成功，正在更新剩余额度。') : result.errorCode==='CANCELED'?'已取消授权，可点击重新登录。':result.errorCode==='PERSISTENCE_FAILED'?'无法安全保存授权，请检查系统钥匙串后重试。':'授权未完成或已超时，请点击重新登录。';
  }).catch(()=>{status.textContent='无法打开授权，请点击重新登录。';}).finally(()=>{loginFlight=null;button.disabled=false;cancel.hidden=true;});
  return loginFlight;
}
if($('workbuddy-login'))$('workbuddy-login').onclick=()=>void startWorkbuddyLogin(true);
if($('workbuddy-cancel'))$('workbuddy-cancel').onclick=()=>void macNotch.workbuddyCancel();
