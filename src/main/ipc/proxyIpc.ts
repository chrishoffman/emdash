import { ipcMain, BrowserWindow } from 'electron';
import { localProxyService } from '../services/LocalProxyService';
import { PROXY_EVENT_CHANNEL } from '@shared/proxy';

export function registerProxyIpc() {
  ipcMain.handle('proxy:start', async (_e, args?: { port?: number }) => {
    try {
      return await localProxyService.start(args?.port);
    } catch (error: any) {
      return { ok: false, error: error.message };
    }
  });

  ipcMain.handle('proxy:stop', async () => {
    try {
      return await localProxyService.stop();
    } catch (error: any) {
      return { ok: false, error: error.message };
    }
  });

  ipcMain.handle('proxy:getState', async () => {
    try {
      return { success: true, data: localProxyService.getState() };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle(
    'proxy:addRoute',
    async (
      _e,
      args: { name: string; targetPort: number; taskId?: string; targetHost?: string }
    ) => {
      try {
        const route = await localProxyService.addRoute(args.name, args.targetPort, {
          taskId: args.taskId,
          targetHost: args.targetHost,
        });
        return { success: true, data: route };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    }
  );

  ipcMain.handle('proxy:removeRoute', async (_e, args: { name: string }) => {
    try {
      const removed = localProxyService.removeRoute(args.name);
      return { success: true, removed };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('proxy:getRoutes', async () => {
    try {
      return { success: true, data: localProxyService.getRoutes() };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // Forward proxy events to all renderer windows
  localProxyService.onEvent((evt) => {
    const all = BrowserWindow.getAllWindows();
    for (const win of all) {
      try {
        win.webContents.send(PROXY_EVENT_CHANNEL, evt);
      } catch {}
    }
  });
}
