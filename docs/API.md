# BinzoLive app ↔ server

How the phone app talks to the server. The code is the source of truth:
`src/api/endpoints.ts` (requests), `src/api/types.ts` (shapes) and
`src/bridge.ts` (message types).

## Two builds of the same screens

| Build | Where | Demo events | Data |
| --- | --- | --- | --- |
| Preview | `dist/index.html` (website) | On: calls pick up by themselves, callers ring, gifts and chat replies arrive | Sample hosts, chats, balances |
| App | `assets/aurora-bundle.js` (inside the WebView) | Off | Starts empty, filled from the server |

`npm run build:web` writes both. `ZIMI_DEMO=1 npm run build:web` keeps the
demo in the app build too, for trying the app on a phone before the server
exists.

## How a request flows

```
screen (web/aurora-runtime.js)        app (src/bridge.ts)              server
Native.send("call.start", {to})  -->  api.startCall(to)           -->  POST /calls
                                                                  <--  { callId }
                                      live socket                 <--  { type: "call.connected", data: { callId } }
Native.on("call.connected")      <--  postToWeb(...)
```

The screens never call the server directly. The app adds the login token,
handles errors and forwards live events.

Phone OTP requests return `otpLength` (4–8) with `expiresIn` and `resendAfter`.
The native bridge forwards this as `auth.otpSent`; onboarding uses it for the
input count, SMS autofill, paste and validation. Six digits remain the fallback
for older servers that omit this field. The server enforces the exact configured
length and verifies the code with its SMS provider; provider credentials stay on
the backend.

Live-room queue messages are `stream.requests.load {streamId}`, `stream.request {streamId}`,
and `stream.request.cancel|decline|accept {streamId,id}` (where `id` is the queue entry ID).
The bridge returns `stream.requests {streamId,requests,ownRequestId,count}` and
`stream.request.updated {streamId,request}`, and reloads the active queue on socket
invalidation or reconnection. Only hosts receive other members' queue entries.
`stream.react {streamId}` returns/broadcasts `stream.reaction {id,streamId,userId,emoji}`;
the UI deduplicates HTTP and socket copies using `id`.

Accepting a queued request emits `stream.privateCall
{streamId,requestId,callId,peerId,initiator,voice:false,peer}` before `stream.ended`.
The screen stops public media, prepares camera/microphone, opens the private call
and starts ordinary WebRTC signaling. It must deduplicate the socket and HTTP
acceptance copies by call ID. No automatic `call.connected` event precedes that
media preparation.

## Call charges

Staff set the price in coins per minute in the admin dashboard (0 keeps calls free).
A call keeps the price it was placed at. The server bills whole seconds once the host
answers, `ceil(seconds × price / 60)` coins, charging every 10 seconds while the call
lasts, so `wallet.balance` drops as people talk. Starting or requesting a paid call
needs one minute of coins; otherwise the request fails with `INSUFFICIENT_COINS`
and the setup screen offers **Buy coins to call** instead. When the coins run out,
the server ends the call and `call.ended` carries `reason: "out_of_coins"`. The call
screen shows the price and a running cost (an estimate between charges); the summary
shows the server's charge when it arrives. New accounts can receive free welcome
coins, also set by staff.

## Setup

Copy `.env.example` to `.env` and set `EXPO_PUBLIC_API_URL`. The login token
is kept in the phone's secure storage (`expo-secure-store`) and sent as
`Authorization: Bearer <token>`. Errors are expected as
`{ "message": "..." }`; that text is shown to the user where there is a place
for it (login, call failed).

## Requests

| Action on screen | Request | Response |
| --- | --- | --- |
| Continue (phone number) | `POST /auth/otp/request` `{country_code, phone}` (the screen sends E.164 plus the chosen calling code; any country) | – |
| Enter the 6-digit code | `POST /auth/otp/verify` `{country_code, phone, otp}` | `Session` |
| Log out | `POST /auth/logout` | – |
| App opens with a saved login | `GET /me` | `Account` |
| Finish sign-up, edit profile | `PUT /me/profile` | – |
| Submit verification | `POST /me/verification` | `{status}` |
| Go online, offline, visible or hidden | `PUT /me/presence` `{online, visible}` | – |
| Show MVPs switch | `PUT /me/settings` | – |
| Home | `GET /home?mode=online&page=1` | Adapter returns `HomeData` with active hosts, live stage and pagination |
| Explore | `GET /home?mode=popular` or `mode=instant`, optional `category` and `page` | Adapter returns `HomeData` for the selected discovery filters |
| Chats | `GET /chats` | `{chats: ChatSummary[]}` |
| Open a chat | `GET /chats/:id` | Adapter returns `{messages: Message[], canSend, sendDisabledReason?}` |
| Missed calls tab | `GET /calls/missed` | `{calls: MissedCall[]}` |
| Call history | `GET /calls` | `{calls: CallRecord[]}` |
| Transactions | `GET /wallet/transactions` | `{items: Transaction[]}` |
| Start a call, call back | `POST /calls` `{to, voice}` | `{callId}` |
| Accept, decline, end a call | `POST /calls/:id/accept`, `/decline`, `/end` | – |
| Send a gift | `POST /gifts` `{to, gift, coins, callId?}` | `Wallet` |
| Send a message | `POST /chats/:id` `{text}` | The message as delivered (phone numbers and abusive words hidden) |
| Send a photo | `POST /media/upload-url` `{purpose: "chat"}`, PUT to storage, then `POST /chats/:id` `{imageKey, replyTo?}` | The message, including any reply quote |
| Download a chat photo | `GET /chats/:id/messages/:messageId/photo` | Current authorized `{url}`; native download validates the image and saves it to the gallery |
| Send a voice message | `POST /media/upload-url` `{purpose: "chat-audio"}`, PUT to storage, then `POST /chats/:id` `{audioKey, durationMs, clientId, replyTo?}` | A voice message with audio URL, duration and optional reply |
| Reply to a message | `POST /chats/:id` `{text, replyTo}` (or `{imageKey, replyTo}`) | The message, with a `reply` quote |
| Edit your message | `PATCH /chats/:id/messages/:messageId` `{text}` | The edited message (filtered again) |
| Delete a message | `DELETE /chats/:id/messages/:messageId?for=everyone` (your own) or `?for=me` (any) | The deleted placeholder, or `{_id}` |
| Follow | `PUT /follows/:id` `{on}` | – |
| Payment methods | `GET /payments/routes` | `{mode,routeChoice,routes:[{route,pageStyle,upiIntent,takingPayments,currency}]}`; available INR routes only |
| Buy a coin pack | `POST /coins/purchase` `{packId, idempotencyKey, route?}`, opens the PayPlus page; `POST /coins/purchase/verify` `{merchantOrderId}` when the app returns | `Purchase` |
| Unlock lifetime premium | `POST /themes/premium/purchase` `{idempotencyKey, route?}`; `POST /themes/premium/verify` `{merchantOrderId}` | `Purchase` with `kind: "premium"` |
| Request a withdrawal | `POST /wallet/withdraw` `{amountPaise, payoutAddress, idempotencyKey}` | A withdrawal record; reserves INR earnings pending admin review |
| Withdrawal history | `GET /wallet/withdrawals?page=1&limit=20` | `{items,total,page,limit}` with pending, approved, paid, or rejected records |
| Receive an award | `POST /awards/:task/claim` | `Wallet` |
| Sponsored cards (free plan) | `GET /ads` | `{adFree, items: AdCreative[]}`; premium members get `{adFree: true, items: []}` |
| An ad has been at least half visible for 1 s (2 s for video) | `POST /ads/:id/impression` `{placement}` | `{counted, servable}`; `servable: false` takes it out of rotation |
| Tap an ad | `POST /ads/:id/click` `{placement}` | `{counted, url}`; native opens the HTTPS `url` outside the app |

Withdrawal availability and the minimum come from `GET /wallet` as
`withdrawalsEnabled` and `minimumWithdrawalPaise`. Only admin-approved hosts can
request withdrawals. Spendable coins are not withdrawable earnings. The WebView
uses `payout.load` / `payout.request` with request IDs; native returns correlated
`payout.loaded`, `payout.requested`, or `payout.error`. Retrying an uncertain request
keeps its original idempotency key. A successful reservation remains confirmed
even if the independent wallet refresh fails. Actual transfers and payment
references are recorded by the admin after manual processing.

In a conversation, swipe left on your own message or right on the other person's message,
or hold either message and choose **Reply**.
The composer shows the selected original; cancelling keeps the typed draft. Text
and photo replies carry `replyTo`, and the send confirmation supplies the current
server quote (or explicit `null`). The quote appears above the answer as a keyboard
accessible button that jumps to the original when it is loaded. Edits update visible
quotes; deletion for everyone replaces them with “Deleted message”. Deleting only
your copy preserves existing quotes but prevents starting a new reply to that message.

Chat eligibility uses `user.serverRole` from the authenticated account, separately
from the `sender`/`host` presentation role. Members message approved hosts; approved
hosts reply to existing member conversations. An automated welcome does not permit
a manual host reply until the member responds. Inbox and thread `canSend` flags
come from the server; a failed or pending thread read disables sends while retaining
the draft. The native bridge also rejects known invalid pairs and verifies thread
permission before a send that has no previously loaded conversation.

## Live events (socket)

One Socket.IO connection per signed-in user uses `EXPO_PUBLIC_SOCKET_URL`.
The native client supplies its token in the authentication handshake and
adapts server events into `{ "type": ..., "data": {...} }` for the screens.

The native client sends `app:activity` with `{active: boolean}` on every
connection and foreground/background transition. Welcome scheduling stays
inactive during onboarding and while the app is in the background. Offline
transitions are remembered locally; reconnect sends only the latest state.
The server persists configured host welcomes as normal chat messages with
`automated: true`, which remains labeled in the inbox and conversation history.

| Event | Data | What the screen does |
| --- | --- | --- |
| `call.incoming` | `{callId, from: Person}` | Full-screen ring, or a banner during a call |
| `call.connected` | `{callId, rate?}` | Caller moves from "Calling…" into the call; `rate` is the coins per minute of a paid call |
| `call.ended` | `{callId, coins?, reason?}` | Call ends and the summary opens with the coins charged; a ringing call becomes a missed call |
| `gift.received` | `{gift, coins, from}` | Gift animation and earnings on the host's call screen |
| `chat.message` | `{from, name, text, inCall?, automated?}` | Adds to the call chat or the open chat; automated welcomes are labeled |
| `wallet.balance` | `{coins?, earned?}` | Updates balances everywhere |
| `verification.status` | `{status}` | Moves the verification screen on |

## Hidden chat text

The server replaces phone numbers and abusive words in private, in-call and live chat
with `█` characters before saving or delivering a message (`backend/src/lib/moderation.ts`).
The screens draw every run of `█` as a blur that cannot be selected or copied
(`escChat` in `web/aurora-runtime.js`). When something was hidden from a message the
user just sent, the app posts `chat.sent {to, sent, text, inCall}` so the sender's bubble
shows what was delivered, with a short notice.

Photos members send (`chat.photo {to, photo}`, a resized JPEG from the photo picker) reach creators
blurred with **Tap to view**.

Hold a sent message to open **Reply**, **Edit** (your own text), **Delete for everyone**
(your own) and **Delete for me** (either person's). A regular tap leaves the message alone;
keyboard and assistive-technology activation can also open the menu. Swipe left on your own
message or right on the other person's message to reply, including from its quoted preview.
The reply indicator appears on the side revealed by the swipe. Touches near an edge need
less travel so the gesture stays inside the screen. A simple tap on a quote still jumps to its original.
The screens post `chat.send {replyTo}`, `chat.edit {to, id, text}`
and `chat.delete {to, id, everyone}`; the app answers with `chat.updated {with, message}` or `chat.removed {id}`,
and the socket events `chat:message-updated` and `chat:message-hidden` keep both people and other devices in step.
Every sent message gets its server ID back in `chat.sent` / `chat.photoSent` / `chat.voiceSent`, so it has options straight away.
The **+** button holds **Photo** and **Emoji**. Each photo stays blurred until the creator taps it, and blurs again the
next time the conversation is opened. Members see photos creators send, and their own, normally.

Tap a revealed photo to open the full-screen viewer. Pinch, double-tap or use the
zoom buttons to magnify it up to 4×; drag to pan and Reset to fit. Escape, Close
and Android Back return to the conversation. Hold and swipe still act on the
message, and the photo's options button offers keyboard access to its reply/delete menu.
Incoming blurred photos must first be revealed. The viewer closes when the photo
is deleted/hidden, the conversation changes, or the session ends.

Download sends `chat.photoDownload {to, id, requestId}` without a client-supplied URL.
The native shell resolves the photo through the server, requests save permission
on this explicit action where the OS requires it (iOS add-only; Android 11+ saves
its own MediaStore entries without a permission prompt), validates a bounded JPEG/PNG/WebP download,
rechecks access and awaits the gallery write. `chat.photoDownloaded` or a correlated
`operation.error` finishes the UI; temporary files are cleaned up. Pending uploads
can be viewed, with download enabled once their server ID arrives. The native
binary must include `expo-file-system` and `expo-media-library`, and the backend
photo resolver must be released before production downloads are enabled.

The empty composer shows **Record voice message**; typing changes it to **Send message**.
`web/chat-voice.js` records only after a tap, then offers Stop, Play, Cancel and Send.
Clips are limited to two minutes and 5 MiB. The screen sends
`chat.voice {to, audio, durationMs, clientId, replyTo?}` with a recording data URL;
the native adapter validates and uploads it with canonical `audio/webm`, `audio/mp4`
or `audio/ogg`. It replies with `chat.voiceSent {to, clientId, message}` or a correlated
`operation.error`. Failed sends retain the recording, upload key and original reply
for an idempotent retry. History and acknowledgements merge into one message.
Voice messages support playback, swipe/hold Reply and Delete; Edit is for text.
Leaving the thread, signing out, or backgrounding the app stops capture and playback.
The native `app.background` event also covers app switches before WebView visibility updates.
Release the backend voice/upload routes before the app that uses them.

## Private screens

Screenshots and screen recordings are blocked while a video or voice call, a staff
verification call, the chat list or a conversation is open. After every render the
screens send `screen.secure {on}` when this changes (and once on load), and
`App.tsx` turns `expo-screen-capture` on or off. On Android the screen shows black
in screenshots, recordings and the recent-apps view; iOS 13+ blocks screenshots
and recordings. Other screens, including public live rooms, can still be captured.
A camera pointed at the phone can still record the screen.

## Staff verification calls (host applicants)

Before approving a host application, staff video-call the applicant from the admin
dashboard. The server refuses to approve a pending application until a call has
connected for at least 10 seconds.

| Step | Server | App |
| --- | --- | --- |
| Staff start the call | socket `verification:call` `{_id, status: "ringing"}` (replayed on reconnect) | `verify.incoming {callId}` opens `web/verification-call.js` |
| Applicant answers | `POST /verification-calls/:id/accept` | camera and mic start first; then `verify.connected {callId, peerId: "zimi-team"}` starts the `media.js` call session |
| Staff offer and candidates | socket `verification:signal` | arrive as `rtc.signal` from `zimi-team` |
| Applicant answer and candidates | `POST /verification-calls/:id/signal` | the bridge routes this call's `rtc.signal` there, not to the socket |
| Decline or hang up | `POST /verification-calls/:id/end` | `verify.end {callId}` |
| Ended, missed or answered elsewhere | socket `verification:call` `{status}` | `verify.ended {callId, status}` closes the overlay |

These never use the member-call messages (`call.*`), so host-access rules for
member calls do not apply to an applicant answering staff.

## Payment methods and recovery

The backend discovers methods through [PayPlus's v2 routes API](https://new.payplus.live/docs/api-reference#payment-routes).
`mode` is `SINGLE` or `ROTATION`; omitting `route` always leaves routing to PayPlus.
Manual selection is permitted only when `routeChoice` is true, in either mode.
The backend validates new selections against the current available INR routes.
Neither clients nor provider callbacks set the catalog price or number of coins.

The WebView requests `payments.routes.load {requestId}` and receives a correlated
`payments.routes` response or `operation.error`. Request state drives the selector's
skeleton and retry control. Route discovery failure leaves Automatic checkout
available; it does not imply payment creation will succeed.

`wallet.checkout` and `themes.premium.checkout` accept the optional `route`.
The backend snapshots it as `requestedRoute`, separately from the actual provider
`route` and `pageStyle`. Retries reuse the same idempotency key, price, and original
selection. Automatic retries continue to omit `route`, even after PayPlus reports
the actual route used. Pending native storage preserves the selection across restart.
Changing a pending purchase's route returns `PAYMENT_ROUTE_CONFLICT`; the app never
silently creates a replacement or falls back to another method.

`PAYMENT_ROUTE_CHOICE_DISABLED` and `PAYMENT_ROUTE_UNAVAILABLE` are pre-creation
rejections, so the app may refresh methods and start a new attempt. Provider timeouts
and ambiguous errors retain the existing attempt. Coins or premium are delivered
only after authenticated server verification or a raw-body HMAC-verified webhook,
with matching purchase details and atomic, duplicate-safe ledger updates.
Payment pages open outside the privileged application WebView. Returning to the app
triggers verification; browser return parameters never grant a balance or entitlement.

Backend configuration requires an approved PayPlus app, server-only API key and
webhook secret, approved HTTPS return URL, registered webhook, and an allowed server
outbound IP. `IP_NOT_ALLOWED` requires updating the merchant's permitted IPs before
real-provider validation can pass. Automated tests use provider fixtures and isolated
databases; they never create live payments.

## Sponsored ads

Staff run campaigns that promote our other apps from the admin dashboard
(**Engagement → Ad campaigns**): a banner image or MP4 video, copy, a link,
placements, audience, schedule, rotation weight, a daily cap per member and
optional impression or click budgets.

- Only members on the free plan see ads. Premium (`Purchase.kind = "premium"`)
  removes them everywhere: the server returns `adFree: true`, never counts their
  events, and the screens also hide ads as soon as `data.themes` reports premium.
- Placements: `home` (between the featured host and trending hosts, once the
  feed has loaded), `explore` (above the creator grid), `chats` (a compact banner
  above conversations) and `call_summary` (below the summary actions). Never in a
  call, live room or conversation.
- Each screen visit shows the next eligible campaign for that placement; redraws
  keep the same card, and a video keeps playing because its element is moved
  rather than recreated. Video is muted, loops, always offers pause and sound
  controls, plays only while half visible, and never autoplays with reduced motion.
- The feed never contains destinations. A tap sends `ads.click`; native calls
  `POST /ads/:id/click`, which counts the click and returns the link, then opens it
  with `Linking.openURL`. The server counts at most one view per member every
  30 seconds and treats repeated taps within 2 seconds as one click.
- Bridge: `ads.load`, `ads.impression {id, placement}` and `ads.click {id, placement}`
  from the screens; `data.ads`, `ads.opened {id}` and `ads.retired {id}` back. Loading
  and view failures are silent; a failed tap reports `operation.error` with
  `action: "ads.click"` and the ad `id`.
- Socket: `ads:updated` (any campaign change) and `premium:updated` refresh the
  list; their payloads are ignored.
- Each card is labelled “Sponsored” and has an **About this ad** dialog that names
  the advertiser and destination and links to Premium.

## Not covered yet

- Incoming calls while the app is closed: needs push notifications and the
  Android incoming-call screen in the React Native shell.
- Coin purchases use PayPlus checkout. Coins are credited only by the server,
  after `POST /coins/purchase/verify` or the signed PayPlus webhook. Google
  Play's payments policy may require Play Billing (or its alternative billing
  programme) for coins sold inside the Android app; check before release.
- Google sign-in: shows "isn't available yet".
- Your own level and crown come from `GET /account/settings` as `standing`
  (`{level, crown}`; thresholds, crown amount and window are set in the admin
  dashboard). The crown is held while gifts sent in the window reach the
  amount and drops by itself when they no longer do. Other people's lifetime coins,
  levels and top supporters on host pages are still sample formulas.
