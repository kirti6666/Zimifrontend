/* Reading, typing and recording all count as an active conversation. A short
   renewable server lease keeps scheduled welcomes out of that conversation. */
window.ZimiChatActivity=(()=>{
  let peer='',timer=null,foreground=true,last=0;
  function sync(renew=false){
    const wanted=!DEMO&&S.loggedIn&&S.v==='thread'&&S.h&&foreground&&!document.hidden?String(S.h):'';
    if(peer&&peer!==wanted)Native.send('chat.activity',{with:peer,active:false});
    if(wanted&&(wanted!==peer||renew||Date.now()-last>=15000)){Native.send('chat.activity',{with:wanted,active:true});last=Date.now()}
    peer=wanted;
    if(peer&&!timer)timer=setInterval(()=>sync(true),15000);
    if(!peer){clearInterval(timer);timer=null;last=0}
  }
  function stop(){if(peer)Native.send('chat.activity',{with:peer,active:false});peer='';clearInterval(timer);timer=null;last=0}
  document.addEventListener('aurora:navigate',()=>sync());
  document.addEventListener('visibilitychange',()=>sync());
  Native.on('app.background',()=>{foreground=false;sync()});
  Native.on('app.foreground',()=>{foreground=true;sync(true)});
  Native.on('session.none',stop);Native.on('session.expired',stop);
  return {sync,stop};
})();
