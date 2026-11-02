/* Shared Facebetter controls. Update only this picker so camera/WebRTC elements
   survive adjustments while the SDK changes the outgoing video pixels. */
(function () {
  'use strict';
  const beauty=window.ZimiBeauty,C=window.ZimiBeautyCatalog;
  // Line icons in the app's 24px style (hi() in home.js). This file also runs
  // without the app shell, so it carries its own set.
  const filled='fill="currentColor" stroke="none"';
  const ICONS={
    star:'<path d="M12 3.8l2.5 5.1 5.6.8-4 3.9 1 5.6-5.1-2.7-5.1 2.7 1-5.6-4-3.9 5.6-.8z"/>',
    check:'<path d="M6.8 12.3l3.2 3.2 7.2-7.2"/>',
    reset:'<path d="M5 12a7 7 0 1 0 2.05-4.95L5 9"/><path d="M5 5v4h4"/>',
    skin:'<path d="M12 19.5c-2.4-1.9-3.6-4.3-3.6-7S9.6 7.4 12 5.5c2.4 1.9 3.6 4.3 3.6 7s-1.2 5.1-3.6 7z"/><path d="M12 19.5c-4.7 0-8.3-2.6-8.8-6.6 2.4-.3 4.6.3 6.3 1.6M12 19.5c4.7 0 8.3-2.6 8.8-6.6-2.4-.3-4.6.3-6.3 1.6"/>',
    color:'<path d="M4 7.5h9M17 7.5h3M4 16.5h3M11 16.5h9"/><circle cx="15" cy="7.5" r="2"/><circle cx="9" cy="16.5" r="2"/>',
    reshape:'<path d="M12 4c3.6 0 6 2.8 6 6.7 0 4.3-3 8.8-6 8.8s-6-4.5-6-8.8C6 6.8 8.4 4 12 4z"/><path d="M2.5 10.5L4 12l-1.5 1.5M21.5 10.5L20 12l1.5 1.5"/>',
    makeup:'<path d="M8.5 13.5h7v7h-7z"/><path d="M10 13.5V8.2L14 5v8.5"/>',
    filter:'<circle cx="9" cy="9.5" r="5"/><circle cx="15" cy="9.5" r="5"/><circle cx="12" cy="14.5" r="5"/>',
    sticker:'<path d="M20 12.5V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h6.5z"/><path d="M12.5 20v-4.5a3 3 0 0 1 3-3H20"/><path d="M8.5 9.5v.5M14 9.5v.5M8.5 14c.9.6 1.9.9 3 .8"/>',
    body:'<circle cx="12" cy="5" r="2"/><path d="M5.5 8.5l6.5 1.5 6.5-1.5M12 10v4.5M9 20.5l3-6 3 6"/>',
    background:'<rect x="3.5" y="5" width="17" height="14" rx="2.5"/><path d="M3.5 16.5l4.8-4.8 3.7 3.7 2.6-2.6 5.9 5.9"/><circle cx="15.5" cy="9.2" r="1.6"/>',
    smoothing:'<path d="M4.5 19.5l10-10"/><path d="M16.5 3.5l.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9z"/><path d="M8 4.5v2M7 5.5h2M19.5 12.5v2M18.5 13.5h2"/>',
    blemish:'<path d="M3.5 14.5l9-9 6 6-9 9z"/><path d="M7.5 10.5l6 6"/><path d="M9.5 20.5h10"/>',
    whitening:'<path d="M10.5 3.5l1.6 4.4 4.4 1.6-4.4 1.6-1.6 4.4-1.6-4.4-4.4-1.6 4.4-1.6z"/><path d="M17.5 13.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z"/>',
    rosiness:`<circle cx="12" cy="12" r="8.5"/><path d="M9.3 10v.4M14.7 10v.4M9.8 15.3c1.3 1 3.1 1 4.4 0"/><circle cx="7.6" cy="13.2" r="1.5" ${filled} opacity=".45"/><circle cx="16.4" cy="13.2" r="1.5" ${filled} opacity=".45"/>`,
    clarity:'<path d="M4 8.5V6a2 2 0 0 1 2-2h2.5M15.5 4H18a2 2 0 0 1 2 2v2.5M20 15.5V18a2 2 0 0 1-2 2h-2.5M8.5 20H6a2 2 0 0 1-2-2v-2.5"/><circle cx="12" cy="12" r="3.2"/>',
    brightness:'<circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6L7 7M17 17l1.4 1.4M18.4 5.6L17 7M7 17l-1.4 1.4"/>',
    contrast:`<circle cx="12" cy="12" r="8.5"/><path d="M12 3.5a8.5 8.5 0 0 1 0 17z" ${filled}/>`,
    saturation:`<path d="M12 3.8c3.6 4 5.6 7.2 5.6 9.9a5.6 5.6 0 0 1-11.2 0c0-2.7 2-5.9 5.6-9.9z"/><path d="M6.4 13.7h11.2a5.6 5.6 0 0 1-11.2 0z" ${filled} opacity=".45"/>`,
    colorTemperature:'<path d="M10 14.3V5.8a2 2 0 1 1 4 0v8.5a4 4 0 1 1-4 0z"/><path d="M12 10.5v6M16.8 6.5h2M16.8 9.5h2"/>',
    colorTint:`<path d="M12 3.5a8.5 8.5 0 0 0 0 17c1 0 1.7-.8 1.7-1.7 0-.5-.2-.9-.5-1.2-.3-.3-.5-.7-.5-1.2 0-.9.8-1.7 1.7-1.7h2a4.1 4.1 0 0 0 4.1-4.1c0-3.9-3.8-7.1-8.5-7.1z"/><circle cx="7.6" cy="11.2" r="1.1" ${filled}/><circle cx="9.6" cy="7.6" r="1.1" ${filled}/><circle cx="14.3" cy="7.6" r="1.1" ${filled}/><circle cx="16.6" cy="11.1" r="1.1" ${filled}/>`,
  };
  const icon=(name,size=20)=>`<svg class="zi-icon" data-icon="beauty-${name}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;
  // Only groups licensed by the Facebetter plan are offered. Filters open
  // first for live preview when the plan includes them.
  const tabs=Object.fromEntries(Object.entries({skin:'Skin',color:'Color',reshape:'Reshape',makeup:'Makeup',filter:'Filters',sticker:'Stickers',body:'Body',background:'Background'})
    .filter(([id])=>C.LICENSED_TABS.includes(id)));
  const firstTab=Object.hasOwn(tabs,'filter')?'filter':Object.keys(tabs)[0];
  let tab=firstTab;
  const rails=new Map();
  const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const label=key=>C.labels[key]||C.prettyFilterName(key.split('.').at(-1));
  const encode=value=>escape(JSON.stringify(value));
  // Skin and Color work like a camera app: an icon row picks one adjustment
  // and a single slider sets it. Color adjustments run from -100 to +100.
  const FEATURES={
    skin:[
      {key:'smoothing',label:'Smooth',name:'Smoothing',styles:'smoothingStyle'},
      {key:'blemish',label:'Blemish',name:'Blemish removal'},
      {key:'whitening',label:'Whiten',name:'Whitening',styles:'whiteningStyle'},
      {key:'rosiness',label:'Rosy',name:'Rosiness'},
      {key:'clarity',label:'Clarity',name:'Clarity'},
    ],
    color:[
      {key:'brightness',label:'Brightness',name:'Brightness'},
      {key:'contrast',label:'Contrast',name:'Contrast'},
      {key:'saturation',label:'Saturation',name:'Saturation'},
      {key:'colorTemperature',label:'Warmth',name:'Warmth'},
      {key:'colorTint',label:'Tint',name:'Tint'},
    ],
  };
  const STYLES={
    smoothingStyle:C.SKIN_PRESETS.map(x=>({id:x.smoothingStyle,label:label('smoothing.'+x.id)})),
    whiteningStyle:C.WHITENING_STYLES.map(x=>({id:x.id,label:label(x.labelKey)})),
  };
  const chosen={skin:'smoothing',color:'brightness'};
  function choice(key,value,text,active) {
    return `<button type="button" data-zimi-beauty-option="${escape(key+':'+value)}" aria-pressed="${active}" onclick="ZimiBeauty.choose('${key}',${encode(value)})">${escape(text)}</button>`;
  }
  function choices(key,items,p) {
    return `<div class="zb-choices" role="group" aria-label="${escape(C.prettyFilterName(key))}">${items.map(x=>choice(key,x.id,x.label||label(x.labelKey),p[key]===x.id)).join('')}</div>`;
  }
  // The accent track runs from zero, or from the centre of a -100..+100
  // control, to the thumb.
  const percent=(amount,min)=>(min<0&&amount>0?'+':'')+amount+'%';
  function fill(amount,min) {
    const at=(amount-min)/(100-min),from=min<0?.5:0;
    return [Math.min(from,at),Math.max(from,at)];
  }
  function slider(key,text,value,min=0,kind='',disabled=false) {
    const attribute=kind?kind+':'+key:key,amount=Math.round(value*100),[from,to]=fill(amount,min);
    return `<label class="zb-slider"><span>${escape(text)}<output data-zimi-beauty-value="${attribute}">${percent(amount,min)}</output></span><input type="range" data-zimi-beauty-param="${attribute}" min="${min}" max="100" step="1" value="${amount}" style="--zb-from:${from};--zb-to:${to}" aria-label="${escape(text)}" ${disabled?'disabled':''} oninput="ZimiBeauty.adjust('${key}',this.value,'${kind}')"></label>`;
  }
  function paint(input) {
    const amount=Math.round(Number(input.value)),min=Number(input.min),[from,to]=fill(amount,min);
    input.style.setProperty('--zb-from',from);input.style.setProperty('--zb-to',to);
    const output=input.closest('.zb-slider')?.querySelector('output');if(output)output.value=percent(amount,min);
  }
  function filterRail(p) {
    const ids=[null,...C.FILTER_IDS],colors=['#a5a5a5','#d399a9','#e2b5ad','#bd9ab2','#c8a5aa','#c7a485','#b69c8b','#b0bbc7','#d5b28b','#b6a38b','#bdc69b','#c4c1ad','#c8b8ac','#b9cbd0','#c2bcb5','#b9b8a5','#c8a7af','#c3b5ae','#b3adaf','#a2afba'];
    return `<div class="zb-filter-heading"><strong data-zimi-filter-name>${p.filterId?escape(label('filter.'+p.filterId)):'Original'}</strong><span>Swipe to try</span></div><div class="zb-filter-rail" data-zimi-filter-rail role="group" aria-label="Swipe filters">${ids.map((id,index)=>`<button type="button" class="zb-lens" data-zimi-filter-id="${id||''}" data-zimi-beauty-option="filterId:${id}" aria-label="${id?escape(label('filter.'+id)):'Original'}" aria-pressed="${p.filterId===id}" tabindex="${p.filterId===id?'0':'-1'}" onclick="ZimiBeauty.choose('filterId',${encode(id)})"><span class="zb-lens-swatch" style="--zb-lens-color:${colors[index]}" aria-hidden="true">${id?'<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M24 13c0 8-4 13-8 13S8 21 8 13a8 8 0 0 1 16 0Z"/><path d="M12 14h1m6 0h1m-7 6c2 2 4 2 6 0M23 5l1-3 1 3 3 1-3 1-1 3-1-3-3-1Z"/></svg>':'<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="16" cy="16" r="10"/><path d="m9 23 14-14"/></svg>'}</span><span class="zb-lens-label">${id?escape(label('filter.'+id)):'Original'}</span></button>`).join('')}</div>`;
  }
  const section=(title,body)=>`<section class="zb-section"><h3>${escape(title)}</h3>${body}</section>`;
  function toggle(key,text,p) {
    return `<button type="button" class="zb-toggle" role="switch" aria-checked="${!!p[key]}" data-zimi-beauty-toggle="${key}" onclick="ZimiBeauty.flip('${key}')"><span>${escape(text)}</span><span class="switch${p[key]?' on':''}" aria-hidden="true"></span></button>`;
  }
  function adjustment(p) {
    const item=FEATURES[tab].find(x=>x.key===chosen[tab]);
    const styles=item.styles?`<div class="zb-chips" role="group" aria-label="${escape(item.name)} style">${STYLES[item.styles].map(x=>choice(item.styles,x.id,x.label,p[item.styles]===x.id)).join('')}</div>`:'';
    return slider(item.key,item.name,p[item.key],tab==='color'?-100:0)+styles;
  }
  function features(p) {
    return `<div class="zb-features" role="group" aria-label="${tab==='skin'?'Skin effects':'Color adjustments'}">${FEATURES[tab].map(x=>`<button type="button" class="zb-feature" data-zimi-beauty-feature="${x.key}" aria-pressed="${x.key===chosen[tab]}" ${p[x.key]?'data-active ':''}onclick="ZimiBeauty.chooseFeature('${x.key}')"><span class="zb-lens-swatch" aria-hidden="true">${icon(x.key,22)}</span><span class="zb-feature-label">${escape(x.label)}</span></button>`).join('')}</div>`;
  }
  function content(p) {
    if(tab==='skin'||tab==='color')return `<div class="zb-adjust" data-zimi-beauty-adjust>${adjustment(p)}</div>${features(p)}${tab==='skin'?toggle('skinOnly','Apply to skin only',p):''}`;
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
    if(tab==='filter') return filterRail(p)+slider('filterIntensity','Filter intensity',p.filterIntensity,0,'',!p.filterId);
    if(tab==='sticker') return choices('stickerId',[{id:null,label:'None'}],p)+C.STICKER_GROUPS.map(group=>section(label(group.titleKey),choices('stickerId',C.STICKERS.filter(x=>x.kind===group.kind).map(x=>({id:x.id,label:label('sticker.'+x.id)+(x.animated?' · Animated':'')})),p))).join('');
    return section('Background',`<div class="zb-choices" role="group" aria-label="Background mode">${['original','blur','image'].map(mode=>`<button type="button" aria-pressed="${mode===(p.bgBlur>0?'blur':p.bgPreset?'image':'original')}" onclick="ZimiBeauty.background('${mode}')">${{original:'Original',blur:'Blur',image:'Image'}[mode]}</button>`).join('')}</div>`+
      (p.bgBlur>0?slider('bgBlur','Background blur',p.bgBlur):'')+(p.bgPreset?choices('bgPreset',C.BG_PRESETS,p):'')+toggle('subjectOutline','Subject outline',p))+
      section('Background removal',choices('chroma',[{id:null,label:'Portrait'},...C.CHROMA_OPTIONS],p)+(p.chroma!==null?slider('chromaSimilarity','Similarity',p.chromaSimilarity)+slider('chromaSmoothness','Edge smoothness',p.chromaSmoothness)+slider('chromaDesaturation','Desaturation',p.chromaDesaturation):''));
  }
  function inner() {
    const state=beauty.getState(),failure=beauty.getFailedEffect();
    return `<div class="zb-tabbar"><nav class="zb-tabs" aria-label="Effect categories">${Object.entries(tabs).map(([id,text])=>`<button type="button" data-zimi-beauty-tab="${id}" aria-pressed="${id===tab}" onclick="ZimiBeauty.chooseTab('${id}')">${icon(id,18)}<span>${text}</span></button>`).join('')}</nav><button type="button" class="zb-reset" aria-label="Reset all" onclick="ZimiBeauty.reset();ZimiBeauty.paintPicker()">${icon('reset',17)}<span>Reset</span></button></div><div class="zb-content">${content(beauty.getParams())}</div><footer class="zb-footer"><p data-zimi-beauty-status ${state.warning?'data-zimi-beauty-warning ':''}role="status" aria-live="polite">${escape(state.message)}</p><div><button type="button" data-zimi-beauty-retry ${state.status==='error'?'':'hidden'} onclick="ZimiBeauty.retryOrRemove()">${failure?'Remove failed '+failure:'Retry effects'}</button></div></footer>`;
  }
  beauty.picker=()=>`<div class="zb-picker" data-zimi-beauty-picker data-lenis-prevent>${inner()}</div>`;
  beauty.panel=(closeAction,closeLabel='Close panel')=>`<section class="zb-camera-panel" data-zimi-beauty-panel aria-label="Beauty and filters" data-lenis-prevent><header class="zb-panel-header"><span class="zb-panel-mark" aria-hidden="true">${icon('star',19)}</span><div><h2>Beauty &amp; filters</h2><p>Changes show live on your camera</p></div><button type="button" class="zb-done" data-zimi-beauty-close aria-label="${escape(closeLabel)}" onclick="${escape(closeAction)}">${icon('check',24)}</button></header>${beauty.picker()}</section>`;
  beauty.paintPicker=()=>{document.querySelectorAll('[data-zimi-beauty-picker]').forEach(root=>{root.innerHTML=inner()});beauty.afterRender()};
  beauty.openPicker=()=>{tab=firstTab};
  beauty.chooseTab=id=>{if(!Object.hasOwn(tabs,id))return;tab=id;beauty.paintPicker()};
  // Swap only the slider so the icon row keeps its scroll position.
  beauty.chooseFeature=key=>{
    if(!FEATURES[tab]?.some(x=>x.key===key))return;
    chosen[tab]=key;
    const p=beauty.getParams();
    document.querySelectorAll('[data-zimi-beauty-picker]').forEach(root=>{
      const adjust=root.querySelector('[data-zimi-beauty-adjust]');if(adjust)adjust.innerHTML=adjustment(p);
      root.querySelectorAll('[data-zimi-beauty-feature]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.zimiBeautyFeature===key)));
    });
  };
  beauty.flip=key=>{beauty.setParam(key,!beauty.getParams()[key]);syncControls()};
  beauty.choose=(key,value)=>{
    if(key==='filterId') {
      if(value!==null&&!C.FILTER_IDS.includes(value))return;
      const current=beauty.getParams();
      if(current.filterId!==value||value&&current.filterIntensity===0)beauty.setParam(key,value,true);
      syncRails(true);return;
    }
    if(key==='smoothingStyle'||key==='whiteningStyle') {
      beauty.setParam(key,value,true);
      syncControls();return;
    }
    beauty.setParam(key,value);beauty.paintPicker();
  };
  beauty.retryOrRemove=()=>{
    if(beauty.getFailedEffect()){if(beauty.removeFailedEffect())beauty.paintPicker()}
    else beauty.sync();
  };
  beauty.adjust=(key,value,kind)=>{
    const amount=Number(value)/100;
    if(kind)beauty.setShape(kind,key,amount);else beauty.setParam(key,amount);
    syncControls();
  };
  beauty.background=mode=>{
    if(mode==='blur')beauty.setParam('bgBlur',.5);
    else if(mode==='image')beauty.setParam('bgPreset','office');
    else {beauty.setParam('bgBlur',0);beauty.setParam('bgPreset',null)}
    beauty.paintPicker();
  };
  function syncSliders(p) {
    const amount=attribute=>{const [kind,key]=attribute.split(':');return key?p[kind]?.[key]:p[kind]};
    document.querySelectorAll('input[data-zimi-beauty-param]').forEach(input=>{
      const value=amount(input.dataset.zimiBeautyParam);if(Number.isFinite(value))input.value=Math.round(value*100);
      paint(input);
    });
  }
  function syncControls() {
    const p=beauty.getParams();
    document.querySelectorAll('[data-zimi-beauty-option]').forEach(button=>{
      const key=button.dataset.zimiBeautyOption.split(':')[0];
      button.setAttribute('aria-pressed',String(button.dataset.zimiBeautyOption===key+':'+p[key]));
    });
    // A dot marks each adjustment that is changing the camera.
    document.querySelectorAll('[data-zimi-beauty-feature]').forEach(button=>button.toggleAttribute('data-active',!!p[button.dataset.zimiBeautyFeature]));
    document.querySelectorAll('[data-zimi-beauty-toggle]').forEach(button=>{
      const on=!!p[button.dataset.zimiBeautyToggle];
      button.setAttribute('aria-checked',String(on));button.querySelector('.switch')?.classList.toggle('on',on);
    });
    syncSliders(p);
  }
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
      if(strength){strength.disabled=!p.filterId;strength.value=Math.round(p.filterIntensity*100);paint(strength)}
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
    // Keep the open category in view when the tabs scroll.
    document.querySelectorAll('.zb-tabs').forEach(nav=>{
      const on=nav.querySelector('[aria-pressed="true"]');if(!on||nav.scrollWidth<=nav.clientWidth)return;
      nav.scrollLeft+=on.getBoundingClientRect().left-nav.getBoundingClientRect().left-(nav.clientWidth-on.offsetWidth)/2;
    });
    document.querySelectorAll('.zr-call,.hc-setup').forEach(stage=>stage.classList.toggle('zb-previewing',!!stage.querySelector('[data-zimi-beauty-panel]')));
  };
  document.addEventListener('zimi:beauty-state',()=>{
    syncRails();
    syncControls();
    document.querySelectorAll('[data-zimi-beauty-status]').forEach(status=>status.toggleAttribute('data-zimi-beauty-warning',!!beauty.getState().warning));
    const failure=beauty.getFailedEffect();
    document.querySelectorAll('[data-zimi-beauty-retry]').forEach(button=>{button.textContent=failure?'Remove failed '+failure:'Retry effects'});
  });
  document.addEventListener('keydown',event=>{
    if(event.key!=='Escape'||event.defaultPrevented)return;
    const close=document.querySelector('[data-zimi-beauty-close]');if(close){event.preventDefault();close.click();}
  });
})();
