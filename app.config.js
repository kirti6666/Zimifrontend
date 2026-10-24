const fs = require("node:fs");
const path = require("node:path");

/* Extends app.json. Firebase Cloud Messaging needs google-services.json from
   the Firebase console (Android app com.aurora.liveapp). It is not committed:
   put it next to this file for local builds, or point GOOGLE_SERVICES_JSON at
   it (an EAS file environment variable). Without it the app still builds, and
   push reports "unavailable" on the device. */
module.exports = ({ config }) => {
  const file = process.env.GOOGLE_SERVICES_JSON || path.join(__dirname, "google-services.json");
  if (!fs.existsSync(file)) return config;
  return { ...config, android: { ...config.android, googleServicesFile: file } };
};
