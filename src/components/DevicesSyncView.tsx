import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import {
  Bell,
  Check,
  Copy,
  Laptop,
  Send,
  Smartphone,
  Tablet,
} from 'lucide-react';
import type { SyncConnectionStatus } from '../hooks/useWorkspaceSync';
import {
  getActivePushSubscription,
  getNotificationPermission,
  sendServerTestPush,
  subscribeToWebPush,
  unsubscribeFromWebPush,
} from '../lib/push';
import type { DeviceIdentity } from '../lib/storage';
import type { ConnectedDevice } from '../types';

interface DevicesSyncViewProps {
  workspaceId: string;
  currentDevice: DeviceIdentity;
  devices: ConnectedDevice[];
  connectionStatus: SyncConnectionStatus;
  onSwitchWorkspace: (nextId: string) => void;
  onRenameDevice: (name: string) => void;
  onNotifyPushStatus: (enabled: boolean) => void;
}

export const DevicesSyncView: React.FC<DevicesSyncViewProps> = ({
  workspaceId,
  currentDevice,
  devices,
  connectionStatus,
  onSwitchWorkspace,
  onRenameDevice,
  onNotifyPushStatus,
}) => {
  const [joinCode, setJoinCode] = useState('');
  const [deviceNameInput, setDeviceNameInput] = useState(currentDevice.name);
  const [copied, setCopied] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [permission, setPermission] = useState(getNotificationPermission());
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [pushFeedback, setPushFeedback] = useState<string | null>(null);
  const [sendingTest, setSendingTest] = useState(false);

  const shareUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/?ws=${encodeURIComponent(workspaceId)}`
      : '';

  useEffect(() => {
    setDeviceNameInput(currentDevice.name);
  }, [currentDevice.name]);

  useEffect(() => {
    if (!shareUrl) return;
    QRCode.toDataURL(shareUrl, {
      width: 180,
      margin: 1,
      color: { dark: '#0F172A', light: '#FFFFFF' },
    })
      .then((url) => setQrDataUrl(url))
      .catch(() => setQrDataUrl(''));
  }, [shareUrl]);

  useEffect(() => {
    setPermission(getNotificationPermission());
    void getActivePushSubscription().then((sub) => {
      setIsSubscribed(Boolean(sub));
    });
  }, [workspaceId]);

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setPushFeedback('Copia manualmente el enlace o el código de espacio.');
    }
  };

  const handleJoinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!joinCode.trim()) return;
    onSwitchWorkspace(joinCode.trim());
    setJoinCode('');
  };

  const handleEnablePush = async () => {
    setPushFeedback(null);
    const res = await subscribeToWebPush(workspaceId, currentDevice.deviceId);
    setPermission(res.permission);
    setIsSubscribed(res.subscribed);
    onNotifyPushStatus(res.permission === 'granted');
    if (res.message) {
      setPushFeedback(res.message);
    } else if (res.ok) {
      setPushFeedback('Recordatorios push activados correctamente en este dispositivo.');
    }
  };

  const handleDisablePush = async () => {
    await unsubscribeFromWebPush(workspaceId, currentDevice.deviceId);
    setIsSubscribed(false);
    onNotifyPushStatus(false);
    setPushFeedback('Suscripción push desactivada en este dispositivo.');
  };

  const handleSendTest = async () => {
    setSendingTest(true);
    setPushFeedback(null);
    try {
      const result = await sendServerTestPush(workspaceId);
      setPushFeedback(
        result.delivered > 0
          ? `Notificación enviada a ${result.delivered} dispositivo(s) suscrito(s).`
          : 'Recordatorio enviado en tiempo real a los dispositivos conectados.'
      );
    } catch {
      setPushFeedback('No se pudo contactar al servidor. Modo localStorage activo.');
    } finally {
      setSendingTest(false);
    }
  };

  const DeviceIcon = ({ type }: { type: ConnectedDevice['type'] }) => {
    if (type === 'mobile') return <Smartphone className="h-4 w-4 text-slate-500" />;
    if (type === 'tablet') return <Tablet className="h-4 w-4 text-slate-500" />;
    return <Laptop className="h-4 w-4 text-slate-500" />;
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Multi-device Sync Link & QR */}
        <section className="rounded-xl border border-slate-200 bg-white p-6 lg:col-span-7 dark:border-slate-800 dark:bg-slate-900">
          <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
            Sincronización entre múltiples dispositivos
          </h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Tus tareas se guardan localmente en <code className="font-mono text-xs">localStorage</code> y se sincronizan en tiempo real al abrir este código o enlace en otro teléfono, tablet o computadora.
          </p>

          <div className="mt-5 flex flex-col gap-5 sm:flex-row sm:items-center">
            {qrDataUrl && (
              <div className="shrink-0 self-start rounded-lg border border-slate-200 bg-white p-2">
                <img
                  src={qrDataUrl}
                  alt={`Código QR para sincronizar el espacio ${workspaceId}`}
                  referrerPolicy="no-referrer"
                  className="h-36 w-36"
                />
              </div>
            )}

            <div className="min-w-0 flex-1 space-y-3">
              <div>
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  Código del espacio actual
                </p>
                <p className="mt-1 font-mono text-2xl font-semibold tracking-wide text-slate-900 tabular-nums dark:text-white">
                  {workspaceId}
                </p>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Estado:{' '}
                  {connectionStatus === 'connected'
                    ? 'Conectado en tiempo real'
                    : connectionStatus === 'connecting'
                    ? 'Conectando...'
                    : 'Modo local (sin conexión al servidor)'}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => void handleCopyLink()}
                  className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-2 text-xs font-medium text-white transition-colors hover:bg-blue-700 whitespace-nowrap"
                >
                  {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  <span>{copied ? 'Enlace copiado' : 'Copiar enlace de sincronización'}</span>
                </button>
              </div>
            </div>
          </div>

          <form
            onSubmit={handleJoinSubmit}
            className="mt-6 flex flex-col gap-2 border-t border-slate-200 pt-5 sm:flex-row sm:items-center dark:border-slate-800"
          >
            <input
              type="text"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              placeholder="Ingresar código de otro dispositivo (ej. KRON-A1B2)"
              aria-label="Código de espacio para sincronizar"
              className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-slate-50 px-3.5 py-2 font-mono text-xs text-slate-900 placeholder:font-sans placeholder:text-slate-400 focus:border-blue-600 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-white"
            />
            <button
              type="submit"
              className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 whitespace-nowrap dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Conectar espacio
            </button>
          </form>
        </section>

        {/* Push Notifications Panel */}
        <section className="rounded-xl border border-slate-200 bg-white p-6 lg:col-span-5 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center gap-2">
            <Bell className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
              Recordatorios Push
            </h2>
          </div>

          <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">
            Recibe alertas puntuales aunque la pestaña esté en segundo plano.
          </p>

          <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3.5 text-xs dark:border-slate-800 dark:bg-slate-950/60">
            <div className="flex items-center justify-between">
              <span className="text-slate-500 dark:text-slate-400">Permiso del navegador</span>
              <span
                className={`font-medium ${
                  permission === 'granted'
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : permission === 'denied'
                    ? 'text-red-600 dark:text-red-400'
                    : 'text-amber-600 dark:text-amber-400'
                }`}
              >
                {permission === 'granted'
                  ? 'Concedido'
                  : permission === 'denied'
                  ? 'Bloqueado'
                  : permission === 'unsupported'
                  ? 'No compatible'
                  : 'Pendiente'}
              </span>
            </div>
            <div className="mt-2 flex items-center justify-between">
              <span className="text-slate-500 dark:text-slate-400">Suscripción Web Push</span>
              <span className="font-medium text-slate-900 dark:text-white">
                {isSubscribed ? 'Activa en este dispositivo' : 'Inactiva'}
              </span>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {!isSubscribed ? (
              <button
                type="button"
                onClick={() => void handleEnablePush()}
                className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-2 text-xs font-medium text-white transition-colors hover:bg-blue-700 whitespace-nowrap"
              >
                <Bell className="h-3.5 w-3.5" />
                <span>Activar notificaciones push</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void handleDisablePush()}
                className="rounded-lg border border-slate-300 px-3.5 py-2 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 whitespace-nowrap dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                Desactivar push
              </button>
            )}

            <button
              type="button"
              disabled={sendingTest}
              onClick={() => void handleSendTest()}
              className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-3.5 py-2 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <Send className="h-3.5 w-3.5" />
              <span>{sendingTest ? 'Enviando...' : 'Enviar prueba'}</span>
            </button>
          </div>

          {pushFeedback && (
            <p className="mt-3 text-xs text-slate-600 dark:text-slate-300">{pushFeedback}</p>
          )}
        </section>
      </div>

      {/* Connected Devices List */}
      <section className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-3 border-b border-slate-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between dark:border-slate-800">
          <div>
            <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-white">
              Dispositivos vinculados a {workspaceId}
            </h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Cambia el nombre de este dispositivo para identificarlo fácilmente.
            </p>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              onRenameDevice(deviceNameInput);
            }}
            className="flex items-center gap-2"
          >
            <input
              type="text"
              value={deviceNameInput}
              onChange={(e) => setDeviceNameInput(e.target.value)}
              aria-label="Nombre de este dispositivo"
              className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-900 focus:border-blue-600 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-white"
            />
            <button
              type="submit"
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Guardar nombre
            </button>
          </form>
        </div>

        <ul className="divide-y divide-slate-200 dark:divide-slate-800">
          {devices.map((dev) => {
            const isSelf = dev.deviceId === currentDevice.deviceId;
            return (
              <li
                key={dev.deviceId}
                className="flex items-center justify-between gap-4 px-5 py-3.5"
              >
                <div className="flex items-center gap-3">
                  <DeviceIcon type={dev.type} />
                  <div>
                    <p className="text-sm font-medium text-slate-900 dark:text-white">
                      {dev.name}
                      {isSelf ? ' (Este dispositivo)' : ''}
                    </p>
                    <p className="text-xs text-slate-500 tabular-nums dark:text-slate-400">
                      {dev.isOnline ? 'En línea ahora' : 'Desconectado'} ·{' '}
                      {dev.pushEnabled ? 'Push activo' : 'Solo alertas en app'}
                    </p>
                  </div>
                </div>
                <span className="font-mono text-xs text-slate-400 tabular-nums">
                  {dev.deviceId}
                </span>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
};
