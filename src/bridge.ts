import type { RefObject } from "react";
import type WebView from "react-native-webview";

import { errorMessage } from "./api/client";
import { api } from "./api/endpoints";
import { connectRealtime } from "./api/realtime";
import type { Account, Host, Message, Role, Verification, Wallet } from "./api/types";
import { clearToken, getToken, setToken } from "./session";

/* The screens (web/, shown in the WebView) and the app talk in small JSON
   messages: { type, data }. The screens never call the server themselves;
   they report what the user did (WebMessage) and the app answers with what
   the server said (AppMessage). The matching code is web/bridge.js and the
   Native.send / Native.on calls in web/aurora-runtime.js. */

/* Screens -> app. */
export type WebMessage =
  | { type: "ready"; data: { demo: boolean } }
  | { type: "theme"; data: { theme: "light" | "dark" } }
  | { type: "auth.sendOtp"; data: { phone: string; role: Role } }
  | { type: "auth.verifyOtp"; data: { phone: string; code: string; role: Role; signup: boolean } }
  | { type: "auth.google"; data: { role: Role; signup: boolean } }
  | { type: "auth.logout"; data: Record<string, never> }
  | { type: "profile.save"; data: Record<string, unknown> }
  | { type: "verification.submit"; data: Record<string, unknown> }
  | { type: "presence.set"; data: { online: boolean; visible: boolean } }
  | { type: "settings.set"; data: Record<string, unknown> }
  | { type: "follow.set"; data: { id: string; on: boolean } }
  | { type: "chat.open"; data: { with: string } }
  | { type: "chat.send"; data: { to: string; text: string; inCall?: boolean } }
  | { type: "gift.send"; data: { to: string; gift: string; coins: number; inCall: boolean } }
  | { type: "call.start"; data: { to: string; voice?: boolean } }
  | { type: "call.accept"; data: { callId: string } }
  | { type: "call.decline"; data: { callId: string } }
  | { type: "call.end"; data: { callId?: string; reason?: string } }
  | { type: "wallet.recharge"; data: { pack: number; coins: number; price: number; method: string } }
  | { type: "payout.request"; data: { coins: number; upi: string } }
  | { type: "awards.claim"; data: { task: string } };

/* App -> screens. The live events (call.*, gift.received, chat.message,
   wallet.balance, verification.status) come straight from the server socket. */
export type AppMessage =
  | { type: "session"; data: Account }
  | { type: "auth.ok"; data: Account & { isNew: boolean } }
  | { type: "auth.error"; data: { message: string } }
  | { type: "data.hosts"; data: { hosts: Host[] } }
  | { type: "data.chats"; data: Awaited<ReturnType<typeof api.chats>> }
  | { type: "data.thread"; data: { with: string; messages: Message[] } }
  | { type: "data.missed"; data: Awaited<ReturnType<typeof api.missedCalls>> }
  | { type: "data.calls"; data: Awaited<ReturnType<typeof api.callHistory>> }
  | { type: "data.transactions"; data: Awaited<ReturnType<typeof api.transactions>> }
  | { type: "wallet.balance"; data: Partial<Wallet> }
  | { type: "verification.status"; data: { status: Verification } }
  | { type: "call.connected"; data: { callId: string } }
  | { type: "call.failed"; data: { message: string } }
  | { type: "call.incoming"; data: { callId: string; from: Record<string, unknown> } }
  | { type: "call.ended"; data: { callId: string } }
  | { type: "gift.received"; data: { gift: string; coins: number; from: string } }
  | { type: "chat.message"; data: { from: string; name: string; text: string; inCall?: boolean } };

/* Sends one message into the page. */
export function postToWeb(web: RefObject<WebView | null>, msg: AppMessage) {
  const json = JSON.stringify(JSON.stringify(msg));
  web.current?.injectJavaScript(`window.zimiReceive && window.zimiReceive(${json}); true;`);
}

export function createBridge(post: (msg: AppMessage) => void) {
  let stopLive = () => {};
  let activeCall: string | undefined;

  /* Background actions: nothing to show if they fail, so log and move on. */
  const quietly = (work: Promise<unknown>) => {
    work.catch((e) => console.warn("[zimi]", errorMessage(e)));
  };
  /* After a failed spend, put the real balance back on screen. */
  const refreshWallet = () => quietly(api.wallet().then((w) => post({ type: "wallet.balance", data: w })));
  const sendWallet = (work: Promise<Wallet>) =>
    work.then((w) => post({ type: "wallet.balance", data: w })).catch((e) => {
      console.warn("[zimi]", errorMessage(e));
      refreshWallet();
    });

  const loadLists = () => {
    quietly(api.hosts().then((d) => post({ type: "data.hosts", data: d })));
    quietly(api.chats().then((d) => post({ type: "data.chats", data: d })));
    quietly(api.missedCalls().then((d) => post({ type: "data.missed", data: d })));
    quietly(api.callHistory().then((d) => post({ type: "data.calls", data: d })));
    quietly(api.transactions().then((d) => post({ type: "data.transactions", data: d })));
  };

  const startSession = (token: string) => {
    stopLive();
    stopLive = connectRealtime(token, (event) => {
      const callId = event.data?.callId;
      if (event.type === "call.ended" && callId === activeCall) activeCall = undefined;
      post(event as AppMessage);
    });
    loadLists();
  };

  async function handle(msg: WebMessage) {
    switch (msg.type) {
      case "ready": {
        // The preview build fakes everything itself; only the app build talks to the server.
        if (msg.data.demo) return;
        const token = await getToken();
        if (!token) return;
        try {
          post({ type: "session", data: await api.me() });
          startSession(token);
        } catch (e) {
          console.warn("[zimi]", errorMessage(e));
        }
        return;
      }

      case "auth.sendOtp":
        return quietly(api.sendOtp(msg.data.phone, msg.data.role));
      case "auth.verifyOtp": {
        const { phone, code, role, signup } = msg.data;
        try {
          const { token, ...account } = await api.verifyOtp(phone, code, role, signup);
          await setToken(token);
          post({ type: "auth.ok", data: account });
          startSession(token);
        } catch (e) {
          post({ type: "auth.error", data: { message: errorMessage(e) } });
        }
        return;
      }
      case "auth.google":
        // Needs a Google sign-in library and OAuth client IDs; not set up yet.
        return post({ type: "auth.error", data: { message: "Google sign-in isn't available yet. Use your mobile number." } });
      case "auth.logout":
        stopLive();
        activeCall = undefined;
        return quietly(api.logout().finally(clearToken));

      case "profile.save":
        return quietly(api.saveProfile(msg.data));
      case "verification.submit":
        try {
          const { status } = await api.submitVerification(msg.data);
          post({ type: "verification.status", data: { status } });
        } catch (e) {
          console.warn("[zimi]", errorMessage(e));
          post({ type: "verification.status", data: { status: "none" } });
        }
        return;
      case "presence.set":
        return quietly(api.setPresence(msg.data.online, msg.data.visible));
      case "settings.set":
        return quietly(api.saveSettings(msg.data));
      case "follow.set":
        return quietly(api.follow(msg.data.id, msg.data.on));

      case "chat.open": {
        const withId = msg.data.with;
        return quietly(api.thread(withId).then(({ messages }) => post({ type: "data.thread", data: { with: withId, messages } })));
      }
      case "chat.send":
        return quietly(api.sendMessage(msg.data.to, msg.data.text, msg.data.inCall ? activeCall : undefined));
      case "gift.send":
        return sendWallet(api.sendGift(msg.data.to, msg.data.gift, msg.data.coins, msg.data.inCall ? activeCall : undefined));

      case "call.start":
        try {
          activeCall = (await api.startCall(msg.data.to, !!msg.data.voice)).callId;
        } catch (e) {
          post({ type: "call.failed", data: { message: errorMessage(e) } });
        }
        return;
      case "call.accept": {
        const { callId } = msg.data;
        try {
          await api.acceptCall(callId);
          activeCall = callId;
          post({ type: "call.connected", data: { callId } });
        } catch (e) {
          console.warn("[zimi]", errorMessage(e));
          post({ type: "call.ended", data: { callId } });
        }
        return;
      }
      case "call.decline":
        return quietly(api.declineCall(msg.data.callId));
      case "call.end": {
        const callId = msg.data.callId ?? activeCall;
        if (callId === activeCall) activeCall = undefined;
        if (callId) quietly(api.endCall(callId, msg.data.reason));
        return;
      }

      case "wallet.recharge":
        // Google Play Billing has to confirm the purchase before this call.
        return sendWallet(api.recharge(msg.data));
      case "payout.request":
        return sendWallet(api.requestPayout(msg.data.coins, msg.data.upi));
      case "awards.claim":
        return sendWallet(api.claimAward(msg.data.task));

      case "theme":
        return; // handled by App.tsx
      default: {
        const unknown: never = msg;
        console.warn("[zimi] unknown message", (unknown as { type: string }).type);
      }
    }
  }

  return {
    handle: (msg: WebMessage) => void handle(msg),
    close: () => stopLive(),
  };
}
