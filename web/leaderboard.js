/* The Home trophy opens gift rankings and server-supplied sample scores. */
const Board = { period:'daily', rows:[], sampleRows:[], hasMoreSamples:false, samplePage:1, requestedPage:1, day:0 };
const BOARD_PERIODS = [['daily','Daily','today'],['weekly','Weekly','this week'],['monthly','Monthly','this month']];
const BOARD_DAY = 86_400_000;
const boardThousands = new Intl.NumberFormat('en-US',{maximumFractionDigits:1});
const boardMillions = new Intl.NumberFormat('en-US',{maximumFractionDigits:3});
let boardDayTimer;
function lbSampleCoinText(coins){
  if(coins>=999_950)return boardMillions.format(coins/1_000_000)+'M';
  if(coins>=1_000)return boardThousands.format(coins/1_000)+'K';
  return n(coins);
}
function lbSchedule(){
  clearTimeout(boardDayTimer);
  const now=Date.now();
  Board.day=Math.floor(now/BOARD_DAY);
  boardDayTimer=setTimeout(()=>{if(S.v==='board')lbLoad()},BOARD_DAY-now%BOARD_DAY);
}
function lbLoad(page=1){
  if(page===1)lbSchedule();
  if(DEMO){
    Board.sampleRows=lbPreviewRows(Board.period);r();return;
  }
  Board.requestedPage=page;
  contentStart('leaderboard',{page});
  Native.send('leaderboard.load',page===1?{period:Board.period}:{period:Board.period,page});
  r();
}
function lbReset(period){
  Object.assign(Board,{period,rows:[],sampleRows:[],hasMoreSamples:false,samplePage:1,requestedPage:1});
}
function lbPeriod(value){
  if(!BOARD_PERIODS.some(([key])=>key===value)||value===Board.period)return;
  lbReset(value);lbLoad();
}
function lbAccepts(data){
  return (data.period===undefined||data.period===Board.period)&&(data.page??1)===Board.requestedPage;
}
function lbMore(){
  if(contentPending('leaderboard')||!Board.hasMoreSamples)return;
  if(Math.floor(Date.now()/BOARD_DAY)!==Board.day)return lbLoad();
  lbLoad(Board.samplePage+1);
}
function lbPeriodKey(event){
  if(!['ArrowLeft','ArrowRight'].includes(event.key))return;
  event.preventDefault();
  const keys=BOARD_PERIODS.map(([key])=>key),next=keys[(keys.indexOf(Board.period)+(event.key==='ArrowRight'?1:-1)+keys.length)%keys.length];
  lbPeriod(next);document.getElementById('board-period-'+next)?.focus();
}
function lbHeader(){return `<header class="zh-subheader zlb-header">${backButton("go('home')",{label:"Back to home"})}<h1>Leaderboard</h1></header>`}
function lbAvatar(row){const src=imageSrc(row.avatarUrl);return `<span class="av zlb-avatar" aria-hidden="true">${esc((first(row.name||'')||'?').charAt(0).toUpperCase())}${src?`<img src="${src}" alt="" loading="lazy" decoding="async">`:''}</span>`}
// A row opens the creator's profile; the creator is remembered so the profile has a name at once.
function lbOpen(id){const row=Board.rows.find(x=>x.id===id)||Board.sampleRows.find(x=>x.id===id);if(!row)return;if(!g(id))homeRemember({id:row.id,name:row.name,avatarUrl:row.avatarUrl,role:'host'});go('host',domId(id))}
function lbRows(rows,compact=false){
  return `<ol class="zlb-list">${rows.map(row=>{
    const label=`Rank ${row.rank}, ${row.name}, ${n(row.coins)} coins`;
    const amount=compact?lbSampleCoinText(row.coins):n(row.coins);
    return `<li><button type="button" class="zlb-row ${row.rank<=3?'is-top':''}" onclick="lbOpen('${domId(row.id)}')" aria-label="${esc(label)}"><span class="zlb-rank">${row.rank}</span>${lbAvatar(row)}<span class="zlb-name">${esc(row.name)}</span><span class="zlb-score"><span class="zlb-coins">${hi('rings',15)}${amount}</span></span></button></li>`;
  }).join('')}</ol>`;
}
function lbSamples(pending,error){
  if(!Board.sampleRows.length)return '';
  const footer=error?`<div class="zh-error" role="alert">${esc(error)}<button type="button" onclick="lbMore()">Retry</button></div>`:
    pending?contentSkeleton('rows','Loading more creators',2):
    Board.hasMoreSamples?'<button type="button" class="zh-load-more" onclick="lbMore()">Load more creators</button>':'';
  return `<section class="zlb-samples" aria-labelledby="zlb-samples-title"><h2 id="zlb-samples-title">Top creators</h2>${lbRows(Board.sampleRows,true)}${footer}</section>`;
}
function lbView(){
  const pending=contentPending('leaderboard'),error=!pending&&ContentLoading.leaderboard.error;
  const firstPage=Board.requestedPage===1;
  const tabs=`<div class="zlb-periods" role="tablist" aria-label="Leaderboard period" onkeydown="lbPeriodKey(event)">${BOARD_PERIODS.map(([key,label])=>{const on=Board.period===key;return `<button type="button" id="board-period-${key}" role="tab" aria-selected="${on}" aria-controls="board-panel" tabindex="${on?'0':'-1'}" onclick="lbPeriod('${key}')">${label}</button>`}).join('')}</div>`;
  let body;
  if(DEMO)body=`<p class="zlb-note">Top creators by Coins received</p>${lbRows(Board.sampleRows,true)}`;
  else if(firstPage&&pending)body=contentSkeleton('rows','Loading leaderboard',6);
  else if(firstPage&&error)body=contentError('leaderboard');
  else if(Board.rows.length||Board.sampleRows.length){
    const giftRankings=Board.rows.length?`<p class="zlb-note">Creators ranked by gift coins received</p>${lbRows(Board.rows)}`:'';
    body=giftRankings+lbSamples(pending,error);
  }else{
    const periodText=BOARD_PERIODS.find(([key])=>key===Board.period)[2];
    body=`<div class="zlb-empty">${hi('trophy',30)}<h2>No rankings yet</h2><p>Creators appear here after receiving paid gifts ${periodText}.</p></div>`;
  }
  return `<section class="zlb-page" aria-label="Leaderboard">${tabs}<div id="board-panel" role="tabpanel" aria-labelledby="board-period-${Board.period}">${body}</div></section>`;
}
Native.on('data.leaderboard',data=>{
  if(DEMO||!lbAccepts(data))return;
  const page=data.page??1,rows=data.sampleItems??[];
  if(page===1){Board.rows=data.items;Board.sampleRows=rows}
  else{
    const known=new Set(Board.sampleRows.map(row=>row.id));
    Board.sampleRows.push(...rows.filter(row=>!known.has(row.id)));
  }
  Board.samplePage=page;
  Board.hasMoreSamples=rows.length>0&&Board.sampleRows.length<(data.sampleTotal??0);
  if(S.v==='board')r();
});
document.addEventListener('aurora:navigate',()=>{if(S.v==='board')lbLoad();else clearTimeout(boardDayTimer)});
Native.on('app.foreground',()=>{if(S.v==='board'&&Board.day!==Math.floor(Date.now()/BOARD_DAY))lbLoad()});
ZimiPullRefresh.register('board',{refresh:()=>lbLoad(),busy:()=>contentPending('leaderboard')});
['session.none','session.expired'].forEach(type=>Native.on(type,()=>{clearTimeout(boardDayTimer);lbReset('daily')}));
window.ZimiLeaderboard={load:lbLoad,header:lbHeader,render:lbView,accepts:lbAccepts};
ZimiHome.views.board=lbView;
