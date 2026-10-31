/* Pull down from the top of a screen to reload it; there are no refresh buttons.
   Screens register how they reload and when a reload is already running. The
   indicator looks like the platform default: a round disc whose arc grows with
   the pull, spins while the screen reloads, then shrinks away. */
window.ZimiPullRefresh=(()=>{
  const views={},SLOP=10,RESISTANCE=.55,TRIGGER=60,MAX=92,REST=64,ARC=53.41,MIN_SPIN=500,MAX_SPIN=15000;
  let pull=null,indicator=null,refreshing=null;
  const scroller=()=>document.getElementById('scroll-root');
  function register(names,handler){[].concat(names).forEach(name=>{views[name]=handler})}
  // Programmatic too, so tests and the gesture share one guarded path.
  function refresh(){
    const handler=views[S.v];
    if(!handler||handler.busy?.()||window.ZimiOffline?.isOffline())return false;
    if(DEMO)r();else handler.refresh();
    return true;
  }
  function eligible(target){
    const root=scroller();
    return !!views[S.v]&&!!root&&root.contains(target)&&root.scrollTop<=0&&!document.querySelector('dialog[open],.zh-sheet-backdrop');
  }
  function paint(distance){
    if(!indicator){
      indicator=document.createElement('div');indicator.id='zimi-pull';indicator.setAttribute('aria-hidden','true');
      // An arc that starts at the top and an arrowhead that rides on its end.
      indicator.innerHTML='<svg viewBox="0 0 24 24" width="24" height="24"><circle cx="12" cy="12" r="8.5"/><path d="M12 1 14.75 3.5 12 6Z"/></svg>';
      document.body.append(indicator);
    }
    const progress=Math.min(1,distance/TRIGGER);
    indicator.classList.remove('is-refreshing','is-done');
    indicator.style.top=scroller().getBoundingClientRect().top+'px';
    indicator.style.setProperty('--pull',distance+'px');
    indicator.style.setProperty('--pull-progress',String(progress));
    // The arc grows to four fifths of a circle as the pull reaches the trigger.
    indicator.querySelector('circle').style.strokeDasharray=`${(ARC*.8*progress).toFixed(2)} ${ARC}`;
    indicator.classList.toggle('is-ready',progress>=1);
    indicator.hidden=false;
  }
  function hide(){if(indicator&&!refreshing){indicator.hidden=true;indicator.classList.remove('is-ready','is-refreshing','is-done')}}
  function cancel(){pull=null;hide()}
  /* After a release past the trigger the disc rests below the header and spins
     until the screen stops reloading: at least briefly, never forever. */
  function spin(){
    const view=S.v,handler=views[view],started=Date.now();
    indicator.style.setProperty('--pull',REST+'px');indicator.querySelector('circle').style.strokeDasharray='';
    indicator.classList.add('is-refreshing');indicator.hidden=false;
    const check=()=>{
      const elapsed=Date.now()-started;
      if(S.v!==view||elapsed>=MAX_SPIN||elapsed>=MIN_SPIN&&!handler.busy?.())return finish();
      refreshing.timer=setTimeout(check,120);
    };
    refreshing={timer:setTimeout(check,120)};
  }
  function stop(){clearTimeout(refreshing?.timer);refreshing=null}
  function finish(){
    stop();indicator.classList.add('is-done');
    setTimeout(()=>{if(!refreshing&&!pull?.active)hide()},180);
  }
  function start(event){
    // A pull waits while the screen reloads; once it has, the spinner gives way.
    if(refreshing&&views[S.v]?.busy?.())return;
    stop();cancel();
    if(event.touches.length!==1||!eligible(event.target))return;
    const touch=event.touches[0];pull={x:touch.clientX,y:touch.clientY,distance:0,active:false};
  }
  function move(event){
    if(!pull)return;
    const touch=event.touches[0],dx=touch.clientX-pull.x,dy=touch.clientY-pull.y;
    // A sideways swipe, an upward scroll or a moved page belongs to scrolling.
    if(event.touches.length!==1||scroller().scrollTop>0||(!pull.active&&(dy<-2||Math.abs(dx)>Math.abs(dy)&&Math.abs(dx)>SLOP)))return cancel();
    if(!pull.active&&dy<SLOP)return;
    pull.active=true;pull.distance=Math.min(MAX,Math.max(0,(dy-SLOP)*RESISTANCE));
    paint(pull.distance);
  }
  function end(){
    const ready=!!pull?.active&&pull.distance>=TRIGGER;
    pull=null;
    if(ready&&refresh())spin();else hide();
  }
  document.addEventListener('touchstart',start,{passive:true});
  document.addEventListener('touchmove',move,{passive:true});
  document.addEventListener('touchend',end,{passive:true});
  document.addEventListener('touchcancel',cancel,{passive:true});
  document.addEventListener('aurora:navigate',()=>{stop();cancel()});
  // Account history screens are plain server resources.
  for(const [view,keys] of [['wallet',['wallet','transactions']],['transactions',['transactions']],['calls',['calls']]])
    register(view,{refresh:()=>keys.forEach(contentRetry),busy:()=>keys.some(contentPending)});
  return {register,refresh};
})();
