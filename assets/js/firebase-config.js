/* ==========================================================================
   Firebase Web SDK configuration.
   These are the normal PUBLIC web config values Firebase Web SDK requires -
   NOT secrets. It is safe for these to live in frontend code (this is the
   same config Firebase's own docs tell you to embed in your web app).

   REPLACE every REPLACE_ME value below with the values from:
   Firebase Console -> Project settings -> General -> "Your apps" -> Web app

   VAPID_KEY comes from:
   Firebase Console -> Project settings -> Cloud Messaging -> Web configuration
   -> "Web Push certificates" -> Key pair

   Do NOT put the Firebase service-account / Admin SDK private key here or
   anywhere in frontend code - that stays backend-only (see FirebaseConfig.java
   and the "Firebase setup" section of the README).
   ========================================================================== */
const FIREBASE_CONFIG = {
  apiKey: "REPLACE_ME",
  authDomain: "REPLACE_ME.firebaseapp.com",
  projectId: "REPLACE_ME",
  storageBucket: "REPLACE_ME.appspot.com",
  messagingSenderId: "REPLACE_ME",
  appId: "REPLACE_ME"
};

const FIREBASE_VAPID_KEY = "REPLACE_ME";
