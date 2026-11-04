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

## Host user directory

An approved host's Home header has Members and Active Hosts tabs. Members shows
member users with name or public user ID search, Chat, Voice and Video actions.
Active Hosts shows connected approved hosts with public profiles and Chat actions.
Members keep their creator feeds. The directory
includes offline members; it excludes inactive, undiscoverable and blocked
accounts. Member online indicators respect activity privacy.

`users.load {q,page}` calls
`GET /users/search?audience=members&q=...&page=...&limit=20` and returns
`data.users {users,total,page,limit,q}`. Search is debounced; MongoDB filters and
paginates before loading public identities and page-scoped presence. The native
bridge checks current host approval and discards responses/errors after a newer
query, account, document or approval change. These member identities retain
`serverRole:user`; they never gain creator badges or forced online presence.

Opening a discovered member profile no longer requires an earlier follow or
conversation. Calls and messages continue through the existing server approval,
block and billing checks. Roll out the compatible backend before distributing
the app bundle that uses the member directory. `npm run test:host-users` covers
the UI, message boundary and API contract.

`hosts.active.load {q,page}` calls `GET /home?mode=active&q=...&page=...&limit=20`
and returns `data.activeHosts {hosts,total,page,limit,q}`. Search is limited to
80 characters and pages to 1,000. The backend requires current approved host
access and filters connected, verified, discoverable hosts who have not chosen
Go Offline before pagination. Activity privacy, blocks and self exclusion apply;
busy hosts remain viewable without granting host-to-host calls. Legacy `online`
feeds retain their saved availability behavior. Each tab preserves its own query
and pages; Active Hosts refreshes on returning after 30 seconds, foregrounding
or pull to refresh, without polling or repainting the other tab's input.

## Conversation ordering and engagement

Message history and realtime delivery use the conversation's positive server
`sequence`. Legacy messages sort first by `createdAt` then ID; sequenced messages
follow in sequence order. The UI merges by server ID and the sender's `clientId`,
so delayed welcomes, duplicate socket delivery and history fetched before a send
response cannot replace or duplicate a newer human conversation. Send receipts
carry server time and sequence. Pending messages retain distinct local UUIDs;
text/photo acknowledgments and failures match that UUID. Photo retries reuse the
original uploaded storage key for that account and send attempt.

Background reads preserve the visible thread, composer, selection and scroll
anchor. They include up to 200 known server message IDs in `knownIds`; the server
returns conversation-scoped `hiddenIds` to reconcile delete-for-me events missed
while offline. Reconnection and foregrounding re-read the active thread. Older
pagination is retained, while explicit deletions and edit/read state are merged.

`chat.activity {with,active}` reaches `POST /chats/activity`. Opening a thread
activates its authenticated device-session lease before the history request;
foreground reading, typing and voice drafts renew every 15 seconds. Leaving,
backgrounding or replacing the WebView releases it. Native requests serialize
and coalesce so an earlier close cannot override a newer open. Lease failures
remain unobtrusive and the server expires an unrenewed lease after 45 seconds.
The backend separately suppresses scheduled welcomes during engagement and
permanently stops them for a pair once either participant sends a human message.

Gift catalog `coins: 0` means **Free**; paid gifts retain positive server prices.
The picker, quick gifts, receipts and host targets show Free. Sending still
requires explicit confirmation and an idempotency key, but zero-priced gifts
do not require wallet readiness or create spending, earnings or commission.
Catalog pricing remains server-owned; client-supplied zero never discounts a
paid gift. Historical receipts preserve the original zero cost after price edits.

Direct gifts use persisted `Message.kind = "gift"` receipts. `Message.gift`
contains the server's immutable `{giftId,transferId,name,emoji,mediaUrl,coins,quantity}`
snapshot; its name and total coin cost do not depend on later catalog edits.
History, incoming `chat.message` and sender `chat.updated` echoes carry the same
message ID. `gift.sent.message` supplies that canonical receipt when the HTTP
confirmation wins the socket race; replaying an idempotency key keeps its ID.
Historical backfills may use `orderAfterSequence` to retain their original place.
Gift artwork uses the uploaded animation directly in the chat quick row, full
picker, persistent receipts, call feedback and host gift targets. Transparent
GIF/WebP/SVG assets receive no added background, badge, glow, filter or effect.
When a direct gift is confirmed in the open chat, its original animation also
plays once at the center of the visible history. A separate non-interactive
portal survives chat redraws without changing input, focus, scrolling or message
order. Confirmed gifts queue by transfer identity and never overlap; history
loads do not replay them. Leaving the chat, backgrounding or signing out clears
pending playback. Timing starts after the artwork loads and uses the saved
animation duration, with a finite fallback for older gifts without timing.
Playback caches the original file bytes and uses a fresh, revoked-after-playback
Blob URL for each transfer so a WebP already looping in the picker starts from
its first frame. Public media GET CORS should allow the app's origin (or `*` with
omitted credentials) to share that cache. Without CORS, unsigned public artwork
uses a fresh image resource URL; existing signed query parameters stay intact.
The admin uploader converts numbered WebP/PNG frame ZIPs into looping transparent
WebP (30 FPS by default, configurable from 1 to 60). Matching a bundled gift name
never replaces an uploaded file; bundled animations only fill missing media.

Transient `gift.received` notifications remain animation events, and never create
another receipt. Stream gifts return `message: null`. Paid transfers re-read
authoritative wallet balances; free gifts need no wallet request.

Gift animation timing is optional server metadata: catalog `media.durationMs`
becomes `Gift.durationMs`; historical receipts retain `Message.gift.durationMs`.
`gift.sent.giftDetails` carries the original transfer artwork and timing for both
direct and stream gifts, while `gift.received.durationMs` preserves incoming
notification timing. No duration is invented for older records, and invalid or
fractional values are omitted. This is separate from a voice message's top-level
`Message.durationMs`. Playback can show one complete animation cycle after the
image loads, using the original transparent artwork without added effects.

## Agency host onboarding

All new host applicants join an admin-created agency with their own one-time
host joining code before applying. The short agency ID (`BINZO` + six characters)
identifies an agency; the personal joining code (`BINZO` + ten characters) is
issued by that agency for one host. Common agency IDs and referral codes cannot
create membership. Settings
and the owner's Profile open **Become a Host** (`agency`); approved hosts see
**My agency**. Creator signup and every creator application entry point use the
same gate. Existing approved host access continues to use `ZimiHostAccess`.

| Screen message | Endpoint | Result message |
| --- | --- | --- |
| `agency.load {requestId}` | `GET /hosts/agency` | `agency.loaded` |
| `agency.verify {agencyCode,requestId}` | `POST /hosts/verify-agency-code` | `agency.verified` |
| `agency.join {agencyCode,requestId}` | `POST /hosts/activate` | `agency.joined` |

Responses contain `agency` (null or `{id,name,recruitmentCode,status}`),
`hostStatus`, `isVerifiedHost`, `eligible`, `requirements` and `nextStep`
(`agency`, `application`, `review`, `active`). Optional `joiningCode` is the
personal invitation code (null for legacy membership); it is displayed separately
from `agency.recruitmentCode`, the public short agency ID. Verification also
returns `codeType` (`host-invite` or `agency`) and `canJoin`. The app enables
confirmation only for an eligible `host-invite` with `canJoin: true` whose
`joiningCode` matches the exact code that was verified. Result messages also carry
`requestId`; stale responses are ignored. Failures use `agency.error`
`{action,message,requestId}` and stay next to the form. Codes are normalized to
uppercase. Verification previews identity without consuming an invitation. The
explicit join atomically claims it for the authenticated backend identity;
repeating that same claim for the same member is safe. A code already claimed
by another member or revoked by the agency cannot be used. Editing a previewed
code invalidates confirmation. The wire field remains `agencyCode` for both
requests, and always carries the entered invitation, never a substituted public ID.

Joining does not grant creator capability. The linked member completes
`POST /hosts/application` using established membership and no code, then staff
identity/video verification and approval. Existing joined and approved hosts do
not need a fresh invitation to continue their application or use host capabilities.
The server validates age, account status, phone verification, agency activity,
host capacity and one-agency membership. A referral reward code is separate.
Agency commission is paid from the platform share without reducing host earnings.
The app has no agency self-registration or agency login; administrators create,
manage and settle agencies in the production admin dashboard.

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

Automatic call suggestions are separate from incoming calls. Once an onboarded
member is foreground, connected and idle on Home, `call.invitation.load
{requestId}` requests `POST /calls/automatic-invitation {}`. It returns a pending
invitation or `null`; the latter is quiet. Suggestions name a real online,
available admin-created host and display **Automatic call invitation**. They
never ring, capture media, create a Call or charge coins before explicit Connect.
Leaving Home, an actual incoming call, backgrounding or account changes retires
the optional display. Dismiss uses `POST /calls/automatic-invitation/:id/dismiss`;
the per-account mute preference stores only a boolean on this device.

`call.invitation.connect {id,requestId,expectedCoinsPerMinute,expectedEntryFeeCoins}`
uses `POST /calls/automatic-invitation/:id/connect` with the exact displayed quote,
each component an integer from 0 through 1,000,000. It never falls back to ordinary
`POST /calls`. The server rechecks presence, availability, permissions and price;
`CALL_PRICE_CHANGED` requires a fresh `GET /calls/automatic-invitation/active`
review and another explicit Connect. Replays use the same real Call; an ended
replay cannot reopen media. Immutable `source: "automatic"` and
`automaticInvitationId` remain visible through ringing and the connected call.

An insufficient balance opens the existing coin checkout with invitation context.
Verified payment or wallet updates never connect or accept a call. The member
returns to review current host availability, quote and balance, then chooses
Connect themselves.

For a genuine host-initiated incoming call, `call.topup.hold {callId,requestId}`
requests `POST /calls/:id/topup-hold {}` before opening Coins. A valid server
acknowledgement provides one non-extending hold of at most five minutes.
`call.topup.waiting {callId,until}` tells the real caller that the member is adding
coins; duplicate ringing updates preserve checkout. A `TOPUP_NOT_REQUIRED`
refusal refreshes a stale wallet and leaves the member to choose Accept.
`call.topup.review` fetches `GET /calls/:id` and the wallet before returning to the
incoming screen. Host cancellation or expiry wins over late callbacks, and the
member must still explicitly Accept. No hold failure declines or answers a call.

Members can manually ring any active, approved host, including admin-created
profiles before their first OTP sign-in, regardless of presence or the host's
request toggle. The host must sign in before answering. Blocks, approval and
the caller's active-call reservation still apply; automatic matching retains
its availability checks.

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

After a hangup commits, the backend sends the terminal call event to both
participants before entry-fee/commission reconciliation. The native bridge
also reads authenticated `GET /calls/:id` every five seconds while a call is
active, and immediately on reconnect or returning to the foreground. A confirmed
terminal status uses the same `call.ended` cleanup for visible and minimized
calls. Network/read failures preserve the call; stale responses from another
call, account or document cannot close the current call. An exhausted local
media connection ends its own call UI and stops capture even if its server
event is lost.

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
| Deactivate account | `POST /account/deactivate` `{confirmed: true}` | `{deactivated: true}`; ends calls and revokes all sessions. A newly verified OTP reactivates the same account and preserves its wallet and posts. |
| Your followers / following | `GET /users/:selfId/followers?page=1&limit=20` or `/following` | Paginated relationships with a public `user`, `total`, `page`, `limit`. Inactive, deleted and blocked peers are excluded before pagination. Only `canViewProfile` peers open a profile; list membership grants no extra access. |
| Share a profile photo post | `POST /media/upload-url` `{purpose: "post", contentType, contentLength}`, PUT to storage, then `POST /posts` `{mediaKey, kind: "photo", caption}` | A confirmed post; available to verified members and approved hosts. Video posts still require approved host access. |
| Delete your post | `DELETE /posts/:id` | The deleted post. Only its owner may delete it; repeated deletion is safe. |
| Set creator card image in call setup | Upload with `purpose: "creator-card"`, then `PATCH /profile` `{creatorCardKey}` | Saved separately as `creatorCardUrl` for discovery cards. Profile `coverUrl` and cover drafts stay unchanged; the setup stays open. |
| Change cover on your Profile | `profile.cover.save` uploads with `purpose: "cover"`, then `PATCH /profile` `{coverKey}` and fresh `GET /auth/me` | Members and hosts preview and confirm the change without opening Edit Profile. Dedicated success/error events preserve other profile drafts and keep failed uploads available for retry. |
| App opens with a saved login | `GET /me` | `Account` |
| Finish sign-up, edit profile | `PUT /me/profile` | – |
| Submit verification | `POST /me/verification` | `{status}` |
| Go online or offline | `PATCH /safety` `{onlineForCalls, allowRequests, showActivity, discoverable}` | Saved safety flags; `onlineForCalls` persists through backgrounding and socket loss |
| Show MVPs switch | `PUT /me/settings` | – |
| Home header feeds | `GET /home?mode=following\|popular\|foryou\|new&page=1`, optional `country` (the India chip sends `country=India`) | Adapter returns `HomeData`. Following lists saved follows, Explore (`popular`) every host, For You the hosts not followed yet, New the latest hosts first; `country` matches the host's country (ignoring case) before pagination |
| Other discovery filters | `GET /home?mode=online` or `mode=instant`, optional `category` and `page` | Adapter returns `HomeData` for the selected discovery filters |
| Refer a Friend (Settings, Home pop-up, call card) | `GET /referrals/me`, `POST /referrals/apply` `{code}` | `referral.load` → `data.referral` `{code, shareUrl, rewardCoins, friendBonusCoins, applyDays, friendsJoined, friendsRewarded, coinsEarned, appliedCode, canApplyCode}`; `referral.apply {code, requestId}` → `referral.applied` (same summary + `requestId`, then a wallet refresh) or `referral.error {message, requestId, status}`; `referral.share` opens the native share sheet with the code and link |
| Leaderboard (Home trophy) | `GET /leaderboard/creators?period=daily\|weekly\|all&limit=50` | `leaderboard.load` `{period}` → `data.leaderboard` `{period, items: {id, name, avatarUrl, coins, rank}[], total}`: approved creators ranked by gift coins received |
| Chats | `GET /chats` | `{chats: ChatSummary[]}` |
| Open a chat | `GET /chats/:id` | Adapter returns `{messages: Message[], canSend, sendDisabledReason?}` |
| Missed calls tab | `GET /calls/missed` | `{calls: MissedCall[]}` |
| Call history | `GET /calls` | `{calls: CallRecord[]}` |
| Transactions | `GET /wallet/transactions` | `{items: Transaction[]}` |
| Start a call, call back | `POST /calls` `{to, voice}` | `{callId}`; approved hosts may also call members, by voice or video, at any time |
| Accept, decline, end a call | `POST /calls/:id/accept`, `/decline`, `/end` | – |
| Send a gift | `POST /gifts` `{to, gift, coins, callId?}` | `Wallet` |
| Send a message | `POST /chats/:id` `{text}` | The message as delivered (phone numbers and abusive words hidden) |
| Send a photo | `POST /media/upload-url` `{purpose: "chat"}`, PUT to storage, then `POST /chats/:id` `{imageKey, replyTo?}` | The message, including any reply quote |
| Download a chat photo | `GET /chats/:id/messages/:messageId/photo` | Current authorized `{url}`; native download validates the image and saves it to the gallery |
| Send a voice message | `POST /media/upload-url` `{purpose: "chat-audio"}`, PUT to storage, then `POST /chats/:id` `{audioKey, durationMs, clientId, replyTo?}` | A voice message with audio URL, duration and optional reply |
| Reply to a message | `POST /chats/:id` `{text, replyTo}` (or `{imageKey, replyTo}`) | The message, with a `reply` quote |
| Edit your message | `PATCH /chats/:id/messages/:messageId` `{text}` | The edited message (filtered again) |
| Delete a message | `DELETE /chats/:id/messages/:messageId?for=everyone` (your own) or `?for=me` (any) | The deleted placeholder, or `{_id}` |
| Follow | `POST /users/:id/follow` `{following}` | `{following}`; members follow hosts, hosts follow members back |
| A profile's posts | `GET /users/:id/posts?page=1` | `{items, total, page, limit}`; each post has `likes`, `comments` and the viewer's `liked` |
| Like a post | `POST /posts/:id/like` `{liked}` | `{liked, likes}` |
| Post comments | `GET /posts/:id/comments?page=1`, `POST /posts/:id/comments` `{text}` | Newest first, with the author; text is moderated like chat |
| Delete a comment | `DELETE /posts/:id/comments/:commentId` (its author or the post owner) | `{_id}` |
| Payment methods | `GET /payments/routes` | `{mode,routeChoice,routes:[{route,pageStyle,upiIntent,takingPayments,currency}]}`; available INR routes only |
| Buy a coin pack | `POST /coins/purchase` `{packId, idempotencyKey, route?}`, opens the PayPlus page; `POST /coins/purchase/verify` `{merchantOrderId}` when the app returns | `Purchase` |
| Unlock lifetime premium | `POST /themes/premium/purchase` `{idempotencyKey, route?}`; `POST /themes/premium/verify` `{merchantOrderId}` | `Purchase` with `kind: "premium"` |
| Request a withdrawal | `POST /wallet/withdraw` `{amountPaise, payoutAddress, idempotencyKey}` | A withdrawal record; reserves INR earnings pending admin review |
| Withdrawal history | `GET /wallet/withdrawals?page=1&limit=20` | `{items,total,page,limit}` with pending, approved, paid, or rejected records |
| Host diamond statistics | `GET /wallet/diamond-statistics?period=daily\|weekly\|monthly&date=YYYY-MM-DD` | Own approved-host earnings only; IST period bounds, `diamondScale`, `totalDiamondUnits`, and contiguous zero-filled `buckets` with `startAt`, `endAt`, `label`, `diamondUnits` |
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

Host diamond balances and rules live under **Payments > Withdraw**. Currency uses
the authenticated server role: every host state, including pending or suspended,
shows Diamonds in Settings, Profile and Wallet. Only approved hosts can withdraw
or use creator tools. Members keep their spendable Coin balance and Add coins
action, without host withdrawal controls. `GET /wallet` supplies optional
`currency: "coins" | "diamonds"`; legacy balance fields remain for compatibility.
Coin checkout revalidates the current account in native and on the server before
creating an order. Existing owned payments can still be verified or refunded after
a role change. New Coin referral rewards are member-only, and legacy host Coin
missions no longer grant rewards. Host Diamond rewards keep the configured
policy. Transaction `diamondUnits` is signed
and uses `diamondScale: 1000000`; historical Coin receipts retain their currency
instead of an invented conversion. Host call summaries link to the confirmed
Diamond wallet rather than treating member-billed Coins as host earnings.

**Account > Statistics** opens three earned
diamond bar graphs: Daily shows 24 hourly buckets, Weekly shows Monday-Sunday,
and Monthly shows each calendar date. Previous/next controls browse history.
All boundaries use IST. Withdrawals and penalties do not reduce gross earned
totals; task rewards remain in Withdraw and do not enter these graphs.

The WebView sends `diamonds.statistics.load {period,date?,requestId}`. Native
revalidates host approval, requests server data, validates bucket precision and
totals, and emits `diamonds.statistics.loaded` (the response plus `requestId`) or
`diamonds.statistics.error {period,date?,requestId,message}`. Older requests,
documents and account sessions cannot replace the latest chart. Old call receipts
without timing snapshots use their recorded receipt date and set
`historicalTiming: true`; current calls are attributed across their paid seconds.

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

Staff run campaigns that promote our events and other apps from the admin
dashboard (**Engagement → Ad campaigns**): a wide campaign banner, a banner image
or an MP4 video, copy, a link, placements, audience, schedule, rotation weight, a
daily cap per member and optional impression or click budgets.

- Only members on the free plan see ads. Premium (`Purchase.kind = "premium"`)
  removes them everywhere: the server returns `adFree: true`, never counts their
  events, and the screens also hide ads as soon as `data.themes` reports premium.
- Formats: `campaign` is a wide 11:3 image (about 1100 × 300) with the campaign's
  text drawn in; it is shown on its own, with a small "Ad" label and position dots,
  and rotates with the other live campaign banners (up to 8 per placement, on top
  of the 3 cards). It may use only the `home` and `explore` placements, and the
  server refuses a video or any other placement. `banner` (16:9 image) and `video`
  (MP4) are sponsored cards with copy and a button.
- Placements: `home` (inside the Home host grid: campaign banners after the
  first four hosts, cards after ten, both below a shorter grid), `explore` (the
  All Creators grid, placed the same way), `chats` (a compact banner above
  conversations) and `call_summary` (below the summary actions). Never in a call,
  live room or conversation.
- Each screen visit shows the next eligible card for that placement and starts the
  campaign banners at the first slide; every banner slide counts its own view once
  it has been half visible for a second. Redraws keep the same card and slide, and a video keeps playing because its element is moved
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

## Registration device access

After the server confirms profile completion, Android registration offers a
device-access screen for camera, microphone and notifications. Only its explicit
Allow access action opens system prompts. Continue/Not now completes setup with
any permission choice. A pending per-account marker resumes interrupted setup;
completed returning accounts have no automatic permission dialog. Photo uploads
use the system picker, with camera access requested when taking a photo.

The WebView sends `permissions.load`, `permissions.request`, or
`permissions.settings` with a positive `requestId`. Native replies with
`permissions.status: {requestId, permissions: {camera, microphone, notifications}}`
or `permissions.error: {requestId, message}`. Statuses are `granted`, `denied`,
`blocked`, and `unavailable`. Settings opens only from an explicit recovery
action. `permissions.cancel: {requestId}` retires later dialogs when setup is
skipped or closed. Responses and queued requests retire with their account or
WebView document. Camera/microphone and notification prompts share one native
queue; checking or requesting access never starts a camera or audio recording.

OS notification permission and FCM registration are separate states. A granted
permission triggers silent device registration. Login and session restoration
also register silently; the existing inbox Enable action can explicitly ask or
open Settings. Native upfront permission setup currently supports Android;
unsupported platforms report unavailable.

## Push notifications

Android uses native FCM device tokens registered through authenticated
`POST /notifications/devices`; registrations belong to the current login session.
Logout clears the tray and retires the device registration. The backend also
checks that the session is still valid before sending.

Calls, messages, post likes/comments, received gifts and published app updates
produce durable notifications. Senders can receive alerts when followed approved
creators go online for private calls. Streaming remains disabled. Approved hosts
can opt in to earning inspiration based on another eligible creator's real
completed session; these alerts are limited to one per recipient every 24 hours.

The inbox opens Notification preferences. `PATCH /account/settings` accepts
`pushNotifications` and a partial nested `notificationPreferences` object:
`calls`, `messages`, `likes`, `comments`, `gifts`, `appUpdates`, `liveAlerts`,
`earningsAlerts`, and `quietHours: {enabled, startHour, endHour, timeZone}`.
Hours use 0–23 and the time zone is an IANA identifier. Categories default on
except earning inspiration, which requires opt-in. Quiet hours delay non-call
pushes; expired or no-longer-relevant alerts are discarded. Android also exposes
separate call, message, activity, update, availability and earning channels.

Payload navigation is limited to inbox, thread, call, post, creator, host and
app-update targets. Native validates IDs, account ownership and expiry, then
loads authenticated server state. A call tap never accepts the call; it displays
only a still-ringing incoming call. Missed calls open the caller's profile.
Updates invoke the existing native update-policy check. Connected calls can be
minimized before navigation without losing their media or timer.

Firebase server setup and validation-only commands are documented in
[backend/PUSH_SETUP.md](../../backend/PUSH_SETUP.md). A new Android build is needed
for these native changes; production server credentials must also be configured.

## Official BinzoLive chat and support

Chat includes a default verified **BinzoLive** conversation for every authenticated member and host, including hosts awaiting approval. It stays first in All, appears in Unread when needed, and is searchable. Settings > Help & support and legacy support/inbox links open this same conversation. The separate Help & support row and ticket-creation flow are removed from the Chat screen.

The account is a server-owned system identity (`bingo-live-official`), not a loginable User, creator, callable peer or gift recipient. Its verified identity is validated separately from person chats. Support is free and does not grant person-chat permissions to unapproved hosts. In particular, an unapproved host can receive an empty ordinary-chat list plus the official summary while ordinary chat/call approval checks remain enforced.

`GET /chats/official/thread?before=<composite-message-id>&limit=50` returns the caller's announcements and all their historic support messages in a combined cursor-paginated timeline. Messages have IDs `announcement:<ObjectId>` or `support:<ObjectId>`, a `kind`, `senderType` (`user` or `official`), body, creation time and read state. Support messages also include their ticket, sequence and client message reference. Public announcements reach all users and hosts; personal updates and support replies remain scoped to the authenticated account.

`POST /chats/official/messages` accepts `{body, clientMessageId}`. The server creates or reuses one private default support ticket, guarded by a partial unique index. Stable client references make uncertain sends safe to retry; the same reference with different content is rejected. Both the legacy support send endpoint and official send endpoint share the account's send budget. A new message reopens a resolved default conversation.

`POST /chats/official/thread/read` accepts `{ids: [...]}` for displayed messages or `{all:true}` for an explicit mark-all action. Reads are scoped to the owner and preserve newer unseen support replies. Normal chat counts exclude the official channel; the UI adds its unread conversation once. The old announcement-only `/chats/official` and `/chats/official/read` endpoints remain available for compatibility. Legacy `/chats` summaries and announcement responses retain `canSend:false`, which older APKs require for a non-person system channel; the additive `supportEnabled:true` advertises the dedicated support API. Current clients accept that combination only for the verified system identity. New unified-thread responses use `canSend:true`.

Staff handle private replies through **People > Support inbox** with the existing `support:read`/`support:write` permissions, assignment rules and audit trail. Existing `/support/tickets` APIs remain for admin handling and older clients. **Engagement > Official chat** publishes announcements or private updates using `notifications:write`; a support reply is never broadcast. Published APK releases already produce app-update notifications, which appear in the official timeline too.

`src/official-bridge.ts` owns lifecycle, correlated reads/writes, reconnect invalidation and active foreground polling. `web/official-chat.js` and `.css` provide the shared chat-style row, header, bubbles and composer. The existing support helper remains for older cached callers. Drafts, pending sends and private history are retired when the account/document changes. Native requests cannot treat the official identity as an ordinary person-chat target.

Run `npm run test:official-chat`, `npm run test:support`, `npm run typecheck`, backend support/official-chat regressions, and dashboard tests. Responsive browser checks cover phone/tablet widths, keyboard resizing, Dark Mode, retries, escaping, history and account retirement. An isolated HTTP smoke uses real admin login cookies plus the app's actual parsers to verify member and pending-host send → staff claim/reply → read → resolve → reopen, announcement visibility and cross-account isolation.

This feature requires the matching backend and dashboard changes plus the updated APK. Building it does not deploy or publish a release.

## Not covered yet

- A full-screen native incoming-call screen while the app is closed. Android
  currently shows a notification; tapping it opens the verified call in the app.
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
