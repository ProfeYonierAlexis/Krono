import React, { useMemo, useState } from 'react';
import {
  Bell,
  Check,
  Clock,
  Pencil,
  Play,
  Plus,
  Search,
  Trash2,
} from 'lucide-react';
import { getTodayDateString } from '../lib/storage';
import type { TaskCategory, TaskItem, TaskPriority } from '../types';

type TaskFilter = 'all' | 'pending' | 'reminders' | 'completed';

interface DayTasksViewProps {
  tasks: TaskItem[];
  onCreateQuickTask: (task: TaskItem) => void;
  onToggleComplete: (taskId: string) => void;
  onEditTask: (task: TaskItem) => void;
  onDeleteTask: (taskId: string) => void;
  onStartFocusTask: (taskId: string) => void;
  onOpenNewModal: () => void;
  onLoadSampleDay: () => void;
}

function formatReminderTime(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString('es-ES', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatMinutesTotal(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} h`;
  return `${h} h ${m} m`;
}

export const DayTasksView: React.FC<DayTasksViewProps> = ({
  tasks,
  onCreateQuickTask,
  onToggleComplete,
  onEditTask,
  onDeleteTask,
  onStartFocusTask,
  onOpenNewModal,
  onLoadSampleDay,
}) => {
  const [quickTitle, setQuickTitle] = useState('');
  const [quickCategory, setQuickCategory] = useState<TaskCategory>('Trabajo');
  const [quickDuration, setQuickDuration] = useState<number>(30);
  const [quickPriority, setQuickPriority] = useState<TaskPriority>('media');
  const [filter, setFilter] = useState<TaskFilter>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('Todas');
  const [searchQuery, setSearchQuery] = useState('');

  const metrics = useMemo(() => {
    const pending = tasks.filter((t) => !t.completed);
    const completed = tasks.filter((t) => t.completed);
    const totalPendingMinutes = pending.reduce((acc, t) => acc + t.durationMinutes, 0);
    const activeReminders = pending.filter((t) => Boolean(t.reminderAt) && !t.reminderSent).length;
    return {
      pendingCount: pending.length,
      completedCount: completed.length,
      plannedMinutes: totalPendingMinutes,
      activeReminders,
    };
  }, [tasks]);

  const filteredTasks = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return tasks
      .filter((t) => {
        if (filter === 'pending' && t.completed) return false;
        if (filter === 'completed' && !t.completed) return false;
        if (filter === 'reminders' && (!t.reminderAt || t.completed)) return false;
        if (categoryFilter !== 'Todas' && t.category !== categoryFilter) return false;
        if (q) {
          const inTitle = t.title.toLowerCase().includes(q);
          const inNotes = t.notes.toLowerCase().includes(q);
          if (!inTitle && !inNotes) return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (a.completed !== b.completed) return a.completed ? 1 : -1;
        const pOrder: Record<TaskPriority, number> = { alta: 0, media: 1, baja: 2 };
        if (pOrder[a.priority] !== pOrder[b.priority]) {
          return pOrder[a.priority] - pOrder[b.priority];
        }
        return b.createdAt - a.createdAt;
      });
  }, [tasks, filter, categoryFilter, searchQuery]);

  const handleQuickAdd = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = quickTitle.trim();
    if (!trimmed) return;
    const now = Date.now();
    onCreateQuickTask({
      id: `task-${crypto.randomUUID().slice(0, 8)}`,
      title: trimmed,
      notes: '',
      completed: false,
      priority: quickPriority,
      category: quickCategory,
      durationMinutes: quickDuration,
      focusMinutesLogged: 0,
      dueDate: getTodayDateString(),
      scheduledStart: null,
      reminderAt: null,
      reminderSent: false,
      createdAt: now,
      updatedAt: now,
    });
    setQuickTitle('');
  };

  return (
    <div className="space-y-6">
      {/* 4-Column Flat KPI Strip */}
      <div className="grid grid-cols-2 divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white sm:grid-cols-4 sm:divide-x sm:divide-y-0 dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
        <div className="p-4">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Tareas pendientes
          </p>
          <p className="mt-1 font-display text-2xl font-semibold text-slate-900 tabular-nums dark:text-white">
            {metrics.pendingCount}
          </p>
        </div>
        <div className="p-4">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Completadas
          </p>
          <p className="mt-1 font-display text-2xl font-semibold text-emerald-600 tabular-nums dark:text-emerald-400">
            {metrics.completedCount}
          </p>
        </div>
        <div className="p-4">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Tiempo planificado
          </p>
          <p className="mt-1 font-display text-2xl font-semibold text-slate-900 tabular-nums dark:text-white">
            {formatMinutesTotal(metrics.plannedMinutes)}
          </p>
        </div>
        <div className="p-4">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Recordatorios activos
          </p>
          <p className="mt-1 font-display text-2xl font-semibold text-amber-600 tabular-nums dark:text-amber-400">
            {metrics.activeReminders}
          </p>
        </div>
      </div>

      {/* Quick Add Form */}
      <form
        onSubmit={handleQuickAdd}
        className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-center dark:border-slate-800 dark:bg-slate-900"
      >
        <input
          type="text"
          value={quickTitle}
          onChange={(e) => setQuickTitle(e.target.value)}
          placeholder="Añadir tarea rápida para hoy..."
          aria-label="Título de tarea rápida"
          className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:focus:bg-slate-950"
        />

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={quickCategory}
            onChange={(e) => setQuickCategory(e.target.value as TaskCategory)}
            aria-label="Categoría"
            className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs font-medium text-slate-700 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
          >
            <option value="Trabajo">Trabajo</option>
            <option value="Personal">Personal</option>
            <option value="Estudio">Estudio</option>
            <option value="Salud">Salud</option>
          </select>

          <select
            value={quickPriority}
            onChange={(e) => setQuickPriority(e.target.value as TaskPriority)}
            aria-label="Prioridad"
            className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs font-medium text-slate-700 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
          >
            <option value="alta">Prioridad alta</option>
            <option value="media">Prioridad media</option>
            <option value="baja">Prioridad baja</option>
          </select>

          <select
            value={quickDuration}
            onChange={(e) => setQuickDuration(Number(e.target.value))}
            aria-label="Duración"
            className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs font-medium text-slate-700 tabular-nums focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
          >
            <option value={15}>15 min</option>
            <option value={25}>25 min</option>
            <option value={30}>30 min</option>
            <option value={45}>45 min</option>
            <option value={60}>60 min</option>
            <option value={90}>90 min</option>
          </select>

          <button
            type="submit"
            className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-blue-700 whitespace-nowrap shrink-0"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Añadir</span>
          </button>
        </div>
      </form>

      {/* Filters & Search Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-1 rounded-lg bg-slate-200/70 p-1 dark:bg-slate-800/80">
          {(
            [
              { id: 'all', label: 'Todas' },
              { id: 'pending', label: 'Pendientes' },
              { id: 'reminders', label: 'Con recordatorio' },
              { id: 'completed', label: 'Completadas' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setFilter(tab.id)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                filter === tab.id
                  ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-900 dark:text-white'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            aria-label="Filtrar por categoría"
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 focus:border-blue-600 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200"
          >
            <option value="Todas">Todas las categorías</option>
            <option value="Trabajo">Trabajo</option>
            <option value="Personal">Personal</option>
            <option value="Estudio">Estudio</option>
            <option value="Salud">Salud</option>
          </select>

          <div className="relative flex-1 sm:w-56">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar tareas..."
              aria-label="Buscar tareas"
              className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-8 pr-3 text-xs text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-white"
            />
          </div>
        </div>
      </div>

      {/* Task List */}
      <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        {filteredTasks.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <p className="font-display text-base font-semibold text-slate-900 dark:text-white">
              {tasks.length === 0
                ? 'Tu espacio de trabajo está listo'
                : 'No hay tareas que coincidan con este filtro'}
            </p>
            <p className="mx-auto mt-1.5 max-w-md text-sm text-slate-500 dark:text-slate-400">
              {tasks.length === 0
                ? 'Crea tu primera tarea con horario y recordatorio push, o carga una agenda de ejemplo para probar la sincronización.'
                : 'Prueba cambiar el filtro activo o crea una nueva tarea.'}
            </p>
            <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
              <button
                type="button"
                onClick={onOpenNewModal}
                className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-medium text-white hover:bg-blue-700 whitespace-nowrap"
              >
                Nueva tarea con recordatorio
              </button>
              {tasks.length === 0 && (
                <button
                  type="button"
                  onClick={onLoadSampleDay}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  Cargar agenda de ejemplo
                </button>
              )}
            </div>
          </div>
        ) : (
          <ul className="divide-y divide-slate-200 dark:divide-slate-800">
            {filteredTasks.map((task) => {
              const reminderLabel = formatReminderTime(task.reminderAt);
              const priorityText =
                task.priority === 'alta'
                  ? 'Prioridad alta'
                  : task.priority === 'media'
                  ? 'Prioridad media'
                  : 'Prioridad baja';
              const priorityColor =
                task.priority === 'alta'
                  ? 'text-red-600 dark:text-red-400'
                  : task.priority === 'media'
                  ? 'text-amber-600 dark:text-amber-400'
                  : 'text-slate-500 dark:text-slate-400';

              return (
                <li
                  key={task.id}
                  className="flex flex-col gap-3 px-4 py-3.5 transition-colors hover:bg-slate-50/70 sm:flex-row sm:items-center sm:justify-between dark:hover:bg-slate-800/40"
                >
                  <div className="flex min-w-0 items-start gap-3">
                    <button
                      type="button"
                      onClick={() => onToggleComplete(task.id)}
                      aria-label={
                        task.completed
                          ? `Marcar ${task.title} como pendiente`
                          : `Completar ${task.title}`
                      }
                      className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors ${
                        task.completed
                          ? 'border-emerald-600 bg-emerald-600 text-white'
                          : 'border-slate-300 bg-white hover:border-blue-600 dark:border-slate-600 dark:bg-slate-950'
                      }`}
                    >
                      {task.completed && <Check className="h-3.5 w-3.5 stroke-[2.5]" />}
                    </button>

                    <div className="min-w-0">
                      <p
                        className={`text-sm font-medium ${
                          task.completed
                            ? 'text-slate-400 line-through dark:text-slate-500'
                            : 'text-slate-900 dark:text-white'
                        }`}
                      >
                        {task.title}
                      </p>

                      {task.notes && (
                        <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">
                          {task.notes}
                        </p>
                      )}

                      {/* Unboxed clean metadata with typographic separators */}
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                        <span>{task.category}</span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums">{task.durationMinutes} min</span>
                        <span aria-hidden="true">·</span>
                        <span className={priorityColor}>{priorityText}</span>
                        {task.scheduledStart && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="inline-flex items-center gap-1 font-mono tabular-nums text-slate-700 dark:text-slate-300">
                              <Clock className="h-3 w-3" />
                              {task.scheduledStart}
                            </span>
                          </>
                        )}
                        {reminderLabel && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span
                              className={`inline-flex items-center gap-1 font-mono tabular-nums ${
                                task.reminderSent
                                  ? 'text-slate-400 dark:text-slate-500'
                                  : 'text-blue-600 dark:text-blue-400'
                              }`}
                            >
                              <Bell className="h-3 w-3" />
                              {task.reminderSent
                                ? `Enviado (${reminderLabel})`
                                : `Aviso ${reminderLabel}`}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-1 self-end sm:self-center">
                    {!task.completed && (
                      <button
                        type="button"
                        onClick={() => onStartFocusTask(task.id)}
                        title="Iniciar temporizador de enfoque"
                        className="flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium text-blue-600 transition-colors hover:bg-blue-50 whitespace-nowrap dark:text-blue-400 dark:hover:bg-blue-950/60"
                      >
                        <Play className="h-3.5 w-3.5" />
                        <span>Enfocar</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => onEditTask(task)}
                      aria-label={`Editar ${task.title}`}
                      className="rounded-md p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteTask(task.id)}
                      aria-label={`Eliminar ${task.title}`}
                      className="rounded-md p-2 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40 dark:hover:text-red-400"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
};
