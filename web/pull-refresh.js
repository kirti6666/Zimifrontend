/* Pull down from the top of a screen to reload it; there are no refresh buttons.
   Screens register how they reload and when a reload is already running. Their
   own skeletons show the progress, so the indicator only follows the finger. */
window.ZimiPullRefresh=(()=>{
  const views={},SLOP=10,RESISTANCE=.55,TRIGGER=60,MAX=92;
  let pull=null,indicator=null;
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
      indicator.innerHTML='<svg viewBox="0 0 24 24" width="22" height="22"><circle cx="12" cy="12" r="9"/></svg>';
      document.body.append(indicator);
    }
    const progress=Math.min(1,distance/TRIGGER);
    indicator.style.top=scroller().getBoundingClientRect().top+'px';
    indicator.style.setProperty('--pull',distance+'px');
    indicator.style.setProperty('--pull-progress',String(progress));
    indicator.classList.toggle('is-ready',progress>=1);
    indicator.hidden=false;
  }
  function cancel(){pull=null;if(indicator)indicator.hidden=true}
  function start(event){
    cancel();
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
    cancel();
    if(ready)refresh();
  }
  document.addEventListener('touchstart',start,{passive:true});
  document.addEventListener('touchmove',move,{passive:true});
  document.addEventListener('touchend',end,{passive:true});
  document.addEventListener('touchcancel',cancel,{passive:true});
  document.addEventListener('aurora:navigate',cancel);
  // Account history screens are plain server resources.
  for(const [view,keys] of [['wallet',['wallet','transactions']],['transactions',['transactions']],['calls',['calls']]])
    register(view,{refresh:()=>keys.forEach(contentRetry),busy:()=>keys.some(contentPending)});
  return {register,refresh};
})();
