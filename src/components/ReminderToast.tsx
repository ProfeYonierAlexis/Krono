import React from 'react';
import { BellRing, Check, Clock, X } from 'lucide-react';
import type { ReminderEvent } from '../types';

interface ReminderToastProps {
  reminders: ReminderEvent[];
  onCompleteTask: (taskId: string) => void;
  onSnoozeTask: (taskId: string, minutes: number) => void;
  onDismiss: (reminderId: string) => void;
}

export const ReminderToast: React.FC<ReminderToastProps> = ({
  reminders,
  onCompleteTask,
  onSnoozeTask,
  onDismiss,
}) => {
  if (reminders.length === 0) return null;

  return (
    <div
      className="fixed bottom-4 right-4 z-50 flex w-full max-w-sm flex-col gap-2.5 px-4 sm:px-0"
      aria-live="polite"
    >
      {reminders.map((rem) => (
        <div
          key={rem.id}
          className="rounded-xl border border-amber-300 bg-white p-4 shadow-lg dark:border-amber-700/70 dark:bg-slate-900"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-2.5">
              <BellRing className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
              <div>
                <p className="text-xs font-medium text-amber-700 dark:text-amber-400">
                  Recordatorio · {rem.category}
                </p>
                <p className="mt-0.5 text-sm font-semibold text-slate-900 dark:text-white">
                  {rem.title}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onDismiss(rem.id)}
              aria-label="Cerrar recordatorio"
              className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {rem.taskId && (
            <div className="mt-3 flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  onCompleteTask(rem.taskId);
                  onDismiss(rem.id);
                }}
                className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-emerald-700 whitespace-nowrap"
              >
                <Check className="h-3.5 w-3.5" />
                <span>Completar</span>
              </button>
              <button
                type="button"
                onClick={() => onSnoozeTask(rem.taskId, 10)}
                className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 whitespace-nowrap dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                <Clock className="h-3.5 w-3.5" />
                <span>Posponer 10 min</span>
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
};
