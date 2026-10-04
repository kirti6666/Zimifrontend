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
| Open a chat | `GET /chats/:id/messages` | `{messages: Message[]}` |
| Missed calls tab | `GET /calls/missed` | `{calls: MissedCall[]}` |
| Call history | `GET /calls` | `{calls: CallRecord[]}` |
| Transactions | `GET /wallet/transactions` | `{items: Transaction[]}` |
| Start a call, call back | `POST /calls` `{to, voice}` | `{callId}` |
| Accept, decline, end a call | `POST /calls/:id/accept`, `/decline`, `/end` | – |
| Send a gift | `POST /gifts` `{to, gift, coins, callId?}` | `Wallet` |
| Send a message | `POST /chats/:id/messages` `{text, callId?}` | – |
| Follow | `PUT /follows/:id` `{on}` | – |
| Buy a coin pack | `POST /wallet/recharge` | `Wallet` |
| Withdraw | `POST /payouts` `{coins, upi}` | `Wallet` |
| Receive an award | `POST /awards/:task/claim` | `Wallet` |

## Live events (socket)

One WebSocket per signed-in user at `EXPO_PUBLIC_SOCKET_URL` (default
`<API_URL>/ws`), token in the `token` query parameter. Each message is
`{ "type": ..., "data": {...} }` and goes straight to the screens:

| Event | Data | What the screen does |
| --- | --- | --- |
| `call.incoming` | `{callId, from: Person}` | Full-screen ring, or a banner during a call |
| `call.connected` | `{callId}` | Caller moves from "Calling…" into the call |
| `call.ended` | `{callId}` | Call ends and the summary opens; a ringing call becomes a missed call |
| `gift.received` | `{gift, coins, from}` | Gift animation and earnings on the host's call screen |
| `chat.message` | `{from, name, text, inCall?}` | Adds to the call chat or the open chat |
| `wallet.balance` | `{coins?, earned?}` | Updates balances everywhere |
| `verification.status` | `{status}` | Moves the verification screen on |

## Not covered yet

- Video and audio: the call screens show photos where video goes. A video SDK
  (for example Agora or ZEGOCLOUD) plus camera and microphone permissions is
  needed in the React Native shell.
- Incoming calls while the app is closed: needs push notifications and the
  Android incoming-call screen in the React Native shell.
- Coin purchases: Google Play Billing must confirm a purchase before
  `POST /wallet/recharge`.
- Google sign-in: shows "isn't available yet".
- Photos are sent inline as data URLs; large uploads should move to direct
  uploads with signed URLs.
- Profile numbers on host pages (lifetime coins, levels, top supporters) are
  still worked out on the screen from sample formulas.
