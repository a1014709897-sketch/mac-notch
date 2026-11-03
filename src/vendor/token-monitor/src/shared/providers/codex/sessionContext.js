'use strict';

/**
 * Codex reports its own context window, so this reader never estimates one.
 *
 * Every turn appends a `token_count` event to the rollout transcript carrying
 * `info.model_context_window` (the window Codex is actually running with, which
 * is a per-session fact — `config.toml` can raise it, so a model-name table
 * would be wrong for exactly the sessions users care about) and
 * `info.last_token_usage` (the most recent request's usage, i.e. what the
 * window currently holds). `total_token_usage` beside it is the session's
 * cumulative spend and is deliberately not used here: it exceeds the window on
 * any long session.
 *
 * Codex's own TUI subtracts a fixed baseline allowance from both sides before
 * turning this into a percentage, so its "% left" reads a little lower than
 * the raw ratio here. We report what the transcript states and let the UI
 * derive the ratio, rather than reproducing an undocumented constant that
 * would silently rot.
 */

const fs = require('node:fs');
const { isCompressedCodexTranscript, readCompressedCodexTranscript } = require('./transcript');
const { normalizeSessionContext } = require('../../sessionContext');
const { normalizeReasoningEffort } = require('../../sessionLive');

const TAIL_READ_BUDGETS = [256 * 1024, 1024 * 1024];
const TURN_READ_MAX_BYTES = 8 * 1024 * 1024;
const MAX_METADATA_LINE_BYTES = 64 * 1024;
const MAX_PENDING_INPUT_CALLS = 32;
const stateCache = new Map();

function contextFromInfo(info) {
  const usage = info.last_token_usage || info.lastTokenUsage;
  return normalizeSessionContext({
    contextTokens: usage && typeof usage === 'object'
      ? (usage.total_tokens ?? usage.totalTokens) : 0,
    contextWindow: info.model_context_window ?? info.modelContextWindow ?? info.context_window ?? info.contextWindow
  });
}

function applyLine(state, line, position, contextStart) {
  // An unreadable new configuration cannot leave the previous turn's badge.
  // Only inspect the bounded record prefix; never decode large tool output.
  const configuration = /"type"\s*:\s*"turn_context"/.test(line.subarray(0, 512).toString('utf8'));
  if (configuration && position >= contextStart) state.reasoningEffort = null;
  // Metadata records are small; never decode arbitrarily large tool output.
  if (!line.length || line.length > MAX_METADATA_LINE_BYTES) return;
  let entry;
  try { entry = JSON.parse(line.toString('utf8')); } catch (_) { return; }
  if (!entry || typeof entry !== 'object') return;
  const payload = entry.payload && typeof entry.payload === 'object' ? entry.payload : entry;
  if (entry.type === 'turn_context' && position >= contextStart) {
    state.reasoningEffort = normalizeReasoningEffort(
      Object.prototype.hasOwnProperty.call(payload, 'effort') ? payload.effort : payload.reasoning_effort
    );
  }
  if (payload.type === 'token_count' && payload.info && position >= contextStart) {
    const context = contextFromInfo(payload.info);
    if (context) state.context = context;
  }
  if (payload.type === 'task_complete' || payload.type === 'turn_aborted') {
    state.turnEnded = true;
    state.turnAborted = payload.type === 'turn_aborted';
    state.completionDescription = !state.turnAborted && typeof payload.last_agent_message === 'string'
      ? payload.last_agent_message.slice(0, 16384) : '';
    state.pendingInputCalls.clear();
  } else if (payload.type === 'task_started') {
    state.taskIdentity = payload.turn_id || entry.timestamp || String(position);
    state.reasoningEffort = null;
    state.turnEnded = false;
    state.turnAborted = false;
    state.completionDescription = '';
    state.pendingInputCalls.clear();
  }
  // Track protocol identity only. Error results retire a request just like an
  // answer; neither question text nor collaboration mode determines waiting.
  const callId = typeof payload.call_id === 'string' && payload.call_id.length <= 256
    ? payload.call_id : '';
  // Async questions acknowledge delivery immediately; only matching UI replies
  // resolve their question indices. Do not interpret arbitrary prose as replies.
  if (callId && payload.type === 'function_call' && payload.name === 'request_user_input_async') {
    try {
      const questions = JSON.parse(payload.arguments).questions;
      if (Array.isArray(questions) && questions.length > 0 && questions.length <= 32 && state.asyncInputs.size < 32)
        state.asyncInputs.set(callId, { accepted: false, pending: questions.map((_q, i) => i) });
    } catch (_) { /* Missing arguments cannot establish an answerable question. */ }
  }
  if (callId && payload.type === 'function_call_output' && state.asyncInputs.has(callId)) {
    try {
      if (JSON.parse(payload.output).accepted === true) state.asyncInputs.get(callId).accepted = true;
      else state.asyncInputs.delete(callId);
    } catch (_) { state.asyncInputs.delete(callId); }
  }
  if (payload.type === 'message' && payload.role === 'user' && Array.isArray(payload.content)) {
    for (const part of payload.content) {
      if (part.type !== 'input_text' || typeof part.text !== 'string') continue;
      const match = part.text.match(/^<send_user_message_question_reply>([\s\S]*?)<\/send_user_message_question_reply>\s*$/);
      if (!match) {
        // A new ordinary user instruction supersedes older unanswered questions.
        // Context-only injected XML does not acknowledge or cancel a question.
        const text = part.text.trim();
        if (text && !text.startsWith('<') && !text.startsWith('# AGENTS.md')) state.asyncInputs.clear();
        continue;
      }
      try {
        const replies = JSON.parse(match[1].replace(/^\\n|\\n$/g, '').trim());
        if (!Array.isArray(replies)) continue;
        for (const reply of replies) {
          const [tool, id, index] = JSON.parse(reply.questionItemId);
          const request = state.asyncInputs.get(id);
          if (tool !== 'request_user_input_async' || !request || !Number.isInteger(index)) continue;
          request.pending = request.pending.filter(i => i !== index);
          if (!request.pending.length) state.asyncInputs.delete(id);
        }
      } catch (_) { /* Malformed or unrelated replies cannot clear pending UI. */ }
    }
  }
  if (payload.type === 'turn_aborted') state.asyncInputs.clear();
  if (callId && payload.type === 'function_call' && payload.name === 'request_user_input') {
    if (state.pendingInputCalls.size < MAX_PENDING_INPUT_CALLS) state.pendingInputCalls.add(callId);
  } else if (callId && payload.type === 'function_call_output') {
    state.pendingInputCalls.delete(callId);
  }
}

function consumeBytes(state, chunk, start, contextStart) {
  const prefix = state.trailing;
  const bytes = prefix.length ? Buffer.concat([prefix, chunk]) : chunk;
  const base = start - prefix.length;
  let lineStart = 0;
  for (let index = 0; index < bytes.length; index += 1) {
    if (bytes[index] !== 0x0a) continue;
    if (!state.droppingLine) applyLine(state, bytes.subarray(lineStart, index), base + lineStart, contextStart);
    state.droppingLine = false;
    lineStart = index + 1;
  }
  const remainder = bytes.subarray(lineStart);
  if (state.droppingLine || remainder.length > MAX_METADATA_LINE_BYTES) {
    if (!state.droppingLine) applyLine(state, remainder, base + lineStart, contextStart);
    state.trailing = Buffer.alloc(0);
    state.droppingLine = true;
  } else state.trailing = Buffer.from(remainder);
}

// Context, turn state and reasoning effort share one decoded index.
// Append-only updates read only new bytes and retain the prior session state.
function readCodexSessionState(filePath, deps = {}) {
  const cache = deps.cache || stateCache;
  const fsApi = deps.fs || fs;
  let fd;
  try {
    const stat = fsApi.statSync(filePath);
    const identity = `${stat.dev}:${stat.ino}`;
    const cached = cache.get(filePath);
    if (cached?.identity === identity && cached.size === stat.size && cached.mtimeMs === stat.mtimeMs) return cached;
    const compressed = isCompressedCodexTranscript(filePath);
    const appendOnly = !compressed && cached?.identity === identity && stat.size > cached.size;
    const state = appendOnly ? { ...cached, pendingInputCalls: new Set(cached.pendingInputCalls), asyncInputs: new Map([...cached.asyncInputs].map(([id, request]) => [id, { ...request, pending: [...request.pending] }])) }
      : { context: null, turnEnded: undefined, pendingInputCalls: new Set(), asyncInputs: new Map(), trailing: Buffer.alloc(0), droppingLine: false };
    if (compressed) {
      const bytes = readCompressedCodexTranscript(filePath, deps);
      const start = Math.max(0, bytes.length - TURN_READ_MAX_BYTES);
      const contextStart = Math.max(0, bytes.length - TAIL_READ_BUDGETS[1]);
      state.droppingLine = start > 0;
      for (let position = start; position < bytes.length; position += TAIL_READ_BUDGETS[0]) {
        consumeBytes(state, bytes.subarray(position, position + TAIL_READ_BUDGETS[0]), position, contextStart);
      }
      if (!state.droppingLine) applyLine(state, state.trailing, bytes.length - state.trailing.length, contextStart);
      Object.assign(state, { identity, size: stat.size, mtimeMs: stat.mtimeMs,
        waitingForInput: [...state.asyncInputs.values()].some(request => request.accepted) || (state.turnEnded !== true && state.pendingInputCalls.size > 0) });
      if (cache.size >= 512 && !cache.has(filePath)) cache.delete(cache.keys().next().value);
      if ([...state.asyncInputs.values()].some(request => request.accepted)) state.turnEnded = false;
      cache.set(filePath, state);
      return state;
    }
    fd = fsApi.openSync(filePath, 'r');
    let start;
    const chunks = [];
    if (appendOnly) {
      start = cached.size;
    } else {
      // Widen only for an absent turn boundary. Each earlier segment is read
      // once; context and effort still use the newest 1 MiB only.
      start = stat.size;
      let boundaryFound = false;
      while (start > 0 && stat.size - start < TURN_READ_MAX_BYTES) {
        const length = Math.min(chunks.length ? TAIL_READ_BUDGETS[0] : TAIL_READ_BUDGETS[1], start);
        start -= length;
        const bytes = Buffer.alloc(length);
        const read = fsApi.readSync(fd, bytes, 0, length, start);
        if (read !== length) throw new Error('Incomplete transcript read');
        chunks.unshift(bytes);
        const boundaryText = Buffer.concat([bytes, chunks[1]?.subarray(0, 128) || Buffer.alloc(0)]).toString('utf8');
        boundaryFound = /"type"\s*:\s*"(?:task_complete|task_started|turn_aborted)"/.test(boundaryText) || boundaryFound;
        if (stat.size - start >= TAIL_READ_BUDGETS[1] && boundaryFound) break;
      }
      state.droppingLine = start > 0;
    }
    const contextStart = appendOnly ? 0 : Math.max(0, stat.size - TAIL_READ_BUDGETS[1]);
    let position = start;
    if (appendOnly) {
      while (position < stat.size) {
        const length = Math.min(TAIL_READ_BUDGETS[0], stat.size - position);
        const bytes = Buffer.alloc(length);
        const read = fsApi.readSync(fd, bytes, 0, length, position);
        if (read !== length) throw new Error('Incomplete transcript read');
        consumeBytes(state, bytes, position, contextStart);
        position += length;
      }
    } else {
      for (const bytes of chunks) {
        consumeBytes(state, bytes, position, contextStart);
        position += bytes.length;
      }
    }
    // A complete final record without a newline is valid. Keep its bytes so
    // a later append can finish a partial record.
    if (!state.droppingLine) applyLine(state, state.trailing, stat.size - state.trailing.length, contextStart);
    Object.assign(state, { identity, size: stat.size, mtimeMs: stat.mtimeMs,
      waitingForInput: [...state.asyncInputs.values()].some(request => request.accepted) || (state.turnEnded !== true && state.pendingInputCalls.size > 0) });
    if (cache.size >= 512 && !cache.has(filePath)) cache.delete(cache.keys().next().value);
    if ([...state.asyncInputs.values()].some(request => request.accepted)) state.turnEnded = false;
    cache.set(filePath, state);
    return state;
  } catch (_) {
    return {};
  } finally {
    if (fd !== undefined) { try { fsApi.closeSync(fd); } catch (_) {} }
  }
}

function readCodexSessionContext(filePath, deps = {}) {
  return readCodexSessionState(filePath, deps).context || null;
}

function readCodexTurnEnded(filePath, deps = {}) {
  return readCodexSessionState(filePath, deps).turnEnded;
}

module.exports = { TAIL_READ_BUDGETS, readCodexSessionState, readCodexSessionContext, readCodexTurnEnded };
