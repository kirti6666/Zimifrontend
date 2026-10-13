/* Animate the live content once per tab change, never on a data refresh. */
window.ZimiNavigation=(()=>{
  const tabs=['home','explore','chats','profile'];
  const positions=new Map();
  const reduced=window.matchMedia('(prefers-reduced-motion: reduce)');
  let animation=null,sequence=0;
  function cancel(){sequence++;if(animation){animation.cancel();animation=null}document.getElementById('screen')?.removeAttribute('data-tab-transition')}
  function before(view){
    const from=S.v,scroller=document.getElementById('scroll-root');
    if(tabs.includes(from))positions.set(from,scroller?.scrollTop||0);
    cancel();
    return {from,to:view,animate:from!==view&&tabs.includes(from)&&tabs.includes(view),direction:tabs.indexOf(view)>tabs.indexOf(from)?1:-1,sequence};
  }
  function after(change){
    if(!change||change.sequence!==sequence||S.v!==change.to)return;
    if(tabs.includes(change.to)){
      const top=positions.get(change.to)||0;
      if(window.zimiScrollTo)window.zimiScrollTo(top);
      else document.getElementById('scroll-root').scrollTop=top;
    }
    if(!change.animate||reduced.matches)return;
    const screen=document.getElementById('screen');
    if(!screen?.animate)return;
    screen.dataset.tabTransition=change.to;
    const current=screen.animate([{opacity:.35,transform:`translateX(${change.direction*12}px)`},{opacity:1,transform:'translateX(0)'}],{duration:240,easing:'cubic-bezier(.22,.8,.25,1)',fill:'none'});
    current.id='zimi-tab-switch';animation=current;
    current.finished.then(()=>{if(animation===current){animation=null;screen.removeAttribute('data-tab-transition')}},()=>{});
  }
  function reset(){cancel();positions.clear()}
  reduced.addEventListener?.('change',()=>{if(reduced.matches)cancel()});
  Native.on('session.none',reset);Native.on('session.expired',reset);
  return {before,after,reset};
})();
