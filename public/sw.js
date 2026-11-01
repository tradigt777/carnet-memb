/* Carnet MEMB : réception des notifications */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('push', e => {
  let d = {}; try { d = e.data.json(); } catch (x) { d = { title: 'Carnet MEMB', body: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.title || 'Carnet MEMB', { body: d.body || '', tag: d.tag || undefined, icon: '/_blob/af49164d46b16aee8edf4b726d5397f5', badge: '/_blob/af49164d46b16aee8edf4b726d5397f5', data: { url: d.url || '/app' } }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || '/app';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(ws => { for (const w of ws) { if (w.url.includes('/app') && 'focus' in w) return w.focus(); } return self.clients.openWindow(url); }));
});
