const { execSync } = require('child_process');
const BaseCollector = require('./base');
const { isWindows } = require('./platform');

class ArpConnectionCollector extends BaseCollector {
  constructor() {
    super('arp_connection', 5000);
  }

  async collect() {
    const state = new Map();

    // ARP table (same command on both platforms, slightly different output format)
    try {
      const arpOutput = execSync('arp -a', { encoding: 'utf8', timeout: 10000 });
      for (const line of arpOutput.split('\n')) {
        const trimmed = line.trim();
        if (isWindows()) {
          const match = trimmed.match(/^(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\s+([\da-fA-F-]+)\s+(\S+)/);
          if (match) {
            state.set(`arp:${match[1]}`, JSON.stringify({ ip: match[1], mac: match[2], type: match[3] }));
          }
        } else {
          // macOS: hostname (ip) at mac on iface
          const match = trimmed.match(/\((\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\)\s+at\s+([\da-fA-F:]+)\s+on\s+(\S+)/);
          if (match) {
            state.set(`arp:${match[1]}`, JSON.stringify({ ip: match[1], mac: match[2], interface: match[3] }));
          }
        }
      }
    } catch (err) {
      console.error('ArpConnectionCollector (arp) error:', err.message);
    }

    // Active connections
    try {
      if (isWindows()) {
        this._collectConnectionsWindows(state);
      } else {
        this._collectConnectionsMac(state);
      }
    } catch (err) {
      console.error('ArpConnectionCollector (connections) error:', err.message);
    }

    return state;
  }

  _collectConnectionsWindows(state) {
    const output = execSync('netstat -ano', { encoding: 'utf8', timeout: 10000 });
    for (const line of output.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed.includes('LISTENING') && !trimmed.includes('ESTABLISHED')) continue;
      const parts = trimmed.split(/\s+/);
      if (parts.length >= 5) {
        const proto = parts[0];
        const local = parts[1];
        const remote = parts[2] || '';
        const stateStr = parts[3];
        const pid = parts[4];
        if (stateStr === 'LISTENING' || stateStr === 'ESTABLISHED') {
          state.set(`conn:${proto}:${local}:${remote}`, JSON.stringify({ proto, local, remote, state: stateStr, pid }));
        }
      }
    }
  }

  _collectConnectionsMac(state) {
    // Use lsof for better process info
    const output = execSync('lsof -i -P -n', { encoding: 'utf8', timeout: 15000 });
    for (const line of output.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('COMMAND')) continue;
      if (!trimmed.includes('(LISTEN)') && !trimmed.includes('(ESTABLISHED)')) continue;

      // lsof format: COMMAND PID USER FD TYPE DEVICE SIZE/OFF NODE NAME
      const parts = trimmed.split(/\s+/);
      if (parts.length >= 9) {
        const command = parts[0];
        const pid = parts[1];
        const name = parts[8]; // e.g. (LISTEN) or 192.168.1.1:443->10.0.0.1:54321 (ESTABLISHED)
        const stateStr = trimmed.includes('(LISTEN)') ? 'LISTENING' : 'ESTABLISHED';

        // Parse address from name field
        const addrMatch = name.match(/[\d*:]+:\d+/);
        const local = addrMatch ? addrMatch[0] : name;

        const remoteMatch = trimmed.match(/->\s*([\d.:]+)/);
        const remote = remoteMatch ? remoteMatch[1] : '';

        const key = `conn:${command}:${local}:${remote}`;
        state.set(key, JSON.stringify({ command, pid, local, remote, state: stateStr }));
      }
    }
  }
}

module.exports = ArpConnectionCollector;
