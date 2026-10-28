/* Quiet touch feedback. Controls acknowledge a press without moving the layout,
   interrupting scrolling or adding decorative effects to a completed action. */
window.ZimiTactile = (() => {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const canMove = typeof Element.prototype.animate === 'function';
  const TAPPABLE = 'button, [role="button"], [role="tab"], [role="switch"], a[href]';
  const OWN_STYLE = '.ob-shell, .ob-dialog';
  const COVERS = '.zh-person-photo-link, .zh-person-watch, .zh-tile-hit';
  const CARDS = '.zh-person-card, .zh-tile';
  let pressed = null, lastHaptic = 0;

  function usable(el) { return el && !el.closest(OWN_STYLE) && !el.disabled && el.getAttribute('aria-disabled') !== 'true'; }
  function filled(el) {
    const style = getComputedStyle(el), rgba = style.backgroundColor.match(/[\d.]+/g);
    return style.backgroundImage.includes('gradient') || (!!rgba && (rgba.length < 4 || Number(rgba[3]) >= .6));
  }
  function haptic(kind) {
    const now = Date.now();
    if (now - lastHaptic < 70) return;
    lastHaptic = now; Native.send('ui.haptic', { kind });
  }
  function cancelAnimations(el) {
    el.getAnimations().forEach(animation => { if (animation.id.startsWith('zt-press')) animation.cancel(); });
  }
  function release(animate = true) {
    if (!pressed) return;
    const { el, opacity } = pressed, current = Number(getComputedStyle(el).opacity);
    pressed = null; cancelAnimations(el);
    if (!animate || reduced.matches || !el.isConnected) return;
    const animation = el.animate({ opacity: [current, opacity] }, { duration: 130, easing: 'ease-out' });
    animation.id = 'zt-press-release';
  }
  function press(el) {
    release(false);
    if (reduced.matches || !canMove) return;
    cancelAnimations(el);
    const opacity = Number(getComputedStyle(el).opacity);
    pressed = { el, opacity };
    const animation = el.animate({ opacity: [opacity, opacity * .78] }, { duration: 100, easing: 'ease-out', fill: 'forwards' });
    animation.id = 'zt-press';
  }
  document.addEventListener('pointerdown', event => {
    if (event.button > 0) return;
    let el = event.target.closest?.(TAPPABLE);
    if (!usable(el)) return;
    if (el.matches(COVERS)) el = el.closest(CARDS) || el;
    press(el);
  }, { passive: true, capture: true });
  document.addEventListener('pointerup', () => release(), { passive: true, capture: true });
  document.addEventListener('pointercancel', () => release(false), { passive: true, capture: true });
  window.addEventListener('blur', () => release(false));
  document.addEventListener('aurora:navigate', () => release(false));
  reduced.addEventListener?.('change', () => { if (reduced.matches) release(false); });
  document.addEventListener('click', event => {
    const el = event.target.closest?.(TAPPABLE);
    if (!usable(el)) return;
    if (el.matches('[aria-pressed], [aria-checked], [role="tab"], [role="switch"], [data-tab], [data-dashboard-filter], [data-home-filter]')) haptic('selection');
    else if (filled(el)) haptic('light');
  }, true);
  Native.on('app.background', () => release(false));
  Native.on('follow.saved', data => { if (data.on) haptic('success'); });
  Native.on('gift.sent', () => haptic('success'));
  return { haptic };
})();
