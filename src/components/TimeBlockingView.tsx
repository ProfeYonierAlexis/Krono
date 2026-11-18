import React, { useMemo } from 'react';
import { Bell, Check, Plus, X } from 'lucide-react';
import type { TaskItem } from '../types';

interface TimeBlockingViewProps {
  tasks: TaskItem[];
  onAssignSlot: (task: TaskItem, hourSlot: string | null) => void;
  onToggleComplete: (taskId: string) => void;
  onEditTask: (task: TaskItem) => void;
  onCreateAtHour: (hourSlot: string) => void;
}

const HOURS = Array.from({ length: 18 }, (_, i) => {
  const h = i + 6;
  return `${String(h).padStart(2, '0')}:00`;
});

export const TimeBlockingView: React.FC<TimeBlockingViewProps> = ({
  tasks,
  onAssignSlot,
  onToggleComplete,
  onEditTask,
  onCreateAtHour,
}) => {
  const currentHourPrefix = `${String(new Date().getHours()).padStart(2, '0')}:00`;

  const unscheduledTasks = useMemo(
    () => tasks.filter((t) => !t.scheduledStart && !t.completed),
    [tasks]
  );

  const tasksByHour = useMemo(() => {
    const map = new Map<string, TaskItem[]>();
    for (const h of HOURS) map.set(h, []);
    for (const t of tasks) {
      if (!t.scheduledStart) continue;
      const hourPrefix = `${t.scheduledStart.slice(0, 2)}:00`;
      const bucket = map.get(hourPrefix);
      if (bucket) {
        bucket.push(t);
      } else {
        map.set(hourPrefix, [t]);
      }
    }
    return map;
  }, [tasks]);

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
      {/* Unscheduled Queue */}
      <section className="lg:col-span-4">
        <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <div className="border-b border-slate-200 px-4 py-3.5 dark:border-slate-800">
            <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-white">
              Por programar
            </h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Asigna una hora del día a cada tarea pendiente.
            </p>
          </div>

          {unscheduledTasks.length === 0 ? (
            <div className="px-4 py-10 text-center">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Todas tus tareas pendientes tienen un bloque asignado.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-slate-200 dark:divide-slate-800">
              {unscheduledTasks.map((task) => (
                <li key={task.id} className="space-y-2 p-3.5">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium text-slate-900 dark:text-white">
                      {task.title}
                    </p>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-slate-500 tabular-nums dark:text-slate-400">
                      {task.category} · {task.durationMinutes} min
                    </span>
                    <select
                      value=""
                      aria-label={`Asignar hora a ${task.title}`}
                      onChange={(e) => {
                        if (e.target.value) {
                          onAssignSlot(task, e.target.value);
                        }
                      }}
                      className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 font-mono text-xs text-slate-700 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                    >
                      <option value="">Asignar hora...</option>
                      {HOURS.map((h) => (
                        <option key={h} value={h}>
                          {h}
                        </option>
                      ))}
                    </select>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* Hourly Day Schedule */}
      <section className="lg:col-span-8">
        <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3.5 dark:border-slate-800">
            <div>
              <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-white">
                Agenda por bloques horarios
              </h2>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                Haz clic en cualquier franja disponible para crear una tarea en ese horario.
              </p>
            </div>
            <span className="font-mono text-xs text-slate-500 tabular-nums dark:text-slate-400">
              06:00 – 23:00
            </span>
          </div>

          <div className="divide-y divide-slate-200 dark:divide-slate-800">
            {HOURS.map((hour) => {
              const slotTasks = tasksByHour.get(hour) || [];
              const isCurrentHour = hour === currentHourPrefix;

              return (
                <div
                  key={hour}
                  className={`flex min-h-[56px] items-stretch ${
                    isCurrentHour ? 'bg-blue-50/40 dark:bg-blue-950/20' : ''
                  }`}
                >
                  <div className="flex w-20 shrink-0 items-start justify-end border-r border-slate-200 px-3 py-3 dark:border-slate-800">
                    <span
                      className={`font-mono text-xs tabular-nums ${
                        isCurrentHour
                          ? 'font-semibold text-blue-600 dark:text-blue-400'
                          : 'text-slate-500 dark:text-slate-400'
                      }`}
                    >
                      {hour}
                    </span>
                  </div>

                  <div className="flex flex-1 flex-col gap-2 p-2">
                    {slotTasks.length === 0 ? (
                      <button
                        type="button"
                        onClick={() => onCreateAtHour(hour)}
                        className="group flex h-full w-full items-center gap-1.5 rounded-lg px-2.5 py-2 text-left text-xs text-transparent transition-colors hover:bg-slate-50 hover:text-slate-500 dark:hover:bg-slate-800/50 dark:hover:text-slate-400"
                      >
                        <Plus className="h-3.5 w-3.5 opacity-0 group-hover:opacity-100" />
                        <span>Programar bloque a las {hour}</span>
                      </button>
                    ) : (
                      slotTasks.map((task) => (
                        <div
                          key={task.id}
                          className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-2 ${
                            task.completed
                              ? 'border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-950/60'
                              : 'border-blue-200 bg-blue-50/60 dark:border-blue-900/70 dark:bg-blue-950/30'
                          }`}
                        >
                          <div className="flex min-w-0 items-center gap-2.5">
                            <button
                              type="button"
                              onClick={() => onToggleComplete(task.id)}
                              aria-label={`Completar ${task.title}`}
                              className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                                task.completed
                                  ? 'border-emerald-600 bg-emerald-600 text-white'
                                  : 'border-slate-400 bg-white dark:border-slate-600 dark:bg-slate-900'
                              }`}
                            >
                              {task.completed && <Check className="h-3 w-3 stroke-[2.5]" />}
                            </button>

                            <button
                              type="button"
                              onClick={() => onEditTask(task)}
                              className="min-w-0 text-left"
                            >
                              <p
                                className={`truncate text-sm font-medium ${
                                  task.completed
                                    ? 'text-slate-400 line-through dark:text-slate-500'
                                    : 'text-slate-900 dark:text-white'
                                }`}
                              >
                                {task.title}
                              </p>
                              <p className="text-xs text-slate-500 tabular-nums dark:text-slate-400">
                                {task.scheduledStart} · {task.durationMinutes} min · {task.category}
                                {task.reminderAt && !task.reminderSent ? ' · Con aviso push' : ''}
                              </p>
                            </button>
                          </div>

                          <div className="flex shrink-0 items-center gap-1">
                            {task.reminderAt && !task.reminderSent && (
                              <Bell className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                            )}
                            <button
                              type="button"
                              onClick={() => onAssignSlot(task, null)}
                              title="Quitar del horario"
                              aria-label={`Quitar ${task.title} del horario`}
                              className="rounded p-1 text-slate-400 hover:bg-white hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>
    </div>
  );
};
