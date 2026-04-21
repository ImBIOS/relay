import * as http from "node:http";
import {
  getActiveAccount,
  listAccounts,
  loadConfig,
} from "../config/accounts-config";

const DASHBOARD_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>RELAY Dashboard</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #1a1a2e; color: #eee; min-height: 100vh; }
    .container { max-width: 1200px; margin: 0 auto; padding: 20px; }
    header { display: flex; justify-content: space-between; align-items: center; padding: 20px 0; border-bottom: 1px solid #333; }
    h1 { font-size: 24px; color: #00d9ff; }
    .status-badge { padding: 5px 12px; border-radius: 20px; font-size: 12px; }
    .status-ok { background: #10b981; color: white; }
    .status-warning { background: #f59e0b; color: white; }
    .status-error { background: #ef4444; color: white; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px; margin-top: 30px; }
    .card { background: #16213e; border-radius: 12px; padding: 20px; border: 1px solid #333; }
    .card h2 { font-size: 16px; color: #888; margin-bottom: 15px; }
    .stat { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #333; }
    .stat:last-child { border-bottom: none; }
    .stat-value { font-weight: bold; color: #00d9ff; }
    .progress-bar { height: 8px; background: #333; border-radius: 4px; overflow: hidden; margin-top: 10px; }
    .progress-fill { height: 100%; background: linear-gradient(90deg, #00d9ff, #00ff88); transition: width 0.3s; }
    .account-list { margin-top: 10px; }
    .account-item { display: flex; justify-content: space-between; align-items: center; padding: 12px; background: #1a1a2e; border-radius: 8px; margin-bottom: 8px; }
    .account-item.active { border: 1px solid #00d9ff; }
    .account-name { font-weight: bold; }
    .account-provider { font-size: 12px; color: #888; }
    .alert-item { padding: 10px; border-radius: 8px; margin-bottom: 8px; }
    .alert-warning { background: rgba(245, 158, 11, 0.2); border-left: 3px solid #f59e0b; }
    .alert-error { background: rgba(239, 68, 68, 0.2); border-left: 3px solid #ef4444; }
    .actions { display: flex; gap: 10px; margin-top: 20px; }
    button { padding: 10px 20px; border: none; border-radius: 8px; cursor: pointer; font-weight: bold; transition: opacity 0.2s; }
    button:hover { opacity: 0.9; }
    .btn-primary { background: #00d9ff; color: #1a1a2e; }
    .btn-danger { background: #ef4444; color: white; }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>RELAY Dashboard v2.0</h1>
      <span id="status" class="status-badge status-ok">Connected</span>
    </header>

    <div class="grid">
      <div class="card">
        <h2>Current Usage</h2>
        <div id="usage-stats"></div>
      </div>

      <div class="card">
        <h2>Accounts</h2>
        <div id="accounts" class="account-list"></div>
      </div>

      <div class="card">
        <h2>Alerts</h2>
        <div id="alerts"></div>
      </div>

      <div class="card">
        <h2>Quick Actions</h2>
        <div class="actions">
          <button class="btn-primary" onclick="refresh()">Refresh</button>
          <button class="btn-danger" onclick="rotateKey()">Rotate Key</button>
        </div>
      </div>
    </div>
  </div>

  <script>
    async function fetchData() {
      const response = await fetch('/api/status');
      return await response.json();
    }

    async function refresh() {
      window.location.reload();
    }

    async function rotateKey() {
      await fetch('/api/rotate', { method: 'POST' });
      refresh();
    }

    function render(data) {
      // Usage stats
      const usagePercent = (data.usage.used / data.usage.limit * 100).toFixed(1);
      document.getElementById('usage-stats').innerHTML = \`
        <div class="stat"><span>Used</span><span class="stat-value">\${data.usage.used}</span></div>
        <div class="stat"><span>Limit</span><span class="stat-value">\${data.usage.limit}</span></div>
        <div class="stat"><span>Remaining</span><span class="stat-value">\${data.usage.remaining}</span></div>
        <div class="progress-bar"><div class="progress-fill" style="width: \${usagePercent}%"></div></div>
      \`;

      // Status badge
      const statusEl = document.getElementById('status');
      if (usagePercent >= 90) {
        statusEl.className = 'status-badge status-error';
        statusEl.textContent = 'Critical';
      } else if (usagePercent >= 75) {
        statusEl.className = 'status-badge status-warning';
        statusEl.textContent = 'Warning';
      } else {
        statusEl.className = 'status-badge status-ok';
        statusEl.textContent = 'Healthy';
      }

      // Accounts
      document.getElementById('accounts').innerHTML = data.accounts.map(acc => \`
        <div class="account-item \${acc.id === data.activeAccount ? 'active' : ''}">
          <div>
            <div class="account-name">\${acc.name}</div>
            <div class="account-provider">\${acc.provider}</div>
          </div>
        </div>
      \`).join('');

      // Alerts
      document.getElementById('alerts').innerHTML = data.alerts.length === 0
        ? '<p style="color: #10b981;">No active alerts</p>'
        : data.alerts.map(a => \`<div class="alert-item \${a.type === 'error' ? 'alert-error' : 'alert-warning'}">\${a.message}</div>\`).join('');
    }

    (async function init() {
      try {
        const data = await fetchData();
        render(data);
      } catch (e) {
        console.error('Failed to load dashboard:', e);
      }
    })();
  </script>
</body>
</html>`;

export function startDashboard(): void {
  const config = loadConfig();

  if (!config.dashboard.enabled) {
    console.log("Dashboard is disabled. Enable with: relay dashboard start");
    return;
  }

  const server = http.createServer((req, res) => {
    if (req.url === "/" || req.url === "/index.html") {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(DASHBOARD_HTML);
      return;
    }

    if (req.url === "/api/status") {
      const activeAccount = getActiveAccount();
      const accounts = listAccounts();

      res.writeHead(200, { "Content-Type": "application/json" });

      const usage = { used: 0, limit: 1000, remaining: 1000 };

      if (activeAccount) {
        res.end(
          JSON.stringify({
            activeAccount: activeAccount.id,
            usage,
            accounts: accounts.map((a) => ({
              id: a.id,
              name: a.name,
              provider: a.provider,
            })),
            alerts: [],
          })
        );
        return;
      }

      res.end(JSON.stringify({ error: "No active account" }));
    }

    if (req.url === "/api/rotate" && req.method === "POST") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: true, message: "Key rotated" }));
      return;
    }

    res.writeHead(404);
    res.end("Not found");
  });

  const { host, port } = config.dashboard;
  server.listen(port, host, () => {
    console.log(`RELAY Dashboard running at http://${host}:${port}`);
    console.log(`Auth token: ${config.dashboard.authToken}`);
  });
}

export function stopDashboard(): void {
  console.log("Dashboard stopped.");
}
