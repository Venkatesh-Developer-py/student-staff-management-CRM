/* ==========================================================================
   assets/js/push-notifications.js
   Shared by both student-dashboard.html and admin-dashboard.html.

   Extends the EXISTING in-app notification system with real OS/browser push
   delivery. It never replaces it: the DB notification list (Api.notifications
   / adminNotifList) stays the source of truth, this module only adds a
   delivery channel on top so the same events also show up as a native
   notification on laptop, Android, and (via "Add to Home Screen") iOS/iPad.

   Usage (called once from student-dashboard.js / admin-dashboard.js after
   Auth.requireStudent/requireAdmin has already run):

       PushNotifications.init({
         role: "STUDENT" | "ADMIN",
         registerUrl: "/api/student/push/register-token" | "/api/admin/push/register-token",
         unregisterUrl: "/api/student/push/unregister-token" | "/api/admin/push/unregister-token"
       });
   ========================================================================== */

const PushNotifications = (function () {
  const STORAGE_KEY = "pft_fcm_token";
  let firebaseApp = null;
  let messaging = null;
  let config = null;

  function isSupported() {
    return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  }

  function loadFirebaseSdk() {
    if (window.firebase && window.firebase.messaging) return Promise.resolve();
    const scripts = [
      "https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js",
      "https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js"
    ];
    return scripts.reduce((chain, src) => chain.then(() => new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = src;
      s.onload = resolve;
      s.onerror = () => reject(new Error("Could not load Firebase SDK: " + src));
      document.head.appendChild(s);
    })), Promise.resolve());
  }

  function updateButtonState(btn) {
    if (!btn) return;
    if (!isSupported()) {
      btn.textContent = "🔕 Notifications not supported on this browser";
      btn.disabled = true;
      return;
    }
    if (Notification.permission === "granted" && localStorage.getItem(STORAGE_KEY)) {
      btn.textContent = "🔔 Notifications Enabled";
      btn.disabled = true;
    } else if (Notification.permission === "denied") {
      btn.textContent = "🔕 Notifications Blocked — enable them in your browser's site settings";
      btn.disabled = true;
    } else {
      btn.textContent = "🔔 Enable Desktop & Mobile Notifications";
      btn.disabled = false;
    }
  }

  async function registerServiceWorker() {
    // Scope is the site root ("/") on purpose - see firebase-messaging-sw.js header.
    return navigator.serviceWorker.register("firebase-messaging-sw.js");
  }

  async function enable(opts) {
    if (!isSupported()) return;

    await loadFirebaseSdk();

    if (typeof FIREBASE_CONFIG === "undefined" || FIREBASE_CONFIG.apiKey === "REPLACE_ME") {
      showToast("Push notifications aren't configured yet on this deployment.", "error");
      return;
    }

    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      updateButtonState(document.getElementById("pushPermissionBtn"));
      return;
    }

    if (!firebaseApp) {
      firebaseApp = firebase.initializeApp(FIREBASE_CONFIG);
      messaging = firebase.messaging();
    }

    const registration = await registerServiceWorker();
    const token = await messaging.getToken({
      vapidKey: FIREBASE_VAPID_KEY,
      serviceWorkerRegistration: registration
    });

    if (!token) {
      showToast("Could not get a notification token. Please try again.", "error");
      return;
    }

    await apiRequest(opts.registerUrl, {
      method: "POST",
      auth: true,
      body: { fcmToken: token, deviceInfo: describeDevice() }
    });

    localStorage.setItem(STORAGE_KEY, token);
    updateButtonState(document.getElementById("pushPermissionBtn"));
    showToast("Notifications enabled on this device", "success");

    // Foreground messages (portal open + focused): the in-app notification
    // list is refreshed by the caller's own refresh function, so we only
    // show a lightweight toast here rather than a second OS notification -
    // avoids the "1 popup + 1 duplicate entry" problem called out in the spec.
    messaging.onMessage(function (payload) {
      const title = (payload.notification && payload.notification.title) || "New notification";
      showToast(title, "success");
      if (typeof opts.onForegroundMessage === "function") opts.onForegroundMessage(payload);
    });
  }

  function describeDevice() {
    const ua = navigator.userAgent || "";
    if (/Android/i.test(ua)) return "Android browser";
    if (/iPhone|iPad|iPod/i.test(ua)) return "iOS Home Screen";
    if (/Windows/i.test(ua)) return "Chrome on Windows";
    if (/Macintosh/i.test(ua)) return "Chrome on macOS";
    return "Browser";
  }

  function init(opts) {
    config = opts;
    const btn = document.getElementById("pushPermissionBtn");
    if (!btn) return;

    updateButtonState(btn);
    btn.addEventListener("click", function () {
      enable(opts).catch(err => showToast(err.message || "Could not enable notifications", "error"));
    });

    // Clicking a background push (handled in firebase-messaging-sw.js)
    // posts back here so we can jump straight to the right section.
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.addEventListener("message", function (event) {
        if (event.data && event.data.type === "PUSH_NOTIFICATION_CLICK") {
          const hash = event.data.url.split("#")[1];
          const navBtn = hash && document.querySelector(`[data-section="${hash}"]`);
          if (navBtn) navBtn.click();
        }
      });
    }
  }

  async function unregisterOnLogout(unregisterUrl) {
    const token = localStorage.getItem(STORAGE_KEY);
    if (!token) return;
    try {
      await apiRequest(unregisterUrl, { method: "POST", auth: true, body: { fcmToken: token } });
    } catch {
      // Best-effort only - logout must never be blocked by this.
    } finally {
      localStorage.removeItem(STORAGE_KEY);
    }
  }

  return { init, unregisterOnLogout };
})();
