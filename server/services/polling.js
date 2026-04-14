class PollingService {
  constructor(collectors, stmts, wss) {
    this.collectors = collectors;
    this.stmts = stmts;
    this.wss = wss;
    this.timers = new Map();
    this.running = false;
    this.stats = {
      startTime: null,
      pollCounts: {},
      changeCounts: {},
    };
  }

  start() {
    this.running = true;
    this.stats.startTime = new Date().toISOString();

    for (const [category, collector] of this.collectors) {
      this.stats.pollCounts[category] = 0;
      this.stats.changeCounts[category] = 0;

      // Initial poll to populate baseline
      this.pollCollector(collector).catch(err => {
        console.error(`Initial poll error for ${category}:`, err.message);
      });

      const timer = setInterval(() => {
        this.pollCollector(collector).catch(err => {
          console.error(`Poll error for ${category}:`, err.message);
        });
      }, collector.intervalMs);

      this.timers.set(category, timer);
    }
  }

  async pollCollector(collector) {
    try {
      const changes = await collector.poll();
      this.stats.pollCounts[collector.category]++;

      if (changes.length > 0) {
        this.stats.changeCounts[collector.category] += changes.length;
        const timestamp = new Date().toISOString();

        for (const change of changes) {
          try {
            this.stmts.insertChange.run(
              timestamp, collector.category, change.key,
              change.change_type, change.old_value, change.new_value
            );
          } catch (dbErr) {
            console.error(`DB insert error for ${collector.category}:`, dbErr.message);
          }
        }

        this.broadcastChanges(collector.category, changes, timestamp);
      }
    } catch (err) {
      console.error(`Collector ${collector.category} error:`, err.message);
    }
  }

  broadcastChanges(category, changes, timestamp) {
    for (const change of changes) {
      const message = JSON.stringify({
        type: 'change',
        data: {
          timestamp,
          category,
          key: change.key,
          change_type: change.change_type,
          old_value: change.old_value,
          new_value: change.new_value,
        }
      });

      for (const client of this.wss.clients) {
        if (client.readyState === 1) {
          client.send(message);
        }
      }
    }
  }

  stop() {
    this.running = false;
    for (const [, timer] of this.timers) {
      clearInterval(timer);
    }
    this.timers.clear();
  }

  getStatus() {
    return {
      running: this.running,
      startTime: this.stats.startTime,
      pollCounts: { ...this.stats.pollCounts },
      changeCounts: { ...this.stats.changeCounts },
      collectors: Array.from(this.collectors.values()).map(c => ({
        category: c.category,
        interval: c.intervalMs,
        stateSize: c.lastState.size,
      })),
    };
  }
}

module.exports = PollingService;
