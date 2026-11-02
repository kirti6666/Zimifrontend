/* Shared Facebetter controls. Update only this picker so camera/WebRTC elements
   survive adjustments while the SDK changes the outgoing video pixels. */
(function () {
  'use strict';
  const beauty=window.ZimiBeauty,C=window.ZimiBeautyCatalog;
  let tab='filter';
  const rails=new Map();
  const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const label=key=>C.labels[key]||C.prettyFilterName(key.split('.').at(-1));
  const tabs={skin:'Skin',reshape:'Reshape',makeup:'Makeup',filter:'Filters',sticker:'Stickers',body:'Body',background:'Background'};
  const encode=value=>escape(JSON.stringify(value));
  function choice(key,value,text,active) {
    return `<button type="button" data-zimi-beauty-option="${escape(key+':'+value)}" aria-pressed="${active}" onclick="ZimiBeauty.choose('${key}',${encode(value)})">${escape(text)}</button>`;
  }
  function choices(key,items,p) {
    return `<div class="zb-choices" role="group" aria-label="${escape(C.prettyFilterName(key))}">${items.map(x=>choice(key,x.id,x.label||label(x.labelKey),p[key]===x.id)).join('')}</div>`;
  }
  function slider(key,text,value,min=0,kind='',disabled=false) {
    const attribute=kind?kind+':'+key:key;
    return `<label class="zb-slider"><span>${escape(text)}<output data-zimi-beauty-value="${attribute}">${Math.round(value*100)}%</output></span><input type="range" data-zimi-beauty-param="${attribute}" min="${min}" max="100" step="1" value="${Math.round(value*100)}" aria-label="${escape(text)}" ${disabled?'disabled':''} oninput="ZimiBeauty.adjust('${key}',this.value,'${kind}')"></label>`;
  }
  function filterRail(p) {
    const ids=[null,...C.FILTER_IDS],colors=['#a5a5a5','#d399a9','#e2b5ad','#bd9ab2','#c8a5aa','#c7a485','#b69c8b','#b0bbc7','#d5b28b','#b6a38b','#bdc69b','#c4c1ad','#c8b8ac','#b9cbd0','#c2bcb5','#b9b8a5','#c8a7af','#c3b5ae','#b3adaf','#a2afba'];
    return `<div class="zb-filter-heading"><strong data-zimi-filter-name>${p.filterId?escape(label('filter.'+p.filterId)):'Original'}</strong><span>Swipe to try</span></div><div class="zb-filter-rail" data-zimi-filter-rail role="group" aria-label="Swipe filters">${ids.map((id,index)=>`<button type="button" class="zb-lens" data-zimi-filter-id="${id||''}" data-zimi-beauty-option="filterId:${id}" aria-label="${id?escape(label('filter.'+id)):'Original'}" aria-pressed="${p.filterId===id}" tabindex="${p.filterId===id?'0':'-1'}" onclick="ZimiBeauty.choose('filterId',${encode(id)})"><span class="zb-lens-swatch" style="--zb-lens-color:${colors[index]}" aria-hidden="true">${id?'<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M24 13c0 8-4 13-8 13S8 21 8 13a8 8 0 0 1 16 0Z"/><path d="M12 14h1m6 0h1m-7 6c2 2 4 2 6 0M23 5l1-3 1 3 3 1-3 1-1 3-1-3-3-1Z"/></svg>':'<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="16" cy="16" r="10"/><path d="m9 23 14-14"/></svg>'}</span><span class="zb-lens-label">${id?escape(label('filter.'+id)):'Original'}</span></button>`).join('')}</div>`;
  }
  const section=(title,body)=>`<section class="zb-section"><h3>${escape(title)}</h3>${body}</section>`;
  function toggle(key,text,p) {
    return `<label class="zb-toggle"><span>${escape(text)}</span><input type="checkbox" aria-label="${escape(text)}" ${p[key]?'checked':''} onchange="ZimiBeauty.setParam('${key}',this.checked)"></label>`;
  }
  function content(p) {
    if(tab==='skin')return toggle('skinOnly','Apply beauty to skin only',p)+
      section('Smoothing',choices('smoothingStyle',C.SKIN_PRESETS.map(x=>({id:x.smoothingStyle,label:label('smoothing.'+x.id)})),p)+slider('smoothing','Smoothing',p.smoothing)+slider('blemish','Blemish removal',p.blemish))+
      section('Skin tone',choices('whiteningStyle',C.WHITENING_STYLES,p)+slider('whitening','Whitening',p.whitening)+slider('rosiness','Rosiness',p.rosiness)+slider('clarity','Clarity',p.clarity));
    if(tab==='reshape'||tab==='body') {
      const kind=tab==='reshape'?'reshape':'bodyReshape';
      return (tab==='reshape'?C.RESHAPE_GROUPS:C.BODY_GROUPS).map(group=>section(label('reshape.'+group.id),group.items.map(x=>slider(x.key,label(x.labelKey),p[kind][x.key],tab==='reshape'?-100:0,kind)).join(''))).join('');
    }
    if(tab==='makeup') {
      const blocks=[
        ['lipstick','Lipstick',null,C.LIPSTICK_COLORS],['blush','Blush',C.BLUSH_STYLES,C.BLUSH_COLORS],
        ['contour','Contour',C.CONTOUR_STYLES],['eyeshadow','Eye shadow',C.EYESHADOW_STYLES,C.EYESHADOW_COLORS],
        ['eyeliner','Eyeliner',C.EYELINER_STYLES,C.EYELINER_COLORS],['eyebrow','Eyebrows',C.EYEBROW_STYLES,C.EYEBROW_COLORS],
        ['eyelash','Eyelashes',C.EYELASH_STYLES,C.EYELASH_COLORS],['pupil','Contact lenses',null,C.PUPIL_COLORS]
      ];
      return blocks.map(([key,title,styles,colors])=>section(title,(styles?choices(key+'Style',styles,p):'')+(colors?choices(key+'Color',colors,p):'')+slider(key,title+' intensity',p[key]))).join('')+section('Teeth',slider('teethWhiten','Teeth whitening',p.teethWhiten));
    }
    if(tab==='filter') return filterRail(p)+slider('filterIntensity','Filter intensity',p.filterIntensity,0,'',!p.filterId)+
      `<details class="zb-image-adjustments"><summary>Image adjustments</summary>${[['brightness','Brightness'],['contrast','Contrast'],['saturation','Saturation'],['colorTemperature','Temperature'],['colorTint','Tint']].map(([key,text])=>slider(key,text,p[key],-100)).join('')}</details>`;
    if(tab==='sticker') return choices('stickerId',[{id:null,label:'None'}],p)+C.STICKER_GROUPS.map(group=>section(label(group.titleKey),choices('stickerId',C.STICKERS.filter(x=>x.kind===group.kind).map(x=>({id:x.id,label:label('sticker.'+x.id)+(x.animated?' · Animated':'')})),p))).join('');
    return section('Background',`<div class="zb-choices" role="group" aria-label="Background mode">${['original','blur','image'].map(mode=>`<button type="button" aria-pressed="${mode===(p.bgBlur>0?'blur':p.bgPreset?'image':'original')}" onclick="ZimiBeauty.background('${mode}')">${{original:'Original',blur:'Blur',image:'Image'}[mode]}</button>`).join('')}</div>`+
      (p.bgBlur>0?slider('bgBlur','Background blur',p.bgBlur):'')+(p.bgPreset?choices('bgPreset',C.BG_PRESETS,p):'')+toggle('subjectOutline','Subject outline',p))+
      section('Background removal',choices('chroma',[{id:null,label:'Portrait'},...C.CHROMA_OPTIONS],p)+(p.chroma!==null?slider('chromaSimilarity','Similarity',p.chromaSimilarity)+slider('chromaSmoothness','Edge smoothness',p.chromaSmoothness)+slider('chromaDesaturation','Desaturation',p.chromaDesaturation):''));
  }
  function inner() {
    const state=beauty.getState();
    return `<nav class="zb-tabs" aria-label="Effect categories">${Object.entries(tabs).map(([id,text])=>`<button type="button" data-zimi-beauty-tab="${id}" aria-pressed="${id===tab}" onclick="ZimiBeauty.chooseTab('${id}')">${text}</button>`).join('')}</nav><div class="zb-content">${content(beauty.getParams())}</div><footer class="zb-footer"><p data-zimi-beauty-status role="status" aria-live="polite">${escape(state.message)}</p><div><button type="button" onclick="ZimiBeauty.reset();ZimiBeauty.paintPicker()">Reset all</button><button type="button" data-zimi-beauty-retry ${state.status==='error'?'':'hidden'} onclick="ZimiBeauty.sync()">Retry effects</button></div></footer>`;
  }
  beauty.picker=()=>`<div class="zb-picker" data-zimi-beauty-picker data-lenis-prevent>${inner()}</div>`;
  beauty.panel=(closeAction,closeLabel='Close panel')=>`<section class="zb-camera-panel" data-zimi-beauty-panel aria-label="Beauty and filters" data-lenis-prevent><header class="zb-panel-header"><div><h2>Beauty &amp; filters</h2><p>See each look on your camera</p></div><button type="button" data-zimi-beauty-close aria-label="${escape(closeLabel)}" onclick="${escape(closeAction)}">Done</button></header>${beauty.picker()}</section>`;
  beauty.paintPicker=()=>{document.querySelectorAll('[data-zimi-beauty-picker]').forEach(root=>{root.innerHTML=inner()});beauty.afterRender()};
  beauty.openPicker=()=>{tab='filter'};
  beauty.chooseTab=id=>{if(!Object.hasOwn(tabs,id))return;tab=id;beauty.paintPicker()};
  beauty.choose=(key,value)=>{
    if(key==='filterId') {
      if(value!==null&&!C.FILTER_IDS.includes(value))return;
      if(beauty.getParams().filterId!==value)beauty.setParam(key,value);
      syncRails(true);return;
    }
    beauty.setParam(key,value);beauty.paintPicker();
  };
  beauty.adjust=(key,value,kind)=>{
    const amount=Number(value)/100;
    if(kind)beauty.setShape(kind,key,amount);else beauty.setParam(key,amount);
    const attribute=kind?kind+':'+key:key;
    document.querySelectorAll('[data-zimi-beauty-value]').forEach(output=>{if(output.dataset.zimiBeautyValue===attribute)output.value=Math.round(amount*100)+'%'});
  };
  beauty.background=mode=>{
    if(mode==='blur')beauty.setParam('bgBlur',.5);
    else if(mode==='image')beauty.setParam('bgPreset','office');
    else {beauty.setParam('bgBlur',0);beauty.setParam('bgPreset',null)}
    beauty.paintPicker();
  };
  const reduced=()=>window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function clearRail(rail,binding) {
    clearTimeout(binding.timer);clearTimeout(binding.clickTimer);cancelAnimationFrame(binding.raf);binding.abort.abort();binding.resize?.disconnect();
    rails.delete(rail);
  }
  function closest(rail) {
    const middle=rail.getBoundingClientRect().left+rail.clientWidth/2;
    return [...rail.querySelectorAll('[data-zimi-filter-id]')].reduce((best,item)=>{
      const rect=item.getBoundingClientRect(),distance=Math.abs(rect.left+rect.width/2-middle);
      return !best||distance<best.distance?{item,distance}:best;
    },null)?.item;
  }
  function center(rail,item,animate=false) {
    const binding=rails.get(rail);if(!binding||!item)return;
    binding.programmatic=true;
    const rect=item.getBoundingClientRect(),viewport=rail.getBoundingClientRect();
    rail.scrollTo({left:rail.scrollLeft+rect.left+rect.width/2-viewport.left-rail.clientWidth/2,behavior:animate&&!reduced()?'smooth':'auto'});
    settle(rail,binding);
  }
  function settle(rail,binding) {
    clearTimeout(binding.timer);
    binding.timer=setTimeout(()=>{
      if(!rail.isConnected||rails.get(rail)!==binding)return;
      if(binding.drag)return;
      if(binding.programmatic){binding.programmatic=false;return;}
      const item=closest(rail);if(!item)return;
      beauty.choose('filterId',item.dataset.zimiFilterId||null);
    },140);
  }
  function syncRails(recenter=false) {
    const p=beauty.getParams();
    rails.forEach((binding,rail)=>{
      if(!rail.isConnected){clearRail(rail,binding);return;}
      const id=p.filterId||'',changed=binding.selected!==id;
      binding.selected=id;
      rail.querySelectorAll('[data-zimi-filter-id]').forEach(item=>{
        const selected=item.dataset.zimiFilterId===id;
        item.setAttribute('aria-pressed',String(selected));item.tabIndex=selected?0:-1;
      });
      const picker=rail.closest('[data-zimi-beauty-picker]'),name=picker?.querySelector('[data-zimi-filter-name]'),strength=picker?.querySelector('[data-zimi-beauty-param="filterIntensity"]');
      if(name)name.textContent=p.filterId?label('filter.'+p.filterId):'Original';
      if(strength)strength.disabled=!p.filterId;
      if(recenter||changed)center(rail,[...rail.querySelectorAll('[data-zimi-filter-id]')].find(item=>item.dataset.zimiFilterId===id),true);
    });
  }
  function mountRail(rail) {
    if(rails.has(rail))return;
    const binding={abort:new AbortController(),timer:0,raf:0,drag:null,programmatic:true,selected:null,suppressClick:false,width:rail.clientWidth};
    rails.set(rail,binding);
    const signal=binding.abort.signal;
    rail.addEventListener('scroll',()=>settle(rail,binding),{passive:true,signal});
    rail.addEventListener('keydown',event=>{
      if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
      const items=[...rail.querySelectorAll('[data-zimi-filter-id]')];
      let index=items.findIndex(item=>item.dataset.zimiFilterId===(beauty.getParams().filterId||''));
      index=event.key==='Home'?0:event.key==='End'?items.length-1:Math.max(0,Math.min(items.length-1,index+(event.key==='ArrowRight'?1:-1)));
      event.preventDefault();beauty.choose('filterId',items[index].dataset.zimiFilterId||null);items[index].focus({preventScroll:true});
    },{signal});
    rail.addEventListener('pointerdown',event=>{
      binding.programmatic=false;clearTimeout(binding.timer);
      if(event.pointerType!=='mouse'||event.button!==0)return;
      binding.drag={id:event.pointerId,x:event.clientX,y:event.clientY,left:rail.scrollLeft,moved:false};
    },{signal});
    rail.addEventListener('pointermove',event=>{
      const drag=binding.drag;if(!drag||drag.id!==event.pointerId)return;
      const distance=event.clientX-drag.x;
      if(!drag.moved&&Math.abs(distance)<7)return;
      if(!drag.moved&&Math.abs(event.clientY-drag.y)>Math.abs(distance)){binding.drag=null;return;}
      if(!drag.moved){drag.moved=true;rail.setPointerCapture(event.pointerId);rail.classList.add('is-dragging');rail.style.scrollSnapType='none';}
      event.preventDefault();rail.scrollLeft=drag.left-distance;
    },{signal});
    const endDrag=event=>{
      const drag=binding.drag;if(!drag||drag.id!==event.pointerId)return;
      binding.drag=null;
      if(drag.moved){
        binding.suppressClick=true;rail.classList.remove('is-dragging');rail.style.scrollSnapType='';
        clearTimeout(binding.clickTimer);binding.clickTimer=setTimeout(()=>{binding.suppressClick=false},0);
        if(rail.hasPointerCapture(event.pointerId))rail.releasePointerCapture(event.pointerId);
        const item=closest(rail);if(item)beauty.choose('filterId',item.dataset.zimiFilterId||null);
      }
    };
    rail.addEventListener('pointerup',endDrag,{signal});rail.addEventListener('pointercancel',endDrag,{signal});rail.addEventListener('lostpointercapture',endDrag,{signal});
    rail.addEventListener('click',event=>{if(binding.suppressClick){binding.suppressClick=false;event.preventDefault();event.stopImmediatePropagation();}},{capture:true,signal});
    if(typeof ResizeObserver==='function') {
      binding.resize=new ResizeObserver(()=>{
        if(binding.width===rail.clientWidth)return;binding.width=rail.clientWidth;
        const item=[...rail.querySelectorAll('[data-zimi-filter-id]')].find(node=>node.dataset.zimiFilterId===(beauty.getParams().filterId||''));
        if(!binding.drag)center(rail,item);
      });binding.resize.observe(rail);
    }
    binding.raf=requestAnimationFrame(()=>{binding.raf=0;if(rail.isConnected){syncRails();center(rail,[...rail.querySelectorAll('[data-zimi-filter-id]')].find(item=>item.dataset.zimiFilterId===(beauty.getParams().filterId||'')));}});
  }
  beauty.afterRender=()=>{
    rails.forEach((binding,rail)=>{if(!rail.isConnected)clearRail(rail,binding)});
    document.querySelectorAll('[data-zimi-filter-rail]').forEach(mountRail);
    document.querySelectorAll('.zr-call,.hc-setup').forEach(stage=>stage.classList.toggle('zb-previewing',!!stage.querySelector('[data-zimi-beauty-panel]')));
  };
  document.addEventListener('zimi:beauty-state',()=>syncRails());
  document.addEventListener('keydown',event=>{
    if(event.key!=='Escape'||event.defaultPrevented)return;
    const close=document.querySelector('[data-zimi-beauty-close]');if(close){event.preventDefault();close.click();}
  });
})();
