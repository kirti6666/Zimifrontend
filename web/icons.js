/* Icon press animations (styles in icons.css). A press on a control plays its icon's animation.
   Most actions redraw the screen with innerHTML, which would cut the animation short, so an
   animation still running when its control is redrawn continues on the new copy from the same
   point. Reduced-motion preferences turn it off. */
window.ZimiIcons=(()=>{
  const reduced=window.matchMedia('(prefers-reduced-motion: reduce)');
  const controls='button,a[href],summary,label,[role="button"],[role="tab"],[role="menuitem"],[role="switch"]';
  const longest=140;
  let pending=null;
  /* The control's own icon: a direct child, or its only icon. Rows full of icons are left alone. */
  function iconOf(control){const own=control.querySelector(':scope>.zi-icon');if(own)return own;const icons=control.querySelectorAll('.zi-icon');return icons.length===1?icons[0]:null}
  function keyOf(control){for(const name of ['onclick','aria-label','data-tab','id'])if(control.hasAttribute(name))return [name,control.getAttribute(name)];return null}
  function play(icon,elapsed=0){icon.classList.remove('zi-tap');icon.style.removeProperty('animation-delay');void icon.getBoundingClientRect();if(elapsed)icon.style.animationDelay=`-${Math.round(elapsed)}ms`;icon.classList.add('zi-tap')}
  function press(control){
    if(reduced.matches||!control||control.disabled||control.getAttribute('aria-disabled')==='true')return;
    const icon=iconOf(control);if(!icon)return;
    play(icon);const key=keyOf(control);pending=key?{key,icon,at:performance.now()}:null;
  }
  function resume(){
    if(!pending||pending.icon.isConnected)return;
    const elapsed=performance.now()-pending.at,[name,value]=pending.key;pending=null;
    if(elapsed>=longest)return;
    const control=document.querySelector(`[${name}="${CSS.escape(value)}"]`),icon=control&&iconOf(control);
    if(icon&&!icon.classList.contains('zi-tap'))play(icon,elapsed);
  }
  document.addEventListener('pointerdown',event=>{if(event.pointerType!=='mouse'||event.button===0)press(event.target.closest?.(controls))},{capture:true,passive:true});
  document.addEventListener('keydown',event=>{if((event.key==='Enter'||event.key===' ')&&!event.repeat&&!event.target.matches?.('input,textarea,select,[contenteditable]'))press(event.target.closest?.(controls))},true);
  /* Only press animations end; the looping ones in icons.css are infinite. */
  document.addEventListener('animationend',event=>{const icon=event.target;if(icon.classList?.contains('zi-tap')&&event.animationName.startsWith('zi-')){icon.classList.remove('zi-tap');icon.style.removeProperty('animation-delay')}},true);
  reduced.addEventListener?.('change',()=>{if(!reduced.matches)return;pending=null;document.querySelectorAll('.zi-icon.zi-tap').forEach(icon=>{icon.classList.remove('zi-tap');icon.style.removeProperty('animation-delay')})});
  new MutationObserver(resume).observe(document.documentElement,{childList:true,subtree:true});
  return {play};
})();
