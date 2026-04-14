const { execSync } = require('child_process');
const BaseCollector = require('./base');
const { isWindows } = require('./platform');

class AdapterCollector extends BaseCollector {
  constructor() {
    super('adapter', 5000);
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
      console.error('AdapterCollector error:', err.message);
    }
    return state;
  }

  _collectWindows(state) {
    const output = execSync('netsh interface show interface', { encoding: 'utf8', timeout: 10000 });
    for (const line of output.split('\n')) {
      const match = line.trim().match(/^(\S+)\s+(\S+)\s+(\S+)\s+(.+)$/);
      if (match) {
        const adminState = match[1];
        const connState = match[2];
        const type = match[3];
        const name = match[4].trim();
        if (adminState.match(/管理|Admin/i)) continue;
        state.set(`adapter:${name}:admin_state`, adminState);
        state.set(`adapter:${name}:conn_state`, connState);
        state.set(`adapter:${name}:type`, type);
      }
    }

    try {
      const ipOutput = execSync('ipconfig', { encoding: 'utf8', timeout: 10000 });
      let currentAdapter = null;
      for (const line of ipOutput.split('\n')) {
        const trimmed = line.trim();
        const suffixMatch = line.match(/^.+[:：]\s*$/);
        if (suffixMatch && !trimmed.includes('.') && trimmed.length > 3) {
          currentAdapter = trimmed.replace(/[:：]\s*$/, '');
          continue;
        }
        if (!currentAdapter) continue;
        const ipv4Match = trimmed.match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})/);
        if (ipv4Match) {
          state.set(`adapter:${currentAdapter}:ipv4`, ipv4Match[1]);
        }
      }
    } catch {}
  }

  _collectMac(state) {
    const output = execSync('ifconfig', { encoding: 'utf8', timeout: 10000 });
    let currentIface = null;
    let ifaceData = {};

    for (const line of output.split('\n')) {
      // Interface header: starts at column 0, like "en0:" or "lo0:"
      const ifaceMatch = line.match(/^([a-z]+\d*)[:：]/);
      if (ifaceMatch) {
        if (currentIface && Object.keys(ifaceData).length > 0) {
          for (const [field, value] of Object.entries(ifaceData)) {
            state.set(`adapter:${currentIface}:${field}`, value);
          }
        }
        currentIface = ifaceMatch[1];
        ifaceData = {};
        continue;
      }

      if (!currentIface) continue;

      const statusMatch = line.match(/status:\s*(\S+)/);
      if (statusMatch) ifaceData.status = statusMatch[1];

      const inetMatch = line.match(/inet\s+(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})/);
      if (inetMatch) ifaceData.ipv4 = inetMatch[1];

      const etherMatch = line.match(/ether\s+([\da-fA-F:]+)/);
      if (etherMatch) ifaceData.mac = etherMatch[1];

      const mtuMatch = line.match(/mtu\s+(\d+)/);
      if (mtuMatch) ifaceData.mtu = mtuMatch[1];
    }

    // Flush last interface
    if (currentIface && Object.keys(ifaceData).length > 0) {
      for (const [field, value] of Object.entries(ifaceData)) {
        state.set(`adapter:${currentIface}:${field}`, value);
      }
    }
  }
}

module.exports = AdapterCollector;
