# Zimi Live misuse policies

Rules that stop senders and hosts from misusing the app. Part 1 is what the
backend already enforces. Part 2 is proposed: each rule has a suggested
default, and nothing in Part 2 is built until the product owner agrees the
numbers.

## 1. Enforced today

| Risk | Rule | Where (backend) |
| --- | --- | --- |
| Minors | Sign-up cannot finish without the 18+ confirmation | `auth/auth.validation.ts` |
| Fake creators | Only admin-approved hosts can go live, take calls, receive gifts or withdraw; approval can be suspended | `hosts/host-access.ts` |
| Unwanted contact | Only members start chats, calls and gifts, and only with approved hosts; a host can message or view a member only after the member writes first | `hosts/host-access.ts`, `chat/chat.controller.ts`, `users/user.service.ts` |
| Harassment | A block hides both people from each other in chats, posts, profiles and search | `users/user.service.ts` (`hiddenUserIds`) |
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
| Off-platform deals | Hide phone numbers, UPI IDs, emails and links in chat until the member has spent coins with that host | Hide until 500 coins spent with the host |
| Chargeback fraud | Gift earnings become withdrawable only after a holding period | Withdrawable after 7 days |
| Collusion (sender and host are the same person) | Flag gifts between accounts that share a device, payout UPI ID or recharge payment method; hold their earnings for review | Flag on any shared payout UPI ID |
| Multiple accounts | Limit how many accounts one device can create | 2 accounts per device |
| New-account recharge abuse | Cap daily coin purchases for new accounts | ₹5,000 per day for the first 7 days |
| Repeat offenders | Escalate after confirmed reports | Warning, then a 7-day suspension, then a permanent block |
| Host early endings | Count calls a host ends before 1 minute (the app already shows this rule) | Warning after 2 a day; entry fee goes to Zimi Live |
| Payout identity | Ask for PAN before large payouts | PAN required once lifetime payouts pass ₹50,000 |

The early-ending rule needs per-minute call billing on the server first. The
backend does not bill calls yet (see `API.md`).
