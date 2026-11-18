export type TaskPriority = 'alta' | 'media' | 'baja';

export type TaskCategory = 'Trabajo' | 'Personal' | 'Estudio' | 'Salud';

export interface TaskItem {
  id: string;
  title: string;
  notes: string;
  completed: boolean;
  priority: TaskPriority;
  category: TaskCategory;
  durationMinutes: number;
  focusMinutesLogged: number;
  dueDate: string | null; // YYYY-MM-DD
  scheduledStart: string | null; // HH:mm
  reminderAt: string | null; // ISO timestamp
  reminderSent: boolean;
  createdAt: number;
  updatedAt: number;
}

export type TimerMode = 'focus' | 'shortBreak' | 'longBreak';

export type TimerStatus = 'idle' | 'running' | 'paused';

export interface FocusTimerState {
  mode: TimerMode;
  status: TimerStatus;
  durationSeconds: number;
  remainingSeconds: number;
  startedAt: number | null;
  activeTaskId: string | null;
  completedSessions: number;
  updatedAt: number;
}

export type DeviceType = 'desktop' | 'mobile' | 'tablet';

export interface ConnectedDevice {
  deviceId: string;
  name: string;
  type: DeviceType;
  connectedAt: number;
  lastSeenAt: number;
  pushEnabled: boolean;
  isOnline: boolean;
}

export interface WorkspaceState {
  workspaceId: string;
  tasks: TaskItem[];
  timer: FocusTimerState;
  updatedAt: number;
}

export interface ReminderEvent {
  id: string;
  taskId: string;
  title: string;
  category: TaskCategory;
  priority: TaskPriority;
  triggeredAt: number;
}

export type WSClientMessage =
  | {
      type: 'join';
      workspaceId: string;
      device: {
        deviceId: string;
        name: string;
        type: DeviceType;
        pushEnabled: boolean;
      };
      localState?: WorkspaceState;
    }
  | {
      type: 'task:upsert';
      workspaceId: string;
      task: TaskItem;
      originDeviceId: string;
    }
  | {
      type: 'task:delete';
      workspaceId: string;
      taskId: string;
      originDeviceId: string;
    }
  | {
      type: 'timer:update';
      workspaceId: string;
      timer: FocusTimerState;
      originDeviceId: string;
    }
  | {
      type: 'device:push_status';
      workspaceId: string;
      deviceId: string;
      pushEnabled: boolean;
    };

export type WSServerMessage =
  | {
      type: 'workspace:state';
      state: WorkspaceState;
      devices: ConnectedDevice[];
    }
  | {
      type: 'task:upsert';
      task: TaskItem;
      originDeviceId: string;
    }
  | {
      type: 'task:delete';
      taskId: string;
      originDeviceId: string;
    }
  | {
      type: 'timer:update';
      timer: FocusTimerState;
      originDeviceId: string;
    }
  | {
      type: 'devices:update';
      devices: ConnectedDevice[];
    }
  | {
      type: 'reminder:triggered';
      reminder: ReminderEvent;
    };
