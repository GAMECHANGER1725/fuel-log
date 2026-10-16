// Extra service worker code (pulled in by vite.config.ts): tapping a reminder opens the app.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => (wins[0] ? wins[0].focus() : self.clients.openWindow(self.registration.scope + '#/today'))),
  );
});
