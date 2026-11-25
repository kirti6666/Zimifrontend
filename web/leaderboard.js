/* The Home trophy opens the server-ranked creator gift leaderboard. */
const Board = { period:'daily', rows:[] };
const BOARD_PERIODS = [['daily','Daily','today'],['weekly','Weekly','this week'],['monthly','Monthly','this month']];
function lbLoad(){
  if(DEMO){Board.rows=lbPreviewRows(Board.period);r();return}
  contentStart('leaderboard');Native.send('leaderboard.load',{period:Board.period});r();
}
function lbPeriod(value){if(!BOARD_PERIODS.some(([key])=>key===value)||value===Board.period)return;Board.period=value;Board.rows=[];lbLoad()}
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
  const rows=Board.rows,periodText=BOARD_PERIODS.find(([key])=>key===Board.period)[2];
  const list=rows.length?`<ol class="zlb-list">${rows.map(row=>`<li><button type="button" class="zlb-row ${row.rank<=3?'is-top':''}" onclick="lbOpen('${domId(row.id)}')" aria-label="${DEMO?'Sample rank':'Rank'} ${row.rank}, ${esc(row.name)}, ${n(row.coins)} coins"><span class="zlb-rank">${row.rank}</span>${lbAvatar(row)}<span class="zlb-name">${esc(row.name)}</span><span class="zlb-coins">${hi('rings',15)}${DEMO?boardPreviewNumber.format(row.coins):n(row.coins)}</span></button></li>`).join('')}</ol>`:`<div class="zlb-empty">${hi('trophy',30)}<h2>No rankings yet</h2><p>Creators appear here after receiving paid gifts ${periodText}.</p></div>`;
  const body=pending?contentSkeleton('rows','Loading leaderboard',6):error?contentError('leaderboard'):list;
  const note=DEMO?'Design preview &middot; sample hosts and Coin totals'+MODEL_NOTE:'Creators ranked by gift coins received';
  return `<section class="zlb-page" aria-label="Leaderboard">${tabs}<div id="board-panel" role="tabpanel" aria-labelledby="board-period-${Board.period}"><p class="zlb-note">${note}</p>${body}</div></section>`;
}
Native.on('data.leaderboard',d=>{if(DEMO||d.period!==Board.period)return;Board.rows=d.items;if(S.v==='board')r()});
document.addEventListener('aurora:navigate',()=>{if(S.v==='board')lbLoad()});
ZimiPullRefresh.register('board',{refresh:()=>lbLoad(),busy:()=>contentPending('leaderboard')});
['session.none','session.expired'].forEach(type=>Native.on(type,()=>{Board.period='daily';Board.rows=[]}));
window.ZimiLeaderboard={load:lbLoad,header:lbHeader,render:lbView};
ZimiHome.views.board=lbView;
