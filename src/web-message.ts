import type { WebMessage } from "./bridge";

const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const text = (value: unknown, max = 128) => typeof value === "string" && value.length > 0 && value.length <= max;
const optionalText = (value: unknown, max = 128) => value === undefined || text(value, max);
const boolean = (value: unknown) => typeof value === "boolean";
const role = (value: unknown) => value === "sender" || value === "host";
const amount = (value: unknown) => typeof value === "number" && Number.isFinite(value) && value > 0 && value <= 1e9;
const identifier = (value: unknown) => text(value) && /^[a-zA-Z0-9_-]+$/.test(value as string);
const strings = (value: unknown, max: number) => Array.isArray(value) && value.length <= max && value.every(item => text(item, 100));
const photoData = (value: unknown) => typeof value === "string" && value.length <= 2 * 1024 * 1024 && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/.test(value);
const category = (value: unknown) => ["Dance", "Gaming", "Music", "Talk", "Astrology", "Fitness", "Comedy"].includes(String(value));
const rtcSignal = (data: Record<string, unknown>) => {
  if (Boolean(data.description) === Boolean(data.candidate)) return false;
  if (data.description) return record(data.description) && ["offer", "answer"].includes(String(data.description.type)) && text(data.description.sdp, 60000);
  const candidate = data.candidate;
  return record(candidate) && typeof candidate.candidate === "string" && candidate.candidate.length <= 4096 &&
    (candidate.sdpMid == null || text(candidate.sdpMid, 256)) &&
    (candidate.sdpMLineIndex == null || (Number.isInteger(candidate.sdpMLineIndex) && Number(candidate.sdpMLineIndex) >= 0 && Number(candidate.sdpMLineIndex) <= 100)) &&
    optionalText(candidate.usernameFragment, 256);
};
const idempotency = (value: unknown) => typeof value === "string" && /^[a-zA-Z0-9_-]{8,100}$/.test(value);

/** WebView messages are untrusted input, even when TypeScript callers are typed. */
export function parseWebMessage(raw: string): WebMessage | null {
  // Six compressed profile photos are allowed; arbitrary oversized messages are not.
  if (raw.length > 12 * 1024 * 1024) return null;
  let message: unknown;
  try { message = JSON.parse(raw); } catch { return null; }
  if (!record(message) || typeof message.type !== "string" || !record(message.data)) return null;
  const d = message.data;
  if (d.requestId !== undefined && (!Number.isSafeInteger(d.requestId) || Number(d.requestId) < 0)) return null;
  let valid = false;
  switch (message.type) {
    case "ready": valid = boolean(d.demo); break;
    case "session.resume": case "data.reload": case "auth.logout": valid = true; break;
    case "home.reload": valid = (d.category === undefined || category(d.category)) && (d.q === undefined || (typeof d.q === "string" && d.q.length <= 100)) && (d.mode === undefined || ["popular", "instant"].includes(String(d.mode))) && (d.page === undefined || (Number.isInteger(d.page) && Number(d.page) >= 1 && Number(d.page) <= 10000)); break;
    case "hosts.search": valid = typeof d.q === "string" && d.q.length <= 100 && (d.page === undefined || (Number.isInteger(d.page) && Number(d.page) >= 1 && Number(d.page) <= 10000)); break;
    case "notifications.load": case "catalog.load": case "rtc.config": valid = true; break;
    case "notifications.read": valid = Array.isArray(d.ids) && d.ids.length > 0 && d.ids.length <= 100 && d.ids.every(identifier); break;
    case "call.match": valid = d.category === undefined || category(d.category); break;
    case "rtc.signal": valid = identifier(d.callId) && rtcSignal(d); break;
    case "stream.signal": valid = identifier(d.streamId) && identifier(d.to) && rtcSignal(d); break;
    case "stream.start": valid = text(d.title, 120) && category(d.category) && (d.kind === undefined || ["video", "audio"].includes(String(d.kind))); break;
    case "stream.join": case "stream.leave": case "stream.end": case "stream.ready": valid = identifier(d.streamId); break;
    case "stream.message": valid = identifier(d.streamId) && text(d.text, 500); break;
    case "wallet.checkout": valid = identifier(d.packId) && idempotency(d.idempotencyKey); break;
    case "wallet.verify": valid = text(d.merchantOrderId, 100) && /^[a-zA-Z0-9_-]+$/.test(String(d.merchantOrderId)); break;
    case "theme": valid = (d.theme === "light" || d.theme === "dark") && (d.canvas === undefined || d.canvas === "" || (typeof d.canvas === "string" && /^#[0-9a-f]{6}$/i.test(d.canvas))); break;
    case "ui.haptic": valid = ["selection", "success", "error", "light"].includes(String(d.kind)); break;
    case "auth.sendOtp": valid = typeof d.phone === "string" && /^\+91[6-9]\d{9}$/.test(d.phone) && role(d.role); break;
    case "auth.verifyOtp": valid = typeof d.phone === "string" && /^\+91[6-9]\d{9}$/.test(d.phone) && typeof d.code === "string" && /^\d{6}$/.test(d.code) && role(d.role) && boolean(d.signup); break;
    case "auth.google": valid = role(d.role) && boolean(d.signup); break;
    case "profile.save":
      valid = (d.name === undefined || text(d.name, 100)) && (d.email === undefined || text(d.email, 254)) &&
        (d.avatar === undefined || photoData(d.avatar)) && (d.cover === undefined || d.cover === null || photoData(d.cover)) &&
        (d.city === undefined || (typeof d.city === "string" && d.city.length <= 100)) && (d.about === undefined || (typeof d.about === "string" && d.about.length <= 500)) &&
        (d.photos === undefined || (Array.isArray(d.photos) && d.photos.length <= 6 && d.photos.every(photo =>
          typeof photo === "string" && photo.length <= 2 * 1024 * 1024 && (/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/.test(photo) || /^https:\/\/[^\s"'<>]+$/.test(photo))))) &&
        (d.langs === undefined || strings(d.langs, 20)) && (d.interests === undefined || strings(d.interests, 20)) &&
        (d.onboarding === undefined || boolean(d.onboarding)) && (d.adultConfirmed === undefined || boolean(d.adultConfirmed));
      break;
    case "media.post.create": valid = photoData(d.photo) && typeof d.caption === "string" && d.caption.length <= 2000; break;
    case "verification.submit": valid = (d.bio === undefined || text(d.bio, 2000)) && (d.langs === undefined || strings(d.langs, 20)); break;
    case "presence.set": valid = boolean(d.online) && boolean(d.visible); break;
    case "settings.set": valid = Object.keys(d).length <= 20; break;
    case "follow.set": valid = identifier(d.id) && boolean(d.on); break;
    case "chat.open": valid = identifier(d.with); break;
    case "chat.send": valid = identifier(d.to) && text(d.text, 4000) && (d.inCall === undefined || boolean(d.inCall)); break;
    case "gift.send": valid = identifier(d.to) && text(d.gift, 100) && amount(d.coins) && boolean(d.inCall) && (d.streamId === undefined || identifier(d.streamId)) && (d.idempotencyKey === undefined || idempotency(d.idempotencyKey)); break;
    case "call.start": valid = identifier(d.to) && (d.voice === undefined || boolean(d.voice)); break;
    case "call.accept": case "call.decline": valid = identifier(d.callId); break;
    case "call.end": valid = (d.callId === undefined || identifier(d.callId)) && optionalText(d.reason, 300); break;
    case "wallet.recharge": valid = Number.isInteger(d.pack) && amount(d.coins) && amount(d.price) && text(d.method, 50); break;
    case "payout.request": valid = amount(d.coins) && text(d.upi, 100); break;
    case "awards.claim": valid = identifier(d.task); break;
  }
  return valid ? message as WebMessage : null;
}

export function isTrustedDocument(url: string) {
  // Android's WebMessageListener reports sourceOrigin (no trailing slash).
  // iOS and Android's legacy bridge report the full document URL instead.
  // Accept both exact representations without allowing other hosts or paths.
  return url === "about:blank" || url === "https://aurora.localhost" || url === "https://aurora.localhost/";
}
