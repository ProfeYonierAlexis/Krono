import React, { useEffect, useState } from 'react';
import { Bell, Clock, X } from 'lucide-react';
import { getTodayDateString } from '../lib/storage';
import type { TaskCategory, TaskItem, TaskPriority } from '../types';

interface TaskModalProps {
  isOpen: boolean;
  initialTask?: TaskItem | null;
  defaultScheduledStart?: string | null;
  onClose: () => void;
  onSave: (task: TaskItem) => void;
}

const CATEGORIES: TaskCategory[] = ['Trabajo', 'Personal', 'Estudio', 'Salud'];
const PRIORITIES: { value: TaskPriority; label: string }[] = [
  { value: 'alta', label: 'Alta' },
  { value: 'media', label: 'Media' },
  { value: 'baja', label: 'Baja' },
];
const DURATIONS = [15, 25, 30, 45, 60, 90, 120];

function toLocalDateTimeInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

function formatOffsetInput(minutesFromNow: number): string {
  const target = new Date(Date.now() + minutesFromNow * 60 * 1000);
  return toLocalDateTimeInput(target.toISOString());
}

export const TaskModal: React.FC<TaskModalProps> = ({
  isOpen,
  initialTask,
  defaultScheduledStart,
  onClose,
  onSave,
}) => {
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [priority, setPriority] = useState<TaskPriority>('media');
  const [category, setCategory] = useState<TaskCategory>('Trabajo');
  const [durationMinutes, setDurationMinutes] = useState<number>(30);
  const [dueDate, setDueDate] = useState<string>(getTodayDateString());
  const [scheduledStart, setScheduledStart] = useState<string>('');
  const [reminderLocal, setReminderLocal] = useState<string>('');

  useEffect(() => {
    if (!isOpen) return;
    if (initialTask) {
      setTitle(initialTask.title);
      setNotes(initialTask.notes || '');
      setPriority(initialTask.priority);
      setCategory(initialTask.category);
      setDurationMinutes(initialTask.durationMinutes);
      setDueDate(initialTask.dueDate || getTodayDateString());
      setScheduledStart(initialTask.scheduledStart || '');
      setReminderLocal(toLocalDateTimeInput(initialTask.reminderAt));
    } else {
      setTitle('');
      setNotes('');
      setPriority('media');
      setCategory('Trabajo');
      setDurationMinutes(30);
      setDueDate(getTodayDateString());
      setScheduledStart(defaultScheduledStart || '');
      setReminderLocal('');
    }
  }, [isOpen, initialTask, defaultScheduledStart]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) return;

    const now = Date.now();
    const reminderIso = reminderLocal ? new Date(reminderLocal).toISOString() : null;

    const task: TaskItem = initialTask
      ? {
          ...initialTask,
          title: trimmed,
          notes: notes.trim(),
          priority,
          category,
          durationMinutes,
          dueDate: dueDate || null,
          scheduledStart: scheduledStart || null,
          reminderAt: reminderIso,
          reminderSent:
            reminderIso !== initialTask.reminderAt ? false : initialTask.reminderSent,
          updatedAt: now,
        }
      : {
          id: `task-${crypto.randomUUID().slice(0, 8)}`,
          title: trimmed,
          notes: notes.trim(),
          completed: false,
          priority,
          category,
          durationMinutes,
          focusMinutesLogged: 0,
          dueDate: dueDate || null,
          scheduledStart: scheduledStart || null,
          reminderAt: reminderIso,
          reminderSent: false,
          createdAt: now,
          updatedAt: now,
        };

    onSave(task);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="task-modal-title"
    >
      <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between border-b border-slate-200 pb-4 dark:border-slate-800">
          <h2
            id="task-modal-title"
            className="font-display text-lg font-semibold text-slate-900 dark:text-white"
          >
            {initialTask ? 'Editar tarea' : 'Nueva tarea'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar diálogo"
            className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div>
            <label
              htmlFor="task-title"
              className="block text-xs font-medium text-slate-700 dark:text-slate-300"
            >
              Título de la tarea
            </label>
            <input
              id="task-title"
              type="text"
              required
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ej. Preparar presentación semanal del equipo"
              className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-white"
            />
          </div>

          <div>
            <label
              htmlFor="task-notes"
              className="block text-xs font-medium text-slate-700 dark:text-slate-300"
            >
              Notas o subtareas
            </label>
            <textarea
              id="task-notes"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Detalles opcionales o pasos a seguir..."
              className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-white"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label
                htmlFor="task-category"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300"
              >
                Categoría
              </label>
              <select
                id="task-category"
                value={category}
                onChange={(e) => setCategory(e.target.value as TaskCategory)}
                className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-white"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="task-priority"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300"
              >
                Prioridad
              </label>
              <select
                id="task-priority"
                value={priority}
                onChange={(e) => setPriority(e.target.value as TaskPriority)}
                className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-white"
              >
                {PRIORITIES.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="task-duration"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300"
              >
                Duración estimada
              </label>
              <select
                id="task-duration"
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(Number(e.target.value))}
                className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 tabular-nums focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-white"
              >
                {DURATIONS.map((m) => (
                  <option key={m} value={m}>
                    {m} min
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label
                htmlFor="task-date"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300"
              >
                Fecha objetivo
              </label>
              <input
                id="task-date"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm text-slate-900 tabular-nums focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-white"
              />
            </div>

            <div>
              <label
                htmlFor="task-slot"
                className="flex items-center gap-1.5 text-xs font-medium text-slate-700 dark:text-slate-300"
              >
                <Clock className="h-3.5 w-3.5 text-slate-400" />
                <span>Hora en bloque de tiempo</span>
              </label>
              <input
                id="task-slot"
                type="time"
                value={scheduledStart}
                onChange={(e) => setScheduledStart(e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm text-slate-900 tabular-nums focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-white"
              />
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3.5 dark:border-slate-800 dark:bg-slate-950/60">
            <div className="flex items-center justify-between gap-2">
              <label
                htmlFor="task-reminder"
                className="flex items-center gap-1.5 text-xs font-medium text-slate-700 dark:text-slate-300"
              >
                <Bell className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                <span>Recordatorio push programado</span>
              </label>
              {reminderLocal && (
                <button
                  type="button"
                  onClick={() => setReminderLocal('')}
                  className="text-xs font-medium text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                >
                  Quitar
                </button>
              )}
            </div>

            <input
              id="task-reminder"
              type="datetime-local"
              value={reminderLocal}
              onChange={(e) => setReminderLocal(e.target.value)}
              className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm text-slate-900 tabular-nums focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-white"
            />

            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {[
                { label: 'En 1 min', mins: 1 },
                { label: 'En 15 min', mins: 15 },
                { label: 'En 1 hora', mins: 60 },
              ].map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => setReminderLocal(formatOffsetInput(preset.mins))}
                  className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 transition-colors hover:border-blue-500 hover:text-blue-700 whitespace-nowrap dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-blue-500 dark:hover:text-blue-300"
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 border-t border-slate-200 pt-4 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 whitespace-nowrap dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 whitespace-nowrap"
            >
              {initialTask ? 'Guardar cambios' : 'Crear tarea'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
