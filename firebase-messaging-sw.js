/* ==========================================================================
   firebase-messaging-sw.js
   Must be served from the SITE ROOT (same folder as index/dashboard pages)
   over HTTPS in production, so its default scope ("/") covers every page.
   Do not move this file into assets/ - Firebase's default registration
   scope would then only cover assets/, not the whole site.

   This handles push delivery while the portal is in the background, in
   another tab, or the browser is closed but the OS keeps the worker alive.
   Foreground messages (portal open and focused) are instead handled by
   assets/js/push-notifications.js via onMessage(), so we don't show two
   notifications for the same event.
   ========================================================================== */

importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js");

// Reuses the same public web config as the page - no secrets here either.
importScripts("assets/js/firebase-config.js");

firebase.initializeApp(FIREBASE_CONFIG);
const messaging = firebase.messaging();

messaging.onBackgroundMessage(function (payload) {
  const data = (payload && payload.data) || {};
  const title = (payload.notification && payload.notification.title) || data.notificationType || "Profenaa Technologies";
  const body = (payload.notification && payload.notification.body) || "";

  const options = {
    body: body,
    icon: "assets/img/icon-192.png",
    badge: "assets/img/icon-192.png",
    data: {
      url: data.url || "student-dashboard.html#sec-notifications"
    }
  };

  self.registration.showNotification(title, options);
});

// Clicking the OS/browser notification focuses an already-open portal tab if
// one exists, otherwise opens a new one - then navigates to the correct
// dashboard section (existing client-side section navigation, no new pages).
self.addEventListener("notificationclick", function (event) {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || "student-dashboard.html";

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (windowClients) {
      for (const client of windowClients) {
        if ("focus" in client) {
          client.postMessage({ type: "PUSH_NOTIFICATION_CLICK", url: targetUrl });
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
