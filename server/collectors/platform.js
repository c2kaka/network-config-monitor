const os = require('os');

function getPlatform() {
  const p = process.platform;
  if (p === 'win32') return 'win32';
  if (p === 'darwin') return 'darwin';
  return 'linux'; // treat linux like darwin for most commands
}

function isWindows() {
  return getPlatform() === 'win32';
}

function isMac() {
  return getPlatform() === 'darwin';
}

module.exports = { getPlatform, isWindows, isMac };
