const { execSync } = require('child_process');
const BaseCollector = require('./base');
const { isWindows } = require('./platform');

class DnsCollector extends BaseCollector {
  constructor() {
    super('dns', 5000);
  }

  async collect() {
    const state = new Map();
    try {
      if (isWindows()) {
        this._collectWindows(state);
      } else {
        this._collectMac(state);
      }
    } catch (err) {
      console.error('DnsCollector error:', err.message);
    }
    return state;
  }

  _collectWindows(state) {
    let currentAdapter = null;
    const output = execSync('netsh interface ip show dns', { encoding: 'utf8', timeout: 10000 });
    for (const line of output.split('\n')) {
      const trimmed = line.trim();
      const ifaceMatch = trimmed.match(/\"(.+)\"/);
      if (ifaceMatch) {
        currentAdapter = ifaceMatch[1];
        continue;
      }
      if (!currentAdapter) continue;
      const ipMatch = trimmed.match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\s*$/);
      if (ipMatch) {
        const key = `dns:${currentAdapter}:dns_server`;
        const existing = state.get(key);
        state.set(key, existing ? `${existing},${ipMatch[1]}` : ipMatch[1]);
      }
    }
  }

  _collectMac(state) {
    const output = execSync('scutil --dns', { encoding: 'utf8', timeout: 10000 });
    let currentService = null;
    for (const line of output.split('\n')) {
      const trimmed = line.trim();

      // Service/resolver section header
      if (trimmed.startsWith('resolver #') || trimmed.startsWith('domain')) {
        const nameMatch = trimmed.match(/nameserver\[0\]\s*:\s*(\S+)/);
        if (nameMatch && currentService) {
          state.set(`dns:${currentService}:dns_server`, nameMatch[1]);
        }
        continue;
      }

      // Match interface/service name
      const ifaceMatch = trimmed.match(/interface\s*:\s*(\S+)/);
      if (ifaceMatch) {
        currentService = ifaceMatch[1];
      }

      // Match nameserver lines
      const nsMatch = trimmed.match(/nameserver\[0\]\s*:\s*(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})/);
      if (nsMatch && currentService) {
        const key = `dns:${currentService}:dns_server`;
        const existing = state.get(key);
        state.set(key, existing ? `${existing},${nsMatch[1]}` : nsMatch[1]);
      }
    }
  }
}

module.exports = DnsCollector;
