'use strict';
// Extracted from Token Monitor credentialStore.js: read-only file boundary only.
const fs = require('node:fs');
function readRegularFileNoFollow(filePath, options = {}) {
  const fsApi = options.fs || fs;
  const constants = fsApi.constants || fs.constants;
  const description = options.description || 'File';
  const noFollow = constants.O_NOFOLLOW || 0;
  let descriptor = null;
  let pathStat = null;
  try {
    if (!noFollow) {
      pathStat = fsApi.lstatSync(filePath);
      if (!pathStat.isFile() || pathStat.isSymbolicLink()) {
        throw new Error(`${description} must be a regular file`);
      }
    }
    descriptor = fsApi.openSync(filePath, constants.O_RDONLY | noFollow);
    const descriptorStat = fsApi.fstatSync(descriptor);
    if (!descriptorStat.isFile()) throw new Error(`${description} must be a regular file`);
    const maxBytes = Number.isFinite(options.maxBytes)
      ? Math.max(0, Math.floor(options.maxBytes))
      : null;
    if (maxBytes !== null && descriptorStat.size > maxBytes) {
      throw new Error(`${description} exceeds ${maxBytes} bytes`);
    }
    if (pathStat && (pathStat.dev !== descriptorStat.dev || pathStat.ino !== descriptorStat.ino)) {
      throw new Error(`${description} changed while it was being opened`);
    }
    if (options.mode !== undefined && process.platform !== 'win32') {
      fsApi.fchmodSync(descriptor, options.mode);
    }
    if (maxBytes !== null) {
      const buffer = Buffer.allocUnsafe(maxBytes + 1);
      let bytesRead = 0;
      while (bytesRead < buffer.length) {
        const count = fsApi.readSync(
          descriptor,
          buffer,
          bytesRead,
          buffer.length - bytesRead,
          null
        );
        if (count === 0) break;
        bytesRead += count;
      }
      if (bytesRead > maxBytes) throw new Error(`${description} exceeds ${maxBytes} bytes`);
      return buffer.subarray(0, bytesRead).toString(options.encoding || 'utf8');
    }
    return fsApi.readFileSync(descriptor, options.encoding || 'utf8');
  } catch (error) {
    if (error?.code === 'ELOOP') {
      const symlinkError = new Error(`${description} must be a regular file`);
      symlinkError.cause = error;
      throw symlinkError;
    }
    throw error;
  } finally {
    if (descriptor !== null) {
      try { fsApi.closeSync(descriptor); } catch (_) {}
    }
  }
}


module.exports = { readRegularFileNoFollow };
