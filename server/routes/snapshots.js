const express = require('express');
const router = express.Router();

function createSnapshotsRoute(stmts, collectors) {
  // GET /api/snapshots - list snapshots
  router.get('/', (req, res) => {
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;
    const snapshots = stmts.getSnapshots.all(limit, offset);

    // Add item counts for each snapshot
    for (const snap of snapshots) {
      const counts = stmts.getConfigItemCounts.all(snap.id);
      snap.itemCounts = {};
      for (const row of counts) {
        snap.itemCounts[row.category] = row.count;
      }
    }

    res.json(snapshots);
  });

  // POST /api/snapshots - create manual snapshot
  router.post('/', async (req, res) => {
    const { description } = req.body;
    const timestamp = new Date().toISOString();

    try {
      const result = stmts.insertSnapshot.run(timestamp, 'manual', description || '');
      const snapshotId = result.lastInsertRowid;

      const insertItem = stmts.insertConfigItem;
      const insertMany = require('../services/database').getDb().transaction((items) => {
        for (const item of items) {
          insertItem.run(item.snapshotId, item.category, item.key, item.value, null);
        }
      });

      const items = [];
      for (const [, collector] of collectors) {
        try {
          const state = await collector.collect();
          for (const [key, value] of state) {
            items.push({ snapshotId, category: collector.category, key, value });
          }
        } catch (err) {
          console.error(`Snapshot collect error for ${collector.category}:`, err.message);
        }
      }

      insertMany(items);

      res.json({
        id: snapshotId,
        timestamp,
        trigger_type: 'manual',
        description,
        itemCounts: items.reduce((acc, item) => {
          acc[item.category] = (acc[item.category] || 0) + 1;
          return acc;
        }, {})
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // DELETE /api/snapshots/:id
  router.delete('/:id', (req, res) => {
    try {
      stmts.deleteSnapshot.run(req.params.id);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/snapshots/:id1/diff/:id2
  router.get('/:id1/diff/:id2', (req, res) => {
    try {
      const items1 = stmts.getConfigItemsBySnapshot.all(req.params.id1);
      const items2 = stmts.getConfigItemsBySnapshot.all(req.params.id2);

      const map1 = new Map(items1.map(i => [`${i.category}:${i.key}`, i.value]));
      const map2 = new Map(items2.map(i => [`${i.category}:${i.key}`, i.value]));

      const diff = [];
      // Added in snapshot2
      for (const [key, value] of map2) {
        if (!map1.has(key)) {
          diff.push({ key, change_type: 'added', old_value: null, new_value: value });
        } else if (map1.get(key) !== value) {
          diff.push({ key, change_type: 'modified', old_value: map1.get(key), new_value: value });
        }
      }
      // Removed in snapshot2
      for (const [key, value] of map1) {
        if (!map2.has(key)) {
          diff.push({ key, change_type: 'removed', old_value: value, new_value: null });
        }
      }

      // Group by category
      const grouped = {};
      for (const item of diff) {
        const category = item.key.split(':')[0];
        if (!grouped[category]) grouped[category] = [];
        grouped[category].push(item);
      }

      res.json({ totalChanges: diff.length, grouped });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}

module.exports = createSnapshotsRoute;
