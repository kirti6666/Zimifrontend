/* The flat design's corner contract for the visual tests: every element keeps
   10px corners except the circles web/flat.css keeps for Back and the close/more
   buttons beside it, every call action, avatars with their badges and rings,
   and switches. Keep ROUND in step with the round list in web/flat.css. */
const AVATARS = '.av,.ringorb,.zc-avatar,.zu-avatar,.zp-avatar,.zp-summary-avatar,.zh-creator-face,.zpc-avatar,.hc-identity-avatar,.zc-photo-avatar,.zh-precall-avatar,.zh-story-ring,.zh-live-ring,.pcav,.editavatar .pic';
const ROUND = [
  '.zb-back,button[aria-label^="Back"],button[aria-label^="Close"],.zu-toolbar-more,.zu-icon-button,.zr-round',
  '.zh-creator-call,.voiceend,.ringact .accept,.zr-hangup,.zr-decline,.zr-call-topup,.hc-accept,.hc-decline',
  '.hc-preview-tools>button,.zv-actions button,.zv-controls button,.zh-call-controls button,.incban button,.zc-thread-actions>button,.zc-voice-play',
  '.av,.ringorb,.zc-avatar,.zu-avatar,.zp-avatar,.zp-summary-avatar,.zh-creator-face,.zpc-avatar,.zpc-orbit,.zpc-avatar-badge',
  '.hc-identity-avatar,.hc-host-avatar,.zc-photo-avatar,.zh-precall-avatar,.zh-skeleton-avatar,.zt-mini-avatars>i',
  '.zh-story-ring,.zh-live-ring,.pcav,.editavatar,.editavatar .pic,.editavatar .mediaedit,.zu-owner-camera,.zh-verified,.zu-verified',
  '.zp-switch,.zp-switch>i,.hc-switch,.themeswitch,.themeswitch i,.switch',
  `:is(${AVATARS})>:is(img,video,svg,.zh-photo,.zh-fallback,.zf-face)`,
].join(',');

module.exports = { ROUND };
