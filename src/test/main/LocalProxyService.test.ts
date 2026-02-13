import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import http from 'node:http';
import net from 'node:net';

vi.mock('../../main/lib/logger', () => ({
  log: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Fresh import each test via resetModules
let localProxyService: typeof import('../../main/services/LocalProxyService').localProxyService;

// Helper: create a simple backend HTTP server
function createBackend(port: number): Promise<http.Server> {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end(`backend:${port}:${req.url}`);
    });
    srv.listen(port, '127.0.0.1', () => resolve(srv));
  });
}

function closeServer(srv: http.Server): Promise<void> {
  return new Promise((resolve) => srv.close(() => resolve()));
}

function httpGet(
  url: string,
  headers?: Record<string, string>
): Promise<{ status: number; body: string; headers: http.IncomingHttpHeaders }> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const req = http.get(
      {
        hostname: parsed.hostname,
        port: parsed.port,
        path: parsed.pathname + parsed.search,
        headers: { ...headers, host: parsed.host },
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => resolve({ status: res.statusCode || 0, body, headers: res.headers }));
      }
    );
    req.on('error', reject);
  });
}

describe('LocalProxyService', () => {
  let backend: http.Server | null = null;
  const backendPort = 18901;

  beforeEach(async () => {
    vi.resetModules();
    const mod = await import('../../main/services/LocalProxyService');
    localProxyService = mod.localProxyService;
  });

  afterEach(async () => {
    try {
      await localProxyService.stop();
    } catch {}
    if (backend) {
      await closeServer(backend);
      backend = null;
    }
  });

  it('starts on the specified port', async () => {
    const result = await localProxyService.start(18900);
    expect(result.ok).toBe(true);
    expect(result.port).toBe(18900);

    const state = localProxyService.getState();
    expect(state.running).toBe(true);
    expect(state.port).toBe(18900);
  });

  it('adds and retrieves routes', async () => {
    await localProxyService.start(18900);

    const route = await localProxyService.addRoute('my-app', 3000, { taskId: 'task-1' });
    expect(route.name).toBe('my-app');
    expect(route.targetPort).toBe(3000);
    expect(route.status).toBe('running');
    expect(route.url).toBe('http://my-app.localhost:18900');

    const retrieved = localProxyService.getRoute('my-app');
    expect(retrieved).toBeDefined();
    expect(retrieved!.taskId).toBe('task-1');

    const all = localProxyService.getRoutes();
    expect(all).toHaveLength(1);
  });

  it('removes routes', async () => {
    await localProxyService.start(18900);
    await localProxyService.addRoute('test-route', 3000);

    const removed = localProxyService.removeRoute('test-route');
    expect(removed).toBe(true);
    expect(localProxyService.getRoute('test-route')).toBeUndefined();

    const removedAgain = localProxyService.removeRoute('test-route');
    expect(removedAgain).toBe(false);
  });

  it('rejects invalid route names', async () => {
    await localProxyService.start(18900);

    await expect(localProxyService.addRoute('UPPERCASE', 3000)).rejects.toThrow(
      'Invalid route name'
    );
    await expect(localProxyService.addRoute('-leading', 3000)).rejects.toThrow(
      'Invalid route name'
    );
    await expect(localProxyService.addRoute('has spaces', 3000)).rejects.toThrow(
      'Invalid route name'
    );
  });

  it('rejects duplicate route names', async () => {
    await localProxyService.start(18900);
    await localProxyService.addRoute('dup', 3000);

    await expect(localProxyService.addRoute('dup', 3001)).rejects.toThrow('already exists');
  });

  it('auto-starts proxy when adding a route', async () => {
    expect(localProxyService.getState().running).toBe(false);

    const route = await localProxyService.addRoute('auto-start', 3000);
    expect(localProxyService.getState().running).toBe(true);
    expect(route.url).toContain('auto-start.localhost');
  });

  it('proxies HTTP requests to the correct backend via subdomain', async () => {
    backend = await createBackend(backendPort);
    const { port } = (await localProxyService.start(18900))!;
    await localProxyService.addRoute('backend', backendPort);

    const res = await httpGet(`http://backend.localhost:${port}/hello`);
    expect(res.status).toBe(200);
    expect(res.body).toBe(`backend:${backendPort}:/hello`);
  });

  it('serves dashboard HTML on root URL', async () => {
    const { port } = (await localProxyService.start(18900))!;

    const res = await httpGet(`http://localhost:${port}/`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.body).toContain('Emdash');
    expect(res.body).toContain('Proxy Dashboard');
  });

  it('returns JSON from /api/routes', async () => {
    const { port } = (await localProxyService.start(18900))!;
    await localProxyService.addRoute('api-test', 3000);

    const res = await httpGet(`http://localhost:${port}/api/routes`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/json');

    const routes = JSON.parse(res.body);
    expect(routes).toHaveLength(1);
    expect(routes[0].name).toBe('api-test');
  });

  it('returns 502 for unknown subdomain', async () => {
    const { port } = (await localProxyService.start(18900))!;

    const res = await httpGet(`http://unknown.localhost:${port}/`);
    expect(res.status).toBe(502);
    expect(res.body).toContain('Unknown route');
  });

  it('passes through WebSocket upgrades', async () => {
    // Create a simple backend that accepts WebSocket upgrades
    const wsSrv = http.createServer();
    const wsPort = 18902;

    const upgradeReceived = new Promise<string>((resolve) => {
      wsSrv.on('upgrade', (req, socket) => {
        resolve(req.url || '');
        socket.write(
          'HTTP/1.1 101 Switching Protocols\r\n' +
            'Upgrade: websocket\r\n' +
            'Connection: Upgrade\r\n\r\n'
        );
        socket.end();
      });
    });

    await new Promise<void>((resolve) => wsSrv.listen(wsPort, '127.0.0.1', () => resolve()));

    const { port } = (await localProxyService.start(18900))!;
    await localProxyService.addRoute('ws-test', wsPort);

    // Send an upgrade request through the proxy
    await new Promise<void>((resolve, reject) => {
      const req = http.request({
        hostname: '127.0.0.1',
        port,
        path: '/__vite_hmr',
        headers: {
          host: `ws-test.localhost:${port}`,
          Connection: 'Upgrade',
          Upgrade: 'websocket',
        },
      });
      req.on('upgrade', (_res, socket) => {
        socket.destroy();
        resolve();
      });
      req.on('error', () => resolve()); // The connection closing is expected
      req.end();
    });

    const receivedPath = await upgradeReceived;
    expect(receivedPath).toBe('/__vite_hmr');

    await new Promise<void>((resolve) => wsSrv.close(() => resolve()));
  });

  it('stops and cleans up server and routes', async () => {
    await localProxyService.start(18900);
    await localProxyService.addRoute('cleanup', 3000);

    await localProxyService.stop();

    const state = localProxyService.getState();
    expect(state.running).toBe(false);
    expect(state.port).toBeNull();
    expect(state.routes).toHaveLength(0);
  });

  it('updates route status', async () => {
    await localProxyService.start(18900);
    await localProxyService.addRoute('status-test', 3000);

    const updated = localProxyService.updateRouteStatus('status-test', 'stopped');
    expect(updated).toBe(true);

    const route = localProxyService.getRoute('status-test');
    expect(route!.status).toBe('stopped');
  });

  it('emits events for lifecycle actions', async () => {
    const events: any[] = [];
    localProxyService.onEvent((evt) => events.push(evt));

    await localProxyService.start(18900);
    await localProxyService.addRoute('evt-test', 3000);
    localProxyService.removeRoute('evt-test');
    await localProxyService.stop();

    const types = events.map((e) => e.type);
    expect(types).toContain('started');
    expect(types).toContain('route:added');
    expect(types).toContain('route:removed');
    expect(types).toContain('stopped');
  });

  it('falls back to next port when preferred is occupied', async () => {
    // Occupy port 18900
    const blocker = net.createServer();
    await new Promise<void>((resolve) => blocker.listen(18900, '127.0.0.1', () => resolve()));

    try {
      const result = await localProxyService.start(18900);
      expect(result.ok).toBe(true);
      expect(result.port).not.toBe(18900);
    } finally {
      await new Promise<void>((resolve) => blocker.close(() => resolve()));
    }
  });
});
