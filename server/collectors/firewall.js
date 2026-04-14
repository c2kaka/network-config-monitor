const { execSync } = require('child_process');
const BaseCollector = require('./base');
const { isWindows } = require('./platform');

class FirewallCollector extends BaseCollector {
  constructor() {
    super('firewall', 10000);
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
      console.error('FirewallCollector error:', err.message);
    }
    return state;
  }

  _collectWindows(state) {
    const output = execSync('netsh advfirewall firewall show rule name=all', {
      encoding: 'utf8', timeout: 30000
    });

    let currentRule = null;
    let ruleData = {};

    for (const line of output.split('\n')) {
      const trimmed = line.trim();
      if (trimmed.startsWith('---') || trimmed === '') {
        if (currentRule && Object.keys(ruleData).length > 0) {
          state.set(`firewall:${currentRule}`, JSON.stringify(ruleData));
        }
        currentRule = null;
        ruleData = {};
        continue;
      }
      const kvMatch = trimmed.match(/^(.+?)[:：]\s*(.*)/);
      if (kvMatch) {
        const field = kvMatch[1].trim();
        const value = kvMatch[2].trim();
        if (field.match(/Rule Name|[\u89c4\u5219\u540d\u79f0]/i)) {
          currentRule = value;
        } else if (value) {
          ruleData[field] = value;
        }
      }
    }
    if (currentRule && Object.keys(ruleData).length > 0) {
      state.set(`firewall:${currentRule}`, JSON.stringify(ruleData));
    }
  }

  _collectMac(state) {
    // Application Firewall status
    try {
      const output = execSync('/usr/libexec/ApplicationFirewall/socketfilterfw --getglobalstate', {
        encoding: 'utf8', timeout: 10000
      });
      const match = output.match(/Firewall is\s*(.+)/i);
      if (match) {
        state.set('firewall:app_firewall_state', match[1].trim());
      }
    } catch {}

    // PF rules (packet filter)
    try {
      const output = execSync('sudo -n pfctl -sr 2>/dev/null || echo "PF_NOT_ACCESSIBLE"', {
        encoding: 'utf8', timeout: 10000
      });
      if (!output.includes('PF_NOT_ACCESSIBLE')) {
        const rules = output.trim().split('\n').filter(r => r.trim());
        for (let i = 0; i < Math.min(rules.length, 200); i++) {
          state.set(`firewall:pf_rule:${i}`, rules[i].trim());
        }
      }
    } catch {}

    // List allowed apps
    try {
      const output = execSync('/usr/libexec/ApplicationFirewall/socketfilterfw --listapps', {
        encoding: 'utf8', timeout: 10000
      });
      const apps = output.split('\n').filter(l => l.includes('='));
      for (let i = 0; i < Math.min(apps.length, 100); i++) {
        const appMatch = apps[i].match(/\d+\s*=\s*(.+)/);
        if (appMatch) {
          state.set(`firewall:allowed_app:${i}`, appMatch[1].trim());
        }
      }
    } catch {}
  }
}

module.exports = FirewallCollector;
