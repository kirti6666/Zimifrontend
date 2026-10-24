/* Themes are server-owned. Only acknowledged selections are applied in the app. */
const ZThemes={catalog:null,loading:false,error:'',saving:'',requestId:0,checkout:null,checkoutBusy:false,attempt:'',requestedRoute:undefined,accountId:'',signature:'',transitionTimer:null,refreshView:null,renderView:null,returnTo:'profile',returnScroll:0,returnFocus:''};
const ZThemeFonts={system:'Inter, system-ui, sans-serif',rounded:'"Poppins", system-ui, sans-serif',serif:'Georgia, "Times New Roman", serif',mono:'ui-monospace, "SFMono-Regular", Consolas, monospace'};
const ZThemeOriginal={id:'000000000000000000000001',name:'BinzoLive Original',description:'Our signature rose, beautifully balanced.',mode:'dark',active:true,isPremium:false,isDefault:true,colors:{background:'#210f1d',surface:'#321e2c',surfaceElevated:'#3c2635',text:'#fce8f2',textMuted:'#c5a9bc',primary:'#c9086a',primaryContrast:'#ffffff',secondary:'#ff9ccc',border:'#654356',success:'#45d5a0',danger:'#ffb2b9'},typography:{fontFamily:'system',fontScale:1,fontWeight:'400',headingWeight:'700'}};
const ZThemeRose={...ZThemeOriginal,id:'000000000000000000000002',name:'Soft Rose',description:'A fresh, airy take on your everyday.',mode:'light',isDefault:false,colors:{background:'#fff5fa',surface:'#ffffff',surfaceElevated:'#f4dfeb',text:'#321525',textMuted:'#79556a',primary:'#b50a65',primaryContrast:'#ffffff',secondary:'#a63f75',border:'#d6b5c9',success:'#147a53',danger:'#b52b46'}};
const ZThemeColorKeys=Object.keys(ZThemeOriginal.colors);
const ZThemeVars=['--canvas','--deep','--surface','--raised','--line','--ink','--muted','--faint','--accent','--accent-ink','--accent-wash','--accent-line','--live','--live-wash','--online','--cta','--cta-ink','--btn','--btn-ink','--theme-danger'];
// Registered color properties let gradients interpolate, without taking screenshots,
// cloning the page, interrupting media, or animating the layout.
if(window.CSS?.registerProperty)for(const name of ZThemeVars){try{CSS.registerProperty({name,syntax:'<color>',inherits:true,initialValue:'#210f1d'})}catch{}}
if(window.CSS?.registerProperty)document.documentElement.dataset.themeInterpolation='true';
function ztSafe(theme){return !!theme&&/^[a-zA-Z0-9_-]{1,80}$/.test(theme.id||'')&&['light','dark'].includes(theme.mode)&&ZThemeColorKeys.every(key=>/^#[0-9a-f]{6}$/i.test(theme.colors?.[key]))&&Object.hasOwn(ZThemeFonts,theme.typography?.fontFamily)&&Number.isFinite(theme.typography.fontScale)&&theme.typography.fontScale>=.9&&theme.typography.fontScale<=1.15&&['400','500','600'].includes(theme.typography.fontWeight)&&['600','700','800'].includes(theme.typography.headingWeight)}
// The admin default and this account's theme from the last launch, embedded by the app before first paint.
ZThemes.default=ztSafe(window.__zimiThemeCache?.default)?window.__zimiThemeCache.default:null;
ZThemes.boot=ztSafe(window.__zimiThemeCache?.account?.theme)?window.__zimiThemeCache.account:null;
/* Until the server catalog answers: the account's last theme, then the admin default. */
function ztCurrent(){const catalog=ZThemes.catalog,theme=catalog?.items.find(x=>x.id===catalog.selectedThemeId&&x.active!==false&&(!x.isPremium||catalog.premium?.active));if(theme&&ztSafe(theme))return theme;const boot=ZThemes.boot;if(boot&&(!ZThemes.accountId||ZThemes.accountId===boot.id))return boot.theme;return ZThemes.default||ZThemeOriginal}
function ztApply(animate=false){
  const root=document.documentElement;
  const theme=ztCurrent(),c=theme.colors,t=theme.typography,signature=JSON.stringify([theme.id,c,t]);
  root.classList.toggle('zp-light',theme.mode==='light');if(root.dataset.theme!==theme.mode)root.dataset.theme=theme.mode;if(root.dataset.canvas!==c.background)root.dataset.canvas=c.background;
  for(const [key,value] of Object.entries({themeInk:c.text,themePrimary:c.primary,themeContrast:c.primaryContrast,themeSurface:c.surface,themeRaised:c.surfaceElevated}))if(root.dataset[key]!==value)root.dataset[key]=value;
  if(signature===ZThemes.signature)return;
  const motion=animate&&ZThemes.signature&&!matchMedia('(prefers-reduced-motion: reduce)').matches;
  clearTimeout(ZThemes.transitionTimer);root.classList.toggle('zt-transition',!!motion);
  const values=[c.background,c.background,c.surface,c.surfaceElevated,c.border,c.text,c.textMuted,c.textMuted,c.primary,c.secondary,c.surfaceElevated,c.border,c.primary,c.surfaceElevated,c.success,c.primary,c.primaryContrast,c.primary,c.primaryContrast,c.danger];
  ZThemeVars.forEach((key,i)=>root.style.setProperty(key,values[i]));
  root.style.setProperty('--theme-font',ZThemeFonts[t.fontFamily]);root.style.setProperty('--theme-font-scale',String(t.fontScale));root.style.setProperty('--theme-font-weight',t.fontWeight);root.style.setProperty('--theme-heading-weight',t.headingWeight);root.dataset.themeId=theme.id;ZThemes.signature=signature;
  if(motion)ZThemes.transitionTimer=setTimeout(()=>root.classList.remove('zt-transition'),320);
}
function ztLabel(){return ztCurrent().name+' · Active'}
function ztScrollPosition(){return window.ZimiOffline?.scrollPosition()??document.getElementById('scroll-root')?.scrollTop??0}
function ztRestoreScroll(top){if(window.ZimiOffline?.restoreScroll(top))return;if(window.zimiScrollTo)window.zimiScrollTo(top);else document.getElementById('scroll-root').scrollTop=top}
function ztViewState(){const el=document.getElementById('zt-content');return {top:ztScrollPosition(),focus:el?.contains(document.activeElement)?document.activeElement.id:''}}
function ztRestoreView(view){if(!view||S.v!=='themes')return;const target=view.focus?document.getElementById(view.focus):null;target?.focus({preventScroll:true});ztRestoreScroll(view.top)}
function ztPaint(){
  const el=S.v==='themes'?document.getElementById('zt-content'):null;
  if(el){
    const view=ztViewState();
    if(ZThemes.loading&&!ZThemes.refreshView)ZThemes.refreshView=view;
    const restore=ZThemes.refreshView||view;
    el.innerHTML=ztContent();ztRestoreView(restore);
    if(!ZThemes.loading)ZThemes.refreshView=null;
  }
  const label=document.querySelector('[data-theme-label]');if(label)label.textContent=ztLabel();
}
function ztLoad(){if(DEMO){ztPaint();return}if(ZThemes.loading)return;ZThemes.loading=true;ZThemes.error='';ztPaint();Native.send('themes.load')}
function ztBeforeNavigate(view){
  if(view==='themes'&&S.v!=='themes'){
    const fromAccount=['profile','settings'].includes(S.v);
    ZThemes.returnTo=S.v==='settings'?'settings':'profile';
    ZThemes.returnScroll=fromAccount?ztScrollPosition():0;
    ZThemes.returnFocus=fromAccount?document.activeElement?.getAttribute('aria-label')||'':'';
    ZThemes.refreshView=null;ZThemes.renderView=null;
    zpClose();ztLoad();
  }else if(view!=='themes'){ZThemes.refreshView=null;ZThemes.renderView=null}
}
function ztOpen(){go('themes')}
function ztBack(){
  const target=ZThemes.returnTo==='settings'?'settings':'profile',top=ZThemes.returnScroll,focus=ZThemes.returnFocus;
  go(target);ztRestoreScroll(top);
  if(focus)[...document.querySelectorAll('.zp-page [aria-label]')].find(el=>el.getAttribute('aria-label')===focus)?.focus({preventScroll:true});
}
function ztHeader(){return `<header class="zh-subheader zt-header">${backButton('ztBack()',{label:ZThemes.returnTo==='settings'?'Back to settings':'Back to profile'})}<h1>Appearance &amp; Theme</h1></header>`}
function ztPage(){ZThemes.renderView=document.getElementById('zt-page')?ztViewState():null;return `<section class="zt-page" id="zt-page" aria-label="Theme gallery"><div id="zt-content">${ztContent()}</div></section>`}
function ztSkeleton(){return `<div class="zt-grid" role="status" aria-label="Loading themes">${Array.from({length:ZThemes.catalog?.items.length||4},()=>`<div class="zt-card zt-placeholder"><span class="zh-skeleton-shape zt-preview"></span>${skeletonLine('65%',14)}${skeletonLine('85%',10)}${skeletonLine('45%',11)}</div>`).join('')}</div>`}
function ztCard(theme){
  const active=ztCurrent().id===theme.id,locked=theme.isPremium&&!ZThemes.catalog?.premium?.active,busy=ZThemes.saving===theme.id,c=theme.colors,t=theme.typography;
  // All style values are validated; no administrator-supplied CSS is executed.
  const style=`--preview-bg:${c.background};--preview-surface:${c.surface};--preview-text:${c.text};--preview-muted:${c.textMuted};--preview-primary:${c.primary};--preview-contrast:${c.primaryContrast};font-family:${ZThemeFonts[t.fontFamily]}`;
  return `<button type="button" id="zt-theme-${theme.id}" class="zt-card ${active?'is-active':''}" aria-pressed="${active}" aria-label="${esc((locked?'Unlock ':active?'Current theme: ':'Use ')+theme.name)}" onclick="ztSelect('${theme.id}')" ${ZThemes.saving?'disabled':''}><span class="zt-preview" style="${esc(style)}" aria-hidden="true"><span class="zt-mini-top"><b>BinzoLive</b><i></i></span><span class="zt-mini-avatars"><i></i><i></i><i></i></span><span class="zt-mini-panel"><b style="font-weight:${t.headingWeight}">Hello, you.</b><small>A little more your style.</small><span>Connect</span></span><span class="zt-mini-nav"><i></i><i></i><i></i></span></span><span class="zt-card-title"><b>${esc(theme.name)}</b><span>${active?'✓':locked?'◇':''}</span></span>${theme.isDefault?'<span class="zt-default">App default</span>':''}<span class="zt-card-description">${esc(theme.description||'A new look for your BinzoLive.')}</span><span class="zt-card-foot"><span>${theme.isPremium?'Premium':'Free'} · ${esc({system:'Classic',rounded:'Rounded',serif:'Editorial',mono:'Mono'}[t.fontFamily])}</span><b>${busy?'Applying…':active?'Active':locked?'Unlock':'Apply'}</b></span></button>`;
}
function ztContent(){
  const catalog=ZThemes.catalog,p=catalog?.premium,items=(catalog?.items||[]).filter(x=>x.active!==false&&ztSafe(x)),payment=ZThemes.checkout;
  const status=payment?.status==='SUCCESS'?'Payment confirmed. Your premium access is being refreshed.':payment?.status==='FAILED'?'Payment was not completed. You can try again.':payment?.status==='REVERTED'?'This payment was reversed. Choose a free theme or purchase premium again.':'Complete checkout, then check your payment status.';
  return `<div class="zt-intro"><span class="zt-eyebrow">MAKE IT YOURS</span><p>Find your everyday favorite.</p><small>Curated colors and text styles, across your app.</small></div>${ZThemes.loading?ztSkeleton():ZThemes.error&&!catalog?`<div class="zt-error" role="alert">${esc(ZThemes.error)}<button class="zp-secondary" onclick="ztLoad()">Retry loading themes</button></div>`:items.length?`<div class="zt-grid" aria-label="Available themes">${items.map(ztCard).join('')}</div>`:'<div class="zt-empty">No themes are available right now.<button class="zp-secondary" onclick="ztLoad()">Refresh themes</button></div>'}${ZThemes.error&&catalog?`<p class="zt-error" role="alert">${esc(ZThemes.error)}</p><button class="zt-refresh" onclick="ztLoad()">Refresh themes</button>`:''}${ZThemes.saving?'<p class="zt-status" role="status">Saving your theme…</p>':''}${!ZThemes.loading&&p?`<section class="zt-premium" id="zt-premium" tabindex="-1"><div class="zt-premium-icon" aria-hidden="true">◇</div><div><h3>${p.active?'Your premium collection':'A little extra personality'}</h3><p>${p.active?'All premium themes are yours, and BinzoLive is ad-free.':'Unlock every premium theme and its text style, and go ad-free, with one purchase.'}</p><small>${p.active?'Premium active · One-time purchase':`One-time payment · No subscription${Number.isSafeInteger(p.pricePaise)?' · '+esc(zpMoney(p.pricePaise)):''}`}</small></div>${!p.active?paymentRouteView('premium'):''}${!p.active?`<button type="button" class="zp-save" onclick="ztCheckout()" ${ZThemes.checkoutBusy||ZThemes.loading||(!DEMO&&!p.paymentsAvailable)||payment?.status==='SUCCESS'?'disabled':''}>${ZThemes.checkoutBusy?'Opening secure checkout…':DEMO?'Try premium in preview':payment?.status==='PENDING'?'Continue checkout':p.paymentsAvailable?'Unlock premium · '+esc(zpMoney(p.pricePaise)):'Premium checkout unavailable'}</button>`:''}${DEMO?'<small class="zt-demo-note">Design preview only. No payment is taken.</small>':''}</section>`:''}${payment?`<div class="zt-payment" role="status"><p>${esc(status)}</p>${payment.status==='PENDING'?`<button type="button" class="zp-secondary" onclick="ztVerify()" ${ZThemes.checkoutBusy?'disabled':''}>${ZThemes.checkoutBusy?'Checking payment…':'Check payment status'}</button>`:''}</div>`:''}<p class="zt-note">The original theme is always free. Theme changes keep your place and respect reduced motion.</p>`;
}
function ztSelect(id){
  if(ZThemes.saving||ZThemes.loading)return;const theme=ZThemes.catalog?.items.find(x=>x.id===id);if(!ztSafe(theme)||theme.active===false)return;
  if(theme.isPremium&&!ZThemes.catalog.premium.active){document.getElementById('zt-premium')?.focus({preventScroll:true});document.getElementById('zt-premium')?.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'nearest'});return}
  ZThemes.saving=id;ZThemes.error='';const requestId=++ZThemes.requestId;ztPaint();
  if(DEMO){ztAccept({...ZThemes.catalog,selectedThemeId:id});ZThemes.saving='';ztPaint();document.getElementById('zt-theme-'+id)?.focus({preventScroll:true});return}
  Native.send('themes.select',{themeId:id,requestId});
}
function ztAccept(catalog){if(!catalog||!Array.isArray(catalog.items))return;ZThemes.catalog={...catalog,items:catalog.items.filter(ztSafe)};ZThemes.loading=false;ZThemes.error='';if(catalog.premium?.active||ZThemes.checkout?.status==='SUCCESS'){ZThemes.checkout=null;ZThemes.attempt='';ZThemes.requestedRoute=undefined;ZThemes.checkoutBusy=false}ztApply(true);ztPaint()}
function ztCheckout(){
  const p=ZThemes.catalog?.premium;if(!p||p.active||ZThemes.checkoutBusy||ZThemes.loading||ZThemes.checkout?.status==='SUCCESS')return;
  if(DEMO){ZThemes.catalog.premium.active=true;ztPaint();appNotice('Premium preview unlocked. No payment was taken.');return}
  if(!p.paymentsAvailable)return;ZThemes.checkoutBusy=true;ZThemes.error='';if(!ZThemes.attempt){ZThemes.attempt=crypto.randomUUID();ZThemes.requestedRoute=paymentRoutePayload('premium').route}ztPaint();Native.send('themes.premium.checkout',{idempotencyKey:ZThemes.attempt,...(ZThemes.requestedRoute?{route:ZThemes.requestedRoute}:{})});
}
function ztVerify(){if(ZThemes.checkoutBusy||!ZThemes.checkout?.merchantOrderId)return;ZThemes.checkoutBusy=true;ZThemes.error='';ztPaint();Native.send('themes.premium.verify',{merchantOrderId:ZThemes.checkout.merchantOrderId})}
function ztPayment(data){if(ZThemes.attempt&&data.idempotencyKey&&ZThemes.attempt!==data.idempotencyKey&&ZThemes.checkout?.merchantOrderId!==data.merchantOrderId)return;const previous={idempotencyKey:ZThemes.attempt,route:ZThemes.requestedRoute};ZThemes.checkoutBusy=false;ZThemes.checkout=data;if(['SUCCESS','FAILED','REVERTED'].includes(data.status)){ZThemes.attempt='';ZThemes.requestedRoute=undefined}else if(data.idempotencyKey){ZThemes.attempt=data.idempotencyKey;ZThemes.requestedRoute=paymentRestoredRoute(data,previous).route}ztPaint()}
function ztClear(){clearTimeout(ZThemes.transitionTimer);document.documentElement.classList.remove('zt-transition');ZThemes.signature='';ZThemes.requestId++;Object.assign(ZThemes,{catalog:null,loading:false,error:'',saving:'',checkout:null,checkoutBusy:false,attempt:'',requestedRoute:undefined,accountId:'',refreshView:null,renderView:null,returnTo:'profile',returnScroll:0,returnFocus:''})}
function ztReset(){ZThemes.boot=null;ztClear();ztApply()}
function ztAccount(id){if(ZThemes.accountId!==(id||'')){ztClear();ZThemes.accountId=id||'';ztApply()}}
Native.on('data.themes',ztAccept);
Native.on('theme.default',theme=>{if(!ztSafe(theme))return;ZThemes.default=theme;ztApply(true);ztPaint()});
Native.on('themes.selected',data=>{if(data.requestId!==ZThemes.requestId)return;const id=ZThemes.saving;ZThemes.saving='';ztAccept(data.catalog);document.getElementById('zt-theme-'+id)?.focus({preventScroll:true});appNotice('Theme applied.')});
Native.on('themes.error',data=>{if(data.requestId!=null&&data.requestId!==ZThemes.requestId)return;ZThemes.error=data.message||'Your theme could not be updated. Please try again.';if(data.action==='themes.select'){ZThemes.saving='';appNotice(ZThemes.error)}if(data.action==='themes.load')ZThemes.loading=false;if(data.action==='themes.premium.checkout'||data.action==='themes.premium.verify')ZThemes.checkoutBusy=false;const routeRejected=data.action==='themes.premium.checkout'&&['PAYMENT_ROUTE_CHOICE_DISABLED','PAYMENT_ROUTE_UNAVAILABLE'].includes(data.code);if(data.action==='themes.premium.checkout'&&(data.code==='PAYIN_PROVISIONING_FAILED'||routeRejected)){ZThemes.attempt='';ZThemes.requestedRoute=undefined;ZThemes.checkout=null;if(!routeRejected)ZThemes.error='Checkout could not start. Please try again.'}ztPaint();if(routeRejected)paymentRoutesLoad()});
Native.on('data.loading',data=>{if(data.resource!=='themes')return;ZThemes.loading=!!data.loading;ZThemes.error=data.error||'';ztPaint()});
Native.on('themes.premium.checkout',ztPayment);Native.on('themes.premium.purchase',ztPayment);
Native.on('session.none',ztReset);Native.on('session.expired',ztReset);
Native.on('session',data=>ztAccount(data.user?.id));
matchMedia('(prefers-reduced-motion: reduce)').addEventListener?.('change',event=>{if(event.matches)document.documentElement.classList.remove('zt-transition')});
window.ZimiThemes={apply:ztApply,label:ztLabel,open:ztOpen,content:ztContent,reset:ztReset,account:ztAccount,beforeNavigate:ztBeforeNavigate,header:ztHeader};
ZimiHome.views.themes=ztPage;
const ztPreviousAfterRender=ZimiHome.afterRender;
ZimiHome.afterRender=()=>{ztPreviousAfterRender();ztRestoreView(ZThemes.renderView);ZThemes.renderView=null};
if(DEMO){ZThemes.catalog={selectedThemeId:ZThemeOriginal.id,premium:{active:false,pricePaise:19900,currency:'INR',paymentsAvailable:false,purchaseType:'lifetime'},items:[ZThemeOriginal,ZThemeRose,{...ZThemeOriginal,id:'000000000000000000000003',name:'Midnight Ocean',description:'Deep blue calm, a brighter point of view.',isDefault:false,isPremium:true,colors:{background:'#101b2d',surface:'#192a42',surfaceElevated:'#223951',text:'#edf6ff',textMuted:'#b5cada',primary:'#88d9ee',primaryContrast:'#102030',secondary:'#88d9ee',border:'#466078',success:'#69d5aa',danger:'#ffacb8'},typography:{fontFamily:'rounded',fontScale:1,fontWeight:'400',headingWeight:'700'}},{...ZThemeOriginal,id:'000000000000000000000004',name:'Amber Silk',description:'Warm neutrals with an editorial touch.',isDefault:false,isPremium:true,mode:'light',colors:{background:'#fff9ef',surface:'#ffffff',surfaceElevated:'#f3e7d1',text:'#3b2a1e',textMuted:'#79644e',primary:'#815016',primaryContrast:'#ffffff',secondary:'#815016',border:'#ccbba3',success:'#237d51',danger:'#b63146'},typography:{fontFamily:'serif',fontScale:1.05,fontWeight:'400',headingWeight:'700'}}]}}
