const express = require('express');
const router = express.Router();

function createChangesRoute(stmts) {
  // GET /api/changes
  router.get('/', (req, res) => {
    const { category, from, to } = req.query;
    const limit = parseInt(req.query.limit) || 100;
    const offset = parseInt(req.query.offset) || 0;

    try {
      let rows;
      const db = require('../services/database').getDb();

      let sql = 'SELECT * FROM changes WHERE 1=1';
      const params = [];

      if (category) {
        sql += ' AND category = ?';
        params.push(category);
      }
      if (from) {
        sql += ' AND timestamp >= ?';
        params.push(from);
      }
      if (to) {
        sql += ' AND timestamp <= ?';
        params.push(to);
      }

      sql += ' ORDER BY timestamp DESC LIMIT ? OFFSET ?';
      params.push(limit, offset);

      rows = db.prepare(sql).all(...params);

      res.json(rows);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/changes/latest
  router.get('/latest', (req, res) => {
    const limit = parseInt(req.query.limit) || 20;
    try {
      const rows = stmts.getLatestChanges.all(limit);
      res.json(rows);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}

module.exports = createChangesRoute;
