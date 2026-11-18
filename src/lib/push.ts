function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export type NotificationPermissionState = 'default' | 'granted' | 'denied' | 'unsupported';

export function getNotificationPermission(): NotificationPermissionState {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  return Notification.permission;
}

export function isPushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

export async function getActivePushSubscription(): Promise<PushSubscription | null> {
  if (!isPushSupported()) return null;
  try {
    const registration = await navigator.serviceWorker.ready;
    return await registration.pushManager.getSubscription();
  } catch {
    return null;
  }
}

export async function subscribeToWebPush(
  workspaceId: string,
  deviceId: string
): Promise<{ ok: boolean; permission: NotificationPermissionState; subscribed: boolean; message?: string }> {
  if (!('Notification' in window)) {
    return {
      ok: false,
      permission: 'unsupported',
      subscribed: false,
      message: 'Este navegador no soporta notificaciones.',
    };
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    return {
      ok: false,
      permission,
      subscribed: false,
      message:
        permission === 'denied'
          ? 'Permiso de notificaciones bloqueado en la configuración del navegador.'
          : 'No se otorgó permiso para notificaciones.',
    };
  }

  if (!isPushSupported()) {
    return {
      ok: true,
      permission,
      subscribed: false,
      message: 'Notificaciones locales activadas (PushManager no disponible en este contexto).',
    };
  }

  try {
    const keyRes = await fetch('/api/push/vapid-public-key');
    if (!keyRes.ok) {
      throw new Error('No se pudo obtener la clave VAPID');
    }
    const { publicKey } = (await keyRes.json()) as { publicKey: string };

    const registration = await navigator.serviceWorker.ready;
    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey) as unknown as BufferSource,
      });
    }

    const subRes = await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workspaceId,
        deviceId,
        subscription: subscription.toJSON(),
      }),
    });

    if (!subRes.ok) {
      throw new Error('Error registrando la suscripción en el servidor');
    }

    return {
      ok: true,
      permission: 'granted',
      subscribed: true,
    };
  } catch (err) {
    return {
      ok: true,
      permission: 'granted',
      subscribed: false,
      message:
        err instanceof Error
          ? `Notificaciones locales listas (${err.message}).`
          : 'Notificaciones locales activadas.',
    };
  }
}

export async function unsubscribeFromWebPush(
  workspaceId: string,
  deviceId: string
): Promise<void> {
  try {
    const sub = await getActivePushSubscription();
    if (sub) {
      await sub.unsubscribe();
    }
    await fetch('/api/push/unsubscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspaceId, deviceId }),
    });
  } catch {
    // Ignore offline errors
  }
}

export async function sendServerTestPush(
  workspaceId: string
): Promise<{ ok: boolean; delivered: number }> {
  const res = await fetch('/api/push/test', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      workspaceId,
      title: 'Recordatorio de prueba · Krono',
      body: 'Las notificaciones push y la sincronización entre dispositivos funcionan correctamente.',
    }),
  });
  if (!res.ok) {
    throw new Error('No se pudo enviar el recordatorio de prueba');
  }
  return (await res.json()) as { ok: boolean; delivered: number };
}

export async function showNativeNotification(
  title: string,
  body: string,
  taskId?: string,
  workspaceId?: string
): Promise<void> {
  if (typeof window === 'undefined' || !('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;

  const tag = taskId ? `krono-task-${taskId}` : `krono-local-${Date.now()}`;

  if ('serviceWorker' in navigator) {
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg) {
        await reg.showNotification(title, {
          body,
          icon: '/pwa-192x192.png',
          badge: '/pwa-192x192.png',
          tag,
          data: { taskId: taskId || '', workspaceId: workspaceId || '', url: '/' },
        });
        return;
      }
    } catch {
      // Fallback to Notification constructor
    }
  }

  try {
    new Notification(title, {
      body,
      icon: '/pwa-192x192.png',
      tag,
    });
  } catch {
    // Ignore if browser blocks Notification constructor
  }
}

export function playReminderChime(): void {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;

    const notes = [587.33, 880]; // D5 -> A5
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.14);
      gain.gain.setValueAtTime(0.001, now + idx * 0.14);
      gain.gain.exponentialRampToValueAtTime(0.12, now + idx * 0.14 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.14 + 0.36);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + idx * 0.14);
      osc.stop(now + idx * 0.14 + 0.38);
    });
  } catch {
    // Audio playback may be blocked prior to gesture
  }
}
