/* Animate the live content once per tab change, never on a data refresh. */
window.ZimiNavigation=(()=>{
  const tabs=['home','chats','profile','settings'];
  const scrollViews=[...tabs,'all-creators'];
  const positions=new Map();
  const reduced=window.matchMedia('(prefers-reduced-motion: reduce)');
  let animation=null,sequence=0;
  function cancel(){sequence++;if(animation){animation.cancel();animation=null}document.getElementById('screen')?.removeAttribute('data-tab-transition')}
  function before(view){
    const from=S.v,scroller=document.getElementById('scroll-root');
    if(scrollViews.includes(from))positions.set(from,window.ZimiOffline?.scrollPosition()??scroller?.scrollTop??0);
    cancel();
    return {from,to:view,animate:from!==view&&tabs.includes(from)&&tabs.includes(view),direction:tabs.indexOf(view)>tabs.indexOf(from)?1:-1,sequence};
  }
  function after(change){
    if(!change||change.sequence!==sequence||S.v!==change.to)return;
    if(scrollViews.includes(change.to)){
      const top=positions.get(change.to)||0;
      if(window.ZimiOffline?.restoreScroll(top))return;
      if(window.zimiScrollTo)window.zimiScrollTo(top);
      else document.getElementById('scroll-root').scrollTop=top;
    }
    if(!change.animate||reduced.matches)return;
    const screen=document.getElementById('screen');
    if(!screen?.animate)return;
    screen.dataset.tabTransition=change.to;
    const current=screen.animate([{opacity:.75,transform:'translateY(4px)'},{opacity:1,transform:'translateY(0)'}],{duration:180,easing:'cubic-bezier(.2,0,0,1)',fill:'none'});
    current.id='zimi-tab-switch';animation=current;
    current.finished.then(()=>{if(animation===current){animation=null;screen.removeAttribute('data-tab-transition')}},()=>{});
  }
  function reset(){cancel();positions.clear()}
  /* Android has no browser history for this single-document WebView. Handle
     one foreground layer per press, using the same cleanup as its UI control. */
  function back(){
    if(document.getElementById('zc-photo-viewer')){window.ZimiChatPhoto.close();return}
    const dialog=[...document.querySelectorAll('dialog[open]')].at(-1);
    if(dialog){
      if(typeof dialog.requestClose==='function')dialog.requestClose();
      else if(dialog.dispatchEvent(new Event('cancel',{cancelable:true})))dialog.close();
      return;
    }
    // A verification call owns its camera and server session. Back must not
    // dismiss the overlay while leaving that session running behind a screen.
    if(document.getElementById('zv-call')){appNotice('Use the call controls to decline or end your verification call.');return}
    if(document.getElementById('zr-link-overlay')){zrLinkDismiss();return}
    if(Home.giftTo){
      if(CoinUI.topup){CoinUI.topup=false;coinPaint()}
      else homeCloseGifts();
      return;
    }
    if(Room.sheet){zrClose();return}
    if(Chats.menu){zcCloseMenu();return}
    if(Chats.composeOpen||Chats.filtersOpen){zcCloseDialogs();return}
    if(document.querySelector('.zc-thread-menu:not([hidden])')){zcThreadMenu(false);return}
    if(document.querySelector('#zc-attach:not([hidden])')){zcThreadAttach(false);return}
    if(document.querySelector('#zc-emoji:not([hidden])')){zcThreadEmoji(false);return}
    if(S.sh||S.tray||S.more){S.sh=0;S.tray=0;S.more=0;r();return}
    if(window.ZimiChatVoice?.active()){appNotice('Send or cancel your voice message before leaving.');return}
    if(S.v==='thread'&&(Chats.reply||Chats.editing)){zcCancelContext();return}
    if(Home.preparingCall){homeCancelPrepare();return}
    if(Room.transition){appNotice('Your call is connecting. Please wait for the call controls.');return}
    if(['live','call','voice','hcall'].includes(S.v)){zrExit();return}
    if(['dial','dialback'].includes(S.v)){cancelDial();return}
    if(S.v==='ring'){window.ZimiMedia?.stop();declineRing();return}
    if(S.v==='incoming'){declineMemberRing();return}
    if(S.v==='login'){if(S.auth)obBack();return}
    // Reuse screen-specific destinations (including public-profile return
    // routes), and respect disabled Back controls during an in-flight save.
    const control=[...document.querySelectorAll('#top .zb-back,#screen .zb-back')].find(button=>button.getClientRects().length&&!button.closest('[hidden],[inert]'));
    if(control){if(!control.disabled)control.click();return}
    if(['home','welcome'].includes(S.v)){Native.send('app.exit.request');return}
    if(S.v==='summary')S.callId=null;
    go(S.loggedIn?'home':'welcome');
  }
  reduced.addEventListener?.('change',()=>{if(reduced.matches)cancel()});
  Native.on('app.back',back);
  // The tab bar steps aside while the keyboard is up, so it never rides on top of it.
  Native.on('keyboard',d=>document.documentElement.classList.toggle('zh-keyboard-open',!!d.open));
  Native.on('session.none',reset);Native.on('session.expired',reset);
  return {before,after,reset,back};
})();
