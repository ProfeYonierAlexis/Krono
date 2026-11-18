/* Service Worker Push & Notification Handler for Krono */

self.addEventListener('push', (event) => {
  if (!event.data) return;

  let payload = {
    title: 'Recordatorio de Krono',
    body: 'Tienes una tarea programada.',
    taskId: '',
    workspaceId: '',
    url: '/',
  };

  try {
    const parsed = event.data.json();
    payload = { ...payload, ...parsed };
  } catch {
    payload.body = event.data.text();
  }

  const options = {
    body: payload.body,
    icon: '/pwa-192x192.png',
    badge: '/pwa-192x192.png',
    tag: payload.taskId ? `krono-task-${payload.taskId}` : `krono-push-${Date.now()}`,
    renotify: true,
    requireInteraction: true,
    data: {
      url: payload.url || '/',
      taskId: payload.taskId || '',
      workspaceId: payload.workspaceId || '',
    },
    actions: payload.taskId
      ? [
          { action: 'complete', title: 'Completar' },
          { action: 'snooze', title: 'Posponer 10 min' },
        ]
      : [],
  };

  event.waitUntil(self.registration.showNotification(payload.title, options));
});

self.addEventListener('notificationclick', (event) => {
  const notification = event.notification;
  const action = event.action;
  const data = notification.data || {};
  notification.close();

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          client.focus();
          client.postMessage({
            type: 'KRONO_NOTIFICATION_ACTION',
            action: action || 'open',
            taskId: data.taskId,
            workspaceId: data.workspaceId,
          });
          return;
        }
      }
      if (self.clients.openWindow) {
        const targetUrl = data.workspaceId ? `/?ws=${encodeURIComponent(data.workspaceId)}` : '/';
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});
