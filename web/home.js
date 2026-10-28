/* Home surfaces use the same authenticated bridge as the rest of the app.
   Preview people, activity and balances exist only in the DEMO build. */
const Home = {
  loaded: DEMO, loading: false, loadingMore: false, error: '', filter: 'popular', dashboardFilter: 'popular', page: 1, queryKey:'popular|',
  searchLoading:false, searchMore:false, searchError:'', searchRows:[], searchPage:1, searchTotal:0, searchQuery:'',
  hosts: [], stage: [], featured: null, total: 0, categories: ['Music','Talk','Gaming','Dance','Comedy','Fitness','Astrology'],
  broadcasterCount: 0, availableCount: 0, speedMatchEnabled: true, bonus: null,
  notifications: [], unreadCount: 0, gifts: [], packs: [], paymentsAvailable: false,
  matching: false, giftTo: null, giftBusy: false, claiming: false,
  stream: null, hosting: false, streamBusy: false, dashboardCall: null, dashboardSetup: null, messages: [], mediaStatus: '',
  preparingCall: false, preparingVoice: false,
  checkout: null, checkoutBusy: false, packId: '', notifyLoading: false
};
const homeIcons = {
  signal:'<path d="M4 20v-3"/><path d="M9 20v-7"/><path d="M14 20V9"/><path d="M19 20V4"/>',
  close:'<path d="m6 6 12 12M6 18 18 6"/>',
  checks:'<path d="m2 12 5 5L18 6M10 15l2 2L23 6"/>',
  arrow:'<path d="M4 12h16m-6-6 6 6-6 6"/>',
  info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/>',
  house:'<path d="M4 10.2a2 2 0 0 1 .72-1.54l6-5.06a2 2 0 0 1 2.56 0l6 5.06a2 2 0 0 1 .72 1.54V19a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/><path d="M9.5 21v-5.5a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1V21"/>',
  explore:'<circle cx="12" cy="12" r="9"/><path d="m16 8-2.5 5.5L8 16l2.5-5.5z"/>',
  bolt:'<path d="m13 2-8 12h6l-1 8 9-13h-6z"/>',
  music:'<path d="M9 17V5l11-2v12M9 8l11-2"/><ellipse cx="6" cy="18" rx="3" ry="2"/><ellipse cx="17" cy="16" rx="3" ry="2"/>',
  bell:'<path d="M5 17h14l-2-3V9a5 5 0 0 0-10 0v5zM10 21h4M12 2v2"/>',
  play:'<path d="m9 5 10 7-10 7z"/>',
  verified:'<path d="m12 2 3 3 4 .4.6 4L22 12l-2.4 2.6-.6 4-4 .4-3 3-3-3-4-.4-.6-4L2 12l2.4-2.6.6-4L9 5z"/><path d="m8 12 3 3 5-6"/>',
  rings:'<circle cx="14" cy="12" r="7"/><path d="M6 5a8 8 0 0 0 0 14"/>',
  gift:'<path d="M3 9h18v5H3zM5 14v7h14v-7M12 9v12M12 9C3 9 5 1 9 4l3 5Zm0 0c9 0 7-8 3-5z"/>',
  pulse:'<circle cx="12" cy="12" r="9"/><path d="M16 17a6 6 0 1 1 2-5c0 4-5 4-5 1V9m0 0a3 3 0 1 0 0 5"/>',
  broadcast:'<rect x="2" y="5" width="14" height="15" rx="2"/><path d="m16 10 6-4v13l-6-4M9 8v9M5 12.5h8"/>',
  refresh:'<path d="M20 11a8 8 0 0 0-14.8-3.6M4 4v4h4M4 13a8 8 0 0 0 14.8 3.6M20 20v-4h-4"/>'
};
function hi(name,size=20){if(['coin','rings'].includes(name))return coinIcon(size);return `<svg class="zi-icon" data-icon="${name}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${homeIcons[name]||P[name]||P.star}</svg>`}
function homeCompact(value){const x=Math.max(0,Number(value)||0);return x>=1000?(x/1000).toFixed(x>=10000?0:1).replace(/\.0$/,'')+'k':n(x)}
function homeCreator(p){const h=hostFrom(p);return {...h,...('previewVideoUrl' in p?{video:videoSrc(p.previewVideoUrl)}:{}),verified:!!p.verified,about:p.about||'',stream:window.ZIMI_LIVE_STREAMING_ENABLED?p.stream||null:null,viewers:window.ZIMI_LIVE_STREAMING_ENABLED?p.stream?.viewers||0:0}}
function homeRemember(p){const h=homeCreator(p),old=H.find(x=>x.id===h.id);if(old)Object.assign(old,h);else H.push(h);return h}
function homeCover(h,priority=false){const src=imageSrc(h.coverUrl||h.avatarUrl);return src?`<img class="zh-photo zh-photo-pending" src="${src}" alt="${esc(h.n)}" data-face="${faceKind(h)}" data-face-wrap="zh-fallback" loading="${priority?'eager':'lazy'}" decoding="async">`:`<div class="zh-fallback">${face(h)}</div>`}
/* A slot over the photo; card-video.js fills it with the host's video once the card is in view. */
function homeCardVideo(h){return h.video?`<span class="zh-card-video" data-video="${h.video}" aria-hidden="true"></span>`:''}
function homeVerified(h){return h.verified?`<span class="zh-verified" aria-label="Verified creator">${hi('verified',16)}</span>`:''}
function homeRate(h){return h.rate>0?`${hi('rings',13)} ${n(h.rate)} / min`:'Free'}
function homeBadge(h){return h.stream?'<span class="zh-badge zh-live"><i></i> LIVE</span>':h.available?`<span class="zh-badge zh-ready">${hi('bolt',11)} Ready 1:1</span>`:h.on?'<span class="zh-badge zh-offline zh-online"><i></i> Online</span>':'<span class="zh-badge zh-offline">Offline</span>'}
/* Home and Explore list every host, online or offline; only Instant Call narrows to hosts free to call now. */
function homeFeedQuery(){const explore=S.v==='explore',filter=explore?Home.filter:Home.dashboardFilter;const query={mode:filter==='instant'?'instant':'popular'};if(Home.categories.includes(filter))query.category=filter;return query}
function homeFeedKey(query=homeFeedQuery()){return query.mode+'|'+(query.category||'')}
function homeLoad(more=false){
  if(!DEMO&&(Home.loading||contentPending('home'))&&more)return;
  Home.error='';Home.loadingMore=more;Home.loading=!DEMO;
  if(DEMO){Home.loaded=true;Home.loadingMore=false;r();return}
  const page=more?Home.page+1:1;
  contentStart('home',{page});
  const data={page,...homeFeedQuery()};Home.queryKey=homeFeedKey(data);
  Native.send('home.reload',data);r();
}
function homeContentPending(){return !DEMO&&(Home.loading||contentPending('home'))&&!Home.loadingMore}
function homeContentError(){return !DEMO&&(Home.error||ContentLoading.home.error)}

function homeFilter(value){Home.filter=value;homeLoad()}
function homeDashboardFilter(value){if(!['popular','instant',...Home.categories].includes(value)||value===Home.dashboardFilter)return;Home.dashboardFilter=value;homeLoad()}
function homeList(){let list=Home.hosts;if(DEMO){if(Home.filter==='instant')list=list.filter(h=>h.available);else if(Home.categories.includes(Home.filter))list=list.filter(h=>h.cat===Home.filter)}return list}
function homeHeader(){return `<header class="zh-header"><button class="zh-brand" onclick="go('home')" aria-label="BinzoLive home"><img class="zh-logo" src="${BRAND_LOGO}" alt="" width="76" height="30" decoding="async"></button><div class="zh-header-actions"><button class="zh-balance" onclick="go('coins')" aria-label="${!DEMO&&contentPending('wallet')?'Wallet balance loading':!DEMO&&ContentLoading.wallet.error?'Wallet unavailable':'Wallet, '+n(S.bal)+' coins'}">${hi('rings',17)}<span>${contentBalance()}</span></button><button class="zh-icon" onclick="go('search')" aria-label="Search creators">${hi('srch',21)}</button><button class="zh-icon zh-bell" onclick="homeNotifications()" aria-label="Notifications${Home.unreadCount?', '+Home.unreadCount+' unread':''}">${hi('bell',21)}${Home.unreadCount?'<i></i>':''}</button></div></header>`}
function homeNav(){
  const el=document.getElementById('nav');
  // Detail pages have their own Back action instead of the primary tabs.
  if(['notifications','themes'].includes(S.v)){el.style.display='none';el.replaceChildren();el.classList.remove('zh-nav');el.removeAttribute('role');el.removeAttribute('aria-label');return true}
  if(!['home','explore','chats','profile','settings'].includes(S.v))return false;
  el.style.display='grid';el.classList.add('zh-nav');el.setAttribute('role','navigation');el.setAttribute('aria-label','Main navigation');
  const item=(v,label,icon)=>`<button type="button" data-tab="${v}" class="${(S.v===v||(v==='profile'&&S.v==='settings'))?'on':''}" ${(S.v===v||(v==='profile'&&S.v==='settings'))?'aria-current="page"':''} onclick="go('${v}')">${hi(icon,23)}<span>${label}</span>${v==='chats'&&(window.ZimiChats?window.ZimiChats.unread()>0:CH.some(c=>c[3]>0))?'<i class="zh-nav-dot"></i>':''}</button>`;
  el.innerHTML=item('home','Home','house')+item('explore','Explore','explore')+item('chats','Chats','chat')+item('profile','Profile','user');return true;
}
function homeStage(){if(!window.ZIMI_LIVE_STREAMING_ENABLED)return '';const rows=Home.stage.slice(0,12),pending=homeContentPending(),error=homeContentError();return `<section class="zh-stage" aria-label="Live creators"><div class="zh-section-title"><h2><i></i>Stage &amp; Live Calls</h2><span>${pending?skeletonLine('94px',10):error?'':homeCompact(Home.broadcasterCount)+' BROADCASTERS'}</span></div><div class="zh-stories">${isApprovedHost()?`<button class="zh-story zh-story-create" onclick="homeGoLive()"><span class="zh-story-ring">${hi('plus',24)}<i>${hi('vid',10)}</i></span><span>Go Live</span></button>`:''}${pending?contentSkeleton('stories','Loading live creators',4):error?'':rows.map(h=>`<button class="zh-story" onclick="homeOpen('${domId(h.id)}')" aria-label="${h.stream?'Watch':'Call'} ${esc(h.n)}"><span class="zh-story-ring ${h.stream?'':'zh-story-call'}">${homeCover(h)}<b>${h.stream?'LIVE':hi('ph',9)+' 1:1'}</b></span><span>${esc(first(h.n))}</span></button>`).join('')}${!pending&&!error&&!rows.length?'<span class="zh-stage-empty">Your next favourite creator is on the way.</span>':''}</div></section>`}

function homeFilters(){const filters=[['popular','Popular','&#128293;'],['instant','Instant Call',hi('bolt',15)],...Home.categories.map(c=>[c,c,c==='Music'?hi('music',16):c==='Talk'?hi('chat',15):hi('star',14)])];return `<div class="zh-filters" role="group" aria-label="Browse categories">${filters.map(([key,label,icon])=>`<button class="${Home.filter===key?'selected':''}" data-home-filter="${esc(key)}" aria-pressed="${Home.filter===key}" onclick="homeFilter(this.dataset.homeFilter)">${icon}<span>${esc(label)}</span></button>`).join('')}</div>`}
function homeFeatured(){if(homeContentPending())return `<div class="zh-featured">${contentSkeleton('featured','Loading featured creator')}</div>`;if(homeContentError())return '';const list=homeList(),h=Home.filter==='popular'?Home.featured||list[0]:list[0];if(!h)return '';return `<article class="zh-featured">${homeCover(h,true)}<div class="zh-featured-shade"></div><div class="zh-featured-top">${homeBadge(h)}${h.stream?`<span class="zh-viewers">${hi('eye',13)} ${homeCompact(h.viewers)}</span>`:''}<button class="zh-featured-open" onclick="homeOpen('${domId(h.id)}')" aria-label="${h.stream?'Watch live':'View profile'}">${hi(h.stream?'play':'user',12)} ${h.stream?'Watch live':'Creator'}</button></div><button class="zh-featured-hit" aria-label="Open ${esc(h.n)}" onclick="homeOpen('${domId(h.id)}')"></button><div class="zh-featured-bottom"><div class="zh-featured-identity"><button onclick="go('host','${domId(h.id)}')"><h1>${esc(h.n)} ${homeVerified(h)}</h1><p>${esc(h.stream?.title||h.about||h.tag||'Meet your next favourite creator')}</p></button><button class="zh-gift" onclick="homeGifts('${domId(h.id)}')" aria-label="Send a gift to ${esc(h.n)}">${hi('gift',23)}</button></div><div class="zh-live-note"><i></i>${h.stream?`Live now · ${esc(h.cat||'Join the conversation')}`:h.available?'Online and ready to connect':'Follow to connect another time'}</div><div class="zh-featured-actions"><button class="zh-primary" onclick="homeCall('${domId(h.id)}')" ${h.available?'':'disabled'}>${hi('vid',19)} ${h.available?'Instant 1-on-1 Call':'Currently unavailable'}</button><div class="zh-rate"><span>Call rate</span><b>${homeRate(h)}</b></div></div></div></article>`}
function homeMatch(){if(homeContentPending())return `<div class="zh-match">${contentSkeleton('match','Loading video matches')}</div>`;if(homeContentError())return '';if(!Home.speedMatchEnabled)return '';return `<section class="zh-match"><div><h2>${hi('pulse',20)} Speed Video Pulse</h2><p>Find your next conversation.</p><div class="zh-available"><span class="zh-wave" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></span>${homeCompact(Home.availableCount)} Available</div></div><button class="zh-primary" onclick="homeMatchNow()" ${Home.matching||!Home.availableCount?'disabled':''}>${hi('bolt',19)} ${Home.matching?'Finding…':'Match'}</button></section>`}
function homeTile(h){return `<article class="zh-tile"><div class="zh-tile-media">${homeCover(h)}${homeCardVideo(h)}<div class="zh-tile-shade"></div><button class="zh-tile-hit" onclick="homeOpen('${domId(h.id)}')" aria-label="${h.stream?'Watch':'Meet'} ${esc(h.n)}"></button><div class="zh-tile-top">${homeBadge(h)}${h.stream?`<span class="zh-viewers">${hi('eye',11)} ${homeCompact(h.viewers)}</span>`:h.available?'<span class="zh-viewers"><i class="zh-online-dot"></i>Online</span>':''}</div>${!h.stream?`<span class="zh-tile-rate">${homeRate(h)}</span>`:''}<button class="zh-tile-action ${h.stream?'':'zh-hot'}" onclick="${h.stream?'homeOpen':'homeCall'}('${domId(h.id)}')" ${!h.stream&&!h.available?'disabled':''} aria-label="${h.stream?'Watch live':'Start call'} with ${esc(h.n)}">${hi(h.stream?'play':'vid',18)}</button></div><button class="zh-tile-caption" onclick="go('host','${domId(h.id)}')"><h3>${esc(h.n)} ${homeVerified(h)}</h3><p>${esc(h.stream?.title||h.tag||h.cat||'Creator')}</p></button></article>`}
function homeBonus(){if(!isApprovedHost())return '';if(homeContentPending())return contentSkeleton('rows','Loading creator rewards',1);if(homeContentError())return '';const b=Home.bonus;if(!b)return '';return `<aside class="zh-bonus"><span class="zh-bonus-icon">${hi('gift',20)}</span><div><h3>${esc(b.title)}</h3><p>${b.claimed?'Reward claimed':`+${n(b.rewardCoins)} coins · ${esc(b.description||`${Math.min(b.progress,b.target)} / ${b.target} completed`)}`}</p></div><button onclick="homeClaim()" ${b.claimed||Home.claiming?'disabled':''}>${b.claimed?'Claimed':Home.claiming?'…':b.progress>=b.target?'Claim':'View'}</button></aside>`}
function homeEmpty(){return `<div class="zh-empty">${hi('broadcast',34)}<h3>A little quiet right now</h3><p>${Home.filter==='instant'?'No creators are available for a call right now. Try again shortly.':'Try another category or come back for a conversation.'}</p><button class="zh-soft" onclick="homeLoad()">Refresh ${hi('refresh',14)}</button></div>`}

function homeScreen(explore=false){if(!explore)return homeDashboard();const list=homeList(),pending=homeContentPending(),more=!DEMO&&Home.loadingMore&&(Home.loading||contentPending('home')),error=!pending&&!more&&homeContentError();return `<div class="zh-home ${explore?'zh-explore':''}">${explore?'<div class="zh-explore-heading"><span>FIND YOUR PEOPLE</span><h1>Explore BinzoLive</h1><p>A new voice. A fresh perspective. A conversation just for you.</p></div>':homeStage()}${homeFilters()}${error?`<div class="zh-error" role="alert">${esc(error)}<button onclick="homeLoad()">Retry</button></div>`:''}${!explore?homeFeatured()+homeMatch():''}${explore&&!pending&&!error?window.ZimiAds?.card('explore')||'':''}<section class="zh-trending"><div class="zh-section-title"><h2>${explore?'Creators to connect with':'Find your next call'}</h2>${!explore?'<button onclick="go(\'explore\')">See all <span>&rsaquo;</span></button>':pending?skeletonLine('74px',10):error?'':`<span>${n(Home.total)} creators</span>`}</div>${pending?contentSkeleton('cards','Loading creators',4):error?'':list.length?`<div class="zh-grid">${(explore?list:list.slice(0,4)).map(homeTile).join('')}</div>`:more?'':homeEmpty()}${more?contentSkeleton('cards','Loading more creators',2):''}${explore&&!pending&&!more&&!error&&Home.total>list.length?'<button class="zh-load-more" onclick="homeLoad(true)">Load more creators</button>':''}</section>${!explore?homeBonus():''}${DEMO?'<p class="zh-preview-note">Design preview &middot; sample creators and activity'+MODEL_NOTE+'</p>':''}</div>${homeGiftSheet()}`}

function homeOpen(id){if(!window.ZIMI_LIVE_STREAMING_ENABLED){const h=g(id);if(!h)return;return h.available&&!isHost()?homeCall(id):go('host',id)}if(Home.pendingClose)return appNotice(Home.closeError||'Finishing the previous live session…');const h=g(id);if(!h)return;if(h.stream){Home.streamBusy=true;Home.stream=h.stream;Home.hosting=false;Home.messages=[];Home.mediaStatus='Joining live session…';S.h=id;go('live');if(DEMO){Home.streamBusy=false;Home.mediaStatus='Design preview';r()}else Native.send('stream.join',{streamId:h.stream.id})}else if(h.available)homeCall(id);else go('host',id)}
function homeCall(id){const h=g(id);if(!h)return;if(!h.available&&!DEMO)return appNotice('This creator is not available for a call right now.');if(isHost())return appNotice('Calls can be started from a member account.');go('precall',id)}
function homeMatchNow(){if(Home.matching||!Home.availableCount)return;if(isHost())return appNotice('Switch to a member account to match with a creator.');Home.matching=true;r();if(DEMO){const h=homeList().find(h=>h.available);Home.matching=false;if(h)homeCall(h.id);return}Native.send('call.match',Home.categories.includes(Home.filter)?{category:Home.filter}:{})}
function homeGoLive(){if(!window.ZIMI_LIVE_STREAMING_ENABLED)return appNotice('Live streaming is temporarily unavailable. Go online for 1:1 calls from your creator settings.');if(!isApprovedHost()){window.ZimiHostAccess.guard();return}if(Home.pendingClose)return appNotice(Home.closeError||'Finishing the previous live session…');go('broadcast')}
function homeClaim(){if(!isApprovedHost()){window.ZimiHostAccess.guard();return}const b=Home.bonus;if(!b||b.claimed||Home.claiming)return;if(b.progress<b.target){appNotice(`${b.description||b.title} · ${n(b.progress)} / ${n(b.target)} completed`);return}Home.claiming=true;r();if(DEMO){b.claimed=true;Home.claiming=false;S.bal+=b.rewardCoins;r();return}Native.send('awards.claim',{task:b.id})}
function homeNotifications(){return window.ZimiNotifications.open()}

function homeMarkRead(id){znUpdate(true,id?[id]:null,!id)}
function homeNotificationsView(){return znView()}

function homeTime(value){const d=new Date(value);return Number.isNaN(d.getTime())?'':d.toLocaleDateString('en-IN',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})}
function homeRequestStreamClose(streamId,hosting){if(DEMO)return;Home.pendingClose={streamId,hosting};Home.closeError='';Native.send(hosting?'stream.end':'stream.leave',{streamId})}
function homeRetryStreamClose(){const pending=Home.pendingClose;if(pending)homeRequestStreamClose(pending.streamId,pending.hosting)}
function homeShowCloseError(){const el=document.getElementById('screen');if(Home.closeError&&Home.pendingClose&&['home','explore'].includes(S.v)&&el&&!el.querySelector('.zh-close-retry'))el.insertAdjacentHTML('afterbegin',`<div class="zh-error zh-close-retry" role="alert">${esc(Home.closeError)}<button onclick="homeRetryStreamClose()">Retry ending session</button></div>`)}
function homeBroadcast(){return `<section class="zh-broadcast"><span class="zh-eyebrow">YOUR STAGE IS READY</span><h1>Make it a moment.</h1><p>Share your world. Start a live conversation.</p><div class="zh-camera-preview"><video data-zimi-local autoplay muted playsinline></video><span>${hi('vid',38)}<b>${esc(Home.mediaStatus||'Camera preview')}</b></span></div><label>Give your live a title<input id="live-title" maxlength="120" placeholder="What’s happening today?" value="${esc(Home.draftTitle||'')}" oninput="Home.draftTitle=this.value"></label><label>Category<select id="live-category" onchange="Home.draftCategory=this.value">${Home.categories.map(c=>`<option ${Home.draftCategory===c?'selected':''} value="${esc(c)}">${esc(c)}</option>`).join('')}</select></label><button class="zh-primary zh-full" onclick="homeStartStream()" ${Home.streamBusy?'disabled':''}>${hi('broadcast',21)} ${Home.streamBusy?'Starting…':'Go Live'}</button><button class="zh-soft zh-full" onclick="go('setup')">${hi('ph',17)} Go online for 1-on-1 calls</button></section>`}
async function homeStartStream(){if(!window.ZIMI_LIVE_STREAMING_ENABLED)return homeGoLive();if(!isApprovedHost()){window.ZimiHostAccess.guard();return}if(Home.streamBusy)return;const title=(Home.draftTitle||'').trim();if(!title)return appNotice('Add a title for your live session.');Home.streamBusy=true;S.mic=1;S.cam=1;r();try{if(!DEMO)await window.ZimiMedia.prepare(true);if(S.v!=='broadcast'||!isApprovedHost()){window.ZimiMedia?.stop();Home.streamBusy=false;return}if(DEMO){Home.stream={id:'preview-live',title,category:Home.draftCategory||Home.categories[0],kind:'video',viewers:0};Home.hosting=true;Home.streamBusy=false;Home.mediaStatus='Design preview';go('live')}else Native.send('stream.start',{title,category:Home.draftCategory||Home.categories[0],kind:'video'})}catch(e){Home.streamBusy=false;Home.mediaStatus=e.message;r();appNotice(e.message)}}
function homeLive(){if(window.zrLive)return zrLive();const stream=Home.stream;if(!stream)return '<div class="zh-empty">This session has ended.</div>';const h=g(S.h);return `<section class="zh-room"><div class="zh-room-video">${h&&!Home.hosting?homeCover(h):''}<video ${Home.hosting?'data-zimi-local muted':'data-zimi-remote'} autoplay playsinline></video><div class="zh-room-shade"></div></div><div class="zh-room-top">${backButton("homeLeaveStream()",{label:Home.hosting?'End broadcast':'Leave live',media:true,slot:"zh-room-icon"})}<span class="zh-badge zh-live"><i></i> LIVE</span><span class="zh-viewers">${hi('eye',15)} ${homeCompact(stream.viewers)}</span><span class="zh-room-top-title">${esc(stream.title)}</span></div><p class="zh-media-status" role="status">${esc(Home.mediaStatus)}</p><div class="zh-room-bottom"><h2>${esc(Home.hosting?me.n:h?.n||'Live creator')} ${h?homeVerified(h):''}</h2><p>${esc(stream.title)}</p><div class="zh-room-messages" id="home-room-messages">${Home.messages.slice(-30).map(m=>`<p><b>${esc(m.name||'Viewer')}</b> ${esc(m.text)}</p>`).join('')}</div><form class="zh-room-chat" onsubmit="event.preventDefault();homeSendStreamMessage()"><input id="home-stream-message" maxlength="500" placeholder="Say something…" aria-label="Live chat message"><button aria-label="Send message">${hi('send',20)}</button>${!Home.hosting&&h?`<button type="button" class="zh-gift" onclick="homeGifts('${domId(h.id)}')" aria-label="Send a gift">${hi('gift',21)}</button>`:''}${Home.hosting?'<button type="button" onclick="homeLeaveStream()">End</button>':''}</form></div>${homeGiftSheet()}</section>`}
function homeSendStreamMessage(){const input=document.getElementById('home-stream-message'),text=input?.value.trim();if(!text||!Home.stream)return;if(DEMO){Home.messages.push({id:String(Date.now()),name:'You',text});r();return}Native.send('stream.message',{streamId:Home.stream.id,text});input.value=''}
function homeLeaveStream(){if(Home.stream)homeRequestStreamClose(Home.stream.id,Home.hosting);window.ZimiMedia?.stop();Home.stream=null;Home.streamBusy=false;Home.messages=[];Home.mediaStatus='';go('home');homeLoad()}
function homePrecall(){if(window.zpcScreen)return zpcScreen();const h=g(S.h);if(!h)return homeEmpty();return `<section class="zh-precall"><div class="zh-precall-photo">${homeCover(h,true)}<div class="zh-precall-shade"></div></div>${backButton("go('home')",{media:true,slot:"zh-precall-back"})}<div class="zh-precall-content"><div class="zh-precall-avatar">${homeCover(h)}</div><h1>${esc(h.n)} ${homeVerified(h)}</h1><p>${esc(h.tag||h.cat||'Creator')}</p><span class="zh-precall-status">${h.available||DEMO?'Online · Ready to connect':'Currently unavailable'}</span><div class="zh-precall-details"><span>Call rate <b>${homeRate(h)}</b></span>${h.fee?`<span>Entry fee <b>${n(h.fee)} coins</b></span>`:''}<span>Your balance <b>${contentBalance()} coins</b></span></div><p class="zh-precall-note">Your camera and microphone are used only when you start the call. You can turn them off at any time.</p>${S.pcerr?`<p class="zh-error" role="alert">${esc(S.pcerr)}</p>`:''}<button class="zh-primary zh-full" onclick="homeStartCall(false)" ${Home.preparingCall||(!h.available&&!DEMO)?'disabled':''}>${hi('vid',21)} ${Home.preparingCall?'Preparing camera…':'Start video call'}</button><button class="zh-soft zh-full" onclick="homeStartCall(true)" ${Home.preparingCall||(!h.available&&!DEMO)?'disabled':''}>${hi('ph',18)} Voice call</button></div></section>`}
// The pending object is an intent token: navigating away and returning to the
// same person never revives an earlier camera permission request.
let homeCallPreparation = null;
function homeCallUnavailable(id){return !g(id)||(!DEMO&&!g(id).available)}
function homeCallFundsReady(h){
  if(!h)return false;
  if(h.rate>0&&!coinWalletReady()){r();return false}
  if(h.rate>0&&S.bal<h.rate){r();return false}
  return true;
}
function homeStartCall(voice=false){
  if(S.v!=='precall'||Home.preparingCall)return;
  if(isHost()){appNotice('Calls can be started from a member account.');return}
  if(homeCallUnavailable(S.h)){S.pcerr='This creator is not available for a call right now.';r();return}
  const setup=Home.dashboardSetup,h=g(S.h);
  if(window.ZIMI_LIVE_STREAMING_ENABLED&&setup?.hostId===S.h){
    if(setup.streamId)return homeDashboardConfirmCall();
    // If the creator went live while this review was open, show the changed
    // request flow before accepting confirmation. Do not ring a broadcaster.
    if(h.stream){setup.streamId=h.stream.id;S.pcerr='';r();return}
  }
  if(!homeCallFundsReady(g(S.h)))return;
  S.nextCallVoice=!!voice;S.callId=null;S.pcerr='';
  return go('dial',S.h);
}
function homeCancelPrepare(message='',paint=true){
  const pending=homeCallPreparation;
  if(!pending)return;
  homeCallPreparation=null;clearTimeout(pending.timer);
  Home.preparingCall=false;Home.preparingVoice=false;Home.mediaStatus=message;
  S.allowPreparedCall=false;S.pcerr=message;
  // stop() also invalidates getUserMedia promises; any late stream is released
  // by the media layer without interfering with a newer capture.
  window.ZimiMedia?.stop();pending.cancel();
  if(paint&&S.v===pending.screen)r();
}
function homeValidatePreparingPeer(){
  const pending=homeCallPreparation;
  if(pending&&pending.view==='dial'&&homeCallUnavailable(pending.target))homeCancelPrepare('This creator is no longer available. Please try again later.');
}
async function homePrepareCall(view,id){
  if(Home.preparingCall)return;
  if(view==='dialback'&&!isApprovedHost()){window.ZimiHostAccess.guard();return}
  const target=view==='dialback'?S.caller?.id:(id||S.h);
  if(!target||(view==='dial'&&homeCallUnavailable(target))){S.pcerr='This creator is not available for a call right now.';r();return}
  if(view==='dial'&&isHost()){appNotice('Calls can be started from a member account.');return}
  const voice=view==='dialback'?false:!!S.nextCallVoice;
  const pending={view,target,voice,screen:S.v,screenPeer:S.h,caller:S.caller?.id,timer:null,cancel:null};
  const cancelled=new Promise(resolve=>{pending.cancel=()=>resolve(false)});
  homeCallPreparation=pending;Home.preparingCall=true;Home.preparingVoice=voice;
  Home.mediaStatus=voice?'Waiting for microphone access…':'Waiting for camera and microphone access…';
  if(!voice)S.scam=1;
  S.pcerr='';r();
  pending.timer=setTimeout(()=>{
    if(homeCallPreparation===pending)homeCancelPrepare(voice?'Microphone access is taking too long. Allow microphone access in your device settings, then try again.':'Camera access is taking too long. Allow camera and microphone access in your device settings, then try again.');
  },30000);
  try{
    if(!window.ZimiMedia?.prepare)throw new Error('Calling is unavailable right now. Please reopen the app and try again.');
    const ready=await Promise.race([window.ZimiMedia.prepare(!voice).then(()=>true),cancelled]);
    if(!ready||homeCallPreparation!==pending)return;
    if(S.v!==pending.screen||S.h!==pending.screenPeer||(view==='dialback'&&(S.caller?.id!==pending.caller||!isApprovedHost()))){homeCancelPrepare('',false);return}
    if(view==='dial'&&(isHost()||homeCallUnavailable(target))){homeCancelPrepare('This creator is no longer available. Please try again later.');return}
    clearTimeout(pending.timer);homeCallPreparation=null;
    Home.preparingCall=false;Home.preparingVoice=false;Home.mediaStatus='Connecting…';
    S.nextCallVoice=voice;S.allowPreparedCall=true;
    try{go(view,target)}finally{S.allowPreparedCall=false}
  }catch(error){
    if(homeCallPreparation!==pending)return;
    const message=error?.message||'Your camera or microphone could not be started. Please try again.';
    homeCancelPrepare(message);appNotice(message);
  }
}
async function homeAcceptCall(){if(!isApprovedHost()){window.ZimiHostAccess.guard();return}if(S.acceptingCall)return;const callId=S.caller?.callId;if(!callId)return;S.acceptingCall=true;Home.mediaStatus='Connecting…';r();try{await window.ZimiMedia.prepare(!S.caller.voice);if(S.v!=='ring'||S.caller?.callId!==callId||!isApprovedHost()){S.acceptingCall=false;window.ZimiMedia.stop();return}Native.send('call.accept',{callId})}catch(e){S.acceptingCall=false;appNotice(e.message);r()}}
function homeCallView(host){if(window.zrCall)return zrCall(host);const p=host?S.caller:g(S.h),voice=host?S.caller?.voice:S.v==='voice';return `<section class="zh-room zh-call-room"><div class="zh-room-video">${voice?`<div class="zh-voice-person">${avc(p,110)}<h2>${esc(p.n)}</h2></div><video data-zimi-remote autoplay playsinline style="display:none"></video>`:`<video data-zimi-remote autoplay playsinline></video>`}<div class="zh-room-shade"></div></div><div class="zh-room-top">${backButton("endCall()",{label:"End call",media:true,slot:"zh-room-icon"})}<span class="zh-viewers"><i class="zh-online-dot"></i><span id="ck">${clock(S.sec)}</span></span><span class="zh-room-top-title">${esc(p.n)} · ${voice?'Voice':'Video'} call</span></div>${!voice?'<div class="zh-call-pip"><video data-zimi-local autoplay muted playsinline></video><span>You</span></div>':''}<p class="zh-media-status" role="status">${esc(Home.mediaStatus)}</p><div class="zh-room-bottom"><div class="zh-call-controls"><button onclick="S.mic=S.mic?0:1;r()" aria-label="${S.mic?'Mute':'Unmute'} microphone" aria-pressed="${!S.mic}">${hi(S.mic?'mic':'micoff',22)}<span>${S.mic?'Mute':'Unmute'}</span></button>${!voice?`<button onclick="toggleCam()" aria-label="${camOn()?'Turn camera off':'Turn camera on'}" aria-pressed="${!camOn()}">${hi(camOn()?'vid':'camoff',22)}<span>Camera</span></button>`:''}${!host?`<button onclick="homeGifts('${domId(p.id)}')" aria-label="Send a gift">${hi('gift',22)}<span>Gift</span></button>`:''}<button class="zh-end-call" onclick="endCall()" aria-label="End call">${hi('ph',23)}<span>End</span></button></div><p class="zh-free-call">${DEMO?'Design preview':S.callRate?`${n(S.callRate)} coins a minute · billed by the second`:'Free call · gifts are optional'}</p></div>${homeGiftSheet()}</section>`}
function homeCallSetup(){return hcSetupView()}
function homeSetPresence(online){if(online&&!isApprovedHost()){window.ZimiHostAccess.guard();return}if(Home.presenceBusy)return;Home.presenceBusy=true;Native.send('presence.set',{online,visible:true});if(DEMO){Native.receive({type:'presence.saved',data:{online,visible:true}});return}r()}
function homeWaiting(){return hcWaitingView()}
function homeCallSummary(){const s=S.sum,host=s?.k==='host',recharge=!!s?.outOfCoins&&!host;if(host)return hcSummaryView(s);return `<section class="zh-broadcast zh-summary"><div class="zh-ready-illustration">${hi('ph',42)}</div><h1>${recharge?'Your coins ran out.':'A moment well shared.'}</h1><p>${recharge?'The call ended when your balance reached zero. Recharge to call again.':s?.outOfCoins?'The call ended when the member ran out of coins.':'Your call has ended.'}</p><div class="zh-precall-details"><span>Duration <b>${clock(s?.sec||0)}</b></span><span>${host?'Coins earned':'Call charge'} <b>${s?.rate?`${n(s.coins||0)} coins`:'Free'}</b></span>${s?.entryFee?`<span>Entry fee <b>${n(s.entryFee)} coins</b></span>`:''}${!host&&s?.giftV?`<span>Gifts sent (${n(s.gifts||0)}) <b>${n(s.giftV)} coins</b></span>`:''}</div>${recharge?`<button class="zh-primary zh-full" onclick="S.callId=null;go('coins')">Buy coins</button>`:''}<button class="${recharge?'zh-soft':'zh-primary'} zh-full" onclick="S.callId=null;go('home');homeLoad()">Back to Home</button><button class="zh-soft zh-full" onclick="go('calls')">Call history</button>${window.ZimiAds?.card('call_summary')||''}</section>`}
let homeSearchTimer;
function homeSearchInput(value){S.sq=value;clearTimeout(homeSearchTimer);if(DEMO)return homeSearchRequest();Home.searchLoading=true;Home.searchMore=false;Home.searchError='';contentStart('search',{page:1});homePaintSearch();homeSearchTimer=setTimeout(()=>homeSearchRequest(),280)}

function homeSearchRequest(more=false){if(more&&Home.searchLoading)return;const q=S.sq||'',page=more?(Home.searchPage||1)+1:1;Home.searchLoading=!DEMO;Home.searchMore=more;Home.searchError='';if(DEMO){const rows=Home.hosts.filter(h=>(h.n+' '+h.cat).toLowerCase().includes(q.toLowerCase()));Home.searchRows=rows;Home.searchTotal=rows.length;Home.searchPage=1;Home.searchQuery=q;Home.searchLoading=false;Home.searchMore=false;homePaintSearch();return}contentStart('search',{page});homePaintSearch();Native.send('hosts.search',{q,page})}

function homeSearchResults(){const pending=!DEMO&&(Home.searchLoading||contentPending('search')),more=pending&&Home.searchMore,error=!pending&&(Home.searchError||(!DEMO&&ContentLoading.search.error)),list=Home.searchQuery===(S.sq||'')?Home.searchRows||[]:[];if(pending&&!more)return contentSkeleton('cards','Finding creators',4);if(error)return `<div class="zh-error" role="alert">${esc(error)}<button onclick="homeSearchRequest()">Retry</button></div>`;return `${list.length?`<div class="zh-grid">${list.map(homeTile).join('')}</div>`:!pending?'<div class="zh-empty"><h3>No creators found</h3><p>Try another name or category.</p></div>':''}${more?contentSkeleton('cards','Loading more search results',2):''}${!pending&&Home.searchTotal>list.length?'<button class="zh-load-more" onclick="homeSearchRequest(true)">Load more</button>':''}`}

function homePaintSearch(){const el=document.getElementById('home-search-results');if(el)el.innerHTML=homeSearchResults()}
function homeSearchView(){return `<section class="zh-home zh-search"><div class="zh-section-title"><h2>Find your next connection</h2></div><div id="home-search-results">${homeSearchResults()}</div></section>`}
function homeTheme(){document.documentElement.classList.toggle('zc-app',S.v==='chats');const active=!['welcome','login'].includes(S.v);document.documentElement.classList.toggle('zh-app',active);if(active&&!window.ZimiThemes){document.documentElement.dataset.theme='dark';document.documentElement.dataset.canvas='#210f1d'}document.getElementById('nav')?.classList.toggle('zh-nav',['home','explore','chats','profile','settings'].includes(S.v));window.ZimiProfile?.theme()}
window.ZimiHome={render:()=>homeScreen(),coins:homeCoins,nav:homeNav,theme:homeTheme,views:{explore:()=>homeScreen(true),search:homeSearchView,notifications:homeNotificationsView,broadcast:homeBroadcast,live:homeLive},header:()=>{
  if(S.v==='home')return homeHeader();
  // Main tabs already provide their title and relevant actions in the page.
  if(['explore','chats','profile','settings'].includes(S.v))return '';
  if(S.v==='themes')return window.ZimiThemes.header();
  if(S.v==='search')return `<header class="zh-search-header">${backButton("go('home')",{label:"Back to home"})}<div>${hi('srch',20)}<input id="sq" value="${esc(S.sq||'')}" maxlength="100" placeholder="Search creators or categories" aria-label="Search creators" oninput="homeSearchInput(this.value)"></div></header>`;
  if(S.v==='live')return '';
  const title={notifications:'Notifications',broadcast:'Go Live',coins:'Your coins'}[S.v];
  return title?`<header class="zh-subheader">${backButton("go('home')",{label:"Back to home"})}<h1>${title}</h1>${S.v==='coins'?`<span>${hi('rings',15)} ${contentBalance()}</span>`:''}</header>`:null;
},afterRender:()=>{contentImagesReady();homeShowCloseError();window.ZimiCoins?.afterRender();const feed=document.getElementById('home-room-messages');if(feed)feed.scrollTop=feed.scrollHeight}};

Native.on('data.home',d=>{Home.loading=false;Home.loadingMore=false;Home.loaded=true;Home.error='';const list=(d.hosts||[]).map(homeRemember);Home.hosts=d.page>1?[...Home.hosts,...list.filter(h=>!Home.hosts.some(x=>x.id===h.id))]:list;Home.stage=(d.stage||[]).map(homeRemember);Home.featured=d.featured?homeRemember(d.featured):null;Home.total=d.total||0;Home.page=d.page||1;Home.broadcasterCount=d.broadcasterCount||0;Home.availableCount=d.availableCount||0;Home.speedMatchEnabled=d.speedMatchEnabled!==false;Home.bonus=d.bonus||null;Home.unreadCount=d.unreadCount||0;if(d.categories?.length)Home.categories=d.categories;homeValidatePreparingPeer();if(['home','explore','chats','precall'].includes(S.v))r()});
Native.on('data.notifications',d=>window.ZimiNotifications.receive(d));
Native.on('data.hosts',()=>{homeValidatePreparingPeer();if(S.v==='precall')r()});
Native.on('data.search',d=>{if(d.q!==(S.sq||''))return;Home.searchLoading=false;Home.searchMore=false;Home.searchError='';Home.searchQuery=d.q;Home.searchPage=d.page;Home.searchTotal=d.total;const rows=(d.hosts||[]).map(homeRemember);Home.searchRows=d.page>1?[...(Home.searchRows||[]),...rows.filter(h=>!Home.searchRows?.some(x=>x.id===h.id))]:rows;homePaintSearch()});
Native.on('data.catalog',d=>{Home.gifts=d.gifts||[];Home.packs=d.packs||[];Home.paymentsAvailable=!!d.paymentsAvailable;if(S.v==='coins'||S.v==='thread'||Home.giftTo)r()});
Native.on('call.matched',d=>{Home.matching=false;const h=homeRemember(d.host);homeCall(h.id)});
Native.on('awards.claimed',d=>{Home.claiming=false;if(Home.bonus?.id===d.task)Home.bonus.claimed=true;appNotice('Reward added to your wallet.');r()});
Native.on('presence.saved',d=>{const changed=Home.presenceBusy,knownHost=isApprovedHost()||window.ZimiHostAccess?.checking()&&S.role==='host';Home.presenceBusy=false;S.online=knownHost&&d.online?1:0;S.vis=knownHost&&d.visible?1:0;if(changed){go(d.online?'waiting':'home');homeLoad()}else if(['home','waiting'].includes(S.v))r()});
Native.on('call.created',d=>{S.callId=d.callId});
Native.on('stream.opened',d=>{if(!window.ZIMI_LIVE_STREAMING_ENABLED){Native.send(d.hosting?'stream.end':'stream.leave',{streamId:d.stream.id});return}if(Home.dashboardCall&&d.stream.id!==Home.dashboardCall.streamId){Native.send(d.hosting?'stream.end':'stream.leave',{streamId:d.stream.id});return}Home.streamBusy=false;if(d.hosting&&!isApprovedHost()){Native.send('stream.end',{streamId:d.stream.id});window.ZimiMedia?.stop();return}if(!['live','broadcast'].includes(S.v)){Native.send(d.hosting?'stream.end':'stream.leave',{streamId:d.stream.id});return}Home.stream=d.stream;Home.hosting=d.hosting;Home.messages=d.messages||[];Home.mediaStatus='Connecting video…';go('live');window.ZimiMedia?.openStream(d.stream,d.hosting)});
Native.on('stream.message',d=>{if(Home.stream?.id!==d.streamId)return;if(!Home.messages.some(x=>x.id===d.id))Home.messages.push(d);if(Home.messages.length>200)Home.messages.splice(0,Home.messages.length-200);if(S.v==='live'&&window.zrPaintMessages){zrPaintMessages();return}if(S.v==='live'){const input=document.getElementById('home-stream-message'),draft=input?.value;r();const next=document.getElementById('home-stream-message');if(next&&draft)next.value=draft}});
Native.on('stream.viewers',d=>{if(Home.stream?.id===d.streamId){Home.stream.viewers=d.count;if(S.v==='live'){const counter=document.querySelector('[data-room-viewers]');if(counter)counter.textContent=homeCompact(d.count);else r()}}const h=H.find(h=>h.stream?.id===d.streamId);if(h){h.viewers=d.count;h.stream.viewers=d.count}});
Native.on('stream.ended',d=>{if(Home.pendingClose?.streamId===d.streamId){Home.pendingClose=null;Home.closeError=''}if(Home.stream?.id===d.streamId){window.ZimiMedia?.stop();Home.stream=null;go('home');appNotice('This live session has ended.');homeLoad()}});
Native.on('stream.closed',d=>{if(Home.pendingClose?.streamId===d.streamId){Home.pendingClose=null;Home.closeError='';if(S.v==='home')r()}});
Native.on('operation.error',d=>{if(['stream.end','stream.leave'].includes(d.action)&&Home.pendingClose){Home.closeError=d.message;homeShowCloseError()}});
Native.on('operation.error',d=>{if(d.action==='home.reload'){Home.loading=false;Home.loadingMore=false;Home.error=d.message}if(d.action==='call.match')Home.matching=false;if(d.action==='awards.claim')Home.claiming=false;if(d.action==='notifications.load')Home.notifyLoading=false;if(d.action==='presence.set')Home.presenceBusy=false;if(d.action==='call.accept'){S.acceptingCall=false;window.ZimiMedia?.stop()}if(d.action?.startsWith('stream.')){Home.streamBusy=false;Home.mediaStatus=d.message}if(['home','explore','chats','coins','notifications','live','broadcast','setup','waiting','ring'].includes(S.v))r()});
// Revocation immediately closes host surfaces; member calls and viewing remain available.
window.addEventListener('zimi:host-access',event=>{
  // A reconnect checks permission for new activity without interrupting an existing session.
  // Checking is not a revocation and must never erase the saved online choice.
  if(event.detail.checking)return;
  if(!event.detail.approved){
    if(homeCallPreparation?.view==='dialback')homeCancelPrepare('',false);
    const hostCall=['ring','hcall','dialback'].includes(S.v);
    const hostedStream=Home.hosting&&!!Home.stream;
    if(hostedStream){homeRequestStreamClose(Home.stream.id,true);Home.stream=null;Home.hosting=false;Home.messages=[]}
    if(hostCall){
      const callId=S.callId||S.caller?.callId;
      if(callId)Native.send(S.v==='ring'?'call.decline':'call.end',{callId,reason:'approval_removed'});
      S.callId=null;S.caller=null;
    }
    if(hostedStream||hostCall||S.v==='broadcast')window.ZimiMedia?.stop();
    S.online=0;S.vis=0;S.acceptingCall=false;Home.presenceBusy=false;Home.streamBusy=false;Home.claiming=false;Home.bonus=null;
    if(hostedStream||['broadcast','setup','waiting','ring','hcall','dialback','awards','payout'].includes(S.v)){go('home');return}
  }
  if(['home','explore','chats','profile','settings','notifications'].includes(S.v))r();
});
Native.on('session.expired',()=>homeReset());Native.on('session.none',()=>homeReset());
function homeReset(){window.ZimiNotifications?.reset();homeCancelPrepare('',false);S.allowPreparedCall=false;S.nextCallVoice=false;S.pcerr='';if(window.ZimiProfile)zpReset();window.ZimiNavigation?.reset();window.ZimiHostAccess?.reset();if(window.zcReset)zcReset();contentReset();window.ZimiCoins?.reset();clearTimeout(homeSearchTimer);Object.assign(Home,{hosts:[],stage:[],featured:null,total:0,broadcasterCount:0,availableCount:0,bonus:null,notifications:[],unreadCount:0,checkout:null,checkoutAttempt:null,checkoutBusy:false,stream:null,streamBusy:false,dashboardCall:null,dashboardSetup:null,pendingClose:null,closeError:'',hosting:false,messages:[],giftTo:null,giftAttempt:null,giftBusy:false,gifts:[],packs:[],paymentsAvailable:false,packId:'',notifyLoading:false,claiming:false,loaded:false,loading:false,loadingMore:false,error:'',speedMatchEnabled:true,matching:false,searchRows:[],searchQuery:'',searchPage:1,searchMore:false,searchTotal:0,searchError:'',searchLoading:false,preparingCall:false,preparingVoice:false,presenceBusy:false,mediaStatus:'',draftTitle:'',filter:'popular',dashboardFilter:'popular',page:1,queryKey:'popular|'});window.ZimiMedia?.stop()}
Native.on('operation.error',d=>{if(d.action==='hosts.search'){Home.searchLoading=false;Home.searchMore=false;Home.searchError=d.message;homePaintSearch()}});
document.addEventListener('aurora:navigate',()=>{homeCancelPrepare();if(!DEMO&&['home','explore'].includes(S.v)&&Home.queryKey!==homeFeedKey())homeLoad();if(S.v==='search'){Home.searchRows=[];Home.searchTotal=0;homeSearchRequest()}if(S.v==='coins'&&!DEMO)Native.send('catalog.load')});
window.addEventListener('pagehide',()=>homeCancelPrepare('',false));

if(DEMO){
  const demo=[
    {id:'aanya',name:'Ananya Iyer',category:'Music',tag:'Ghazals, guitar and late-night chai',avatarUrl:PREVIEW_HOSTS[0],coverUrl:PREVIEW_HOSTS[0],ratePerMin:50,entryFee:0,online:true,live:true,verified:true,availableForCall:true,stream:{id:'demo-ananya',title:'Ghazals, guitar and late-night chai',kind:'video',viewers:3400}},
    {id:'meher',name:'Meher Kaur',category:'Music',tag:'Sufi songs and slow evenings',avatarUrl:PREVIEW_HOSTS[1],coverUrl:PREVIEW_HOSTS[1],ratePerMin:40,online:true,verified:true,availableForCall:true},
    {id:'ishaan',name:'Ishita Rao',category:'Gaming',tag:'BGMI ranked and friendly banter',avatarUrl:PREVIEW_HOSTS[2],coverUrl:PREVIEW_HOSTS[2],online:true,live:true,verified:true,availableForCall:false,stream:{id:'demo-ishaan',title:'BGMI ranked and friendly banter',kind:'video',viewers:890}},
    {id:'noor',name:'Noor Siddiqui',category:'Talk',tag:'Deep talks over chai',avatarUrl:PREVIEW_HOSTS[3],coverUrl:PREVIEW_HOSTS[3],ratePerMin:60,online:true,verified:false,availableForCall:true},
    {id:'kabir',name:'Kavya Malhotra',category:'Music',tag:'Bollywood, unplugged',avatarUrl:PREVIEW_HOSTS[4],coverUrl:PREVIEW_HOSTS[4],online:true,live:true,verified:true,availableForCall:false,stream:{id:'demo-kabir',title:'Bollywood, unplugged',kind:'video',viewers:2100}}
  ];
  Home.hosts=demo.map(homeRemember);Home.featured=Home.hosts[0];Home.stage=[Home.hosts[0],Home.hosts[2],Home.hosts[1],Home.hosts[4]];Home.hosts=[Home.hosts[1],Home.hosts[2],Home.hosts[3],Home.hosts[4],Home.hosts[0]];
  Home.total=5;Home.broadcasterCount=1400;Home.availableCount=1420;S.bal=1250;
  Home.bonus={id:'demo-bonus',title:'Creator Bonus',description:'Connect in your first 1:1 call',rewardCoins:200,progress:0,target:1,claimed:false};
  Home.notifications=[{id:'demo-welcome',title:'Welcome to BinzoLive',body:'Find your people. Make your first connection.',createdAt:new Date().toISOString(),read:false}];Home.unreadCount=1;
  Home.gifts=[{id:'demo-rose',name:'Rose',emoji:'🌹',coins:99},{id:'demo-heart',name:'Love',emoji:'💗',coins:199},{id:'demo-party',name:'Party',emoji:'🎉',coins:499},{id:'demo-crown',name:'Crown',emoji:'👑',coins:999}];
  Home.packs=[{id:'demo-small',name:'A little love',coins:200,pricePaise:9900},{id:'demo-medium',name:'Fan favourite',coins:625,pricePaise:24900},{id:'demo-large',name:'Make it special',coins:1250,pricePaise:49900}];Home.paymentsAvailable=true;
}
