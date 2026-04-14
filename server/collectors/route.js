const { execSync } = require('child_process');
const BaseCollector = require('./base');
const { isWindows } = require('./platform');

class RouteCollector extends BaseCollector {
  constructor() {
    super('route', 3000);
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
      console.error('RouteCollector error:', err.message);
    }
    return state;
  }

  _collectWindows(state) {
    const output = execSync('route print -4', { encoding: 'utf8', timeout: 10000 });
    for (const line of output.split('\n')) {
      const match = line.trim().match(/^(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\s+(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\s+(\S+)\s+(\S+)\s+(\d+)/);
      if (match) {
        const key = `route:${match[1]}/${match[2]}`;
        state.set(key, JSON.stringify({ network: match[1], netmask: match[2], gateway: match[3], interface: match[4], metric: match[5] }));
      }
    }
  }

  _collectMac(state) {
    const output = execSync('netstat -rn -f inet', { encoding: 'utf8', timeout: 10000 });
    for (const line of output.split('\n')) {
      const match = line.trim().match(/^(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\/(\d+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)/);
      if (match) {
        const key = `route:${match[1]}/${match[2]}`;
        state.set(key, JSON.stringify({ destination: match[1], cidr: match[2], gateway: match[3], flags: match[4], interface: match[6] }));
      }
      // Also match default route format
      const defaultMatch = line.trim().match(/^default\s+(\S+)\s+(\S+)\s+(\S+)/);
      if (defaultMatch) {
        state.set('route:0.0.0.0/0', JSON.stringify({ destination: '0.0.0.0', gateway: defaultMatch[1], flags: defaultMatch[2], interface: defaultMatch[3] }));
      }
    }
  }
}

module.exports = RouteCollector;
