import { hostPreviewService, HostPreviewEvent } from './hostPreviewService';
import { localProxyService } from './LocalProxyService';
import { log } from '../lib/logger';

/**
 * Sanitize a taskId into a valid proxy route slug.
 * Lowercase alphanumeric + hyphens, max 30 chars.
 */
function toSlug(taskId: string): string {
  return (
    taskId
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 30)
      .replace(/-$/, '') || 'task'
  );
}

/**
 * Ensure uniqueness by appending a numeric suffix if the slug is already taken.
 */
function uniqueSlug(base: string): string {
  if (!localProxyService.getRoute(base)) return base;
  for (let i = 2; i < 100; i++) {
    const candidate = `${base}-${i}`;
    if (!localProxyService.getRoute(candidate)) return candidate;
  }
  return `${base}-${Date.now()}`;
}

// Track taskId → slug mapping so we can update/remove on exit
const taskSlugMap = new Map<string, string>();

export function initProxyIntegration(): void {
  hostPreviewService.onEvent((evt: HostPreviewEvent) => {
    try {
      if (evt.type === 'url' && evt.url && evt.taskId) {
        const parsed = parsePort(evt.url);
        if (!parsed) return;

        const base = toSlug(evt.taskId);
        const slug = uniqueSlug(base);
        taskSlugMap.set(evt.taskId, slug);

        localProxyService.addRoute(slug, parsed, { taskId: evt.taskId }).catch((err) => {
          log.warn?.('[proxyIntegration] failed to add route', {
            taskId: evt.taskId,
            error: err.message,
          });
        });
      }

      if (evt.type === 'exit' && evt.taskId) {
        const slug = taskSlugMap.get(evt.taskId);
        if (slug) {
          localProxyService.updateRouteStatus(slug, 'stopped');
        }
      }
    } catch (err: any) {
      log.error('[proxyIntegration] error handling event', err);
    }
  });
}

function parsePort(url: string): number | null {
  try {
    const u = new URL(url);
    const port = parseInt(u.port, 10);
    return port > 0 ? port : null;
  } catch {
    return null;
  }
}
