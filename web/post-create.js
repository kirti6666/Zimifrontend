/* A post has its own composer. Drafts stay in this session until publication or removal. */
P.close=P.close||'<path d="m6 6 12 12M18 6 6 18" stroke-linecap="round"/>';
window.ZimiPostCreate = (() => {
  function open(){if(S.loggedIn)go('create-post')}
  function back(){if(!S.postPublishing&&!S.mediaPreparing)go('profile')}
  function remove(){
    if(S.postPublishing||S.mediaPreparing)return;
    S.postDraftData='';S.postError='';S.mediaError='';r();document.getElementById('post-photo')?.focus({preventScroll:true});
  }
  function caption(input){
    S.postCaption=input.value;
    const count=document.getElementById('post-caption-count');if(count)count.textContent=`${input.value.length.toLocaleString('en-IN')} / 2,000`;
  }
  function capture(){const input=document.activeElement;return S.v==='create-post'&&input?.id==='postcaption'?{start:input.selectionStart,end:input.selectionEnd}:null}
  function after(focus){
    if(S.v!=='create-post'||!focus)return;
    const input=document.getElementById('postcaption');if(input&&!input.disabled){input.focus({preventScroll:true});input.setSelectionRange(focus.start,focus.end)}
  }
  function render(){
    const busy=S.postPublishing||S.mediaPreparing,disabled=busy?'disabled':'',src=imageSrc(S.postDraftData),offline=!!window.ZimiOffline?.isOffline();
    const name=S.user?.name||me.n||'Your profile',avatar=imageSrc(S.avatarData||S.user?.avatarUrl);
    return `<section class="zpost-create" aria-label="Create a post">
      <header class="zpost-header">${backButton('ZimiPostCreate.back()',{label:'Back to profile',attrs:disabled})}<h1>New post</h1><button type="button" class="zpost-publish" aria-label="Publish post" onclick="publishPost()" ${busy||!src||offline?'disabled':''}>${S.postPublishing?'Publishing…':'Publish'}</button></header>
      <div class="zpost-content"><div class="zpost-photo-column">
        <div class="zpost-preview ${src?'has-photo':''}">${src?`<img src="${src}" alt="Photo ready to publish">`:`<div class="zpost-empty">${I('grid',34)}<h2>Share a moment</h2><p>Choose a photo for your profile.</p><label class="zpost-choose" for="post-photo">${I('plus',18)} Choose a photo</label></div>`}
          ${S.mediaPreparing?'<div class="zpost-preparing" role="status" aria-busy="true" aria-label="Preparing your photo">'+skeletonLine('120px',16)+'<span>Preparing your photo…</span></div>':''}
        </div><input class="zpost-file" id="post-photo" type="file" accept="image/*" aria-label="Choose post photo" onchange="pickMedia(event,'posts')" ${disabled}>
        ${src?`<div class="zpost-photo-actions"><label class="zpost-replace" for="post-photo">${I('flip',17)} Change photo</label><button type="button" onclick="ZimiPostCreate.remove()" ${disabled}>${I('close',17)} Remove</button></div>`:''}
        ${S.mediaError?`<p class="zpost-error" role="alert">${esc(S.mediaError)}</p>`:''}
      </div><div class="zpost-copy-column">
        <div class="zpost-author"><span class="av zpost-avatar">${avatar?`<img src="${avatar}" alt="">`:face(me)}</span><div><strong>${esc(name)}</strong><span>Posting to your profile</span></div></div>
        <div class="zpost-caption-heading"><label for="postcaption">Caption</label><span id="post-caption-count">${n((S.postCaption||'').length)} / 2,000</span></div>
        <textarea id="postcaption" class="zpost-caption" maxlength="2000" rows="6" placeholder="Write something about this moment…" oninput="ZimiPostCreate.caption(this)" ${disabled}>${esc(S.postCaption||'')}</textarea>
        <p class="zpost-visibility">${I('user',16)} Visible on your profile</p>
        ${S.postPublishing?'<p class="zpost-status" role="status" aria-busy="true">Publishing your post…</p>':''}
        ${S.postError?`<p class="zpost-error" role="alert">${esc(S.postError)}</p>`:''}
        ${offline?'<p class="zpost-error" role="status">Connect to the internet to publish your post.</p>':''}
        <p class="zpost-draft-note">Your draft stays here while you use the app.</p>
      </div></div></section>`;
  }
  return {open,back,remove,caption,capture,after,render};
})();
