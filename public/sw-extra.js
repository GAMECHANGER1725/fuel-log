// Extra service worker code (pulled in by vite.config.ts): tapping a reminder opens the app on the right page.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const path = (event.notification.data && event.notification.data.path) || 'today';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      if (!wins[0]) return self.clients.openWindow(self.registration.scope + '#/' + path);
      if ('navigate' in wins[0]) wins[0].navigate(self.registration.scope + '#/' + path).catch(() => {});
      return wins[0].focus();
    }),
  );
});
