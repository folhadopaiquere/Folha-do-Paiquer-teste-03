(async () => {
  "use strict";
  const fpCloudEnabled = () => { const state = window.FPCloud?.enabled; return typeof state === 'function' ? Boolean(state()) : Boolean(state); };

  if (window.FPStore?.ready) await window.FPStore.ready;

  const ARTICLE_KEY = "fp_articles";
  const LEGACY_META_KEY = "fp_article_meta";
  const SESSION_KEY = "fp_session";
  const MASTER = "folhadopaiquere@gmail.com";
  const $ = id => document.getElementById(id);
  const escapeHTML = value => String(value ?? "").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");
  const normalizeTags = value => Array.isArray(value) ? value.map(v=>String(v).trim()).filter(Boolean) : String(value||"").split(/[,;|]/).map(v=>v.trim()).filter(Boolean);
  function splitDistinctLines(value, limit = Infinity) {
    const raw = Array.isArray(value) ? value.flatMap(item => String(item ?? '').split(/\r?\n/)) : String(value ?? '').split(/\r?\n/);
    const seen = new Set(), result = [];
    for (const item of raw) {
      const clean = String(item ?? '').trim();
      const key = clean.toLocaleLowerCase('pt-BR');
      if (!clean || seen.has(key)) continue;
      seen.add(key); result.push(clean);
    }
    return result.slice(0, Number.isFinite(limit) ? Math.max(0, limit) : result.length);
  }
  const read = (key, fallback) => { try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; } catch (_) { return fallback; } };
  const write = (key, value) => localStorage.setItem(key, JSON.stringify(value));
  const uid = () => `article_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  function migrateLegacyArticleMeta(){
    const base=read(ARTICLE_KEY,[]),meta=read(LEGACY_META_KEY,{});
    if(!Array.isArray(base))return [];
    if(!meta||typeof meta!=="object"||!Object.keys(meta).length)return base;
    let changed=false;
    const merged=base.map(a=>{const m=meta[String(a.id)];if(!m)return a;changed=true;return {...a,...m};});
    if(changed){try{write(ARTICLE_KEY,merged);localStorage.removeItem(LEGACY_META_KEY);}catch(_){}}
    return merged;
  }
  const readArticles=()=>window.FPStore?.getArticles?.()||migrateLegacyArticleMeta();
  const saveArticles=async items=>{ if(window.FPStore?.setArticles) return await window.FPStore.setArticles(items,{cloud:true}); localStorage.setItem(ARTICLE_KEY,JSON.stringify(items)); return {localOK:true,dbOK:false}; };
  const saveSingleArticle=async (article, options={})=>{
    if(window.FPStore?.upsertArticle) return await window.FPStore.upsertArticle(article,{cloud:true,...options});
    // Publicar/revisar não pode parecer concluído quando a camada de persistência
    // não carregou. O fallback local continua disponível somente para operações
    // que não exigem confirmação remota.
    if(options.cloudRequired===true&&fpCloudEnabled()){
      const error=new Error('A camada de armazenamento do site não foi carregada. A operação não foi confirmada no servidor. Recarregue a página e tente novamente.');
      error.code='folha/storage-unavailable';
      throw error;
    }
    const items=readArticles(); const i=items.findIndex(x=>String(x.id)===String(article.id));
    if(i>=0)items[i]=article; else items.push(article);
    await saveArticles(items); return article;
  };
  async function ensureFirebaseAuth(){
    if(!fpCloudEnabled()) return null;
    await window.FPCloud.waitForAuth?.();
    const user=window.FPCloud.getAuthUser?.();
    if(!user) throw new Error("Sua sessão do Firebase não está pronta. Saia e entre novamente antes de salvar.");
    return user;
  }
  const redirectToStudentArea=(message)=>{ sessionStorage.setItem("fp_workflow_notice",message||"Matéria salva com sucesso."); window.location.assign("painel.html?tab=materias#materias"); };
  let accessFontScale=Number(localStorage.getItem("fp-font-scale")||"0");
  if(!Number.isFinite(accessFontScale))accessFontScale=0;
  function setupEditorAccessibility(){
    const h=document.documentElement;
    const setScale=n=>{accessFontScale=Math.max(-2,Math.min(3,Math.trunc(n)));h.dataset.fontScale=String(accessFontScale);h.style.fontSize=`${100+accessFontScale*10}%`;localStorage.setItem("fp-font-scale",String(accessFontScale));};
    const apply=t=>{const dark=t==="dark";h.classList.toggle("dark",dark);h.style.colorScheme=dark?"dark":"light";if($("theme-icon"))$("theme-icon").textContent=dark?"☀️":"🌙";if($("theme-label"))$("theme-label").textContent=dark?"Modo claro":"Modo escuro";const themeButton=$("theme-toggle");if(themeButton){themeButton.setAttribute("aria-label",dark?"Ativar modo claro":"Ativar modo escuro");themeButton.title=dark?"Modo claro":"Modo escuro";}};
    $("font-decrease")?.addEventListener("click",()=>setScale(accessFontScale-1));
    $("font-increase")?.addEventListener("click",()=>setScale(accessFontScale+1));
    $("theme-toggle")?.addEventListener("click",()=>{const next=h.classList.contains("dark")?"light":"dark";localStorage.setItem("theme",next);localStorage.setItem("fp_theme_manual","1");apply(next);window.dispatchEvent(new CustomEvent("fp:theme-updated",{detail:next}));});
    setScale(accessFontScale);
    const saved=localStorage.getItem("theme"),manual=localStorage.getItem("fp_theme_manual")==="1";const hour=new Date().getHours();const auto=(hour>=18||hour<6)?"dark":"light";apply(manual&&(saved==="dark"||saved==="light")?saved:auto);
    window.addEventListener("storage",e=>{if(e.key==="theme"&&(e.newValue==="dark"||e.newValue==="light"))apply(e.newValue);});
    $("speech-toggle")?.addEventListener("click",()=>{if(!window.speechSynthesis)return;if(window.speechSynthesis.speaking){window.speechSynthesis.cancel();$("speech-icon")&&($("speech-icon").textContent="🔊");return;}const text=document.querySelector("main")?.innerText||"";const u=new SpeechSynthesisUtterance(text);u.lang="pt-BR";u.rate=.95;u.onend=()=>$('speech-icon')&&($('speech-icon').textContent='🔊');$('speech-icon')&&($('speech-icon').textContent='⏹️');speechSynthesis.speak(u);});
  }

  const session = read(SESSION_KEY, null);
  if (!session) { location.href = "login.html?next=editor.html"; return; }

  const editorPageTitle = $('editor-page-title');
  const editingArticleId = new URLSearchParams(location.search).get('edit');
  const editorModeTitle = editingArticleId ? 'Editar matéria' : 'Nova matéria';
  if (editorPageTitle) editorPageTitle.textContent = editorModeTitle;
  document.title = `${editorModeTitle} — Folha do Paiquerê`;

  let isEditor = session.email?.toLowerCase() === MASTER || ["Editor", "Editor-Chefe"].includes(session.role);

  async function refreshEditorSession(){
    if(!fpCloudEnabled()){
      isEditor=session.email?.toLowerCase()===MASTER || ["Editor","Editor-Chefe"].includes(session.role);
      return true;
    }
    await window.FPCloud.waitForAuth?.();
    const user=window.FPCloud.getAuthUser?.();
    if(!user){
      localStorage.removeItem(SESSION_KEY);
      location.replace("login.html?next=editor.html");
      return false;
    }
    const profile=await window.FPCloud.loadProfile?.(user.uid).catch(()=>null);
    if(!profile || profile.accessRevoked){
      try{await window.FPCloud.firebaseSignOut?.();}catch(_){}
      localStorage.removeItem(SESSION_KEY);
      location.replace("login.html?switch=1");
      return false;
    }
    session.uid=user.uid;
    session.email=user.email||session.email;
    session.name=profile.name||user.displayName||session.name||session.email.split('@')[0];
    session.role=String(session.email||'').toLowerCase()===MASTER?"Editor-Chefe":(profile.role||"Estudante");
    session.avatar=profile.avatar||user.photoURL||session.avatar||"";
    session.firebase=true;
    write(SESSION_KEY,session);
    isEditor=session.email?.toLowerCase()===MASTER || ["Editor","Editor-Chefe"].includes(session.role);
    return true;
  }
  const params = new URLSearchParams(location.search);
  const editingIdFromURL = params.get("edit");

  let canvas = null;
  let coverURL = "";
  let coverCrop = { x: 0, y: 0, width: 1, height: 1 };
  let imageHTMLTarget = null;
  let imageSourceChoiceTarget = null;
  let cropEditorState = null;
  let videoUrl = "";
  let editingVideoObject = null;
  let editingAudioObject = null;
  let editingId = null;
  let currentStatus = "Rascunho";
  let editorPreviewMode = "card";
  let categorySelectionSnapshot = [];
  function selectedCategoryDetails() {
    const select = $('article-category');
    if (!select) return { categories: [], known: [], custom: [], otherSelected: false };
    const selected = [...select.selectedOptions].map(option => option.value);
    const known = selected.filter(value => value !== 'Outro');
    const otherSelected = selected.includes('Outro');
    const custom = otherSelected
      ? splitDistinctLines($('article-category-other')?.value || '', Math.max(0, 3 - known.length))
      : [];
    return { categories: splitDistinctLines([...known, ...custom], 3), known, custom, otherSelected };
  }
  function selectedCategoriesFromForm() {
    return selectedCategoryDetails().categories;
  }
  function fitOtherCategories(notify = false) {
    const field = $('article-category-other'), select = $('article-category');
    if (!field || !select || ![...select.selectedOptions].some(option => option.value === 'Outro')) return;
    const knownCount = [...select.selectedOptions].filter(option => option.value !== 'Outro').length;
    const limit = Math.max(0, 3 - knownCount);
    // Keep the trailing newline while the writer is entering the next line; trim only
    // when the raw number of rows really exceeds the remaining category slots.
    const rows = String(field.value || '').split(/\r?\n/);
    if (rows.length > Math.max(1, limit)) {
      const next = rows.slice(0, Math.max(1, limit)).join('\n');
      const focused = document.activeElement === field;
      field.value = next;
      if (focused) { try { field.setSelectionRange(next.length, next.length); } catch (_) {} }
      if (notify) setStatus('Uma matéria pode ter no máximo três categorias no total.', 'warning');
    }
  }
  function renderCategoryPicker(){
    const select=$('article-category'),menu=$('article-category-menu'),label=$('article-category-trigger-label'),chips=$('article-category-selected');
    if(!select||!menu||!label||!chips)return;
    const selectedOptions=[...select.selectedOptions].map(option=>option.value);
    const selectedCategories=selectedCategoriesFromForm();
    label.textContent=selectedCategories.length?`${selectedCategories.length} de 3 categorias selecionadas`:'Selecione até três categorias';
    chips.innerHTML=selectedCategories.map(value=>`<span class="editor-category-chip">${escapeHTML(value)}</span>`).join('');
    menu.innerHTML=[...select.options].map((option,index)=>{
      const isOutro=option.value==='Outro';
      const disabled=selectedCategories.length>=3&&!option.selected;
      return `<label class="editor-category-option${option.selected?' is-selected':''}"><input type="checkbox" data-category-index="${index}" ${option.selected?'checked':''} ${disabled?'disabled':''}><span>${escapeHTML(option.value||option.textContent)}</span></label>`;
    }).join('');
    menu.onchange=event=>{
      const input=event.target.closest('input[data-category-index]');if(!input)return;
      const option=select.options[Number(input.dataset.categoryIndex)];if(!option)return;
      const knownCount=[...select.selectedOptions].filter(item=>item.value!=='Outro').length;
      if(input.checked&&!option.selected&&option.value!=='Outro'&&knownCount+splitDistinctLines($('article-category-other')?.value||'').length>=3){input.checked=false;setStatus('Escolha no máximo três categorias por matéria.','warning');return;}
      option.selected=input.checked;
      select.dispatchEvent(new Event('change',{bubbles:true}));
    };
  }
  let initialLoading = false;
  let growQueued = false;

  const setStatus = (message, type = "info") => {
    const el = $("editor-status");
    if (!el) return;
    el.textContent = message;
    el.dataset.type = type;
  };

  function selectedTextObject() {
    const active = canvas?.getActiveObject();
    return active && ["textbox", "i-text", "text"].includes(active.type) ? active : null;
  }

  const TEXT_STYLES = {
    title: { label:"Título", fontSize:44, fontWeight:"800" },
    subtitle: { label:"Subtítulo", fontSize:28, fontWeight:"600" },
    body: { label:"Padrão", fontSize:19, fontWeight:"400" }
  };
  function textStyleKey(obj){
    if(obj?.dataTextStyle && TEXT_STYLES[obj.dataTextStyle]) return obj.dataTextStyle;
    const size=Number(obj?.fontSize||19); return size>=36?"title":size>=24?"subtitle":"body";
  }
  function normalizedEditorCrop(crop){
    if(!crop||typeof crop!=="object")return null;
    const x=Number(crop.x),y=Number(crop.y),width=Number(crop.width),height=Number(crop.height);
    if(![x,y,width,height].every(Number.isFinite)||x<0||y<0||width<.01||height<.01||width>1||height>1||x+width>1.0001||y+height>1.0001)return null;
    return {x,y,width,height};
  }
  function removeBlockSizeOverrides(active){
    if(!active)return;
    const strip=style=>{if(!style||typeof style!=="object")return style;const next={...style};delete next.fontSize;delete next.fontWeight;return next;};
    if(active.styles&&typeof active.styles==="object"){
      const next={};Object.entries(active.styles).forEach(([line,chars])=>{const target={};Object.entries(chars||{}).forEach(([index,style])=>{const clean=strip(style);if(Object.keys(clean||{}).length)target[index]=clean;});if(Object.keys(target).length)next[line]=target;});active.styles=next;
    }
    if(Array.isArray(active.dataEditorCharStyles))active.set('dataEditorCharStyles',active.dataEditorCharStyles.map(style=>{const clean=strip(style);return Object.keys(clean||{}).length?clean:null;}));
  }
  function applyTextPreset(key){
    const active=selectedTextObject();
    if(!active || !TEXT_STYLES[key]){setStatus("Selecione uma caixa de texto para escolher o estilo.","warning");return;}
    const preset=TEXT_STYLES[key];
    const selectionStart=Number(active.selectionStart),selectionEnd=Number(active.selectionEnd),textLength=String(active.text||'').length;
    const partial=active.isEditing&&Number.isInteger(active.selectionStart)&&Number.isInteger(active.selectionEnd)&&selectionStart!==selectionEnd&&!(selectionStart===0&&selectionEnd>=textLength);
    if(partial&&typeof active.setSelectionStyles==="function"){
      active.setSelectionStyles({fontSize:preset.fontSize,fontWeight:preset.fontWeight});
    }else{
      removeBlockSizeOverrides(active);
      active.set({fontSize:preset.fontSize,fontWeight:preset.fontWeight});active.set("dataTextStyle",key);
    }
    active.setCoords();canvas.requestRenderAll();growCanvas();syncTextControls();renderMobileBlocks();renderSitePreview();
  }
  function normalizeTextObject(obj){
    if(!obj||!["textbox","i-text","text"].includes(obj.type))return;
    const explicitKey=TEXT_STYLES[obj.dataTextStyle]?obj.dataTextStyle:null;
    const key=explicitKey||textStyleKey(obj),preset=TEXT_STYLES[key];
    const oldBaseFontSize=Number(obj.fontSize)||preset.fontSize;
    const oldBaseFontWeight=obj.fontWeight||preset.fontWeight;
    const oldBaseFontFamily=obj.fontFamily||"Inter";
    const oldBaseFill=typeof obj.fill==="string"?obj.fill:"#1A1D1A";
    // Um estilo explícito define a base do bloco. Estilos reais por caractere
    // permanecem; valores redundantes do padrão antigo são removidos abaixo.
    const baseFontSize=explicitKey?preset.fontSize:oldBaseFontSize;
    const baseFontWeight=explicitKey?preset.fontWeight:oldBaseFontWeight;
    const baseFontFamily=oldBaseFontFamily;
    const baseFill=oldBaseFill;
    obj.set({fontSize:baseFontSize,fontWeight:baseFontWeight,fontFamily:baseFontFamily,fill:baseFill});
    obj.set("dataTextStyle",key);
    const normalizedWeight=value=>{
      const weight=String(value??"").trim().toLowerCase();
      if(weight==="bold"||weight==="bolder"||(/^\d+$/.test(weight)&&Number(weight)>=600))return "bold";
      if(weight==="normal"||weight==="lighter"||(/^\d+$/.test(weight)&&Number(weight)<600))return "normal";
      return weight;
    };
    const sameFamily=(a,b)=>String(a||"").replace(/[\"']/g,"").trim().toLowerCase()===String(b||"").replace(/[\"']/g,"").trim().toLowerCase();
    const pruneStyleCell=style=>{
      if(!style||typeof style!=="object")return null;
      const cell={...style};
      const size=Number(cell.fontSize);
      if(cell.fontSize!==undefined&&cell.fontSize!==null&&Number.isFinite(size)&&(
        Math.abs(size-baseFontSize)<.01||Math.abs(size-oldBaseFontSize)<.01
      ))delete cell.fontSize;
      if(cell.fontWeight!==undefined&&(
        normalizedWeight(cell.fontWeight)===normalizedWeight(baseFontWeight)||
        normalizedWeight(cell.fontWeight)===normalizedWeight(oldBaseFontWeight)
      ))delete cell.fontWeight;
      if(cell.fontFamily!==undefined&&(sameFamily(cell.fontFamily,baseFontFamily)||sameFamily(cell.fontFamily,oldBaseFontFamily)))delete cell.fontFamily;
      if(cell.fill!==undefined&&String(cell.fill).toLowerCase()===String(baseFill).toLowerCase())delete cell.fill;
      if(cell.fontStyle!==undefined&&String(cell.fontStyle).toLowerCase()===String(obj.fontStyle||"normal").toLowerCase())delete cell.fontStyle;
      if(cell.underline!==undefined&&Boolean(cell.underline)===Boolean(obj.underline))delete cell.underline;
      return Object.keys(cell).length?cell:null;
    };
    if(obj.styles){
      Object.keys(obj.styles).forEach(line=>{
        const row=obj.styles[line]||{};
        Object.keys(row).forEach(ch=>{
          const clean=pruneStyleCell(row[ch]);
          if(clean)row[ch]=clean;else delete row[ch];
        });
        if(!Object.keys(row).length)delete obj.styles[line];
      });
    }
    if(Array.isArray(obj.dataEditorCharStyles)){
      obj.dataEditorCharStyles=obj.dataEditorCharStyles.map(pruneStyleCell);
    }
  }

  function syncTextControls() {
    const active = selectedTextObject();
    const disabled = !active;
    ["font-family", "bold", "italic", "align-left", "align-center", "align-right", "text-style-title", "text-style-subtitle", "text-style-body"].forEach(id => {
      const el = $(id);
      if (el) { el.disabled = disabled; el.classList.toggle("format-disabled", disabled); }
    });
    $("text-controls-empty")?.classList.toggle("hidden", !disabled);
    if (!active) return;

    let style = {fontFamily:active.fontFamily||"Inter",fontSize:active.fontSize||TEXT_STYLES.body.fontSize,fill:typeof active.fill === "string"?active.fill:"#1A1D1A",fontWeight:active.fontWeight||"normal",fontStyle:active.fontStyle||"normal"};
    if(active.isEditing && active.selectionStart !== active.selectionEnd && typeof active.getSelectionStyles === "function") {
      const styles=active.getSelectionStyles(active.selectionStart,active.selectionEnd);
      if(styles.length){
        const keys=["fontFamily","fontSize","fill","fontWeight","fontStyle"];
        keys.forEach(k=>{const first=styles[0]?.[k];if(first!==undefined&&styles.every(x=>x[k]===first))style[k]=first;});
      }
    }
    $("font-family").value = style.fontFamily || "Inter";
    const key=textStyleKey(active); $("format-state").textContent = TEXT_STYLES[key].label;
    const boldOn=style.fontWeight === "bold", italicOn=style.fontStyle === "italic";
    $("bold").setAttribute("aria-pressed", String(boldOn));
    $("italic").setAttribute("aria-pressed", String(italicOn));
    $("bold").classList.toggle("active",boldOn); $("italic").classList.toggle("active",italicOn);
    $("bold").textContent=boldOn?"Negrito ✓":"Negrito"; $("italic").textContent=italicOn?"Itálico ✓":"Itálico";
  }

  function applySelectedText(property, value) {
    const active = selectedTextObject();
    if (!active) {
      setStatus("Selecione uma caixa de texto na folha para usar essas ferramentas.", "warning");
      return;
    }
    // Se o cursor/seleção estiver dentro do texto, formata somente aquele trecho.
    // Caso contrário, mantém o comportamento anterior: formata a caixa inteira.
    const partial = active.isEditing && Number.isInteger(active.selectionStart) && Number.isInteger(active.selectionEnd) && active.selectionStart !== active.selectionEnd;
    if (partial && typeof active.setSelectionStyles === "function") active.setSelectionStyles({[property]:value});
    else active.set(property, value);
    active.setCoords();
    canvas.requestRenderAll();
    growCanvas();
    syncTextControls();
    renderSitePreview();
  }

  function applyWholeText(property,value){const active=selectedTextObject();if(!active){setStatus("Selecione uma caixa de texto.","warning");return;}active.set(property,value);active.setCoords();canvas.requestRenderAll();renderSitePreview();syncTextControls();}

  function nextContentTop(gap=36){
    if(!canvas||!canvas.getObjects().length)return 70;
    let bottom=60;canvas.getObjects().forEach(o=>{let h=0;try{h=o.getScaledHeight?.()||((o.height||80)*(o.scaleY||1));}catch(_){}bottom=Math.max(bottom,(Number(o.top)||0)+Math.max(60,Number(h)||60));});
    return Math.ceil(bottom+gap);
  }
  function assignObjectOrder(obj){
    if(!canvas||!obj)return;
    const ordered=mobileOrderedObjects();ordered.forEach((o,i)=>{if(o!==obj&&(!Number.isFinite(Number(o.dataOrder))||o.dataOrder==null))o.set('dataOrder',i+1);});
    obj.set('dataOrder',ordered.length+1);
  }
  function addText() {
    if (!canvas) return;
    const nextTop=nextContentTop();
    const text = new fabric.Textbox("Digite o texto", {
      left: 56,
      top: nextTop,
      width: 680,
      fontFamily: "Inter",
      fontSize: TEXT_STYLES.body.fontSize,
      fill: "#1A1D1A",
      fontWeight: TEXT_STYLES.body.fontWeight,
      fontStyle: "normal",
      textAlign: "left",
      editable: true,
      padding: 8,
      transparentCorners: false,
      cornerStyle: "circle"
    });
    text.set("dataType", "text");
    text.set("dataTextStyle", "body");
    text.set("dataOrder", canvas.getObjects().length + 1);
    canvas.add(text);
    canvas.setActiveObject(text);
    canvas.requestRenderAll();
    syncTextControls();
    growCanvas();
    text.enterEditing();
    text.selectAll();
    renderMobileBlocks();
    renderSitePreview();
  }

  function addImage(file) {
    if (!file || !/^image\/(png|jpeg|webp)$/.test(file.type)) {
      setStatus("Escolha uma imagem PNG, JPG/JPEG ou WebP.", "warning");
      return;
    }
    imageDataURL(file, 1400, .78).then(src => {
      fabric.Image.fromURL(src, image => {
        const maxWidth = 680;
        const scale = Math.min(1, maxWidth / Math.max(image.width || maxWidth, 1));
        image.set({ left: 60, top: nextContentTop(), scaleX: scale, scaleY: scale, transparentCorners: false, cornerStyle: "circle", selectable: true, evented: true });
        image.set("dataType", "image");
        image.set("dataOrder", canvas.getObjects().length + 1);
        image.set("dataImageSize", "large");
        image.set("dataImageScalePercent",100);
        canvas.add(image).setActiveObject(image);
        canvas.requestRenderAll();
        growCanvas();
        renderMobileBlocks();
        renderSitePreview();
      });
    }).catch(() => setStatus("Não foi possível carregar a imagem.", "warning"));
  }

  function imageDataURL(file,maxW=1600,quality=.86){
    return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onerror=reject;reader.onload=e=>{const img=new Image();img.onload=()=>{const scale=Math.min(1,maxW/img.width);const c=document.createElement("canvas");c.width=Math.round(img.width*scale);c.height=Math.round(img.height*scale);c.getContext("2d").drawImage(img,0,0,c.width,c.height);resolve(c.toDataURL("image/jpeg",quality));};img.onerror=reject;img.src=e.target.result;};reader.readAsDataURL(file);});
  }

  async function addCover(file) {
    if (!file || !/^image\/(png|jpeg|webp)$/.test(file.type)) {
      setStatus("Escolha uma imagem válida para a capa do card.", "warning");
      return;
    }
    try {
      coverURL = await imageDataURL(file,1600,.84);
      coverCrop = {x:0,y:0,width:1,height:1};
      $("cover-preview")?.classList.remove("hidden");
      $("cover-preview-image").src = coverURL;
      $("cover-preview-slot")?.classList.add("has-cover");
      $("cover-empty")?.classList.add("hidden");
      if($("cover-button"))$("cover-button").textContent="Alterar imagem";
      $("remove-cover")?.classList.remove("hidden");
      setStatus("Imagem de capa definida. Ela será usada no card das Notícias.", "success");
      renderSitePreview();
    } catch (_) { setStatus("Não foi possível carregar a imagem de capa.","warning"); }
  }

  function removeCover() {
    coverURL = "";
    coverCrop = {x:0,y:0,width:1,height:1};
    $("cover-preview")?.classList.add("hidden");
    $("cover-preview-image")?.removeAttribute("src");
    $("cover-preview-slot")?.classList.remove("has-cover");
    $("cover-empty")?.classList.add("hidden");
    if($("cover-button"))$("cover-button").textContent="Escolher imagem";
    $("remove-cover")?.classList.add("hidden");
    renderSitePreview();
    syncEditorRequirements();
  }

  function extractImageSourceFromHTML(raw) {
    const input=String(raw||'').trim();if(!input)return '';
    let candidate='';
    if(/^https?:\/\//i.test(input)||/^\/\//.test(input)||/^\.?\/?assets\//i.test(input)||/^\.\.?\//.test(input)) candidate=input;
    else {
      try {
        const parsed=new DOMParser().parseFromString(input,'text/html');
        const img=parsed.querySelector('img[src],img[data-src],source[srcset]');
        candidate=img?.getAttribute('src')||img?.getAttribute('data-src')||'';
        if(!candidate&&img?.hasAttribute('srcset'))candidate=String(img.getAttribute('srcset')||'').split(',')[0].trim().split(/\s+/)[0];
        if(!candidate){const match=input.match(/(?:src|data-src)\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))/i);candidate=match?.slice(1).find(Boolean)||'';}
      } catch (_) { return ''; }
    }
    try { const url=new URL(candidate,location.href);return ['http:','https:'].includes(url.protocol)?url.href:''; } catch (_) { return ''; }
  }
  function openImageHTMLModal(kind,target=null){
    const modal=$('image-html-modal');if(!modal)return;
    imageHTMLTarget={kind:kind==='cover'?'cover':'block',object:target||null};
    const title=$('image-html-modal-title'),help=$('image-html-modal-help'),source=$('image-html-source'),status=$('image-html-status');
    if(title)title.textContent=kind==='cover'?'Colar HTML da capa':'Colar HTML da imagem';
    if(help)help.textContent=kind==='cover'?'Cole uma tag <img> ou o link direto da imagem que será usada como capa.':'Cole uma tag <img> ou o link direto da imagem que será usada neste bloco.';
    if(source)source.value='';if(status)status.textContent='';
    modal.classList.remove('hidden');modal.setAttribute('aria-hidden','false');setTimeout(()=>source?.focus(),0);
  }
  function closeImageHTMLModal(){const modal=$('image-html-modal');if(!modal)return;modal.classList.add('hidden');modal.setAttribute('aria-hidden','true');imageHTMLTarget=null;}
  function validateCoverImageURL(src, timeoutMs=15000){
    return new Promise((resolve,reject)=>{
      const image=new Image();let settled=false;
      const finish=(error)=>{if(settled)return;settled=true;clearTimeout(timer);image.onload=null;image.onerror=null;if(error)reject(error);else resolve({width:image.naturalWidth||image.width,height:image.naturalHeight||image.height});};
      const timer=setTimeout(()=>finish(new Error('A imagem não respondeu a tempo. Verifique se o link é público e tente novamente.')),timeoutMs);
      image.onload=()=>((image.naturalWidth||image.width)>0&&(image.naturalHeight||image.height)>0?finish():finish(new Error('O endereço não retornou uma imagem válida.')));
      image.onerror=()=>finish(new Error('Não foi possível carregar a imagem desse endereço. Confira se o link abre diretamente uma imagem pública.'));
      image.src=src;
      if(image.complete){if((image.naturalWidth||image.width)>0&&(image.naturalHeight||image.height)>0)finish();else if(image.naturalWidth===0)finish(new Error('O endereço não retornou uma imagem válida.'));}
    });
  }
  async function applyCoverSource(src){
    // Só altera coverURL depois de confirmar que o navegador realmente carregou
    // uma imagem. Uma URL sintaticamente válida pode retornar HTML/404/403.
    await validateCoverImageURL(src);
    coverURL=src;coverCrop={x:0,y:0,width:1,height:1};$('cover-preview')?.classList.remove('hidden');const preview=$('cover-preview-image');if(preview)preview.src=src;
    $('cover-preview-slot')?.classList.add('has-cover');$('cover-empty')?.classList.add('hidden');
    if($('cover-button'))$('cover-button').textContent='Alterar imagem';$('remove-cover')?.classList.remove('hidden');
    renderSitePreview();syncEditorRequirements();setStatus('Imagem carregada na prévia. Para registrar a alteração, salve o rascunho ou envie a matéria para revisão.','success');
  }
  function applyImageSourceToCanvas(src,target=null){
    return new Promise((resolve,reject)=>{
      if(!canvas||!window.fabric?.Image?.fromURL){reject(new Error('O editor de imagem não está pronto.'));return;}
      try{fabric.Image.fromURL(src,image=>{
        if(!image||!Number(image.width)||!Number(image.height)){reject(new Error('Não foi possível carregar essa imagem. Confira o link e as permissões de acesso.'));return;}
        if(target&&canvas.getObjects().includes(target)){
          const size=Number(target.dataImageScalePercent)||({small:50,medium:75,large:100}[target.dataImageSize]||100),align=target.dataImageAlign||'left',order=Number.isFinite(Number(target.dataOrder))?Number(target.dataOrder):Math.max(1,mobileOrderedObjects().indexOf(target)+1);
          image.set({left:target.left,top:target.top,angle:target.angle,originX:target.originX||'left',originY:target.originY||'top',transparentCorners:false,cornerStyle:'circle',selectable:true,evented:true});
          image.set('dataType','image');image.set('dataOrder',order);image.set('dataImageSize',typeof size==='string'?size:(size<=55?'small':size<=85?'medium':'large'));image.set('dataImageScalePercent',Number(size)||100);image.set('dataImageAlign',align);image.set('dataCropped',false);image.set('dataCropFrame',null);
          canvas.remove(target);canvas.add(image).setActiveObject(image);setImageBlockSize(image,Number(size)||100);
        }else{
          const maxWidth=680,scale=Math.min(1,maxWidth/Math.max(Number(image.width)||maxWidth,1));
          image.set({left:56,top:nextContentTop(),scaleX:scale,scaleY:scale,transparentCorners:false,cornerStyle:'circle',selectable:true,evented:true});
          image.set('dataType','image');image.set('dataOrder',canvas.getObjects().length+1);image.set('dataImageSize','large');image.set('dataImageScalePercent',100);image.set('dataImageAlign','left');image.set('dataCropped',false);
          canvas.add(image).setActiveObject(image);canvas.requestRenderAll();growCanvas();renderMobileBlocks();renderSitePreview();syncEditorRequirements();
        }
        canvas.requestRenderAll();growCanvas();renderMobileBlocks();renderSitePreview();syncEditorRequirements();resolve(true);
      });}catch(error){reject(error);}
    });
  }
  async function applyImageHTMLModal(){
    const status=$('image-html-status'),button=$('image-html-modal-apply');const src=extractImageSourceFromHTML($('image-html-source')?.value||'');
    if(!src){if(status)status.textContent='Não encontrei um link HTTP/HTTPS de imagem. Cole uma tag <img src="…"> ou um endereço direto.';return;}
    if(!imageHTMLTarget){if(status)status.textContent='Escolha a área da imagem novamente.';return;}
    if(button){button.disabled=true;button.setAttribute('aria-busy','true');}
    try{
      if(imageHTMLTarget.kind==='cover')await applyCoverSource(src);
      else await applyImageSourceToCanvas(src,imageHTMLTarget.object);
      closeImageHTMLModal();
    }catch(error){if(status)status.textContent=error?.message||'Não foi possível usar essa imagem.';setStatus(error?.message||'Não foi possível usar essa imagem.','warning');}
    finally{if(button){button.disabled=false;button.removeAttribute('aria-busy');}}
  }

  function openImageSourceChoice(target=null){
    imageSourceChoiceTarget=target||null;const modal=$('image-source-choice-modal');if(!modal){if(target)openImageHTMLModal('block',target);else $('image-upload')?.click();return;}
    modal.classList.remove('hidden');modal.setAttribute('aria-hidden','false');modal.querySelector('[data-image-source-choice="device"]')?.focus({preventScroll:true});
  }
  function closeImageSourceChoice(){const modal=$('image-source-choice-modal');if(modal){modal.classList.add('hidden');modal.setAttribute('aria-hidden','true');}imageSourceChoiceTarget=null;}
  function bringFront() { const o = canvas?.getActiveObject(); if (!o) return; canvas.bringToFront(o); canvas.requestRenderAll(); }
  function sendBack() { const o = canvas?.getActiveObject(); if (!o) return; canvas.sendToBack(o); canvas.requestRenderAll(); }
  function deleteSelected() { const o = canvas?.getActiveObject(); if (!o) return; if(!window.confirm("Tem certeza de que deseja excluir este bloco?"))return; canvas.remove(o); canvas.discardActiveObject(); canvas.requestRenderAll(); growCanvas(); syncTextControls(); renderMobileBlocks(); renderSitePreview(); }

  function growCanvas() {
    if (!canvas) return;
    let maxBottom = 0;
    canvas.getObjects().forEach(object => {
      const rect = object.getBoundingRect(true, true);
      maxBottom = Math.max(maxBottom, (object.top || 0) + rect.height);
    });
    const desired = Math.max(1000, Math.ceil(maxBottom + 100));
    if (desired > canvas.getHeight()) {
      canvas.setHeight(desired);
      canvas.requestRenderAll();
    }
    const label = $("canvas-size-label");
    if (label) label.textContent = `800 × ${Math.round(canvas.getHeight())} px`;
  }

  function normalizeVideoURL(raw) {
    const input = String(raw || '').trim();
    if (!input) return '';
    try {
      const url = new URL(input);
      if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.username || url.password) return '';
      const host = url.hostname.replace(/^www\./, '').replace(/^m\./, '').toLowerCase();
      let id = '';
      if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
        if (url.pathname === '/watch') id = url.searchParams.get('v') || '';
        else if (url.pathname.startsWith('/shorts/')) id = url.pathname.split('/')[2] || '';
        else if (url.pathname.startsWith('/embed/')) id = url.pathname.split('/')[2] || '';
        else if (url.pathname.startsWith('/live/')) id = url.pathname.split('/')[2] || '';
        id = String(id || '').replace(/[^A-Za-z0-9_-]/g, '');
        if (/^[A-Za-z0-9_-]{6,15}$/.test(id)) return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}`;
      } else if (host === 'youtu.be') {
        id = url.pathname.split('/').filter(Boolean)[0] || '';
        id = String(id).replace(/[^A-Za-z0-9_-]/g, '');
        if (/^[A-Za-z0-9_-]{6,15}$/.test(id)) return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}`;
      } else if (host === 'tiktok.com' && url.pathname.includes('/video/')) {
        id = url.pathname.split('/video/')[1]?.split(/[/?]/)[0] || '';
        if (/^\d{6,30}$/.test(id)) return `https://www.tiktok.com/player/v1/${encodeURIComponent(id)}`;
      } else if (host === 'instagram.com' && /^\/(p|reel|reels|tv)\//.test(url.pathname)) {
        const parts = url.pathname.split('/').filter(Boolean); const code = parts[1] || '';
        if (/^[A-Za-z0-9_-]{3,40}$/.test(code)) return `https://www.instagram.com/${parts[0]}/${encodeURIComponent(code)}/embed`;
      } else if (host === 'facebook.com' || host === 'm.facebook.com' || host === 'fb.watch') {
        const original = encodeURIComponent(url.href);
        return `https://www.facebook.com/plugins/video.php?href=${original}&show_text=false`;
      } else if (host === 'vimeo.com' || host === 'player.vimeo.com') {
        id = url.pathname.split('/').filter(Boolean).pop() || '';
        if (/^\d{5,15}$/.test(id)) return `https://player.vimeo.com/video/${encodeURIComponent(id)}`;
      } else if (host === 'dailymotion.com' || host === 'dai.ly') {
        id = url.pathname.split('/').filter(Boolean).pop() || '';
        id = id.split('_')[0];
        if (/^[A-Za-z0-9]{5,20}$/.test(id)) return `https://www.dailymotion.com/embed/video/${encodeURIComponent(id)}`;
      }
      // Platforms without a stable public embed API are accepted as secure URLs.
      // The reader may block the frame; the public article will also expose the source link.
      if (url.href.length <= 2000 && !url.pathname.endsWith('.html?blocked')) return url.href;
      return '';
    } catch (_) { return ''; }
  }

  function serializeCanvas(fallbackThumb = "") {
    growCanvas();
    // Nunca exportamos o canvas para uma imagem aqui. Imagens do Cloudinary são
    // externas e podem tornar o canvas tainted, fazendo toDataURL() falhar.
    // A miniatura passa a usar a própria capa externa quando disponível.
    return {
      canvasJSON: canvas.toJSON(["dataType","dataTextStyle","dataPoll","dataVideoUrl","dataVideoSourceUrl","dataAudioUrl","dataCloudinary","dataLinks","dataEditorCharStyles","dataOrder","dataImageSize","dataImageScalePercent","dataImageAlign","dataCropFrame","dataCropSourceWidth","dataCropSourceHeight","dataOriginalCrop","dataCropped","dataParagraphAlign","dataParagraphIndent"]),
      thumbURL: coverURL || fallbackThumb || ""
    };
  }

  function isEligibleArticleCreditUser(user){
    if(!user||!String(user.name||'').trim())return false;
    const truthy=value=>value===true||value===1||['true','1','sim','yes'].includes(String(value??'').trim().toLocaleLowerCase('pt-BR'));
    const state=String(user.status||user.state||'').trim().toLocaleLowerCase('pt-BR');
    return !truthy(user.accessRevoked)&&!truthy(user.revoked)&&!truthy(user.deleted)&&!truthy(user.isDeleted)
      && !['revoked','deleted','removed','inactive','disabled'].includes(state)
      && String(user.revocationMode||'')!=='spark-plan-b';
  }
  function creditUsers(){
    try{const users=window.FPStore?.getUsers?.() || JSON.parse(localStorage.getItem("fp_users")||"[]");return Array.isArray(users)?users.filter(isEligibleArticleCreditUser):[];}catch(_){return []}
  }
  function normalizeCreditValues(value){
    return splitDistinctLines(value, 3);
  }
  async function syncCreditUsers(){
    // Merge from the complete local list. Starting from creditUsers() would
    // discard revoked rows before we can protect them from a stale public-profile copy.
    let localAll=[];
    try{localAll=window.FPStore?.getUsers?.() || JSON.parse(localStorage.getItem("fp_users")||"[]");}catch(_){}
    const local=Array.isArray(localAll)?localAll:[];
    const map=new Map(local.filter(u=>u&&String(u.uid||u.email||u.name||'').trim()).map(u=>[String(u.uid||u.email||u.name).toLowerCase(),u]));
    try{
      const remoteProfiles=await window.FPCloud?.fetchPublicProfiles?.()||[];
      if(Array.isArray(remoteProfiles))remoteProfiles.forEach(p=>{const key=String(p.uid||p.email||p.name||'').toLowerCase();if(key){const previous=map.get(key)||{},merged={...previous,...p};const inactiveValue=value=>value===true||value===1||['true','1','sim','yes'].includes(String(value??'').trim().toLocaleLowerCase('pt-BR'));const previousState=String(previous.status||previous.state||'').trim().toLocaleLowerCase('pt-BR');if(inactiveValue(previous.accessRevoked)||inactiveValue(previous.revoked)||inactiveValue(previous.deleted)||inactiveValue(previous.isDeleted)||['revoked','deleted','removed','inactive','disabled'].includes(previousState)||previous.revocationMode==='spark-plan-b'){if(inactiveValue(previous.accessRevoked))merged.accessRevoked=previous.accessRevoked;if(inactiveValue(previous.revoked))merged.revoked=previous.revoked;if(inactiveValue(previous.deleted))merged.deleted=previous.deleted;if(inactiveValue(previous.isDeleted))merged.isDeleted=previous.isDeleted;if(['revoked','deleted','removed','inactive','disabled'].includes(previousState)){merged.status=previous.status;merged.state=previous.state;}merged.revocationMode=previous.revocationMode||merged.revocationMode;}map.set(key,merged);}});
    }catch(_){}
    try{
      const remoteUsers=await window.FPCloud?.fetchEditorialUsers?.()||[];
      if(Array.isArray(remoteUsers))remoteUsers.forEach(p=>{
        const key=String(p.uid||p.email||p.name||'').toLowerCase();
        if(!key)return;
        const previous=map.get(key)||{},merged={...previous,...p};
        // A stale active-looking record from another collection must not erase
        // an already-known revocation/deletion marker from the local access list.
        const inactiveValue=value=>value===true||value===1||['true','1','sim','yes'].includes(String(value??'').trim().toLocaleLowerCase('pt-BR'));
        const previousState=String(previous.status||previous.state||'').trim().toLocaleLowerCase('pt-BR');
        const previouslyInactive=inactiveValue(previous.accessRevoked)||inactiveValue(previous.revoked)||inactiveValue(previous.deleted)||inactiveValue(previous.isDeleted)||['revoked','deleted','removed','inactive','disabled'].includes(previousState)||previous.revocationMode==='spark-plan-b';
        if(previouslyInactive){
          ['accessRevoked','revoked','deleted','isDeleted'].forEach(field=>{if(inactiveValue(previous[field]))merged[field]=previous[field];});
          if(['revoked','deleted','removed','inactive','disabled'].includes(previousState)){merged.status=previous.status;merged.state=previous.state;}
          if(previous.revocationMode)merged.revocationMode=previous.revocationMode;
        }
        map.set(key,merged);
      });
    }catch(_){}
    const merged=[...map.values()].filter(u=>u&&u.name);
    if(merged.length) {
      try{localStorage.setItem('fp_users',JSON.stringify(merged));}catch(_){}
      try{await window.FPStore?.setUsersLocal?.(merged);}catch(_){}
    }
    return merged;
  }
  function creditProfilesForValues(values){
    const users=creditUsers();
    return normalizeCreditValues(values).map(value=>{
      const found=users.find(u=>String(u.name||'').toLowerCase()===String(value).toLowerCase()||String(u.email||'').toLowerCase()===String(value).toLowerCase()||String(u.uid||'').toLowerCase()===String(value).toLowerCase());
      return found?{uid:String(found.uid||''),name:String(found.name||value),email:String(found.email||''),avatar:String(found.avatar||'')}:null;
    }).filter(Boolean);
  }

  function setupCreditSelectors(saved={}){
    const configs=[
      ["researcher","article-researcher-search","article-researcher-options","article-researcher-other","researcher"],
      ["text","article-text-credit-search","article-text-credit-options","article-text-credit-other","textCredit"],
      ["image","article-image-credit-search","article-image-credit-options","article-image-credit-other","imageCredit"]
    ];
    const users=creditUsers().sort((a,b)=>String(a.name).localeCompare(String(b.name),"pt-BR"));
    configs.forEach(([key,searchId,optionsId,otherId,savedKey])=>{
      const search=$(searchId),box=$(optionsId),other=$(otherId); if(!box||!search)return;
      const registeredLookup=new Map();
      users.forEach(user=>{
        const display=String(user.name||'').trim();
        [display,user.email,user.uid].filter(Boolean).forEach(value=>registeredLookup.set(String(value).toLocaleLowerCase('pt-BR'),display));
      });
      const normalizeEntry=value=>registeredLookup.get(String(value||'').trim().toLocaleLowerCase('pt-BR'))||String(value||'').trim();
      const state=new Set(normalizeCreditValues(saved?.[savedKey]).map(normalizeEntry).filter(Boolean).slice(0,3));
      const isRegistered=value=>registeredLookup.has(String(value||'').trim().toLocaleLowerCase('pt-BR'));
      let otherEnabled=[...state].some(value=>!isRegistered(value));
      const registeredSelected=()=>[...state].filter(isRegistered);
      const customSelected=()=>[...state].filter(value=>!isRegistered(value));
      const renderSummary=()=>{
        const summary=box.querySelector('.credit-summary');
        if(summary)summary.innerHTML=[...state].map(value=>`<span class="credit-chip">${escapeHTML(value)}</span>`).join('');
      };
      const syncOtherField=()=>{
        if(!other)return;
        other.classList.toggle('hidden',!otherEnabled);
        if(document.activeElement!==other)other.value=customSelected().join('\n');
      };
      const render=(term="")=>{
        const q=String(term||"").trim().toLocaleLowerCase("pt-BR");
        const filtered=users.filter(user=>!q||`${user.name} ${user.email||''} ${user.role||""}`.toLocaleLowerCase("pt-BR").includes(q));
        const rows=filtered.map(user=>{
          const checked=state.has(String(user.name||''));
          const atLimit=state.size>=3&&!checked;
          return `<label class="credit-option"><input type="checkbox" data-credit-value="${escapeHTML(user.name)}" data-credit-key="${escapeHTML(key)}" ${checked?"checked":""} ${atLimit?'disabled':''}><span class="credit-option-name">${escapeHTML(user.name)}</span><span class="credit-option-meta">${escapeHTML(user.role||"Estudante")}</span></label>`;
        }).join("");
        box.innerHTML=`${rows||'<div class="credit-empty">Nenhuma pessoa encontrada.</div>'}<label class="credit-option credit-option-other"><input type="checkbox" data-credit-other="${escapeHTML(key)}" ${otherEnabled?"checked":""} ${state.size>=3&&!otherEnabled?'disabled':''}><span class="credit-option-name">Outro</span></label><div class="credit-summary">${[...state].map(value=>`<span class="credit-chip">${escapeHTML(value)}</span>`).join("")}</div>`;
        syncOtherField();
      };
      box.addEventListener("change",event=>{
        const target=event.target;
        if(target.matches("[data-credit-value]")){
          const value=String(target.dataset.creditValue||'').trim();
          if(target.checked){
            if(state.size>=3){target.checked=false;setStatus('Cada tipo de crédito aceita no máximo três pessoas.','warning');return;}
            state.add(value);
          }else state.delete(value);
        }
        if(target.matches("[data-credit-other]")){
          otherEnabled=target.checked;
          if(!otherEnabled){customSelected().forEach(value=>state.delete(value));if(other)other.value="";}
          else if(other){other.classList.remove('hidden');window.setTimeout(()=>other.focus(),0);}
        }
        render(search.value);
      });
      search.oninput=()=>render(search.value);
      other?.addEventListener("input",()=>{
        const registered=registeredSelected();
        const rowLimit=Math.max(0,3-registered.length);
        const requestedRows=String(other.value||'').split(/\r?\n/);
        if(rowLimit>0&&requestedRows.length>rowLimit){
          const fitted=requestedRows.slice(0,rowLimit).join('\n'); other.value=fitted;
          try{other.setSelectionRange(fitted.length,fitted.length);}catch(_){}
          setStatus('Cada tipo de crédito aceita no máximo três pessoas.','warning');
        }
        const custom=splitDistinctLines(other.value, rowLimit);
        state.clear();registered.forEach(value=>state.add(value));custom.forEach(value=>state.add(value));
        renderSummary();
      });
      render();
    });
  }
  function creditValueFor(key,otherId){
    const optionSuffix={researcher:'researcher',text:'text-credit',image:'image-credit'}[key]||key;
    const box=document.getElementById(`article-${optionSuffix}-options`);if(!box)return [];
    const selected=[...box.querySelectorAll(`input[data-credit-key="${CSS.escape(key)}"]:checked`)].map(input=>input.dataset.creditValue).filter(Boolean);
    const customEnabled=Boolean(box.querySelector(`[data-credit-other="${CSS.escape(key)}"]`)?.checked);
    const custom=customEnabled?splitDistinctLines($(otherId)?.value||'',Math.max(0,3-selected.length)):[];
    return splitDistinctLines([...selected,...custom],3);
  }
  function creditValue(optionsId, otherId){
    const key=optionsId.includes("researcher")?"researcher":optionsId.includes("text-credit")?"text":"image";
    return creditValueFor(key,otherId);
  }

  async function buildArticle(mode) {
    const title = $("article-title").value.trim();
    const firebaseUser=await ensureFirebaseAuth();
    const subtitle = $("article-subtitle").value.trim();
    const category = $("article-category").value;
    const author = session.name;
    if (!title) throw new Error("Informe o título da matéria.");
    if (!author) throw new Error("Informe o autor da matéria.");

    const all = readArticles();
    if (!Array.isArray(all)) throw new Error("Não foi possível acessar as matérias salvas.");
    const base = editingId ? all.find(item => String(item.id) === String(editingId)) : null;
    const article = base ? { ...base } : { id: uid(), authorEmail: session.email, date: new Date().toISOString() };

    const serialized = serializeCanvas(base?.thumbURL || "");
    article.title = title;
    article.subtitle = subtitle;
    const categories = selectedCategoriesFromForm();
    article.categories = categories;
    article.category = categories.join(", ") || category;
    const creativeValue=$("creative-type")?.value||"";
    article.creativeType = creativeValue==="Outro" ? ($("creative-type-other")?.value.trim()||"Outro") : creativeValue;
    article.contentType = $("article-type")?.value || "informacional";
    article.author = author;
    article.authorEmail = session.email;
    article.authorUid = firebaseUser?.uid || article.authorUid || session.uid || "";
    article.coverURL = coverURL;
    article.coverCrop = coverCrop && typeof coverCrop === "object" ? {x:Number(coverCrop.x)||0,y:Number(coverCrop.y)||0,width:Number(coverCrop.width)||1,height:Number(coverCrop.height)||1} : {x:0,y:0,width:1,height:1};
    article.thumbURL = serialized.thumbURL;
    article.canvasJSON = serialized.canvasJSON;
    article.videoUrl = videoUrl;
    article.credits = {researcher:creditValue("article-researcher-options","article-researcher-other"),textCredit:creditValue("article-text-credit-options","article-text-credit-other"),imageCredit:creditValue("article-image-credit-options","article-image-credit-other")};
    article.creditProfiles = {researcher:creditProfilesForValues(article.credits.researcher),textCredit:creditProfilesForValues(article.credits.textCredit),imageCredit:creditProfilesForValues(article.credits.imageCredit)};
    article.updatedAt = new Date().toISOString();
    if (mode === "draft") {
      article.status = "Rascunho";
      if (base?.correctionCycle === true) article.correctionCycle = true;
    }
    if (mode === "review") {
      article.status = "Pendente";
      article.feedback = "";
      article.correctionCycle = false;
    }

    // A função chamadora faz a única persistência necessária. Antes havia uma
    // gravação aqui e outra imediatamente depois no envio para revisão, o que
    // provocava duplicação de sincronizações/upload e podia gerar itens repetidos.
    editingId = article.id;
    currentStatus = article.status;
    updateWorkflowButtons();
    return article;
  }



  function pendingWorkForCurrentAuthor(excludeId=''){
    const uid=String(session.uid||'').toLowerCase(),email=String(session.email||'').toLowerCase();
    return readArticles().filter(a=>{const authorUid=String(a.authorUid||'').toLowerCase(),authorEmail=String(a.authorEmail||'').toLowerCase();return (uid&&authorUid===uid)||(email&&authorEmail===email);}).filter(a=>['Rascunho','Pendente','Ajustes'].includes(String(a.status||''))&&String(a.id)!==String(excludeId||'')).length;
  }
  function assertSingleOpenArticle(excludeId=''){
    if(pendingWorkForCurrentAuthor(excludeId)>=1) throw new Error('Você já possui uma matéria em Rascunho, Em análise ou Necessita Ajustes. Finalize, reenvie, publique ou exclua a matéria permitida antes de criar outra.');
  }

  let workflowBusy=false;
  function updateWorkflowButtons(){
    const post=$("post-article");
    const submit=$("submit-review");
    const isAdjustment=currentStatus==="Ajustes";
    if(submit) submit.textContent=isAdjustment?"Enviar para correção":"Enviar para revisão";
    if(post) post.classList.toggle("hidden",!(isEditor&&editingId&&currentStatus==="Pendente"&&!isAdjustment));
    syncEditorRequirements();
  }

  function workflowProgress(show=true, pct=0, label="Preparando…") {
    const box=$("workflow-progress"), bar=$("workflow-progress-bar"), val=$("workflow-progress-pct"), text=$("workflow-progress-label");
    if(!box)return;
    box.classList.toggle("hidden",!show);
    const n=Math.max(0,Math.min(100,Number(pct)||0));
    if(bar)bar.style.width=`${n}%`;
    if(val)val.textContent=`${Math.round(n)}%`;
    if(text)text.textContent=label;
  }


  async function saveDraft(){
    if(workflowBusy)return;
    workflowBusy=true;
    try{
      if(!editingId) assertSingleOpenArticle('');
      workflowProgress(true,3,'Salvando rascunho…');
      const article=await buildArticle('draft');
      const synced=await saveSingleArticle(article,{cloudRequired:true,onProgress:(pct,label)=>workflowProgress(true,pct,label)});
      if(!synced?.id)throw new Error('O Firebase não confirmou o rascunho.');
      workflowProgress(true,100,'Rascunho salvo.');
      redirectToStudentArea('Rascunho salvo com sucesso.');
    }catch(error){setStatus(error?.message||'Não foi possível salvar o rascunho.','warning');workflowProgress(false);}
    finally{workflowBusy=false;}
  }
  async function submitReview() {
    if(workflowBusy)return;
    if(!syncEditorRequirements().ready){setStatus('Preencha título, categoria, capa e pelo menos um bloco de texto antes de enviar para revisão.','warning');return;}
    workflowBusy=true;
    const buttons=[$("submit-review"),$("mobile-submit-review")].filter(Boolean);
    buttons.forEach(button=>{button.disabled=true;button.setAttribute("aria-busy","true");});
    setStatus("Salvando e enviando para a mesa do editor…","info");
    try {
      workflowProgress(true, 3, "Preparando envio para a mesa…");
      if(!editingId) assertSingleOpenArticle('');
      const article=await buildArticle("review");
      if(!article?.id || article.status!=="Pendente") throw new Error("A matéria não foi preparada corretamente para a revisão.");
      // O envio para revisão só continua para a próxima tela depois de o registro
      // estar confirmado no Firebase. A cópia local já foi preservada antes disso.
      const synced=await saveSingleArticle(article,{cloudRequired:true,onProgress:(pct,label)=>workflowProgress(true,pct,label)});
      if(!synced?.id) throw new Error("O Firebase não confirmou o envio da matéria.");
      workflowProgress(true,100,"Enviado para a mesa do editor.");
      redirectToStudentArea("Matéria enviada para análise editorial.");
    } catch (error) {
      buttons.forEach(button=>{button.disabled=false;button.removeAttribute("aria-busy");});
      workflowBusy=false;
      setStatus(error?.message || "Não foi possível enviar a matéria.","warning");
      console.error('[Folha do Paiquerê] submitReview', error);
    }
  }

  async function loadExistingArticle() {
    await syncCreditUsers();
    if (!editingIdFromURL) { setupCreditSelectors({}); return; }
    const article = readArticles().find(item => String(item.id) === String(editingIdFromURL));
    if (!article) {
      if (isEditor && String(session.role||'') !== 'Editor-Chefe' && String(session.email||'').toLowerCase() !== MASTER) {
        redirectToStudentArea('Esta matéria não está disponível para edição com seu acesso atual.');
      }
      return;
    }
    const editorChief=String(session.role||'')==='Editor-Chefe'||String(session.email||'').toLowerCase()===MASTER;
    if (isEditor && !editorChief && String(article.status||'') === 'Aprovado') {
      const toMillis=value=>{if(value&&typeof value.toDate==='function')return value.toDate().getTime();if(value&&typeof value==='object'&&Number.isFinite(Number(value.seconds)))return Number(value.seconds)*1000;return 0;};
      const hasFirestoreTimestamp=value=>Boolean(value&&((typeof value.toDate==='function')||(typeof value==='object'&&Number.isFinite(Number(value.seconds)))));
      const belongsToEditor=Boolean(session.uid)&&String(article.authorUid||'')===String(session.uid);
      if(!belongsToEditor||!hasFirestoreTimestamp(article.editorEditUntil)||toMillis(article.editorEditUntil)<=Date.now()){
        redirectToStudentArea('Esta publicação só pode ser editada pelo Editor-Chefe ou pelo seu autor dentro do prazo de sete dias. Publicações antigas sem prazo editorial confiável ficam reservadas ao Editor-Chefe.');
        return;
      }
    }
    editingId = article.id;
    currentStatus = article.status || "Rascunho";
    updateWorkflowButtons();
    $("article-title").value = article.title || "";
    $("article-subtitle").value = article.subtitle || "";
    const categorySelect=$("article-category"); if(categorySelect){
      const tags=splitDistinctLines(article.categories?.length?article.categories:(article.category||"Cultura").split(/\s*,\s*/),3);
      const known=[...categorySelect.options].map(o=>o.value).filter(value=>value!=='Outro');
      const selectedKnown=tags.filter(tag=>known.includes(tag)).slice(0,3);
      const customTags=tags.filter(tag=>!known.includes(tag)).slice(0,Math.max(0,3-selectedKnown.length));
      [...categorySelect.options].forEach(o=>o.selected=selectedKnown.includes(o.value)||(o.value==="Outro"&&customTags.length>0));
      categorySelectionSnapshot=[...categorySelect.selectedOptions].map(o=>o.value);
      if($('article-category-other')){$('article-category-other').value=customTags.join('\n');$('article-category-other').classList.toggle('hidden',customTags.length===0);}
    }
    $("article-type").value = article.contentType || "informacional";
    const creativeSaved=article.creativeType || "Poesia"; const creativeSelect=$("creative-type"); if(creativeSelect){ const known=[...creativeSelect.options].map(o=>o.value); creativeSelect.value=known.includes(creativeSaved)?creativeSaved:"Outro"; if($("creative-type-other")) { $("creative-type-other").value=known.includes(creativeSaved)?"":creativeSaved; $("creative-type-other").classList.toggle("hidden",creativeSelect.value!=="Outro"); }}
    $("creative-type-wrap")?.classList.toggle("hidden", (article.contentType || "informacional") !== "entretenimento");
    setupCreditSelectors(article.credits||{});
    coverURL = article.coverURL || "";
    { const c=article.coverCrop; coverCrop=c&&[c.x,c.y,c.width,c.height].every(v=>Number.isFinite(Number(v)))?{x:Math.max(0,Math.min(.99,Number(c.x))),y:Math.max(0,Math.min(.99,Number(c.y))),width:Math.max(.01,Math.min(1-Number(c.x),Number(c.width))),height:Math.max(.01,Math.min(1-Number(c.y),Number(c.height)))}:{x:0,y:0,width:1,height:1}; }
    videoUrl = article.videoUrl || "";

    renderCategoryPicker();
    if (coverURL) {
      $("cover-preview")?.classList.remove("hidden");
      $("cover-preview-image").src = coverURL;
      $("cover-preview-slot")?.classList.add("has-cover");
      $("cover-empty")?.classList.add("hidden");
      if($("cover-button"))$("cover-button").textContent="Alterar imagem";
      $("remove-cover")?.classList.remove("hidden");
    }

    if (!article.canvasJSON) { renderMobileBlocks(); renderSitePreview(); syncEditorRequirements(); return; }
    initialLoading = true;
    canvas.loadFromJSON(article.canvasJSON, () => {
      canvas.getObjects().forEach(obj=>{ if(["textbox","i-text","text"].includes(obj.type)) normalizeTextObject(obj); });
      canvas.renderAll();
      initialLoading = false;
      growCanvas();
      syncTextControls();
      renderMobileBlocks();
      renderSitePreview();
      syncEditorRequirements();
    });
  }

  function previewInteractive(o){
    if(o.dataType==='poll'&&o.dataPoll){const p=o.dataPoll;return `<section class="news-poll"><div class="poll-heading"><span class="poll-badge">ENQUETE</span><span class="poll-kind">${escapeHTML(p.kindLabel)}</span></div><h3>${escapeHTML(p.title)}</h3><p class="poll-help">${p.kind==='multi'?'Você pode marcar mais de uma opção.':p.kind==='rating'?'Escolha uma nota de 0 a 5.':'Escolha uma opção.'}</p><div class="poll-options">${p.options.map(x=>`<button type="button"><span class="poll-option-marker"></span><span>${escapeHTML(x)}</span></button>`).join('')}</div></section>`;}
    return '';
  }

  function textObjectHTML(o){
    const text=String(o.text||''), links=Array.isArray(o.dataLinks)?o.dataLinks.filter(x=>x&&Number.isFinite(Number(x.start))&&Number.isFinite(Number(x.end))&&Number(x.end)>Number(x.start)&&/^https?:\/\//i.test(String(x.url||''))):[];
    const explicitKey=Boolean(o.dataTextStyle&&TEXT_STYLES[o.dataTextStyle]);
    const key=explicitKey?o.dataTextStyle:textStyleKey(o),preset=TEXT_STYLES[key]||TEXT_STYLES.body;
    const baseFontSize=explicitKey?preset.fontSize:(Number(o.fontSize)||preset.fontSize);
    const baseFontWeight=explicitKey?preset.fontWeight:(o.fontWeight||preset.fontWeight);
    const lines=text.split('\n');let output='',offset=0;
    lines.forEach((line,lineIndex)=>{
      const alignValues=Array.isArray(o.dataParagraphAlign)?o.dataParagraphAlign:[];
      const indentValues=Array.isArray(o.dataParagraphIndent)?o.dataParagraphIndent:[];
      const align=['left','center','right','justify'].includes(alignValues[lineIndex])?alignValues[lineIndex]:(['left','center','right','justify'].includes(o.textAlign)?o.textAlign:'left');
      const indent=Math.max(0,Math.min(6,Number(indentValues[lineIndex])||0));
      let html='',run='',lastSig='',lastHref='';
      const flush=()=>{if(!run)return;const span=`<span style="${lastSig}">${escapeHTML(run)}</span>`;html+=lastHref?`<a href="${escapeHTML(lastHref)}" target="_blank" rel="noopener noreferrer" style="color:#2878D0;text-decoration:underline;cursor:pointer">${span}</a>`:span;run='';};
      for(let localIndex=0;localIndex<line.length;localIndex++){
        const absoluteIndex=offset+localIndex, ch=line[localIndex];
        let loc={lineIndex,charIndex:localIndex};try{loc=o.get2DCursorLocation?.(absoluteIndex)||loc;}catch(_){}
        const st=o.styles?.[loc.lineIndex]?.[loc.charIndex]||{};
        const link=links.find(x=>absoluteIndex>=Number(x.start)&&absoluteIndex<Number(x.end));const href=link?String(link.url):'';
        const ff=st.fontFamily||o.fontFamily||'Inter',fs=Number(st.fontSize||baseFontSize),fill=st.fill||o.fill||'#1A1D1A',fw=st.fontWeight||baseFontWeight,fi=st.fontStyle||o.fontStyle||'normal',underlined=(st.underline??o.underline),decoration=underlined?'underline':'none';
        const sig=`font-family:${escapeHTML(ff)};font-size:${fs}px;font-weight:${escapeHTML(fw)};font-style:${escapeHTML(fi)};color:${escapeHTML(fill)};text-decoration:${decoration};`;
        if(run&&(sig!==lastSig||href!==lastHref))flush();
        if(!run){lastSig=sig;lastHref=href;}run+=ch;
      }
      flush();
      output+=`<div class="editor-rich-line" data-editor-line="${lineIndex}" style="text-align:${align};${indent?`padding-left:${indent*1.2}em;`:''}">${html||'<br>'}</div>`;
      offset+=line.length+1;
    });
    return output;
  }

  function safeEditorLink(raw){
    try{const input=String(raw||'').trim();if(!input)return '';const url=new URL(/^https?:\/\//i.test(input)?input:`https://${input}`);if(!['http:','https:'].includes(url.protocol)||url.username||url.password)return '';return url.href;}catch(_){return '';}
  }

  function readRichEditorContent(editor){
    const charStyles=[],links=[],paragraphAlign=[],paragraphIndent=[];let text='',lastCharacterWasExplicitNewline=false;
    const lineIndex=()=>text.split('\n').length-1;
    const isLastEditorDescendant=node=>{
      let current=node;
      while(current&&current!==editor){
        if(current.nextSibling)return false;
        current=current.parentNode;
      }
      return current===editor;
    };
    const addChar=(char,style={},href='',explicitNewline=false)=>{
      const absolute=text.length;text+=char;charStyles.push({...style});
      lastCharacterWasExplicitNewline=char==='\n'&&explicitNewline;
      if(href&&char!=='\n'){
        const last=links[links.length-1];
        if(last&&last.url===href&&Number(last.end)===absolute)last.end=absolute+1;
        else links.push({start:absolute,end:absolute+1,url:href});
      }
    };
    const addBreak=(explicit=false)=>{if(text&&!text.endsWith('\n'))addChar('\n',{},'',explicit);};
    const normalizeFont=font=>String(font||'').replace(/^['"]|['"]$/g,'').trim();
    const walk=(node,inherited={},href='')=>{
      if(node.nodeType===Node.TEXT_NODE){
        const value=String(node.nodeValue||'');
        for(let i=0;i<value.length;i++){
          const ch=value[i];
          if(ch==='\r')continue;
          if(ch==='\n'){addChar('\n',{},'',true);continue;}
          addChar(ch,inherited,href);
        }
        return;
      }
      if(node.nodeType!==Node.ELEMENT_NODE)return;
      const tag=node.tagName;
      if(tag==='BR'){
        const parent=node.parentElement;
        const explicitEmptyLine=['DIV','P'].includes(parent?.tagName)&&parent.childNodes.length===1&&parent.firstChild===node;
        if(explicitEmptyLine){
          // A BR in an empty block is often the browser's placeholder. A boundary
          // before it already represents a trailing blank line; only add another
          // newline when this empty block is not the final editor line.
          if(!isLastEditorDescendant(node))addChar('\n',{},'',true);
        }else addChar('\n',{},'',true);
        return;
      }
      const isBlock=['DIV','P','LI','H1','H2','H3','BLOCKQUOTE','UL','OL'].includes(tag);
      if(isBlock&&text&&!text.endsWith('\n'))addBreak(true);
      const style={...inherited};
      const css=node.style||{};
      const family=normalizeFont(css.fontFamily||node.getAttribute('face'));
      if(family)style.fontFamily=family;
      const legacySizeMap={1:10,2:13,3:16,4:19,5:24,6:28,7:44};
      const legacySize=legacySizeMap[Number(node.getAttribute('size'))]||0;
      const size=parseFloat(css.fontSize||'')||legacySize;if(Number.isFinite(size)&&size>0)style.fontSize=size;
      if(css.fontWeight)style.fontWeight=css.fontWeight;
      if(tag==='B'||tag==='STRONG')style.fontWeight='bold';
      if(css.fontStyle)style.fontStyle=css.fontStyle;
      if(tag==='I'||tag==='EM')style.fontStyle='italic';
      const decoration=String(css.textDecoration||css.textDecorationLine||'').toLowerCase();
      if(tag==='U'||decoration.includes('underline'))style.underline=true;
      else if(decoration.includes('none'))style.underline=false;
      if(css.color){
        const color=String(css.color).trim();
        if(/^#[0-9a-f]{3,8}$/i.test(color))style.fill=color;
        else {const match=color.match(/^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/i);if(match)style.fill='#'+match.slice(1).map(v=>Number(v).toString(16).padStart(2,'0')).join('');}
      }
      let nextHref=href;
      if(tag==='A'){
        // A cor e o sublinhado do link são efeitos do elemento <a>, não do texto.
        // Não grave esses efeitos como formatação de caractere: assim, ao desvincular,
        // o trecho recupera a aparência original sem apagar a formatação de texto real.
        nextHref=safeEditorLink(node.getAttribute('href')||'');
      }
      if(isBlock){
        const currentLine=lineIndex();
        const paragraphAlignment=String(css.textAlign||node.getAttribute('align')||'').toLowerCase();
        if(['left','center','right','justify'].includes(paragraphAlignment))paragraphAlign[currentLine]=paragraphAlignment;
        const marginLeft=parseFloat(css.paddingLeft||css.marginLeft||'');
        if(Number.isFinite(marginLeft)&&marginLeft>0)paragraphIndent[currentLine]=Math.max(0,Math.min(6,Math.round(marginLeft/19.2)));
      }
      if(tag==='LI'){
        const parent=node.parentElement,ordered=parent?.tagName==='OL';
        const siblings=parent?[...parent.children].filter(el=>el.tagName==='LI'):[];
        const marker=ordered?`${Math.max(1,siblings.indexOf(node)+1)}. `:'• ';
        for(const ch of marker)addChar(ch,style,'');
      }
      for(const child of [...node.childNodes])walk(child,style,nextHref);
      if(isBlock&&text&&!text.endsWith('\n'))addBreak(!isLastEditorDescendant(node));
    };
    for(const child of [...editor.childNodes])walk(child,{},'');
    // Remove only a synthetic terminal block separator. Literal newlines and BRs,
    // including a deliberate final line break, must survive serialization.
    if(text.endsWith('\n')&&!lastCharacterWasExplicitNewline){text=text.slice(0,-1);charStyles.pop();}
    const count=text.split('\n').length;
    paragraphAlign.length=count;paragraphIndent.length=count;
    return {text,charStyles,links,paragraphAlign,paragraphIndent};
  }

  function syncRichEditorToObject(editor,obj){
    if(!editor||!obj||!canvas)return;
    const parsed=readRichEditorContent(editor);
    const baseFontSize=Number(obj.fontSize)||TEXT_STYLES[textStyleKey(obj)].fontSize;
    const baseFontFamily=obj.fontFamily||"Inter",baseFill=typeof obj.fill==="string"?obj.fill:"#1A1D1A";
    const baseFontWeight=obj.fontWeight||"normal",baseFontStyle=obj.fontStyle||"normal",baseUnderline=Boolean(obj.underline);
    const normalizedWeight=value=>{
      const weight=String(value??"").trim().toLowerCase();
      if(weight==="bold"||weight==="bolder"||(/^\d+$/.test(weight)&&Number(weight)>=600))return "bold";
      if(weight==="normal"||weight==="lighter"||(/^\d+$/.test(weight)&&Number(weight)<600))return "normal";
      return weight;
    };
    obj.set({text:parsed.text,styles:{}});
    obj.set('dataLinks',parsed.links);
    obj.set('dataParagraphAlign',parsed.paragraphAlign);obj.set('dataParagraphIndent',parsed.paragraphIndent);
    const normalizedCharStyles=Array(parsed.charStyles.length).fill(null);
    for(let i=0;i<parsed.text.length;i++){
      const ch=parsed.text[i];if(ch==='\n')continue;
      let loc={lineIndex:0,charIndex:i};try{loc=obj.get2DCursorLocation?.(i)||loc;}catch(_){}
      const source=parsed.charStyles[i]||{},cell={};
      // textObjectHTML inclui estilos computados para exibição; não os salve como
      // overrides por caractere quando são apenas iguais ao padrão do bloco.
      if(source.fontFamily&&String(source.fontFamily).replace(/[\"']/g,"").trim().toLowerCase()!==String(baseFontFamily).replace(/[\"']/g,"").trim().toLowerCase())cell.fontFamily=source.fontFamily;
      if(source.fontSize!==undefined&&source.fontSize!==null&&Number.isFinite(Number(source.fontSize))&&Math.abs(Number(source.fontSize)-baseFontSize)>=.01)cell.fontSize=Number(source.fontSize);
      if(source.fill&&String(source.fill).toLowerCase()!==String(baseFill).toLowerCase())cell.fill=source.fill;
      if(source.fontWeight&&normalizedWeight(source.fontWeight)!==normalizedWeight(baseFontWeight))cell.fontWeight=source.fontWeight;
      if(source.fontStyle&&String(source.fontStyle).toLowerCase()!==String(baseFontStyle).toLowerCase())cell.fontStyle=source.fontStyle;
      if(source.underline!==undefined&&Boolean(source.underline)!==baseUnderline)cell.underline=Boolean(source.underline);
      if(Object.keys(cell).length){
        obj.styles[loc.lineIndex]=obj.styles[loc.lineIndex]||{};obj.styles[loc.lineIndex][loc.charIndex]={...cell};
        normalizedCharStyles[i]={...cell};
      }
    }
    obj.set('dataEditorCharStyles',normalizedCharStyles);
    try{obj.initDimensions?.();}catch(_){}
    obj.setCoords();canvas.requestRenderAll();growCanvas();renderSitePreview();syncEditorRequirements();
  }

  function saveRichEditorSelection(editor){
    const selection=window.getSelection();
    if(!editor||!selection||!selection.rangeCount)return;
    const range=selection.getRangeAt(0);
    if(editor.contains(range.commonAncestorContainer))editor.__fpSavedRange=range.cloneRange();
  }

  function restoreRichEditorSelection(editor){
    if(!editor)return false;
    // Clone the remembered range before focusing: focus handlers can replace the live selection
    // on touch browsers, which otherwise makes the font/style selector appear to do nothing.
    let range=null;
    try{range=editor.__fpSavedRange?.cloneRange?.()||null;}catch(_){}
    try{
      editor.focus({preventScroll:true});
      if(!range)return false;
      const selection=window.getSelection();if(!selection)return false;
      selection.removeAllRanges();selection.addRange(range);
      const restored=editor.contains(selection.anchorNode)&&editor.contains(selection.focusNode);
      if(restored&&selection.rangeCount)editor.__fpSavedRange=selection.getRangeAt(0).cloneRange();
      return restored;
    }catch(_){return false;}
  }

  function getRichEditorSelection(editor){
    const selection=window.getSelection();
    if(!editor||!selection||!selection.rangeCount)return null;
    const range=selection.getRangeAt(0);
    if(!editor.contains(range.commonAncestorContainer)||range.collapsed||!selection.toString().length)return null;
    return range;
  }
  function getRichEditorCaret(editor){
    const selection=window.getSelection();
    if(!editor||!selection||!selection.rangeCount)return null;
    const range=selection.getRangeAt(0);
    return range.collapsed&&editor.contains(range.commonAncestorContainer)?range:null;
  }
  function wrapRichEditorSelection(editor, styles){
    const range=getRichEditorSelection(editor);if(!range)return false;
    const css=styleToCssMap(styles),applyInline=element=>{
      Object.entries(css).forEach(([key,value])=>{element.style[key]=value;});
    };
    const wrapper=document.createElement('span');applyInline(wrapper);
    const content=range.extractContents();
    // Existing nested spans may retain earlier font-size/font-family styles. Apply the
    // newly chosen properties to descendants too, so an old child style cannot win.
    content.querySelectorAll?.('*').forEach(applyInline);
    wrapper.append(content);range.insertNode(wrapper);
    const next=document.createRange();next.selectNodeContents(wrapper);
    const selection=window.getSelection();selection.removeAllRanges();selection.addRange(next);
    saveRichEditorSelection(editor);return true;
  }
  function syncRichEditorToolbar(button, action){
    const map={bold:'bold',italic:'italic',underline:'underline'};const command=map[action];
    if(!button||!command)return;
    const active=Boolean(document.queryCommandState(command));
    button.setAttribute('aria-pressed',String(active));button.classList.toggle('active',active);
  }
  function pendingStyleObject(editor){
    if(!editor.__fpPendingMarks) editor.__fpPendingMarks={};
    return editor.__fpPendingMarks;
  }
  function styleToCssMap(style){
    const map={fontFamily:'fontFamily',fontSize:'fontSize',fontWeight:'fontWeight',fontStyle:'fontStyle',underline:'textDecoration'};
    const css={};Object.entries(style||{}).forEach(([key,value])=>{const target=map[key];if(!target||value===undefined||value===null)return;css[target]=key==='underline'?(value?'underline':'none'):String(value).endsWith('px')?String(value):key==='fontSize'?`${Number(value)}px`:String(value);});return css;
  }
  function richStyleMatches(parent, style){
    if(!parent||parent.tagName!=='SPAN')return false;
    const desired=styleToCssMap(style);
    return Object.entries(desired).every(([key,value])=>String(parent.style[key]||'').trim().toLowerCase()===String(value).trim().toLowerCase());
  }
  function insertTextWithPendingStyle(editor, value, explicitStyle=null){
    const text=String(value??'');if(!text)return false;
    const selection=window.getSelection();if(!selection||!selection.rangeCount)return false;
    const range=selection.getRangeAt(0);if(!range.collapsed||!editor.contains(range.commonAncestorContainer))return false;
    const pending=explicitStyle||editor.__fpPendingMarks||{},css=styleToCssMap(pending);
    if(!Object.keys(css).length)return false;
    const textNode=document.createTextNode(text);
    const parent=range.startContainer.nodeType===Node.TEXT_NODE?range.startContainer.parentElement:range.startContainer;
    if(range.startContainer.nodeType===Node.TEXT_NODE&&richStyleMatches(parent,pending)){
      const node=range.startContainer,offset=range.startOffset;
      node.insertData(offset,text);
      const next=document.createRange();next.setStart(node,offset+text.length);next.collapse(true);
      selection.removeAllRanges();selection.addRange(next);
    }else{
      // A span with explicit typography overrides inherited <b>/<strong> and old
      // inline styles around the caret, so pasted text does not inherit formatting.
      const span=document.createElement('span');Object.entries(css).forEach(([key,val])=>{span.style[key]=val;});span.append(textNode);range.insertNode(span);
      const next=document.createRange();next.setStart(textNode,text.length);next.collapse(true);
      selection.removeAllRanges();selection.addRange(next);
    }
    saveRichEditorSelection(editor);return true;
  }

  function richEditorPasteStyle(editor,obj){
    const key=TEXT_STYLES[editor?.__fpPastePreset]?editor.__fpPastePreset:(TEXT_STYLES[obj?.dataTextStyle]?obj.dataTextStyle:textStyleKey(obj));
    const preset=TEXT_STYLES[key]||TEXT_STYLES.body;
    const pending=editor?.__fpPendingMarks&&typeof editor.__fpPendingMarks==='object'?editor.__fpPendingMarks:{};
    const explicitPreset=Boolean(TEXT_STYLES[editor?.__fpPastePreset]);
    // Always set a complete baseline. A just-selected preset takes priority for
    // size/weight; inline toolbar marks remain only when the user had not selected
    // a new Normal/Title/Subtitle preset.
    return {
      fontFamily: pending.fontFamily ?? obj?.fontFamily ?? 'Inter',
      fontSize: explicitPreset ? preset.fontSize : (pending.fontSize ?? preset.fontSize),
      fontWeight: explicitPreset ? preset.fontWeight : (pending.fontWeight ?? preset.fontWeight),
      fontStyle: pending.fontStyle ?? 'normal',
      underline: pending.underline ?? false
    };
  }

  function richEditorSelectionInsideList(editor,range){
    const node=range?.startContainer;
    const element=node?.nodeType===Node.ELEMENT_NODE?node:node?.parentElement;
    const item=element?.closest?.('li');
    return Boolean(item&&editor.contains(item));
  }
  function insertRichEditorNewline(editor){
    const selection=window.getSelection();if(!selection||!selection.rangeCount)return false;
    const range=selection.getRangeAt(0);
    if(!editor.contains(range.commonAncestorContainer))return false;
    range.deleteContents();
    const newline=document.createTextNode('\n');
    range.insertNode(newline);
    const caret=document.createRange();caret.setStartAfter(newline);caret.collapse(true);
    selection.removeAllRanges();selection.addRange(caret);saveRichEditorSelection(editor);return true;
  }
  function withinRichEditorNode(ancestor,node){return Boolean(ancestor&&node&&(ancestor===node||ancestor.contains(node)));}
  function clearAutoLinkPresentation(root){
    if(!root)return;
    const elements=[];
    if(root.nodeType===Node.ELEMENT_NODE&&root.matches?.('[style]'))elements.push(root);
    if(root.querySelectorAll)elements.push(...root.querySelectorAll('[style]'));
    elements.forEach(element=>{
      const color=String(element.style?.color||'').replace(/\s/g,'').toLowerCase();
      const decoration=String(element.style?.textDecoration||element.style?.textDecorationLine||'').toLowerCase();
      if(['#2878d0','rgb(40,120,208)'].includes(color)&&decoration.includes('underline')){
        element.style.removeProperty('color');
        element.style.removeProperty('text-decoration');
        element.style.removeProperty('text-decoration-line');
      }
    });
  }
  function unlinkRichEditorSelection(editor,selectionRange){
    const anchors=[...editor.querySelectorAll('a[href]')].filter(anchor=>{
      try{return selectionRange.intersectsNode(anchor);}catch(_){return false;}
    }).reverse();
    if(!anchors.length)return false;
    let changed=false;
    for(const anchor of anchors){
      if(!anchor.isConnected)continue;
      const range=selectionRange.cloneRange();
      const startInside=withinRichEditorNode(anchor,range.startContainer);
      const endInside=withinRichEditorNode(anchor,range.endContainer);
      const startContainer=startInside?range.startContainer:anchor;
      const startOffset=startInside?range.startOffset:0;
      const endContainer=endInside?range.endContainer:anchor;
      const endOffset=endInside?range.endOffset:anchor.childNodes.length;
      let selectedRange;
      try{
        selectedRange=document.createRange();selectedRange.setStart(startContainer,startOffset);selectedRange.setEnd(endContainer,endOffset);
      }catch(_){continue;}
      if(selectedRange.collapsed)continue;
      const beforeRange=document.createRange();beforeRange.selectNodeContents(anchor);beforeRange.setEnd(startContainer,startOffset);
      const afterRange=document.createRange();afterRange.selectNodeContents(anchor);afterRange.setStart(endContainer,endOffset);
      const before=beforeRange.cloneContents();let selected=selectedRange.cloneContents();const after=afterRange.cloneContents();
      if(!selected.childNodes.length)continue;
      // cloneContents() omits common ancestors when a selection starts and ends
      // inside one text node. Recreate those inline ancestors so unlinking does
      // not reset that phrase's font, size, weight or underline.
      const context=[];let contextNode=selectedRange.commonAncestorContainer;
      if(contextNode?.nodeType!==Node.ELEMENT_NODE)contextNode=contextNode?.parentElement;
      while(contextNode&&contextNode!==anchor&&anchor.contains(contextNode)){
        context.push(contextNode);contextNode=contextNode.parentElement;
      }
      for(const original of context){
        const wrapper=original.cloneNode(false);wrapper.append(selected);
        const wrapped=document.createDocumentFragment();wrapped.append(wrapper);selected=wrapped;
      }
      // Remove nested anchors only from the selected fragment; links before/after
      // the selection are reconstructed with their original attributes intact.
      selected.querySelectorAll('a').forEach(link=>link.replaceWith(...link.childNodes));
      clearAutoLinkPresentation(selected);
      const unlinked=document.createElement('span');unlinked.setAttribute('data-fp-unlinked-selection','true');
      for(const child of [...selected.childNodes]){
        if(child.nodeType===Node.ELEMENT_NODE&&child.tagName==='A')unlinked.append(...child.childNodes);
        else unlinked.append(child);
      }
      const replacement=document.createDocumentFragment();
      if(before.childNodes.length){const beforeLink=anchor.cloneNode(false);beforeLink.append(before);replacement.append(beforeLink);}
      replacement.append(unlinked);
      if(after.childNodes.length){const afterLink=anchor.cloneNode(false);afterLink.append(after);replacement.append(afterLink);}
      anchor.replaceWith(replacement);changed=true;
    }
    if(changed){
      const marks=[...editor.querySelectorAll('[data-fp-unlinked-selection="true"]')];
      const last=marks[marks.length-1];
      if(last){
        last.removeAttribute('data-fp-unlinked-selection');
        editor.focus();
        const selection=window.getSelection(),caret=document.createRange();caret.selectNodeContents(last);caret.collapse(false);
        selection?.removeAllRanges();selection?.addRange(caret);saveRichEditorSelection(editor);
      }
    }
    return changed;
  }
  function applyRichEditorCommand(editor,obj,action,button){
    if(!editor||!obj)return;
    restoreRichEditorSelection(editor);
    const range=getRichEditorSelection(editor);
    const caret=getRichEditorCaret(editor);
    if(action==='link'||action==='unlink'){
      if(action==='unlink'&&!range){
        const selection=window.getSelection();
        const anchor=selection?.anchorNode?.nodeType===Node.ELEMENT_NODE
          ? selection.anchorNode.closest?.('a')
          : selection?.anchorNode?.parentElement?.closest?.('a');
        if(anchor&&editor.contains(anchor)){
          clearAutoLinkPresentation(anchor);
          anchor.replaceWith(...anchor.childNodes);
          syncRichEditorToObject(editor,obj);setStatus('Link removido apenas do trecho vinculado.','success');return;
        }
      }
      if(!range){setStatus(action==='link'?'Selecione o trecho para inserir um link.':'Selecione o trecho vinculado que deseja desvincular.','warning');editor.focus();return;}
      if(action==='unlink'){
        if(!unlinkRichEditorSelection(editor,range)){
          setStatus('A seleção não contém um link para remover.','warning');return;
        }
        syncRichEditorToObject(editor,obj);setStatus('Link removido apenas do trecho selecionado.','success');return;
      }
      const raw=window.prompt('Cole o endereço HTTP ou HTTPS para o trecho selecionado:');
      if(!raw){editor.focus();return;}
      const url=safeEditorLink(raw);
      if(!url){setStatus('Informe um endereço HTTP ou HTTPS válido.','warning');editor.focus();return;}
      restoreRichEditorSelection(editor);
      if(!getRichEditorSelection(editor)){setStatus('Selecione o texto antes de inserir um link.','warning');return;}
      const ok=document.execCommand('createLink',false,url);
      if(!ok){setStatus('Não foi possível associar o link ao trecho selecionado.','warning');return;}
      editor.querySelectorAll('a[href]').forEach(a=>{if(safeEditorLink(a.getAttribute('href'))===url){a.style.color='#2878D0';a.style.textDecoration='underline';a.style.cursor='pointer';}});
      syncRichEditorToObject(editor,obj);setStatus('Link inserido no trecho selecionado.','success');return;
    }
    const commands={bold:'bold',italic:'italic',underline:'underline',bullets:'insertUnorderedList',numbers:'insertOrderedList','align-left':'justifyLeft','align-center':'justifyCenter','align-right':'justifyRight'};
    const command=commands[action];if(!command)return;
    if(!range&&!caret){setStatus('Clique no texto ou selecione o trecho que deseja formatar.','warning');editor.focus();return;}
    // Inline emphasis also toggles typing style when the caret is collapsed.
    if(['bold','italic','underline'].includes(action)){
      if(!range&&caret){
        const pending=pendingStyleObject(editor);
        const key=action==='bold'?'fontWeight':action==='italic'?'fontStyle':'underline';
        const current=key==='fontWeight'
          ? (pending.fontWeight!==undefined ? (pending.fontWeight==='bold'||Number(pending.fontWeight)>=600) : Boolean(document.queryCommandState('bold')))
          : key==='fontStyle'
            ? (pending.fontStyle!==undefined ? pending.fontStyle==='italic' : Boolean(document.queryCommandState('italic')))
            : (pending.underline!==undefined ? Boolean(pending.underline) : Boolean(document.queryCommandState('underline')));
        pending[key]=key==='fontWeight'?(current?'normal':'bold'):key==='fontStyle'?(current?'normal':'italic'):!current;
        const active=!current;button?.setAttribute('aria-pressed',String(active));button?.classList.toggle('active',active);
        setStatus(`${action==='bold'?'Negrito':action==='italic'?'Itálico':'Sublinhado'} ${active?'ativo para o próximo texto':'desativado para o próximo texto'}.`,'success');return;
      }
      const success=document.execCommand(command,false,null);
      if(!success){setStatus('O navegador não conseguiu aplicar essa formatação.','warning');return;}
      syncRichEditorToObject(editor,obj);syncRichEditorToolbar(button,action);return;
    }
    // Lists/alignment operate on the selected paragraphs (or the paragraph at the caret).
    const success=document.execCommand(command,false,null);
    if(!success){setStatus('O navegador não conseguiu aplicar essa formatação. Selecione o trecho e tente novamente.','warning');return;}
    syncRichEditorToObject(editor,obj);
    if(action==='bullets'||action==='numbers'){
      // Keep empty/list lines as real text content in the serialized block.
      editor.innerHTML=textObjectHTML(obj);editor.__fpSavedRange=null;
    }
  }
  function renderEditorInlinePreview(){
    const box=$('editor-live-preview');if(!box)return;
    document.querySelectorAll('[data-editor-preview-mode]').forEach(btn=>{const active=btn.dataset.editorPreviewMode===editorPreviewMode;btn.classList.toggle('is-active',active);btn.setAttribute('aria-pressed',String(active));});
    box.classList.toggle('is-card',editorPreviewMode==='card');box.classList.toggle('is-mobile',editorPreviewMode==='mobile');
    if(editorPreviewMode==='card'){
      const title=$('article-title')?.value.trim()||'Título da matéria';const subtitle=$('article-subtitle')?.value.trim()||'Subtítulo da matéria';
      const categories=selectedCategoriesFromForm();
      const objects=canvas?mobileOrderedObjects():[];const words=[title,subtitle,...objects.map(o=>o.text||o.dataPoll?.title||'')].join(' ').trim().split(/\s+/).filter(Boolean).length;const minutes=Math.max(1,Math.ceil(words/200));
      const cover=coverURL||'';const today=new Date().toLocaleDateString('pt-BR');const cc=normalizedEditorCrop(coverCrop)||{x:0,y:0,width:1,height:1};const cropIsActive=Number(cc.x)>0.0001||Number(cc.y)>0.0001||Number(cc.width)<.9999||Number(cc.height)<.9999;const coverStyle=cover&&cropIsActive?`width:${100/cc.width}%!important;height:${100/cc.height}%!important;left:${-cc.x/cc.width*100}%!important;top:${-cc.y/cc.height*100}%!important;max-width:none!important;max-height:none!important;object-fit:fill!important;`:'';
      box.innerHTML=`<article class="editor-article-card-preview">${cover?`<span class="fp-crop-image-window editor-card-cover-window"><img class="editor-article-card-image" style="${coverStyle}" src="${escapeHTML(cover)}" alt="Capa da matéria"></span>`:`<div class="editor-article-card-placeholder" aria-hidden="true">▤</div>`}<div class="editor-article-card-body"><div class="editor-article-card-tags">${(categories.length?categories:['Categoria']).map(x=>`<span>${escapeHTML(x)}</span>`).join('')}</div><h3>${escapeHTML(title)}</h3><p>${escapeHTML(subtitle||'O subtítulo da matéria aparecerá aqui.')}</p><div class="editor-article-card-meta"><span>◉ Prévia de visualizações</span><span>◷ ${today}</span><span>⌛ ${minutes} min de leitura</span></div><span class="editor-article-card-readmore">Ler mais ↗</span></div></article>`;
    }else{
      const site=$('site-preview-content');box.innerHTML=site?.innerHTML||'<p class="editor-muted">Preencha os dados para visualizar a matéria.</p>';
      if(editorPreviewMode==='mobile')box.classList.add('is-mobile');
    }
  }
  function renderSitePreview(){
    const wrap=$('site-preview-content');if(!wrap)return;
    const title=$('article-title')?.value.trim()||'Título da matéria';
    const subtitle=$('article-subtitle')?.value.trim()||'Subtítulo da matéria';
    const author=session.name;
    const cats=selectedCategoriesFromForm();
    const category=cats.join(' · ')||'Categoria';
    const contentType=$('article-type')?.value||'informacional';
    const cv=$('creative-type')?.value||'';const creativeType=cv==='Outro'?($('creative-type-other')?.value.trim()||'Outro'):cv;
    const objects=canvas?mobileOrderedObjects():[];
    const blocks=objects.map(o=>{
      if(o.dataType==='poll'&&o.dataPoll)return previewInteractive(o);
      if(['textbox','i-text','text'].includes(o.type)&&String(o.text||'').trim()){
        const key=o.dataTextStyle||textStyleKey(o);return `<div class="preview-block preview-text-${escapeHTML(key)}" style="white-space:pre-wrap;line-height:${Number(o.lineHeight)||1.5};text-align:${escapeHTML(o.textAlign||'left')}">${textObjectHTML(o)}</div>`;
      }
      if(o.dataType==='video'&&o.dataVideoUrl)return `<div class="preview-block preview-video"><iframe src="${escapeHTML(o.dataVideoUrl)}" title="Vídeo da matéria" allowfullscreen></iframe></div>`;
      if(o.dataType==='audio'&&o.dataAudioUrl)return `<figure class="preview-block preview-audio"><audio controls preload="metadata" src="${escapeHTML(o.dataAudioUrl)}">Seu navegador não oferece suporte à reprodução de áudio.</audio><figcaption>Áudio da matéria</figcaption></figure>`;
      if(o.type==='image'&&typeof o._element?.src==='string'&&o._element.src){const size=680*Math.max(1,Math.min(200,Number(o.dataImageScalePercent)||({small:50,medium:75,large:100}[o.dataImageSize]||100)))/100;const cropped=normalizedEditorCrop(o.dataCropFrame);const css=`width:min(${size}px,100%);margin:1.1rem ${o.dataImageAlign==='right'?'0 0 auto':o.dataImageAlign==='center'?'auto':'0'}`;const image=cropped?`<span class="fp-crop-image-window fp-editor-crop-preview" style="aspect-ratio:${Math.max(.01,cropped.width*Number(o.dataCropSourceWidth||o.width||1))/Math.max(.01,cropped.height*Number(o.dataCropSourceHeight||o.height||1))}"><img src="${escapeHTML(o._element.src)}" alt="Imagem da matéria" style="width:${100/cropped.width}%!important;height:${100/cropped.height}%!important;left:${-cropped.x/cropped.width*100}%!important;top:${-cropped.y/cropped.height*100}%!important;max-width:none!important;max-height:none!important;object-fit:fill!important;"></span>`:`<img class="rounded-xl" src="${escapeHTML(o._element.src)}" alt="Imagem da matéria">`;return `<figure class="preview-block preview-image is-align-${escapeHTML(o.dataImageAlign||'left')}" style="${css}">${image}</figure>`;}
      return '';
    }).join('');
    wrap.innerHTML=`<div class="preview-site"><header class="preview-site-header"><div class="preview-site-brand"><div><strong>Folha do Paiquerê</strong><small>Jornal Escolar</small></div></div><nav><span>Início</span><span>Notícias</span><span>Sobre</span></nav><span class="preview-login">Área do Estudante</span></header><main class="preview-site-main"><article class="preview-site-article"><div class="preview-body"><div class="flex flex-wrap gap-2">${(cats.length?cats:['Categoria']).map(c=>`<span class="preview-category">${escapeHTML(c)}</span>`).join('')}${contentType==='entretenimento'?`<span class="preview-category">Cantinho Criativo · ${escapeHTML(creativeType)}</span>`:''}</div><h1 class="preview-title">${escapeHTML(title)}</h1><p class="preview-subtitle">${escapeHTML(subtitle)}</p>${coverURL?`<span class="fp-crop-image-window fp-site-cover-window" style="aspect-ratio:16/10"><img src="${escapeHTML(coverURL)}" alt="Imagem de capa" style="width:${100/(normalizedEditorCrop(coverCrop)||{width:1}).width}%!important;height:${100/(normalizedEditorCrop(coverCrop)||{height:1}).height}%!important;left:${-((normalizedEditorCrop(coverCrop)||{x:0}).x)/((normalizedEditorCrop(coverCrop)||{width:1}).width)*100}%!important;top:${-((normalizedEditorCrop(coverCrop)||{y:0}).y)/((normalizedEditorCrop(coverCrop)||{height:1}).height)*100}%!important;max-width:none!important;max-height:none!important;object-fit:fill!important;"></span>`:''}<p class="preview-meta">Por <strong>${escapeHTML(author)}</strong> · prévia</p><div class="preview-content">${blocks||`<p class="preview-block empty-preview">Adicione ao menos um bloco de texto para visualizar o conteúdo aqui.</p>`}</div></div></article></main><footer class="preview-site-footer"><div><strong>Folha do Paiquerê</strong><small>Jornal Escolar</small></div><div>© 2026 Folha do Paiquerê</div></footer></div>`;
    renderEditorInlinePreview();
    syncEditorRequirements();
  }
  function openSitePreview(mode="desktop"){
    try { renderSitePreview(); } catch (error) { setStatus("Não foi possível montar a prévia desta matéria.", "warning"); return; }
    $("site-preview-frame")?.classList.toggle("site-preview-mobile",mode==="mobile");
    $("site-preview-modal")?.classList.remove("hidden");
  }

  function renderMobileMeta(){
    const box=$("mobile-meta-card"); if(!box)return;
    const title=$("article-title")?.value.trim()||"Sem título";
    const subtitle=$("article-subtitle")?.value.trim()||"Sem subtítulo";
    const categories=selectedCategoriesFromForm();
    const cover=coverURL||$("cover-preview-image")?.src||"";
    box.innerHTML=`<div class="col-span-2"><span class="text-[10px] font-bold uppercase tracking-wide text-slate-500">Título</span><p class="mt-1 font-extrabold leading-5">${escapeHTML(title)}</p></div><div class="col-span-2"><span class="text-[10px] font-bold uppercase tracking-wide text-slate-500">Subtítulo</span><p class="mt-1 leading-5 text-slate-600 dark:text-slate-300">${escapeHTML(subtitle)}</p></div><div><span class="text-[10px] font-bold uppercase tracking-wide text-slate-500">Tema(s)</span><p class="mt-1 font-semibold">${escapeHTML(categories.join(" · ")||"Sem tema")}</p></div>${cover?`<div class="col-span-2"><span class="text-[10px] font-bold uppercase tracking-wide text-slate-500">Capa</span><img src="${escapeHTML(cover)}" alt="Capa da matéria" class="mt-1 h-24 w-full rounded-xl object-cover border border-slate-200 dark:border-slate-700"></div>`:""}`;
  }

  let mobileImageEditObject=null;
  function mobileOrderedObjects(){
    if(!canvas)return[];const objects=canvas.getObjects().slice();
    const allHaveOrder=objects.length>0&&objects.every(o=>o.dataOrder!==undefined&&Number.isFinite(Number(o.dataOrder)));
    return objects.sort((a,b)=>allHaveOrder?(Number(a.dataOrder)-Number(b.dataOrder)||((Number(a.top)||0)-(Number(b.top)||0))):(((Number(a.top)||0)-(Number(b.top)||0))||((Number(a.left)||0)-(Number(b.left)||0))));
  }
  function reflowCanvasBlocks(objects=mobileOrderedObjects()){
    if(!canvas)return;let top=60;
    objects.forEach((o,i)=>{o.set('dataOrder',i+1);const left=o.dataType==='image'&&o.dataImageAlign==='center'?Math.max(24,(800-(o.getScaledWidth?.()||680))/2):o.dataType==='image'&&o.dataImageAlign==='right'?Math.max(24,800-(o.getScaledWidth?.()||680)-24):56;o.set({top,left});o.setCoords();let h=0;try{h=o.getScaledHeight?.()||((o.height||80)*(o.scaleY||1));}catch(_){}top+=Math.max(65,Number(h)||65)+34;});
    canvas.requestRenderAll();growCanvas();renderMobileBlocks();renderSitePreview();
  }
  function swapMobileObjectOrder(index,direction){
    const objects=mobileOrderedObjects(),target=index+direction;if(target<0||target>=objects.length)return;
    const [moved]=objects.splice(index,1);objects.splice(target,0,moved);reflowCanvasBlocks(objects);
  }
  function moveBlockToOrder(obj,requested){
    const objects=mobileOrderedObjects(),current=objects.indexOf(obj);if(current<0)return;
    const target=Math.max(0,Math.min(objects.length-1,Math.trunc(Number(requested)||1)-1));if(target===current)return;
    const [moved]=objects.splice(current,1);objects.splice(target,0,moved);reflowCanvasBlocks(objects);
  }
  function syncEditorRequirements(){
    const hasTitle=Boolean($('article-title')?.value.trim());
    const categoryState=selectedCategoryDetails();
    const hasCategory=categoryState.categories.length>0&&categoryState.categories.length<=3&&(!categoryState.otherSelected||categoryState.custom.length>0);
    const hasCover=Boolean(String(coverURL||'').trim());
    const hasText=Boolean(canvas?.getObjects().some(o=>{if(!['textbox','i-text','text'].includes(o.type))return false;const text=String(o.text||'').trim();return Boolean(text)&&!['Digite o texto','Título ou destaque'].includes(text);}));
    $('editor-content-required')?.classList.toggle('hidden',hasText);
    const count=$('editor-content-count');if(count&&canvas){const n=canvas.getObjects().length;count.textContent=`${n} ${n===1?'bloco':'blocos'}`;}
    const submit=$('submit-review');const ready=hasTitle&&hasCategory&&hasCover&&hasText;
    if(submit){submit.disabled=!ready||workflowBusy;submit.setAttribute('aria-disabled',String(!ready||workflowBusy));submit.classList.toggle('editor-review-ready',ready&&!workflowBusy);}
    $('editor-title-required')?.classList.toggle('is-complete',hasTitle);
    $('editor-category-required')?.classList.toggle('is-complete',hasCategory);
    $('editor-cover-required')?.classList.toggle('is-complete',hasCover);
    return {hasTitle,hasCategory,hasCover,hasText,ready};
  }
  function deleteBlockWithConfirmation(obj){
    if(!obj||!canvas)return;if(!window.confirm('Tem certeza de que deseja excluir este bloco?'))return;
    canvas.remove(obj);canvas.discardActiveObject();canvas.requestRenderAll();growCanvas();renderMobileBlocks();renderSitePreview();syncEditorRequirements();
  }
  function setImageBlockSize(obj,size){
    if(!obj||obj.type!=='image')return;
    const presets={small:50,medium:75,large:100};
    const parsed=typeof size==='string'&&Object.prototype.hasOwnProperty.call(presets,size)?presets[size]:Number(size);
    const percent=Math.max(1,Math.min(200,Number.isFinite(parsed)?parsed:100));
    const wanted=680*percent/100,nativeWidth=Math.max(1,Number(obj.width)||680);
    const oldCrop=obj.dataCropFrame;
    obj.set({scaleX:wanted/nativeWidth,scaleY:wanted/nativeWidth});
    obj.set('dataImageScalePercent',percent);
    obj.set('dataImageSize',percent<=55?'small':percent<=85?'medium':'large');
    const width=obj.getScaledWidth?.()||wanted;
    obj.set('left',obj.dataImageAlign==='center'?Math.max(24,(800-width)/2):obj.dataImageAlign==='right'?Math.max(24,800-width-24):56);
    if(oldCrop)obj.set('dataCropFrame',oldCrop);
    obj.setCoords();canvas.requestRenderAll();growCanvas();renderMobileBlocks();renderSitePreview();
  }
  function cropImageBlock(obj){ if(obj&&obj.type==='image')openImageCropModal('block',obj); }
  function safeMediaURL(raw){
    try{const url=new URL(String(raw||'').trim());if(!['http:','https:'].includes(url.protocol)||!url.hostname||url.username||url.password||url.href.length>2000)return '';return url.href;}catch(_){return '';}
  }
  function isVideoPlatformPageURL(raw){
    const safe=safeMediaURL(raw);if(!safe)return false;
    try{
      const url=new URL(safe),host=url.hostname.toLowerCase().replace(/^(www|m|music|vm)\./,'');
      const pageHosts=['youtube.com','youtube-nocookie.com','youtu.be','tiktok.com','instagram.com','facebook.com','fb.watch','vimeo.com','dailymotion.com','soundcloud.com','spotify.com','twitch.tv'];
      return pageHosts.some(domain=>host===domain||host.endsWith('.'+domain));
    }catch(_){return false;}
  }
  function normalizeAudioURL(raw){const safe=safeMediaURL(raw);return safe&&!isVideoPlatformPageURL(safe)?safe:'';}
  function audioURLFeedback(raw){
    const value=String(raw||'').trim();if(!value)return '';
    if(isVideoPlatformPageURL(value))return 'Esse é um link de página de vídeo/música, não um arquivo de áudio direto. O site não extrai nem separa áudio de vídeos do YouTube, TikTok ou outras plataformas. Para áudio somente, use um arquivo de áudio autorizado hospedado publicamente; para incorporar um vídeo, use o bloco Vídeo.';
    return normalizeAudioURL(value)?'URL aceita. A reprodução depende de o endereço servir diretamente um arquivo de áudio público compatível.':'Cole uma URL HTTP/HTTPS válida e direta para um arquivo de áudio público (MP3, M4A, WAV, OGG ou formato compatível).';
  }
  function openAudioModal(target=null){
    editingAudioObject=target||null;const modal=$('audio-modal'),title=$('audio-title'),url=$('audio-url'),save=$('save-audio'),player=$('audio-preview-player'),feedback=$('audio-url-feedback');if(!modal)return;
    if(title)title.textContent=target?'Editar áudio':'Adicionar áudio';if(save)save.textContent=target?'Salvar alterações':'Adicionar áudio';if(url)url.value=target?.dataAudioUrl||'';if(feedback)feedback.textContent='';if(player){player.pause();player.src=target?.dataAudioUrl||'';player.classList.toggle('hidden',!target?.dataAudioUrl);}
    modal.classList.remove('hidden');modal.setAttribute('aria-hidden','false');setTimeout(()=>url?.focus(),0);
  }
  function closeAudioModal(){const modal=$('audio-modal'),player=$('audio-preview-player');if(player){player.pause();player.removeAttribute('src');player.load();}modal?.classList.add('hidden');modal?.setAttribute('aria-hidden','true');editingAudioObject=null;}
  function openImageCropModal(kind,object=null){
    const modal=$('image-crop-modal'),stage=$('image-crop-stage'),image=$('image-crop-source'),selection=$('image-crop-selection');
    const src=kind==='cover'?String(coverURL||''):String(object?._element?.src||object?.src||'');
    if(!modal||!stage||!image||!selection||!src){setStatus(kind==='cover'?'Defina primeiro uma imagem de capa.':'Não foi possível localizar a imagem deste bloco.','warning');return;}
    cropEditorState={kind:kind==='cover'?'cover':'block',object,src,x:0,y:0,w:1,h:1,ratio:kind==='cover'?1.6:null,drag:null};
    const status=$('image-crop-status');if(status)status.textContent='Carregando imagem…';image.onload=()=>{
      if(!cropEditorState||cropEditorState.src!==src)return;
      const nw=image.naturalWidth||image.width||1,nh=image.naturalHeight||image.height||1;
      const maxW=Math.max(240,Math.min(900,window.innerWidth-48)),maxH=Math.max(200,Math.min(520,window.innerHeight*.56)),scale=Math.min(maxW/nw,maxH/nh);
      stage.style.width=`${Math.max(1,nw*scale)}px`;stage.style.height=`${Math.max(1,nh*scale)}px`;stage.dataset.naturalWidth=String(nw);stage.dataset.naturalHeight=String(nh);
      // Retain a previously applied block crop if present; otherwise begin with the full image.
      const previous=cropEditorState.kind==='block'?object?.dataCropFrame:null;
      if(previous&&[previous.x,previous.y,previous.width,previous.height].every(v=>Number.isFinite(Number(v)))){cropEditorState.x=Math.max(0,Number(previous.x));cropEditorState.y=Math.max(0,Number(previous.y));cropEditorState.w=Math.min(1-cropEditorState.x,Math.max(.04,Number(previous.width)));cropEditorState.h=Math.min(1-cropEditorState.y,Math.max(.04,Number(previous.height)));}
      else if(cropEditorState.ratio){const ratio= cropEditorState.ratio/(nw/nh);cropEditorState.w=Math.min(.8,ratio*.7);cropEditorState.h=Math.min(.8,cropEditorState.w/ratio);cropEditorState.x=(1-cropEditorState.w)/2;cropEditorState.y=(1-cropEditorState.h)/2;}
      else{cropEditorState.x=.08;cropEditorState.y=.08;cropEditorState.w=.84;cropEditorState.h=.84;}
      updateCropSelection();if(status)status.textContent=kind==='cover'?'Arraste o quadro e os cantos. O recorte da capa respeita a proporção dos cards.':'Arraste o quadro e os cantos para definir a parte visível da imagem.';
    };
    image.onerror=()=>{if(status)status.textContent='Não foi possível carregar essa imagem para o recorte. Verifique o link e as permissões de origem.';};
    image.src=src;modal.classList.remove('hidden');modal.setAttribute('aria-hidden','false');
  }
  function updateCropSelection(){
    const c=cropEditorState,selection=$('image-crop-selection');if(!c||!selection)return;
    selection.style.left=`${c.x*100}%`;selection.style.top=`${c.y*100}%`;selection.style.width=`${c.w*100}%`;selection.style.height=`${c.h*100}%`;
  }
  function closeImageCropModal(){const modal=$('image-crop-modal');if(modal){modal.classList.add('hidden');modal.setAttribute('aria-hidden','true');}cropEditorState=null;}
  function applyImageCrop(){
    const c=cropEditorState,stage=$('image-crop-stage');if(!c||!stage)return;
    const nw=Number(stage.dataset.naturalWidth)||0,nh=Number(stage.dataset.naturalHeight)||0;if(!nw||!nh)return;
    const x=Math.max(0,Math.min(.99,c.x)),y=Math.max(0,Math.min(.99,c.y)),w=Math.max(.01,Math.min(1-x,c.w)),h=Math.max(.01,Math.min(1-y,c.h));
    if(c.kind==='cover'){coverCrop={x,y,width:w,height:h};renderSitePreview();renderEditorInlinePreview();setStatus('Recorte da capa salvo na matéria.','success');}
    else if(c.object&&canvas?.getObjects().includes(c.object)){
      const obj=c.object,oldScaleX=Number(obj.scaleX)||1,oldScaleY=Number(obj.scaleY)||oldScaleX;obj.set({cropX:x*nw,cropY:y*nh,width:w*nw,height:h*nh,scaleX:oldScaleX,scaleY:oldScaleY});
      obj.set('dataCropFrame',{x,y,width:w,height:h});obj.set('dataCropSourceWidth',nw);obj.set('dataCropSourceHeight',nh);obj.set('dataCropped',true);obj.setCoords();canvas.setActiveObject(obj);canvas.requestRenderAll();growCanvas();renderMobileBlocks();renderSitePreview();setStatus('Recorte personalizado aplicado à imagem.','success');
    }
    closeImageCropModal();
  }
  const cropStage=$('image-crop-stage');
  if(cropStage&&!cropStage.dataset.fpBound){cropStage.dataset.fpBound='1';const selection=$('image-crop-selection');
    selection?.addEventListener('pointerdown',event=>{if(!cropEditorState)return;event.preventDefault();const handle=event.target.closest('[data-crop-handle]')?.dataset.cropHandle||'move';cropEditorState.drag={handle,startX:event.clientX,startY:event.clientY,x:cropEditorState.x,y:cropEditorState.y,w:cropEditorState.w,h:cropEditorState.h};selection.setPointerCapture?.(event.pointerId);});
    selection?.addEventListener('pointermove',event=>{const c=cropEditorState;if(!c?.drag)return;const dx=(event.clientX-c.drag.startX)/(cropStage.clientWidth||1),dy=(event.clientY-c.drag.startY)/(cropStage.clientHeight||1),d=c.drag,handle=d.handle;let x=d.x,y=d.y,w=d.w,h=d.h;
      if(handle==='move'){x=Math.max(0,Math.min(1-w,d.x+dx));y=Math.max(0,Math.min(1-h,d.y+dy));}
      else{let left=d.x,top=d.y,right=d.x+d.w,bottom=d.y+d.h;if(handle.includes('w'))left=Math.max(0,Math.min(right-.04,d.x+dx));if(handle.includes('e'))right=Math.min(1,Math.max(left+.04,d.x+d.w+dx));if(handle.includes('n'))top=Math.max(0,Math.min(bottom-.04,d.y+dy));if(handle.includes('s'))bottom=Math.min(1,Math.max(top+.04,d.y+d.h+dy));
        if(c.ratio){const naturalAspect=(Number(cropStage.dataset.naturalWidth)||1)/(Number(cropStage.dataset.naturalHeight)||1),ratio=c.ratio/naturalAspect;let newW=Math.max(.04,Math.min(1-left,right-left)),newH=newW/ratio;if(top+newH>1){newH=1-top;newW=newH*ratio;}if(handle.includes('w')){left=right-newW;}if(handle.includes('n')){top=bottom-newH;}else bottom=top+newH;if(!handle.includes('w'))right=left+newW;}
        x=left;y=top;w=Math.max(.04,right-left);h=Math.max(.04,bottom-top);
      }
      c.x=Math.max(0,Math.min(.99,x));c.y=Math.max(0,Math.min(.99,y));c.w=Math.max(.01,Math.min(1-c.x,w));c.h=Math.max(.01,Math.min(1-c.y,h));updateCropSelection();});
    const stop=()=>{if(cropEditorState)cropEditorState.drag=null;};selection?.addEventListener('pointerup',stop);selection?.addEventListener('pointercancel',stop);
  }
  function renderMobileBlocks(){
    const list=$('mobile-block-list');if(!list||!canvas)return;renderMobileMeta();
    const objects=mobileOrderedObjects();objects.forEach((o,i)=>{if(o.dataOrder===undefined||!Number.isFinite(Number(o.dataOrder)))o.set('dataOrder',i+1);});
    if(!objects.length){list.innerHTML='<div class="rounded-xl border border-dashed p-5 text-center text-sm editor-empty-blocks">Adicione texto, enquete, imagem ou vídeo usando o painel fixo de inserção.</div>';syncEditorRequirements();return;}
    const fontOptions=['Inter','Arial','Times New Roman','Georgia','Verdana','Trebuchet MS','Courier New','Montserrat','Merriweather','Tahoma','Roboto','Open Sans','Lato','Nunito','Oswald','Playfair Display','Source Sans 3','Raleway'];
    list.innerHTML=objects.map((o,i)=>{
      const orderControls=`<div class="editor-block-actions"><label class="sr-only" for="editor-order-${i}">Ordem do bloco</label><input id="editor-order-${i}" class="site-input editor-order-control" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="3" value="${i+1}" data-block-order="${i}" title="Ordem de apresentação" aria-label="Ordem de apresentação"><button type="button" class="editor-block-delete" data-block-delete="${i}" aria-label="Excluir bloco" title="Excluir bloco">×</button></div>`;
      if(['textbox','i-text','text'].includes(o.type)){
        const styleKey=textStyleKey(o),styleLabel=styleKey==='title'?'Título':styleKey==='subtitle'?'Subtítulo':'Normal';
        return `<article class="mobile-block-card editor-text-block-card" data-mobile-block="${i}"><div class="editor-block-topline"><div class="editor-block-name"><span class="editor-block-type-icon" aria-hidden="true">T</span><span class="editor-block-title-label">Texto ${i+1}</span><span class="editor-block-dot" aria-hidden="true">•</span><label class="sr-only" for="editor-block-style-${i}">Tipo do texto</label><select id="editor-block-style-${i}" class="editor-block-style-select" data-block-style="${i}" aria-label="Tipo do bloco de texto"><option value="body" ${styleKey==='body'?'selected':''}>Normal</option><option value="title" ${styleKey==='title'?'selected':''}>Título</option><option value="subtitle" ${styleKey==='subtitle'?'selected':''}>Subtítulo</option></select></div>${orderControls}</div><div class="editor-inline-toolbar" role="toolbar" aria-label="Formatação do bloco de texto ${i+1}"><label class="sr-only" for="editor-block-font-${i}">Fonte</label><select id="editor-block-font-${i}" class="editor-font-select" data-block-font="${i}" aria-label="Fonte">${fontOptions.map(f=>`<option ${String(o.fontFamily||'Inter')===f?'selected':''}>${escapeHTML(f)}</option>`).join('')}</select><span class="editor-toolbar-divider" aria-hidden="true"></span><button type="button" data-block-format="bold" data-block-index="${i}" aria-label="Negrito" title="Negrito" aria-pressed="${o.fontWeight==='bold'||Number(o.fontWeight)>=700}"><strong>B</strong></button><button type="button" data-block-format="italic" data-block-index="${i}" aria-label="Itálico" title="Itálico" aria-pressed="${o.fontStyle==='italic'}"><em>I</em></button><button type="button" data-block-format="underline" data-block-index="${i}" aria-label="Sublinhado" title="Sublinhado" aria-pressed="${Boolean(o.underline)}"><u>U</u></button><span class="editor-toolbar-divider" aria-hidden="true"></span><button type="button" data-block-format="bullets" data-block-index="${i}" title="Lista com marcadores" aria-label="Lista com marcadores">•</button><button type="button" data-block-format="numbers" data-block-index="${i}" title="Lista numerada" aria-label="Lista numerada">1.</button><span class="editor-toolbar-divider" aria-hidden="true"></span><button type="button" data-block-format="align-left" data-block-index="${i}" title="Alinhar à esquerda" aria-label="Alinhar à esquerda">☰</button><button type="button" data-block-format="align-center" data-block-index="${i}" title="Centralizar parágrafo" aria-label="Centralizar parágrafo">≡</button><button type="button" data-block-format="align-right" data-block-index="${i}" title="Alinhar à direita" aria-label="Alinhar à direita">☷</button><button type="button" data-block-format="link" data-block-index="${i}" title="Inserir link no trecho selecionado" aria-label="Inserir link">↗</button><button type="button" data-block-format="unlink" data-block-index="${i}" title="Remover link do trecho selecionado" aria-label="Remover link">⛓̸</button></div><div class="site-input editor-rich-text" contenteditable="true" role="textbox" aria-multiline="true" data-index="${i}" aria-label="Conteúdo do bloco de texto ${i+1}" data-placeholder="Digite o texto da matéria">${textObjectHTML(o)}</div></article>`;
      }
      if(o.type==='image'){
        const src=o._element?.src||o.src||'',percent=Math.max(1,Math.min(200,Number(o.dataImageScalePercent)||({small:50,medium:75,large:100}[o.dataImageSize]||100))),align=o.dataImageAlign||'left',crop=normalizedEditorCrop(o.dataCropFrame);
        const imagePreview=src?(crop?`<span class="fp-editor-crop-preview" style="aspect-ratio:${Math.max(.01,Number(crop.width)*Number(o.dataCropSourceWidth||o.width||1))/Math.max(.01,Number(crop.height)*Number(o.dataCropSourceHeight||o.height||1))}"><img src="${escapeHTML(src)}" alt="Prévia do recorte da imagem ${i+1}" style="width:${100/crop.width}%!important;height:${100/crop.height}%!important;left:${-crop.x/crop.width*100}%!important;top:${-crop.y/crop.height*100}%!important;max-width:none!important;max-height:none!important;object-fit:fill!important;"></span>`:`<img src="${escapeHTML(src)}" alt="Prévia da imagem do bloco ${i+1}" class="editor-image-block-preview">`):'';
        return `<article class="mobile-block-card" data-mobile-block="${i}"><div class="editor-block-topline"><div class="editor-block-name"><span class="editor-block-type-icon" aria-hidden="true">▧</span><span>Imagem ${i+1}</span></div>${orderControls}</div>${imagePreview}<div class="editor-image-toolbar"><button type="button" class="btn-soft" data-image-change="${i}">Trocar imagem</button><button type="button" class="btn-neutral fp-v138-image-html-button" data-image-html-paste="${i}" aria-label="Colar HTML da imagem ${i+1}" title="Colar HTML da imagem">HTML</button><label class="sr-only" for="editor-image-size-${i}">Tamanho da imagem em porcentagem</label><span class="editor-image-percent-field"><input class="site-input editor-image-percent" id="editor-image-size-${i}" type="number" inputmode="numeric" min="1" max="200" step="1" value="${Math.round(percent)}" data-image-size="${i}" aria-label="Tamanho da imagem em porcentagem, de 1 a 200"><span aria-hidden="true">%</span></span><select class="site-input" data-image-align="${i}" aria-label="Alinhamento da imagem"><option value="left" ${align==='left'?'selected':''}>Esquerda</option><option value="center" ${align==='center'?'selected':''}>Centro</option><option value="right" ${align==='right'?'selected':''}>Direita</option></select><button type="button" class="btn-neutral" data-image-crop="${i}">Ajustar recorte</button></div></article>`;
      }
      if(o.dataType==='audio'){return `<article class="mobile-block-card" data-mobile-block="${i}"><div class="editor-block-topline"><div class="editor-block-name"><span class="editor-block-type-icon" aria-hidden="true">♫</span><span>Áudio ${i+1}</span></div>${orderControls}</div><audio class="w-full" controls preload="metadata" src="${escapeHTML(o.dataAudioUrl||'')}"></audio><div class="editor-image-toolbar"><button type="button" class="btn-soft" data-audio-change="${i}">Mudar link</button></div></article>`;}
      if(o.dataType==='poll'&&o.dataPoll){const poll=o.dataPoll;return `<article class="mobile-block-card" data-mobile-block="${i}"><div class="editor-block-topline"><div class="editor-block-name"><span class="editor-block-type-icon" aria-hidden="true">▣</span><span>Enquete ${i+1}</span></div>${orderControls}</div><div class="editor-poll-mini-preview"><h4>${escapeHTML(poll.title||'Pergunta da enquete')}</h4><p>${escapeHTML(poll.kindLabel||'Escolha única')} · ${(poll.options||[]).length} opções</p><div class="editor-poll-mini-options">${(poll.options||[]).map(v=>`<span>${escapeHTML(v)}</span>`).join('')}</div></div><div class="flex justify-end"><button type="button" class="btn-soft" data-mobile-edit-poll="${i}">Ajustar enquete</button></div></article>`;}
      if(o.dataType==='video'){
        const normalized=normalizeVideoURL(o.dataVideoUrl||'');return `<article class="mobile-block-card" data-mobile-block="${i}"><div class="editor-block-topline"><div class="editor-block-name"><span class="editor-block-type-icon" aria-hidden="true">▶</span><span>Vídeo ${i+1}</span></div>${orderControls}</div>${normalized?`<iframe class="editor-video-preview" src="${escapeHTML(normalized)}" title="Prévia do vídeo ${i+1}" loading="lazy" allowfullscreen></iframe>`:`<p class="editor-muted">Nenhum link válido associado ao bloco.</p>`}<div class="editor-image-toolbar"><button type="button" class="btn-soft" data-video-change="${i}">Mudar link</button></div></article>`;
      }
      return `<article class="mobile-block-card" data-mobile-block="${i}"><div class="editor-block-topline"><div class="editor-block-name"><span class="editor-block-type-icon" aria-hidden="true">▤</span><span>Bloco ${i+1}</span></div>${orderControls}<p class="editor-muted">Bloco compatível mantido do editor anterior.</p></article>`;
    }).join('');

    list.querySelectorAll('.editor-rich-text').forEach(editor=>{
      const idx=Number(editor.dataset.index),obj=objects[idx];if(!obj)return;
      const remember=()=>saveRichEditorSelection(editor);
      editor.addEventListener('beforeinput',event=>{
        if(event.isComposing)return;
        if(event.inputType==='insertParagraph'||event.inputType==='insertLineBreak'){
          const selection=window.getSelection(),range=selection?.rangeCount?selection.getRangeAt(0):null;
          if(!range||!editor.contains(range.commonAncestorContainer)||richEditorSelectionInsideList(editor,range))return;
          event.preventDefault();
          if(insertRichEditorNewline(editor)){
            const inputEvent=typeof InputEvent==='function'?new InputEvent('input',{bubbles:true,inputType:event.inputType}):new Event('input',{bubbles:true});
            editor.dispatchEvent(inputEvent);
          }
          return;
        }
        if(event.inputType!=='insertText'||event.data==null)return;
        const pending=editor.__fpPendingMarks;
        if(!pending||!Object.keys(pending).length)return;
        restoreRichEditorSelection(editor);
        if(!getRichEditorCaret(editor))return;
        event.preventDefault();
        if(insertTextWithPendingStyle(editor,event.data)){
          const inputEvent=typeof InputEvent==='function'?new InputEvent('input',{bubbles:true,inputType:'insertText',data:event.data}):new Event('input',{bubbles:true});
          editor.dispatchEvent(inputEvent);
        }
      });
      editor.addEventListener('paste',event=>{
        const clipboard=event.clipboardData;
        if(!clipboard)return;
        const clipboardText=clipboard.getData('text/plain');
        // Always prevent rich HTML paste so source formatting is not imported.
        event.preventDefault();
        if(clipboardText==null||clipboardText===''){
          setStatus('Este campo recebe texto. Copie o conteúdo como texto simples e tente novamente.','warning');
          return;
        }
        let selection=window.getSelection(),range=selection?.rangeCount?selection.getRangeAt(0):null;
        if(!range||!editor.contains(range.commonAncestorContainer)){
          restoreRichEditorSelection(editor);selection=window.getSelection();range=selection?.rangeCount?selection.getRangeAt(0):null;
        }
        if(!range||!editor.contains(range.commonAncestorContainer)){
          setStatus('Clique no ponto do texto onde deseja colar e tente novamente.','warning');
          return;
        }
        if(!range.collapsed){range.deleteContents();range.collapse(true);selection.removeAllRanges();selection.addRange(range);}
        const plainText=String(clipboardText).replace(/\r\n?/g,'\n');
        const pasteStyle=richEditorPasteStyle(editor,obj);
        if(insertTextWithPendingStyle(editor,plainText,pasteStyle)){
          delete editor.__fpPastePreset;
          const inputEvent=typeof InputEvent==='function'?new InputEvent('input',{bubbles:true,inputType:'insertFromPaste',data:plainText}):new Event('input',{bubbles:true});
          editor.dispatchEvent(inputEvent);
        }
      });
      editor.addEventListener('input',()=>syncRichEditorToObject(editor,obj));
      editor.addEventListener('keyup',remember);editor.addEventListener('mouseup',remember);editor.addEventListener('focus',remember);editor.addEventListener('blur',()=>syncRichEditorToObject(editor,obj));
    });
    list.querySelectorAll('[data-block-style]').forEach(sel=>{
      const idx=Number(sel.dataset.blockStyle),editor=list.querySelector(`.editor-rich-text[data-index="${idx}"]`),obj=mobileOrderedObjects()[idx];if(!editor||!obj)return;
      // Pointer/touch events run before a mobile select steals focus; retain mouse fallback.
      sel.addEventListener('pointerdown',()=>saveRichEditorSelection(editor));
      sel.addEventListener('mousedown',()=>saveRichEditorSelection(editor));
      sel.addEventListener('touchstart',()=>saveRichEditorSelection(editor),{passive:true});
      sel.addEventListener('focus',()=>saveRichEditorSelection(editor));
      sel.addEventListener('change',()=>{
        const key=sel.value,preset=TEXT_STYLES[key]||TEXT_STYLES.body;
        editor.__fpPastePreset=key;
        restoreRichEditorSelection(editor);
        const range=getRichEditorSelection(editor),caret=getRichEditorCaret(editor);
        if(range){
          const ok=wrapRichEditorSelection(editor,{fontSize:preset.fontSize,fontWeight:preset.fontWeight});
          if(!ok){setStatus('Não foi possível aplicar o estilo ao trecho selecionado.','warning');return;}
          syncRichEditorToObject(editor,obj);obj.setCoords();canvas.requestRenderAll();growCanvas();renderSitePreview();
          // Do not rerender this card here: that would discard the live selection/caret.
          setStatus(`Estilo ${preset.label} aplicado ao trecho selecionado.`,'success');return;
        }
        if(caret){
          const pending=pendingStyleObject(editor);pending.fontSize=preset.fontSize;pending.fontWeight=preset.fontWeight;
          setStatus(`O estilo ${preset.label} será aplicado ao próximo texto digitado ou colado.`,'success');return;
        }
        // Without a selection or caret, keep the established whole-block behavior.
        removeBlockSizeOverrides(obj);
        obj.set({dataTextStyle:key,fontSize:preset.fontSize,fontWeight:String(preset.fontWeight)});
        obj.setCoords();canvas.requestRenderAll();growCanvas();
        editor.innerHTML=textObjectHTML(obj);delete editor.__fpPendingMarks;delete editor.__fpSavedRange;
        renderMobileBlocks();renderSitePreview();syncTextControls();
        setStatus(`Estilo ${preset.label} aplicado ao bloco inteiro.`,'success');
      });
    });
    list.querySelectorAll('[data-block-font]').forEach(sel=>{
      const idx=Number(sel.dataset.blockFont);const editor=list.querySelector(`.editor-rich-text[data-index="${idx}"]`),obj=mobileOrderedObjects()[idx];if(!editor||!obj)return;
      // Pointer/touch events run before a mobile select steals focus; retain mouse fallback.
      sel.addEventListener('pointerdown',()=>saveRichEditorSelection(editor));
      sel.addEventListener('mousedown',()=>saveRichEditorSelection(editor));
      sel.addEventListener('touchstart',()=>saveRichEditorSelection(editor),{passive:true});
      sel.addEventListener('focus',()=>saveRichEditorSelection(editor));
      sel.addEventListener('change',()=>{
        restoreRichEditorSelection(editor);
        const range=getRichEditorSelection(editor),caret=getRichEditorCaret(editor);
        if(range){const ok=wrapRichEditorSelection(editor,{fontFamily:sel.value});if(!ok){setStatus('Não foi possível aplicar a fonte ao trecho.','warning');return;}syncRichEditorToObject(editor,obj);setStatus('Fonte aplicada ao trecho selecionado.','success');return;}
        if(caret){pendingStyleObject(editor).fontFamily=sel.value;setStatus('A nova fonte será usada ao continuar digitando.','success');return;}
        obj.set('fontFamily',sel.value);obj.setCoords();canvas.requestRenderAll();editor.innerHTML=textObjectHTML(obj);renderMobileBlocks();renderSitePreview();syncTextControls();setStatus('Fonte aplicada ao bloco inteiro.','success');
      });
    });
    list.querySelectorAll('[data-block-format]').forEach(button=>{
      const idx=Number(button.dataset.blockIndex),editor=list.querySelector(`.editor-rich-text[data-index="${idx}"]`),obj=mobileOrderedObjects()[idx];if(!editor||!obj)return;
      button.addEventListener('mousedown',event=>{saveRichEditorSelection(editor);event.preventDefault();});
      button.addEventListener('click',()=>applyRichEditorCommand(editor,obj,button.dataset.blockFormat,button));
    });
    list.querySelectorAll('[data-block-order]').forEach(inp=>{
      inp.addEventListener('input',()=>{inp.value=inp.value.replace(/[^0-9]/g,'').slice(0,3);});
      inp.addEventListener('change',()=>{const idx=Number(inp.dataset.blockOrder),obj=mobileOrderedObjects()[idx];if(obj&&inp.value.trim())moveBlockToOrder(obj,inp.value);});
      inp.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();inp.blur();}});
    });
    list.querySelectorAll('[data-block-delete]').forEach(btn=>btn.addEventListener('click',()=>{const obj=mobileOrderedObjects()[Number(btn.dataset.blockDelete)];deleteBlockWithConfirmation(obj);}));
    list.querySelectorAll('[data-mobile-edit-poll]').forEach(btn=>btn.addEventListener('click',()=>{const obj=mobileOrderedObjects()[Number(btn.dataset.mobileEditPoll)];if(obj)editPollObject(obj);}));
    list.querySelectorAll('[data-image-change]').forEach(btn=>btn.addEventListener('click',()=>{const obj=mobileOrderedObjects()[Number(btn.dataset.imageChange)];if(obj)openMobileEditorForObject(obj);}));
    list.querySelectorAll('[data-image-html-paste]').forEach(btn=>btn.addEventListener('click',()=>{const obj=mobileOrderedObjects()[Number(btn.dataset.imageHtmlPaste)];if(obj)openImageHTMLModal('block',obj);}));
    list.querySelectorAll('[data-image-size]').forEach(sel=>{const apply=()=>{const value=Number(sel.value);if(!Number.isFinite(value)||value<1||value>200){sel.setCustomValidity('Informe um valor entre 1 e 200.');sel.reportValidity();return;}sel.setCustomValidity('');const obj=mobileOrderedObjects()[Number(sel.dataset.imageSize)];if(obj)setImageBlockSize(obj,value);};sel.addEventListener('change',apply);sel.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();apply();}});});
    list.querySelectorAll('[data-image-align]').forEach(sel=>sel.addEventListener('change',()=>{const obj=mobileOrderedObjects()[Number(sel.dataset.imageAlign)];if(!obj)return;obj.set('dataImageAlign',sel.value);const width=obj.getScaledWidth?.()||680;obj.set('left',sel.value==='center'?Math.max(24,(800-width)/2):sel.value==='right'?Math.max(24,800-width-24):56);obj.setCoords();canvas.requestRenderAll();renderMobileBlocks();renderSitePreview();}));
    list.querySelectorAll('[data-image-crop]').forEach(btn=>btn.addEventListener('click',()=>{const obj=mobileOrderedObjects()[Number(btn.dataset.imageCrop)];if(obj)cropImageBlock(obj);}));
    list.querySelectorAll('[data-video-change]').forEach(btn=>btn.addEventListener('click',()=>{const obj=mobileOrderedObjects()[Number(btn.dataset.videoChange)];if(obj)openMobileEditorForObject(obj);}));
    list.querySelectorAll('[data-audio-change]').forEach(btn=>btn.addEventListener('click',()=>{const obj=mobileOrderedObjects()[Number(btn.dataset.audioChange)];if(obj)openMobileEditorForObject(obj);}));
    bindMobileBlockGestures();syncEditorRequirements();
  }
  function openMobileEditorForObject(obj){
    if(!obj||!canvas)return;
    if(["textbox","i-text","text"].includes(obj.type)){
      const index=mobileOrderedObjects().indexOf(obj),card=$("mobile-block-list")?.querySelector(`[data-mobile-block="${index}"]`),textarea=card?.querySelector("textarea");
      if(textarea){textarea.focus();textarea.select();}else{canvas.setActiveObject(obj);obj.enterEditing?.();obj.selectAll?.();}
      return;
    }
    if(obj.type==='image'){mobileImageEditObject=obj;setStatus("Escolha a nova imagem para esta seção.","info");$("image-upload")?.click();return;}
    if(obj.dataType==='video'){
      editingVideoObject=obj;$("video-title").textContent="Editar vídeo";$("save-video").textContent="Salvar alterações";$("video-url").value=obj.dataVideoUrl||videoUrl||"";
      const normalized=normalizeVideoURL($("video-url").value);if(normalized){$("video-preview-frame").src=normalized;$("video-preview").classList.remove("hidden");$("video-url-feedback").textContent="Vídeo vinculado a esta seção.";}else{$("video-preview").classList.add("hidden");}
      $("video-modal").classList.remove("hidden");$("video-url").focus();return;
    }
    if(obj.dataType==='audio'){openAudioModal(obj);return;}
    if(obj.dataType==='poll')editPollObject(obj);
  }
  function bindMobileBlockGestures(){
    const list=$("mobile-block-list");if(!list)return;
    list.querySelectorAll("[data-mobile-block]").forEach(card=>{
      let pointerId=null,startY=0,lastY=0,moved=false,lastTap=0;
      card.addEventListener("pointerdown",e=>{if(e.target.closest("input,textarea,select,button,a,[contenteditable=\"true\"]"))return;pointerId=e.pointerId;startY=lastY=e.clientY;moved=false;card.setPointerCapture?.(pointerId);});
      card.addEventListener("pointermove",e=>{if(pointerId!==e.pointerId)return;lastY=e.clientY;if(Math.abs(lastY-startY)>10)moved=true;if(Math.abs(lastY-startY)>=34){const index=Number(card.dataset.mobileBlock),dir=lastY<startY?-1:1;swapMobileObjectOrder(index,dir);startY=lastY;moved=true;}});
      card.addEventListener("pointerup",e=>{if(pointerId!==e.pointerId)return;pointerId=null;if(moved)return;const now=Date.now();if(now-lastTap<380){const index=Number(card.dataset.mobileBlock),obj=mobileOrderedObjects()[index];if(obj)openMobileEditorForObject(obj);lastTap=0;}else lastTap=now;});
      card.addEventListener("pointercancel",()=>{pointerId=null;});
      card.addEventListener("dblclick",e=>{if(e.target.closest("input,textarea,select,button,a,[contenteditable=\"true\"]"))return;const index=Number(card.dataset.mobileBlock),obj=mobileOrderedObjects()[index];if(obj)openMobileEditorForObject(obj);});
    });
  }
  function mobileAppendText(style='body',initial='Digite o texto'){addText();const o=canvas?.getActiveObject();if(o){const p=TEXT_STYLES[style]||TEXT_STYLES.body;o.text=initial;o.set({fontSize:p.fontSize,fontWeight:p.fontWeight});o.set('dataTextStyle',style);o.setCoords();canvas.requestRenderAll();growCanvas();renderMobileBlocks();renderSitePreview();}}
  function mobileAddImage(){mobileImageEditObject=null;$("image-upload")?.click();}

  function updateCanvasViewport(){
    if(!canvas) return;
    const mobile=window.matchMedia("(max-width: 1023px)").matches;
    const host=$("canvas-shell");
    const available=Math.max(280,Math.min(800,(host?.parentElement?.clientWidth||window.innerWidth)-16));
    const zoom=Math.min(1,available/800);
    const height=canvas.getHeight();
    canvas.setZoom(zoom);
    canvas.setDimensions({width:800*zoom,height:height*zoom});
    canvas.calcOffset();
    host?.classList.toggle("mobile-editor-canvas",mobile);
    document.body.classList.toggle("mobile-editor-mode",mobile);
  }

  function addInteractiveCard(dataType, data) {
    if(!canvas) return;
    const width=680, height=300;
    const bg=new fabric.Rect({left:0,top:0,width,height,rx:18,ry:18,fill:'#F2F7F3',stroke:'#B8C8BA',strokeWidth:1,originX:'left',originY:'top'});
    const title=new fabric.Textbox(data.title||'Enquete',{left:24,top:20,width:width-48,fontFamily:'Inter',fontSize:26,fontWeight:'800',fill:'#1A1D1A'});
    const typeLabel=new fabric.Textbox(`Enquete · ${data.kindLabel}`,{left:24,top:62,width:width-48,fontFamily:'Inter',fontSize:14,fontWeight:'600',fill:'#1A1D1A'});
    const info=new fabric.Textbox(`${data.options.length} opções · votação interativa`,{left:24,top:105,width:width-48,fontFamily:'Inter',fontSize:18,fontWeight:'400',fill:'#1A1D1A'});
    const hint=new fabric.Textbox('Prévia aproximada do bloco que o leitor verá',{left:24,top:170,width:width-48,fontFamily:'Inter',fontSize:13,fontWeight:'600',fill:'#4F5B53'});
    [bg,title,typeLabel,info,hint].forEach(child=>{child.selectable=false;child.evented=false;}); const group=new fabric.Group([bg,title,typeLabel,info,hint],{left:60,top:nextContentTop(),selectable:true,evented:true,subTargetCheck:false,hasControls:true,hasBorders:true});
    group.set('dataType',dataType);
    group.set('dataOrder',canvas.getObjects().length+1);
    if(dataType==='poll')group.set('dataPoll',data);
    canvas.add(group).setActiveObject(group);canvas.requestRenderAll();growCanvas();renderMobileBlocks();renderSitePreview();
  }
  let pollOptions=['Excelente','Bom','Regular','Precisa melhorar'];
  let editingPollObject=null;
  function pollModalRender(){
    const type=$("poll-type")?.value||'single',list=$("poll-options-list"),editor=$("poll-options-editor"),preview=$("poll-live-preview");if(!list||!editor||!preview)return;
    const fixedMode=type==='yesno'||type==='rating';
    const visibleOptions=type==='yesno'?['Sim','Não']:type==='rating'?['0','1','2','3','4','5']:(pollOptions.length?pollOptions.slice(0,5):['Excelente','Bom','Regular','Precisa melhorar']);
    editor.classList.toggle('hidden',fixedMode);
    if(!fixedMode)pollOptions=visibleOptions.slice();
    // Tipos predefinidos não substituem as opções manuais: ao trocar novamente
    // para escolha única/múltipla, as opções anteriores continuam disponíveis.
    list.innerHTML=fixedMode?'':visibleOptions.map((x,i)=>`<div class="flex gap-2"><input class="site-input poll-option-input" data-index="${i}" maxlength="80" value="${escapeHTML(x)}"><button type="button" class="btn-neutral rounded-lg px-3" data-remove-poll-option="${i}" aria-label="Remover opção">×</button></div>`).join('');
    list.querySelectorAll('.poll-option-input').forEach(inp=>inp.addEventListener('input',()=>{pollOptions=[...list.querySelectorAll('.poll-option-input')].map(x=>x.value);renderPollLivePreview();}));
    list.querySelectorAll('[data-remove-poll-option]').forEach(btn=>btn.onclick=()=>{if(pollOptions.length<=2)return setStatus('A enquete precisa de pelo menos duas opções.','warning');pollOptions.splice(Number(btn.dataset.removePollOption),1);pollModalRender();});
    renderPollLivePreview();
  }
  function renderPollLivePreview(){
    const box=$("poll-live-preview");if(!box)return;const type=$("poll-type")?.value||'single',question=$("poll-question")?.value.trim()||'Sua pergunta aparecerá aqui',options=type==='yesno'?['Sim','Não']:type==='rating'?['0','1','2','3','4','5']:pollOptions.filter(Boolean);
    box.innerHTML=`<section class="news-poll"><div class="poll-heading"><span class="poll-badge">ENQUETE</span><span class="poll-kind">${escapeHTML({single:'Escolha única',multi:'Múltiplas escolhas',yesno:'Sim / Não',rating:'Nota de 0 a 5'}[type])}</span></div><h3>${escapeHTML(question)}</h3><p class="poll-help">${type==='multi'?'Você pode marcar mais de uma opção.':type==='rating'?'Escolha uma nota de 0 a 5.':'Escolha uma opção.'}</p><div class="poll-options">${options.map(x=>`<button type="button"><span class="poll-option-marker"></span><span>${escapeHTML(x)}</span></button>`).join('')}</div></section>`;
  }
  function setPollModalEditingState(editing){const title=$("poll-title"),save=$("save-poll");if(title)title.textContent=editing?'Editar enquete':'Criar enquete';if(save)save.textContent=editing?'Salvar alterações':'Inserir enquete na matéria';}
  function openPollModal(){editingPollObject=null;pollOptions=['Excelente','Bom','Regular','Precisa melhorar'];$("poll-question").value='';$("poll-type").value='single';setPollModalEditingState(false);pollModalRender();$("poll-modal").classList.remove('hidden');$("poll-question").focus();}
  function savePollFromModal(){
    const save=$("save-poll");if(save?.dataset.busy==='1')return;if(save)save.dataset.busy='1';
    const type=$("poll-type").value,title=$("poll-question").value.trim(),options=type==='yesno'?['Sim','Não']:type==='rating'?['0','1','2','3','4','5']:pollOptions.map(x=>x.trim()).filter(Boolean);
    if(!title){if(save)delete save.dataset.busy;return setStatus('Informe a pergunta da enquete.','warning');}
    if(options.length<2){if(save)delete save.dataset.busy;return setStatus('A enquete precisa de pelo menos duas opções.','warning');}
    if(!['yesno','rating'].includes(type)&&options.length>5){if(save)delete save.dataset.busy;return setStatus('A enquete pode ter no máximo cinco opções.','warning');}
    const labels={single:'Escolha única',multi:'Múltiplas escolhas',yesno:'Sim / Não',rating:'Nota de 0 a 5'},data={title,kind:type,kindLabel:labels[type],options};
    if(editingPollObject){
      const obj=editingPollObject;obj.set('dataPoll',data);const texts=obj.getObjects?.()||[],titleObj=texts[1],labelObj=texts[2],infoObj=texts[3];
      if(titleObj)titleObj.set('text',title);if(labelObj)labelObj.set('text',`Enquete · ${labels[type]}`);if(infoObj)infoObj.set('text',`${options.length} opções · votação interativa`);obj.addWithUpdate?.();obj.setCoords();canvas.requestRenderAll();growCanvas();renderMobileBlocks();renderSitePreview();editingPollObject=null;setStatus('Enquete atualizada.','success');
    }else{addInteractiveCard('poll',data);setStatus('Enquete inserida. Você pode movê-la pela área de diagramação.','success');}
    $("poll-modal").classList.add('hidden');setPollModalEditingState(false);if(save)window.setTimeout(()=>delete save.dataset.busy,0);
  }
  function editPollObject(obj){if(!obj?.dataPoll)return;editingPollObject=obj;const p=obj.dataPoll;pollOptions=['yesno','rating'].includes(p.kind)?['Excelente','Bom','Regular','Precisa melhorar']:[...(p.options||[])].slice(0,5);$("poll-question").value=p.title||'';$("poll-type").value=p.kind||'single';setPollModalEditingState(true);pollModalRender();$("poll-modal").classList.remove('hidden');$("poll-question").focus();}

  async function init() {
    setupEditorAccessibility();
    if(!(await refreshEditorSession())) return;
    if (fpCloudEnabled() && session.uid && window.FPStore?.syncEditorialArticles) {
      try { await window.FPCloud.waitForAuth?.(); await window.FPStore.syncEditorialArticles(session.uid, session.role); }
      catch (error) { setStatus(error?.message || "Não foi possível sincronizar as matérias com o Firebase.", "warning"); return; }
    }
    if (!window.fabric) {
      setStatus("O editor não carregou. Verifique a conexão e recarregue a página.", "warning");
      return;
    }
    if(!editingIdFromURL){
      try{assertSingleOpenArticle('');}catch(error){setStatus(error?.message||'Já existe uma matéria pendente.','warning');redirectToStudentArea(error?.message||'Você já possui uma matéria em aberto.');return;}
    }

    canvas = new fabric.Canvas("news-canvas", {
      width: 800,
      height: 1000,
      backgroundColor: "#FFFFFF",
      preserveObjectStacking: true,
      selection: true,
      stopContextMenu: true
    });

    // Nunca redimensionamos o canvas durante um gesto Fabric. Isso preserva a referência
    // do ponteiro e evita o objeto "grudar" no mouse. O crescimento ocorre somente depois.
    // Fabric must keep pointer coordinates stable during a gesture. Never resize the
    // canvas while moving/scaling/rotating and never latch a gesture on mouse:down.
    canvas.on("object:moving", () => {});
    canvas.on("object:scaling", () => {});
    canvas.on("object:rotating", () => {});
    canvas.on("object:modified", () => { growCanvas(); renderMobileBlocks(); renderSitePreview(); });
    canvas.on("mouse:up", () => { renderSitePreview(); });
    canvas.on("mouse:dblclick", event => { if(event.target?.dataType === "poll") editPollObject(event.target); });
    canvas.on("object:added", () => { if (!initialLoading) growCanvas(); });
    canvas.on("object:removed", () => { growCanvas(); renderMobileBlocks(); renderSitePreview(); });
    canvas.on("selection:created", ()=>{syncTextControls();renderMobileBlocks();});
    canvas.on("selection:updated", ()=>{syncTextControls();renderMobileBlocks();});
    canvas.on("selection:cleared", ()=>{syncTextControls();renderMobileBlocks();});
    canvas.on("text:selection:changed", syncTextControls);
    canvas.on("text:changed", () => { syncTextControls(); renderSitePreview(); });

    $("add-text")?.addEventListener("click", addText);
    $("add-image-button")?.addEventListener("click", () => { mobileImageEditObject=null; openImageSourceChoice(null); });
    $("image-upload")?.addEventListener("change", async event => {
      const file=event.target.files?.[0];
      if(mobileImageEditObject&&file&&canvas){
        const target=mobileImageEditObject;mobileImageEditObject=null;
        try{const src=await imageDataURL(file,1400,.78);fabric.Image.fromURL(src,image=>{if(!image)return;const imageSize=target.dataImageSize||'large',imageAlign=target.dataImageAlign||'left';image.set({left:target.left,top:target.top,angle:target.angle,originX:target.originX||'left',originY:target.originY||'top',transparentCorners:false,cornerStyle:'circle',selectable:true,evented:true});image.set('dataType','image');image.set('dataOrder',Number.isFinite(Number(target.dataOrder))?Number(target.dataOrder):Math.max(1,mobileOrderedObjects().indexOf(target)+1));image.set('dataImageSize',imageSize);image.set('dataImageAlign',imageAlign);image.set('dataCropped',false);canvas.remove(target);canvas.add(image).setActiveObject(image);setImageBlockSize(image,imageSize);canvas.requestRenderAll();growCanvas();renderMobileBlocks();renderSitePreview();setStatus('Imagem atualizada.','success');});}catch(_){setStatus('Não foi possível atualizar a imagem.','warning');}
      }else addImage(file);
      event.target.value = "";
    });
    $("cover-button")?.addEventListener("click", () => $("cover-upload").click());
    $("cover-upload")?.addEventListener("change", event => { addCover(event.target.files?.[0]); event.target.value = ""; });
    $("remove-cover")?.addEventListener("click", removeCover);
    $("paste-cover-html")?.addEventListener("click",()=>openImageHTMLModal('cover'));
    $("adjust-cover-crop")?.addEventListener("click",()=>openImageCropModal('cover'));
    $("image-crop-close")?.addEventListener("click",closeImageCropModal);$("image-crop-cancel")?.addEventListener("click",closeImageCropModal);$("image-crop-apply")?.addEventListener("click",applyImageCrop);$("image-crop-reset")?.addEventListener("click",()=>{if(!cropEditorState)return;cropEditorState.x=0;cropEditorState.y=0;cropEditorState.w=1;cropEditorState.h=1;if(cropEditorState.ratio){const stage=$("image-crop-stage"),aspect=(Number(stage?.dataset.naturalWidth)||1)/(Number(stage?.dataset.naturalHeight)||1),ratio=cropEditorState.ratio/aspect;cropEditorState.w=Math.min(.95,ratio*.95);cropEditorState.h=Math.min(.95,cropEditorState.w/ratio);cropEditorState.x=(1-cropEditorState.w)/2;cropEditorState.y=(1-cropEditorState.h)/2;}updateCropSelection();});$("image-crop-modal")?.addEventListener("click",event=>{if(event.target===$("image-crop-modal"))closeImageCropModal();});
    $("image-source-choice-device")?.addEventListener("click",()=>{const target=imageSourceChoiceTarget;closeImageSourceChoice();mobileImageEditObject=target||null;$('image-upload')?.click();});
    $("image-source-choice-html")?.addEventListener("click",()=>{const target=imageSourceChoiceTarget;closeImageSourceChoice();mobileImageEditObject=null;openImageHTMLModal('block',target);});
    $("image-source-choice-close")?.addEventListener("click",closeImageSourceChoice);
    $("image-source-choice-modal")?.addEventListener("click",event=>{if(event.target===$("image-source-choice-modal"))closeImageSourceChoice();});
    document.addEventListener("keydown",event=>{if(event.key==='Escape'&&!$('image-source-choice-modal')?.classList.contains('hidden'))closeImageSourceChoice();});
    $("image-html-modal-apply")?.addEventListener("click",()=>void applyImageHTMLModal());
    $("image-html-modal-cancel")?.addEventListener("click",closeImageHTMLModal);
    $("image-html-modal-close")?.addEventListener("click",closeImageHTMLModal);
    $("image-html-modal")?.addEventListener("click",event=>{if(event.target===$("image-html-modal"))closeImageHTMLModal();});
    document.addEventListener("keydown",event=>{if(event.key==='Escape'&&!$("image-html-modal")?.classList.contains('hidden'))closeImageHTMLModal();});

    $("bring-front")?.addEventListener("click", bringFront);
    $("send-back")?.addEventListener("click", sendBack);
    $("delete-object")?.addEventListener("click", deleteSelected);

    $("font-family")?.addEventListener("change", event => applySelectedText("fontFamily", event.target.value));
    $("text-style-title")?.addEventListener("click",()=>applyTextPreset("title"));
    $("text-style-subtitle")?.addEventListener("click",()=>applyTextPreset("subtitle"));
    $("text-style-body")?.addEventListener("click",()=>applyTextPreset("body"));
    $("bold")?.addEventListener("click", () => { const o=selectedTextObject(); if(o){ const active=($("bold").getAttribute("aria-pressed")==="true"); applySelectedText("fontWeight", active ? "normal" : "bold"); } });
    $("italic")?.addEventListener("click", () => { const o=selectedTextObject(); if(o){ const active=($("italic").getAttribute("aria-pressed")==="true"); applySelectedText("fontStyle", active ? "normal" : "italic"); } });
    $("align-left")?.addEventListener("click", () => applyWholeText("textAlign", "left"));
    $("align-center")?.addEventListener("click", () => applyWholeText("textAlign", "center"));
    $("align-right")?.addEventListener("click", () => applyWholeText("textAlign", "right"));

    $("add-poll")?.addEventListener("click", openPollModal);
    if($( "save-poll")?.dataset.bound!=="1"){$("save-poll").dataset.bound="1";$("save-poll").addEventListener("click",savePollFromModal);}
    $("quick-poll")?.addEventListener("click", openPollModal);
    $("close-poll-modal")?.addEventListener("click",()=>$("poll-modal")?.classList.add("hidden"));
    $("poll-type")?.addEventListener("change",pollModalRender);
    $("poll-question")?.addEventListener("input",renderPollLivePreview);
    $("poll-add-option")?.addEventListener("click",()=>{if(pollOptions.length>=5)return setStatus("A enquete pode ter no máximo 5 opções.","warning");pollOptions.push(`Opção ${pollOptions.length+1}`);pollModalRender();});
    $("add-video")?.addEventListener("click", () => {
      editingVideoObject=null;
      $("video-title").textContent="Adicionar vídeo";
      $("save-video").textContent="Vincular vídeo";
      const hasVideoBlock=Boolean(canvas?.getObjects().some(o=>o.dataType==='video'));
      const initialVideoUrl=hasVideoBlock?'':videoUrl;
      $("video-url").value = initialVideoUrl || "";
      if (initialVideoUrl) {
        $("video-preview-frame").src = videoUrl;
        $("video-preview").classList.remove("hidden");
        $("video-url-feedback").textContent = "Vídeo já vinculado a esta matéria.";
      } else {
        $("video-preview").classList.add("hidden");
        $("video-preview-frame").removeAttribute("src");
      }
      $("video-modal").classList.remove("hidden");
      $("video-url").focus();
    });
    $("quick-video")?.addEventListener("click", () => $("add-video")?.click());

    $("quick-text")?.addEventListener("click", addText);
    $("quick-image")?.addEventListener("click", () => { mobileImageEditObject=null; $("image-upload").click(); });
    $("quick-cover")?.addEventListener("click", () => $("cover-upload").click());
    const mobileAddToggle=$("mobile-add-toggle"),mobileAddMenu=$("mobile-add-menu");
    if(!window.__fpEditorPopupsOutsideBound){
      window.__fpEditorPopupsOutsideBound=true;
      document.addEventListener('click',event=>{
        const category=document.getElementById('article-category-menu'),trigger=document.getElementById('article-category-trigger');
        if(category&&!category.hidden&&!category.contains(event.target)&&!trigger?.contains(event.target)){category.hidden=true;trigger?.setAttribute('aria-expanded','false');}
        const addMenu=document.getElementById('mobile-add-menu'),addToggle=document.getElementById('mobile-add-toggle');
        if(addMenu?.classList.contains('is-open')&&!addMenu.contains(event.target)&&!addToggle?.contains(event.target))addMenu.classList.remove('is-open');
      });
    }
    const closeMobileAddMenu=()=>{mobileAddMenu?.classList.remove("is-open");mobileAddMenu?.setAttribute("aria-hidden","true");mobileAddToggle?.setAttribute("aria-expanded","false");};
    mobileAddToggle?.addEventListener("click",()=>{const open=!mobileAddMenu?.classList.contains("is-open");mobileAddMenu?.classList.toggle("is-open",open);mobileAddMenu?.setAttribute("aria-hidden",String(!open));mobileAddToggle.setAttribute("aria-expanded",String(open));});
    mobileAddMenu?.querySelectorAll("[data-mobile-tool]").forEach(button=>button.addEventListener("click",()=>{const tool=button.dataset.mobileTool;closeMobileAddMenu();if(tool==='text')mobileAppendText();if(tool==='image')mobileAddImage();if(tool==='video'){editingVideoObject=null;$("add-video")?.click();}if(tool==='poll')openPollModal();if(tool==='audio')openAudioModal();if(tool==='save')$("save-draft")?.click();}));
    $("close-video-modal")?.addEventListener("click", () => $("video-modal").classList.add("hidden"));
    $("video-url")?.addEventListener("input", () => {
      const normalized = normalizeVideoURL($("video-url").value);
      const preview = $("video-preview");
      const frame = $("video-preview-frame");
      if (normalized) {
        frame.src = normalized;
        preview.classList.remove("hidden");
        $("video-url-feedback").textContent = "Link reconhecido. Confira a prévia abaixo.";
      } else {
        frame.removeAttribute("src");
        preview.classList.add("hidden");
        $("video-url-feedback").textContent = $("video-url").value.trim() ? "Cole um link público válido de uma plataforma de vídeo." : "";
      }
    });

    $("save-video")?.addEventListener("click", () => {
      const normalized = normalizeVideoURL($("video-url").value);
      if (!normalized) { $("video-url-feedback").textContent = "Link inválido. Cole um endereço público iniciado por http:// ou https://."; return; }
      const originalVideoSource=safeMediaURL($("video-url").value);videoUrl = normalized;
      if(canvas){
        const target=editingVideoObject;
        if(target){target.set("dataVideoUrl",normalized);target.set("dataVideoSourceUrl",originalVideoSource||normalized);target.setCoords();canvas.setActiveObject(target);editingVideoObject=null;}
        else{
          const group=new fabric.Group([new fabric.Rect({left:0,top:0,width:680,height:170,rx:18,ry:18,fill:"#EEF3EF",stroke:"#B8C8BA",strokeWidth:1}),new fabric.Textbox("Vídeo",{left:24,top:28,width:632,fontSize:28,fontWeight:"800",fill:"#1A1D1A"}),new fabric.Textbox("Vídeo incorporado nesta seção",{left:24,top:76,width:632,fontSize:16,fill:"#4F5B53"})],{left:60,top:nextContentTop(),selectable:true,evented:true});group.set("dataType","video");group.set("dataVideoUrl",normalized);group.set("dataVideoSourceUrl",originalVideoSource||normalized);group.set("dataOrder",canvas.getObjects().length+1);canvas.add(group).setActiveObject(group);
        }
        growCanvas();renderMobileBlocks();
      }
      renderSitePreview();$("video-url-feedback").textContent="Vídeo vinculado à matéria.";$("video-modal").classList.add("hidden");$("video-title").textContent="Adicionar vídeo";$("save-video").textContent="Vincular vídeo";setStatus("Vídeo vinculado. Ele será exibido na leitura pública depois da publicação.","success");
    });

    $("add-audio")?.addEventListener("click",()=>openAudioModal());
    $("quick-audio")?.addEventListener("click",()=>openAudioModal());
    $("close-audio-modal")?.addEventListener("click",closeAudioModal);
    $("audio-modal")?.addEventListener("click",event=>{if(event.target===$("audio-modal"))closeAudioModal();});
    $("audio-url")?.addEventListener("input",()=>{const raw=$("audio-url").value,normalized=normalizeAudioURL(raw),player=$("audio-preview-player"),feedback=$("audio-url-feedback");if(player){if(normalized){player.src=normalized;player.classList.remove('hidden');}else{player.pause();player.removeAttribute('src');player.load();player.classList.add('hidden');}}if(feedback)feedback.textContent=audioURLFeedback(raw);});
    $("save-audio")?.addEventListener("click",()=>{const raw=$("audio-url")?.value,normalized=normalizeAudioURL(raw);if(!normalized){if($("audio-url-feedback"))$("audio-url-feedback").textContent=audioURLFeedback(raw)||'Informe o endereço direto e público de um arquivo de áudio.';return;}if(!canvas){setStatus('O editor ainda não está pronto.','warning');return;}const target=editingAudioObject;if(target&&canvas.getObjects().includes(target)){target.set('dataAudioUrl',normalized);target.setCoords();canvas.setActiveObject(target);}else{const width=680;const group=new fabric.Group([new fabric.Rect({left:0,top:0,width,height:116,rx:16,ry:16,fill:'#EEF3FA',stroke:'#B7C9DE',strokeWidth:1}),new fabric.Textbox('Áudio da matéria',{left:22,top:20,width:width-44,fontSize:25,fontWeight:'800',fill:'#17324F'}),new fabric.Textbox('Arquivo de áudio vinculado',{left:22,top:61,width:width-44,fontSize:15,fill:'#52677D'})],{left:60,top:nextContentTop(),selectable:true,evented:true});group.set('dataType','audio');group.set('dataAudioUrl',normalized);group.set('dataOrder',canvas.getObjects().length+1);canvas.add(group).setActiveObject(group);}editingAudioObject=null;canvas.requestRenderAll();growCanvas();renderMobileBlocks();renderSitePreview();closeAudioModal();setStatus('Bloco de áudio atualizado. Confira a reprodução na prévia e no site publicado.','success');});
    $("save-draft-inline")?.addEventListener("click",()=>$("save-draft")?.click());
    $("save-draft")?.addEventListener("click", saveDraft);
    $("submit-review")?.addEventListener("click", submitReview);
    $("mobile-submit-review")?.addEventListener("click", submitReview);
    $("open-site-preview")?.addEventListener("click",e=>{e.preventDefault();openSitePreview("desktop");});
    $("preview-desktop")?.addEventListener("click",()=>{renderSitePreview();$("site-preview-frame")?.classList.remove("site-preview-mobile");});
    $("preview-mobile")?.addEventListener("click",()=>{renderSitePreview();$("site-preview-frame")?.classList.add("site-preview-mobile");});
    $("close-site-preview")?.addEventListener("click",()=>$("site-preview-modal")?.classList.add("hidden"));
    document.querySelectorAll('[data-editor-preview-mode]').forEach(button=>button.addEventListener('click',()=>{
      editorPreviewMode=button.dataset.editorPreviewMode||'card';
      renderSitePreview();
    }));
    // A prévia permanece ativa; não há controle para ocultá-la.
    ["article-title","article-subtitle","article-type","creative-type","creative-type-other"].forEach(id=>$(id)?.addEventListener("input",()=>{renderSitePreview();renderMobileMeta();syncEditorRequirements();}));
    const categorySelect=$("article-category"),categoryPicker=$("editor-category-picker"),categoryTrigger=$("article-category-trigger"),categoryMenu=$("article-category-menu");
    const closeCategoryPicker=()=>{if(categoryMenu)categoryMenu.hidden=true;categoryTrigger?.setAttribute('aria-expanded','false');};
    categoryTrigger?.addEventListener('click',()=>{const open=Boolean(categoryMenu&&!categoryMenu.hidden);if(categoryMenu)categoryMenu.hidden=open;categoryTrigger.setAttribute('aria-expanded',String(!open));if(!open)categoryMenu?.querySelector('input:not(:disabled)')?.focus();});
    document.addEventListener('click',event=>{if(categoryPicker&&!categoryPicker.contains(event.target))closeCategoryPicker();});
    document.addEventListener('keydown',event=>{if(event.key==='Escape'&&categoryMenu&&!categoryMenu.hidden){closeCategoryPicker();categoryTrigger?.focus();}});
    categorySelect?.addEventListener("change",()=>{
      if(!categorySelect)return;
      const hadOther=categorySelectionSnapshot.includes('Outro');
      const selected=[...categorySelect.selectedOptions].map(o=>o.value);
      if(selected.length>3){
        [...categorySelect.options].forEach(o=>o.selected=categorySelectionSnapshot.includes(o.value));
        setStatus('Escolha no máximo três categorias por matéria.','warning');
      }else categorySelectionSnapshot=selected;
      const current=[...categorySelect.selectedOptions].map(o=>o.value);
      categorySelectionSnapshot=current;
      const hasOther=current.includes('Outro');
      if(hasOther)closeCategoryPicker();
      const otherField=$("article-category-other");
      otherField?.classList.toggle("hidden",!hasOther);
      if(hasOther && !hadOther && otherField)window.setTimeout(()=>otherField.focus(),0);
      fitOtherCategories(true);
      renderCategoryPicker();renderSitePreview();renderMobileMeta();syncEditorRequirements();
    });
    renderCategoryPicker();
    $("article-category-other")?.addEventListener("input",()=>{fitOtherCategories(true);renderCategoryPicker();renderSitePreview();renderMobileMeta();syncEditorRequirements();});
    $("creative-type")?.addEventListener("change",()=>{$("creative-type-other")?.classList.toggle("hidden",$("creative-type").value!=="Outro");renderSitePreview();});
    $("creative-type-other")?.addEventListener("input",renderSitePreview);


    document.addEventListener("keydown", event => {
      const active = document.activeElement;
      const target = event.target;
      const richTextFocused = Boolean(active?.isContentEditable || active?.closest?.('[contenteditable="true"]') || target?.isContentEditable || target?.closest?.('[contenteditable="true"]'));
      if (richTextFocused) return;
      if (active && ["INPUT", "TEXTAREA", "SELECT"].includes(active.tagName)) return;
      if ((event.key === "Delete" || event.key === "Backspace") && canvas.getActiveObject()) {
        event.preventDefault();
        deleteSelected();
      }
    });

    loadExistingArticle();
    if (!editingIdFromURL) {
      addText();
      const starter = selectedTextObject();
      if (starter) {
        starter.text = "Título ou destaque";
        starter.fontSize = TEXT_STYLES.title.fontSize;
        starter.fontWeight = TEXT_STYLES.title.fontWeight;
        starter.set("dataTextStyle", "title");
        starter.left = 70;
        starter.top = 70;
        starter.setCoords();
        canvas.requestRenderAll();
        syncTextControls();
        renderMobileBlocks();
        renderSitePreview();
        syncEditorRequirements();
      }
    }

    $("editor-mode") && ($("editor-mode").textContent = isEditor ? "Modo Editor" : "Modo Estudante");
    updateWorkflowButtons();
    $("post-article")?.addEventListener("click", async () => {
      if (!editingId) return setStatus("Salve ou abra uma matéria antes de publicar.", "warning");
      if (!syncEditorRequirements().ready) return setStatus("Preencha título, categoria, capa e conteúdo antes de publicar.", "warning");
      if (!isEditor || currentStatus !== "Pendente") return setStatus("A matéria precisa estar pendente de revisão para ser publicada.", "warning");
      try {
        const base = readArticles();
        if (!Array.isArray(base)) throw new Error("Não foi possível acessar as matérias salvas.");
        const original = base.find(item => String(item.id) === String(editingId));
        if (!original) throw new Error("A matéria não foi encontrada no armazenamento local.");
        const article = { ...original };
        const serialized = serializeCanvas(original?.thumbURL || "");
        article.title = $("article-title").value.trim();
        article.subtitle = $("article-subtitle").value.trim();
        const selectedCategories=selectedCategoriesFromForm();
        article.categories = selectedCategories;
        article.category = selectedCategories.join(", ") || $("article-category").value || "Cultura";
        article.contentType = $("article-type")?.value || "informacional";
        const creativeChoice=$("creative-type")?.value||"";
        article.creativeType = creativeChoice==="Outro" ? ($("creative-type-other")?.value.trim()||"Outro") : creativeChoice;
        article.author = article.author || session.name;
        article.authorEmail = session.email;
        article.coverURL = coverURL;
        article.coverCrop = coverCrop && typeof coverCrop === "object" ? {x:Number(coverCrop.x)||0,y:Number(coverCrop.y)||0,width:Number(coverCrop.width)||1,height:Number(coverCrop.height)||1} : {x:0,y:0,width:1,height:1};
        article.thumbURL = serialized.thumbURL;
        article.canvasJSON = serialized.canvasJSON;
        article.videoUrl = videoUrl;
        article.credits = {researcher:creditValue("article-researcher-options","article-researcher-other"),textCredit:creditValue("article-text-credit-options","article-text-credit-other"),imageCredit:creditValue("article-image-credit-options","article-image-credit-other")};
        article.creditProfiles = {researcher:creditProfilesForValues(article.credits.researcher),textCredit:creditProfilesForValues(article.credits.textCredit),imageCredit:creditProfilesForValues(article.credits.imageCredit)};
        article.updatedAt = new Date().toISOString();
        const now = new Date().toISOString();
        article.status = "Aprovado";
        article.visible = true;
        article.feedback = "";
        article.approvedAt = now;
        article.updatedAt = now;
        workflowProgress(true,3,"Preparando publicação…");
        const synced=await saveSingleArticle(article,{cloudRequired:true,rollbackLocalOnCloudFailure:true,onProgress:(pct,label)=>workflowProgress(true,pct,label)});
        if(!synced?.id) throw new Error("O Firebase não confirmou a publicação.");
        workflowProgress(true,100,"Publicação salva no Firebase.");
        editingId = article.id;
        currentStatus = "Aprovado";
        updateWorkflowButtons();
        sessionStorage.setItem("fp_workflow_notice", "Matéria publicada com sucesso. Ela já está liberada para Home e Notícias.");
        location.replace("painel.html");
      } catch (error) {
        setStatus(error.message || "Não foi possível publicar a matéria. Tente novamente.", "warning");
      }
    });

    syncTextControls();
    growCanvas();
    renderMobileBlocks();
    updateCanvasViewport();
    const editorFieldHasFocus=()=>{
      const active=document.activeElement;
      return Boolean(document.body.classList.contains('fp-editor-workspace')&&active
        && (active.isContentEditable||active.matches('input,textarea,select,[role="textbox"]')));
    };
    window.addEventListener("resize", ()=>{updateCanvasViewport();if(!editorFieldHasFocus())renderMobileBlocks();});
    if(window.visualViewport)window.visualViewport.addEventListener('resize',()=>{updateCanvasViewport();});
  }

  init();
})();
