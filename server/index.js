const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const cors = require('cors');
const path = require('path');

const databaseService = require('./services/database');
const PollingService = require('./services/polling');
const createSnapshotsRoute = require('./routes/snapshots');
const createChangesRoute = require('./routes/changes');
const createStatusRoute = require('./routes/status');

// Collectors
const RouteCollector = require('./collectors/route');
const DnsCollector = require('./collectors/dns');
const AdapterCollector = require('./collectors/adapter');
const ProxyCollector = require('./collectors/proxy');
const FirewallCollector = require('./collectors/firewall');
const HostsCollector = require('./collectors/hosts');
const ArpConnectionCollector = require('./collectors/arp-connection');

const app = express();
app.use(cors());
app.use(express.json());

// Serve static files in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '..', 'client', 'dist')));
}

const PORT = 3001;
let pollingService;

function start() {
  const stmts = databaseService.init();

  // Create all collectors
  const collectors = new Map();
  const collectorInstances = [
    new RouteCollector(),
    new DnsCollector(),
    new AdapterCollector(),
    new ProxyCollector(),
    new FirewallCollector(),
    new HostsCollector(),
    new ArpConnectionCollector(),
  ];
  for (const c of collectorInstances) {
    collectors.set(c.category, c);
  }

  // HTTP + WebSocket server
  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws' });

  // WebSocket connection handler
  wss.on('connection', (ws) => {
    console.log('WebSocket client connected');
    if (pollingService) {
      ws.send(JSON.stringify({
        type: 'status',
        data: pollingService.getStatus()
      }));
    }
    ws.on('close', () => console.log('WebSocket client disconnected'));
  });

  // Polling service
  pollingService = new PollingService(collectors, stmts, wss);

  // Mount routes
  app.use('/api/snapshots', createSnapshotsRoute(stmts, collectors));
  app.use('/api/changes', createChangesRoute(stmts));
  app.use('/api/status', createStatusRoute(pollingService));

  // SPA fallback in production
  if (process.env.NODE_ENV === 'production') {
    app.get('*', (req, res) => {
      if (!req.path.startsWith('/api')) {
        res.sendFile(path.join(__dirname, '..', 'client', 'dist', 'index.html'));
      }
    });
  }

  server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    pollingService.start();
    console.log(`Polling started with ${collectors.size} collectors`);
  });

  // Graceful shutdown
  process.on('SIGINT', () => {
    console.log('Shutting down...');
    pollingService.stop();
    databaseService.shutdown();
    server.close();
    process.exit(0);
  });
}

start();
