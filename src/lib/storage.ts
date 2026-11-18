import type {
  DeviceType,
  FocusTimerState,
  TaskItem,
  WorkspaceState,
} from '../types';

const ACTIVE_WS_KEY = 'krono_active_workspace';
const DEVICE_KEY = 'krono_device_identity';
const THEME_KEY = 'krono_theme';

export interface DeviceIdentity {
  deviceId: string;
  name: string;
  type: DeviceType;
}

export type PendingOp =
  | { type: 'task:upsert'; task: TaskItem; timestamp: number }
  | { type: 'task:delete'; taskId: string; timestamp: number }
  | { type: 'timer:update'; timer: FocusTimerState; timestamp: number };

export function sanitizeWorkspaceId(raw: string): string {
  const cleaned = raw.trim().toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 24);
  return cleaned || 'KRON-MAIN';
}

export function generateWorkspaceCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let suffix = '';
  for (let i = 0; i < 4; i++) {
    suffix += chars[Math.floor(Math.random() * chars.length)];
  }
  return `KRON-${suffix}`;
}

export function getInitialWorkspaceId(): string {
  if (typeof window === 'undefined') return 'KRON-MAIN';
  const params = new URLSearchParams(window.location.search);
  const urlWs = params.get('ws');
  if (urlWs) {
    const clean = sanitizeWorkspaceId(urlWs);
    localStorage.setItem(ACTIVE_WS_KEY, clean);
    return clean;
  }
  const saved = localStorage.getItem(ACTIVE_WS_KEY);
  if (saved) {
    return sanitizeWorkspaceId(saved);
  }
  const created = generateWorkspaceCode();
  localStorage.setItem(ACTIVE_WS_KEY, created);
  return created;
}

export function setSavedWorkspaceId(workspaceId: string): string {
  const clean = sanitizeWorkspaceId(workspaceId);
  localStorage.setItem(ACTIVE_WS_KEY, clean);
  const url = new URL(window.location.href);
  url.searchParams.set('ws', clean);
  window.history.replaceState({}, '', url.toString());
  return clean;
}

function detectDeviceInfo(): { name: string; type: DeviceType } {
  const ua = navigator.userAgent;
  const isMobile = /Android|iPhone|iPod/i.test(ua);
  const isTablet = /iPad|Tablet/i.test(ua);
  const type: DeviceType = isTablet ? 'tablet' : isMobile ? 'mobile' : 'desktop';

  let browser = 'Navegador';
  if (/Edg/i.test(ua)) browser = 'Edge';
  else if (/Chrome|CriOS/i.test(ua)) browser = 'Chrome';
  else if (/Firefox|FxiOS/i.test(ua)) browser = 'Firefox';
  else if (/Safari/i.test(ua)) browser = 'Safari';

  const platformLabel =
    type === 'mobile' ? 'Móvil' : type === 'tablet' ? 'Tablet' : 'Escritorio';
  return { name: `${browser} · ${platformLabel}`, type };
}

export function getOrCreateDeviceIdentity(): DeviceIdentity {
  const raw = localStorage.getItem(DEVICE_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as DeviceIdentity;
      if (parsed.deviceId && parsed.name && parsed.type) {
        return parsed;
      }
    } catch {
      // Recreate below
    }
  }
  const detected = detectDeviceInfo();
  const identity: DeviceIdentity = {
    deviceId: `dev-${crypto.randomUUID().slice(0, 8)}`,
    name: detected.name,
    type: detected.type,
  };
  localStorage.setItem(DEVICE_KEY, JSON.stringify(identity));
  return identity;
}

export function updateDeviceName(newName: string): DeviceIdentity {
  const current = getOrCreateDeviceIdentity();
  const updated: DeviceIdentity = {
    ...current,
    name: newName.trim().slice(0, 40) || current.name,
  };
  localStorage.setItem(DEVICE_KEY, JSON.stringify(updated));
  return updated;
}

export function createDefaultTimer(): FocusTimerState {
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

export function getTodayDateString(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function createStarterTasks(): TaskItem[] {
  const now = Date.now();
  const today = getTodayDateString();
  return [
    {
      id: `task-${crypto.randomUUID().slice(0, 8)}`,
      title: 'Revisar prioridades y planificar bloques del día',
      notes: 'Definir los tres entregables clave antes de abrir el correo.',
      completed: false,
      priority: 'alta',
      category: 'Trabajo',
      durationMinutes: 30,
      focusMinutesLogged: 0,
      dueDate: today,
      scheduledStart: '09:00',
      reminderAt: null,
      reminderSent: false,
      createdAt: now - 3000,
      updatedAt: now - 3000,
    },
    {
      id: `task-${crypto.randomUUID().slice(0, 8)}`,
      title: 'Sesión de trabajo profundo sin interrupciones',
      notes: 'Activar temporizador de enfoque y silenciar notificaciones externas.',
      completed: false,
      priority: 'alta',
      category: 'Trabajo',
      durationMinutes: 60,
      focusMinutesLogged: 0,
      dueDate: today,
      scheduledStart: '10:00',
      reminderAt: null,
      reminderSent: false,
      createdAt: now - 2000,
      updatedAt: now - 2000,
    },
    {
      id: `task-${crypto.randomUUID().slice(0, 8)}`,
      title: 'Pausa activa y caminata breve',
      notes: 'Estirar espalda y descansar la vista 20 minutos.',
      completed: false,
      priority: 'media',
      category: 'Salud',
      durationMinutes: 30,
      focusMinutesLogged: 0,
      dueDate: today,
      scheduledStart: '13:00',
      reminderAt: null,
      reminderSent: false,
      createdAt: now - 1000,
      updatedAt: now - 1000,
    },
  ];
}

function getWorkspaceStorageKey(workspaceId: string): string {
  return `krono_ws_${sanitizeWorkspaceId(workspaceId)}`;
}

function getWorkspaceSeededKey(workspaceId: string): string {
  return `krono_seeded_${sanitizeWorkspaceId(workspaceId)}`;
}

function getPendingOpsKey(workspaceId: string): string {
  return `krono_pending_${sanitizeWorkspaceId(workspaceId)}`;
}

export function loadWorkspaceFromLocal(workspaceId: string, allowStarterSeed = true): WorkspaceState {
  const safeId = sanitizeWorkspaceId(workspaceId);
  const key = getWorkspaceStorageKey(safeId);
  const raw = localStorage.getItem(key);

  if (raw) {
    try {
      const parsed = JSON.parse(raw) as WorkspaceState;
      if (parsed && Array.isArray(parsed.tasks) && parsed.timer) {
        return {
          workspaceId: safeId,
          tasks: parsed.tasks,
          timer: parsed.timer,
          updatedAt: parsed.updatedAt || Date.now(),
        };
      }
    } catch {
      // Fallback below
    }
  }

  const seededKey = getWorkspaceSeededKey(safeId);
  const alreadySeeded = localStorage.getItem(seededKey) === '1';
  const hasWsParam = new URLSearchParams(window.location.search).has('ws');

  const initial: WorkspaceState = {
    workspaceId: safeId,
    tasks: allowStarterSeed && !alreadySeeded && !hasWsParam ? createStarterTasks() : [],
    timer: createDefaultTimer(),
    updatedAt: Date.now(),
  };

  if (allowStarterSeed && !alreadySeeded && !hasWsParam) {
    localStorage.setItem(seededKey, '1');
  }
  saveWorkspaceToLocal(initial);
  return initial;
}

export function saveWorkspaceToLocal(state: WorkspaceState): void {
  const key = getWorkspaceStorageKey(state.workspaceId);
  localStorage.setItem(key, JSON.stringify(state));
}

export function mergeWorkspaceStates(
  local: WorkspaceState,
  remote: WorkspaceState
): WorkspaceState {
  const taskMap = new Map<string, TaskItem>();

  for (const t of local.tasks) {
    taskMap.set(t.id, t);
  }
  for (const t of remote.tasks) {
    const existing = taskMap.get(t.id);
    if (!existing || t.updatedAt >= existing.updatedAt) {
      taskMap.set(t.id, t);
    }
  }

  const timer =
    remote.timer.updatedAt >= local.timer.updatedAt ? remote.timer : local.timer;

  return {
    workspaceId: remote.workspaceId || local.workspaceId,
    tasks: Array.from(taskMap.values()).sort((a, b) => a.createdAt - b.createdAt),
    timer,
    updatedAt: Math.max(local.updatedAt, remote.updatedAt),
  };
}

export function loadPendingOps(workspaceId: string): PendingOp[] {
  const raw = localStorage.getItem(getPendingOpsKey(workspaceId));
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as PendingOp[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function enqueuePendingOp(workspaceId: string, op: PendingOp): void {
  const ops = loadPendingOps(workspaceId);
  ops.push(op);
  localStorage.setItem(getPendingOpsKey(workspaceId), JSON.stringify(ops.slice(-100)));
}

export function clearPendingOps(workspaceId: string): void {
  localStorage.removeItem(getPendingOpsKey(workspaceId));
}

export function getSavedTheme(): 'light' | 'dark' {
  const saved = localStorage.getItem(THEME_KEY);
  if (saved === 'dark' || saved === 'light') return saved;
  return 'light';
}

export function saveTheme(theme: 'light' | 'dark'): void {
  localStorage.setItem(THEME_KEY, theme);
}
