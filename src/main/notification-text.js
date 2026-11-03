"use strict";
// A bounded plain-text preview, never HTML. Keep labels/code, discard formatting.
function notificationText(value, limit = 400) {
  if (typeof value !== "string") return "";
  const literals = [];
  let text = value.slice(0, 16384).replace(/\r\n?/g, "\n");
  text = text.replace(/^[ \t]{0,3}(`{3,}|~{3,})[^\n]*\n?/gm, "");
  text = text.replace(/(`+)([\s\S]*?)\1/g, (_match, _ticks, content) => {
    literals.push(content); return `\u0000${literals.length - 1}\u0000`;
  });
  text = text
    .replace(/^\s{0,3}\[[^\]\n]+\]:\s+\S+.*$/gm, "")
    .replace(/!?\[([^\]\n]*)\]\((?:[^()\n]|\([^()\n]*\))*\)/g, "$1")
    .replace(/!?\[([^\]\n]+)\]\[[^\]\n]*\]/g, "$1")
    .replace(/<(https?:\/\/[^>]+|[^<>\s]+@[^<>\s]+)>/g, "$1")
    .replace(/<!--[^]*?-->/g, "")
    .replace(/<\/?[A-Za-z][^>]*>/g, "")
    .replace(/^\s{0,3}(?:[-*_]\s*){3,}$/gm, "")
    .replace(/^\s{0,3}[=-]{2,}\s*$/gm, "")
    .replace(/^\s{0,3}(?:>\s*)+/gm, "")
    .replace(/^\s{0,3}#{1,6}\s+|\s+#+\s*$/gm, "")
    .replace(/^\s*(?:[-+*]|\d+[.)])\s+(?:\[[ xX]\]\s*)?/gm, "")
    .replace(/\*{1,3}([^*\n]+)\*{1,3}/g, "$1")
    .replace(/(^|[^\w])_{1,3}([^_\n]+)_{1,3}(?!\w)/g, "$1$2")
    .replace(/~~([^~\n]+)~~/g, "$1")
    .replace(/\\([\\`*_{}\[\]()#+.!>~-])/g, "$1")
    .replace(/&(?:amp|lt|gt|quot|apos|nbsp);/g, entity => ({
      "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&apos;": "'", "&nbsp;": " ",
    })[entity]);
  text = text.replace(/\u0000(\d+)\u0000/g, (_m, index) => literals[Number(index)] || "")
    .replace(/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g, " ")
    .replace(/\s+/g, " ").trim();
  return Array.from(text).slice(0, limit).join("");
}
module.exports = { notificationText };
