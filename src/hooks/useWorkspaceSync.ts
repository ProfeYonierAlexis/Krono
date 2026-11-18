import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  getActivePushSubscription,
  playReminderChime,
  showNativeNotification,
} from '../lib/push';
import {
  clearPendingOps,
  createDefaultTimer,
  createStarterTasks,
  enqueuePendingOp,
  getInitialWorkspaceId,
  getOrCreateDeviceIdentity,
  loadPendingOps,
  loadWorkspaceFromLocal,
  mergeWorkspaceStates,
  sanitizeWorkspaceId,
  saveWorkspaceToLocal,
  setSavedWorkspaceId,
  updateDeviceName,
} from '../lib/storage';
import type {
  ConnectedDevice,
  FocusTimerState,
  ReminderEvent,
  TaskItem,
  TimerMode,
  WorkspaceState,
  WSClientMessage,
  WSServerMessage,
} from '../types';

export type SyncConnectionStatus = 'connected' | 'connecting' | 'local-only';

const MODE_SECONDS: Record<TimerMode, number> = {
  focus: 25 * 60,
  shortBreak: 5 * 60,
  longBreak: 15 * 60,
};

export function useWorkspaceSync() {
  const [workspaceId, setWorkspaceId] = useState<string>(() => getInitialWorkspaceId());
  const [device, setDevice] = useState(() => getOrCreateDeviceIdentity());
  const [state, setState] = useState<WorkspaceState>(() =>
    loadWorkspaceFromLocal(getInitialWorkspaceId())
  );
  const [devices, setDevices] = useState<ConnectedDevice[]>([]);
  const [connectionStatus, setConnectionStatus] =
    useState<SyncConnectionStatus>('connecting');
  const [isOnline, setIsOnline] = useState(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [activeReminders, setActiveReminders] = useState<ReminderEvent[]>([]);
  const [displaySeconds, setDisplaySeconds] = useState<number>(state.timer.remainingSeconds);

  const wsRef = useRef<WebSocket | null>(null);
  const channelRef = useRef<BroadcastChannel | null>(null);
  const stateRef = useRef<WorkspaceState>(state);
  const deviceRef = useRef(device);
  const triggeredIdsRef = useRef<Set<string>>(new Set());
  const timerFinishedRef = useRef<boolean>(false);

  stateRef.current = state;
  deviceRef.current = device;

  // Keep URL & localStorage synced
  useEffect(() => {
    saveWorkspaceToLocal(state);
  }, [state]);

  // Track browser online/offline
  useEffect(() => {
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  // BroadcastChannel for instantaneous same-device multi-tab sync (backed by localStorage)
  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return;
    const channel = new BroadcastChannel(`krono-sync-${workspaceId}`);
    channelRef.current = channel;

    channel.onmessage = (event: MessageEvent<WSServerMessage>) => {
      const msg = event.data;
      if (!msg) return;
      if (msg.type === 'task:upsert') {
        setState((prev) => {
          const exists = prev.tasks.find((t) => t.id === msg.task.id);
          if (exists && exists.updatedAt >= msg.task.updatedAt) return prev;
          const nextTasks = exists
            ? prev.tasks.map((t) => (t.id === msg.task.id ? msg.task : t))
            : [...prev.tasks, msg.task];
          return { ...prev, tasks: nextTasks, updatedAt: Math.max(prev.updatedAt, msg.task.updatedAt) };
        });
      } else if (msg.type === 'task:delete') {
        setState((prev) => ({
          ...prev,
          tasks: prev.tasks.filter((t) => t.id !== msg.taskId),
          updatedAt: Date.now(),
        }));
      } else if (msg.type === 'timer:update') {
        setState((prev) => {
          if (prev.timer.updatedAt >= msg.timer.updatedAt) return prev;
          return { ...prev, timer: msg.timer, updatedAt: Math.max(prev.updatedAt, msg.timer.updatedAt) };
        });
      }
    };

    const onStorage = (e: StorageEvent) => {
      if (e.key === `krono_ws_${workspaceId}` && e.newValue) {
        try {
          const updated = JSON.parse(e.newValue) as WorkspaceState;
          setState((prev) => mergeWorkspaceStates(prev, updated));
        } catch {
          // Ignore malformed storage
        }
      }
    };
    window.addEventListener('storage', onStorage);

    return () => {
      channel.close();
      channelRef.current = null;
      window.removeEventListener('storage', onStorage);
    };
  }, [workspaceId]);

  const pushReminderAlert = useCallback(
    (reminder: ReminderEvent, notifySystem: boolean) => {
      if (triggeredIdsRef.current.has(reminder.taskId || reminder.id)) {
        return;
      }
      if (reminder.taskId) {
        triggeredIdsRef.current.add(reminder.taskId);
      }

      setActiveReminders((prev) => [reminder, ...prev.slice(0, 4)]);
      playReminderChime();

      if (notifySystem) {
        void showNativeNotification(
          `Recordatorio: ${reminder.title}`,
          `${reminder.category} · Prioridad ${reminder.priority}`,
          reminder.taskId,
          workspaceId
        );
      }
    },
    [workspaceId]
  );

  // WebSocket real-time multi-device connection with auto-reconnect
  useEffect(() => {
    let cancelled = false;
    let reconnectTimer: number | null = null;
    let attempt = 0;

    const connect = async () => {
      if (cancelled) return;
      if (!navigator.onLine) {
        setConnectionStatus('local-only');
        return;
      }

      setConnectionStatus('connecting');
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws`;
      const pushSub = await getActivePushSubscription();

      if (cancelled) return;

      const socket = new WebSocket(wsUrl);
      wsRef.current = socket;

      socket.onopen = () => {
        attempt = 0;
        setConnectionStatus('connected');

        const joinMsg: WSClientMessage = {
          type: 'join',
          workspaceId,
          device: {
            ...deviceRef.current,
            pushEnabled: Boolean(pushSub),
          },
          localState: stateRef.current,
        };
        socket.send(JSON.stringify(joinMsg));

        // Flush any queued offline ops
        const pending = loadPendingOps(workspaceId);
        if (pending.length > 0) {
          for (const op of pending) {
            if (op.type === 'task:upsert') {
              socket.send(
                JSON.stringify({
                  type: 'task:upsert',
                  workspaceId,
                  task: op.task,
                  originDeviceId: deviceRef.current.deviceId,
                } satisfies WSClientMessage)
              );
            } else if (op.type === 'task:delete') {
              socket.send(
                JSON.stringify({
                  type: 'task:delete',
                  workspaceId,
                  taskId: op.taskId,
                  originDeviceId: deviceRef.current.deviceId,
                } satisfies WSClientMessage)
              );
            } else if (op.type === 'timer:update') {
              socket.send(
                JSON.stringify({
                  type: 'timer:update',
                  workspaceId,
                  timer: op.timer,
                  originDeviceId: deviceRef.current.deviceId,
                } satisfies WSClientMessage)
              );
            }
          }
          clearPendingOps(workspaceId);
        }
      };

      socket.onmessage = (event) => {
        let msg: WSServerMessage;
        try {
          msg = JSON.parse(event.data as string) as WSServerMessage;
        } catch {
          return;
        }

        if (msg.type === 'workspace:state') {
          setState((prev) => {
            const merged = mergeWorkspaceStates(prev, msg.state);
            saveWorkspaceToLocal(merged);
            return merged;
          });
          setDevices(msg.devices);
        } else if (msg.type === 'task:upsert') {
          setState((prev) => {
            const exists = prev.tasks.find((t) => t.id === msg.task.id);
            if (exists && exists.updatedAt > msg.task.updatedAt) return prev;
            const nextTasks = exists
              ? prev.tasks.map((t) => (t.id === msg.task.id ? msg.task : t))
              : [...prev.tasks, msg.task];
            return {
              ...prev,
              tasks: nextTasks,
              updatedAt: Math.max(prev.updatedAt, msg.task.updatedAt),
            };
          });
        } else if (msg.type === 'task:delete') {
          setState((prev) => ({
            ...prev,
            tasks: prev.tasks.filter((t) => t.id !== msg.taskId),
            updatedAt: Date.now(),
          }));
        } else if (msg.type === 'timer:update') {
          setState((prev) => {
            if (prev.timer.updatedAt > msg.timer.updatedAt) return prev;
            return {
              ...prev,
              timer: msg.timer,
              updatedAt: Math.max(prev.updatedAt, msg.timer.updatedAt),
            };
          });
        } else if (msg.type === 'devices:update') {
          setDevices(msg.devices);
        } else if (msg.type === 'reminder:triggered') {
          pushReminderAlert(msg.reminder, document.visibilityState !== 'visible');
        }
      };

      socket.onclose = () => {
        if (wsRef.current === socket) {
          wsRef.current = null;
        }
        if (cancelled) return;
        setConnectionStatus('local-only');
        const delay = Math.min(10000, 1200 * Math.pow(1.6, attempt));
        attempt += 1;
        reconnectTimer = window.setTimeout(() => {
          void connect();
        }, delay);
      };

      socket.onerror = () => {
        socket.close();
      };
    };

    void connect();

    return () => {
      cancelled = true;
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [workspaceId, isOnline, pushReminderAlert]);

  const sendWSOrQueue = useCallback(
    (msg: WSClientMessage) => {
      const socket = wsRef.current;
      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify(msg));
        return;
      }
      if (msg.type === 'task:upsert') {
        enqueuePendingOp(workspaceId, { type: 'task:upsert', task: msg.task, timestamp: Date.now() });
      } else if (msg.type === 'task:delete') {
        enqueuePendingOp(workspaceId, { type: 'task:delete', taskId: msg.taskId, timestamp: Date.now() });
      } else if (msg.type === 'timer:update') {
        enqueuePendingOp(workspaceId, { type: 'timer:update', timer: msg.timer, timestamp: Date.now() });
      }
    },
    [workspaceId]
  );

  const upsertTask = useCallback(
    (task: TaskItem) => {
      const updatedTask: TaskItem = { ...task, updatedAt: Date.now() };
      if (updatedTask.reminderAt && Date.parse(updatedTask.reminderAt) > Date.now()) {
        updatedTask.reminderSent = false;
        triggeredIdsRef.current.delete(updatedTask.id);
      }

      setState((prev) => {
        const exists = prev.tasks.some((t) => t.id === updatedTask.id);
        const nextTasks = exists
          ? prev.tasks.map((t) => (t.id === updatedTask.id ? updatedTask : t))
          : [...prev.tasks, updatedTask];
        return { ...prev, tasks: nextTasks, updatedAt: updatedTask.updatedAt };
      });

      channelRef.current?.postMessage({
        type: 'task:upsert',
        task: updatedTask,
        originDeviceId: deviceRef.current.deviceId,
      } satisfies WSServerMessage);

      sendWSOrQueue({
        type: 'task:upsert',
        workspaceId,
        task: updatedTask,
        originDeviceId: deviceRef.current.deviceId,
      });
    },
    [sendWSOrQueue, workspaceId]
  );

  const deleteTask = useCallback(
    (taskId: string) => {
      const now = Date.now();
      setState((prev) => ({
        ...prev,
        tasks: prev.tasks.filter((t) => t.id !== taskId),
        updatedAt: now,
      }));

      channelRef.current?.postMessage({
        type: 'task:delete',
        taskId,
        originDeviceId: deviceRef.current.deviceId,
      } satisfies WSServerMessage);

      sendWSOrQueue({
        type: 'task:delete',
        workspaceId,
        taskId,
        originDeviceId: deviceRef.current.deviceId,
      });
    },
    [sendWSOrQueue, workspaceId]
  );

  const toggleTaskComplete = useCallback(
    (taskId: string) => {
      const target = stateRef.current.tasks.find((t) => t.id === taskId);
      if (!target) return;
      upsertTask({
        ...target,
        completed: !target.completed,
      });
    },
    [upsertTask]
  );

  const snoozeTaskReminder = useCallback(
    (taskId: string, minutes: number) => {
      const target = stateRef.current.tasks.find((t) => t.id === taskId);
      if (!target) return;
      const nextTime = new Date(Date.now() + minutes * 60 * 1000).toISOString();
      triggeredIdsRef.current.delete(taskId);
      upsertTask({
        ...target,
        reminderAt: nextTime,
        reminderSent: false,
      });
      setActiveReminders((prev) => prev.filter((r) => r.taskId !== taskId));
    },
    [upsertTask]
  );

  const dismissReminder = useCallback((reminderId: string) => {
    setActiveReminders((prev) => prev.filter((r) => r.id !== reminderId));
  }, []);

  const updateTimer = useCallback(
    (nextTimer: FocusTimerState) => {
      const stamped: FocusTimerState = { ...nextTimer, updatedAt: Date.now() };
      setState((prev) => ({
        ...prev,
        timer: stamped,
        updatedAt: stamped.updatedAt,
      }));

      channelRef.current?.postMessage({
        type: 'timer:update',
        timer: stamped,
        originDeviceId: deviceRef.current.deviceId,
      } satisfies WSServerMessage);

      sendWSOrQueue({
        type: 'timer:update',
        workspaceId,
        timer: stamped,
        originDeviceId: deviceRef.current.deviceId,
      });
    },
    [sendWSOrQueue, workspaceId]
  );

  const startTimer = useCallback(
    (activeTaskId?: string | null) => {
      const cur = stateRef.current.timer;
      timerFinishedRef.current = false;
      updateTimer({
        ...cur,
        status: 'running',
        startedAt: Date.now(),
        activeTaskId: activeTaskId !== undefined ? activeTaskId : cur.activeTaskId,
      });
    },
    [updateTimer]
  );

  const pauseTimer = useCallback(() => {
    const cur = stateRef.current.timer;
    if (cur.status !== 'running' || !cur.startedAt) return;
    const elapsed = Math.floor((Date.now() - cur.startedAt) / 1000);
    const remaining = Math.max(0, cur.remainingSeconds - elapsed);
    updateTimer({
      ...cur,
      status: 'paused',
      remainingSeconds: remaining,
      startedAt: null,
    });
  }, [updateTimer]);

  const resetTimer = useCallback(
    (mode?: TimerMode) => {
      const cur = stateRef.current.timer;
      const targetMode = mode || cur.mode;
      const secs = MODE_SECONDS[targetMode];
      timerFinishedRef.current = false;
      updateTimer({
        ...cur,
        mode: targetMode,
        status: 'idle',
        durationSeconds: secs,
        remainingSeconds: secs,
        startedAt: null,
      });
    },
    [updateTimer]
  );

  const setTimerTask = useCallback(
    (taskId: string | null) => {
      const cur = stateRef.current.timer;
      updateTimer({
        ...cur,
        activeTaskId: taskId,
      });
    },
    [updateTimer]
  );

  // Live synced timer tick (anchored to startedAt)
  useEffect(() => {
    const computeRemaining = () => {
      const t = stateRef.current.timer;
      if (t.status === 'running' && t.startedAt) {
        const elapsed = Math.floor((Date.now() - t.startedAt) / 1000);
        return Math.max(0, t.remainingSeconds - elapsed);
      }
      return t.remainingSeconds;
    };

    setDisplaySeconds(computeRemaining());

    const interval = window.setInterval(() => {
      const rem = computeRemaining();
      setDisplaySeconds(rem);

      const cur = stateRef.current.timer;
      if (cur.status === 'running' && rem === 0 && !timerFinishedRef.current) {
        timerFinishedRef.current = true;
        const wasFocus = cur.mode === 'focus';
        const loggedMinutes = Math.round(cur.durationSeconds / 60);

        if (wasFocus && cur.activeTaskId) {
          const linked = stateRef.current.tasks.find((t) => t.id === cur.activeTaskId);
          if (linked) {
            upsertTask({
              ...linked,
              focusMinutesLogged: (linked.focusMinutesLogged || 0) + loggedMinutes,
            });
          }
        }

        const nextMode: TimerMode = wasFocus ? 'shortBreak' : 'focus';
        const nextSecs = MODE_SECONDS[nextMode];
        updateTimer({
          ...cur,
          mode: nextMode,
          status: 'idle',
          durationSeconds: nextSecs,
          remainingSeconds: nextSecs,
          startedAt: null,
          completedSessions: wasFocus ? cur.completedSessions + 1 : cur.completedSessions,
        });

        playReminderChime();
        void showNativeNotification(
          wasFocus ? 'Sesión de enfoque completada' : 'Descanso finalizado',
          wasFocus
            ? 'Buen trabajo. Puedes tomar 5 minutos de pausa.'
            : 'Es momento de retomar tu siguiente bloque de enfoque.',
          cur.activeTaskId || undefined,
          workspaceId
        );
      }
    }, 500);

    return () => window.clearInterval(interval);
  }, [state.timer, updateTimer, upsertTask, workspaceId]);

  // Client-side localStorage reminder watcher (works even when offline!)
  useEffect(() => {
    const checkReminders = () => {
      const now = Date.now();
      for (const task of stateRef.current.tasks) {
        if (!task.completed && task.reminderAt && !task.reminderSent) {
          const dueMs = Date.parse(task.reminderAt);
          if (!Number.isNaN(dueMs) && dueMs <= now) {
            upsertTask({
              ...task,
              reminderSent: true,
            });
            pushReminderAlert(
              {
                id: `rem-local-${task.id}-${now}`,
                taskId: task.id,
                title: task.title,
                category: task.category,
                priority: task.priority,
                triggeredAt: now,
              },
              true
            );
          }
        }
      }
    };

    checkReminders();
    const timer = window.setInterval(checkReminders, 4000);
    return () => window.clearInterval(timer);
  }, [pushReminderAlert, upsertTask]);

  // Handle Service Worker notification click actions ('complete' / 'snooze')
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const onMessage = (event: MessageEvent) => {
      const data = event.data as {
        type?: string;
        action?: string;
        taskId?: string;
      };
      if (data?.type !== 'KRONO_NOTIFICATION_ACTION' || !data.taskId) return;
      if (data.action === 'complete') {
        const target = stateRef.current.tasks.find((t) => t.id === data.taskId);
        if (target && !target.completed) {
          upsertTask({ ...target, completed: true });
        }
        setActiveReminders((prev) => prev.filter((r) => r.taskId !== data.taskId));
      } else if (data.action === 'snooze') {
        snoozeTaskReminder(data.taskId, 10);
      }
    };
    navigator.serviceWorker.addEventListener('message', onMessage);
    return () => navigator.serviceWorker.removeEventListener('message', onMessage);
  }, [snoozeTaskReminder, upsertTask]);

  const switchWorkspace = useCallback((nextId: string) => {
    const clean = sanitizeWorkspaceId(nextId);
    setSavedWorkspaceId(clean);
    const local = loadWorkspaceFromLocal(clean, false);
    setState(local);
    setDevices([]);
    setWorkspaceId(clean);
  }, []);

  const loadSampleDay = useCallback(() => {
    const samples = createStarterTasks();
    for (const task of samples) {
      upsertTask(task);
    }
  }, [upsertTask]);

  const renameCurrentDevice = useCallback((newName: string) => {
    const updated = updateDeviceName(newName);
    setDevice(updated);
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: 'join',
          workspaceId,
          device: {
            ...updated,
            pushEnabled: Boolean(
              devices.find((d) => d.deviceId === updated.deviceId)?.pushEnabled
            ),
          },
        } satisfies WSClientMessage)
      );
    }
  }, [devices, workspaceId]);

  const notifyPushStatus = useCallback(
    (pushEnabled: boolean) => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(
          JSON.stringify({
            type: 'device:push_status',
            workspaceId,
            deviceId: deviceRef.current.deviceId,
            pushEnabled,
          } satisfies WSClientMessage)
        );
      }
    },
    [workspaceId]
  );

  const visibleDevices = useMemo<ConnectedDevice[]>(() => {
    if (devices.length > 0) return devices;
    return [
      {
        deviceId: device.deviceId,
        name: device.name,
        type: device.type,
        connectedAt: Date.now(),
        lastSeenAt: Date.now(),
        pushEnabled: false,
        isOnline: true,
      },
    ];
  }, [devices, device]);

  return {
    workspaceId,
    device,
    tasks: state.tasks,
    timer: state.timer,
    displaySeconds,
    devices: visibleDevices,
    connectionStatus,
    isOnline,
    activeReminders,
    upsertTask,
    deleteTask,
    toggleTaskComplete,
    snoozeTaskReminder,
    dismissReminder,
    startTimer,
    pauseTimer,
    resetTimer,
    setTimerTask,
    switchWorkspace,
    loadSampleDay,
    renameCurrentDevice,
    notifyPushStatus,
    resetWorkspaceTimerDefault: () => updateTimer(createDefaultTimer()),
  };
}
