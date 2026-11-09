"use strict";
const { execFile } = require("node:child_process");

const focusClaude = `
  ObjC.import('AppKit');
  ObjC.import('CoreGraphics');
  function run() {
    const app = $.NSRunningApplication.runningApplicationsWithBundleIdentifier('com.anthropic.claudefordesktop').firstObject;
    if (app.isNil()) return 'open';
    if (!app.active && !app.activateWithOptions(2)) return 'open';
    // A closed or minimized last window needs the normal Dock reopen action.
    for (let attempt = 0; attempt < 5; attempt++) {
      const windows = ObjC.deepUnwrap(ObjC.castRefToObject($.CGWindowListCopyWindowInfo(17, 0)));
      if (windows.some(w => w.kCGWindowOwnerPID === app.processIdentifier && w.kCGWindowLayer === 0)) return 'focused';
      delay(0.1);
    }
    return 'open';
  }
`;

const tools = {
  workbuddy: { name: "WorkBuddy", bundle: "com.tencent.workbuddy.mac" },
  claude: { name: "Claude", bundle: "com.anthropic.claudefordesktop" },
  codex: { name: "Codex", bundle: "com.openai.codex" },
};

// Handle launch failures locally, without swallowing unrelated main-process errors.
function createToolLauncher({ execute = execFile, showMessageBox, now = Date.now } = {}) {
  const pending = new Set();
  let showingNotice = false;
  let lastNotice = -Infinity;

  return async function open(provider, url = null) {
    if (!Object.hasOwn(tools, provider) || pending.has(provider)) return false;
    const tool = tools[provider];
    pending.add(provider);
    try {
      if (provider === "claude" && !url) {
        const focused = await new Promise(resolve => {
          execute("/usr/bin/osascript", ["-l", "JavaScript", "-e", focusClaude], { timeout: 3000 }, (error, result) => {
            resolve(!error && result?.trim() === "focused");
          });
        });
        if (focused) return true;
      }
      // The Promise also catches synchronous spawn errors such as EPERM.
      await new Promise((resolve, reject) => {
        const args = ["-b", tool.bundle];
        if (url) args.push(url);
        execute("/usr/bin/open", args, { timeout: 10000 }, (error) => {
          if (error) reject(error); else resolve();
        });
      });
      return true;
    } catch {
      // No raw error, session URL or conversation data is shown or logged.
      // A failed launch does not establish whether the client is installed.
      if (!showingNotice && now() - lastNotice >= 30000) {
        showingNotice = true;
        lastNotice = now();
        try {
          await showMessageBox({
            type: "info",
            title: "Mac Notch",
            message: `暂时没能打开 ${tool.name}`,
            detail: `请先从“应用程序”中手动打开 ${tool.name}，再试一次。\n如果仍然无法跳转，请退出并重新打开 Mac Notch。`,
            buttons: ["知道了"],
            defaultId: 0,
            cancelId: 0,
            noLink: true,
          });
        } catch {
          // A dialog may fail during shutdown; never turn it into another popup.
        } finally {
          showingNotice = false;
        }
      }
      return false;
    } finally {
      pending.delete(provider);
    }
  };
}

module.exports = { createToolLauncher };
