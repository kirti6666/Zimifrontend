/* Private host earning history. These are earned diamonds, never wallet balances. */
const HostStatistics={owner:'',sequence:0,requestId:0,period:'daily',date:null,loading:false,requested:false,error:'',data:null,selected:0};
const HOST_STATISTIC_PERIODS=[['daily','Daily'],['weekly','Weekly'],['monthly','Monthly']];
function zhsActive(){return S.v==='host-statistics'}
function zhsOwn(){return !!S.loggedIn&&!!HostStatistics.owner&&HostStatistics.owner===S.user?.id}
function zhsPaint(){if(zhsActive())r()}
function zhsToday(){const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()),part=type=>parts.find(item=>item.type===type)?.value;return `${part('year')}-${part('month')}-${part('day')}`}
function zhsDateValue(value){const [year,month,day]=value.split('-').map(Number);return new Date(Date.UTC(year,month-1,day,12))}
function zhsDateString(value){return `${value.getUTCFullYear()}-${String(value.getUTCMonth()+1).padStart(2,'0')}-${String(value.getUTCDate()).padStart(2,'0')}`}
function zhsPeriodStart(value,period){const date=zhsDateValue(value);if(period==='weekly')date.setUTCDate(date.getUTCDate()-(date.getUTCDay()+6)%7);if(period==='monthly')date.setUTCDate(1);return zhsDateString(date)}
function zhsCurrent(){return zhsPeriodStart(HostStatistics.date||HostStatistics.data?.anchorDate||zhsToday(),HostStatistics.period)>=zhsPeriodStart(zhsToday(),HostStatistics.period)}
function zhsOpen(){if(!window.ZimiHostAccess.guard())return;window.zpClose?.();HostStatistics.requested=false;go('host-statistics')}
function zhsBack(){go('settings');window.zpOpen?.('account')}
function zhsLoad(){
 if(DEMO||!zhsOwn()||!isApprovedHost())return;
 const state=HostStatistics;state.loading=true;state.requested=true;state.error='';state.data=null;state.selected=0;state.requestId=++state.sequence;
 zhsPaint();Native.send('diamonds.statistics.load',{period:state.period,...(state.date?{date:state.date}:{}),requestId:state.requestId});
}
function zhsPeriod(value){if(!HOST_STATISTIC_PERIODS.some(([key])=>key===value)||value===HostStatistics.period)return;HostStatistics.period=value;HostStatistics.date=null;if(DEMO)zhsPaint();else zhsLoad()}
function zhsPeriodKey(event){if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const keys=HOST_STATISTIC_PERIODS.map(([key])=>key),index=event.key==='Home'?0:event.key==='End'?keys.length-1:(keys.indexOf(HostStatistics.period)+(event.key==='ArrowRight'?1:-1)+keys.length)%keys.length;zhsPeriod(keys[index]);document.getElementById('zhs-period-'+keys[index])?.focus()}
function zhsShift(direction){
 if(![-1,1].includes(direction)||HostStatistics.loading||direction===1&&zhsCurrent())return;
 const date=zhsDateValue(HostStatistics.date||HostStatistics.data?.anchorDate||zhsToday());
 if(HostStatistics.period==='monthly'){date.setUTCDate(1);date.setUTCMonth(date.getUTCMonth()+direction)}
 else date.setUTCDate(date.getUTCDate()+direction*(HostStatistics.period==='weekly'?7:1));
 HostStatistics.date=zhsDateString(date);zhsLoad();
}
function zhsSelect(index,focus=true){const data=HostStatistics.data;if(!data||!Number.isInteger(index)||index<0||index>=data.buckets.length)return;HostStatistics.selected=index;zhsPaint();if(focus)document.getElementById('zhs-bar-'+index)?.focus()}
function zhsBarKey(event,index){const count=HostStatistics.data?.buckets.length||0;if(!count||!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();zhsSelect(event.key==='Home'?0:event.key==='End'?count-1:(index+(event.key==='ArrowRight'?1:-1)+count)%count,true)}
function zhsReset(owner=''){const sequence=HostStatistics.sequence+1;Object.assign(HostStatistics,{owner,sequence,requestId:0,period:'daily',date:null,loading:false,requested:false,error:'',data:null,selected:0})}
function zhsRange(data){
 if(!data&&HostStatistics.date){const start=zhsDateValue(zhsPeriodStart(HostStatistics.date,HostStatistics.period)),end=new Date(start);if(HostStatistics.period==='monthly')end.setUTCMonth(end.getUTCMonth()+1);else end.setUTCDate(end.getUTCDate()+(HostStatistics.period==='weekly'?7:1));start.setUTCHours(0,0,0,0);end.setUTCHours(0,0,0,0);data={period:HostStatistics.period,startAt:new Date(start.getTime()-19800000).toISOString(),endAt:new Date(end.getTime()-19800000).toISOString()}}
 if(!data)return HostStatistics.period==='daily'?'Today':HostStatistics.period==='weekly'?'This week':'This month';
 const start=new Date(data.startAt),end=new Date(new Date(data.endAt).getTime()-1),format=options=>new Intl.DateTimeFormat('en-IN',{timeZone:'Asia/Kolkata',...options});
 if(data.period==='monthly')return format({month:'long',year:'numeric'}).format(start);
 if(data.period==='daily')return format({day:'numeric',month:'short',year:'numeric'}).format(start);
 return format({day:'numeric',month:'short'}).format(start)+' – '+format({day:'numeric',month:'short',year:'numeric'}).format(end);
}
function zhsBucketLabel(bucket,period){const date=new Date(bucket.startAt);return new Intl.DateTimeFormat('en-IN',{timeZone:'Asia/Kolkata',...(period==='daily'?{hour:'2-digit',minute:'2-digit',hour12:false}:{weekday:'short',day:'numeric',month:'short'})}).format(date)}
function zhsDiamondWord(units){return units===1000000?'diamond':'diamonds'}
function zhsTickLabel(bucket,index,count){if(HostStatistics.period==='weekly')return bucket.label;const step=HostStatistics.period==='daily'?6:7,tick=index===0||index===count-1||index%step===0&&count-1-index>=step/2;return tick?bucket.label:''}
function zhsSkeleton(){return `<div class="zhs-loading zh-skeleton" role="status" aria-label="Loading diamond statistics" aria-busy="true"><div aria-hidden="true"><div class="zhs-total-skeleton">${skeletonLine('92px',12)}${skeletonLine('155px',36)}</div><div class="zhs-chart-skeleton">${Array.from({length:12},(_,index)=>`<span class="zh-skeleton-shape" style="height:${40+index%4*30}px"></span>`).join('')}</div>${skeletonLine('70%',12)}</div></div>`}
function zhsChart(data){
 const buckets=data.buckets,max=Math.max(1000000,...buckets.map(bucket=>bucket.diamondUnits)),selected=buckets[Math.min(HostStatistics.selected,buckets.length-1)],axis=value=>new Intl.NumberFormat('en-IN',{notation:'compact',maximumFractionDigits:1}).format(value/1000000);
 const labels=[max,max*.75,max*.5,max*.25,0].map(value=>`<span>${esc(axis(value))}</span>`).join('');
 return `<div class="zhs-chart" role="group" aria-label="${esc(HostStatistics.period)} diamonds earned bar graph"><div class="zhs-yaxis" aria-hidden="true">${labels}</div><div class="zhs-plot"><div class="zhs-grid" aria-hidden="true">${Array.from({length:5},()=>'<i class="zhs-gridline"></i>').join('')}</div><div class="zhs-bars" style="--zhs-count:${buckets.length}">${buckets.map((bucket,index)=>{const on=index===HostStatistics.selected,label=zhsBucketLabel(bucket,data.period),value=diamondFormat(bucket.diamondUnits),height=bucket.diamondUnits>0?Math.max(.6,bucket.diamondUnits/max*100):0;return `<button type="button" class="zhs-bar" id="zhs-bar-${index}" aria-label="${esc(label)}, ${value} ${zhsDiamondWord(bucket.diamondUnits)} earned" aria-pressed="${on}" tabindex="${on?'0':'-1'}" onclick="zhsSelect(${index})" onkeydown="zhsBarKey(event,${index})"><span class="zhs-fill" aria-hidden="true" style="height:${height}%"></span></button>`}).join('')}</div><div class="zhs-xaxis" aria-hidden="true" style="--zhs-count:${buckets.length}">${buckets.map((bucket,index)=>`<span>${esc(zhsTickLabel(bucket,index,buckets.length))}</span>`).join('')}</div></div></div>${selected?`<p class="zhs-selection" role="status"><span>${esc(zhsBucketLabel(selected,data.period))}</span><strong>${diamondFormat(selected.diamondUnits)} ${zhsDiamondWord(selected.diamondUnits)}</strong></p>`:''}`;
}
function zhsView(){
 if(!DEMO&&!zhsOwn())return `<section class="zhs-page">${S.loggedIn?zhsSkeleton():'<p class="zhs-note">Sign in to view your diamond statistics.</p>'}</section>`;
 if(!isApprovedHost())return `<section class="zhs-page">${window.ZimiHostAccess.checking()?zhsSkeleton():'<p class="zhs-note">Statistics are available to approved hosts.</p>'}</section>`;
 const state=HostStatistics,periodName=state.period==='daily'?'day':state.period==='weekly'?'week':'month';
 const tabs=`<div class="zhs-tabs" role="tablist" aria-label="Diamond statistics period" onkeydown="zhsPeriodKey(event)">${HOST_STATISTIC_PERIODS.map(([key,label])=>`<button type="button" id="zhs-period-${key}" role="tab" aria-selected="${key===state.period}" aria-controls="zhs-panel" tabindex="${key===state.period?'0':'-1'}" onclick="zhsPeriod('${key}')">${label}</button>`).join('')}</div>`;
 const range=`<div class="zhs-range"><button type="button" class="zhs-range-button" aria-label="Previous ${periodName}" onclick="zhsShift(-1)" ${state.loading||DEMO?'disabled':''}>${hi('back',18)}</button><p>${esc(zhsRange(state.data))}<small>India Standard Time</small></p><button type="button" class="zhs-range-button zhs-next" aria-label="Next ${periodName}" onclick="zhsShift(1)" ${state.loading||DEMO||zhsCurrent()?'disabled':''}>${hi('back',18)}</button></div>`;
 const body=DEMO?'<p class="zhs-note">Sign in as an approved host to see your earned diamonds.</p>':state.loading||!state.requested?zhsSkeleton():state.error?`<div class="zhs-error" role="alert"><p>${esc(state.error)}</p><button type="button" onclick="zhsLoad()">Try again</button></div>`:state.data?`<div class="zhs-total"><span>Diamonds earned</span><strong>${diamondIcon(25)}${diamondFormat(state.data.totalDiamondUnits)}</strong></div>${zhsChart(state.data)}${state.data.totalDiamondUnits===0?'<div class="zhs-empty"><h2>No diamonds earned in this period</h2><p>Paid calls and gifts will appear here as you earn them.</p></div>':''}<p class="zhs-note">Call and gift diamonds earned in this period. Withdrawals do not reduce these totals. Task rewards are shown in Withdraw.</p>${state.data.historicalTiming?'<p class="zhs-note">Older call earnings use their recorded receipt date.</p>':''}`:'';
 return `<section class="zhs-page" aria-label="Host diamond statistics">${tabs}${range}<div id="zhs-panel" role="tabpanel" aria-labelledby="zhs-period-${state.period}" aria-busy="${state.loading}">${body}</div></section>`;
}
Native.on('diamonds.statistics.loaded',data=>{const state=HostStatistics;if(!zhsOwn()||!isApprovedHost()||!state.loading||data.requestId!==state.requestId||data.period!==state.period)return;state.loading=false;state.error='';state.data=data;state.selected=Math.max(0,data.buckets.findIndex(bucket=>bucket.diamondUnits>0));zhsPaint()});
Native.on('diamonds.statistics.error',data=>{const state=HostStatistics;if(!zhsOwn()||!isApprovedHost()||!state.loading||data.requestId!==state.requestId||data.period!==state.period)return;state.loading=false;state.error=data.message;state.data=null;zhsPaint()});
for(const type of ['session.none','session.expired'])Native.on(type,()=>zhsReset());
for(const type of ['session','auth.ok'])Native.on(type,data=>{const owner=data.user?.id||'';if(owner!==HostStatistics.owner)zhsReset(owner);zhsPaint()});
window.addEventListener('zimi:host-access',()=>{if(!isApprovedHost()){HostStatistics.sequence++;HostStatistics.requestId=0;HostStatistics.loading=false;HostStatistics.requested=false;HostStatistics.data=null;HostStatistics.error=''}zhsPaint()});
const zhsPreviousAfterRender=ZimiHome.afterRender,zhsPreviousHeader=ZimiHome.header,zhsPreviousNav=ZimiHome.nav;
ZimiHome.afterRender=()=>{zhsPreviousAfterRender();if(zhsActive()&&!DEMO&&zhsOwn()&&isApprovedHost()&&!HostStatistics.requested){HostStatistics.requested=true;queueMicrotask(()=>{if(zhsActive()&&zhsOwn()&&isApprovedHost())zhsLoad()})}};
ZimiHome.header=()=>zhsActive()?`<header class="zh-subheader">${backButton('zhsBack()',{label:'Back to account'})}<h1>Statistics</h1></header>`:zhsPreviousHeader();
ZimiHome.nav=()=>{if(zhsActive()){document.getElementById('nav').style.display='none';return true}return zhsPreviousNav()};
ZimiPullRefresh.register('host-statistics',{refresh:()=>zhsLoad(),busy:()=>HostStatistics.loading});
ZimiHome.views['host-statistics']=zhsView;
window.ZimiHostStatistics={open:zhsOpen,back:zhsBack,load:zhsLoad,render:zhsView,reset:zhsReset};
