/* Shared corner contract: controls and single-line fields are pills/circles,
   multiline fields use 24px, cards keep 10px, and structural edges stay square. Keep ROUND
   in step with the control and avatar selectors in web/flat.css. */
const AVATARS = '.av,.ringorb,.zc-avatar,.zu-avatar,.zp-avatar,.zp-summary-avatar,.zh-creator-face,.zpc-avatar,.hc-identity-avatar,.zc-photo-avatar,.zh-precall-avatar,.zh-story-ring,.zh-live-ring,.pcav,.editavatar .pic';
// These controls are content containers; rounding their actions must not crop
// the video, photo, campaign or preview card that the container displays.
const CONTENT_BUTTONS = '.zr-pip,.pip,.zu-photo,.zc-photo,.za-campaign-slide,.hc-card-image,.ob-thumb,.hpcard,.zt-card,.zh-creator-hit,.zw-packs>button';
const BUTTONS = `:is(button,[role=button],[role=tab],[role=switch],input[type=button],input[type=submit],input[type=reset]):not(:is(${CONTENT_BUTTONS}))`;
const FIELDS = ':is(input:not(:is([type=checkbox],[type=radio],[type=range],[type=file],[type=color],[type=hidden],[type=button],[type=submit],[type=reset],[type=image])),select:not([multiple]))';
const FIELD_SURFACES = ':is(.srch>div,.sfield,.zc-search,.zc-compose-search,.zc-composer-field,.zh-search-header>div,.zr-compose,.zn-search,.zc-photo-reply-bar)';
const MULTILINE = ':is(textarea,select[multiple])';
const ROUND = [
  BUTTONS,
  FIELDS,
  FIELD_SURFACES,
  '.zb-back,button[aria-label^="Back"],button[aria-label^="Close"],.zu-toolbar-more,.zu-icon-button,.zr-round',
  '.zh-creator-call,.voiceend,.ringact .accept,.zr-hangup,.zr-decline,.zr-call-topup,.hc-accept,.hc-decline',
  '.hc-preview-tools>button,.zv-actions button,.zv-controls button,.zh-call-controls button,.incban button,.zc-thread-actions>button,.zc-voice-play',
  '.av,.ringorb,.zc-avatar,.zu-avatar,.zp-avatar,.zp-summary-avatar,.zh-creator-face,.zpc-avatar,.zpc-orbit,.zpc-avatar-badge',
  '.hc-identity-avatar,.hc-host-avatar,.zc-photo-avatar,.zh-precall-avatar,.zh-skeleton-avatar,.zt-mini-avatars>i',
  '.zh-story-ring,.zh-live-ring,.pcav,.editavatar,.editavatar .pic,.editavatar .mediaedit,.zu-owner-camera,.zh-verified,.zu-verified',
  '.zp-switch,.zp-switch>i,.hc-switch,.themeswitch,.themeswitch i,.switch,#zimi-pull,.zc-call-badge,.zc-call-back,.zlb-avatar',
  `:is(${AVATARS})>:is(img,video,svg,.zh-photo,.zh-fallback,.zf-face)`,
].join(',');

const STRAIGHT='html,body,.app,#top,#scroll-root,#screen,hr,[role=separator],.nav,.zu-tabs,.zu-actionbar,.zu-stats,.zu-stats>div,.zu-skeleton-stats,.zu-details>div,.zu-option,.zp-stats,.zp-stats>div,.zp-wallet-actions,.zw-history,.zw-gift-footer,.zpost-visibility,.zpost-header,.zu-photo-dialog,.zu-feed,.zu-feed-header,.zu-feed-post,.zu-feed-media,.zu-feed-media>img,.zu-feed-media>video,.zu-comments-backdrop,.zc-chips,.zt-card-foot,.zpc-details>i,.zt-mini-nav i,.zh-flag';
module.exports = { BUTTONS, FIELDS, FIELD_SURFACES, MULTILINE, ROUND, STRAIGHT };
