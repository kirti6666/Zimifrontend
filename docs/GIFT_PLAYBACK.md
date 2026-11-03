# Gift playback

Explicit Send starts a sender-only provisional presentation and closes the picker. It does not debit coins, create a delivered chat receipt or increment call/host totals. These remain driven by the committed server receipt. The existing idempotency key identifies the preview; the sender-only socket `clientId` or HTTP receipt confirms that same presentation without replaying it. Definitive rejection cancels it. Uncertain delivery retries keep the original request key. Gift aliases cannot replace ordinary chat rows with the same client ID.

The shared player preserves uploaded animation bytes and natural dimensions. Ready originals replay through fresh Blob URLs. Cold GIF/WebP images stream directly into the browser so their first authored frames can display before the HTTP tail arrives. The full-duration clock begins after load. A distinct static poster remains visible until actual motion pixels become available and is then removed, including behind transparent artwork. The real streaming test holds an HTTP tail and checks changing authored pixels before `load`.

Only selected and next artwork is warmed. The compressed cache is bounded to three originals/64 MiB; abandoned selections and presentations release network leases. A queued presentation sharing an original can retain its HTTP writer. Priority sender previews preempt presentation, without altering committed accounting. Call/chat redraws keep playback nodes and clocks intact; controls remain tappable.

Programmatic URLs preserve signed query parameters. Unsigned originals get one stable fetch-cache version to bypass responses cached before app CORS was configured; transfer identity belongs in a fragment, not a per-send network query. The R2 rule permits GET/HEAD for `https://aurora.localhost`, preserving existing bucket rules.

Gift `media.coverUrl` is a genuine static poster, separate from authoritative `media.url`. Catalog, receipts and events carry it. Backend upload/confirmation derives posters from validated bytes. The dry-run-first `gifts:posters` backfill uses owned S3 keys and compare-and-set checks against the original URL/key/version, leaving animation objects and prices intact. Legacy receipt posters only follow a catalog original that still matches exactly.

The authentic bundled Heart source is 720x1280/192 frames/30 fps; Golden Rose is 360x640/192 frames/30 fps. Existing uploaded Rose, Car and Money remain at their original 360x640 resolution. No resolution is invented by enlarging artwork. Bundled encodes retain authored frames and the existing alpha-haze cutoff, with higher color/alpha quality than the old reduced assets.

Validation: `npm run test:gift-playback`, `npm run test:chat-gifts`, `npm run test:coins`, and `npm run test:chat-order`. The core test also checks original 4K bytes, transparency, signed URLs, cancellation and alias races. Financial commit/retry, sender-only aliases and poster backfill have separate backend regressions.
