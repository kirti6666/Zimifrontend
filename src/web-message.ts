import type { WebMessage } from "./bridge";
import { validNotificationPreferencesPatch } from "./notification-preferences";
import { notificationTargetFrom } from "./notification-target";
import { SUPPORT_CATEGORIES, SUPPORT_STATUSES } from "./api/support";

const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const text = (value: unknown, max = 128) => typeof value === "string" && value.length > 0 && value.length <= max;
const optionalText = (value: unknown, max = 128) => value === undefined || text(value, max);
const boolean = (value: unknown) => typeof value === "boolean";
const optionalColor = (value: unknown) => value === undefined || (typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value));
const role = (value: unknown) => value === "sender" || value === "host";
const giftAmount = (value: unknown) => typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= 1e9;
const identifier = (value: unknown) => text(value) && /^[a-zA-Z0-9_-]+$/.test(value as string);
const strings = (value: unknown, max: number) => Array.isArray(value) && value.length <= max && value.every(item => text(item, 100));
const photoData = (value: unknown) => typeof value === "string" && value.length <= 2 * 1024 * 1024 && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/.test(value);
const audioData = (value: unknown) => {
  if (typeof value !== "string" || value.length > Math.ceil(5 * 1024 * 1024 / 3) * 4 + 100) return false;
  const comma = value.indexOf(","), header = value.slice(0, comma), encoded = value.slice(comma + 1);
  if (!/^data:audio\/(webm|mp4|ogg)(?:;codecs=(?:opus|mp4a\.40\.2))?;base64$/.test(header) || !encoded || encoded.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) return false;
  return encoded.length / 4 * 3 - (encoded.endsWith("==") ? 2 : encoded.endsWith("=") ? 1 : 0) <= 5 * 1024 * 1024;
};
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
// E.164, optionally with the calling code the person chose (it must start the number).
const phoneNumber = (d: Record<string, unknown>) => typeof d.phone === "string" && /^\+[1-9]\d{5,14}$/.test(d.phone) &&
  (d.dialCode === undefined || (typeof d.dialCode === "string" && /^\+[1-9]\d{0,2}$/.test(d.dialCode) && d.phone.startsWith(d.dialCode)));
const idempotency = (value: unknown) => typeof value === "string" && /^[a-zA-Z0-9_-]{8,100}$/.test(value);
const supportId = (value: unknown) => typeof value === "string" && /^[a-f\d]{24}$/i.test(value);
const supportKeys = (data: Record<string, unknown>, keys: string[]) => Object.keys(data).every(key => keys.includes(key));
const supportRequest = (data: Record<string, unknown>) => Number.isSafeInteger(data.requestId) && Number(data.requestId) > 0;
const supportBody = (value: unknown) => text(value, 4000) && !!(value as string).trim();
const paymentRoute = (value: unknown) => value === undefined || (typeof value === "string" && /^[A-Za-z0-9_-]{1,100}$/.test(value));
const voiceClientId = (value: unknown) => typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value);
const notificationIds = (value: unknown) => Array.isArray(value) && value.length > 0 && value.length <= 100 && value.every(identifier) && new Set(value).size === value.length;
const isoTimestamp = (value: unknown) => typeof value === "string" && value.length <= 40 &&
  /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,9})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(value) &&
  Number.isFinite(Date.parse(value)) && new Date(`${value.slice(0, 10)}T00:00:00.000Z`).toISOString().slice(0, 10) === value.slice(0, 10);
const notificationQuery = (data: Record<string, unknown>) => Object.keys(data).every(key => ["page", "limit", "q", "status", "audience", "since", "before", "sort", "requestId"].includes(key)) &&
  (data.page === undefined || (Number.isInteger(data.page) && Number(data.page) >= 1 && Number(data.page) <= 10000)) &&
  (data.limit === undefined || (Number.isInteger(data.limit) && Number(data.limit) >= 1 && Number(data.limit) <= 100)) &&
  (data.q === undefined || (typeof data.q === "string" && data.q.length <= 100)) &&
  (data.status === undefined || ["all", "unread", "read"].includes(String(data.status))) &&
  (data.audience === undefined || ["all", "personal", "announcements"].includes(String(data.audience))) &&
  (data.sort === undefined || ["newest", "oldest"].includes(String(data.sort))) &&
  (data.since === undefined || isoTimestamp(data.since)) &&
  (data.before === undefined || isoTimestamp(data.before)) &&
  (data.since === undefined || data.before === undefined || Date.parse(data.since as string) < Date.parse(data.before as string));
const settingsPatch = (data: Record<string, unknown>) => {
  const keys = Object.keys(data).filter(key => key !== "requestId");
  return keys.length > 0 && keys.every(key => ["pushNotifications", "notificationPreferences", "matchCategory", "appearance", "languages", "city", "country"].includes(key)) &&
    (data.pushNotifications === undefined || boolean(data.pushNotifications)) &&
    (data.notificationPreferences === undefined || validNotificationPreferencesPatch(data.notificationPreferences)) &&
    (data.matchCategory === undefined || data.matchCategory === null || category(data.matchCategory)) &&
    (data.appearance === undefined || ["dark", "light", "system"].includes(String(data.appearance))) &&
    (data.city === undefined || (typeof data.city === "string" && data.city.length <= 100)) &&
    (data.country === undefined || (typeof data.country === "string" && data.country.length <= 100)) &&
    (data.languages === undefined || (Array.isArray(data.languages) && data.languages.length <= 8 && data.languages.every(value => typeof value === "string" && value.trim().length > 0 && value.length <= 50 && /^[\p{L}\p{M}\p{N} _&+-]+$/u.test(value)) && new Set(data.languages.map(value => String(value).trim().toLowerCase())).size === data.languages.length));
};
const privacyPatch = (data: Record<string, unknown>) => {
  const keys = Object.keys(data).filter(key => key !== "requestId");
  return keys.length > 0 && keys.every(key => ["discoverable", "showActivity"].includes(key) && boolean(data[key]));
};

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
    case "app.exit.request": case "app.launched": valid = Object.keys(d).length === 0; break;
    case "session.resume": case "data.reload": case "auth.logout": valid = true; break;
    case "connection.check": case "wallet.load": case "transactions.load": case "push.enable": valid = Object.keys(d).length === 0; break;
    case "permissions.load": case "permissions.request": case "permissions.settings": case "permissions.cancel":
      valid = Number.isSafeInteger(d.requestId) && Number(d.requestId) > 0 && Object.keys(d).every(key => key === "requestId"); break;
    case "beauty.auth": valid = Number.isSafeInteger(d.requestId) && Number(d.requestId) > 0 && Object.keys(d).every(key => key === "requestId"); break;
    case "home.reload": valid = (d.category === undefined || category(d.category)) && (d.q === undefined || (typeof d.q === "string" && d.q.length <= 100)) && (d.mode === undefined || ["popular", "instant", "online", "following", "foryou", "new"].includes(String(d.mode))) && (d.country === undefined || (typeof d.country === "string" && d.country.trim().length > 0 && d.country.length <= 100)) && (d.page === undefined || (Number.isInteger(d.page) && Number(d.page) >= 1 && Number(d.page) <= 10000)); break;
    case "leaderboard.load": valid = ["daily", "weekly", "all"].includes(String(d.period)) && Object.keys(d).every(key => key === "period"); break;
    case "referral.load": case "referral.share": valid = Object.keys(d).length === 0; break;
    case "referral.apply": valid = typeof d.code === "string" && d.code.trim().length > 0 && d.code.length <= 20 && Number.isSafeInteger(d.requestId) && Number(d.requestId) > 0 &&
      Object.keys(d).every(key => ["code", "requestId"].includes(key)); break;
    case "hosts.search": valid = typeof d.q === "string" && d.q.length <= 100 && (d.page === undefined || (Number.isInteger(d.page) && Number(d.page) >= 1 && Number(d.page) <= 10000)); break;
    case "notifications.load": valid = notificationQuery(d); break;
    case "notifications.open": {
      const target = notificationTargetFrom(d);
      valid = !!target && target.targetType === d.targetType && (d.targetId === undefined || target.targetId === d.targetId) &&
        Object.keys(d).every(key => ["notificationId", "category", "targetType", "targetId", "actorId", "recipientId", "expiresAt"].includes(key));
      break;
    }
    case "official.load": valid = Number.isSafeInteger(d.requestId) && Number(d.requestId) > 0 && (d.page === undefined || (Number.isInteger(d.page) && Number(d.page) >= 1 && Number(d.page) <= 10000)) && Object.keys(d).every(key => ["page", "requestId"].includes(key)); break;
    case "support.activity": valid = boolean(d.active) && (d.ticketId === undefined || supportId(d.ticketId)) && supportKeys(d, ["active", "ticketId"]);break;
    case "support.load": valid = supportRequest(d) && (d.page === undefined || (Number.isInteger(d.page) && Number(d.page) >= 1 && Number(d.page) <= 10000)) &&
      (d.status === undefined || d.status === "all" || SUPPORT_STATUSES.includes(d.status as never)) && supportKeys(d, ["page", "status", "requestId"]);break;
    case "support.open": valid = supportRequest(d) && supportId(d.ticketId) && (d.before === undefined || supportId(d.before)) && supportKeys(d, ["ticketId", "before", "requestId"]);break;
    case "support.create": valid = supportRequest(d) && text(d.subject, 120) && !!(d.subject as string).trim() && SUPPORT_CATEGORIES.includes(d.category as never) && supportBody(d.body) &&
      idempotency(d.clientMessageId) && supportKeys(d, ["subject", "category", "body", "clientMessageId", "requestId"]);break;
    case "support.send": valid = supportRequest(d) && supportId(d.ticketId) && supportBody(d.body) && idempotency(d.clientMessageId) && supportKeys(d, ["ticketId", "body", "clientMessageId", "requestId"]);break;
    case "support.read": valid = supportRequest(d) && supportId(d.ticketId) && supportId(d.throughMessageId) && supportKeys(d, ["ticketId", "throughMessageId", "requestId"]);break;
    case "support.status": valid = supportRequest(d) && supportId(d.ticketId) && ["open", "resolved"].includes(String(d.status)) && supportKeys(d, ["ticketId", "status", "requestId"]);break;
    case "official.read": valid = Number.isSafeInteger(d.requestId) && Number(d.requestId) > 0 && ((notificationIds(d.ids) && d.all === undefined) || (d.all === true && d.ids === undefined)) && Object.keys(d).every(key => ["ids", "all", "requestId"].includes(key)); break;
    case "catalog.load": case "rtc.config": valid = true; break;
    case "themes.load": valid = Object.keys(d).length === 0; break;
    case "themes.select": valid = typeof d.themeId === "string" && /^[a-f\d]{24}$/i.test(d.themeId) && Object.keys(d).every(key => ["themeId", "requestId"].includes(key)); break;
    case "themes.premium.checkout": valid = idempotency(d.idempotencyKey) && paymentRoute(d.route) && Object.keys(d).every(key => ["idempotencyKey", "route"].includes(key)); break;
    case "payments.routes.load": valid = Number.isSafeInteger(d.requestId) && Number(d.requestId) > 0 && Object.keys(d).every(key => key === "requestId"); break;
    case "profile.settings.load": valid = true; break;
    case "profile.load": valid = identifier(d.id) && Object.keys(d).every(key => ["id", "requestId"].includes(key)); break;
    case "profile.posts.load": valid = identifier(d.id) && (d.page === undefined || (Number.isInteger(d.page) && Number(d.page) >= 1 && Number(d.page) <= 10000)) && Object.keys(d).every(key => ["id", "page", "requestId"].includes(key)); break;
    case "profile.settings.save": case "settings.set": valid = settingsPatch(d); break;
    case "privacy.save": valid = privacyPatch(d); break;
    case "blocked.load": valid = d.page === undefined || (Number.isInteger(d.page) && Number(d.page) >= 1 && Number(d.page) <= 10000); break;
    case "block.set": valid = identifier(d.id) && boolean(d.blocked); break;
    case "notifications.read": valid = notificationIds(d.ids) && Object.keys(d).every(key => ["ids", "requestId"].includes(key)); break;
    case "notifications.unread": valid = notificationIds(d.ids) && d.requestId !== undefined && Object.keys(d).every(key => ["ids", "requestId"].includes(key)); break;
    case "notifications.readAll": valid = d.requestId !== undefined && Object.keys(d).every(key => key === "requestId"); break;
    case "call.match": valid = d.category === undefined || category(d.category); break;
    case "rtc.signal": valid = identifier(d.callId) && rtcSignal(d); break;
    case "stream.signal": valid = identifier(d.streamId) && identifier(d.to) && rtcSignal(d); break;
    case "stream.start": valid = text(d.title, 120) && category(d.category) && (d.kind === undefined || ["video", "audio"].includes(String(d.kind))); break;
    case "stream.join": case "stream.leave": case "stream.end": case "stream.ready": valid = identifier(d.streamId); break;
    case "stream.share": valid = identifier(d.streamId) && Object.keys(d).every(key => key === "streamId"); break;
    case "stream.message": valid = identifier(d.streamId) && text(d.text, 500); break;
    case "stream.requests.load": case "stream.request": case "stream.react": valid = identifier(d.streamId); break;
    case "stream.request.cancel": case "stream.request.decline": case "stream.request.accept": valid = identifier(d.streamId) && identifier(d.id); break;
    case "wallet.checkout": valid = identifier(d.packId) && idempotency(d.idempotencyKey) && paymentRoute(d.route) && Object.keys(d).every(key => ["packId", "idempotencyKey", "route"].includes(key)); break;
    case "wallet.verify": case "themes.premium.verify": valid = text(d.merchantOrderId, 100) && /^[a-zA-Z0-9_-]+$/.test(String(d.merchantOrderId)) && Object.keys(d).every(key => key === "merchantOrderId"); break;
    case "payments.checkout.closed": valid = (d.kind === "coins" || d.kind === "premium") &&
      (d.merchantOrderId !== undefined || d.idempotencyKey !== undefined) &&
      (d.merchantOrderId === undefined || identifier(d.merchantOrderId)) &&
      (d.idempotencyKey === undefined || idempotency(d.idempotencyKey)) &&
      Object.keys(d).every(key => ["kind", "merchantOrderId", "idempotencyKey"].includes(key)); break;
    case "theme": valid = (d.theme === "light" || d.theme === "dark") && (d.canvas === "" || optionalColor(d.canvas)) && ["ink", "primary", "contrast", "surface", "raised"].every(key => optionalColor(d[key])); break;
    case "ui.haptic": valid = ["selection", "success", "error", "light"].includes(String(d.kind)); break;
    case "screen.secure": valid = boolean(d.on); break;
    case "auth.sendOtp": valid = phoneNumber(d) && role(d.role); break;
    case "auth.verifyOtp": valid = phoneNumber(d) && typeof d.code === "string" && /^\d{4,8}$/.test(d.code) && role(d.role) && boolean(d.signup); break;
    case "auth.google": valid = role(d.role) && boolean(d.signup); break;
    case "auth.emailCheck": valid = text(d.email, 254) && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(d.email)) && d.requestId !== undefined && Object.keys(d).every(key => ["email", "requestId"].includes(key)); break;
    case "account.deactivate": valid = d.confirmed === true && Number.isSafeInteger(d.requestId) && Number(d.requestId) > 0 && Object.keys(d).every(key => ["confirmed", "requestId"].includes(key)); break;
    case "relationships.load": valid = ["followers", "following"].includes(String(d.kind)) && Number.isSafeInteger(d.requestId) && Number(d.requestId) > 0 && (d.page === undefined || (Number.isSafeInteger(d.page) && Number(d.page) >= 1 && Number(d.page) <= 10000)) && Object.keys(d).every(key => ["kind", "page", "requestId"].includes(key)); break;
    case "creator.card.save": case "profile.cover.save": valid = photoData(d.photo) && Number.isSafeInteger(d.requestId) && Number(d.requestId) > 0 && Object.keys(d).every(key => ["photo", "requestId"].includes(key)); break;
    case "profile.save":
      valid = (d.name === undefined || text(d.name, 100)) && (d.email === undefined || text(d.email, 254)) &&
        (d.avatar === undefined || photoData(d.avatar)) && (d.cover === undefined || d.cover === null || photoData(d.cover)) &&
        (d.city === undefined || (typeof d.city === "string" && d.city.length <= 100)) && (d.country === undefined || (typeof d.country === "string" && d.country.length <= 100)) && (d.about === undefined || (typeof d.about === "string" && d.about.length <= 500)) &&
        (d.photos === undefined || (Array.isArray(d.photos) && d.photos.length <= 6 && d.photos.every(photo =>
          typeof photo === "string" && photo.length <= 2 * 1024 * 1024 && (/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/.test(photo) || /^https:\/\/[^\s"'<>]+$/.test(photo))))) &&
        (d.langs === undefined || strings(d.langs, 20)) && (d.interests === undefined || strings(d.interests, 20)) &&
        (d.onboarding === undefined || boolean(d.onboarding)) && (d.adultConfirmed === undefined || boolean(d.adultConfirmed)) &&
        (d.gender === undefined || d.gender === "female" || d.gender === "male" || d.gender === "undisclosed");
      break;
    case "media.post.create": valid = photoData(d.photo) && typeof d.caption === "string" && d.caption.length <= 2000; break;
    case "post.like": valid = identifier(d.id) && boolean(d.liked) && (d.requestId === undefined || Number.isSafeInteger(d.requestId)) && Object.keys(d).every(key => ["id", "liked", "requestId"].includes(key)); break;
    case "post.comments.load": valid = identifier(d.id) && (d.page === undefined || (Number.isInteger(d.page) && Number(d.page) >= 1 && Number(d.page) <= 10000)) && (d.requestId === undefined || Number.isSafeInteger(d.requestId)) && Object.keys(d).every(key => ["id", "page", "requestId"].includes(key)); break;
    case "post.comment.add": valid = identifier(d.id) && text(d.text, 1000) && String(d.text).trim().length > 0 && Number.isSafeInteger(d.requestId) && Object.keys(d).every(key => ["id", "text", "requestId"].includes(key)); break;
    case "post.comment.delete": valid = identifier(d.id) && identifier(d.commentId) && Number.isSafeInteger(d.requestId) && Object.keys(d).every(key => ["id", "commentId", "requestId"].includes(key)); break;
    case "media.post.delete": valid = identifier(d.id) && Number.isSafeInteger(d.requestId) && Number(d.requestId) > 0 && Object.keys(d).every(key => ["id", "requestId"].includes(key)); break;
    case "agency.load": valid = Number.isSafeInteger(d.requestId) && Number(d.requestId) > 0 && Object.keys(d).every(key => key === "requestId"); break;
    case "agency.verify": case "agency.join": valid = typeof d.agencyCode === "string" && (message.type === "agency.join" ? /^BINZO[A-Z0-9]{10}$/ : /^[A-Z0-9]{6,32}$/).test(d.agencyCode) && Number.isSafeInteger(d.requestId) && Number(d.requestId) > 0 && Object.keys(d).every(key => ["agencyCode", "requestId"].includes(key)); break;
    case "verification.submit": valid = (d.bio === undefined || text(d.bio, 2000)) && (d.langs === undefined || strings(d.langs, 20)); break;
    case "presence.set": valid = boolean(d.online) && boolean(d.visible); break;
    case "presence.duringCalls": valid = boolean(d.on); break;
    case "host.callStatus.load": valid = true; break;
    case "follow.set": valid = identifier(d.id) && boolean(d.on) && Object.keys(d).every(key => ["id", "on", "requestId"].includes(key)); break;
    case "chat.open": valid = identifier(d.with) && (d.background === undefined || boolean(d.background)) && (d.knownIds === undefined || (Array.isArray(d.knownIds) && d.knownIds.length <= 200 && d.knownIds.every(id => typeof id === "string" && /^[a-f\d]{24}$/i.test(id)) && new Set(d.knownIds).size === d.knownIds.length)) && Object.keys(d).every(key => ["with", "background", "knownIds"].includes(key)); break;
    case "chat.activity": valid = identifier(d.with) && boolean(d.active) && Object.keys(d).every(key => ["with", "active"].includes(key)); break;
    case "chats.reload": valid = d.page === undefined || (Number.isInteger(d.page) && Number(d.page) >= 1 && Number(d.page) <= 10000); break;
    case "chats.readAll": valid = true; break;
    case "chat.send": valid = identifier(d.to) && text(d.text, 4000) && (d.inCall === undefined || boolean(d.inCall)) && (d.replyTo === undefined || identifier(d.replyTo)) && (d.clientId === undefined || voiceClientId(d.clientId)); break;
    case "chat.edit": valid = identifier(d.to) && identifier(d.id) && typeof d.text === "string" && d.text.length <= 4000; break;
    case "chat.delete": valid = identifier(d.to) && identifier(d.id) && boolean(d.everyone); break;
    case "chat.photo": valid = identifier(d.to) && photoData(d.photo) && (d.replyTo === undefined || identifier(d.replyTo)) && (d.clientId === undefined || voiceClientId(d.clientId)); break;
    case "chat.photoDownload": valid = identifier(d.to) && identifier(d.id) && Number.isSafeInteger(d.requestId) && Number(d.requestId) > 0 && Object.keys(d).every(key => ["to", "id", "requestId"].includes(key)); break;
    case "chat.photoViewer": valid = boolean(d.open) && Object.keys(d).every(key => key === "open"); break;
    case "chat.voice": valid = identifier(d.to) && audioData(d.audio) && Number.isInteger(d.durationMs) && Number(d.durationMs) >= 500 && Number(d.durationMs) <= 120000 && voiceClientId(d.clientId) && (d.replyTo === undefined || identifier(d.replyTo)) && Object.keys(d).every(key => ["to", "audio", "durationMs", "clientId", "replyTo"].includes(key)); break;
    case "gift.send": valid = identifier(d.to) && text(d.gift, 100) && giftAmount(d.coins) && boolean(d.inCall) && (d.streamId === undefined || identifier(d.streamId)) && (d.idempotencyKey === undefined || idempotency(d.idempotencyKey)); break;
    case "call.start": valid = identifier(d.to) && (d.voice === undefined || boolean(d.voice)); break;
    case "call.invitation.load": valid = Number.isSafeInteger(d.requestId) && Number(d.requestId) > 0 && (d.active === undefined || boolean(d.active)) && Object.keys(d).every(key => ["requestId", "active"].includes(key)); break;
    case "call.invitation.connect": valid = identifier(d.id) && Number.isSafeInteger(d.requestId) && Number(d.requestId) > 0 && giftAmount(d.expectedCoinsPerMinute) && Number(d.expectedCoinsPerMinute) <= 1_000_000 && giftAmount(d.expectedEntryFeeCoins) && Number(d.expectedEntryFeeCoins) <= 1_000_000 && Object.keys(d).every(key => ["id", "requestId", "expectedCoinsPerMinute", "expectedEntryFeeCoins"].includes(key)); break;
    case "call.invitation.dismiss": valid = identifier(d.id) && Number.isSafeInteger(d.requestId) && Number(d.requestId) > 0 && Object.keys(d).every(key => ["id", "requestId"].includes(key)); break;
    case "call.topup.hold": case "call.topup.review": valid = identifier(d.callId) && Number.isSafeInteger(d.requestId) && Number(d.requestId) > 0 && Object.keys(d).every(key => ["callId", "requestId"].includes(key)); break;
    case "call.accept": case "call.decline": case "verify.accept": case "verify.end": valid = identifier(d.callId); break;
    case "call.targets.load": valid = identifier(d.callId) && Object.keys(d).every(key => key === "callId"); break;
    case "call.targets.set": valid = identifier(d.callId) && (d.giftId === null || identifier(d.giftId)) &&
      Number.isInteger(d.giftCount) && Number(d.giftCount) >= 1 && Number(d.giftCount) <= 1000 &&
      Number.isInteger(d.giftProgress) && Number(d.giftProgress) >= 0 && Number(d.giftProgress) <= 1000000 &&
      Number.isInteger(d.goalCoins) && Number(d.goalCoins) >= 1 && Number(d.goalCoins) <= 1e9 && giftAmount(d.earnedCoins) &&
      Object.keys(d).every(key => ["callId", "giftId", "giftCount", "giftProgress", "goalCoins", "earnedCoins"].includes(key)); break;
    case "call.end": valid = (d.callId === undefined || identifier(d.callId)) && optionalText(d.reason, 300); break;
    case "payout.load": valid = Number.isSafeInteger(d.requestId) && Number(d.requestId) > 0 &&
      (d.page === undefined || (Number.isInteger(d.page) && Number(d.page) >= 1 && Number(d.page) <= 1000)) && Object.keys(d).every(key => ["page", "requestId"].includes(key)); break;
    case "payout.request": valid = Number.isSafeInteger(d.requestId) && Number(d.requestId) > 0 && Number.isSafeInteger(d.amountPaise) && Number(d.amountPaise) > 0 && Number(d.amountPaise) <= 100000000 &&
      typeof d.payoutAddress === "string" && d.payoutAddress.trim().length >= 3 && d.payoutAddress.length <= 200 && idempotency(d.idempotencyKey) &&
      Object.keys(d).every(key => ["amountPaise", "payoutAddress", "idempotencyKey", "requestId"].includes(key)); break;
    case "awards.claim": valid = identifier(d.task); break;
    case "ads.load": valid = Object.keys(d).length === 0; break;
    case "ads.impression": case "ads.click": valid = typeof d.id === "string" && /^[a-f\d]{24}$/i.test(d.id) &&
      ["home", "explore", "chats", "call_summary"].includes(String(d.placement)) && Object.keys(d).every(key => ["id", "placement"].includes(key)); break;
  }
  return valid ? message as WebMessage : null;
}

export function isTrustedDocument(url: string) {
  // Android's WebMessageListener reports sourceOrigin (no trailing slash).
  // iOS and Android's legacy bridge report the full document URL instead.
  // Accept both exact representations without allowing other hosts or paths.
  return url === "about:blank" || url === "https://aurora.localhost" || url === "https://aurora.localhost/";
}

/** Native links select an existing room; they never carry executable routes,
 * credentials, host authority, arbitrary URLs, or automatic camera consent. */
export function parseLiveLink(url: unknown): string | null {
  if (typeof url !== "string") return null;
  return /^binzolive:\/\/live\/([a-zA-Z0-9_-]{1,128})$/.exec(url)?.[1] ?? null;
}
