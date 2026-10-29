/* All Creators reuses the authenticated popular feed and its server pagination.
   Availability presentation comes from homeRemember/hostFrom; never filter a
   paginated response locally by raw online or availableForCall fields. */
function allCreatorsView(){
  const queryPending=!DEMO&&Home.queryKey!==homeFeedKey();
  const pending=queryPending||homeContentPending();
  const more=!DEMO&&Home.loadingMore&&(Home.loading||contentPending('home'));
  const failure=!pending&&!more&&homeContentError();
  const moreError=ContentLoading.home.page>1?failure:'';
  const error=moreError?'':failure;
  const rows=homeList();
  const empty=`<div class="zac-empty">${hi('user',30)}<h2>No creators available</h2><p>New profiles will appear here when creators are available. Pull down to refresh.</p></div>`;
  const grid=rows.length?`<div class="zh-grid zac-grid" aria-label="Creator profiles">${homeGridWithAd(rows.map(homeTile),'explore')}</div>`:empty;
  return `<section class="zh-home zac-page" aria-label="All Creators"><header class="zac-heading">${backButton("go('home')",{label:'Back to home'})}<h1>All Creators</h1></header><div class="zac-intro"><p>Choose a creator to view their profile.</p><span>${pending?skeletonLine('80px',12):error?'':`${n(Home.total)} creators`}</span></div>${error?`<div class="zh-error" role="alert">${esc(error)}<button type="button" onclick="homeLoad()">Retry</button></div>`:pending?contentSkeleton('cards','Loading creators',6):grid}${homeRefreshNotice()}${more?contentSkeleton('cards','Loading more creators',2):moreError?`<div class="zh-error" role="alert">${esc(moreError)}<button type="button" onclick="homeLoad(true)">Retry loading more creators</button></div>`:!pending&&!error&&rows.length<Home.total?'<button type="button" class="zh-load-more zac-load-more" onclick="homeLoad(true)">Load more creators</button>':''}</section>`;
}
window.ZimiAllCreators={render:allCreatorsView};
ZimiHome.views['all-creators']=allCreatorsView;
