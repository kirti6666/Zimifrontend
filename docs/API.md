# Zimi Live app ↔ server

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
media preparation. The backend currently has no per-minute call billing; display
the private call as free.

## Setup

Copy `.env.example` to `.env` and set `EXPO_PUBLIC_API_URL`. The login token
is kept in the phone's secure storage (`expo-secure-store`) and sent as
`Authorization: Bearer <token>`. Errors are expected as
`{ "message": "..." }`; that text is shown to the user where there is a place
for it (login, call failed).

## Requests

| Action on screen | Request | Response |
| --- | --- | --- |
| Continue (phone number) | `POST /auth/otp` `{phone, role}` | – |
| Enter the 6-digit code | `POST /auth/verify` `{phone, code, role, signup}` | `Session` |
| Log out | `POST /auth/logout` | – |
| App opens with a saved login | `GET /me` | `Account` |
| Finish sign-up, edit profile | `PUT /me/profile` | – |
| Submit verification | `POST /me/verification` | `{status}` |
| Go online, offline, visible or hidden | `PUT /me/presence` `{online, visible}` | – |
| Show MVPs switch | `PUT /me/settings` | – |
| Home | `GET /hosts` | `{hosts: Host[]}` |
| Chats | `GET /chats` | `{chats: ChatSummary[]}` |
| Open a chat | `GET /chats/:id` | Adapter returns `{messages: Message[], canSend, sendDisabledReason?}` |
| Missed calls tab | `GET /calls/missed` | `{calls: MissedCall[]}` |
| Call history | `GET /calls` | `{calls: CallRecord[]}` |
| Transactions | `GET /wallet/transactions` | `{items: Transaction[]}` |
| Start a call, call back | `POST /calls` `{to, voice}` | `{callId}` |
| Accept, decline, end a call | `POST /calls/:id/accept`, `/decline`, `/end` | – |
| Send a gift | `POST /gifts` `{to, gift, coins, callId?}` | `Wallet` |
| Send a message | `POST /chats/:id` `{text}` | – |
| Follow | `PUT /follows/:id` `{on}` | – |
| Buy a coin pack | `POST /coins/purchase` `{packId, idempotencyKey}`, opens the PayPlus page; `POST /coins/purchase/verify` `{merchantOrderId}` when the app returns | `Purchase` |
| Withdraw | `POST /payouts` `{coins, upi}` | `Wallet` |
| Receive an award | `POST /awards/:task/claim` | `Wallet` |

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
| `call.connected` | `{callId}` | Caller moves from "Calling…" into the call |
| `call.ended` | `{callId}` | Call ends and the summary opens; a ringing call becomes a missed call |
| `gift.received` | `{gift, coins, from}` | Gift animation and earnings on the host's call screen |
| `chat.message` | `{from, name, text, inCall?, automated?}` | Adds to the call chat or the open chat; automated welcomes are labeled |
| `wallet.balance` | `{coins?, earned?}` | Updates balances everywhere |
| `verification.status` | `{status}` | Moves the verification screen on |

## Not covered yet

- Video and audio: the call screens show photos where video goes. A video SDK
  (for example Agora or ZEGOCLOUD) plus camera and microphone permissions is
  needed in the React Native shell.
- Incoming calls while the app is closed: needs push notifications and the
  Android incoming-call screen in the React Native shell.
- Coin purchases use PayPlus checkout. Coins are credited only by the server,
  after `POST /coins/purchase/verify` or the signed PayPlus webhook. Google
  Play's payments policy may require Play Billing (or its alternative billing
  programme) for coins sold inside the Android app; check before release.
- Google sign-in: shows "isn't available yet".
- Photos are sent inline as data URLs; large uploads should move to direct
  uploads with signed URLs.
- Your own level and crown come from `GET /account/settings` as `standing`
  (`{level, crown}`; thresholds, crown amount and window are set in the admin
  dashboard). The crown is held while gifts sent in the window reach the
  amount and drops by itself when they no longer do. Other people's lifetime coins,
  levels and top supporters on host pages are still sample formulas.
