/* How the app feels to touch: a springy press on everything tappable, a ripple on filled
   buttons, a haptic tick for choices and main actions, cards that rise in the first time each
   appears on a screen, and a small burst of petals when a follow or a gift goes through.
   Onboarding keeps its own press styles. Motion is skipped when the device asks for less. */
window.ZimiTactile = (() => {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const canMove = !!window.CSS?.supports?.('scale', '1') && typeof Element.prototype.animate === 'function';
  const TAPPABLE = 'button, [role="button"], [role="tab"], [role="switch"], a[href]';
  const OWN_STYLE = '.ob-shell, .ob-dialog';
  // Invisible buttons that cover a card: pressing them should move the card.
  const COVERS = '.zh-person-photo-link, .zh-person-watch, .zh-tile-hit';
  const CARDS = '.zh-person-card, .zh-tile';
  const REVEAL = '.zh-person-card:not(.zh-person-placeholder), .zh-tile, .zc-row:not(.zc-skeleton-row), .zu-photo';
  let pressed = null, lastHaptic = 0, seen = new Set(), queued = false, giftFrom = null;

  const quiet = () => reduced.matches || !canMove;
  function usable(el) { return el && !el.closest(OWN_STYLE) && !el.disabled && el.getAttribute('aria-disabled') !== 'true'; }
  function filled(el) {
    const style = getComputedStyle(el);
    if (style.backgroundImage.includes('gradient')) return true;
    const rgba = style.backgroundColor.match(/[\d.]+/g);
    return !!rgba && (rgba.length < 4 || Number(rgba[3]) >= .6);
  }
  function haptic(kind) {
    const now = Date.now();
    if (now - lastHaptic < 70) return;
    lastHaptic = now;
    Native.send('ui.haptic', { kind });
  }

  function press(el) {
    if (quiet()) return;
    el.getAnimations().forEach(a => { if (a.id === 'zt-press') a.cancel(); });
    const a = el.animate({ scale: [1, .955] }, { duration: 110, easing: 'cubic-bezier(.3,.7,.4,1)', fill: 'forwards' });
    a.id = 'zt-press';
  }
  function release(el) {
    if (!canMove) return;
    el.getAnimations().forEach(a => { if (a.id === 'zt-press') a.cancel(); });
    if (reduced.matches || !el.isConnected) return;
    el.animate({ scale: [.955, 1.025, 1] }, { duration: 340, easing: 'cubic-bezier(.2,.8,.3,1)' });
  }
  function ripple(el, event) {
    if (quiet() || !filled(el)) return;
    const box = el.getBoundingClientRect();
    if (box.width < 40 || box.height < 28) return;
    const staticBox = getComputedStyle(el).position === 'static';
    // Making a button positioned would move absolutely placed children; leave those alone.
    if (staticBox && [...el.children].some(child => getComputedStyle(child).position === 'absolute')) return;
    if (staticBox) el.style.position = 'relative';
    const layer = document.createElement('span'), dot = document.createElement('i'), size = Math.hypot(box.width, box.height) * 2;
    layer.className = 'zt-ripple'; layer.setAttribute('aria-hidden', 'true');
    dot.style.cssText = `width:${size}px;height:${size}px;left:${event.clientX - box.left - size / 2}px;top:${event.clientY - box.top - size / 2}px`;
    layer.append(dot); el.append(layer);
    const done = () => { layer.remove(); if (staticBox) el.style.removeProperty('position'); };
    dot.animate({ transform: ['scale(0)', 'scale(1)'], opacity: [.3, 0] }, { duration: 560, easing: 'cubic-bezier(.1,.55,.35,1)' }).finished.then(done, done);
  }

  document.addEventListener('pointerdown', event => {
    if (event.button > 0) return;
    let el = event.target.closest?.(TAPPABLE);
    if (!usable(el)) return;
    ripple(el, event);
    if (el.matches(COVERS)) el = el.closest(CARDS) || el;
    pressed = el; press(el);
  }, { passive: true, capture: true });
  const lift = () => { if (pressed) release(pressed); pressed = null; };
  document.addEventListener('pointerup', lift, { passive: true, capture: true });
  document.addEventListener('pointercancel', lift, { passive: true, capture: true });
  document.addEventListener('click', event => {
    const el = event.target.closest?.(TAPPABLE);
    if (!usable(el)) return;
    // The gift sheet closes once the gift is sent, so remember where Send was.
    if (el.matches('.zw-send')) giftFrom = { box: el.getBoundingClientRect(), at: Date.now() };
    if (el.matches('[aria-pressed], [aria-checked], [role="tab"], [role="switch"], [data-tab], [data-dashboard-filter], [data-home-filter]')) haptic('selection');
    else if (filled(el)) haptic('light');
  }, true);

  /* Cards rise in once per visit to a screen; a refresh of the same cards stays still. */
  function keyOf(el) { return el.className.split(' ')[0] + ':' + (el.dataset.hostId || el.dataset.id || el.id || el.getAttribute('aria-label') || el.textContent.trim().slice(0, 48)); }
  function reveal() {
    queued = false;
    const fresh = [...document.querySelectorAll(`#screen :is(${REVEAL})`)].filter(el => { const key = keyOf(el); if (seen.has(key)) return false; seen.add(key); return true; });
    if (quiet()) return;
    fresh.filter(el => el.getBoundingClientRect().top < innerHeight).slice(0, 10).forEach((el, i) =>
      el.animate({ opacity: [0, 1], translate: ['0 14px', '0 0'] }, { duration: 420, delay: i * 50, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'backwards' }));
  }
  const screen = document.getElementById('screen');
  if (screen && typeof MutationObserver !== 'undefined')
    new MutationObserver(() => { if (!queued) { queued = true; requestAnimationFrame(reveal); } }).observe(screen, { childList: true, subtree: true });
  document.addEventListener('aurora:navigate', () => {
    seen = new Set();
    if (quiet()) return;
    // The chosen tab's icon gives a small hop.
    document.querySelector('.zh-nav button.on > svg')?.animate({ translate: ['0 0', '0 -4px', '0 0'], scale: [1, 1.12, 1] }, { duration: 380, easing: 'cubic-bezier(.3,.7,.4,1.4)' });
  });

  /* Marigold petals and hearts lift off a button when something good happens. */
  function burst(from, colors = ['#f59e0b', '#fb923c', 'var(--accent, #c9086a)']) {
    if (!from || (from instanceof Element && !from.isConnected) || quiet()) return;
    const box = from instanceof Element ? from.getBoundingClientRect() : from, layer = document.createElement('span');
    layer.className = 'zt-burst'; layer.setAttribute('aria-hidden', 'true');
    layer.style.cssText = `left:${box.left + box.width / 2}px;top:${box.top + box.height / 2}px`;
    document.body.append(layer);
    const pieces = Array.from({ length: 12 }, (_, i) => {
      const piece = document.createElement('i'), angle = (Math.PI * 2 * i) / 12 + Math.random() * .4, reach = 34 + Math.random() * 30;
      piece.style.background = colors[i % colors.length];
      layer.append(piece);
      return piece.animate({
        transform: ['translate(-50%,-50%) scale(.4) rotate(0deg)', `translate(calc(-50% + ${Math.cos(angle) * reach}px), calc(-50% + ${Math.sin(angle) * reach - 12}px)) scale(1) rotate(${160 + Math.random() * 200}deg)`],
        opacity: [1, 1, 0],
      }, { duration: 700 + Math.random() * 200, easing: 'cubic-bezier(.15,.7,.3,1)' }).finished;
    });
    Promise.allSettled(pieces).then(() => layer.remove());
  }
  Native.on('follow.saved', d => {
    if (!d.on) return;
    haptic('success');
    burst(document.getElementById('zu-follow'), ['var(--accent, #c9086a)', '#f472b6', '#f59e0b']);
  });
  Native.on('gift.sent', () => {
    haptic('success');
    if (giftFrom && Date.now() - giftFrom.at < 15000) burst(giftFrom.box);
    giftFrom = null;
  });

  return { burst, haptic };
})();
