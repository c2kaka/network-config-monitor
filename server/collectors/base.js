class BaseCollector {
  constructor(category, intervalMs) {
    this.category = category;
    this.intervalMs = intervalMs;
    this.lastState = new Map();
  }

  // Subclass must implement: async collect() -> Map<string, string>
  async collect() {
    throw new Error(`collect() not implemented for ${this.category}`);
  }

  async poll() {
    const currentState = await this.collect();
    const changes = this.diff(this.lastState, currentState);
    this.lastState = currentState;
    return changes;
  }

  diff(previous, current) {
    const changes = [];
    for (const [key, value] of current) {
      if (!previous.has(key)) {
        changes.push({ key, change_type: 'added', old_value: null, new_value: value });
      } else if (previous.get(key) !== value) {
        changes.push({ key, change_type: 'modified', old_value: previous.get(key), new_value: value });
      }
    }
    for (const [key, value] of previous) {
      if (!current.has(key)) {
        changes.push({ key, change_type: 'removed', old_value: value, new_value: null });
      }
    }
    return changes;
  }

  reset() {
    this.lastState = new Map();
  }
}

module.exports = BaseCollector;
