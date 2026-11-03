'use strict';

let native;
function frontmostTool() {
  if (process.platform !== 'darwin') return null;
  try {
    if (!native) {
      const koffi = require('koffi');
      const objc = koffi.load('/usr/lib/libobjc.A.dylib');
      koffi.load('/System/Library/Frameworks/AppKit.framework/AppKit');
      native = {
        cls: objc.func('objc_getClass', 'uintptr_t', ['str']),
        sel: objc.func('sel_registerName', 'uintptr_t', ['str']),
        get: objc.func('objc_msgSend', 'uintptr_t', ['uintptr_t', 'uintptr_t']),
        text: objc.func('objc_msgSend', 'str', ['uintptr_t', 'uintptr_t'])
      };
    }
    const { cls, sel, get, text } = native;
    const app = get(get(cls('NSWorkspace'), sel('sharedWorkspace')), sel('frontmostApplication'));
    const identifier = get(app, sel('bundleIdentifier'));
    const bundle = identifier ? text(identifier, sel('UTF8String')) : '';
    return { 'com.openai.codex': 'codex', 'com.anthropic.claudefordesktop': 'claude' }[bundle] || null;
  } catch { return null; }
}

function createTaskAttention() {
  const completedAt = new Map();
  let previous = null;
  return (items, foreground, now) => {
    const ended = new Set(items.filter(item => item.taskState === 'ended').map(item => item.provider));
    for (const provider of completedAt.keys()) if (!ended.has(provider)) completedAt.delete(provider);
    const dismiss = [];
    for (const provider of ended) {
      if (!completedAt.has(provider)) completedAt.set(provider, now);
      if (foreground === provider && (previous !== provider || now - completedAt.get(provider) >= 2000)) dismiss.push(provider);
    }
    previous = foreground;
    return dismiss;
  };
}
module.exports = { frontmostTool, createTaskAttention };
