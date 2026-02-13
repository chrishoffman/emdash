export const PROXY_EVENT_CHANNEL = 'proxy:event' as const;

export const PROXY_ROUTE_STATUSES = ['starting', 'running', 'stopped', 'error'] as const;
export type ProxyRouteStatus = (typeof PROXY_ROUTE_STATUSES)[number];

export interface ProxyRoute {
  name: string;
  targetPort: number;
  targetHost: string;
  status: ProxyRouteStatus;
  taskId?: string;
  url: string;
  registeredAt: string;
  lastAccessed?: string;
}

export interface ProxyState {
  running: boolean;
  port: number | null;
  routes: ProxyRoute[];
}

export const PROXY_EVENT_TYPES = [
  'started',
  'stopped',
  'route:added',
  'route:removed',
  'route:status',
  'error',
] as const;
export type ProxyEventType = (typeof PROXY_EVENT_TYPES)[number];

export interface ProxyEvent {
  type: ProxyEventType;
  route?: ProxyRoute;
  error?: string;
  timestamp: string;
}
