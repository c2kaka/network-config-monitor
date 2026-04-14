const express = require('express');
const router = express.Router();

function createStatusRoute(pollingService) {
  router.get('/', (req, res) => {
    res.json(pollingService.getStatus());
  });
  return router;
}

module.exports = createStatusRoute;
