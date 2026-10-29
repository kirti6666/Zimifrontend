# BinzoLive misuse policies

Rules that stop senders and hosts from misusing the app. Part 1 is what the
backend already enforces. Part 2 is proposed: each rule has a suggested
default, and nothing in Part 2 is built until the product owner agrees the
numbers.

## 1. Enforced today

| Risk | Rule | Where (backend) |
| --- | --- | --- |
| Minors | Sign-up cannot finish without the 18+ confirmation | `auth/auth.validation.ts` |
| Fake creators | Only admin-approved hosts can go live, take calls, receive gifts or withdraw; approval can be suspended | `hosts/host-access.ts` |
| Unwanted contact | Members start chats, calls and gifts only with approved hosts. Approved hosts may message any member or another approved host (owner decision, 29 Oct 2026). A host calls a member only by voice after they follow each other, or by video (and voice) after the member allows that host on the host's profile; the member pays the host's rate once they answer. A host views a member's profile only after a chat, a follow either way, a call or that permission | `hosts/host-access.ts`, `calls/call-access.ts`, `chat/chat.controller.ts`, `users/user.service.ts` |
| Harassment | A block hides both people from each other in chats, posts, profiles and search | `users/user.service.ts` (`hiddenUserIds`) |
| Off-platform contact and abuse | Phone numbers (any spacing, or spelled out in English or Hindi words) and abusive words (Hinglish, Hindi, English) are hidden from private, in-call and live chat before they are saved or delivered; the other person sees a blur | `lib/moderation.ts` |
| Gift farming | Nobody can gift themselves | `commerce/commerce.controller.ts` |
| Fake coins | Coins are credited only by the server after PayPlus confirms payment (verify call or signed webhook); reversals take them back | `commerce/commerce.service.ts` |
| Double spending | Gifts, purchases and withdrawals carry idempotency keys, and balances are checked and changed atomically | `commerce/commerce.controller.ts` |
| Payout abuse | Withdrawals need an approved host, a minimum amount and an admin review; finance can pause all withdrawals | `commerce/commerce.controller.ts`, admin settings |
| Spam and brute force | Rate limits: 20 code requests and 30 code checks per 15 minutes, 60 uploads per 15 minutes, 30 live-call requests and 120 hearts per minute, 1,000 requests per 15 minutes per IP | `auth/auth.routes.ts`, `media/media.routes.ts`, `streams/stream.requests.ts`, `app.ts` |
| Bad streams and accounts | Admins can flag or end a stream, block a member and suspend a host; every admin action is in the audit log | `admin/` |

## 2. Proposed (needs a decision)

| Risk | Proposed rule | Suggested default |
| --- | --- | --- |
| No way to report | Report a person, message or stream from the app; reports go to an admin queue | Hide a live stream for review after 3 reports from different members in 10 minutes |
| Off-platform deals | Phone numbers are always hidden now; also hide UPI IDs, emails, links and social handles | Hide them always, like phone numbers |
| Chargeback fraud | Gift earnings become withdrawable only after a holding period | Withdrawable after 7 days |
| Collusion (sender and host are the same person) | Flag gifts between accounts that share a device, payout UPI ID or recharge payment method; hold their earnings for review | Flag on any shared payout UPI ID |
| Multiple accounts | Limit how many accounts one device can create | 2 accounts per device |
| New-account recharge abuse | Cap daily coin purchases for new accounts | ₹5,000 per day for the first 7 days |
| Repeat offenders | Escalate after confirmed reports | Warning, then a 7-day suspension, then a permanent block |
| Host early endings | Count calls a host ends before 1 minute (the app already shows this rule) | Warning after 2 a day; entry fee goes to BinzoLive |
| Payout identity | Ask for PAN before large payouts | PAN required once lifetime payouts pass ₹50,000 |

Calls are billed by the second at the price staff set (see `API.md`), so the
early-ending rule can now be built once its numbers are decided.
