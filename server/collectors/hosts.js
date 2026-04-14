const fs = require('fs');
const path = require('path');
const BaseCollector = require('./base');
const { isWindows } = require('./platform');

const HOSTS_PATHS = {
  win32: 'C:\\Windows\\System32\\drivers\\etc\\hosts',
  darwin: '/etc/hosts',
};

class HostsCollector extends BaseCollector {
  constructor() {
    super('hosts', 5000);
  }

  async collect() {
    const state = new Map();
    const hostsPath = isWindows() ? HOSTS_PATHS.win32 : HOSTS_PATHS.darwin;

    try {
      const content = fs.readFileSync(hostsPath, 'utf8');
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const parts = trimmed.split(/\s+/);
        if (parts.length >= 2) {
          const ip = parts[0];
          const hostname = parts.slice(1).join(' ');
          state.set(`hosts:${ip}:${hostname}`, `${ip} -> ${hostname}`);
        }
      }
    } catch (err) {
      console.error('HostsCollector error:', err.message);
    }
    return state;
  }
}

module.exports = HostsCollector;
