/* Shared Facebetter controls. Update only this picker so camera/WebRTC elements
   survive adjustments while the SDK changes the outgoing video pixels. */
(function () {
  'use strict';
  const beauty=window.ZimiBeauty,C=window.ZimiBeautyCatalog;
  let tab='skin';
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
  function slider(key,text,value,min=0,kind='') {
    const attribute=kind?kind+':'+key:key;
    return `<label class="zb-slider"><span>${escape(text)}<output data-zimi-beauty-value="${attribute}">${Math.round(value*100)}%</output></span><input type="range" data-zimi-beauty-param="${attribute}" min="${min}" max="100" step="1" value="${Math.round(value*100)}" aria-label="${escape(text)}" oninput="ZimiBeauty.adjust('${key}',this.value,'${kind}')"></label>`;
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
    if(tab==='filter') return section('Filters',choices('filterId',[{id:null,label:'Original'},...C.FILTER_IDS.map(id=>({id,label:label('filter.'+id)}))],p)+slider('filterIntensity','Filter intensity',p.filterIntensity))+
      section('Image adjustments',[['brightness','Brightness'],['contrast','Contrast'],['saturation','Saturation'],['colorTemperature','Temperature'],['colorTint','Tint']].map(([key,text])=>slider(key,text,p[key],-100)).join(''));
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
  beauty.paintPicker=()=>document.querySelectorAll('[data-zimi-beauty-picker]').forEach(root=>{root.innerHTML=inner()});
  beauty.chooseTab=id=>{if(!Object.hasOwn(tabs,id))return;tab=id;beauty.paintPicker()};
  beauty.choose=(key,value)=>{beauty.setParam(key,value);beauty.paintPicker()};
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
})();
