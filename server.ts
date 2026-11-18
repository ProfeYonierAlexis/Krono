import dotenv from 'dotenv';
import express from 'express';
import fs from 'fs';
import http from 'http';
import { createRequire } from 'module';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import type webpushTypes from 'web-push';
import { WebSocket, WebSocketServer } from 'ws';

const require = createRequire(import.meta.url);
const webpush = require('web-push') as typeof webpushTypes;
import type {
  ConnectedDevice,
  FocusTimerState,
  ReminderEvent,
  TaskItem,
  WorkspaceState,
  WSClientMessage,
  WSServerMessage,
} from './src/types.ts';

dotenv.config();

const PORT = Number(process.env.PORT) || 3000;
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const DATA_DIR = path.resolve(process.cwd(), '.data');
const STORE_FILE = path.join(DATA_DIR, 'workspaces.json');
const VAPID_FILE = path.join(DATA_DIR, 'vapid.json');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

interface StoredPushSubscription {
  deviceId: string;
  subscription: webpushTypes.PushSubscription;
  updatedAt: number;
}

interface PersistedWorkspace {
  state: WorkspaceState;
  deletedTaskIds: Record<string, number>;
  pushSubscriptions: Record<string, StoredPushSubscription>;
  devices: Record<string, ConnectedDevice>;
}

interface StoreData {
  workspaces: Record<string, PersistedWorkspace>;
}

function loadVapidKeys(): { publicKey: string; privateKey: string } {
  if (fs.existsSync(VAPID_FILE)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(VAPID_FILE, 'utf-8'));
      if (parsed.publicKey && parsed.privateKey) {
        return parsed;
      }
    } catch {
      // Regenerate below
    }
  }
  const keys = webpush.generateVAPIDKeys();
  fs.writeFileSync(VAPID_FILE, JSON.stringify(keys, null, 2), 'utf-8');
  return keys;
}

const vapidKeys = loadVapidKeys();
webpush.setVapidDetails(
  'mailto:notificaciones@krono.local',
  vapidKeys.publicKey,
  vapidKeys.privateKey
);

function createDefaultTimer(): FocusTimerState {
  return {
    mode: 'focus',
    status: 'idle',
    durationSeconds: 25 * 60,
    remainingSeconds: 25 * 60,
    startedAt: null,
    activeTaskId: null,
    completedSessions: 0,
    updatedAt: Date.now(),
  };
}

function loadStore(): StoreData {
  if (fs.existsSync(STORE_FILE)) {
    try {
      const raw = fs.readFileSync(STORE_FILE, 'utf-8');
      const parsed = JSON.parse(raw) as StoreData;
      if (parsed && typeof parsed.workspaces === 'object') {
        for (const ws of Object.values(parsed.workspaces)) {
          for (const dev of Object.values(ws.devices || {})) {
            dev.isOnline = false;
          }
        }
        return parsed;
      }
    } catch {
      // Fallback to clean store
    }
  }
  return { workspaces: {} };
}

const store: StoreData = loadStore();

let saveTimeout: NodeJS.Timeout | null = null;
function scheduleSave() {
  if (saveTimeout) return;
  saveTimeout = setTimeout(() => {
    saveTimeout = null;
    try {
      const tmp = `${STORE_FILE}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(store, null, 2), 'utf-8');
      fs.renameSync(tmp, STORE_FILE);
    } catch (err) {
      console.error('Error persisting workspace store:', err);
    }
  }, 250);
}

function sanitizeWorkspaceId(id: string): string {
  const cleaned = id.trim().toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 24);
  return cleaned || 'KRON-MAIN';
}

function getOrCreateWorkspace(workspaceId: string): PersistedWorkspace {
  const safeId = sanitizeWorkspaceId(workspaceId);
  if (!store.workspaces[safeId]) {
    store.workspaces[safeId] = {
      state: {
        workspaceId: safeId,
        tasks: [],
        timer: createDefaultTimer(),
        updatedAt: Date.now(),
      },
      deletedTaskIds: {},
      pushSubscriptions: {},
      devices: {},
    };
    scheduleSave();
  }
  return store.workspaces[safeId];
}

function mergeTaskIntoWorkspace(ws: PersistedWorkspace, incomingTask: TaskItem): boolean {
  const deletedAt = ws.deletedTaskIds[incomingTask.id];
  if (deletedAt && deletedAt >= incomingTask.updatedAt) {
    return false;
  }
  const idx = ws.state.tasks.findIndex((t) => t.id === incomingTask.id);
  if (idx === -1) {
    ws.state.tasks.push(incomingTask);
    ws.state.updatedAt = Math.max(ws.state.updatedAt, incomingTask.updatedAt);
    return true;
  }
  if (incomingTask.updatedAt > ws.state.tasks[idx].updatedAt) {
    ws.state.tasks[idx] = incomingTask;
    ws.state.updatedAt = Math.max(ws.state.updatedAt, incomingTask.updatedAt);
    return true;
  }
  return false;
}

function mergeLocalState(ws: PersistedWorkspace, localState?: WorkspaceState) {
  if (!localState) return;
  if (Array.isArray(localState.tasks)) {
    for (const task of localState.tasks) {
      if (task && typeof task.id === 'string') {
        mergeTaskIntoWorkspace(ws, task);
      }
    }
  }
  if (localState.timer && localState.timer.updatedAt > ws.state.timer.updatedAt) {
    ws.state.timer = localState.timer;
    ws.state.updatedAt = Math.max(ws.state.updatedAt, localState.timer.updatedAt);
  }
  scheduleSave();
}

interface ClientSocketMeta {
  ws: WebSocket;
  workspaceId: string;
  deviceId: string;
}

const activeClients = new Set<ClientSocketMeta>();

function broadcastToWorkspace(
  workspaceId: string,
  message: WSServerMessage,
  excludeDeviceId?: string
) {
  const serialized = JSON.stringify(message);
  for (const client of activeClients) {
    if (
      client.workspaceId === workspaceId &&
      client.ws.readyState === WebSocket.OPEN &&
      (!excludeDeviceId || client.deviceId !== excludeDeviceId)
    ) {
      client.ws.send(serialized);
    }
  }
}

async function sendWebPushToWorkspace(
  workspaceId: string,
  payload: { title: string; body: string; taskId?: string; workspaceId: string; url: string }
) {
  const ws = store.workspaces[workspaceId];
  if (!ws) return 0;

  const subs = Object.values(ws.pushSubscriptions);
  if (subs.length === 0) return 0;

  let delivered = 0;
  const serialized = JSON.stringify(payload);

  await Promise.all(
    subs.map(async (entry) => {
      try {
        await webpush.sendNotification(entry.subscription, serialized);
        delivered += 1;
      } catch (err: unknown) {
        const statusCode = (err as { statusCode?: number }).statusCode;
        if (statusCode === 404 || statusCode === 410) {
          delete ws.pushSubscriptions[entry.deviceId];
          if (ws.devices[entry.deviceId]) {
            ws.devices[entry.deviceId].pushEnabled = false;
          }
          scheduleSave();
        }
      }
    })
  );

  return delivered;
}

// Background Reminder Scheduler (checks every 5s)
setInterval(() => {
  const now = Date.now();
  for (const [workspaceId, ws] of Object.entries(store.workspaces)) {
    let changed = false;
    for (const task of ws.state.tasks) {
      if (!task.completed && task.reminderAt && !task.reminderSent) {
        const triggerMs = Date.parse(task.reminderAt);
        if (!Number.isNaN(triggerMs) && triggerMs <= now) {
          task.reminderSent = true;
          task.updatedAt = now;
          changed = true;

          const reminder: ReminderEvent = {
            id: `rem-${task.id}-${now}`,
            taskId: task.id,
            title: task.title,
            category: task.category,
            priority: task.priority,
            triggeredAt: now,
          };

          broadcastToWorkspace(workspaceId, { type: 'task:upsert', task, originDeviceId: 'server' });
          broadcastToWorkspace(workspaceId, { type: 'reminder:triggered', reminder });

          void sendWebPushToWorkspace(workspaceId, {
            title: `Recordatorio: ${task.title}`,
            body: `${task.category} · ${task.durationMinutes} min · Prioridad ${task.priority}`,
            taskId: task.id,
            workspaceId,
            url: `/?ws=${encodeURIComponent(workspaceId)}`,
          });
        }
      }
    }
    if (changed) {
      ws.state.updatedAt = now;
      scheduleSave();
    }
  }
}, 5000);

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, timestamp: Date.now() });
  });

  app.get('/api/push/vapid-public-key', (_req, res) => {
    res.json({ publicKey: vapidKeys.publicKey });
  });

  app.post('/api/push/subscribe', (req, res) => {
    const { workspaceId, deviceId, subscription } = req.body as {
      workspaceId?: string;
      deviceId?: string;
      subscription?: webpushTypes.PushSubscription;
    };
    if (!workspaceId || !deviceId || !subscription?.endpoint) {
      res.status(400).json({ error: 'Datos de suscripción incompletos.' });
      return;
    }

    const safeId = sanitizeWorkspaceId(workspaceId);
    const ws = getOrCreateWorkspace(safeId);
    ws.pushSubscriptions[deviceId] = {
      deviceId,
      subscription,
      updatedAt: Date.now(),
    };
    if (ws.devices[deviceId]) {
      ws.devices[deviceId].pushEnabled = true;
    }
    scheduleSave();

    broadcastToWorkspace(safeId, {
      type: 'devices:update',
      devices: Object.values(ws.devices),
    });

    res.json({ ok: true });
  });

  app.post('/api/push/unsubscribe', (req, res) => {
    const { workspaceId, deviceId } = req.body as { workspaceId?: string; deviceId?: string };
    if (!workspaceId || !deviceId) {
      res.status(400).json({ error: 'Falta workspaceId o deviceId.' });
      return;
    }
    const safeId = sanitizeWorkspaceId(workspaceId);
    const ws = getOrCreateWorkspace(safeId);
    delete ws.pushSubscriptions[deviceId];
    if (ws.devices[deviceId]) {
      ws.devices[deviceId].pushEnabled = false;
    }
    scheduleSave();
    broadcastToWorkspace(safeId, {
      type: 'devices:update',
      devices: Object.values(ws.devices),
    });
    res.json({ ok: true });
  });

  app.post('/api/push/test', async (req, res) => {
    const { workspaceId, title, body } = req.body as {
      workspaceId?: string;
      title?: string;
      body?: string;
    };
    if (!workspaceId) {
      res.status(400).json({ error: 'workspaceId requerido.' });
      return;
    }
    const safeId = sanitizeWorkspaceId(workspaceId);
    const delivered = await sendWebPushToWorkspace(safeId, {
      title: title || 'Prueba de recordatorio Krono',
      body: body || 'Las notificaciones push y la sincronización multidispositivo están activas.',
      workspaceId: safeId,
      url: `/?ws=${encodeURIComponent(safeId)}`,
    });

    broadcastToWorkspace(safeId, {
      type: 'reminder:triggered',
      reminder: {
        id: `test-${Date.now()}`,
        taskId: '',
        title: title || 'Prueba de recordatorio Krono',
        category: 'Trabajo',
        priority: 'media',
        triggeredAt: Date.now(),
      },
    });

    res.json({ ok: true, delivered });
  });

  app.get('/api/workspace/:id', (req, res) => {
    const ws = getOrCreateWorkspace(req.params.id);
    res.json({
      state: ws.state,
      devices: Object.values(ws.devices),
    });
  });

  app.post('/api/workspace/:id/sync', (req, res) => {
    const ws = getOrCreateWorkspace(req.params.id);
    const { localState } = req.body as { localState?: WorkspaceState };
    mergeLocalState(ws, localState);
    res.json({
      state: ws.state,
      devices: Object.values(ws.devices),
    });
  });

  if (!IS_PRODUCTION) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  const server = http.createServer(app);
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (request, socket, head) => {
    const reqUrl = request.url || '/';
    if (reqUrl.startsWith('/ws')) {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    } else {
      socket.destroy();
    }
  });

  wss.on('connection', (socket) => {
    let meta: ClientSocketMeta | null = null;

    socket.on('message', (raw) => {
      let msg: WSClientMessage;
      try {
        msg = JSON.parse(raw.toString()) as WSClientMessage;
      } catch {
        return;
      }

      if (msg.type === 'join') {
        const safeId = sanitizeWorkspaceId(msg.workspaceId);
        const ws = getOrCreateWorkspace(safeId);
        const now = Date.now();

        if (meta) {
          activeClients.delete(meta);
        }
        meta = {
          ws: socket,
          workspaceId: safeId,
          deviceId: msg.device.deviceId,
        };
        activeClients.add(meta);

        const prevDevice = ws.devices[msg.device.deviceId];
        const hasSub = Boolean(ws.pushSubscriptions[msg.device.deviceId]);
        ws.devices[msg.device.deviceId] = {
          deviceId: msg.device.deviceId,
          name: msg.device.name,
          type: msg.device.type,
          connectedAt: prevDevice?.connectedAt || now,
          lastSeenAt: now,
          pushEnabled: msg.device.pushEnabled || hasSub,
          isOnline: true,
        };

        mergeLocalState(ws, msg.localState);

        const initPayload: WSServerMessage = {
          type: 'workspace:state',
          state: ws.state,
          devices: Object.values(ws.devices),
        };
        socket.send(JSON.stringify(initPayload));

        broadcastToWorkspace(
          safeId,
          { type: 'devices:update', devices: Object.values(ws.devices) },
          msg.device.deviceId
        );
        return;
      }

      if (!meta) return;
      const safeId = sanitizeWorkspaceId(msg.workspaceId);
      const ws = getOrCreateWorkspace(safeId);

      if (msg.type === 'task:upsert') {
        const updated = mergeTaskIntoWorkspace(ws, msg.task);
        if (updated) {
          scheduleSave();
          broadcastToWorkspace(
            safeId,
            { type: 'task:upsert', task: msg.task, originDeviceId: msg.originDeviceId },
            msg.originDeviceId
          );
        }
      } else if (msg.type === 'task:delete') {
        const now = Date.now();
        ws.deletedTaskIds[msg.taskId] = now;
        ws.state.tasks = ws.state.tasks.filter((t) => t.id !== msg.taskId);
        ws.state.updatedAt = now;
        scheduleSave();
        broadcastToWorkspace(
          safeId,
          { type: 'task:delete', taskId: msg.taskId, originDeviceId: msg.originDeviceId },
          msg.originDeviceId
        );
      } else if (msg.type === 'timer:update') {
        if (msg.timer.updatedAt >= ws.state.timer.updatedAt) {
          ws.state.timer = msg.timer;
          ws.state.updatedAt = Math.max(ws.state.updatedAt, msg.timer.updatedAt);
          scheduleSave();
          broadcastToWorkspace(
            safeId,
            { type: 'timer:update', timer: msg.timer, originDeviceId: msg.originDeviceId },
            msg.originDeviceId
          );
        }
      } else if (msg.type === 'device:push_status') {
        if (ws.devices[msg.deviceId]) {
          ws.devices[msg.deviceId].pushEnabled = msg.pushEnabled;
          ws.devices[msg.deviceId].lastSeenAt = Date.now();
          scheduleSave();
          broadcastToWorkspace(safeId, {
            type: 'devices:update',
            devices: Object.values(ws.devices),
          });
        }
      }
    });

    socket.on('close', () => {
      if (!meta) return;
      activeClients.delete(meta);
      const { workspaceId, deviceId } = meta;
      const stillConnected = Array.from(activeClients).some(
        (c) => c.workspaceId === workspaceId && c.deviceId === deviceId
      );
      if (!stillConnected && store.workspaces[workspaceId]?.devices[deviceId]) {
        store.workspaces[workspaceId].devices[deviceId].isOnline = false;
        store.workspaces[workspaceId].devices[deviceId].lastSeenAt = Date.now();
        scheduleSave();
        broadcastToWorkspace(workspaceId, {
          type: 'devices:update',
          devices: Object.values(store.workspaces[workspaceId].devices),
        });
      }
    });
  });

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Krono server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start Krono server:', err);
  process.exit(1);
});
