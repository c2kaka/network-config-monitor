const { execSync } = require('child_process');
const BaseCollector = require('./base');
const { isWindows } = require('./platform');

class ProxyCollector extends BaseCollector {
  constructor() {
    super('proxy', 2000);
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
      console.error('ProxyCollector error:', err.message);
    }
    return state;
  }

  _collectWindows(state) {
    const regPath = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings';
    const keys = ['ProxyEnable', 'ProxyServer', 'AutoConfigURL'];
    for (const keyName of keys) {
      try {
        const output = execSync(`reg query "${regPath}" /v ${keyName}`, { encoding: 'utf8', timeout: 5000 });
        const match = output.match(/REG_\w+\s+(.+)/);
        if (match) {
          let value = match[1].trim();
          if (output.includes('REG_DWORD')) {
            value = value.startsWith('0x') ? parseInt(value, 16).toString() : value;
          }
          state.set(`proxy:${keyName}`, value);
        }
      } catch {
        state.set(`proxy:${keyName}`, '');
      }
    }
  }

  _collectMac(state) {
    // Get the primary network service
    let services = [];
    try {
      const output = execSync('networksetup -listallnetworkservices', { encoding: 'utf8', timeout: 5000 });
      services = output.split('\n').slice(1).map(s => s.trim()).filter(s => s && !s.includes('*'));
    } catch {}

    const primaryService = services[0] || 'Wi-Fi';

    // HTTP proxy
    try {
      const output = execSync(`networksetup -getwebproxy "${primaryService}"`, { encoding: 'utf8', timeout: 5000 });
      const enabled = output.match(/Enabled:\s*(\S+)/);
      const server = output.match(/Server:\s*(\S+)/);
      const port = output.match(/Port:\s*(\S+)/);
      state.set('proxy:ProxyEnable', enabled ? (enabled[1] === 'Yes' ? '1' : '0') : '0');
      if (server && port && server[1] !== '') {
        state.set('proxy:ProxyServer', `${server[1]}:${port[1]}`);
      } else {
        state.set('proxy:ProxyServer', '');
      }
    } catch {
      state.set('proxy:ProxyEnable', '0');
      state.set('proxy:ProxyServer', '');
    }

    // SOCKS proxy
    try {
      const output = execSync(`networksetup -getsocksfirewallproxy "${primaryService}"`, { encoding: 'utf8', timeout: 5000 });
      const enabled = output.match(/Enabled:\s*(\S+)/);
      const server = output.match(/Server:\s*(\S+)/);
      const port = output.match(/Port:\s*(\S+)/);
      if (enabled && enabled[1] === 'Yes' && server && port) {
        state.set('proxy:SocksProxy', `${server[1]}:${port[1]}`);
      } else {
        state.set('proxy:SocksProxy', '');
      }
    } catch {
      state.set('proxy:SocksProxy', '');
    }

    // Auto proxy URL
    try {
      const output = execSync(`networksetup -getautoproxyurl "${primaryService}"`, { encoding: 'utf8', timeout: 5000 });
      const url = output.match(/URL:\s*(.+)/);
      const enabled = output.match(/Enabled:\s*(\S+)/);
      state.set('proxy:AutoConfigURL', (enabled && enabled[1] === 'Yes' && url) ? url[1].trim() : '');
    } catch {
      state.set('proxy:AutoConfigURL', '');
    }
  }
}

module.exports = ProxyCollector;
