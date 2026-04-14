const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, '..', 'data', 'monitor.db');

let db;

function init() {
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT NOT NULL,
      trigger_type TEXT NOT NULL CHECK(trigger_type IN ('auto', 'manual')),
      description TEXT DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS config_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      snapshot_id INTEGER NOT NULL,
      category TEXT NOT NULL,
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      raw_output TEXT,
      FOREIGN KEY (snapshot_id) REFERENCES snapshots(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS changes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT NOT NULL,
      category TEXT NOT NULL,
      key TEXT NOT NULL,
      change_type TEXT NOT NULL CHECK(change_type IN ('added', 'removed', 'modified')),
      old_value TEXT,
      new_value TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_changes_category ON changes(category);
    CREATE INDEX IF NOT EXISTS idx_changes_timestamp ON changes(timestamp);
    CREATE INDEX IF NOT EXISTS idx_config_items_snapshot ON config_items(snapshot_id);
    CREATE INDEX IF NOT EXISTS idx_config_items_category ON config_items(category);
  `);

  // Prepared statements
  const stmts = {
    insertSnapshot: db.prepare(
      'INSERT INTO snapshots (timestamp, trigger_type, description) VALUES (?, ?, ?)'
    ),
    insertConfigItem: db.prepare(
      'INSERT INTO config_items (snapshot_id, category, key, value, raw_output) VALUES (?, ?, ?, ?, ?)'
    ),
    insertChange: db.prepare(
      'INSERT INTO changes (timestamp, category, key, change_type, old_value, new_value) VALUES (?, ?, ?, ?, ?, ?)'
    ),
    getSnapshots: db.prepare('SELECT * FROM snapshots ORDER BY timestamp DESC LIMIT ? OFFSET ?'),
    getSnapshotById: db.prepare('SELECT * FROM snapshots WHERE id = ?'),
    deleteSnapshot: db.prepare('DELETE FROM snapshots WHERE id = ?'),
    getConfigItemsBySnapshot: db.prepare('SELECT * FROM config_items WHERE snapshot_id = ?'),
    getConfigItemCounts: db.prepare(
      'SELECT category, COUNT(*) as count FROM config_items WHERE snapshot_id = ? GROUP BY category'
    ),
    getChanges: db.prepare(
      'SELECT * FROM changes WHERE 1=1 ORDER BY timestamp DESC LIMIT ? OFFSET ?'
    ),
    getChangesByCategory: db.prepare(
      'SELECT * FROM changes WHERE category = ? ORDER BY timestamp DESC LIMIT ? OFFSET ?'
    ),
    getChangesByTimeRange: db.prepare(
      'SELECT * FROM changes WHERE timestamp >= ? AND timestamp <= ? ORDER BY timestamp DESC LIMIT ? OFFSET ?'
    ),
    getLatestChanges: db.prepare(
      'SELECT * FROM changes ORDER BY timestamp DESC LIMIT ?'
    ),
    getChangeCount: db.prepare('SELECT COUNT(*) as total FROM changes'),
    getChangeCountByCategory: db.prepare(
      'SELECT COUNT(*) as total FROM changes WHERE category = ?'
    ),
  };

  return stmts;
}

function shutdown() {
  if (db) {
    db.close();
    db = null;
  }
}

function getDb() {
  return db;
}

module.exports = { init, shutdown, getDb };
