/* The Home trophy opens the creator leaderboard: creators ranked by the gift coins they
   received today, this week or ever, read from the server. Sample rankings exist only in DEMO. */
const Board = { period:'daily', rows:[], total:0 };
const BOARD_PERIODS = [['daily','Daily'],['weekly','Weekly'],['all','All time']];
function lbLoad(){
  if(DEMO){
    const scale={daily:1,weekly:6,all:38}[Board.period];
    Board.rows=Home.hosts.map((h,index)=>({id:h.id,name:h.n,avatarUrl:h.avatarUrl,coins:(9-index)*1450*scale})).sort((a,b)=>b.coins-a.coins).map((row,index)=>({...row,rank:index+1}));
    Board.total=Board.rows.length;r();return;
  }
  contentStart('leaderboard');Native.send('leaderboard.load',{period:Board.period});r();
}
function lbPeriod(value){if(!BOARD_PERIODS.some(([key])=>key===value)||value===Board.period)return;Board.period=value;Board.rows=[];Board.total=0;lbLoad()}
function lbPeriodKey(event){
  if(!['ArrowLeft','ArrowRight'].includes(event.key))return;
  event.preventDefault();
  const keys=BOARD_PERIODS.map(([key])=>key),next=keys[(keys.indexOf(Board.period)+(event.key==='ArrowRight'?1:-1)+keys.length)%keys.length];
  lbPeriod(next);document.getElementById('board-period-'+next)?.focus();
}
function lbHeader(){return `<header class="zh-subheader zlb-header">${backButton("go('home')",{label:"Back to home"})}<h1>Leaderboard</h1></header>`}
function lbAvatar(row){const src=imageSrc(row.avatarUrl);return `<span class="av zlb-avatar" aria-hidden="true">${esc((first(row.name||'')||'?').charAt(0).toUpperCase())}${src?`<img src="${src}" alt="" loading="lazy" decoding="async">`:''}</span>`}
// A row opens the creator's profile; the creator is remembered so the profile has a name at once.
function lbOpen(id){const row=Board.rows.find(x=>x.id===id);if(!row)return;if(!g(id))homeRemember({id:row.id,name:row.name,avatarUrl:row.avatarUrl,role:'host'});go('host',domId(id))}
function lbView(){
  const pending=!DEMO&&contentPending('leaderboard'),error=!pending&&!DEMO&&ContentLoading.leaderboard.error;
  const tabs=`<div class="zlb-periods" role="tablist" aria-label="Leaderboard period" onkeydown="lbPeriodKey(event)">${BOARD_PERIODS.map(([key,label])=>{const on=Board.period===key;return `<button type="button" id="board-period-${key}" role="tab" aria-selected="${on}" aria-controls="board-panel" tabindex="${on?'0':'-1'}" onclick="lbPeriod('${key}')">${label}</button>`}).join('')}</div>`;
  const list=Board.rows.length?`<ol class="zlb-list">${Board.rows.map(row=>`<li><button type="button" class="zlb-row ${row.rank<=3?'is-top':''}" onclick="lbOpen('${domId(row.id)}')" aria-label="Rank ${row.rank}, ${esc(row.name)}, ${n(row.coins)} coins"><span class="zlb-rank">${row.rank}</span>${lbAvatar(row)}<span class="zlb-name">${esc(row.name)}</span><span class="zlb-coins">${hi('rings',15)}${n(row.coins)}</span></button></li>`).join('')}</ol>`:`<div class="zlb-empty">${hi('trophy',30)}<h2>No rankings yet</h2><p>Creators appear here once they receive gifts${Board.period==='daily'?' today':Board.period==='weekly'?' this week':''}.</p></div>`;
  const body=pending?contentSkeleton('rows','Loading leaderboard',6):error?contentError('leaderboard'):list;
  return `<section class="zlb-page" aria-label="Leaderboard">${tabs}<div id="board-panel" role="tabpanel" aria-labelledby="board-period-${Board.period}"><p class="zlb-note">Creators ranked by gift coins received</p>${body}</div></section>`;
}
Native.on('data.leaderboard',d=>{if(d.period!==Board.period)return;Board.rows=d.items||[];Board.total=d.total||0;if(S.v==='board')r()});
document.addEventListener('aurora:navigate',()=>{if(S.v==='board')lbLoad()});
ZimiPullRefresh.register('board',{refresh:()=>lbLoad(),busy:()=>contentPending('leaderboard')});
['session.none','session.expired'].forEach(type=>Native.on(type,()=>{Board.period='daily';Board.rows=[];Board.total=0}));
window.ZimiLeaderboard={load:lbLoad,header:lbHeader,render:lbView};
ZimiHome.views.board=lbView;
