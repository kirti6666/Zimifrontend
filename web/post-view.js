/* A profile's posts open as a scrolling feed, like other photo apps: author, photo,
   likes (tap the heart or double-tap the photo), caption, comments and time.
   Likes and comments are confirmed by the server; a failed like puts the old state back. */
const ZuFeed = { likes:new Map(), lastTap:null, observer:null,
  comments:{ postId:'', items:[], total:0, page:0, loading:false, error:'', sending:false, deleting:'', requestId:0, sendId:0 } };

function zuAgo(iso,short=false){
  const at=Date.parse(iso||'');if(!Number.isFinite(at))return '';
  const minutes=Math.max(0,Math.round((Date.now()-at)/60000));
  if(minutes<1)return short?'now':'Just now';
  const unit=(value,word)=>short?`${value}${word[0]}`:`${value} ${word}${value===1?'':'s'} ago`;
  if(minutes<60)return unit(minutes,'minute');
  if(minutes<1440)return unit(Math.floor(minutes/60),'hour');
  if(minutes<10080)return unit(Math.floor(minutes/1440),'day');
  return new Date(at).toLocaleDateString('en-IN',{day:'numeric',month:'short',...(new Date(at).getFullYear()!==new Date().getFullYear()?{year:'numeric'}:{})});
}
const zuPostAuthor = () => Zu.profile||zuPeer()||{};
function zuLikesLabel(post){const likes=post.likes||0;return likes?`${n(likes)} ${likes===1?'like':'likes'}`:'Be the first to like this'}
function zuCommentsLabel(post){const count=post.comments||0;return count===1?'View 1 comment':`View all ${n(count)} comments`}

function zuFeedPost(post,index){
  const p=zuPostAuthor(),src=imageSrc(post.mediaUrl),video=post.kind==='video',id=domId(post.id),caption=post.caption||'';
  const time=post.createdAt?`<time class="zu-feed-time" datetime="${esc(post.createdAt)}">${esc(zuAgo(post.createdAt))}</time>`:'';
  return `<article class="zu-feed-post" id="zu-post-${id}" data-post-id="${esc(post.id)}" tabindex="-1" aria-posinset="${index+1}" aria-setsize="${Math.max(Zu.total,Zu.posts.length)}" aria-label="Post ${index+1} by ${esc(p.name||'this account')}">
    <header class="zu-feed-author"><span class="av zu-feed-avatar">${zuAvatar(p)}</span><div class="zu-feed-who"><strong>${esc(p.name||'BinzoLive member')}</strong>${zuApproved(p)?homeVerified(p):''}</div>
      ${zuSelf()?`<button type="button" class="zu-feed-options" aria-label="Post options" onclick="zuPostOptions(${index})">${ci('more',20)}</button>`:''}</header>
    <div class="zu-feed-media ${video?'is-video':''}" ${video?'':`onpointerup="zuFeedTap(event,${index})"`}>
      <div class="zu-post-loading" role="status" aria-label="Loading post ${video?'video':'photo'}" aria-busy="true">${skeletonLine('100px',14)}</div>
      ${video?`<video src="${src}" controls playsinline preload="metadata" onloadeddata="zuPostMediaReady(this)" onerror="zuPostMediaFailed(this)"></video>`:`<img src="${src}" alt="${esc(caption||'Photo by '+(p.name||'this account'))}" decoding="async" ${index>2?'loading="lazy"':''} draggable="false" onload="zuPostMediaReady(this)" onerror="zuPostMediaFailed(this)">`}
      <div class="zu-post-unavailable" hidden role="alert"><strong>${video?'Video':'Photo'} unavailable</strong><p>Check your connection and try again.</p><button type="button" onclick="zuRetryPostMedia(${index})">Try again</button></div>
      <span class="zu-like-burst" aria-hidden="true">${hi('heart',92)}</span>
    </div>
    <div class="zu-feed-actions">
      <button type="button" class="zu-like ${post.liked?'is-liked':''}" aria-pressed="${!!post.liked}" aria-label="Like" onclick="zuToggleLike(${index})" ${zuOffline()?'disabled':''}>${hi('heart',26)}</button>
      <button type="button" class="zu-comment-button" aria-label="Comment" onclick="zuOpenComments(${index})">${hi('chat',25)}</button>
    </div>
    <p class="zu-feed-likes" aria-live="polite">${zuLikesLabel(post)}</p>
    ${caption?`<div class="zu-feed-caption"><p class="${caption.length>110||caption.split('\n').length>2?'is-clamped':''}"><strong>${esc(p.name||'')}</strong> ${esc(caption)}</p>${caption.length>110||caption.split('\n').length>2?`<button type="button" class="zu-feed-more" onclick="zuExpandCaption(this)">more</button>`:''}</div>`:''}
    <button type="button" class="zu-feed-comments" onclick="zuOpenComments(${index})" ${post.comments?'':'hidden'}>${zuCommentsLabel(post)}</button>
    ${time}
  </article>`;
}
function zuFeedMore(){
  if(Zu.postsError)return `<div class="zu-feed-end" role="alert"><p>${esc(Zu.postsError)}</p><button type="button" class="zu-secondary" onclick="zuLoadPosts(true)">Try again</button></div>`;
  if(Zu.postsLoading)return `<div class="zu-feed-end" role="status" aria-label="Loading more posts" aria-busy="true">${skeletonLine('120px',14)}</div>`;
  return Zu.page*Zu.limit<Zu.total?`<div class="zu-feed-end"><button type="button" class="zu-secondary" data-feed-more onclick="zuLoadPosts(true)">Load more posts</button></div>`:'';
}

function zuOpenPhoto(index){
  const post=Zu.posts[index];if(!post||!imageSrc(post.mediaUrl))return;
  Zu.gallery=index;
  const p=zuPostAuthor();
  const dialog=zuDialog('Posts',`<div class="zu-feed" role="feed" aria-label="Posts by ${esc(p.name||'this account')}">${Zu.posts.map(zuFeedPost).join('')}<div class="zu-feed-tail">${zuFeedMore()}</div></div>`,'photo');
  dialog.classList.add('zu-feed-dialog');
  const header=dialog.querySelector('header');header.className='zu-feed-header';
  header.innerHTML=`${backButton('zuCloseDialog()',{label:'Back to profile'})}<div class="zu-feed-title"><span>${esc(p.name||'')}</span><h2 id="zu-dialog-title">Posts</h2></div>`;
  // Back closes the comments first, then the feed.
  dialog.addEventListener('cancel',event=>{if(ZuFeed.comments.postId){event.preventDefault();zuCloseComments()}});
  const feed=dialog.querySelector('.zu-feed');
  feed.querySelector(`#zu-post-${domId(post.id)}`)?.scrollIntoView({block:'start'});
  feed.addEventListener('scroll',()=>{
    // The post nearest the top is the current one, so options act on what is on screen.
    const top=feed.getBoundingClientRect().top;let current=Zu.gallery;
    feed.querySelectorAll('.zu-feed-post').forEach((article,i)=>{if(article.getBoundingClientRect().top-top<=120)current=i});
    Zu.gallery=current;
  },{passive:true});
  ZuFeed.observer?.disconnect();
  ZuFeed.observer=window.IntersectionObserver?new IntersectionObserver(entries=>{if(entries.some(entry=>entry.isIntersecting)&&!Zu.postsLoading&&!Zu.postsError&&Zu.page*Zu.limit<Zu.total)zuLoadPosts(true)},{root:feed,rootMargin:'0px 0px 600px 0px'}):null;
  ZuFeed.observer?.observe(feed.querySelector('.zu-feed-tail'));
  feed.querySelector(`#zu-post-${domId(post.id)}`)?.focus({preventScroll:true});
}
/* Pagination adds posts to an open feed without moving what is on screen. */
function zuFeedSync(){
  const feed=document.querySelector('.zu-feed-dialog .zu-feed');if(!feed)return;
  const shown=new Set([...feed.querySelectorAll('.zu-feed-post')].map(article=>article.dataset.postId));
  const tail=feed.querySelector('.zu-feed-tail');
  Zu.posts.forEach((post,index)=>{if(!shown.has(post.id)&&imageSrc(post.mediaUrl))tail.insertAdjacentHTML('beforebegin',zuFeedPost(post,index))});
  tail.innerHTML=zuFeedMore();
}
function zuFeedArticle(index){const post=Zu.posts[index];return post?document.getElementById(`zu-post-${domId(post.id)}`):null}
function zuPostMediaReady(media){media.parentElement.querySelector('.zu-post-loading')?.remove()}
function zuPostMediaFailed(media){
  zuPostMediaReady(media);media.hidden=true;media.parentElement.querySelector('.zu-post-unavailable').hidden=false;
}
function zuRetryPostMedia(index){
  const article=zuFeedArticle(index),media=article?.querySelector('.zu-feed-media>img,.zu-feed-media>video');if(!media)return;
  article.querySelector('.zu-post-unavailable').hidden=true;media.hidden=false;
  if(!article.querySelector('.zu-post-loading'))media.insertAdjacentHTML('beforebegin',`<div class="zu-post-loading" role="status" aria-label="Loading post photo" aria-busy="true">${skeletonLine('100px',14)}</div>`);
  const src=media.getAttribute('src');media.src='';media.src=src+(src.includes('?')?'&':'?')+'retry='+Date.now();
}
function zuExpandCaption(button){button.previousElementSibling?.classList.remove('is-clamped');button.remove()}

/* Likes: the heart answers at once and the server confirms; a failure restores the old state. */
function zuPaintReactions(index){
  const post=Zu.posts[index],article=zuFeedArticle(index);if(!post||!article)return;
  const like=article.querySelector('.zu-like');like.classList.toggle('is-liked',!!post.liked);like.setAttribute('aria-pressed',String(!!post.liked));
  article.querySelector('.zu-feed-likes').textContent=zuLikesLabel(post);
  const comments=article.querySelector('.zu-feed-comments');comments.hidden=!post.comments;comments.textContent=zuCommentsLabel(post);
}
function zuToggleLike(index,liked){
  const post=Zu.posts[index];if(!post||zuOffline()||ZuFeed.likes.has(post.id))return;
  const next=liked??!post.liked;if(next===!!post.liked)return;
  const requestId=++Zu.sequence;
  ZuFeed.likes.set(post.id,{requestId,liked:!!post.liked,likes:post.likes||0});
  post.liked=next;post.likes=Math.max(0,(post.likes||0)+(next?1:-1));
  zuPaintReactions(index);
  if(next){const heart=zuFeedArticle(index)?.querySelector('.zu-like');heart?.classList.remove('is-popping');void heart?.offsetWidth;heart?.classList.add('is-popping')}
  const data={id:post.id,liked:next,requestId};
  if(DEMO)return zuLiked({...data,likes:post.likes});
  Native.send('post.like',data);
}
function zuLiked(d){
  const pending=ZuFeed.likes.get(d.id);if(!pending||pending.requestId!==d.requestId)return;
  ZuFeed.likes.delete(d.id);
  const index=Zu.posts.findIndex(post=>post.id===d.id);if(index<0)return;
  Object.assign(Zu.posts[index],{liked:!!d.liked,likes:d.likes});zuPaintReactions(index);
}
Native.on('post.liked',zuLiked);
Native.on('post.like.error',d=>{
  const pending=ZuFeed.likes.get(d.id);if(!pending||pending.requestId!==d.requestId)return;
  ZuFeed.likes.delete(d.id);
  const index=Zu.posts.findIndex(post=>post.id===d.id);
  if(index>=0){Object.assign(Zu.posts[index],{liked:pending.liked,likes:pending.likes});zuPaintReactions(index)}
  appNotice(d.message||'Your like could not be saved. Try again.');
});
/* A double tap on a photo likes it (never unlikes it) and shows a large heart. */
function zuFeedTap(event,index){
  if(event.pointerType==='mouse'&&event.button!==0)return;
  const now=Date.now(),last=ZuFeed.lastTap;
  if(last&&last.index===index&&now-last.at<320&&Math.hypot(event.clientX-last.x,event.clientY-last.y)<40){
    ZuFeed.lastTap=null;
    const burst=zuFeedArticle(index)?.querySelector('.zu-like-burst');
    if(burst){burst.classList.remove('is-bursting');void burst.offsetWidth;burst.classList.add('is-bursting')}
    zuToggleLike(index,true);return;
  }
  ZuFeed.lastTap={index,at:now,x:event.clientX,y:event.clientY};
}
function zuPostOptions(index){Zu.gallery=index;zuConfirmDelete()}

/* Comments open in a sheet over the feed. Authors delete their own comments;
   the post owner may delete any comment on their post. */
function zuCommentsMarkup(){
  const c=ZuFeed.comments,me=S.user?.id||'',owner=zuSelf();
  if(c.loading&&!c.items.length)return `<div class="zu-comments-state" role="status" aria-label="Loading comments" aria-busy="true">${[0,1,2].map(()=>`<div class="zu-comment">${'<span class="av zh-skeleton-shape"></span>'}<div>${skeletonLine('70%',12)}${skeletonLine('40%',10)}</div></div>`).join('')}</div>`;
  if(c.error&&!c.items.length)return `<div class="zu-comments-state" role="alert"><p>${esc(c.error)}</p><button type="button" class="zu-secondary" onclick="zuLoadComments()">Try again</button></div>`;
  if(!c.items.length)return `<div class="zu-comments-state"><h4>No comments yet</h4><p>Start the conversation.</p></div>`;
  return c.items.map(comment=>{const mine=comment.user?.id===me,canDelete=mine||owner;return `<div class="zu-comment" data-comment-id="${esc(comment.id)}"><span class="av">${zuAvatar({name:comment.user?.name,avatarUrl:comment.user?.avatarUrl})}</span><div><p><strong>${esc(comment.user?.name||'BinzoLive member')}</strong> ${esc(comment.text)}</p><span class="zu-comment-meta">${esc(zuAgo(comment.createdAt,true))}${canDelete?`<button type="button" onclick="zuDeleteComment('${domId(comment.id)}')" ${c.deleting===comment.id?'disabled':''}>${c.deleting===comment.id?'Deleting…':'Delete'}</button>`:''}</span></div></div>`}).join('')
    +(c.items.length<c.total?`<button type="button" class="zu-comments-more" onclick="zuLoadComments(true)" ${c.loading?'disabled':''}>${c.loading?'Loading…':'Load more comments'}</button>`:'');
}
function zuPaintComments(){
  const list=document.querySelector('.zu-comments-list');if(list)list.innerHTML=zuCommentsMarkup();
  const post=document.querySelector('.zu-comment-post');if(post)post.disabled=ZuFeed.comments.sending||!document.getElementById('zu-comment-input')?.value.trim();
}
function zuOpenComments(index){
  const post=Zu.posts[index],dialog=document.querySelector('.zu-feed-dialog');if(!post||!dialog)return;
  zuCloseComments();
  Object.assign(ZuFeed.comments,{postId:post.id,index,items:[],total:post.comments||0,page:0,error:'',sending:false,deleting:''});
  const avatar=zuAvatar({name:S.user?.name||me.n,avatarUrl:S.user?.avatarUrl});
  dialog.insertAdjacentHTML('beforeend',`<div class="zu-comments-backdrop" onclick="zuCloseComments()"></div><section class="zu-comments" role="dialog" aria-modal="true" aria-labelledby="zu-comments-title">
    <header><h3 id="zu-comments-title">Comments</h3><button type="button" class="zu-icon-button" aria-label="Close comments" onclick="zuCloseComments()">${hi('close',20)}</button></header>
    <div class="zu-comments-list" aria-live="polite"></div>
    <form class="zu-comment-form" onsubmit="event.preventDefault();zuSendComment()"><span class="av">${avatar}</span><input id="zu-comment-input" maxlength="1000" placeholder="Add a comment…" aria-label="Add a comment" autocomplete="off" enterkeyhint="send" oninput="zuPaintComments()"><button type="submit" class="zu-comment-post" disabled>Post</button></form>
  </section>`);
  zuLoadComments();
  document.getElementById('zu-comment-input')?.focus({preventScroll:true});
}
function zuCloseComments(){
  document.querySelectorAll('.zu-comments,.zu-comments-backdrop').forEach(el=>el.remove());
  const index=ZuFeed.comments.index;ZuFeed.comments.postId='';
  zuFeedArticle(index)?.querySelector('.zu-comment-button')?.focus({preventScroll:true});
}
function zuLoadComments(more=false){
  const c=ZuFeed.comments;if(!c.postId||c.loading)return;
  c.loading=true;c.error='';c.requestId=++Zu.sequence;
  const data={id:c.postId,page:more?c.page+1:1,requestId:c.requestId};
  zuPaintComments();
  if(DEMO){Native.receive({type:'data.postComments',data:{...data,comments:[],total:0,limit:20}});return}
  Native.send('post.comments.load',data);
}
Native.on('data.postComments',d=>{
  const c=ZuFeed.comments;if(d.id!==c.postId||d.requestId!==c.requestId)return;
  c.loading=false;c.error='';c.page=d.page||1;c.total=d.total||0;
  const rows=d.comments||[];
  c.items=c.page>1?[...c.items,...rows.filter(row=>!c.items.some(old=>old.id===row.id))]:rows;
  zuPaintComments();
});
Native.on('post.comments.error',d=>{
  const c=ZuFeed.comments;if(d.id!==c.postId||d.requestId!==c.requestId)return;
  c.loading=false;c.error=d.message||'Comments could not be loaded. Try again.';zuPaintComments();
});
function zuSendComment(){
  const c=ZuFeed.comments,input=document.getElementById('zu-comment-input'),text=input?.value.trim()||'';
  if(!c.postId||!text||c.sending||zuOffline())return;
  c.sending=true;c.sendId=++Zu.sequence;input.disabled=true;zuPaintComments();
  const data={id:c.postId,text,requestId:c.sendId};
  if(DEMO){Native.receive({type:'post.comment.saved',data:{id:c.postId,requestId:c.sendId,comment:{id:'preview-'+c.sendId,text,createdAt:new Date().toISOString(),user:{id:S.user?.id||'',name:S.user?.name||me.n,avatarUrl:S.user?.avatarUrl||''}}}});return}
  Native.send('post.comment.add',data);
}
function zuCommentCount(postId,delta){
  const index=Zu.posts.findIndex(post=>post.id===postId);if(index<0)return;
  Zu.posts[index].comments=Math.max(0,(Zu.posts[index].comments||0)+delta);zuPaintReactions(index);
}
Native.on('post.comment.saved',d=>{
  const c=ZuFeed.comments;if(d.requestId!==c.sendId)return;
  c.sending=false;zuCommentCount(d.id,1);
  if(d.id!==c.postId)return;
  c.items=[d.comment,...c.items];c.total++;
  const input=document.getElementById('zu-comment-input');if(input){input.disabled=false;input.value='';input.focus({preventScroll:true})}
  zuPaintComments();
});
Native.on('post.comment.error',d=>{
  const c=ZuFeed.comments;if(d.requestId!==c.sendId)return;
  c.sending=false;const input=document.getElementById('zu-comment-input');if(input)input.disabled=false;
  zuPaintComments();appNotice(d.message||'Your comment could not be posted. Try again.');
});
function zuDeleteComment(commentId){
  const c=ZuFeed.comments;if(!c.postId||c.deleting||zuOffline())return;
  c.deleting=commentId;c.deleteId=++Zu.sequence;zuPaintComments();
  const data={id:c.postId,commentId,requestId:c.deleteId};
  if(DEMO){Native.receive({type:'post.comment.deleted',data});return}
  Native.send('post.comment.delete',data);
}
Native.on('post.comment.deleted',d=>{
  const c=ZuFeed.comments;if(d.requestId!==c.deleteId)return;
  c.deleting='';zuCommentCount(d.id,-1);
  if(d.id!==c.postId)return;
  c.items=c.items.filter(comment=>comment.id!==d.commentId);c.total=Math.max(0,c.total-1);zuPaintComments();
});
Native.on('post.comment.delete.error',d=>{
  const c=ZuFeed.comments;if(d.requestId!==c.deleteId)return;
  c.deleting='';zuPaintComments();appNotice(d.message||'The comment could not be deleted. Try again.');
});
for(const type of ['session.none','session.expired'])Native.on(type,()=>{ZuFeed.likes.clear();ZuFeed.comments.postId=''});
