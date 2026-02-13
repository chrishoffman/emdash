import { EventEmitter } from 'node:events';
import http from 'node:http';
import net from 'node:net';
import type { Duplex } from 'node:stream';
import type { ProxyRoute, ProxyRouteStatus, ProxyState, ProxyEvent } from '@shared/proxy';
import { log } from '../lib/logger';

const SLUG_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;
const DEFAULT_PORTS = [9000, 9001, 9002, 9100];

class LocalProxyService extends EventEmitter {
  private server: http.Server | null = null;
  private routes = new Map<string, ProxyRoute>();
  private port: number | null = null;

  // ── Lifecycle ──────────────────────────────────────────────────────

  async start(port?: number): Promise<{ ok: boolean; port?: number; error?: string }> {
    if (this.server) {
      return { ok: true, port: this.port! };
    }

    const preferred = port ? [port, ...DEFAULT_PORTS] : DEFAULT_PORTS;
    const chosen = await this.pickAvailablePort(preferred);

    return new Promise((resolve) => {
      const srv = http.createServer((req, res) => this.handleRequest(req, res));
      srv.on('upgrade', (req: http.IncomingMessage, socket: Duplex, head: Buffer) =>
        this.handleUpgrade(req, socket, head)
      );
      srv.on('error', (err) => {
        log.error('[proxy] server error', err);
        this.emitProxyEvent({ type: 'error', error: err.message });
      });

      srv.listen(chosen, '127.0.0.1', () => {
        this.server = srv;
        this.port = chosen;
        log.info?.('[proxy] started', { port: chosen });
        this.emitProxyEvent({ type: 'started' });
        resolve({ ok: true, port: chosen });
      });

      srv.once('error', () => {
        resolve({ ok: false, error: `Failed to listen on port ${chosen}` });
      });
    });
  }

  async stop(): Promise<{ ok: boolean }> {
    if (!this.server) return { ok: true };

    return new Promise((resolve) => {
      this.server!.close(() => {
        this.server = null;
        this.port = null;
        this.routes.clear();
        log.info?.('[proxy] stopped');
        this.emitProxyEvent({ type: 'stopped' });
        resolve({ ok: true });
      });
    });
  }

  // ── Route registry ─────────────────────────────────────────────────

  async addRoute(
    name: string,
    targetPort: number,
    opts?: { taskId?: string; targetHost?: string }
  ): Promise<ProxyRoute> {
    if (!SLUG_RE.test(name)) {
      throw new Error(
        `Invalid route name: "${name}" — must be lowercase alphanumeric with hyphens`
      );
    }
    if (this.routes.has(name)) {
      throw new Error(`Route "${name}" already exists`);
    }

    // Auto-start proxy if not running
    if (!this.server) {
      await this.start();
    }

    const route: ProxyRoute = {
      name,
      targetPort,
      targetHost: opts?.targetHost || '127.0.0.1',
      status: 'running',
      taskId: opts?.taskId,
      url: `http://${name}.localhost:${this.port}`,
      registeredAt: new Date().toISOString(),
    };

    this.routes.set(name, route);
    log.info?.('[proxy] route added', { name, targetPort });
    this.emitProxyEvent({ type: 'route:added', route });
    return route;
  }

  removeRoute(name: string): boolean {
    const route = this.routes.get(name);
    if (!route) return false;
    this.routes.delete(name);
    log.info?.('[proxy] route removed', { name });
    this.emitProxyEvent({ type: 'route:removed', route });
    return true;
  }

  updateRouteStatus(name: string, status: ProxyRouteStatus): boolean {
    const route = this.routes.get(name);
    if (!route) return false;
    route.status = status;
    this.emitProxyEvent({ type: 'route:status', route });
    return true;
  }

  getRoute(name: string): ProxyRoute | undefined {
    return this.routes.get(name);
  }

  getRoutes(): ProxyRoute[] {
    return Array.from(this.routes.values());
  }

  getState(): ProxyState {
    return {
      running: this.server !== null,
      port: this.port,
      routes: this.getRoutes(),
    };
  }

  // ── Request handling ───────────────────────────────────────────────

  private handleRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
    const subdomain = this.extractSubdomain(req);

    if (!subdomain) {
      // Dashboard or API
      const urlPath = req.url || '/';
      if (urlPath === '/api/routes') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(this.getRoutes()));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(this.serveDashboard());
      return;
    }

    const route = this.routes.get(subdomain);
    if (!route) {
      res.writeHead(502, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(
        `<html><body style="background:#1a1a2e;color:#e0e0e0;font-family:system-ui;padding:2rem">` +
          `<h1>502 — Unknown route</h1>` +
          `<p>No route registered for <code>${subdomain}</code>.</p>` +
          `<p><a href="http://localhost:${this.port}" style="color:#7c9aff">View dashboard</a></p>` +
          `</body></html>`
      );
      return;
    }

    route.lastAccessed = new Date().toISOString();

    const proxyReq = http.request(
      {
        hostname: route.targetHost,
        port: route.targetPort,
        path: req.url,
        method: req.method,
        headers: { ...req.headers, host: `${route.targetHost}:${route.targetPort}` },
      },
      (proxyRes) => {
        res.writeHead(proxyRes.statusCode || 200, proxyRes.headers);
        proxyRes.pipe(res, { end: true });
      }
    );

    proxyReq.on('error', (err) => {
      log.error('[proxy] upstream error', { route: subdomain, error: err.message });
      if (!res.headersSent) {
        res.writeHead(502, { 'Content-Type': 'text/plain' });
      }
      res.end(`Proxy error: ${err.message}`);
    });

    req.pipe(proxyReq, { end: true });
  }

  // ── WebSocket passthrough ──────────────────────────────────────────

  private handleUpgrade(req: http.IncomingMessage, clientSocket: Duplex, head: Buffer): void {
    const subdomain = this.extractSubdomain(req);
    if (!subdomain) {
      clientSocket.destroy();
      return;
    }

    const route = this.routes.get(subdomain);
    if (!route) {
      clientSocket.destroy();
      return;
    }

    route.lastAccessed = new Date().toISOString();

    const targetSocket = net.createConnection(
      { host: route.targetHost, port: route.targetPort },
      () => {
        // Reconstruct the HTTP upgrade request for the target
        const reqLine = `${req.method} ${req.url} HTTP/${req.httpVersion}\r\n`;
        const headers = Object.entries(req.headers)
          .filter(([k]) => k.toLowerCase() !== 'host')
          .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`)
          .join('\r\n');
        const hostHeader = `host: ${route.targetHost}:${route.targetPort}`;

        targetSocket.write(reqLine + hostHeader + '\r\n' + headers + '\r\n\r\n');
        if (head.length > 0) {
          targetSocket.write(head);
        }

        // Bidirectional pipe
        targetSocket.pipe(clientSocket);
        clientSocket.pipe(targetSocket);
      }
    );

    targetSocket.on('error', () => {
      clientSocket.destroy();
    });
    clientSocket.on('error', () => {
      targetSocket.destroy();
    });
  }

  // ── Dashboard ──────────────────────────────────────────────────────

  private serveDashboard(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Emdash Proxy Dashboard</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #0f0f1a; color: #e0e0e0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 2rem; }
  h1 { font-size: 1.4rem; margin-bottom: 1.5rem; color: #fff; }
  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; padding: 0.5rem 1rem; border-bottom: 1px solid #2a2a3e; color: #8888aa; font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.05em; }
  td { padding: 0.6rem 1rem; border-bottom: 1px solid #1a1a2e; }
  .dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 0.5rem; }
  .dot-running { background: #4ade80; }
  .dot-stopped { background: #888; }
  .dot-error { background: #ef4444; }
  .dot-starting { background: #facc15; }
  a { color: #7c9aff; text-decoration: none; }
  a:hover { text-decoration: underline; }
  .empty { color: #666; text-align: center; padding: 3rem; }
</style>
</head>
<body>
<h1>Emdash Local Proxy</h1>
<table>
  <thead><tr><th>Name</th><th>Status</th><th>Target</th><th>Proxy URL</th></tr></thead>
  <tbody id="routes"></tbody>
</table>
<div id="empty" class="empty" style="display:none">No routes registered</div>
<script>
function render(routes) {
  var tb = document.getElementById('routes');
  var em = document.getElementById('empty');
  if (!routes.length) { tb.innerHTML = ''; em.style.display = ''; return; }
  em.style.display = 'none';
  tb.innerHTML = routes.map(function(r) {
    return '<tr>'
      + '<td>' + r.name + '</td>'
      + '<td><span class="dot dot-' + r.status + '"></span>' + r.status + '</td>'
      + '<td>' + r.targetHost + ':' + r.targetPort + '</td>'
      + '<td><a href="' + r.url + '" target="_blank">' + r.url + '</a></td>'
      + '</tr>';
  }).join('');
}
function refresh() {
  fetch('/api/routes').then(function(r) { return r.json(); }).then(render).catch(function() {});
}
refresh();
setInterval(refresh, 3000);
</script>
</body>
</html>`;
  }

  // ── Helpers ────────────────────────────────────────────────────────

  private extractSubdomain(req: http.IncomingMessage): string | null {
    const host = req.headers.host || '';
    // Match: <slug>.localhost:<port>
    const match = host.match(/^([a-z0-9][a-z0-9-]*[a-z0-9]?)\.localhost(:\d+)?$/);
    return match ? match[1] : null;
  }

  private async pickAvailablePort(preferred: number[]): Promise<number> {
    const tryPort = (port: number) =>
      new Promise<boolean>((resolve) => {
        const server = net.createServer();
        server.once('error', () => resolve(false));
        server.listen(port, '127.0.0.1', () => {
          try {
            server.close(() => resolve(true));
          } catch {
            resolve(false);
          }
        });
      });

    for (const p of preferred) {
      if (await tryPort(p)) return p;
    }

    // Fallback to ephemeral port
    return new Promise((resolve) => {
      const server = net.createServer();
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address();
        const port = typeof addr === 'object' && addr ? addr.port : 0;
        try {
          server.close(() => resolve(port || 9000));
        } catch {
          resolve(9000);
        }
      });
      server.once('error', () => resolve(9000));
    });
  }

  private emitProxyEvent(partial: Omit<ProxyEvent, 'timestamp'>): void {
    const evt: ProxyEvent = { ...partial, timestamp: new Date().toISOString() };
    this.emit('event', evt);
  }

  onEvent(listener: (evt: ProxyEvent) => void): () => void {
    this.on('event', listener);
    return () => this.off('event', listener);
  }
}

export const localProxyService = new LocalProxyService();
