/* Hosts join an admin-created agency before applying. Membership never grants
   creator capability: identity, staff video verification and approval remain server-owned. */
const ZAgency={data:null,preview:null,code:'',verified:null,loading:false,busy:'',error:'',request:0,pending:0,from:'settings'};
function zagLinked(){return !!ZAgency.data?.agency}
function zagPaint(){if(S.v==='agency'||S.v==='kyc')r()}
function zagLoad(){
  if(ZAgency.busy)return;
  ZAgency.loading=true;ZAgency.error='';ZAgency.verified=null;ZAgency.pending=++ZAgency.request;
  if(DEMO){ZAgency.data=ZAgency.preview||{agency:null,hostStatus:'none',isVerifiedHost:false,eligible:true,requirements:[],nextStep:'agency'};ZAgency.loading=false;zagPaint();return}
  Native.send('agency.load',{requestId:ZAgency.pending});zagPaint();
}
function zagOpen(from){
  if(!S.loggedIn)return obStart('signup');
  ZAgency.from=['profile','settings','home'].includes(from)?from:['profile','settings','home'].includes(S.v)?S.v:'settings';
  S.creatorSetup=true;
  if(!S.kf.name)S.kf.name=S.user?.name||me.n||'';
  if(!S.kf.bio)S.kf.bio=S.user?.about||me.about||'';
  if(!S.kf.langs?.length)S.kf.langs=(S.user?.languages||[]).slice();
  go('agency');
}
function zagHeader(){return `<header class="zh-subheader">${backButton(`go('${ZAgency.from}')`,{label:'Back to '+ZAgency.from})}<h1>${isApprovedHost()?'My agency':'Become a Host'}</h1></header>`}
function zagCode(value){ZAgency.code=value.toUpperCase();ZAgency.verified=null;ZAgency.error='';const next=document.getElementById('za-confirm');if(next)next.hidden=true;const error=document.getElementById('za-error');if(error)error.textContent=''}
function zagVerify(){
  if(ZAgency.busy||ZAgency.loading)return;
  const code=(document.getElementById('za-code')?.value||ZAgency.code).trim().toUpperCase();ZAgency.code=code;ZAgency.error='';
  if(!/^[A-Z0-9]{6,32}$/.test(code)){ZAgency.error='Enter the recruitment code shared by your agency.';zagPaint();document.getElementById('za-code')?.focus();return}
  ZAgency.verified=null;ZAgency.busy='verify';ZAgency.pending=++ZAgency.request;
  if(DEMO){ZAgency.verified={agency:{id:'demo-agency',name:'Preview Agency',recruitmentCode:code,status:'ACTIVE'},hostStatus:'none',eligible:true,requirements:[],nextStep:'application'};ZAgency.busy='';zagPaint();return}
  Native.send('agency.verify',{agencyCode:code,requestId:ZAgency.pending});zagPaint();
}
function zagJoin(){
  const verified=ZAgency.verified;
  if(ZAgency.busy||!verified?.agency||!verified.eligible||verified.agency.recruitmentCode!==ZAgency.code)return;
  ZAgency.busy='join';ZAgency.error='';ZAgency.pending=++ZAgency.request;
  if(DEMO){ZAgency.data=verified;ZAgency.preview=verified;ZAgency.verified=null;ZAgency.busy='';zagPaint();return}
  Native.send('agency.join',{agencyCode:verified.agency.recruitmentCode,requestId:ZAgency.pending});zagPaint();
}
function zagCompleteProfile(){
  if(ZAgency.busy)return;
  ZAgency.code=(document.getElementById('za-code')?.value||ZAgency.code).trim().toUpperCase();
  ZAgency.verified=null;
  obResumeOnboarding({user:S.user||{},verification:A().kyc,requiresOnboarding:true},true);
}
function zagRequirements(data){return data?.requirements?.length?`<ul class="za-requirements">${data.requirements.map(value=>`<li>${esc(value)}</li>`).join('')}</ul>${data.requirements.some(value=>/18|profile/i.test(value))?'<button type="button" class="za-secondary" onclick="zagCompleteProfile()">Complete profile &amp; confirm age</button>':''}`:''}
function zagCard(agency){return `<div class="za-agency"><span class="za-agency-icon">${zi('people',24)}</span><div><span>Your agency</span><h2>${esc(agency.name)}</h2><p>${esc(agency.recruitmentCode)}</p></div><span class="za-status">${agency.status==='ACTIVE'?'Active':'Suspended'}</span></div>`}
function zagView(){
  if(ZAgency.loading)return `<section class="za-page">${contentSkeleton('rows','Loading your agency',4)}</section>`;
  if(!ZAgency.data&&ZAgency.error)return `<section class="za-page"><div class="za-message" role="alert"><p>${esc(ZAgency.error)}</p><button type="button" class="za-secondary" onclick="zagLoad()">Try again</button></div></section>`;
  const data=ZAgency.data,agency=data?.agency,verified=ZAgency.verified,busy=!!ZAgency.busy;
  if(agency){
    const active=isApprovedHost(),review=data.nextStep==='review'||data.hostStatus==='pending',suspended=data.hostStatus==='suspended';
    return `<section class="za-page" aria-label="Your host agency">${ZAgency.error?`<div class="za-message" role="alert"><p>${esc(ZAgency.error)}</p><button type="button" class="za-secondary" onclick="zagLoad()">Try again</button></div>`:''}${zagCard(agency)}<div class="za-intro"><h2>${active?'Your host account is active':suspended?'Hosting is suspended':review?'Your application is under review':'Your agency is connected'}</h2><p>${active?'Your agency supports your host journey. Manage your availability from Home.':suspended?'Contact the BinzoLive team about your host account.':review?'The BinzoLive team will review your details and contact you for a verification video call. Hosting starts after approval.':'Complete your creator application next. The team verifies your identity and eligibility before approving hosting.'}</p></div>${zagRequirements(data)}${agency.status==='SUSPENDED'?'<p class="za-note">This agency is suspended for new recruitment. Your current host approval is managed separately by the BinzoLive team.</p>':''}${!active&&!suspended?`<button type="button" class="za-primary" onclick="go('kyc')">${review?'View application status':'Continue host application'}</button>`:active?'<button type="button" class="za-primary" onclick="go(\'home\')">Go to Home</button>':''}<p class="za-note">Your account belongs to one agency. Contact the BinzoLive team if a change is needed. Agency commission comes from the platform share and does not reduce your host earnings.</p></section>`;
  }
  return `<section class="za-page" aria-labelledby="za-title"><div class="za-intro"><span class="za-mark">${zi('people',28)}</span><h2 id="za-title">Start your host journey</h2><p>Join through a BinzoLive agency. Enter the recruitment code your agency shared with you.</p></div><ol class="za-steps"><li><b>1</b><span>Connect your agency</span></li><li><b>2</b><span>Complete your application</span></li><li><b>3</b><span>Get verified and approved</span></li></ol>${!verified?zagRequirements(data):''}<form class="za-form" onsubmit="event.preventDefault();zagVerify()" novalidate><label for="za-code">Agency recruitment code</label><input id="za-code" maxlength="32" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="Enter agency code" value="${esc(ZAgency.code)}" oninput="zagCode(this.value)" aria-describedby="za-code-note za-error" ${busy?'disabled':''}><p id="za-code-note" class="za-note">Ask your agency for its code. A friend's referral code cannot be used here.</p><p id="za-error" class="za-error" role="alert">${esc(ZAgency.error)}</p><button type="submit" class="za-primary" ${busy?'disabled':''} ${ZAgency.busy==='verify'?'aria-busy="true"':''}>${ZAgency.busy==='verify'?'Verifying…':'Verify agency code'}</button></form>${verified?.agency?`<div id="za-confirm" class="za-confirm">${zagCard(verified.agency)}${zagRequirements(verified)}<p>Confirm this is your agency before joining. Only the BinzoLive team can change it later.</p><button type="button" class="za-primary" onclick="zagJoin()" ${busy||!verified.eligible?'disabled':''} ${ZAgency.busy==='join'?'aria-busy="true"':''}>${ZAgency.busy==='join'?'Joining agency…':'Join agency & continue'}</button></div>`:''}<p class="za-note">Hosts must be 18 or older and complete identity and platform checks. Joining an agency does not activate hosting until your application is approved.</p><p class="za-note">Agency onboarding is managed by the BinzoLive team. Agencies receive their recruitment code from an administrator.</p></section>`;
}
Native.on('agency.loaded',d=>{if(d.requestId!==ZAgency.pending)return;ZAgency.loading=false;ZAgency.data=d;ZAgency.error='';zagPaint()});
Native.on('agency.verified',d=>{if(d.requestId!==ZAgency.pending||ZAgency.busy!=='verify')return;ZAgency.busy='';ZAgency.verified=d;ZAgency.error='';zagPaint()});
Native.on('agency.joined',d=>{if(d.requestId!==ZAgency.pending||ZAgency.busy!=='join')return;ZAgency.busy='';ZAgency.data=d;ZAgency.verified=null;ZAgency.error='';zagPaint();obHaptic('success')});
Native.on('agency.error',d=>{if(d.requestId!==ZAgency.pending)return;ZAgency.loading=false;ZAgency.busy='';ZAgency.error=d.message||'Your agency could not be confirmed. Please try again.';zagPaint()});
document.addEventListener('aurora:navigate',()=>{if(S.v==='agency')zagLoad()});
function zagReset(){ZAgency.pending=++ZAgency.request;Object.assign(ZAgency,{data:null,preview:null,code:'',verified:null,loading:false,busy:'',error:'',from:'settings'})}
['session.none','session.expired'].forEach(type=>Native.on(type,zagReset));
Native.on('verification.status',()=>{if(S.v==='agency')zagLoad()});
ZimiPullRefresh.register('agency',{refresh:zagLoad,busy:()=>ZAgency.loading||!!ZAgency.busy});
window.ZimiAgency={open:zagOpen,linked:zagLinked,header:zagHeader,render:zagView,reset:zagReset};
ZimiHome.views.agency=zagView;
