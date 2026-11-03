"use strict";
const $ = (id) => document.getElementById(id);
let initial = false;
function render(data) {
  if (!initial) {
    for (const p of ["claude", "codex"])
      $(p).checked = data.settings.providers[p];
    $("login").checked = data.settings.startAtLogin;
    initial = true;
  }
  $("version").textContent = `v${data.version}`;
  $("save").textContent = data.settings.setupComplete ? "保存设置" : "开始使用";
}
$("settings").onsubmit = async (e) => {
  e.preventDefault();
  $("save").disabled = true;
  try {
    const result = await macNotch.save({
      providers: { claude: $("claude").checked, codex: $("codex").checked },
      startAtLogin: $("login").checked,
      setupComplete: true,
    });
    if (result.ok) {
      $("notice").textContent = "";
      macNotch.closeSettings();
    } else $("notice").textContent = result.error;
  } finally {
    $("save").disabled = false;
  }
};
$("quit").onclick = () => macNotch.quit();
macNotch.onNotice((t) => ($("notice").textContent = t));
macNotch.onState(render);
macNotch.get().then(render);
