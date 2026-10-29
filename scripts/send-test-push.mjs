/* Sends one test push to a phone without the backend, to try the app's handling:
   an incoming call, its cancellation (Missed call) or a gift notice. Signs in with
   the Firebase service-account key named by GOOGLE_APPLICATION_CREDENTIALS (never
   commit that key). No dependencies, so the file can be copied to the server.

   GOOGLE_APPLICATION_CREDENTIALS=key.json node scripts/send-test-push.mjs <fcm-token> call|missed|gift [callId]

   Send "missed" with the same callId within 30s of "call" to stop that ring. */
import { createSign } from "node:crypto";
import { readFileSync } from "node:fs";

const [token, kind = "call", callId = `test-${Date.now()}`] = process.argv.slice(2);
const DATA = {
  call: { type: "incoming_call", callId, callerId: "test", callerName: "Test caller", sentAt: String(Date.now()) },
  missed: { type: "call_cancelled", callId, reason: "missed", callerName: "Test caller" },
  gift: { type: "gift_received", title: "Rose from Test caller", body: "+50 coins" },
};
if (!token || !DATA[kind] || !process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  console.error("Usage: GOOGLE_APPLICATION_CREDENTIALS=key.json node scripts/send-test-push.mjs <fcm-token> call|missed|gift [callId]");
  process.exit(1);
}

const key = JSON.parse(readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS, "utf8"));
const part = value => Buffer.from(JSON.stringify(value)).toString("base64url");
const now = Math.floor(Date.now() / 1000);
const unsigned = `${part({ alg: "RS256", typ: "JWT" })}.${part({ iss: key.client_email, scope: "https://www.googleapis.com/auth/firebase.messaging", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 })}`;
const assertion = `${unsigned}.${createSign("RSA-SHA256").update(unsigned).sign(key.private_key, "base64url")}`;

const auth = await (await fetch("https://oauth2.googleapis.com/token", {
  method: "POST", body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
})).json();
if (!auth.access_token) throw new Error(`Google sign-in failed: ${JSON.stringify(auth)}`);

const call = kind !== "gift";
const response = await fetch(`https://fcm.googleapis.com/v1/projects/${key.project_id}/messages:send`, {
  method: "POST",
  headers: { authorization: `Bearer ${auth.access_token}`, "content-type": "application/json" },
  body: JSON.stringify({ message: { token, data: DATA[kind], android: call ? { priority: "HIGH", ttl: "30s" } : { priority: "NORMAL" } } }),
});
console.log(`${kind} ${callId}: ${response.status} ${await response.text()}`);
