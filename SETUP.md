# Push Notifications (FCM) — Setup

The push-notification code (frontend + backend) is already implemented and wired
into the existing notification system. It's currently inactive because it's
shipped with placeholder configuration — no real Firebase credentials are (or
should be) committed to this project. Follow the steps below to activate it.

You do **not** need to touch any code to turn this on — only configuration values.

---

## 1. Create a Firebase project

1. Go to https://console.firebase.google.com → **Add project**.
2. Name it (e.g. `profenaa-portal`). Google Analytics is optional, not required.

## 2. Register a Web App

1. In the new project: **Project settings** (gear icon) → **General** → under
   "Your apps" click the **</>** (Web) icon.
2. Give it a nickname (e.g. "Profenaa Portal Web"). You don't need Firebase
   Hosting.
3. Firebase shows you a `firebaseConfig` object — copy it, you'll need it below.

## 3. Generate the VAPID key (Web Push certificate)

1. **Project settings** → **Cloud Messaging** tab.
2. Under **Web configuration** → **Web Push certificates**, click **Generate key pair**.
3. Copy the key string shown — this is `FIREBASE_VAPID_KEY`.

## 4. Configure the frontend

Edit `assets/js/firebase-config.js` and replace every `REPLACE_ME` with the
values from steps 2–3:

```js
const FIREBASE_CONFIG = {
  apiKey: "AIza...",
  authDomain: "profenaa-portal.firebaseapp.com",
  projectId: "profenaa-portal",
  storageBucket: "profenaa-portal.appspot.com",
  messagingSenderId: "123456789012",
  appId: "1:123456789012:web:abcdef123456"
};

const FIREBASE_VAPID_KEY = "BN...your-vapid-key...";
```

These are all public web-config values — Firebase's own docs say it's normal
for them to live in frontend code. **Do not put the Admin SDK service-account
key here.**

Once this file has real values (i.e. `apiKey` is no longer `"REPLACE_ME"`),
the "Push notifications aren't configured yet on this deployment" message
stops appearing and the **Enable Desktop & Mobile Notifications** button
starts the real permission/registration flow.

## 5. Generate the Admin SDK service account (backend)

1. **Project settings** → **Service accounts** → **Generate new private key**.
2. This downloads a JSON file. **Never commit this file or its contents to
   git or paste it into frontend code.**

## 6. Configure the backend

The backend (`FirebaseConfig.java`) reads credentials from environment
variables — set **one** of these on the server that runs the Spring Boot app:

| Env var | Value |
|---|---|
| `FIREBASE_SERVICE_ACCOUNT_JSON` | The **entire contents** of the downloaded JSON file, as one line/string. |
| `FIREBASE_SERVICE_ACCOUNT_FILE` | An absolute path to the JSON file already sitting on the server (e.g. `/etc/profenaa/firebase-service-account.json`, readable only by the app user). |

Example (systemd service / `.env` on the VPS):
```
FIREBASE_SERVICE_ACCOUNT_FILE=/etc/profenaa/firebase-service-account.json
FRONTEND_BASE_URL=https://<your production frontend origin>
```

If neither variable is set, the backend boots normally and push sends are
silently skipped — in-app (database) notifications keep working exactly as
before. Nothing else needs to change in `application.properties`.

`FRONTEND_BASE_URL` (already an existing setting) is what a push notification's
click-through link is built from — set it to whatever origin actually serves
`admin-dashboard.html` / `student-dashboard.html` in production.

## 7. Confirm CORS includes your real production frontend origin

`app.cors.allowed-origins` in `application.properties` currently lists:
```
http://localhost:5500, http://127.0.0.1:5500, http://localhost:5173,
http://127.0.0.1:5501, http://localhost:5501, http://127.0.0.1:5502,
http://localhost:5502, https://profenaatechnologies.com
```
If the site is actually served in production from a different origin (for
example `https://www.profenaainfotech.com`), add that exact origin
(scheme + host, no trailing slash) to this list before deploying — a push
token can only be registered from an origin the API accepts. We didn't add
it automatically since we couldn't confirm which domain is the live one;
tell us and we'll add it, or add it yourself and redeploy.

## 8. Rebuild and redeploy the backend

Firebase config is read at startup, and CORS origins are baked into a Spring
bean — both require a rebuild + redeploy of the JAR to the VPS running
`https://api.profenaatechnologies.com`, same as any other backend change.

```
mvn clean package
# copy the resulting target/*.jar to the server and restart the service
```

## 9. Testing

**Laptop (Chrome/Edge, Windows/macOS):**
- Open the deployed site over **HTTPS** (Web Push requires a secure context —
  `localhost`/`127.0.0.1` also work for local dev).
- Log in, open Notifications, click **Enable Desktop & Mobile Notifications**.
- Accept the browser permission prompt.
- Trigger any existing notification event (e.g. approve a leave request) and
  confirm a native OS notification appears, and clicking it opens/focuses the
  portal on the right section.

**Android:**
- Chrome on Android supports Web Push out of the box — same flow as above,
  no install needed.

**iPhone/iPad:**
- iOS Safari only delivers Web Push to a site that has been **"Added to Home
  Screen"** first (Share → Add to Home Screen), then opened from that home
  screen icon. Regular Safari tabs cannot receive push on iOS.
- Requires iOS 16.4+.

**Multi-device / account isolation:**
- Enable notifications on two different browsers/devices for the same
  account → both receive pushes.
- Log out on one device, log a **different** account in on the same
  browser, enable notifications there → confirm the first account no longer
  receives pushes on that browser (the token is re-associated to the new
  owner on register, and deactivated on logout).

## What was actually broken vs. already working

Everything in this checklist — Firebase SDK loading, service worker,
token registration endpoints, the `device_tokens` table, per-user/per-role
send logic, invalid-token cleanup, hook into the existing
`NotificationService`, click-to-navigate payload — was already implemented
correctly in the project you sent. The only real bug was:

- `assets/img/icon-192.png` and `assets/img/icon-512.png` were referenced by
  `manifest.json` but the files didn't exist (empty `assets/img/` folder),
  causing the 404 you saw. Fixed: both PNGs now exist, generated from the
  site's existing "P" brand mark (`--crimson` `#b3122d`, same as the
  in-app logo chip) — no visual identity change. Also added
  `<link rel="apple-touch-icon">` and a regular favicon `<link>` to both
  dashboards, which iOS needs for "Add to Home Screen" (the manifest icons
  array alone isn't read by iOS Safari).
- The "Push notifications aren't configured yet on this deployment." message
  was **not a bug** — it's the code correctly detecting that
  `firebase-config.js` still has placeholder values. It will stop appearing
  as soon as you complete step 4 above.
