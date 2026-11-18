import React, { useEffect, useState } from 'react';
import { Menu, Plus } from 'lucide-react';
import { DayTasksView } from './components/DayTasksView';
import { DevicesSyncView } from './components/DevicesSyncView';
import { FocusTimerView } from './components/FocusTimerView';
import { PWAInstallButton } from './components/PWAInstallButton';
import { ReminderToast } from './components/ReminderToast';
import { type AppView, Sidebar } from './components/Sidebar';
import { TaskModal } from './components/TaskModal';
import { TimeBlockingView } from './components/TimeBlockingView';
import { useWorkspaceSync } from './hooks/useWorkspaceSync';
import { getSavedTheme, saveTheme } from './lib/storage';
import type { TaskItem } from './types';

const VIEW_TITLES: Record<AppView, string> = {
  tasks: 'Mi Día',
  timeline: 'Bloques de Tiempo',
  timer: 'Temporizador de Enfoque',
  devices: 'Dispositivos y Push',
};

export default function App() {
  const {
    workspaceId,
    device,
    tasks,
    timer,
    displaySeconds,
    devices,
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
  } = useWorkspaceSync();

  const [activeView, setActiveView] = useState<AppView>('tasks');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<TaskItem | null>(null);
  const [defaultSlot, setDefaultSlot] = useState<string | null>(null);
  const [theme, setTheme] = useState<'light' | 'dark'>(() => getSavedTheme());

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    saveTheme(theme);
  }, [theme]);

  const pendingCount = tasks.filter((t) => !t.completed).length;
  const onlineCount = Math.max(1, devices.filter((d) => d.isOnline).length);

  const openNewTaskModal = (hourSlot: string | null = null) => {
    setEditingTask(null);
    setDefaultSlot(hourSlot);
    setModalOpen(true);
  };

  const openEditTaskModal = (task: TaskItem) => {
    setEditingTask(task);
    setDefaultSlot(null);
    setModalOpen(true);
  };

  const handleStartFocusOnTask = (taskId: string) => {
    startTimer(taskId);
    setActiveView('timer');
  };

  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <Sidebar
        activeView={activeView}
        onSelectView={setActiveView}
        workspaceId={workspaceId}
        onlineDevicesCount={onlineCount}
        connectionStatus={connectionStatus}
        pendingCount={pendingCount}
        timerRunning={timer.status === 'running'}
        displaySeconds={displaySeconds}
        theme={theme}
        onToggleTheme={() => setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))}
        mobileOpen={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top Header */}
        <header className="sticky top-0 z-30 flex items-center justify-between gap-4 border-b border-slate-200 bg-white/95 px-4 py-3.5 backdrop-blur-sm sm:px-6 dark:border-slate-800 dark:bg-slate-900/95">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Abrir menú"
              className="rounded-lg p-1.5 text-slate-600 hover:bg-slate-100 lg:hidden dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <Menu className="h-5 w-5" />
            </button>

            <div className="flex min-w-0 items-center gap-2 text-sm">
              <span className="hidden text-slate-400 sm:inline dark:text-slate-500">
                Espacio {workspaceId}
              </span>
              <span className="hidden text-slate-300 sm:inline dark:text-slate-700">/</span>
              <h1 className="truncate font-display text-base font-semibold text-slate-900 sm:text-lg dark:text-white">
                {VIEW_TITLES[activeView]}
              </h1>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2.5">
            <PWAInstallButton />
            <button
              type="button"
              onClick={() => openNewTaskModal(null)}
              className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-2 text-xs font-medium text-white transition-colors hover:bg-blue-700 whitespace-nowrap shrink-0"
            >
              <Plus className="h-4 w-4" />
              <span>Nueva tarea</span>
            </button>
          </div>
        </header>

        {/* Offline Banner */}
        {!isOnline && (
          <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs font-medium text-amber-800 sm:px-6 dark:border-amber-900/60 dark:bg-amber-950/50 dark:text-amber-300">
            Modo sin conexión — Tus cambios se guardan en localStorage y se sincronizarán al recuperar la red.
          </div>
        )}

        {/* Main Content Viewport */}
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6">
          {activeView === 'tasks' && (
            <DayTasksView
              tasks={tasks}
              onCreateQuickTask={upsertTask}
              onToggleComplete={toggleTaskComplete}
              onEditTask={openEditTaskModal}
              onDeleteTask={deleteTask}
              onStartFocusTask={handleStartFocusOnTask}
              onOpenNewModal={() => openNewTaskModal(null)}
              onLoadSampleDay={loadSampleDay}
            />
          )}

          {activeView === 'timeline' && (
            <TimeBlockingView
              tasks={tasks}
              onAssignSlot={(task, hourSlot) =>
                upsertTask({ ...task, scheduledStart: hourSlot })
              }
              onToggleComplete={toggleTaskComplete}
              onEditTask={openEditTaskModal}
              onCreateAtHour={(hourSlot) => openNewTaskModal(hourSlot)}
            />
          )}

          {activeView === 'timer' && (
            <FocusTimerView
              timer={timer}
              displaySeconds={displaySeconds}
              tasks={tasks}
              onStart={startTimer}
              onPause={pauseTimer}
              onReset={resetTimer}
              onSelectTask={setTimerTask}
            />
          )}

          {activeView === 'devices' && (
            <DevicesSyncView
              workspaceId={workspaceId}
              currentDevice={device}
              devices={devices}
              connectionStatus={connectionStatus}
              onSwitchWorkspace={switchWorkspace}
              onRenameDevice={renameCurrentDevice}
              onNotifyPushStatus={notifyPushStatus}
            />
          )}
        </main>
      </div>

      <TaskModal
        isOpen={modalOpen}
        initialTask={editingTask}
        defaultScheduledStart={defaultSlot}
        onClose={() => setModalOpen(false)}
        onSave={upsertTask}
      />

      <ReminderToast
        reminders={activeReminders}
        onCompleteTask={toggleTaskComplete}
        onSnoozeTask={snoozeTaskReminder}
        onDismiss={dismissReminder}
      />
    </div>
  );
}
