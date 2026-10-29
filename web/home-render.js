/* Patch Home in place: live updates must not detach decoded photos, focused
   controls or playing previews. Other screens retain their own media lifecycle. */
window.ZimiHomeRender = (() => {
  let markup = new WeakMap(), roots = new WeakMap();
  const key = node => node.nodeType === 1 ? node.id ? `id:${node.id}` : node.hasAttribute('data-host-id') ? `host:${node.dataset.hostId}` : node.hasAttribute('data-za-slot') ? `ad:${node.dataset.zaSlot}` : '' : '';
  const signature = node => node.nodeType === 1 ? node.outerHTML : node.nodeValue;
  function remember(node) {
    markup.set(node, signature(node));
    node.childNodes.forEach(remember);
    return node;
  }
  function patch(node, next) {
    const wanted = signature(next);
    if (markup.get(node) === wanted) return;
    if (node.nodeType !== 1) {
      if (node.nodeValue !== next.nodeValue) node.nodeValue = next.nodeValue;
    } else {
      // Media controllers own these children and their playback classes.
      const media = node.matches('.zh-card-video[data-video],[data-za-video]');
      if (media && node.getAttribute('data-video') === next.getAttribute('data-video') && node.getAttribute('data-za-video') === next.getAttribute('data-za-video')) {
        markup.set(node, wanted); return;
      }
      // A changed name/alt label must not restart an already decoded photo's
      // loading shimmer when its URL is unchanged.
      if (node.tagName === 'IMG' && node.getAttribute('src') === next.getAttribute('src') && node.complete && node.naturalWidth) next.classList.remove('zh-photo-pending');
      for (const attribute of [...node.attributes]) if (!next.hasAttribute(attribute.name)) node.removeAttribute(attribute.name);
      for (const attribute of next.attributes) if (node.getAttribute(attribute.name) !== attribute.value) node.setAttribute(attribute.name, attribute.value);
      if (node.tagName === 'INPUT' && next.hasAttribute('value') && node.value !== next.getAttribute('value')) node.value = next.getAttribute('value');
      children(node, next);
    }
    markup.set(node, wanted);
  }
  function children(parent, next) {
    const previous = [...parent.childNodes], used = new Set();
    const keyed = new Map(previous.filter(node => key(node)).map(node => [key(node), node]));
    let cursor = parent.firstChild;
    for (const child of [...next.childNodes]) {
      const identity = key(child);
      let node = identity ? keyed.get(identity) : previous.find(candidate => !used.has(candidate) && !key(candidate) && candidate.nodeType === child.nodeType && candidate.nodeName === child.nodeName);
      if (node && node.nodeName !== child.nodeName) node = null;
      if (!node) node = remember(child.cloneNode(true));
      used.add(node);
      if (node !== cursor) {
        if (node.parentNode === parent && typeof parent.moveBefore === 'function') parent.moveBefore(node, cursor);
        else parent.insertBefore(node, cursor);
      }
      patch(node, child);
      cursor = node.nextSibling;
    }
    for (const node of previous) if (!used.has(node)) node.remove();
  }
  function render(container, html) {
    const cached = roots.get(container);
    if (cached?.html === html && cached.children.length === container.childNodes.length && cached.children.every((node, index) => node === container.childNodes[index])) return;
    const template = document.createElement('template');
    template.innerHTML = html;
    children(container, template.content);
    roots.set(container, { html, children: [...container.childNodes] });
  }
  function reset() { markup = new WeakMap(); roots = new WeakMap(); }
  // Leaving Home must release detached photo trees rather than retain their
  // decoded buffers for the lifetime of the WebView.
  document.addEventListener('aurora:navigate', () => { if (S.v !== 'home') reset(); });
  for (const type of ['session.none', 'session.expired']) Native.on(type, reset);
  return { render };
})();
