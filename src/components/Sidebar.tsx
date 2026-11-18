import React from 'react';
import {
  Bell,
  CalendarClock,
  CheckSquare,
  Laptop,
  Moon,
  Sun,
  Timer,
  X,
} from 'lucide-react';
import type { SyncConnectionStatus } from '../hooks/useWorkspaceSync';

export type AppView = 'tasks' | 'timeline' | 'timer' | 'devices';

interface SidebarProps {
  activeView: AppView;
  onSelectView: (view: AppView) => void;
  workspaceId: string;
  onlineDevicesCount: number;
  connectionStatus: SyncConnectionStatus;
  pendingCount: number;
  timerRunning: boolean;
  displaySeconds: number;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

function formatCompactTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeView,
  onSelectView,
  workspaceId,
  onlineDevicesCount,
  connectionStatus,
  pendingCount,
  timerRunning,
  displaySeconds,
  theme,
  onToggleTheme,
  mobileOpen,
  onCloseMobile,
}) => {
  const navItems: {
    id: AppView;
    label: string;
    icon: React.ReactNode;
    trailing?: string;
  }[] = [
    {
      id: 'tasks',
      label: 'Mi Día',
      icon: <CheckSquare className="h-4 w-4 shrink-0" />,
      trailing: pendingCount > 0 ? String(pendingCount) : undefined,
    },
    {
      id: 'timeline',
      label: 'Bloques de Tiempo',
      icon: <CalendarClock className="h-4 w-4 shrink-0" />,
    },
    {
      id: 'timer',
      label: 'Temporizador',
      icon: <Timer className="h-4 w-4 shrink-0" />,
      trailing: timerRunning ? formatCompactTime(displaySeconds) : undefined,
    },
    {
      id: 'devices',
      label: 'Dispositivos y Push',
      icon: <Bell className="h-4 w-4 shrink-0" />,
      trailing: String(onlineDevicesCount),
    },
  ];

  const syncLabel =
    connectionStatus === 'connected'
      ? 'Sincronizado en tiempo real'
      : connectionStatus === 'connecting'
      ? 'Conectando...'
      : 'Guardado local activo';

  const content = (
    <aside className="flex h-full w-64 flex-col justify-between border-r border-slate-200 bg-white px-4 py-5 dark:border-slate-800 dark:bg-slate-900">
      <div>
        <div className="flex items-center justify-between px-2 pb-6">
          <span className="font-display text-xl font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0 dark:text-white">
            Krono
          </span>
          <button
            type="button"
            onClick={onCloseMobile}
            aria-label="Cerrar menú"
            className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900 lg:hidden dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <nav className="space-y-1" aria-label="Navegación principal">
          {navItems.map((item) => {
            const isActive = activeView === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  onSelectView(item.id);
                  onCloseMobile();
                }}
                className={`flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-sm font-medium transition-colors whitespace-nowrap ${
                  isActive
                    ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800/70 dark:hover:text-white'
                }`}
              >
                <span className="flex items-center gap-2.5">
                  {item.icon}
                  <span>{item.label}</span>
                </span>
                {item.trailing && (
                  <span
                    className={`font-mono text-xs tabular-nums ${
                      isActive
                        ? 'text-blue-700 dark:text-blue-300'
                        : 'text-slate-400 dark:text-slate-500'
                    }`}
                  >
                    {item.trailing}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      <div className="space-y-3 border-t border-slate-200 pt-4 dark:border-slate-800">
        <button
          type="button"
          onClick={() => {
            onSelectView('devices');
            onCloseMobile();
          }}
          className="w-full rounded-lg border border-slate-200 bg-slate-50 p-3 text-left transition-colors hover:border-slate-300 dark:border-slate-800 dark:bg-slate-950/60 dark:hover:border-slate-700"
        >
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span className="flex items-center gap-1.5">
              <Laptop className="h-3.5 w-3.5" />
              <span>Espacio</span>
            </span>
            <span className="font-mono font-semibold text-slate-900 tabular-nums dark:text-slate-100">
              {workspaceId}
            </span>
          </div>
          <p className="mt-1.5 text-xs text-slate-600 dark:text-slate-400">
            {syncLabel} · {onlineDevicesCount}{' '}
            {onlineDevicesCount === 1 ? 'dispositivo' : 'dispositivos'}
          </p>
        </button>

        <button
          type="button"
          onClick={onToggleTheme}
          className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
        >
          <span>{theme === 'dark' ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'}</span>
          {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>
      </div>
    </aside>
  );

  return (
    <>
      <div className="hidden lg:block lg:shrink-0">{content}</div>
      {mobileOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <div
            className="fixed inset-0 bg-slate-950/50"
            onClick={onCloseMobile}
            aria-hidden="true"
          />
          <div className="relative z-10 h-full">{content}</div>
        </div>
      )}
    </>
  );
};
