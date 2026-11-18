import React from 'react';
import { Pause, Play, RotateCcw } from 'lucide-react';
import type { FocusTimerState, TaskItem, TimerMode } from '../types';

interface FocusTimerViewProps {
  timer: FocusTimerState;
  displaySeconds: number;
  tasks: TaskItem[];
  onStart: (taskId?: string | null) => void;
  onPause: () => void;
  onReset: (mode?: TimerMode) => void;
  onSelectTask: (taskId: string | null) => void;
}

function formatClock(totalSeconds: number): string {
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export const FocusTimerView: React.FC<FocusTimerViewProps> = ({
  timer,
  displaySeconds,
  tasks,
  onStart,
  onPause,
  onReset,
  onSelectTask,
}) => {
  const pendingTasks = tasks.filter((t) => !t.completed);
  const activeTask = tasks.find((t) => t.id === timer.activeTaskId) || null;
  const progressPct =
    timer.durationSeconds > 0
      ? Math.round(((timer.durationSeconds - displaySeconds) / timer.durationSeconds) * 100)
      : 0;

  const modes: { id: TimerMode; label: string }[] = [
    { id: 'focus', label: 'Enfoque 25m' },
    { id: 'shortBreak', label: 'Descanso 5m' },
    { id: 'longBreak', label: 'Descanso largo 15m' },
  ];

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="rounded-xl border border-slate-200 bg-white p-6 sm:p-8 dark:border-slate-800 dark:bg-slate-900">
        {/* Mode Switcher */}
        <div className="flex flex-wrap items-center justify-center gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
          {modes.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => onReset(m.id)}
              className={`rounded-md px-3.5 py-2 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                timer.mode === m.id
                  ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-900 dark:text-white'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>

        {/* Countdown Clock */}
        <div className="my-8 text-center">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            {timer.status === 'running'
              ? 'Sesión activa · Sincronizada en todos tus dispositivos'
              : timer.status === 'paused'
              ? 'Sesión en pausa'
              : 'Listo para comenzar'}
          </p>

          <div className="mt-3 font-mono text-6xl font-semibold tracking-tight text-slate-900 tabular-nums sm:text-7xl dark:text-white">
            {formatClock(displaySeconds)}
          </div>

          <div className="mx-auto mt-5 h-1.5 w-full max-w-sm overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
            <div
              className="h-full bg-blue-600 transition-all duration-300"
              style={{ width: `${Math.min(100, Math.max(0, progressPct))}%` }}
            />
          </div>
        </div>

        {/* Linked Task Selector */}
        <div className="mx-auto max-w-md">
          <label
            htmlFor="focus-task-select"
            className="block text-xs font-medium text-slate-600 dark:text-slate-400"
          >
            Tarea vinculada a esta sesión
          </label>
          <select
            id="focus-task-select"
            value={timer.activeTaskId || ''}
            onChange={(e) => onSelectTask(e.target.value || null)}
            className="mt-1.5 w-full rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2 text-sm text-slate-900 focus:border-blue-600 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-white"
          >
            <option value="">Sesión libre sin tarea específica</option>
            {pendingTasks.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title} ({t.durationMinutes} min)
              </option>
            ))}
          </select>
          {activeTask && (
            <p className="mt-1.5 text-xs text-slate-500 tabular-nums dark:text-slate-400">
              Tiempo enfocado registrado: {activeTask.focusMinutesLogged || 0} min
            </p>
          )}
        </div>

        {/* Primary Timer Controls */}
        <div className="mt-8 flex items-center justify-center gap-3">
          {timer.status === 'running' ? (
            <button
              type="button"
              onClick={onPause}
              className="flex items-center gap-2 rounded-lg bg-slate-900 px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-slate-800 whitespace-nowrap dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
            >
              <Pause className="h-4 w-4" />
              <span>Pausar</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onStart()}
              className="flex items-center gap-2 rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 whitespace-nowrap"
            >
              <Play className="h-4 w-4" />
              <span>{timer.status === 'paused' ? 'Reanudar' : 'Iniciar sesión'}</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => onReset()}
            className="flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 whitespace-nowrap dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <RotateCcw className="h-4 w-4" />
            <span>Reiniciar</span>
          </button>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 divide-x divide-slate-200 rounded-xl border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
        <div className="p-4">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Sesiones completadas
          </p>
          <p className="mt-1 font-display text-2xl font-semibold text-slate-900 tabular-nums dark:text-white">
            {timer.completedSessions}
          </p>
        </div>
        <div className="p-4">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Minutos enfocados totales
          </p>
          <p className="mt-1 font-display text-2xl font-semibold text-slate-900 tabular-nums dark:text-white">
            {tasks.reduce((sum, t) => sum + (t.focusMinutesLogged || 0), 0)} min
          </p>
        </div>
      </div>
    </div>
  );
};
