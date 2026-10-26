(async () => {
  "use strict";
  const fpCloudEnabled = () => { const state = window.FPCloud?.enabled; return typeof state === 'function' ? Boolean(state()) : Boolean(state); };

  if (window.FPStore?.ready) await window.FPStore.ready;
  if (window.FPCloudReady) await window.FPCloudReady.catch(() => null);

  const KEYS = { users:"fp_users", session:"fp_session", articles:"fp_articles", chat:"fp_chat" };
  const LEGACY_META_KEY = "fp_article_meta";
  const MASTER_EMAIL = "folhadopaiquere@gmail.com";
  const $ = id => document.getElementById(id);
  const read = (k,f) => { try { const r=localStorage.getItem(k); return r ? JSON.parse(r) : f; } catch(_) { return f; } };
  const readUsers = () => window.FPStore?.getUsers?.() || read(KEYS.users,[]);
  const saveUsersLocal = async items => {
    const rows=Array.isArray(items)?items:[];
    if(typeof window.FPStore?.setUsersLocal==='function') return await window.FPStore.setUsersLocal(rows);
    // Fallback local sem tentar regravar documentos remotos em lote: preserva a
    // hidratação visual se a camada storage.js estiver ausente no site hospedado.
    write(KEYS.users,rows);
    return rows;
  };
  function imageDataURL(file,maxW=1600,quality=.82){return new Promise((resolve,reject)=>{if(!file)return reject(new Error('Arquivo de imagem não informado.'));const reader=new FileReader();reader.onerror=()=>reject(new Error('Não foi possível ler a imagem.'));reader.onload=()=>{const img=new Image();img.onerror=()=>reject(new Error('Não foi possível processar a imagem.'));img.onload=()=>{const scale=Math.min(1,maxW/img.width),w=Math.max(1,Math.round(img.width*scale)),h=Math.max(1,Math.round(img.height*scale));const c=document.createElement('canvas');c.width=w;c.height=h;c.getContext('2d').drawImage(img,0,0,w,h);resolve(c.toDataURL('image/jpeg',quality));};img.src=reader.result;};reader.readAsDataURL(file);});}
  const saveUsers = async items => { if(window.FPStore?.setUsers) await window.FPStore.setUsers(items); else write(KEYS.users,items); return items; };
  const write = (k,v) => localStorage.setItem(k,JSON.stringify(v));
  const uid = p => `${p}_${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
  const normalizeEmail=v=>String(v??'').normalize('NFKC').replace(/[\u200B-\u200D\uFEFF]/g,'').replace(/\s+/g,'').trim().toLowerCase();
  const looksLikeEmail=v=>{const email=normalizeEmail(v),at=email.lastIndexOf('@');return Boolean(email)&&email.length<=254&&at>0&&at<email.length-1&&/^[^@]+@[^@]+(?:\.[^@]+)+$/.test(email);};
  const migrateLegacyArticleMeta = () => {
    const base=read(KEYS.articles,[]),meta=read(LEGACY_META_KEY,{});
    if(!Array.isArray(base))return [];
    if(!meta||typeof meta!=="object"||!Object.keys(meta).length)return base;
    let changed=false;
    const merged=base.map(a=>{const m=meta[String(a.id)];if(!m)return a;changed=true;return {...a,...m};});
    if(changed){try{write(KEYS.articles,merged);localStorage.removeItem(LEGACY_META_KEY);}catch(_){}}
    return merged;
  };
  const readArticles = () => window.FPStore?.getArticles?.() || migrateLegacyArticleMeta();
  const saveArticles = async items => { if(window.FPStore?.setArticles) return await window.FPStore.setArticles(items,{cloud:true}); localStorage.setItem(KEYS.articles,JSON.stringify(items)); return {localOK:true,dbOK:false}; };
  const saveSingleArticle = async (article, options={}) => { if(window.FPStore?.upsertArticle) return await window.FPStore.upsertArticle(article,{cloud:true,...options}); const items=readArticles(); const i=items.findIndex(x=>String(x.id)===String(article.id)); if(i>=0)items[i]=article; else items.push(article); await saveArticles(items); return article; };
  const removeSingleArticle = async id => { if(window.FPStore?.removeArticle) return await window.FPStore.removeArticle(id,{cloud:true}); const items=readArticles().filter(x=>String(x.id)!==String(id)); await saveArticles(items); return true; };
  const esc = v => String(v??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");
  let fpAdminImageCropState=null;
  const fpAdminClamp=(value,min,max)=>Math.max(min,Math.min(max,value));
  const fpAdminNormalizeCrop=raw=>{
    if(!raw||typeof raw!=='object')return null;
    let x=Number(raw.x),y=Number(raw.y),width=Number(raw.width),height=Number(raw.height);
    if(![x,y,width,height].every(Number.isFinite)||width<=0||height<=0)return null;
    width=fpAdminClamp(width,.02,1);height=fpAdminClamp(height,.02,1);
    x=fpAdminClamp(x,0,1-width);y=fpAdminClamp(y,0,1-height);
    return {x,y,width,height,sourceWidth:Number(raw.sourceWidth)||0,sourceHeight:Number(raw.sourceHeight)||0};
  };
  const fpAdminReadCrop=form=>{try{return fpAdminNormalizeCrop(JSON.parse(form?.dataset.fpImageCrop||'null'));}catch(_){return null;}};
  const fpAdminSaveCrop=(form,crop)=>{if(!form)return;if(crop)form.dataset.fpImageCrop=JSON.stringify(crop);else delete form.dataset.fpImageCrop;};
  const fpAdminApplyCropPreview=(shell,img,src,crop,placeholder=null)=>{
    if(!shell||!img)return;
    const valid=Boolean(src&&fpAdminNormalizeCrop(crop));
    shell.classList.toggle('is-cropped',valid);
    if(valid){const c=fpAdminNormalizeCrop(crop);shell.style.setProperty('--fp-admin-crop-left',`${-c.x/c.width*100}%`);shell.style.setProperty('--fp-admin-crop-top',`${-c.y/c.height*100}%`);shell.style.setProperty('--fp-admin-crop-width',`${Math.min(2500,100/c.width)}%`);shell.style.setProperty('--fp-admin-crop-height',`${Math.min(2500,100/c.height)}%`);}
    else ['--fp-admin-crop-left','--fp-admin-crop-top','--fp-admin-crop-width','--fp-admin-crop-height'].forEach(name=>shell.style.removeProperty(name));
    if(src){if(img.getAttribute('src')!==src)img.src=src;img.classList.remove('hidden');shell.classList.remove('hidden');if(placeholder)placeholder.classList.add('hidden');}
    else{img.classList.add('hidden');img.removeAttribute('src');shell.classList.remove('is-cropped');shell.classList.add('hidden');if(placeholder)placeholder.classList.remove('hidden');}
  };
  function fpAdminBindCropModal(){
    const modal=$('fp-admin-image-crop-modal'),stage=$('fp-admin-image-crop-stage'),source=$('fp-admin-image-crop-source'),selection=$('fp-admin-image-crop-selection'),status=$('fp-admin-image-crop-status'),apply=$('fp-admin-image-crop-apply');
    if(!modal||!stage||!source||!selection||modal.dataset.bound==='1')return;
    modal.dataset.bound='1';
    const setCropVisual=()=>{const c=fpAdminImageCropState?.crop;if(!c)return;selection.style.left=`${c.x*100}%`;selection.style.top=`${c.y*100}%`;selection.style.width=`${c.width*100}%`;selection.style.height=`${c.height*100}%`;};
    const defaultCrop=()=>{
      const s=fpAdminImageCropState;if(!s||!s.naturalWidth||!s.naturalHeight)return null;
      const ratio=(16/9)/(s.naturalWidth/s.naturalHeight);let width=1,height=1;
      if(ratio>=1)height=1/ratio;else width=ratio;
      return {x:(1-width)/2,y:(1-height)/2,width,height,sourceWidth:s.naturalWidth,sourceHeight:s.naturalHeight};
    };
    const close=()=>{modal.classList.add('hidden');modal.setAttribute('aria-hidden','true');source.onload=null;source.onerror=null;fpAdminImageCropState=null;};
    const reset=()=>{const next=defaultCrop();if(!next)return;fpAdminImageCropState.crop=next;setCropVisual();if(status)status.textContent='Enquadramento restaurado. Arraste o quadro ou ajuste pelos cantos.';};
    $('fp-admin-image-crop-reset')?.addEventListener('click',reset);
    $('fp-admin-image-crop-cancel')?.addEventListener('click',close);
    $('fp-admin-image-crop-close')?.addEventListener('click',close);
    modal.addEventListener('click',event=>{if(event.target===modal)close();});
    document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!modal.classList.contains('hidden'))close();});
    apply?.addEventListener('click',()=>{const s=fpAdminImageCropState;if(!s?.crop)return;const c={...s.crop,sourceWidth:s.naturalWidth,sourceHeight:s.naturalHeight};s.onApply?.(c);close();});
    let drag=null;
    selection.addEventListener('pointerdown',event=>{
      const s=fpAdminImageCropState;if(!s?.crop||event.button!==0)return;
      event.preventDefault();const handle=event.target.closest('[data-admin-crop-handle]')?.dataset.adminCropHandle||'move';
      drag={pointerId:event.pointerId,handle,startX:event.clientX,startY:event.clientY,crop:{...s.crop}};
      try{selection.setPointerCapture(event.pointerId);}catch(_){}
      selection.classList.add('is-dragging');
    });
    selection.addEventListener('pointermove',event=>{
      if(!drag||event.pointerId!==drag.pointerId||!fpAdminImageCropState)return;
      event.preventDefault();const s=fpAdminImageCropState,r=stage.getBoundingClientRect();if(!r.width||!r.height)return;
      const dx=(event.clientX-drag.startX)/r.width,dy=(event.clientY-drag.startY)/r.height,o=drag.crop,c={...o};
      if(drag.handle==='move'){c.x=fpAdminClamp(o.x+dx,0,1-o.width);c.y=fpAdminClamp(o.y+dy,0,1-o.height);}
      else{
        const west=drag.handle==='nw'||drag.handle==='sw',north=drag.handle==='nw'||drag.handle==='ne';
        const anchorX=west?o.x+o.width:o.x,anchorY=north?o.y+o.height:o.y;
        const ratio=(16/9)*(r.height/r.width);
        let nextWidth=west?o.width-dx:o.width+dx;
        const maxWidth=Math.max(.02,Math.min(west?anchorX:1-anchorX,(north?anchorY:1-anchorY)*ratio));
        nextWidth=fpAdminClamp(nextWidth,Math.min(.035,maxWidth),maxWidth);
        const nextHeight=nextWidth/ratio;
        c.width=nextWidth;c.height=nextHeight;c.x=west?anchorX-nextWidth:anchorX;c.y=north?anchorY-nextHeight:anchorY;
      }
      s.crop=c;setCropVisual();
    });
    const stopDrag=event=>{if(!drag||event.pointerId!==drag.pointerId)return;drag=null;selection.classList.remove('is-dragging');};
    selection.addEventListener('pointerup',stopDrag);selection.addEventListener('pointercancel',stopDrag);selection.addEventListener('lostpointercapture',()=>{drag=null;selection.classList.remove('is-dragging');});
    selection.addEventListener('keydown',event=>{const s=fpAdminImageCropState;if(!s?.crop||!['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(event.key))return;event.preventDefault();const step=event.shiftKey ? 0.03 : 0.005;const c=s.crop;if(event.key==='ArrowLeft')c.x=fpAdminClamp(c.x-step,0,1-c.width);if(event.key==='ArrowRight')c.x=fpAdminClamp(c.x+step,0,1-c.width);if(event.key==='ArrowUp')c.y=fpAdminClamp(c.y-step,0,1-c.height);if(event.key==='ArrowDown')c.y=fpAdminClamp(c.y+step,0,1-c.height);setCropVisual();});
  }
  function fpAdminOpenImageCrop({form,source,currentCrop,onApply}){
    const modal=$('fp-admin-image-crop-modal'),stage=$('fp-admin-image-crop-stage'),image=$('fp-admin-image-crop-source'),selection=$('fp-admin-image-crop-selection'),status=$('fp-admin-image-crop-status'),apply=$('fp-admin-image-crop-apply');
    if(!modal||!stage||!image||!selection){return;}
    const src=String(source||'').trim();
    if(!/^https?:\/\//i.test(src)&&!/^blob:/i.test(src)&&!/^data:image\//i.test(src)){if(status)status.textContent='Escolha uma imagem válida antes de recortar.';return;}
    fpAdminBindCropModal();
    fpAdminImageCropState={form,source:src,currentCrop:fpAdminNormalizeCrop(currentCrop),crop:null,naturalWidth:0,naturalHeight:0,onApply};
    modal.classList.remove('hidden');modal.setAttribute('aria-hidden','false');if(status)status.textContent='Carregando imagem…';if(apply)apply.disabled=true;
    const finish=()=>{
      const s=fpAdminImageCropState;if(!s)return;
      s.naturalWidth=image.naturalWidth;s.naturalHeight=image.naturalHeight;
      if(!s.naturalWidth||!s.naturalHeight){if(status)status.textContent='A imagem não pôde ser lida. Verifique o link ou escolha outro arquivo.';return;}
      const maxWidth=Math.max(240,Math.min(900,window.innerWidth-48)),maxHeight=Math.max(180,Math.min(540,window.innerHeight*.54));
      const scale=Math.min(maxWidth/s.naturalWidth,maxHeight/s.naturalHeight,1);
      stage.style.width=`${Math.round(s.naturalWidth*scale)}px`;stage.style.height=`${Math.round(s.naturalHeight*scale)}px`;
      s.crop=fpAdminNormalizeCrop(s.currentCrop)||null;
      if(!s.crop){const ratio=(16/9)/(s.naturalWidth/s.naturalHeight);let width=1,height=1;if(ratio>=1)height=1/ratio;else width=ratio;s.crop={x:(1-width)/2,y:(1-height)/2,width,height,sourceWidth:s.naturalWidth,sourceHeight:s.naturalHeight};}
      // Keep restored crops inside the source image; a normalized rectangle needs no pixel/CORS read.
      s.crop.sourceWidth=s.naturalWidth;s.crop.sourceHeight=s.naturalHeight;
      selection.style.left=`${s.crop.x*100}%`;selection.style.top=`${s.crop.y*100}%`;selection.style.width=`${s.crop.width*100}%`;selection.style.height=`${s.crop.height*100}%`;
      if(status)status.textContent='Proporção do cartão: 16:9. Arraste o quadro para mover; ajuste pelos cantos. Use as setas para pequenos ajustes.';
      if(apply)apply.disabled=false;
      $('fp-admin-image-crop-title')?.focus?.();
    };
    image.onload=finish;image.onerror=()=>{if(status)status.textContent='Não foi possível carregar essa imagem. Verifique o link ou escolha outro arquivo.';};image.src=src;
    if(image.complete&&image.naturalWidth)finish();
  }
  const fpAdminCropStyleReset=shell=>{if(!shell)return;shell.classList.remove('is-cropped');['--fp-admin-crop-left','--fp-admin-crop-top','--fp-admin-crop-width','--fp-admin-crop-height'].forEach(name=>shell.style.removeProperty(name));};
  const normalizeSearch = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').trim();
  const bindSearchInput = (input, handler) => { if (!input) return; input.oninput = handler; input.onsearch = handler; input.onchange = handler; };
  const normalizeCreditValues=v=>Array.isArray(v)?v.map(x=>String(x).trim()).filter(Boolean):(String(v||"").trim()?[String(v).trim()]:[]);
  const isEligibleCreditAccount=u=>{if(!u||!String(u.name||'').trim())return false;const truthy=v=>v===true||v===1||['true','1','sim','yes'].includes(String(v??'').trim().toLocaleLowerCase('pt-BR'));const state=String(u.status||u.state||'').trim().toLocaleLowerCase('pt-BR');return !truthy(u.accessRevoked)&&!truthy(u.revoked)&&!truthy(u.deleted)&&!truthy(u.isDeleted)&&!['revoked','deleted','removed','inactive','disabled'].includes(state)&&String(u.revocationMode||'')!=='spark-plan-b';};
  const achievementCreditUsers=()=>{const all=readUsers();return Array.isArray(all)?all.filter(isEligibleCreditAccount).sort((a,b)=>String(a.name).localeCompare(String(b.name),'pt-BR')):[];};

  // A decisão de acesso à Área do Estudante é baseada no perfil editorial
  // confirmado pelo Firebase em panelInit(). Estas funções apenas centralizam
  // a regra de autorização usada pela interface; não concedem cargo por si só.
  const roleOf=s=>String(s?.role||s?.title||s?.funcao||"").trim();
  const isMaster=s=>!!s&&String(s.email||"").trim().toLowerCase()===MASTER_EMAIL;
  const isEditor=s=>!!s&&(isMaster(s)||["Editor","Editor-Chefe"].includes(roleOf(s)));
  const isEditorChief=s=>!!s&&(isMaster(s)||roleOf(s)==="Editor-Chefe");
  const announce=m=>{const el=$("accessibility-status");if(el)el.textContent=m;};
  let activeFloatingActionMenu=null;
  const closeFloatingActionMenu=()=>{
    if(!activeFloatingActionMenu)return;
    const active=activeFloatingActionMenu;
    activeFloatingActionMenu=null;
    active.portal?.remove();
    active.trigger?.setAttribute('aria-expanded','false');
  };
  const openFloatingActionMenu=(trigger,sourceMenu,scope)=>{
    const existing=activeFloatingActionMenu;
    if(existing&&existing.trigger===trigger){closeFloatingActionMenu();return;}
    closeFloatingActionMenu();
    if(!trigger||!sourceMenu||!scope)return;
    const portal=sourceMenu.cloneNode(true);
    portal.removeAttribute('hidden');portal.id='fp-floating-action-menu';portal.classList.add('fp-action-dropdown-portal');
    portal.style.position='fixed';portal.style.zIndex='12080';portal.style.maxHeight='min(22rem, calc(100vh - 1rem))';portal.style.overflowY='auto';portal.style.visibility='hidden';
    document.body.appendChild(portal);
    const rect=trigger.getBoundingClientRect(),menuRect=portal.getBoundingClientRect(),gap=6,margin=8;
    const left=Math.max(margin,Math.min(rect.right-menuRect.width,window.innerWidth-menuRect.width-margin));
    const roomBelow=window.innerHeight-rect.bottom-margin,roomAbove=rect.top-margin;
    let top=rect.bottom+gap;
    if(roomBelow<menuRect.height&&roomAbove>roomBelow)top=Math.max(margin,rect.top-menuRect.height-gap);
    else top=Math.min(top,window.innerHeight-menuRect.height-margin);
    portal.style.left=`${left}px`;portal.style.top=`${Math.max(margin,top)}px`;portal.style.visibility='visible';
    activeFloatingActionMenu={portal,trigger,scope};trigger.setAttribute('aria-expanded','true');
    portal.addEventListener('click',event=>{
      const action=event.target.closest('button');if(!action)return;
      const actionAttr=Array.from(action.attributes).find(attr=>['data-notice-view','data-edit-notice','data-delete-notice','data-notice-set-visibility','data-copy-suggestion','data-delete-suggestion','data-achievement-view','data-achievement-adjust','data-achievement-delete','data-preview','data-post','data-adjust','data-back-draft','data-delete-article','data-toggle-article-highlight','data-profile-authorize','data-profile-deny','data-cycle-role','data-adjust-access','data-remove-user','data-restore-user','data-delete-user'].includes(attr.name));
      if(!actionAttr)return;
      const selector=`[${actionAttr.name}="${CSS.escape(actionAttr.value)}"]`;
      const source=scope.querySelector(selector);
      closeFloatingActionMenu();
      if(source)source.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,view:window}));
    });
  };
  if(!window.__fpFloatingActionMenuBound){
    window.__fpFloatingActionMenuBound=true;
    document.addEventListener('click',event=>{
      if(!event.target.closest('.fp-action-menu')&&!event.target.closest('#fp-floating-action-menu'))closeFloatingActionMenu();
      document.querySelectorAll('details[open]').forEach(details=>{const menuAction=event.target.closest('[data-mobile-open-tab],[data-mobile-logout],[data-mobile-theme-toggle],[data-mobile-font-increase],[data-mobile-font-decrease],[data-mobile-notifications-toggle],[data-pwa-install]');if(!details.contains(event.target)||menuAction)details.open=false;});
      document.querySelectorAll('.fp-mobile-add-menu.is-open').forEach(menu=>{if(!menu.contains(event.target)&&!event.target.closest('[data-mobile-add-toggle]'))menu.classList.remove('is-open');});
    });
    window.addEventListener('resize',closeFloatingActionMenu);
    window.addEventListener('scroll',closeFloatingActionMenu,true);
  }

  let fontScale=Number(localStorage.getItem("fp-font-scale")||"0");
  if(!Number.isFinite(fontScale)) fontScale=0;
  fontScale=Math.max(-2,Math.min(3,Math.trunc(fontScale)));
  let reading=false, speechQueue=[], speechIndex=0;
  function setupAchievementCredits(saved=[], sourceUsers=null){
    const search=$("achievement-credit-search"),box=$("achievement-credit-options"),other=$("achievement-credit-other");
    if(!box||!search)return()=>[];
    const users=(Array.isArray(sourceUsers)?sourceUsers:achievementCreditUsers()).filter(isEligibleCreditAccount);
    const byRef=new Map();users.forEach(u=>{[u.name,u.email,u.uid].filter(Boolean).forEach(v=>byRef.set(String(v).toLowerCase(),u));});
    const normalized=normalizeCreditValues(saved);
    const state=new Set();
    const otherInitial=[];
    normalized.forEach(v=>{const user=byRef.get(String(v).toLowerCase());if(user?.name)state.add(String(user.name));else otherInitial.push(v);});
    const registered=new Set(users.flatMap(u=>[u.name,u.email,u.uid].filter(Boolean).map(String)));
    let otherNames=otherInitial;
    if(!otherNames.length) otherNames=[];
    const render=(term='')=>{
      const q=normalizeSearch(term||'');
      const rows=users.filter(u=>!q||normalizeSearch(`${u.name} ${u.email||''} ${u.role||''}`).includes(q)).map(u=>{
        const value=String(u.name||'').trim(),email=String(u.email||'').trim();
        const href=u.uid?`perfil.html?uid=${encodeURIComponent(String(u.uid))}`:(email?`perfil.html?email=${encodeURIComponent(email)}`:'');
        return `<label class="credit-option"><input type="checkbox" data-ach-credit="${esc(value)}" data-ach-credit-uid="${esc(u.uid||'')}" ${state.has(value)||state.has(email)||state.has(String(u.uid||''))?'checked':''}><span class="credit-option-name">${href?`<a href="${href}" target="_blank" rel="noopener" class="credit-profile-link" onclick="event.stopPropagation()">${esc(value)}</a>`:esc(value)}</span><span class="credit-option-meta">${esc(u.role||'Estudante')}${u.accessRevoked?' · acesso revogado':''}</span></label>`;
      }).join('');
      box.innerHTML=rows||'<div class="credit-empty">Nenhum perfil cadastrado encontrado.</div>';
      if(other)other.value=otherNames.join(', ');
    };
    search.oninput=()=>render(search.value);
    box.onclick=e=>{const i=e.target.closest('input[data-ach-credit]');if(i){const value=String(i.dataset.achCredit||'');i.checked?state.add(value):state.delete(value);}};
    if(other)other.oninput=()=>{otherNames=other.value.split(',').map(v=>v.trim()).filter(Boolean);};
    box.dataset.bound='1';render();
    return()=>{const selected=[...state];return[...new Set([...selected,...otherNames])];};
  }

  function applyFontScale(next){
    fontScale=Math.max(-2,Math.min(3,Math.trunc(next)));
    document.documentElement.dataset.fontScale=String(fontScale);
    document.documentElement.style.fontSize=`${100+fontScale*10}%`;
    localStorage.setItem("fp-font-scale",String(fontScale));
    const d=$("font-decrease"),i=$("font-increase"); if(d)d.disabled=fontScale<=-2;if(i)i.disabled=fontScale>=3;
  }
  function applyTheme(theme,persist=false){
    const dark=theme==="dark"; document.documentElement.classList.toggle("dark",dark); document.documentElement.style.colorScheme=dark?"dark":"light";
    const icon=$("theme-icon"),label=$("theme-label"),btn=$("theme-toggle");
    if(icon)icon.textContent=dark?"☼":"☾"; if(label)label.textContent=dark?"Modo claro":"Modo escuro"; if(btn){btn.setAttribute("aria-label",dark?"Ativar modo claro":"Ativar modo escuro");btn.title=dark?"Modo claro":"Modo escuro";}
    const mobileThemeIcon=$("fp-mobile-theme-symbol"),mobileThemeLabel=$("fp-mobile-theme-label");
    if(mobileThemeIcon)mobileThemeIcon.textContent=dark?"☼":"☾";
    if(mobileThemeLabel)mobileThemeLabel.textContent=dark?"Modo claro":"Modo escuro";
    if(persist)localStorage.setItem("theme",theme);
  }
  function speechChunks(text){return (text.match(/[^.!?]+[.!?]+|[^.!?]+$/g)||[text]).map(x=>x.trim()).filter(Boolean);}
  function stopSpeech(){if("speechSynthesis" in window)speechSynthesis.cancel();reading=false;speechQueue=[];speechIndex=0;const b=$("speech-toggle");if(b){b.setAttribute("aria-pressed","false");b.setAttribute("aria-label","Ouvir página");}if($("speech-icon"))$("speech-icon").textContent="🔊";}
  function speakNext(){if(!reading||speechIndex>=speechQueue.length){stopSpeech();return;}const u=new SpeechSynthesisUtterance(speechQueue[speechIndex++]);u.lang="pt-BR";const v=speechSynthesis.getVoices().find(v=>/^pt-BR$/i.test(v.lang))||speechSynthesis.getVoices().find(v=>/^pt/i.test(v.lang));if(v)u.voice=v;u.rate=.95;u.onend=speakNext;u.onerror=stopSpeech;speechSynthesis.speak(u);}
  function startSpeech(){if(!(window.speechSynthesis)){announce("Seu navegador não oferece leitura por voz.");return;}const text=document.querySelector("main")?.innerText?.replace(/\s+/g," ").trim();if(!text){announce("Não há texto principal para leitura.");return;}speechSynthesis.cancel();speechQueue=speechChunks(text);speechIndex=0;reading=true;const b=$("speech-toggle");if(b){b.setAttribute("aria-pressed","true");b.setAttribute("aria-label","Parar leitura");}if($("speech-icon"))$("speech-icon").textContent="⏹️";speakNext();}
  function setupAccessibility(){
    $("font-decrease")?.addEventListener("click",()=>applyFontScale(fontScale-1));
    $("font-increase")?.addEventListener("click",()=>applyFontScale(fontScale+1));
    $("theme-toggle")?.addEventListener("click",()=>{const next=document.documentElement.classList.contains("dark")?"light":"dark";localStorage.setItem("fp_theme_manual","1");applyTheme(next,true);window.dispatchEvent(new CustomEvent("fp:theme-updated",{detail:next}));});
    $("speech-toggle")?.addEventListener("click",()=>reading?stopSpeech():startSpeech());
    applyFontScale(fontScale);
    const saved=localStorage.getItem("theme"),manual=localStorage.getItem("fp_theme_manual")==="1";
    const auto=()=>{const hour=new Date().getHours();return (hour>=18||hour<6)?"dark":"light";};
    applyTheme(manual&&(saved==="dark"||saved==="light")?saved:auto(),false);
    let lastHour=new Date().getHours();setInterval(()=>{const h=new Date().getHours();if(h!==lastHour){lastHour=h;if(localStorage.getItem("fp_theme_manual")!=="1")applyTheme(auto(),false);}},30000);
    window.addEventListener('storage',e=>{if(e.key==='theme'&&(e.newValue==='dark'||e.newValue==='light'))applyTheme(e.newValue,false);});
    window.addEventListener('fp:theme-updated',e=>{if(e.detail==='dark'||e.detail==='light')applyTheme(e.detail,false);});
  }


  async function loginInit(){
    const form=$("login-form");if(!form)return;
    const email=$("login-email"),pass=$("login-password"),alert=$("login-alert");
    const authLoading=window.FPAuthLoading;
    const remembered=localStorage.getItem("fp_last_login_email"); if(email && remembered) email.value=remembered;
    const existing=read(KEYS.session,null);
    const switchAccount=new URLSearchParams(location.search).get("switch")==="1";
    if(existing?.email&&!switchAccount){
      authLoading?.show('Abrindo sua Área do Estudante…');
      authLoading?.keepUntilNavigation();
      const next=new URLSearchParams(location.search).get("next");
      location.href=["painel.html","editor.html"].includes(next)?next:"painel.html";
      return;
    }
    const setAlert=(msg,good=false)=>{if(!alert)return;alert.textContent=msg;alert.className=`mt-4 rounded-lg border px-4 py-3 text-sm font-semibold ${good?"border-[#A9D4AB] bg-[#F2F7F3] text-[#1B5E20] dark:bg-[#2D382E] dark:text-[#81C784]":"border-[#D8C88D] bg-[#F3E9C7] text-[#5E4E1A] dark:bg-[#4A4226] dark:text-[#F0D98A]"}`;alert.classList.remove("hidden");};
    const find=()=>readUsers().find(u=>String(u.email).toLowerCase()===email.value.trim().toLowerCase());
    const submitButton=form.querySelector('button[type="submit"],input[type="submit"]');
    let busy=false;
    const setBusy=(value,message)=>{
      busy=Boolean(value);
      if(submitButton){submitButton.disabled=busy;submitButton.setAttribute('aria-busy',String(busy));submitButton.classList.toggle('opacity-70',busy);}
      if(email)email.readOnly=busy;
      if(pass)pass.readOnly=busy;
      if(busy)authLoading?.show(message||'Verificando seu acesso…');
      else authLoading?.hide();
    };
    email?.addEventListener("input",()=>{const u=find();if(email.value&&!u)setAlert("Acesso restrito. Solicite autorização ao administrador do jornal");else alert?.classList.add("hidden");});
    form.addEventListener("submit",async e=>{
      e.preventDefault();
      if(busy)return;
      const emailValue=String(email?.value||'').trim().toLowerCase(), passwordValue=String(pass?.value||'');
      if(!emailValue||!passwordValue){setAlert('Informe seu e-mail e sua senha para continuar.');return;}
      setBusy(true,'Verificando seu acesso…');
      try{
        if(fpCloudEnabled()){
          const cloud=await window.FPCloud.firebaseSignIn(emailValue,passwordValue);
          if(!cloud?.ok){setBusy(false);return setAlert((cloud?.code ? `[${cloud.code}] ` : "") + (cloud?.message || "Não foi possível entrar no Firebase."));}
          const profile=cloud.profile||{};
          localStorage.setItem("fp_last_login_email",emailValue);
          write(KEYS.session,{uid:cloud.user.uid,email:cloud.user.email,name:profile.name||cloud.user.displayName||emailValue.split('@')[0],role:profile.role||"Estudante",avatar:profile.avatar||cloud.user.photoURL||"",loggedAt:new Date().toISOString(),firebase:true});
          setAlert("Login realizado. Abrindo o painel…",true);
          authLoading?.show('Login confirmado. Abrindo o painel…');
          authLoading?.keepUntilNavigation();
          const next=new URLSearchParams(location.search).get("next");
          setTimeout(()=>location.href=["painel.html","editor.html"].includes(next)?next:"painel.html",180);
          return;
        }
        const u=find();
        if(!u){setBusy(false);return setAlert("Acesso restrito. Solicite autorização ao administrador do jornal");}
        if(u.accessRevoked){setBusy(false);return setAlert("Este acesso foi revogado. O perfil permanece preservado, mas o acesso ao painel está bloqueado.");}
        if(passwordValue!==u.password){setBusy(false);return setAlert("Senha incorreta.");}
        localStorage.setItem("fp_last_login_email",u.email);
        write(KEYS.session,{email:u.email,name:u.name,role:u.role,loggedAt:new Date().toISOString()});
        setAlert("Login realizado. Abrindo o painel…",true);
        authLoading?.show('Login confirmado. Abrindo o painel…');
        authLoading?.keepUntilNavigation();
        const next=new URLSearchParams(location.search).get("next");
        setTimeout(()=>location.href=["painel.html","editor.html"].includes(next)?next:"painel.html",180);
      }catch(error){
        setBusy(false);
        setAlert(error?.message||'Não foi possível concluir o login. Verifique sua conexão e tente novamente.');
      }
    });
  }

  function statusBadge(a){
    const map={Rascunho:["Rascunho","bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200"],Pendente:["Em Análise","status-pending"],Ajustes:["Necessita Ajustes","status-adjust"],Aprovado:["Publicado","status-approved"]};
    const [label,cls]=map[a.status]||map.Rascunho;return `<span class="inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${cls}">${label}</span>`;
  }

  function updateNewArticleButton(s){
    const button=$("new-article-btn");
    if(!button)return;
    const list=readArticles();
    const uid=String(s.uid||'').toLowerCase(), email=String(s.email||'').toLowerCase();
    const open=list.filter(a=>{
      const byUid=uid&&String(a.authorUid||'').toLowerCase()===uid;
      const byEmail=email&&String(a.authorEmail||'').toLowerCase()===email;
      return (byUid||byEmail)&&['Rascunho','Pendente','Ajustes'].includes(String(a.status||''));
    }).length;
    const blocked=open>=1;
    button.disabled=blocked;
    button.setAttribute('aria-disabled',String(blocked));
    button.classList.toggle('opacity-60',blocked);
    button.classList.toggle('cursor-not-allowed',blocked);
    button.classList.toggle('fp-new-article-blocked',blocked);
    const label=button.querySelector('.fp-new-article-label');
    const plus=button.querySelector('.fp-new-article-plus');
    const labelText=blocked?'Limite atingido — finalize a matéria':'Criar nova matéria';
    if(label)label.textContent=labelText;else button.textContent=blocked?labelText:'+ Criar nova matéria';
    if(plus)plus.textContent=blocked?'!':'+';
    button.setAttribute('aria-label',blocked?'Limite atingido. Finalize a matéria existente antes de criar outra.':'Criar nova matéria');
    button.title=blocked?'Você já possui uma matéria em Rascunho, Em análise ou Necessita ajustes.':'Criar uma nova matéria';
    document.querySelectorAll('[data-mobile-new-article]').forEach(compactButton=>{
      compactButton.disabled=blocked;
      compactButton.setAttribute('aria-disabled',String(blocked));
      compactButton.title=button.title;
      compactButton.classList.toggle('is-disabled',blocked);
    });
    return !blocked;
  }

  function myArticles(s){
    const box=$('my-articles');if(!box)return;
    const search=$('my-articles-search'),sortControl=$('my-articles-sort'),pager=$('my-articles-pagination');
    const ownerUid=String(s.uid||'').trim().toLowerCase(),ownerEmail=String(s.email||'').trim().toLowerCase();
    const all=[...new Map(readArticles().filter(a=>{
      const byUid=ownerUid&&String(a.authorUid||'').trim().toLowerCase()===ownerUid;
      const byEmail=ownerEmail&&String(a.authorEmail||'').trim().toLowerCase()===ownerEmail;
      return byUid||byEmail;
    }).map(a=>[String(a.id),a])).values()];
    const categoryText=a=>Array.isArray(a.category)?a.category.filter(Boolean).join(' · '):String(a.category||'');
    const statusLabel=status=>({Rascunho:'Rascunho',Pendente:'Em análise',Ajustes:'Necessita ajustes',Aprovado:'Publicado'})[String(status||'')]||'Rascunho';
    const articleWords=a=>{
      const objects=Array.isArray(a.canvasJSON?.objects)?a.canvasJSON.objects:[];
      const body=objects.map(o=>[o?.text,o?.dataPoll?.title,...(Array.isArray(o?.dataPoll?.options)?o.dataPoll.options:[])].filter(Boolean).join(' ')).join(' ');
      return [a.title,a.subtitle,body,typeof a.content==='string'?a.content:'',typeof a.text==='string'?a.text:''].filter(Boolean).join(' ').trim().split(/\s+/).filter(Boolean).length;
    };
    const articleDate=a=>{
      const value=a.updatedAt||a.date||a.createdAt||'';
      if(value&&typeof value.toDate==='function'){const time=value.toDate().getTime();return Number.isFinite(time)?time:0;}
      if(value&&typeof value==='object'&&Number.isFinite(Number(value.seconds)))return Number(value.seconds)*1000;
      const time=new Date(value).getTime();return Number.isFinite(time)?time:0;
    };
    const dateLabel=a=>{
      const time=articleDate(a);return time?new Date(time).toLocaleDateString('pt-BR'):'Data não informada';
    };
    const safeImage=a=>[a.coverURL,a.thumbURL,a.image,a.imageURL].map(v=>String(v||'').trim()).find(v=>/^https?:\/\//i.test(v)||/^data:image\/(?:png|jpe?g|webp|gif);/i.test(v)||/^(?:\.\.?\/)?assets\//i.test(v))||'';
    const allowedStates=['Todas','Rascunho','Pendente','Ajustes','Aprovado'];
    if(!allowedStates.includes(String(box.dataset.statusFilter||'')))box.dataset.statusFilter='Todas';
    if(!Number.isFinite(Number(box.dataset.page))||Number(box.dataset.page)<1)box.dataset.page='1';
    const stateFilter=String(box.dataset.statusFilter||'Todas');
    const query=normalizeSearch(search?.value||'');
    let list=all.filter(a=>{
      if(stateFilter!=='Todas'&&String(a.status||'Rascunho')!==stateFilter)return false;
      if(!query)return true;
      const objects=Array.isArray(a.canvasJSON?.objects)?a.canvasJSON.objects:[];
      const body=objects.map(o=>[o?.text,o?.dataPoll?.title,...(Array.isArray(o?.dataPoll?.options)?o.dataPoll.options:[])].filter(Boolean).join(' ')).join(' ');
      const haystack=normalizeSearch([a.title,a.subtitle,categoryText(a),a.status,statusLabel(a.status),a.feedback,a.author,a.authorEmail,body,a.content,a.text]
        .filter(Boolean).join(' '));
      return haystack.includes(query);
    });
    const sortMode=String(sortControl?.value||'newest');
    if(sortMode==='alpha')list.sort((a,b)=>String(a.title||'Sem título').localeCompare(String(b.title||'Sem título'),'pt-BR',{sensitivity:'base'}));
    else if(sortMode==='oldest')list.sort((a,b)=>articleDate(a)-articleDate(b));
    else list.sort((a,b)=>articleDate(b)-articleDate(a));

    const pageSize=5,totalPages=Math.max(1,Math.ceil(list.length/pageSize));
    const page=Math.max(1,Math.min(Number(box.dataset.page)||1,totalPages));box.dataset.page=String(page);
    const shown=list.slice((page-1)*pageSize,page*pageSize);
    const pageStart=totalPages<=3?1:Math.max(1,Math.min(page,totalPages-2));
    const windowPages=totalPages<=3?Array.from({length:totalPages},(_,i)=>i+1):[pageStart,pageStart+1,pageStart+2];
    const statusClass={Rascunho:'my-article-status-draft',Pendente:'my-article-status-review',Ajustes:'my-article-status-adjust',Aprovado:'my-article-status-published'};
    const filterButtons=[...document.querySelectorAll('[data-article-status-filter]')];
    filterButtons.forEach(button=>{
      const active=String(button.dataset.articleStatusFilter||'Todas')===stateFilter;
      button.setAttribute('aria-pressed',String(active));
      button.classList.toggle('is-active',active);
      if(button.dataset.bound!=='1'){
        button.dataset.bound='1';
        button.addEventListener('click',()=>{
          box.dataset.statusFilter=String(button.dataset.articleStatusFilter||'Todas');
          box.dataset.page='1';myArticles(s);
        });
      }
    });
    bindSearchInput(search,()=>{box.dataset.page='1';myArticles(s);});
    if(sortControl&&sortControl.dataset.bound!=='1'){sortControl.dataset.bound='1';sortControl.addEventListener('change',()=>{box.dataset.page='1';myArticles(s);});}
    if(pager&&pager.dataset.bound!=='1'){
      pager.dataset.bound='1';pager.addEventListener('click',event=>{
        const button=event.target.closest('[data-my-articles-page]');if(!button||button.disabled)return;
        const next=Number(button.dataset.myArticlesPage);if(!Number.isFinite(next))return;
        box.dataset.page=String(Math.max(1,next));myArticles(s);
      });
    }

    box.innerHTML=shown.length?shown.map(a=>{
      const status=String(a.status||'Rascunho'),published=status==='Aprovado';
      const canDelete=status==='Rascunho'&&a.correctionCycle!==true;
      const canEdit=['Rascunho','Ajustes'].includes(status);
      const title=String(a.title||'Sem título');
      const category=categoryText(a)||'Tema não informado';
      const cover=safeImage(a);
      const readMinutes=Math.max(1,Math.ceil(articleWords(a)/200));
      const updated=`Atualizado em ${dateLabel(a)} · ${readMinutes} min de leitura`;
      const titleMarkup=canEdit?`<a class="my-article-title my-article-title-editable" href="editor.html?edit=${encodeURIComponent(a.id)}" title="Continuar editando esta matéria">${esc(title)}</a>`:`<h3 class="my-article-title">${esc(title)}</h3>`;
      const imageMarkup=cover?`<img src="${esc(cover)}" alt="Capa: ${esc(title)}" loading="lazy">`:`<span class="my-article-cover-placeholder" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M5 4.5A2.5 2.5 0 0 1 7.5 2H20v17H7.5A2.5 2.5 0 0 0 5 21.5z"/><path d="M5 5v16.5M9 7h7M9 10.5h7M9 14h5"/></svg></span>`;
      const feedback=a.feedback?`<p class="my-article-feedback"><strong>Orientação editorial:</strong> ${esc(a.feedback)}</p>`:'';
      const statusBadgeMarkup=`<span class="my-article-status ${statusClass[status]||statusClass.Rascunho}">${esc(statusLabel(status))}</span>`;
      const deleteButton=`<button type="button" data-delete-own="${esc(a.id)}" class="my-article-menu-item is-danger ${canDelete?'':'is-disabled'}" ${canDelete?'':'disabled aria-disabled="true" title="A exclusão não está disponível para esta matéria"'}>Excluir</button>`;
      const publishedAction=published?`<a class="my-article-menu-item is-success" href="noticia-single.html?id=${encodeURIComponent(a.id)}">Ver publicado</a>`:`<button type="button" class="my-article-menu-item is-success is-disabled" disabled aria-disabled="true" title="Esta matéria ainda não foi publicada">Ver publicado</button>`;
      const editAction=canEdit?`<a class="my-article-edit-link" href="editor.html?edit=${encodeURIComponent(a.id)}">Continuar no editor <span aria-hidden="true">↗</span></a>`:'';
      return `<article class="my-article-card">
        <div class="my-article-cover">${imageMarkup}</div>
        <div class="my-article-main">
          ${titleMarkup}
          <div class="my-article-topic"><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m20.6 13.4-7.2 7.2L3 10.2V3h7.2z"/><circle cx="7.4" cy="7.4" r="1"/></svg><span>${esc(category)}</span></div>
          <p class="my-article-meta"><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg><span>${esc(updated)}</span></p>
          ${feedback}
          ${editAction}
        </div>
        <div class="my-article-status-column">${statusBadgeMarkup}</div>
        <details class="my-article-actions">
          <summary aria-label="Mais opções para ${esc(title)}" title="Mais opções"><svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg></summary>
          <div class="my-article-menu">${deleteButton}${publishedAction}</div>
        </details>
      </article>`;
    }).join(''):(all.length?`<div class="my-articles-empty"><span aria-hidden="true">⌕</span><strong>Nenhuma matéria encontrada</strong><p>Ajuste a busca ou escolha outro estado para ver suas matérias.</p></div>`:`<div class="my-articles-empty"><span aria-hidden="true">✎</span><strong>Suas histórias começam aqui</strong><p>Crie uma matéria para acompanhar o rascunho, a revisão e a publicação neste espaço.</p></div>`);
    // Only one three-dot menu may remain open at a time.
    box.querySelectorAll('.my-article-actions').forEach(details=>{
      details.addEventListener('toggle',()=>{
        if(!details.open)return;
        box.querySelectorAll('.my-article-actions').forEach(other=>{if(other!==details)other.open=false;});
      });
    });
    const from=list.length?(page-1)*pageSize+1:0,to=Math.min(page*pageSize,list.length);
    if(pager)pager.innerHTML=`<p>Mostrando ${from}–${to} de ${list.length} matérias</p>${totalPages>1?`<nav class="fp-pagination" aria-label="Páginas das minhas matérias"><button type="button" class="fp-page-btn fp-page-arrow" data-my-articles-page="${page-1}" aria-label="Página anterior" ${page<=1?'disabled':''}>‹</button>${windowPages.map(number=>`<button type="button" class="fp-page-btn ${number===page?'is-current':''}" data-my-articles-page="${number}" aria-current="${number===page?'page':'false'}">${number}</button>`).join('')}<button type="button" class="fp-page-btn fp-page-arrow" data-my-articles-page="${page+1}" aria-label="Próxima página" ${page>=totalPages?'disabled':''}>›</button></nav>`:''}`;
    bindOwnArticleDeletion(s);
  }

  function bindOwnArticleDeletion(s){
    const box=$("my-articles");if(!box)return;
    box.querySelectorAll("[data-delete-own]").forEach(b=>b.onclick=async()=>{
      const id=b.dataset.deleteOwn,items=readArticles(),item=items.find(x=>String(x.id)===String(id));
      if(!item||!((s.uid&&String(item.authorUid||'').toLowerCase()===String(s.uid||'').toLowerCase())||String(item.authorEmail||'').toLowerCase()===String(s.email||'').toLowerCase()))return announce("Matéria não encontrada.");
      if(item.status!=="Rascunho"||item.correctionCycle===true)return announce("Esta matéria não pode ser excluída neste estado.");
      if(!confirm("Excluir esta matéria definitivamente?"))return;
      try{await removeSingleArticle(id);myArticles(s);announce("Matéria excluída definitivamente.");}catch(error){announce(error?.message||"Não foi possível excluir a matéria.");}
    });
  }

  function pollObjects(article){return Array.isArray(article?.canvasJSON?.objects)?article.canvasJSON.objects.filter(o=>o?.dataType==="poll"&&o?.dataPoll):[];}
  async function pollResponseCount(articleId,pollIndex=0){
    const local=read(`fp_poll_counts_${articleId}_${Number(pollIndex||0)}`,{count:0});
    let count=Number(local?.count||0);
    if(window.FPCloud?.fetchPollResults){
      try{
        const remote=await window.FPCloud.fetchPollResults(articleId,pollIndex);
        if(remote&&Number.isFinite(Number(remote.total))) return Number(remote.total);
      }catch(_){}
    }
    const cfg=window.FOLHA_SUPABASE||{};
    if(cfg.enabled&&cfg.url&&cfg.publishableKey&&window.supabase){
      try{if(!cfg.client)cfg.client=window.supabase.createClient(cfg.url,cfg.publishableKey);const {count:remote,error}=await cfg.client.from("poll_votes").select("voter_id",{count:"exact",head:true}).eq("article_id",String(articleId)).eq("poll_index",Number(pollIndex||0));if(!error&&Number.isFinite(remote))count=Number(remote);}catch(_){}
    }
    return count;
  }

  function moderationPreviewHTML(a){
    const esc2 = v => esc(v == null ? "" : String(v));
    const objects=Array.isArray(a.canvasJSON?.objects)?[...a.canvasJSON.objects].sort((x,y)=>{const dy=(Number(x?.top)||0)-(Number(y?.top)||0);return Math.abs(dy)>2?dy:(Number(x?.left)||0)-(Number(y?.left)||0);}):[];
    const textHTML=o=>esc2(o.text||"").replace(/\n/g,"<br>");
    let pollIndex=0;
    const body=objects.map(o=>{
      if(o?.dataType==='poll'&&o.dataPoll){const p=o.dataPoll||{},opts=Array.isArray(p.options)?p.options:[];pollIndex++;return `<section class="news-poll"><div class="text-[10px] font-extrabold uppercase tracking-wide text-[#1B5E20]">ENQUETE · ${esc2(p.kindLabel||'Escolha')}</div><h3 class="mt-1">${esc2(p.title||'Enquete')}</h3><p class="poll-kind">${p.kind==='multi'?'Você pode marcar mais de uma opção.':p.kind==='rating'?'Escolha uma nota de 1 a 5.':'Escolha uma opção.'}</p><div class="poll-options">${opts.map(x=>`<button type="button" disabled><span>${esc2(x)}</span></button>`).join('')}</div></section>`;}
      if(["textbox","i-text","text"].includes(o?.type)&&String(o.text||'').trim()){
        const style=o.dataTextStyle||'body';const fs=style==='title'?'2rem':style==='subtitle'?'1.25rem':'1rem';const fw=style==='body'?'500':'800';return `<div style="font-size:${fs};font-weight:${fw};line-height:1.65;margin:1.15rem 0">${textHTML(o)}</div>`;
      }
      if(o?.type==='image'&&o.src){return `<figure style="margin:1.5rem 0"><img loading="lazy" src="${esc2(o.src)}" alt="Imagem inserida na matéria" style="display:block;width:min(100%,680px);height:auto;margin:0 auto;border-radius:14px"><figcaption class="mt-2 text-xs text-slate-500">Imagem inserida pela redação</figcaption></figure>`;}
      if(o?.dataType==='video'&&o.dataVideoUrl){return `<figure style="margin:1.75rem 0"><div style="aspect-ratio:16/9;background:#111;border-radius:14px;overflow:hidden"><iframe src="${esc2(o.dataVideoUrl)}" title="Vídeo da matéria" loading="lazy" style="width:100%;height:100%;border:0" allowfullscreen></iframe></div><figcaption class="mt-2 text-xs text-slate-500">Vídeo incorporado pela redação</figcaption></figure>`;}
      return '';
    }).join('') || `<p class="text-slate-500">A matéria ainda não contém blocos para visualizar.</p>`;
    return `<div class="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-[#1E1E1E]"><header class="border-b border-slate-200 px-5 py-5 dark:border-slate-700"><div class="flex flex-wrap items-center gap-2"><span class="rounded-full bg-[#E8F2E9] px-2.5 py-1 text-[10px] font-extrabold text-[#1B5E20]">${esc2(a.category||'Notícia')}</span><span class="text-xs text-slate-500">${esc2(a.author||'')} · ${esc2(new Date(a.date||a.updatedAt||Date.now()).toLocaleString('pt-BR'))}</span></div><h3 class="mt-4 text-3xl font-extrabold leading-tight">${esc2(a.title||'Sem título')}</h3>${a.subtitle?`<p class="mt-3 text-base leading-7 text-slate-600 dark:text-slate-300">${esc2(a.subtitle)}</p>`:''}${a.coverURL?`<img src="${esc2(a.coverURL)}" alt="Capa da matéria" class="mt-5 w-full max-h-[420px] rounded-2xl object-cover">`:''}</header><main class="prose-folha px-5 py-6 sm:px-8 sm:py-8">${body}${a.videoUrl&&!objects.some(o=>o?.dataType==='video')?`<figure style="margin:1.75rem 0"><div style="aspect-ratio:16/9;background:#111;border-radius:14px;overflow:hidden"><iframe src="${esc2(a.videoUrl)}" title="Vídeo da matéria" loading="lazy" style="width:100%;height:100%;border:0" allowfullscreen></iframe></div></figure>`:''}</main></div>`;
  }

  function moderation(){
    const list=$("moderation-list");if(!list)return;
    const search=$('moderation-author-search'),sortControl=$('moderation-sort'),tabs=$('moderation-status-tabs'),pager=$('moderation-pagination');
    const states=['Todos','Rascunho','Pendente','Ajustes','Aprovado'];
    if(!states.includes(String(list.dataset.statusFilter||'')))list.dataset.statusFilter='Pendente';
    if(!Number.isFinite(Number(list.dataset.page))||Number(list.dataset.page)<1)list.dataset.page='1';
    const activeState=String(list.dataset.statusFilter||'Pendente'),pageSize=5;
    const dateTime=value=>{if(value==null||value==='')return 0;if(typeof value==='number')return Number.isFinite(value)?value:0;if(typeof value==='object'){if(typeof value.toDate==='function')return value.toDate().getTime()||0;if(Number.isFinite(Number(value.seconds)))return Number(value.seconds)*1000;}const time=Date.parse(String(value));return Number.isFinite(time)?time:0;};
    const moderationSession=read(KEYS.session,null)||{},chiefSession=isEditorChief(moderationSession),editorSession=isEditor(moderationSession),moderationUid=String(moderationSession.uid||'');
    const all=[...new Map(readArticles().filter(a=>a&&a.id).map(a=>[String(a.id),a])).values()].filter(article=>{
      if(chiefSession)return true;
      if(!editorSession)return false;
      const status=String(article.status||'Rascunho');
      if(status!=='Aprovado')return true;
      return Boolean(moderationUid)
        && String(article.authorUid||'')===moderationUid
        && dateTime(article.editorEditUntil)>Date.now();
    });
    const statusTitle={Todos:'Todas as matérias',Rascunho:'Rascunhos',Pendente:'Matérias em análise',Ajustes:'Matérias que necessitam de ajustes',Aprovado:'Matérias publicadas'};
    const statusCounts=Object.fromEntries(states.map(status=>[status,status==='Todos'?all.length:all.filter(a=>String(a.status||'Rascunho')===status).length]));
    tabs?.querySelectorAll('[data-moderation-filter]').forEach(button=>{
      const status=String(button.dataset.moderationFilter||'');
      const active=status===activeState;button.classList.toggle('is-active',active);button.setAttribute('aria-pressed',String(active));
      const count=button.querySelector('[data-moderation-count]');if(count)count.textContent=String(statusCounts[status]||0);
    });
    const titleNode=$('moderation-results-title');if(titleNode)titleNode.textContent=statusTitle[activeState]||'Matérias';
    const term=normalizeSearch(search?.value||'');
    const dateText=value=>{const ms=dateTime(value);return ms?new Date(ms).toLocaleString('pt-BR'):'Data não informada';};
    const categoryText=a=>Array.isArray(a.category)?a.category.filter(Boolean).join(' · '):String(a.category||'');
    const moderationReadMinutes=a=>{
      const objects=Array.isArray(a.canvasJSON?.objects)?a.canvasJSON.objects:[];
      const body=objects.map(o=>[o?.text,o?.dataPoll?.title,...(Array.isArray(o?.dataPoll?.options)?o.dataPoll.options:[])].filter(Boolean).join(' ')).join(' ');
      const words=[a.title,a.subtitle,typeof a.content==='string'?a.content:'',typeof a.text==='string'?a.text:'',body].filter(Boolean).join(' ').trim().split(/\s+/).filter(Boolean).length;
      return Math.max(1,Math.ceil(words/200));
    };
    const visibleArticles=all.filter(a=>activeState==='Todos'||String(a.status||'Rascunho')===activeState).filter(a=>{
      if(!term)return true;
      const objects=Array.isArray(a.canvasJSON?.objects)?a.canvasJSON.objects:[];
      const body=objects.map(o=>[o?.text,o?.dataPoll?.title,...(Array.isArray(o?.dataPoll?.options)?o.dataPoll.options:[])].filter(Boolean).join(' ')).join(' ');
      return normalizeSearch([a.title,a.subtitle,a.author,a.authorEmail,categoryText(a),a.feedback,a.status,a.content,a.text,body].filter(Boolean).join(' ')).includes(term);
    });
    const sortMode=String(sortControl?.value||'newest');
    if(sortMode==='alpha')visibleArticles.sort((a,b)=>String(a.title||'Sem título').localeCompare(String(b.title||'Sem título'),'pt-BR',{sensitivity:'base'}));
    else if(sortMode==='oldest')visibleArticles.sort((a,b)=>dateTime(a.updatedAt||a.date||a.createdAt)-dateTime(b.updatedAt||b.date||b.createdAt));
    else visibleArticles.sort((a,b)=>dateTime(b.approvedAt||b.updatedAt||b.date||b.createdAt)-dateTime(a.approvedAt||a.updatedAt||a.date||a.createdAt));
    const totalPages=Math.max(1,Math.ceil(visibleArticles.length/pageSize));
    const page=Math.max(1,Math.min(Number(list.dataset.page)||1,totalPages));list.dataset.page=String(page);
    const shown=visibleArticles.slice((page-1)*pageSize,page*pageSize);
    const windowPages=totalPages<=3?Array.from({length:totalPages},(_,i)=>i+1):(()=>{const start=Math.max(1,Math.min(page,totalPages-2));return [start,start+1,start+2];})();
    const coverFor=a=>[a.coverURL,a.thumbURL,a.image,a.imageURL].map(v=>String(v||'').trim()).find(v=>/^https?:\/\//i.test(v)||/^(?:\.\.?\/)?assets\//i.test(v))||'';
    const actionsFor=a=>{
      const id=esc(a.id),status=String(a.status||'Rascunho'),editHref=`editor.html?edit=${encodeURIComponent(a.id)}&return=moderar`;
      const returnAction=status==='Pendente'
        ?`<button type="button" data-adjust="${id}">Devolver para ajustes</button>`
        :['Aprovado','Ajustes'].includes(status)
          ?`<button type="button" data-back-draft="${id}">Devolver para rascunho</button>`
          :`<button type="button" disabled title="A matéria já está em rascunho">Devolver</button>`;
      const publishAction=status==='Pendente'?`<button type="button" data-post="${id}">Publicar</button>`:'';
      const highlightAction=chiefSession?`<button type="button" data-toggle-article-highlight="${id}">${(a.editorialHighlight===true||a.editorialHighlight===1||String(a.editorialHighlight).toLowerCase()==='true'||String(a.editorialHighlight).toLowerCase()==='sim')?'Remover destaque':'Atribuir destaque'}</button>`:'';
      return `<div class="fp-action-menu"><button type="button" class="fp-action-trigger" data-moderation-menu-toggle="${id}" aria-label="Ações para ${esc(a.title||'matéria')}" aria-expanded="false">⋯</button><div class="fp-action-dropdown" data-moderation-menu="${id}" hidden><button type="button" data-preview="${id}">Visualizar prévia</button>${returnAction}<a href="${editHref}">Editar</a>${publishAction}${highlightAction}<button type="button" class="is-danger" data-delete-article="${id}">Excluir</button></div></div>`;
    };
    list.innerHTML=shown.length?shown.map(a=>{
      const id=esc(a.id),title=esc(a.title||'Sem título'),category=esc(categoryText(a)||'Tema não informado'),author=esc(a.author||'Autor não informado'),cover=coverFor(a),status=String(a.status||'Rascunho');
      const editHref=`editor.html?edit=${encodeURIComponent(a.id)}&return=moderar`;
      const thumb=cover?`<img loading="lazy" src="${esc(cover)}" alt="Capa de ${title}">`:`<span aria-hidden="true" class="fp-moderation-thumb-placeholder">▤</span>`;
      const visibility=status==='Aprovado'?`<span class="fp-moderation-visibility ${a.visible===false?'is-hidden':'is-visible'}">${a.visible===false?'Oculta do público':'Visível no site'}</span>`:'';
      const highlight=a.editorialHighlight===true?'<span class="fp-article-highlight-badge">Destaques</span>':'';
      const feedback=a.feedback?`<p class="fp-moderation-feedback"><strong>Orientação editorial:</strong> ${esc(a.feedback)}</p>`:'';
      const feedbackForm=status==='Pendente'?`<div data-feedback-wrap="${id}" class="fp-moderation-feedback-form hidden"><textarea id="feedback-${id}" rows="3" class="site-input" placeholder="Explique o que precisa ser ajustado."></textarea><button type="button" data-send-feedback="${id}" class="fp-moderation-action is-primary">Enviar ao estudante</button></div>`:'';
      const submittedAt=dateText(a.createdAt||a.date||a.updatedAt||a.approvedAt);
      return `<article class="fp-moderation-row"><a class="fp-moderation-thumb fp-moderation-thumb-link" href="${editHref}" title="Editar ${title}">${thumb}</a><div class="fp-moderation-content"><h4><a href="${editHref}" title="Abrir matéria para editar">${title}</a></h4><div class="fp-moderation-meta-line"><span class="fp-moderation-category-chip">${category}</span>${highlight}<span class="fp-moderation-author-only" title="Conta que enviou">${author}</span><time class="fp-moderation-date" title="Data e hora de envio">${esc(submittedAt)}<span class="fp-compact-meta-dot" aria-hidden="true"> · </span><span class="fp-moderation-reading">${moderationReadMinutes(a)} min de leitura</span></time></div>${feedback}${feedbackForm}</div><div class="fp-moderation-row-status">${visibility}${statusBadge(a)}</div>${actionsFor(a)}</article>`;
    }).join(''):`<div class="fp-empty-state fp-moderation-empty"><span aria-hidden="true">⌕</span><strong>${term?'Nenhuma matéria encontrada':'Nenhuma matéria nesta seção'}</strong><p>${term?'Ajuste a pesquisa ou escolha outro estado.':'Não há matérias registradas com este estado no momento.'}</p></div>`;
    const from=visibleArticles.length?(page-1)*pageSize+1:0,to=Math.min(page*pageSize,visibleArticles.length);
    if(pager)pager.innerHTML=`<p>Mostrando ${from}–${to} de ${visibleArticles.length} matérias</p><nav class="fp-pagination" aria-label="Páginas de matérias"><button type="button" class="fp-page-btn fp-page-arrow" data-moderation-page="${page-1}" aria-label="Página anterior" ${page<=1?'disabled':''}>‹</button>${windowPages.map(number=>`<button type="button" class="fp-page-btn ${number===page?'is-current':''}" data-moderation-page="${number}" aria-current="${number===page?'page':'false'}">${number}</button>`).join('')}<button type="button" class="fp-page-btn fp-page-arrow" data-moderation-page="${page+1}" aria-label="Próxima página" ${page>=totalPages?'disabled':''}>›</button></nav>`;
    if(tabs&&tabs.dataset.bound!=='1'){tabs.dataset.bound='1';tabs.addEventListener('click',event=>{const button=event.target.closest('[data-moderation-filter]');if(!button)return;list.dataset.statusFilter=String(button.dataset.moderationFilter||'Pendente');list.dataset.page='1';moderation();});}
    bindSearchInput(search,()=>{list.dataset.page='1';moderation();});
    if(sortControl&&sortControl.dataset.bound!=='1'){sortControl.dataset.bound='1';sortControl.addEventListener('change',()=>{list.dataset.page='1';moderation();});}
    if(pager&&pager.dataset.bound!=='1'){pager.dataset.bound='1';pager.addEventListener('click',event=>{const button=event.target.closest('[data-moderation-page]');if(!button||button.disabled)return;const next=Number(button.dataset.moderationPage);if(Number.isFinite(next)){list.dataset.page=String(Math.max(1,next));moderation();}});}
    if(list.dataset.menuBound!=='1'){list.dataset.menuBound='1';list.addEventListener('click',event=>{const trigger=event.target.closest('[data-moderation-menu-toggle]');if(!trigger)return;const id=String(trigger.dataset.moderationMenuToggle||''),menu=list.querySelector(`[data-moderation-menu="${CSS.escape(id)}"]`);openFloatingActionMenu(trigger,menu,list);});}
    list.querySelectorAll('[data-preview]').forEach(button=>button.onclick=()=>{const a=readArticles().find(x=>String(x.id)===button.dataset.preview);if(!a)return;const modal=$('preview-modal');$('preview-title').textContent=a.title||'Pré-visualização';$('preview-content').innerHTML=moderationPreviewHTML(a);modal?.classList.remove('hidden');modal?.setAttribute('aria-hidden','false');document.body.classList.add('fp-preview-open');});
    list.querySelectorAll('[data-post]').forEach(button=>button.onclick=async()=>{
      const host=button.closest('.fp-moderation-row');
      const ensureBar=()=>{let box=host?.querySelector('[data-publish-progress]');if(!box&&host){box=document.createElement('div');box.setAttribute('data-publish-progress','');box.className='fp-moderation-progress';box.innerHTML='<div class="fp-moderation-progress-line"><span data-publish-label>Preparando…</span><strong data-publish-pct>0%</strong></div><div class="fp-moderation-progress-track"><div data-publish-bar></div></div>';host.querySelector('.fp-moderation-content')?.append(box);}return box;};
      const setP=(pct,label)=>{const box=ensureBar();if(!box)return;const amount=Math.max(0,Math.min(100,Number(pct)||0));box.querySelector('[data-publish-bar]').style.width=`${amount}%`;box.querySelector('[data-publish-pct]').textContent=`${Math.round(amount)}%`;box.querySelector('[data-publish-label]').textContent=label;};
      if(button.dataset.busy==='1')return;button.dataset.busy='1';button.disabled=true;
      try{const items=readArticles(),index=items.findIndex(x=>String(x.id)===button.dataset.post);if(index<0)throw new Error('A matéria não foi encontrada.');const article=items[index];if(article.status!=='Pendente')throw new Error('Esta matéria não está mais na fila de revisão.');const now=new Date().toISOString(),updated={...article,status:'Aprovado',visible:true,feedback:'',approvedAt:now,updatedAt:now};setP(3,'Preparando publicação…');const synced=await saveSingleArticle(updated,{cloudRequired:true,onProgress:setP});if(!synced?.id)throw new Error('O Firebase não confirmou a publicação.');setP(100,'Publicação salva no Firebase.');await new Promise(resolve=>setTimeout(resolve,220));list.dataset.statusFilter='Aprovado';list.dataset.page='1';moderation();announce('Matéria publicada e salva no Firebase. Ela já está liberada para Home e Notícias.');}
      catch(error){button.disabled=false;delete button.dataset.busy;announce(error?.message||'Não foi possível publicar a matéria.');}
    });
    list.querySelectorAll('[data-adjust]').forEach(button=>button.onclick=()=>document.querySelector(`[data-feedback-wrap="${CSS.escape(button.dataset.adjust)}"]`)?.classList.toggle('hidden'));
    list.querySelectorAll('[data-send-feedback]').forEach(button=>button.onclick=async()=>{const value=$('feedback-'+button.dataset.sendFeedback)?.value.trim();if(!value)return announce('Digite o feedback.');try{const items=readArticles(),index=items.findIndex(x=>String(x.id)===button.dataset.sendFeedback);if(index<0)return announce('A matéria não foi encontrada.');const updated={...items[index],status:'Ajustes',correctionCycle:true,feedback:value,updatedAt:new Date().toISOString()};await saveSingleArticle(updated,{cloudRequired:true});list.dataset.statusFilter='Ajustes';list.dataset.page='1';moderation();announce('Solicitação de ajustes enviada.');}catch(_){announce('Não foi possível salvar a solicitação de ajustes.');}});
    list.querySelectorAll('[data-back-draft]').forEach(button=>button.onclick=async()=>{try{const items=readArticles(),index=items.findIndex(x=>String(x.id)===button.dataset.backDraft);if(index<0)return announce('A publicação não foi encontrada.');const updated={...items[index],status:'Rascunho',visible:true,feedback:'',updatedAt:new Date().toISOString()};await saveSingleArticle(updated,{cloudRequired:true});list.dataset.statusFilter='Rascunho';list.dataset.page='1';moderation();announce('A publicação voltou para Rascunho e saiu do ar.');}catch(_){announce('Não foi possível voltar a publicação para Rascunho.');}});
    list.querySelectorAll('[data-toggle-article-highlight]').forEach(button=>button.onclick=async()=>{if(!isEditorChief(read(KEYS.session,null)))return announce('Somente o Editor-Chefe pode atribuir ou remover destaques.');if(button.dataset.busy==='1')return;button.dataset.busy='1';button.disabled=true;try{const items=readArticles(),index=items.findIndex(x=>String(x.id)===button.dataset.toggleArticleHighlight);if(index<0)throw new Error('A matéria não foi encontrada.');const article=items[index],currentlyEnabled=article.editorialHighlight===true||article.editorialHighlight===1||String(article.editorialHighlight).toLowerCase()==='true'||String(article.editorialHighlight).toLowerCase()==='sim',enabled=!currentlyEnabled,updated={...article,editorialHighlight:enabled,featured:enabled,updatedAt:new Date().toISOString()};await saveSingleArticle(updated,{cloudRequired:true});moderation();announce(enabled?'Destaque atribuído à matéria.':'Destaque removido da matéria.');}catch(error){button.disabled=false;delete button.dataset.busy;announce(error?.message||'Não foi possível atualizar o destaque.');}});
    list.querySelectorAll('[data-delete-article]').forEach(button=>button.onclick=async()=>{try{const items=readArticles(),article=items.find(x=>String(x.id)===button.dataset.deleteArticle);if(!article)return announce('A publicação não foi encontrada.');if(!confirm('Apagar esta matéria definitivamente? Esta ação não pode ser desfeita.'))return;await removeSingleArticle(article.id);try{Object.keys(localStorage).filter(key=>key.startsWith(`fp_poll_${article.id}:`)||key.startsWith(`fp_poll_counts_${article.id}_`)||key===`fp_poll_${article.id}`||key===`fp_poll_counts_${article.id}`).forEach(key=>localStorage.removeItem(key));}catch(_){}moderation();announce('Matéria excluída definitivamente.');}catch(_){announce('Não foi possível excluir a matéria. Tente novamente.');}});
  }

  async function users(s){
    if(!isEditorChief(s))return;
    const canManageRoles=true;
    const cloudIsEnabled=()=>{const enabled=fpCloudEnabled();return typeof enabled==='function'?enabled():Boolean(enabled);};
    const form=$("user-form"),box=$("users-list"),inactiveBox=$("revoked-users-list");
    if(!form||!box||!inactiveBox)return;
    let all=readUsers();
    if(cloudIsEnabled() && window.FPCloud.fetchEditorialUsers){
      try{
        const remote=await window.FPCloud.fetchEditorialUsers();
        if(Array.isArray(remote)){
          const map=new Map();
          all.forEach(u=>{if(!u)return;const key=String(u.uid||u.email||'').trim().toLowerCase();if(key)map.set(key,{...u});});
          remote.forEach(u=>{if(u){const key=String(u.uid||u.email||'').trim().toLowerCase();if(key){const mergedUser={...(map.get(key)||{}),...u};if(u.accessRevoked!==true&&!u.revocationMode)delete mergedUser.revocationMode;if(u.revocationMode==='spark-plan-b'&&!Object.prototype.hasOwnProperty.call(u,'profileRemovalCompleted'))delete mergedUser.profileRemovalCompleted;map.set(key,mergedUser);}}});
          all=[...map.values()];
          await window.FPStore?.setUsersLocal?.(all);
        }
      }catch(error){console.warn('[Folha do Paiquerê] não foi possível atualizar a lista da equipe:',error);}
    }

    let authorizations=[];
    let authMap=new Map();
    const refreshProfileAuthorizations=async()=>{
      try{authorizations=await window.FPCloud?.fetchProfileAuthorizations?.()||[];}
      catch(error){console.warn('[Folha do Paiquerê] não foi possível carregar autorizações de perfil:',error);authorizations=[];}
      authMap=new Map(authorizations.map(x=>[String(x.uid||x.studentUid||x.id||''),x]));
    };
    await refreshProfileAuthorizations();

    let activePage=1,inactivePage=1;
    const activeTabButton=document.querySelector('[data-team-status-tab="active"]');
    let currentView=document.querySelector('[data-team-status-tab].is-active')?.dataset.teamStatusTab||'active';
    if(!['active','inactive'].includes(currentView))currentView='active';
    const teamModal=$("team-new-access-modal"),deleteModal=$("team-delete-access-modal");
    const closeNewAccess=(force=false)=>{
      if(form.dataset.busy==='1'&&!force)return;
      if(teamModal){teamModal.classList.add('hidden');teamModal.setAttribute('aria-hidden','true');}
      form.reset();const status=$("team-new-access-status");if(status)status.textContent='';
    };
    const openNewAccess=()=>{
      if(!canManageRoles)return;
      form.reset();const status=$("team-new-access-status");if(status)status.textContent='';
      if(teamModal){teamModal.classList.remove('hidden');teamModal.setAttribute('aria-hidden','false');}
      requestAnimationFrame(()=>$('new-user-name')?.focus());
    };
    const closeDeleteModal=(force=false)=>{
      const submit=$("team-delete-access-confirm");if(submit?.dataset.busy==='1'&&!force)return;
      if(deleteModal){deleteModal.classList.add('hidden');deleteModal.setAttribute('aria-hidden','true');deleteModal.dataset.targetKey='';}
      const status=$("team-delete-access-status");if(status)status.textContent='';
    };
    const openDeleteModal=u=>{
      if(!canManageRoles||!u||u.protected||String(u.email||'').toLowerCase()===MASTER_EMAIL||String(u.uid||'')===String(s.uid||''))return;
      if(!deleteModal)return announce('O diálogo de confirmação de exclusão não está disponível.');
      deleteModal.dataset.targetKey=String(u.uid||u.email||'');
      const status=$("team-delete-access-status");if(status)status.textContent='';
      deleteModal.classList.remove('hidden');deleteModal.setAttribute('aria-hidden','false');
      requestAnimationFrame(()=>$('team-delete-access-cancel')?.focus());
    };
    const findUser=key=>{
      const value=String(key||'').trim().toLowerCase();
      return all.find(x=>String(x.uid||'').trim().toLowerCase()===value)
        ||all.find(x=>String(x.email||'').trim().toLowerCase()===value)||null;
    };
    const setTeamView=view=>{
      currentView=view==='inactive'?'inactive':'active';
      document.querySelectorAll('[data-team-status-tab]').forEach(button=>{
        const active=button.dataset.teamStatusTab===currentView;
        button.classList.toggle('is-active',active);button.setAttribute('aria-selected',String(active));
      });
      document.querySelectorAll('[data-team-view]').forEach(panel=>{
        const active=panel.dataset.teamView===currentView;
        panel.classList.toggle('hidden',!active);panel.hidden=!active;
      });
      render();
    };
    const profilePermissionAction=u=>{
      const role=String(u.role||'Estudante'),uid=String(u.uid||'');
      const exempt=['Editor','Editor-Chefe'].includes(role)||String(u.email||'').toLowerCase()===MASTER_EMAIL||u.protected===true;
      if(exempt)return '';
      if(!uid)return '<button type="button" disabled title="Esta conta não possui UID do Firebase">Permitir alteração</button>';
      const authorized=authMap.get(uid)?.authorized===true;
      return authorized
        ? `<button type="button" data-profile-deny="${esc(uid)}">Retirar permissão</button>`
        : `<button type="button" data-profile-authorize="${esc(uid)}">Permitir alteração</button>`;
    };
    const roleAction=u=>{
      const role=String(u.role||'Estudante');
      const next=role==='Estudante'?'Editor':role==='Editor'?'Editor-Chefe':'Estudante';
      const label=role==='Editor-Chefe'?'Rebaixar para Estudante':`Promover a ${next}`;
      return `<button type="button" data-cycle-role="${esc(u.uid||u.email||'')}">${label}</button>`;
    };
    const menuHTML=(u,inactive,key)=>{
      const protectedUser=!!u.protected||String(u.email||'').toLowerCase()===MASTER_EMAIL;
      if(protectedUser)return '<span class="fp-team-protected">Administrador Master · protegido</span>';
      const content=inactive
        ? (u.revocationMode==='spark-plan-b'
          ? `<button type="button" class="is-danger" data-delete-user="${esc(key)}">Remover perfil e dados</button>`
          : `<button type="button" data-restore-user="${esc(key)}">Reativar conta</button><button type="button" class="is-danger" data-delete-user="${esc(key)}">Remover perfil e dados</button>`)
        : `${profilePermissionAction(u)}${roleAction(u)}<button type="button" data-adjust-access="${esc(key)}">Ajustar acesso</button><button type="button" class="is-danger" data-remove-user="${esc(key)}">Remover acesso</button>`;
      return `<div class="fp-action-menu fp-team-action-menu"><button type="button" class="fp-action-trigger fp-team-menu-trigger" data-team-menu-toggle="${esc(key)}" aria-label="Ações para ${esc(u.name||u.email||'acesso')}" aria-expanded="false">⋯</button><div class="fp-action-dropdown" data-team-menu="${esc(key)}" hidden>${content}</div></div>`;
    };
    const safeAvatar=u=>{
      const value=String(u.avatar||u.photoURL||'').trim();
      return /^https:\/\//i.test(value)?value:'';
    };
    const initials=u=>String(u.name||u.email||'?').trim().split(/\s+/).slice(0,2).map(part=>part[0]||'').join('').toLocaleUpperCase('pt-BR')||'?';
    const dateValue=value=>{if(value==null||value==='')return 0;if(typeof value==='number')return Number.isFinite(value)?value:0;if(typeof value==='object'){if(typeof value.toDate==='function')return value.toDate().getTime()||0;if(Number.isFinite(Number(value.seconds)))return Number(value.seconds)*1000;}const parsed=Date.parse(String(value));return Number.isFinite(parsed)?parsed:0;};
    const renderPager=(host,total,page,kind)=>{
      if(!host)return;
      const pageSize=5,totalPages=Math.max(1,Math.ceil(total/pageSize));
      const from=total?(page-1)*pageSize+1:0,to=Math.min(page*pageSize,total);
      const pages=totalPages<=3?Array.from({length:totalPages},(_,i)=>i+1):[Math.max(1,Math.min(page,totalPages-2)),Math.max(1,Math.min(page,totalPages-2))+1,Math.max(1,Math.min(page,totalPages-2))+2];
      host.innerHTML=`<p>Mostrando ${from}–${to} de ${total} acessos</p>${totalPages>1?`<nav class="fp-pagination" aria-label="Páginas de contas ${kind==='active'?'ativas':'desativas'}"><button type="button" class="fp-page-btn fp-page-arrow" data-team-page="${kind}:${page-1}" aria-label="Página anterior" ${page<=1?'disabled':''}>‹</button>${pages.map(n=>`<button type="button" class="fp-page-btn ${n===page?'is-current':''}" data-team-page="${kind}:${n}" aria-current="${n===page?'page':'false'}">${n}</button>`).join('')}<button type="button" class="fp-page-btn fp-page-arrow" data-team-page="${kind}:${page+1}" aria-label="Próxima página" ${page>=totalPages?'disabled':''}>›</button></nav>`:''}`;
      host.onclick=event=>{
        const button=event.target.closest('[data-team-page]');if(!button||button.disabled)return;
        const [which,pageText]=String(button.dataset.teamPage||'').split(':');const next=Number(pageText);
        if(!Number.isFinite(next))return;
        if(which==='active')activePage=next;else inactivePage=next;
        render();
      };
    };
    const renderRows=(records,inactive)=>{
      const target=inactive?inactiveBox:box;
      const pageSize=5,totalPages=Math.max(1,Math.ceil(records.length/pageSize));
      let page=inactive?inactivePage:activePage;
      page=Math.max(1,Math.min(page,totalPages));
      if(inactive)inactivePage=page;else activePage=page;
      const shown=records.slice((page-1)*pageSize,page*pageSize);
      target.innerHTML=shown.length?shown.map(u=>{
        const key=String(u.uid||u.email||''),avatar=safeAvatar(u),role=String(u.role||'Estudante');
        const roleClass=role==='Editor-Chefe'?'fp-team-role-chief':role==='Editor'?'fp-team-role-editor':'fp-team-role-student';
        const permissionAuthorized=!inactive&&u.accessRevoked!==true&&(['Editor','Editor-Chefe'].includes(role)||String(u.email||'').toLowerCase()===MASTER_EMAIL||authMap.get(String(u.uid||''))?.authorized===true);
        const statusClass=permissionAuthorized?'fp-team-status-allowed':'fp-team-status-blocked';
        const statusText=permissionAuthorized?'Permitido':'Bloqueado';
        const publicProfileHref=u.uid?`perfil.html?uid=${encodeURIComponent(String(u.uid))}`:(u.email?`perfil.html?email=${encodeURIComponent(String(u.email))}`:'perfil.html');
        const emailMarkup=esc(u.email||'Conta não informada').replace(/([@._+-])/g,'$1<wbr>');
        return `<tr data-team-user-row="${esc(key)}"><td><div class="fp-team-user-cell"><a class="fp-team-profile-link fp-team-avatar" href="${esc(publicProfileHref)}" aria-label="Abrir perfil público de ${esc(u.name||u.email||'usuário')}"><span aria-hidden="true">${esc(initials(u))}</span>${avatar?`<img class="fp-team-avatar-image" src="${esc(avatar)}" alt="" loading="lazy">`:''}</a><span class="fp-team-user-details"><a class="fp-team-name-link fp-team-user-name" href="${esc(publicProfileHref)}">${esc(u.name||'Sem nome')}</a><span class="fp-team-user-email">${emailMarkup}</span></span></div></td><td><span class="fp-team-role-badge ${roleClass}">${esc(role)}</span></td><td><span class="fp-team-status-badge ${statusClass}">${statusText}</span></td><td class="fp-team-row-actions">${menuHTML(u,inactive,key)}</td></tr>`;
      }).join(''):`<tr><td colspan="4" class="fp-team-empty-cell">${inactive?'Nenhuma conta desativa encontrada.':'Nenhuma conta ativa encontrada.'}</td></tr>`;
      target.querySelectorAll('.fp-team-avatar-image').forEach(image=>{image.onerror=()=>image.remove();});
      target.querySelectorAll('[data-profile-authorize]').forEach(button=>button.onclick=async()=>{
        if(!canManageRoles)return;
        const uid=String(button.dataset.profileAuthorize||'');if(!uid)return announce('Esta conta não possui um UID do Firebase para receber autorização.');
        button.disabled=true;const result=await window.FPCloud?.setProfileAuthorization?.(uid,true);
        if(!result?.ok){announce(result?.message||'Não foi possível permitir alterações.');button.disabled=false;return;}
        await refreshProfileAuthorizations();render();announce('Alterações de perfil autorizadas.');
      });
      target.querySelectorAll('[data-profile-deny]').forEach(button=>button.onclick=async()=>{
        if(!canManageRoles)return;
        const uid=String(button.dataset.profileDeny||'');if(!uid)return announce('Esta conta não possui UID do Firebase.');
        button.disabled=true;const result=await window.FPCloud?.setProfileAuthorization?.(uid,false);
        if(!result?.ok){announce(result?.message||'Não foi possível retirar a permissão.');button.disabled=false;return;}
        await refreshProfileAuthorizations();render();announce('Permissão de alteração do perfil retirada.');
      });
      target.querySelectorAll('[data-cycle-role]').forEach(button=>button.onclick=async()=>{
        if(!canManageRoles)return;
        const u=findUser(button.dataset.cycleRole);if(!u||u.protected||String(u.email||'').toLowerCase()===MASTER_EMAIL||u.accessRevoked)return;
        const currentRole=String(u.role||'Estudante'),nextRole=currentRole==='Estudante'?'Editor':currentRole==='Editor'?'Editor-Chefe':'Estudante';
        button.disabled=true;
        try{
          if(cloudIsEnabled()){
            if(!u.uid)throw new Error('Este acesso ainda não possui UID Firebase.');
            const result=await window.FPCloud.setUserRole(u.uid,nextRole);if(!result?.ok)throw new Error(result?.message||'Não foi possível atualizar o cargo no Firebase.');
            const remote=await window.FPCloud.fetchEditorialUsers?.();
            if(Array.isArray(remote)){const map=new Map(remote.map(x=>[String(x.uid||'').toLowerCase(),x]));all=all.map(x=>map.get(String(x.uid||'').toLowerCase())||x);await window.FPStore?.setUsersLocal?.(all);}else u.role=nextRole;
          }else{u.role=nextRole;await saveUsers(all);}
          render();announce('Cargo atualizado para '+nextRole+'.');
        }catch(error){button.disabled=false;announce(error?.message||'Não foi possível atualizar o cargo.');}
      });
      target.querySelectorAll('[data-adjust-access]').forEach(button=>button.onclick=()=>{
        if(!canManageRoles)return;const u=findUser(button.dataset.adjustAccess);
        if(u&&!u.protected&&String(u.email||'').toLowerCase()!==MASTER_EMAIL)openAdjustAccess(u);
      });
      target.querySelectorAll('[data-remove-user]').forEach(button=>button.onclick=async()=>{
        if(!canManageRoles)return;const u=findUser(button.dataset.removeUser);if(!u)return;
        if(u.protected||String(u.email||'').toLowerCase()===MASTER_EMAIL)return announce('O Administrador Master não pode ser removido.');
        if(String(u.uid||'')===String(s.uid||''))return announce('Você não pode remover o próprio acesso.');
        if(!confirm('Remover este acesso? O cadastro e os dados serão preservados e poderão ser reativados.'))return;
        button.disabled=true;
        if(cloudIsEnabled()){
          if(!u.uid){button.disabled=false;return announce('Este acesso ainda não possui UID Firebase.');}
          const result=await window.FPCloud.revokeAccess(u.uid);if(!result?.ok){button.disabled=false;return announce(result.message||'Não foi possível remover o acesso no Firebase.');}
        }
        u.accessRevoked=true;u.revokedAt=new Date().toISOString();u.welcomeTourCompleted=false;delete u.welcomeTourAcceptedAt;
        if(cloudIsEnabled())await window.FPStore?.setUsersLocal?.(all);else await saveUsers(all);
        render();announce('Acesso desativado. O perfil e os dados compartilhados foram preservados.');
      });
      target.querySelectorAll('[data-restore-user]').forEach(button=>button.onclick=async()=>{
        if(!canManageRoles)return;const u=findUser(button.dataset.restoreUser);if(!u)return;
        button.disabled=true;
        if(cloudIsEnabled()){
          if(!u.uid){button.disabled=false;return announce('Este acesso ainda não possui UID Firebase.');}
          const result=await window.FPCloud.restoreAccess(u.uid);if(!result?.ok){button.disabled=false;return announce(result.message||'Não foi possível reativar o acesso no Firebase.');}
        }
        u.accessRevoked=false;u.welcomeTourCompleted=false;delete u.welcomeTourAcceptedAt;delete u.revokedAt;delete u.revocationMode;
        if(cloudIsEnabled())await window.FPStore?.setUsersLocal?.(all);else await saveUsers(all);
        render();announce('Acesso reativado.');
      });
      target.querySelectorAll('[data-delete-user]').forEach(button=>button.onclick=()=>{
        const u=findUser(button.dataset.deleteUser);if(!u)return;
        if(u.protected||String(u.email||'').toLowerCase()===MASTER_EMAIL)return announce('O Administrador Master não pode ser excluído.');
        if(String(u.uid||'')===String(s.uid||''))return announce('Você não pode excluir a própria conta de administração.');
        openDeleteModal(u);
      });
      target.onclick=event=>{
        const trigger=event.target.closest('[data-team-menu-toggle]');if(!trigger)return;
        const key=String(trigger.dataset.teamMenuToggle||''),menu=target.querySelector(`[data-team-menu="${CSS.escape(key)}"]`);
        openFloatingActionMenu(trigger,menu,target);
      };
    };
    const render=()=>{
      const queryText=normalizeSearch($('team-users-search')?.value||'');
      const roleFilter=String($('team-users-role-filter')?.value||'all');
      const sortMode=String($('team-users-sort')?.value||'default');
      // Tombstones do Plano B permanecem no Firestore para impedir a recriação do perfil
      // enquanto a conta Auth é removida manualmente, mas deixam de aparecer na equipe
      // quando a limpeza foi concluída. Tombstones com profileRemovalCompleted:false
      // continuam visíveis na aba de inativos para permitir uma nova tentativa.
      const base=all.filter(Boolean).filter(u=>!(u.revocationMode==='spark-plan-b'&&u.profileRemovalCompleted===true));
      const active=base.filter(u=>!u.accessRevoked);
      const inactive=base.filter(u=>!!u.accessRevoked);
      const matches=(u,isInactive)=>{
        const role=String(u.role||'Estudante');
        const permissionAuthorized=!isInactive&&u.accessRevoked!==true&&(['Editor','Editor-Chefe'].includes(role)||String(u.email||'').toLowerCase()===MASTER_EMAIL||authMap.get(String(u.uid||''))?.authorized===true);
        const permissionLabel=permissionAuthorized?'Permitido':'Bloqueado';
        const haystack=normalizeSearch(`${u.name||''} ${u.email||''} ${role} ${permissionLabel} ${isInactive?'inativo revogado':'ativo'}`);
        return (!queryText||haystack.includes(queryText))
          && (roleFilter==='all'||role===roleFilter);
      };
      const sortRows=rows=>{
        const result=rows.filter(u=>matches(u,!!u.accessRevoked));
        if(sortMode==='alpha')result.sort((a,b)=>String(a.name||'').localeCompare(String(b.name||''),'pt-BR',{sensitivity:'base'}));
        else result.sort((a,b)=>dateValue(b.createdAt||b.updatedAt)-dateValue(a.createdAt||a.updatedAt));
        return result;
      };
      const activeRows=sortRows(active),inactiveRows=sortRows(inactive);
      $('team-active-count')&&($('team-active-count').textContent=String(active.length));
      $('team-inactive-count')&&($('team-inactive-count').textContent=String(inactive.length));
      renderRows(activeRows,false);renderRows(inactiveRows,true);
      renderPager($('team-active-pagination'),activeRows.length,activePage,'active');
      renderPager($('team-inactive-pagination'),inactiveRows.length,inactivePage,'inactive');
      document.querySelectorAll('[data-team-status-tab]').forEach(button=>button.onclick=()=>setTeamView(button.dataset.teamStatusTab));
    };

    const openAdjustAccess=async(u)=>{
      const modal=$('access-adjust-modal'),adjustForm=$('access-adjust-form');if(!modal||!adjustForm)return;
      adjustForm.dataset.uid=String(u.uid||'');
      $('access-adjust-name').value=String(u.name||'');$('access-adjust-email').value=String(u.email||'');
      $('access-adjust-current-password').value='';$('access-adjust-new-password').value='';
      $('access-adjust-current-label').textContent=String(u.email||'');$('access-adjust-status').textContent='';
      modal.classList.remove('hidden');modal.setAttribute('aria-hidden','false');
      requestAnimationFrame(()=>$('access-adjust-name')?.focus());
    };
    const closeAdjustAccess=()=>{const modal=$('access-adjust-modal'),adjustForm=$('access-adjust-form');if(modal){modal.classList.add('hidden');modal.setAttribute('aria-hidden','true');}if(adjustForm)adjustForm.reset();};
    $('access-adjust-cancel')&&( $('access-adjust-cancel').onclick=closeAdjustAccess );
    $('access-adjust-close')&&( $('access-adjust-close').onclick=closeAdjustAccess );
    const adjustForm=$('access-adjust-form');
    if(adjustForm)adjustForm.onsubmit=async e=>{
      e.preventDefault();if(!canManageRoles)return;
      const targetUid=String(adjustForm.dataset.uid||''),target=all.find(x=>String(x.uid||'')===targetUid);if(!target)return;
      const name=$('access-adjust-name')?.value.trim()||'',email=normalizeEmail($('access-adjust-email')?.value||'');
      const currentPassword=$('access-adjust-current-password')?.value||'',newPassword=$('access-adjust-new-password')?.value||'',status=$('access-adjust-status');
      if(!name||!email)return announce('Preencha nome e identificador de login.');
      if(!looksLikeEmail(email))return announce('Informe um identificador de login válido, como nome@escola.pr.gov.br ou nome@gmail.com.');
      if(!currentPassword){if(status)status.textContent='Informe a senha atual deste acesso para confirmar o ajuste.';return;}
      const btn=$('access-adjust-save');if(btn){btn.disabled=true;btn.textContent='Salvando…';}
      try{const result=await window.FPCloud?.updateEditorialAccess?.(target.uid,{name,email,currentPassword,newPassword});if(!result?.ok)throw new Error(result?.message||'Não foi possível ajustar o acesso.');const data=result.data||{};target.name=data.name||name;target.email=data.email||email;await window.FPStore?.setUsersLocal?.(all);if(status)status.textContent='Dados do acesso atualizados no Firebase.';render();announce('Acesso ajustado com sucesso.');setTimeout(closeAdjustAccess,450);}
      catch(error){if(status)status.textContent=error?.message||'Não foi possível ajustar o acesso.';announce(error?.message||'Não foi possível ajustar o acesso.');}
      finally{if(btn){btn.disabled=false;btn.textContent='Salvar alterações';}}
    };

    $('team-new-access-open')&&( $('team-new-access-open').onclick=openNewAccess );
    $('team-new-access-cancel')&&( $('team-new-access-cancel').onclick=closeNewAccess );
    $('team-new-access-close')&&( $('team-new-access-close').onclick=closeNewAccess );
    teamModal&&(teamModal.onclick=event=>{if(event.target===teamModal)closeNewAccess();});
    if(!window.__fpTeamAccessEscapeBound){window.__fpTeamAccessEscapeBound=true;document.addEventListener('keydown',event=>{if(event.key!=='Escape')return;const newModal=$('team-new-access-modal'),deleteDialog=$('team-delete-access-modal');if(newModal&&!newModal.classList.contains('hidden')&&form.dataset.busy!=='1'){newModal.classList.add('hidden');newModal.setAttribute('aria-hidden','true');form.reset();const status=$('team-new-access-status');if(status)status.textContent='';}if(deleteDialog&&!deleteDialog.classList.contains('hidden')&&$('team-delete-access-confirm')?.dataset.busy!=='1'){deleteDialog.classList.add('hidden');deleteDialog.setAttribute('aria-hidden','true');deleteDialog.dataset.targetKey='';const status=$('team-delete-access-status');if(status)status.textContent='';}});}
    $('team-users-search')&&( $('team-users-search').oninput=()=>{activePage=inactivePage=1;render();} );
    $('team-users-role-filter')&&( $('team-users-role-filter').onchange=()=>{activePage=inactivePage=1;render();} );
    $('team-users-sort')&&( $('team-users-sort').onchange=()=>{activePage=inactivePage=1;render();} );

    const cancelDelete=$('team-delete-access-cancel'),closeDelete=$('team-delete-access-close');
    if(cancelDelete)cancelDelete.onclick=closeDeleteModal;if(closeDelete)closeDelete.onclick=closeDeleteModal;
    if(deleteModal)deleteModal.onclick=event=>{if(event.target===deleteModal)closeDeleteModal();};
    const deleteConfirm=$('team-delete-access-confirm');
    if(deleteConfirm)deleteConfirm.onclick=async()=>{
      if(!canManageRoles||deleteConfirm.dataset.busy==='1')return;
      const key=String(deleteModal?.dataset.targetKey||''),target=findUser(key);if(!target)return closeDeleteModal();
      if(target.protected||String(target.email||'').toLowerCase()===MASTER_EMAIL||String(target.uid||'')===String(s.uid||''))return announce('Esta conta não pode ser excluída por este fluxo.');
      const status=$('team-delete-access-status');deleteConfirm.dataset.busy='1';deleteConfirm.disabled=true;deleteConfirm.textContent='Revogando…';if(status)status.textContent='Revogando o acesso, limpando os dados do perfil e removendo o perfil público…';
      try{
        if(cloudIsEnabled()){
          if(!target.uid)throw new Error('A conta não possui UID Firebase. Não é seguro tentar esta operação sem o UID.');
          const result=await window.FPCloud.revokeAndHideEditorialAccess?.(target.uid);
          // A revogação pode ter sido concluída mesmo se a remoção do espelho público falhar.
          if(result?.accessRevoked||result?.data?.accessRevoked){
            const dataUser=result?.data?.user||{};
            all=all.map(u=>String(u.uid||'')===String(target.uid)?{
              ...u,...dataUser,uid:String(target.uid),accessRevoked:true,
              revocationMode:'spark-plan-b',
              profileRemovalCompleted:dataUser.profileRemovalCompleted===true?true:(dataUser.profileRemovalCompleted===false?false:(u.profileRemovalCompleted===true)),
              bio:'',academicHistory:'',assignedTitle:'',profileYear:'',schoolYear:'',
              contributions:[],socialLinks:[],avatar:'',profileEditAllowance:0,profileEditAuthorized:false,welcomeTourCompleted:false,welcomeTourAcceptedAt:null
            }:u);
            await window.FPStore?.setUsersLocal?.(all);
            setTeamView('inactive');
          }
          if(!result?.ok)throw new Error(result?.message||'Não foi possível concluir a revogação e remoção do perfil.');
          closeDeleteModal(true);setTeamView('inactive');
          const warningText=Array.isArray(result.warnings)&&result.warnings.length?` Aviso: ${result.warnings.join(' ')}`:'';
          announce('Acesso revogado e perfil público removido. A conta ainda existe no Firebase Authentication e precisa ser excluída manualmente no Console Firebase. Matérias, conquistas e contribuições compartilhadas foram preservadas.'+warningText);
        }else{
          all=all.filter(u=>String(u.uid||u.email||'').toLowerCase()!==String(target.uid||target.email||'').toLowerCase());
          await saveUsers(all);closeDeleteModal(true);render();announce('Registro removido apenas desta lista local. Nenhum acesso Firebase nem conta de autenticação foi alterado.');
        }
      }catch(error){if(status)status.textContent=error?.message||'Não foi possível concluir a operação.';announce(error?.message||'Não foi possível concluir a operação.');}
      finally{delete deleteConfirm.dataset.busy;deleteConfirm.disabled=false;deleteConfirm.textContent='Revogar e remover perfil';}
    };

    form.onsubmit=async e=>{
      e.preventDefault();if(form.dataset.busy==='1')return;
      if(!canManageRoles)return announce('Somente o Editor-Chefe pode cadastrar novos acessos.');
      const name=$('new-user-name')?.value.trim()||'',email=normalizeEmail($('new-user-email')?.value||''),password=$('new-user-password')?.value||'',roleValue=$('new-user-role')?.value||'Estudante';
      if(!name||!email||!password)return announce('Preencha nome, endereço da conta e senha.');
      if(password.length<6)return announce('A senha precisa ter pelo menos 6 caracteres.');
      if(!looksLikeEmail(email))return announce('Não foi possível validar o endereço da conta. Use o endereço completo, como nome@escola.pr.gov.br ou nome@gmail.com.');
      const normalizedRole=['Editor-Chefe','Editor'].includes(roleValue)?roleValue:'Estudante';
      const submitButton=$('new-user-submit')||form.querySelector('button[type="submit"]'),submitLabel=submitButton?.textContent||'Cadastrar acesso';
      form.dataset.busy='1';if(submitButton){submitButton.disabled=true;submitButton.textContent='Cadastrando…';}
      try{
        if(cloudIsEnabled()){
          if(typeof window.FPCloud?.provisionUser!=='function')throw new Error('O módulo de cadastro do Firebase não está disponível.');
          const cloud=await window.FPCloud.provisionUser({name,email,password,role:normalizedRole});
          if(!cloud?.ok)throw new Error(cloud?.message||'Não foi possível cadastrar o acesso no Firebase.');
          const created=cloud.data||{};if(!created.uid)throw new Error('O Firebase não retornou o identificador da nova conta. Verifique a lista antes de tentar novamente.');
          const createdUser={uid:String(created.uid),email:normalizeEmail(created.email||email),name,role:created.role||normalizedRole,protected:false,createdAt:new Date().toISOString(),contributions:[],accessRevoked:false,welcomeTourCompleted:false};
          const index=all.findIndex(u=>String(u.uid||'')===createdUser.uid||normalizeEmail(u.email||'')===createdUser.email);if(index>=0)all[index]={...all[index],...createdUser};else all.push(createdUser);
          try{await window.FPStore?.setUsersLocal?.(all);}catch(error){console.warn('[Folha do Paiquerê] cadastro concluído, mas a lista local não atualizou:',error);}
          closeNewAccess(true);render();announce('Novo acesso cadastrado no Firebase.');return;
        }
        const existing=all.find(u=>normalizeEmail(u.email||'')===email);
        if(existing){
          if(existing.revocationMode==='spark-plan-b')return announce('Este acesso foi removido pelo Plano B. Confirme primeiro a exclusão da conta antiga em Firebase Authentication → Users; depois cadastre o novo acesso.');
          if(existing.accessRevoked){if(!confirm('Este perfil já existe com acesso revogado. Deseja restaurá-lo e atualizar seus dados de acesso?'))return;existing.accessRevoked=false;existing.welcomeTourCompleted=false;delete existing.welcomeTourAcceptedAt;delete existing.revokedAt;existing.name=name;existing.password=password;existing.role=normalizedRole;existing.updatedAt=new Date().toISOString();await saveUsers(all);closeNewAccess(true);render();announce('Acesso restaurado e dados atualizados.');return;}
          return announce('Esse e-mail já está cadastrado.');
        }
        all.push({name,email,password,role:normalizedRole,protected:false,createdAt:new Date().toISOString(),contributions:[],accessRevoked:false,welcomeTourCompleted:false});
        await saveUsers(all);closeNewAccess(true);render();announce('Novo acesso autorizado no ambiente local.');
      }catch(error){console.error('[Folha do Paiquerê] falha ao cadastrar acesso:',error);const status=$('team-new-access-status');if(status)status.textContent=error?.message||'Não foi possível cadastrar o acesso. Verifique a conexão e tente novamente.';announce(error?.message||'Não foi possível cadastrar o acesso.');}
      finally{delete form.dataset.busy;if(submitButton){submitButton.disabled=false;submitButton.textContent=submitLabel;}}
    };

    // Abas compartilham pesquisa e filtros, mas conservam paginação independente.
    if(activeTabButton&&!activeTabButton.classList.contains('is-active')&&!document.querySelector('[data-team-status-tab].is-active'))setTeamView('active');
    render();setTeamView(currentView);
  }

  async function profile(s){
    const form=$('profile-form'),input=$('profile-image'),preview=$('profile-avatar-preview');
    if(!form||!input)return;
    // Nunca recarrega os campos enquanto a pessoa está editando: foco/visibilidade
    // podem disparar atualizações de perfil e não devem apagar mudanças não salvas.
    if(form.dataset.profileEditing==='1')return;

    if(fpCloudEnabled() && s.uid){
      try{
        const live=await window.FPCloud.loadProfile?.(s.uid);
        if(live){
          const existing=readUsers();
          // Quando o e-mail do documento existe, ele deve prevalecer no registro
          // local. O e-mail de sessão não pode substituir silenciosamente o valor
          // canônico usado pelo espelho público e pelas regras do Firestore.
          const canonicalEmail=String(live.email||s.email||'').trim();
          const liveEmail=canonicalEmail.toLowerCase();
          const merged=[...existing.filter(u=>String(u.uid||'')!==String(s.uid||'') && (!liveEmail||String(u.email||'').toLowerCase()!==liveEmail)),{...live,email:canonicalEmail,uid:s.uid}];
          await saveUsersLocal(merged);
        }
      }catch(_){}
    }

    const getUser=()=>readUsers().find(x=>String(x.uid||'')===String(s.uid||'')||String(x.email||'').toLowerCase()===String(s.email||'').toLowerCase());
    const initials=v=>String(v||'?').split(/\s+/).map(x=>x[0]).filter(Boolean).slice(0,2).join('').toUpperCase();
    const wordCount=value=>String(value||'').trim().split(/\s+/).filter(Boolean).length;
    const normText=value=>String(value??'').normalize('NFKC').replace(/[\u200B-\u200D\uFEFF]/g,'').trim().toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[\u0300-\u036f]/g,'');
    const identityParts=(value,profile={})=>{
      const raw=value&&typeof value==='object'?value:null;
      const uidValue=String(profile?.uid||raw?.uid||'').trim().toLowerCase();
      const emailValue=String(profile?.email||raw?.email||'').trim().toLowerCase();
      const stringValue=typeof value==='string'?String(value).trim():'';
      const inferredEmail=!emailValue&&stringValue.includes('@')?stringValue.toLowerCase():'';
      const rawName=profile?.name||raw?.name||(!inferredEmail?stringValue:'');
      return {uid:uidValue,email:emailValue||inferredEmail,name:normText(rawName)};
    };
    const identityMatches=(aValue,aProfile,bValue,bProfile)=>{
      const a=identityParts(aValue,aProfile),b=identityParts(bValue,bProfile);
      if(a.uid&&b.uid){if(a.uid===b.uid)return true;return Boolean(a.email&&b.email&&a.email===b.email);}
      if(a.email&&b.email)return a.email===b.email;
      return Boolean(a.name&&b.name&&a.name===b.name);
    };
    const creditRawEntries=value=>{
      if(Array.isArray(value))return value.flatMap(creditRawEntries);
      if(value&&typeof value==='object'){
        if(value.uid||value.email||value.name)return [value];
        return Object.values(value).flatMap(creditRawEntries);
      }
      const raw=String(value??'').trim();
      return raw?raw.split(/[,;|\n]/).map(v=>v.trim()).filter(Boolean):[];
    };
    const creditProfileEntries=(article,key)=>{
      const raw=article?.creditProfiles?.[key];
      if(Array.isArray(raw))return raw.filter(Boolean);
      if(raw&&typeof raw==='object'){
        if(raw.uid||raw.email||raw.name)return [raw];
        return Object.values(raw).flatMap(v=>Array.isArray(v)?v:(v&&typeof v==='object'?[v]:[])).filter(Boolean);
      }
      return [];
    };
    const platformFor=(name,url)=>{
      let host='';try{host=new URL(url).hostname.toLowerCase().replace(/^www\./,'');}catch(_){}
      const hay=`${String(name||'').toLowerCase()} ${host}`;
      if(/instagram|instagr\.am/.test(hay))return 'instagram';
      if(/tiktok/.test(hay))return 'tiktok';
      if(/github/.test(hay))return 'github';
      if(/youtube|youtu\.be/.test(hay))return 'youtube';
      if(/linkedin/.test(hay))return 'linkedin';
      if(/facebook|fb\.com/.test(hay))return 'facebook';
      if(/(^|\s)x($|\s)|twitter/.test(hay)||host==='x.com')return 'x';
      if(/twitch/.test(hay))return 'twitch';
      if(/discord/.test(hay))return 'discord';
      return 'website';
    };
    const socialMark=platform=>({instagram:'◎',tiktok:'♪',github:'⌘',youtube:'▶',linkedin:'in',facebook:'f',x:'𝕏',twitch:'▰',discord:'◉',website:'↗'}[platform]||'↗');
    const normalizeSocialIconSource=raw=>{
      let value=String(raw??'').trim();if(!value)return '';
      if(/<img\b/i.test(value)){const match=value.match(/<img\b[^>]*\bsrc\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s"'=<>`]+))/i);if(!match)return '';value=String(match[1]||match[2]||match[3]||'').trim();}
      if(!value)return '';
      try{if(value.startsWith('/')){const parsed=new URL(value,location.origin);return parsed.origin===location.origin?`${parsed.pathname}${parsed.search}${parsed.hash}`:'';}const parsed=new URL(/^https?:\/\//i.test(value)?value:`https://${value}`);if(!parsed.hostname||parsed.username||parsed.password||parsed.protocol!=='https:')return '';return parsed.href;}catch(_){return '';}
    };
    const safeSocialLinks=items=>Array.isArray(items)?Array.from({length:Math.min(3,items.length)},(_,index)=>{
      const item=items[index];
      if(!item||typeof item!=='object')return null;
      const name=String(item.name||'').trim().slice(0,40),rawUrl=String(item.url||'').trim();
      if(!name||!rawUrl)return null;
      try{const url=new URL(/^https?:\/\//i.test(rawUrl)?rawUrl:`https://${rawUrl}`);if(!['http:','https:'].includes(url.protocol)||!url.hostname||url.username||url.password)return null;return {name,url:url.href,platform:platformFor(name,url.href),iconUrl:normalizeSocialIconSource(item.iconUrl||'')};}catch(_){return null;}
    }):[];
    const roleClass=role=>role==='Editor-Chefe'?'role-chief':role==='Editor'?'role-editor':'role-student';
    let pendingAvatar=String(form.__fpPendingAvatar||'');
    let avatarRemovalPending=form.__fpAvatarRemovalPending===true;
    let previewObjectUrl=String(form.__fpAvatarObjectUrl||'');
    let avatarCanEdit=false;
    let profileAuthorized=false;
    let editing=false;
    let avatarClickTimer=null;
    let editingSocialIndex=-1;
    let currentProfileUser=null;
    const persistAvatarState=()=>{form.__fpPendingAvatar=pendingAvatar;form.__fpAvatarRemovalPending=avatarRemovalPending;form.__fpAvatarObjectUrl=previewObjectUrl;};
    const releasePreviewObjectUrl=()=>{if(previewObjectUrl){try{URL.revokeObjectURL(previewObjectUrl);}catch(_){}previewObjectUrl='';}persistAvatarState();};
    const placeholderMarkup=u=>`<span class="profile-placeholder">${esc(initials(u?.name||s.name))}</span>`;
    const setStatus=(msg,good=false)=>{const el=$('profile-status');if(el){el.textContent=msg;el.classList.toggle('is-good',good);}};
    const publicProfileHref=(u,section='')=>`${u?.uid?`perfil.html?uid=${encodeURIComponent(u.uid)}`:`perfil.html?email=${encodeURIComponent(u?.email||s.email||'')}`}${section?`#profile-section-${encodeURIComponent(section)}`:''}`;
    const renderAvatarPreview=(u=getUser(),canEdit=avatarCanEdit)=>{
      if(preview){
        const src=pendingAvatar||previewObjectUrl||(!avatarRemovalPending?String(u?.avatar||''):'');
        if(src){preview.innerHTML=`<img src="${esc(src)}" alt="${pendingAvatar||previewObjectUrl?'Prévia da foto de perfil':'Foto de perfil'}" class="profile-image-preview">`;const image=preview.querySelector('img');image?.addEventListener('error',()=>{if(preview.contains(image))preview.innerHTML=placeholderMarkup(u);},{once:true});}
        else preview.innerHTML=placeholderMarkup(u);
      }
      const removeButton=$('profile-remove-avatar');
      if(removeButton){const hasAvatar=Boolean(pendingAvatar||previewObjectUrl||u?.avatar||avatarRemovalPending);removeButton.classList.toggle('hidden',!hasAvatar||!canEdit);removeButton.disabled=!canEdit;removeButton.textContent=avatarRemovalPending?'Cancelar remoção':'Remover foto';removeButton.title=avatarRemovalPending?'Cancelar a remoção marcada':'Remover a foto ao salvar as alterações';}
    };
    const renderSocialLinks=(items,canEdit=editing)=>{
      const grid=$('profile-social-grid');if(!grid)return;
      const links=safeSocialLinks(items);
      const visibleLinks=links.filter(Boolean);
      const hasLinks=visibleLinks.length>0;
      $('profile-social-title')?.classList.toggle('sr-only',hasLinks);
      $('profile-social-subtitle')?.classList.toggle('hidden',hasLinks);
      $('profile-social-help')?.classList.toggle('hidden',!canEdit||hasLinks);
      grid.classList.toggle('has-links',hasLinks);
      if(!canEdit){
        grid.innerHTML=hasLinks?visibleLinks.map(link=>`<a class="profile-social-slot has-link social-icon-only" href="${esc(link.url)}" target="_blank" rel="noopener noreferrer" aria-label="Abrir ${esc(link.name)} em nova aba" title="${esc(link.name)}"><span class="profile-social-slot-icon network-${link.platform||'website'}" aria-hidden="true">${link.iconUrl?`<img src="${esc(link.iconUrl)}" alt="" loading="lazy">`:esc(socialMark(link.platform||'website'))}</span><span class="profile-social-slot-name sr-only">${esc(link.name)}</span></a>`).join(''):'<p class="profile-social-empty">Nenhuma rede adicionada.</p>';
        return;
      }
      grid.innerHTML=Array.from({length:3},(_,index)=>{
        const link=links[index];
        const platform=link?.platform||'website';
        const mark=link?socialMark(platform):'+';
        const compact=hasLinks;
        return `<button class="profile-social-slot is-editing ${link?'has-link':''} ${compact?'social-icon-only':''}" type="button" data-social-slot="${index}" aria-label="${link?'Editar':'Adicionar'} ${link?.name||`rede ${index+1}`}" title="${link?'Editar':'Adicionar'} ${link?.name||'rede'}"><span class="profile-social-slot-icon network-${platform}" aria-hidden="true">${link?.iconUrl?`<img src="${esc(link.iconUrl)}" alt="" loading="lazy">`:esc(mark)}</span><span class="profile-social-slot-name ${compact?'sr-only':''}">${esc(link?.name||'Adicionar')}</span>${compact?`<small class="sr-only">${link?'Editar link':'Adicionar rede'}</small>`:`<small>${link?'Editar link':'Adicionar rede'}</small>`}</button>`;
      }).join('');
    };
    const renderEditingState=()=>{
      const canEdit=editing&&profileAuthorized;
      avatarCanEdit=canEdit;
      if(!canEdit&&typeof closeProfileBackgroundCropper==='function')closeProfileBackgroundCropper();
      form.classList.toggle('is-editing',canEdit);
      form.dataset.profileEditing=canEdit?'1':'0';
      const editButton=$('profile-edit-button');
      if(editButton){editButton.classList.toggle('hidden',!profileAuthorized||canEdit);editButton.classList.toggle('is-authorized',profileAuthorized&&!canEdit);editButton.setAttribute('aria-disabled',String(!profileAuthorized));}
      const saveButton=$('profile-save-button');if(saveButton){saveButton.classList.toggle('hidden',!canEdit);saveButton.disabled=!canEdit;}
      $('profile-cancel-button')?.classList.toggle('hidden',!canEdit);
      $('profile-editing-note')?.classList.toggle('hidden',!canEdit);
      document.querySelectorAll('#profile-form .profile-edit-control').forEach(el=>el.classList.toggle('hidden',!canEdit));
      $('profile-contributions-options')?.classList.toggle('hidden',!canEdit||!isEditorChief(s));
      const backgroundCard=$('profile-background-url')?.closest('.profile-background-card');backgroundCard?.classList.toggle('hidden',!canEdit);$('profile-background-url')?.classList.toggle('hidden',!canEdit);$('profile-background-save')?.classList.toggle('hidden',!canEdit);backgroundCard?.querySelector('.profile-background-input-label')?.classList.toggle('hidden',!canEdit);backgroundCard?.querySelector('.profile-background-help')?.classList.toggle('hidden',!canEdit);$('profile-background-crop-controls')?.classList.toggle('hidden',!canEdit);
      ['profile-school-year-display','profile-year-display','profile-bio-display','profile-contribution-preview'].forEach(id=>$(id)?.classList.toggle('hidden',canEdit));
      const trigger=$('profile-avatar-trigger');if(trigger){trigger.disabled=!canEdit;trigger.classList.toggle('is-editable',canEdit);trigger.setAttribute('aria-label',canEdit?'Clique uma vez para escolher uma foto. Clique duas vezes para remover a foto e usar as iniciais.':'Foto de perfil');}
      const hint=$('profile-avatar-hint');if(hint)hint.textContent=canEdit?'Clique uma vez para escolher · duas vezes para remover':'Foto do perfil';
      renderAvatarPreview(getUser(),canEdit);
      renderSocialLinks(form.__fpSocialLinks||getUser()?.socialLinks||[],canEdit);
    };
    const renderProfileStats=async(u)=>{
      if(!u)return;
      let publicArticles=readArticles().filter(a=>a&&a.status==='Aprovado'&&a.visible!==false);
      if(fpCloudEnabled()&&window.FPCloud.fetchPublicArticles){
        try{const remote=await window.FPCloud.fetchPublicArticles();if(Array.isArray(remote)){publicArticles=remote.filter(a=>a&&a.status==='Aprovado'&&a.visible!==false);try{await window.FPStore?.syncPublicArticles?.(remote);}catch(_){}}}catch(_){}
      }
      const articleMap=new Map();for(const article of publicArticles){const id=String(article?.id||'');if(!id||!articleMap.has(id))articleMap.set(id,article);}const deduped=[...articleMap.values()];
      const same=(value,profile)=>identityMatches(value,profile,u?.name||'',u);
      const posts=deduped.filter(article=>same(article?.author,{uid:article?.authorUid,email:article?.authorEmail,name:article?.author}));
      const creditsFor=(article,field)=>{
        const values=creditRawEntries(article?.credits?.[field]);
        if(values.some(value=>same(value,null)))return true;
        return creditProfileEntries(article,field).some(profile=>same(profile,profile));
      };
      const textArticles=deduped.filter(a=>creditsFor(a,'textCredit'));
      const imageArticles=deduped.filter(a=>creditsFor(a,'imageCredit'));
      const researchArticles=deduped.filter(a=>creditsFor(a,'researcher'));
      let achievements=Array.isArray(read('fp_achievements',[]))?read('fp_achievements',[]):[];
      if(window.FPCloud?.fetchAchievements){
        try{const remote=await window.FPCloud.fetchAchievements();if(Array.isArray(remote)){const map=new Map();remote.forEach(a=>{if(a?.id)map.set(String(a.id),a);});achievements.forEach(a=>{if(a?.id&&!map.has(String(a.id)))map.set(String(a.id),a);});achievements=[...map.values()];write('fp_achievements',achievements);}}catch(_){}
      }
      const targetName=normText(u?.name||'');
      const matchingAchievements=achievements.filter(a=>{
        const values=creditRawEntries(a?.credits);
        const profiles=Array.isArray(a?.creditProfiles)?a.creditProfiles:[];
        return (targetName&&normText(a?.name||'').includes(targetName))||values.some(value=>identityMatches(value,null,u?.name||'',u))||(u?.uid&&profiles.some(profile=>String(profile?.uid||'').trim()===String(u.uid)));
      });
      const total=posts.length+textArticles.length+imageArticles.length+researchArticles.length;
      if($('profile-total-contributions'))$('profile-total-contributions').textContent=String(total);
      if($('profile-total-achievements'))$('profile-total-achievements').textContent=String(matchingAchievements.length);
      const hrefFor=key=>publicProfileHref(u,key);
      const contributionData=[
        ['diagramming',posts.length,'diagramming'],
        ['research',researchArticles.length,'research'],
        ['text',textArticles.length,'text'],
        ['image',imageArticles.length,'image']
      ];
      const contributionPriority=['diagramming','research','text','image'];
      const topContributionKinds=new Set(contributionData.slice().sort((a,b)=>b[1]-a[1]||contributionPriority.indexOf(a[0])-contributionPriority.indexOf(b[0])).slice(0,3).map(item=>item[0]));
      $('profile-contributions-list')?.querySelectorAll('[data-contribution-kind]').forEach(link=>{
        const kind=link.dataset.contributionKind;const entry=contributionData.find(item=>item[0]===kind);if(!entry)return;
        link.classList.toggle('is-not-top',!topContributionKinds.has(kind));
        link.href=hrefFor(entry[2]);const count=link.querySelector('strong');if(count)count.textContent=String(entry[1]);
      });
      if($('profile-achievements-all'))$('profile-achievements-all').href=hrefFor('achievements');
      const list=$('profile-achievements-list');
      if(list){
        const timeOf=value=>{if(value==null||value==='')return 0;if(typeof value==='number')return Number.isFinite(value)?value:0;if(typeof value==='object'){if(typeof value.toDate==='function')return value.toDate().getTime()||0;if(Number.isFinite(Number(value.seconds)))return Number(value.seconds)*1000;}const time=Date.parse(String(value));return Number.isFinite(time)?time:0;};
        const formatDate=value=>{let date=null;if(value&&typeof value.toDate==='function')date=value.toDate();else if(value&&typeof value==='object'&&Number.isFinite(Number(value.seconds)))date=new Date(Number(value.seconds)*1000);else if(value)date=new Date(value);if(date&&Number.isFinite(date.getTime()))return date.toLocaleDateString('pt-BR');return '';};
        const latest=matchingAchievements.slice().sort((a,b)=>timeOf(b.createdAt||b.updatedAt||b.date)-timeOf(a.createdAt||a.updatedAt||a.date)).slice(0,3);
        const achievementAnchor=achievement=>`profile-achievement-${Array.from(String(achievement?.id||achievement?.title||achievement?.name||'conquista')).map(char=>char.codePointAt(0).toString(16)).join('-')}`;
        list.innerHTML=latest.length?latest.map((achievement,index)=>{
          const date=formatDate(achievement.createdAt||achievement.date||achievement.updatedAt)||(achievement.year?`Ano ${esc(achievement.year)}`:'Data não informada');
          const medals=['🥇','🥈','🥉'];
          const target=`${publicProfileHref(u)}#${achievementAnchor(achievement)}`;
          return `<a class="profile-achievement-row" href="${esc(target)}" aria-label="Ver conquista ${esc(achievement.title||achievement.name||'Conquista')} no perfil público"><span class="profile-achievement-medal medal-${index+1}" aria-hidden="true">${medals[index]}</span><span class="profile-achievement-copy"><strong>${esc(achievement.title||achievement.name||'Conquista')}</strong><small>${esc(date)}</small></span><span class="profile-achievement-arrow" aria-hidden="true">↗</span></a>`;
        }).join(''):`<p class="profile-empty-value">Nenhuma conquista vinculada a este perfil ainda.</p>`;
      }
    };
    const load=async()=>{
      pendingAvatar=String(form.__fpPendingAvatar||'');avatarRemovalPending=form.__fpAvatarRemovalPending===true;previewObjectUrl=String(form.__fpAvatarObjectUrl||'');
      const u=getUser();if(!u)return;currentProfileUser=u;
      profileAuthorized=isEditor(s);
      if(!profileAuthorized&&u.uid&&window.FPCloud?.getProfileAuthorization){const authz=await window.FPCloud.getProfileAuthorization(u.uid).catch(()=>({authorized:false}));profileAuthorized=authz?.authorized===true;u.profileEditAuthorized=profileAuthorized;try{const local=readUsers();await window.FPStore?.setUsersLocal?.(local.map(x=>String(x.uid||'')===String(u.uid)?{...x,profileEditAuthorized:profileAuthorized}:x));}catch(_){}}
      const role=String(u.role||s.role||'Estudante');
      if($('profile-display-name'))$('profile-display-name').textContent=String(u.name||s.name||'Conta');
      const roleBadge=$('profile-role-badge');if(roleBadge){roleBadge.textContent=role==='Editor-Chefe'?'Coordenador(a) Editorial':role==='Editor'?'Editor(a)':'Redator(a)';roleBadge.classList.remove('role-student','role-editor','role-chief');roleBadge.classList.add(roleClass(role));}
      if($('profile-school-year-display'))$('profile-school-year-display').textContent=u.schoolYear?`Estudante do ${String(u.schoolYear).trim()}`:'Ano escolar não informado';
      if($('profile-school-year'))$('profile-school-year').value=String(u.schoolYear||'');
      if($('profile-year-display'))$('profile-year-display').textContent=String(u.profileYear||'Não informado');
      if($('profile-year'))$('profile-year').value=String(u.profileYear||'');
      if($('profile-bio'))$('profile-bio').value=String(u.bio||'');
      if($('profile-bio-display'))$('profile-bio-display').textContent=String(u.bio||'Ainda não há uma biografia cadastrada.');
      const bioCounter=$('profile-bio-counter');if(bioCounter)bioCounter.textContent=`${wordCount($('profile-bio')?.value||'')}/600 palavras`;
      const legacyTitles=Array.isArray(u.contributions)?u.contributions.filter(Boolean):(u.contribution?[String(u.contribution)]:[]);
      const assignedTitle=String(Object.prototype.hasOwnProperty.call(u,'assignedTitle')?(u.assignedTitle||''):legacyTitles.join(', ')).trim();
      if($('profile-assigned-title')){const positionSelect=$('profile-assigned-title'),legacyOption=positionSelect.querySelector('[data-legacy-position]');if(legacyOption)legacyOption.hidden=assignedTitle!=='Secretário(a) e Pedagogo(a)';positionSelect.value=['Estudante','Professor(a)','Diretor(a)','Secretário(a)','Pedagogo(a)','Secretário(a) e Pedagogo(a)'].includes(assignedTitle)?assignedTitle:'';}
      if($('profile-background-url'))$('profile-background-url').value=String(u.profileBackgroundImage||'');
      const backgroundCrop=normalizeProfileBackgroundCrop(u.profileBackgroundCrop);
      [['profile-background-desktop-x',backgroundCrop.desktopX],['profile-background-desktop-y',backgroundCrop.desktopY],['profile-background-mobile-x',backgroundCrop.mobileX],['profile-background-mobile-y',backgroundCrop.mobileY]].forEach(([id,value])=>{const el=$(id);if(el)el.value=String(value);});
      updateProfileBackgroundPreview(u.profileBackgroundImage||'');
      if($('profile-background-status'))$('profile-background-status').textContent=u.profileBackgroundImage?'Fundo personalizado salvo.':'Nenhum fundo personalizado salvo.';
      const contributionPreview=$('profile-contribution-preview');if(contributionPreview)contributionPreview.textContent=assignedTitle||'Ainda não definido';
      form.__fpSocialLinks=safeSocialLinks(u.socialLinks||[]);
      s.schoolYear=String(u.schoolYear||s.schoolYear||'');$('session-profile-year')&&($('session-profile-year').textContent=String(u.schoolYear||'Série pendente'));
      const sidebarAvatar=$('sidebar-avatar');if(sidebarAvatar){sidebarAvatar.replaceChildren();if(u.avatar){const image=document.createElement('img');image.src=String(u.avatar);image.alt='';image.referrerPolicy='no-referrer';sidebarAvatar.append(image);}else sidebarAvatar.textContent=initials(u.name||s.name);}
      avatarCanEdit=profileAuthorized&&editing;renderAvatarPreview(u,avatarCanEdit);renderEditingState();
      void renderProfileStats(u);
    };

    const updateBioWordCount=()=>{const count=wordCount($('profile-bio')?.value||''),counter=$('profile-bio-counter');if(counter)counter.textContent=`${count}/600 palavras`;if(counter)counter.classList.toggle('is-over-limit',count>600);return count;};
    if(form.dataset.profileBioBound!=='1'){
      form.dataset.profileBioBound='1';
      $('profile-bio')?.addEventListener('input',updateBioWordCount);
    }

    const prepareFile=file=>{
      if(!file)return;
      if(!avatarCanEdit){input.value='';return;}
      if(!['image/png','image/jpeg','image/webp'].includes(String(file.type||'').toLowerCase())){announce('Escolha uma imagem PNG, JPEG ou WebP para o perfil.');input.value='';return;}
      const token=(Number(form.__fpAvatarReadToken)||0)+1;form.__fpAvatarReadToken=token;releasePreviewObjectUrl();
      try{previewObjectUrl=URL.createObjectURL(file);}catch(_){previewObjectUrl='';}
      pendingAvatar='';avatarRemovalPending=false;persistAvatarState();renderAvatarPreview(getUser(),avatarCanEdit);
      const isCurrent=()=>token===Number(form.__fpAvatarReadToken);
      const reader=new FileReader();
      reader.onerror=()=>{if(!isCurrent())return;releasePreviewObjectUrl();input.value='';renderAvatarPreview(getUser(),avatarCanEdit);setStatus('Não foi possível ler esta imagem. Escolha outro arquivo.');};
      reader.onload=()=>{
        if(!isCurrent())return;const img=new Image();
        img.onerror=()=>{if(!isCurrent())return;releasePreviewObjectUrl();input.value='';renderAvatarPreview(getUser(),avatarCanEdit);setStatus('A imagem selecionada não pôde ser aberta. Escolha outro arquivo.');};
        img.onload=()=>{if(!isCurrent())return;try{const max=600,scale=Math.min(1,max/Math.max(1,img.width)),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(img.width*scale));canvas.height=Math.max(1,Math.round(img.height*scale));const context=canvas.getContext('2d');if(!context)throw new Error('Não foi possível preparar a imagem.');context.drawImage(img,0,0,canvas.width,canvas.height);pendingAvatar=canvas.toDataURL('image/jpeg',.82);avatarRemovalPending=false;persistAvatarState();releasePreviewObjectUrl();persistAvatarState();renderAvatarPreview(getUser(),avatarCanEdit);setStatus('Nova foto selecionada. Clique em “Salvar alterações” para publicar a mudança.');}catch(error){if(!isCurrent())return;releasePreviewObjectUrl();renderAvatarPreview(getUser(),avatarCanEdit);setStatus(error?.message||'Não foi possível preparar a imagem.');}};
        img.src=String(reader.result||'');
      };
      reader.readAsDataURL(file);
    };
    input.onchange=()=>prepareFile(input.files?.[0]);
    const avatarTrigger=$('profile-avatar-trigger');
    const markAvatarRemoval=()=>{
      if(!avatarCanEdit)return;
      if(avatarClickTimer){clearTimeout(avatarClickTimer);avatarClickTimer=null;}
      form.__fpAvatarReadToken=(Number(form.__fpAvatarReadToken)||0)+1;
      pendingAvatar='';avatarRemovalPending=true;input.value='';releasePreviewObjectUrl();persistAvatarState();
      renderAvatarPreview(getUser(),avatarCanEdit);
      setStatus('A foto foi removida da prévia. Clique em “Salvar alterações” para deixar o perfil apenas com as iniciais.');
    };
    if(avatarTrigger){
      avatarTrigger.onclick=e=>{
        if(!avatarCanEdit)return;
        if(Number(e.detail)>=2){markAvatarRemoval();return;}
        if(avatarClickTimer)clearTimeout(avatarClickTimer);
        // Wait beyond the common browser double-click window so two clicks never open the picker first.
        avatarClickTimer=setTimeout(()=>{avatarClickTimer=null;if(avatarCanEdit)input.click();},600);
      };
      avatarTrigger.ondblclick=e=>{e.preventDefault();e.stopPropagation();if(!avatarRemovalPending||pendingAvatar||previewObjectUrl)markAvatarRemoval();};
      avatarTrigger.onkeydown=e=>{if(e.key==='Escape'&&avatarClickTimer){clearTimeout(avatarClickTimer);avatarClickTimer=null;}};
    }
    const removeAvatarButton=$('profile-remove-avatar');
    if(removeAvatarButton)removeAvatarButton.onclick=()=>{if(!avatarCanEdit)return;form.__fpAvatarReadToken=(Number(form.__fpAvatarReadToken)||0)+1;if(avatarRemovalPending){avatarRemovalPending=false;persistAvatarState();renderAvatarPreview(getUser(),avatarCanEdit);setStatus('A remoção da foto foi cancelada.');return;}pendingAvatar='';avatarRemovalPending=true;input.value='';releasePreviewObjectUrl();persistAvatarState();renderAvatarPreview(getUser(),avatarCanEdit);setStatus('A foto será removida quando você salvar as alterações.');};

  const normalizeProfileBackgroundCrop = raw => {
    const data=raw&&typeof raw==='object'?raw:{};
    const value=key=>Math.max(0,Math.min(100,Number.isFinite(Number(data[key]))?Math.round(Number(data[key])):50));
    return {desktopX:value('desktopX'),desktopY:value('desktopY'),mobileX:value('mobileX'),mobileY:value('mobileY')};
  };
  const readProfileBackgroundCropControls = () => normalizeProfileBackgroundCrop({
    desktopX:$('profile-background-desktop-x')?.value,desktopY:$('profile-background-desktop-y')?.value,
    mobileX:$('profile-background-mobile-x')?.value,mobileY:$('profile-background-mobile-y')?.value
  });
  const backgroundCropKeys = mode => mode==='mobile'?['profile-background-mobile-x','profile-background-mobile-y']:['profile-background-desktop-x','profile-background-desktop-y'];
  let profileBackgroundCropMode='desktop';
  let profileBackgroundCropStart=null;
  let profileBackgroundCropSnapshot=null;
  const profileBackgroundImageCss = raw => {
    const normalized=String(raw||'').trim()?normalizeSocialIconSource(String(raw||'').trim()):'';
    return normalized?`url("${normalized.replace(/[\\"'()\s]/g,ch=>encodeURIComponent(ch))}")`:'none';
  };
  const updateProfileBackgroundPreview = raw => {
    const crop=readProfileBackgroundCropControls(),image=profileBackgroundImageCss(raw);
    const target=$('profile-identity-backdrop');if(target){target.style.backgroundImage=image;target.style.setProperty('--fp-profile-paper-position-desktop',`${crop.desktopX}% ${crop.desktopY}%`);target.style.setProperty('--fp-profile-paper-position-mobile',`${crop.mobileX}% ${crop.mobileY}%`);}
    const desktop=$('profile-background-crop-preview-desktop');if(desktop){desktop.style.backgroundImage=image;desktop.style.backgroundPosition=`${crop.desktopX}% ${crop.desktopY}%`;}
    const mobile=$('profile-background-crop-preview-mobile');if(mobile){mobile.style.backgroundImage=image;mobile.style.backgroundPosition=`${crop.mobileX}% ${crop.mobileY}%`;}
    const paper=document.querySelector('[data-profile-paper]');if(paper){paper.style.setProperty('--fp-profile-paper-position-desktop',`${crop.desktopX}% ${crop.desktopY}%`);paper.style.setProperty('--fp-profile-paper-position-mobile',`${crop.mobileX}% ${crop.mobileY}%`);}
    const stage=$('profile-background-crop-stage');if(stage){const [xKey,yKey]=backgroundCropKeys(profileBackgroundCropMode);stage.style.backgroundImage=image;stage.style.backgroundPosition=`${$(xKey)?.value||50}% ${$(yKey)?.value||50}%`;stage.classList.toggle('is-mobile-crop',profileBackgroundCropMode==='mobile');}
  };
  const closeProfileBackgroundCropper = () => {const modal=$('profile-background-cropper');if(modal){modal.classList.add('hidden');modal.setAttribute('aria-hidden','true');}profileBackgroundCropStart=null;};
  const openProfileBackgroundCropper = mode => {
    if(!avatarCanEdit||!profileAuthorized)return;
    profileBackgroundCropMode=mode==='mobile'?'mobile':'desktop';
    const crop=readProfileBackgroundCropControls();profileBackgroundCropSnapshot={...crop};
    const title=$('profile-background-cropper-title');if(title)title.textContent=profileBackgroundCropMode==='mobile'?'Recortar fundo do perfil':'Recortar fundo do card';
    const modal=$('profile-background-cropper');if(modal){modal.classList.remove('hidden');modal.setAttribute('aria-hidden','false');}
    updateProfileBackgroundPreview($('profile-background-url')?.value||'');
    $('profile-background-crop-stage')?.focus();
  };
  document.querySelectorAll('[data-profile-background-crop-open]').forEach(button=>button.addEventListener('click',()=>openProfileBackgroundCropper(button.dataset.profileBackgroundCropOpen)));
  $('profile-background-cropper-close')?.addEventListener('click',closeProfileBackgroundCropper);
  $('profile-background-crop-cancel')?.addEventListener('click',()=>{
    if(profileBackgroundCropSnapshot){[['profile-background-desktop-x','desktopX'],['profile-background-desktop-y','desktopY'],['profile-background-mobile-x','mobileX'],['profile-background-mobile-y','mobileY']].forEach(([id,key])=>{const el=$(id);if(el)el.value=String(profileBackgroundCropSnapshot[key]);});}
    updateProfileBackgroundPreview($('profile-background-url')?.value||'');closeProfileBackgroundCropper();
  });
  $('profile-background-crop-apply')?.addEventListener('click',()=>{updateProfileBackgroundPreview($('profile-background-url')?.value||'');closeProfileBackgroundCropper();const status=$('profile-background-status');if(status)status.textContent='Recorte aplicado à prévia. Clique em “Salvar fundo” ou “Salvar alterações” para publicar.';});
  const cropStage=$('profile-background-crop-stage');
  cropStage?.addEventListener('pointerdown',event=>{
    if(!avatarCanEdit||event.button!==0||!String($('profile-background-url')?.value||'').trim())return;
    const [xKey,yKey]=backgroundCropKeys(profileBackgroundCropMode),rect=cropStage.getBoundingClientRect();
    if(!rect.width||!rect.height)return;
    profileBackgroundCropStart={pointerId:event.pointerId,x:event.clientX,y:event.clientY,baseX:Number($(xKey)?.value||50),baseY:Number($(yKey)?.value||50),width:rect.width,height:rect.height,xKey,yKey};
    cropStage.setPointerCapture?.(event.pointerId);event.preventDefault();
  });
  cropStage?.addEventListener('pointermove',event=>{
    const start=profileBackgroundCropStart;if(!start||event.pointerId!==start.pointerId)return;
    const x=$(start.xKey),y=$(start.yKey);if(!x||!y)return;
    x.value=String(Math.max(0,Math.min(100,Math.round(start.baseX-(event.clientX-start.x)/start.width*100))));
    y.value=String(Math.max(0,Math.min(100,Math.round(start.baseY-(event.clientY-start.y)/start.height*100))));
    updateProfileBackgroundPreview($('profile-background-url')?.value||'');
  });
  const finishBackgroundCropDrag=event=>{if(profileBackgroundCropStart&&(!event||event.pointerId===profileBackgroundCropStart.pointerId))profileBackgroundCropStart=null;};
  cropStage?.addEventListener('pointerup',finishBackgroundCropDrag);
  cropStage?.addEventListener('pointercancel',finishBackgroundCropDrag);
  $('profile-background-url')?.addEventListener('input',()=>updateProfileBackgroundPreview($('profile-background-url')?.value||''));
    const backgroundButton=$('profile-background-save');
    if(backgroundButton)backgroundButton.onclick=async()=>{
      if(!avatarCanEdit||!profileAuthorized)return;
      const status=$('profile-background-status'),raw=String($('profile-background-url')?.value||'').trim();
      const imageURL=raw?normalizeSocialIconSource(raw):'';
      if(raw&&!imageURL){if(status)status.textContent='Link inválido. Cole uma URL HTTPS ou uma tag img com src HTTPS.';return;}
      const crop=readProfileBackgroundCropControls();
      const all=readUsers(),index=all.findIndex(x=>String(x.uid||'')===String(s.uid||'')||String(x.email||'').toLowerCase()===String(s.email||'').toLowerCase());
      if(index<0){if(status)status.textContent='Não foi possível localizar a conta para salvar o fundo.';return;}
      const updated={...all[index],profileBackgroundImage:imageURL,profileBackgroundCrop:crop,updatedAt:new Date().toISOString()};all[index]=updated;backgroundButton.disabled=true;backgroundButton.setAttribute('aria-busy','true');
      try{
        if(fpCloudEnabled()&&s.uid){
          const saved=await window.FPCloud.saveEditorialUser(s.uid,{profileBackgroundImage:imageURL,profileBackgroundCrop:crop});if(saved===false)throw new Error('O Firebase não confirmou a gravação do fundo.');
          const publicSaved=await window.FPCloud.syncPublicProfileFromUser?.(s.uid);if(publicSaved===false||!publicSaved)throw new Error('O fundo foi salvo no perfil principal, mas não foi possível sincronizar o perfil público.');
          const fresh=await window.FPCloud.loadProfile?.(s.uid).catch(()=>null);
          const mergedUser=fresh?{...updated,...fresh}:updated;
          all[index]=mergedUser;
          await saveUsersLocal(all);
          currentProfileUser=mergedUser;
        }else await saveUsers(all);
        currentProfileUser=all[index]||updated;updateProfileBackgroundPreview(imageURL);if(status)status.textContent=imageURL?'Fundo e recortes salvos.':'Fundo removido; recortes salvos.';setStatus('Fundo do perfil salvo.','success');window.dispatchEvent(new CustomEvent('fp:profiles-updated'));
      }catch(error){if(status)status.textContent=error?.message||'Não foi possível salvar o fundo do perfil.';}
      finally{backgroundButton.disabled=false;backgroundButton.removeAttribute('aria-busy');}
    };

    const socialModal=$('profile-social-modal'),socialName=$('profile-social-name'),socialUrl=$('profile-social-url'),socialIcon=$('profile-social-icon');
    const closeSocialModal=()=>{if(!socialModal)return;socialModal.classList.add('hidden');socialModal.setAttribute('aria-hidden','true');editingSocialIndex=-1;};
    const inferSocialLabel=raw=>{try{const host=new URL(/^https?:\/\//i.test(raw)?raw:`https://${raw}`).hostname.replace(/^www\./i,'').toLowerCase();const root=host.split('.').slice(-2)[0]||host;const known={instagram:'Instagram',tiktok:'TikTok',facebook:'Facebook',fb:'Facebook',youtube:'YouTube',youtu:'YouTube',x:'X',twitter:'X',linkedin:'LinkedIn',threads:'Threads',pinterest:'Pinterest',discord:'Discord',twitch:'Twitch',whatsapp:'WhatsApp',telegram:'Telegram'};return known[root]||root.slice(0,40)||'Site';}catch(_){return 'Site';}};
    const updateSocialPreview=()=>{
      const rawUrl=String(socialUrl?.value||'').trim(),rawIcon=String(socialIcon?.value||'').trim();const name=String(socialName?.value||inferSocialLabel(rawUrl)).trim(),platform=platformFor(name,rawUrl);const mark=socialMark(platform),iconUrl=normalizeSocialIconSource(rawIcon);
      const previewIcon=$('profile-social-preview-icon');if(previewIcon){previewIcon.className=`profile-social-slot-icon network-${platform}`;previewIcon.innerHTML=iconUrl?`<img src="${esc(iconUrl)}" alt="" loading="lazy">`:esc(mark);const previewImage=previewIcon.querySelector('img');previewImage?.addEventListener('error',()=>{if(previewIcon.contains(previewImage))previewIcon.textContent=mark;},{once:true});}
      if($('profile-social-preview-label'))$('profile-social-preview-label').textContent=name||'Prévia da rede';
      let host='Ícone reconhecido pelo nome/endereço ou imagem personalizada.';try{host=new URL(/^https?:\/\//i.test(rawUrl)?rawUrl:`https://${rawUrl}`).hostname.replace(/^www\./,'');}catch(_){}
      if(rawIcon&&!iconUrl)host='Imagem inválida. Use uma URL HTTPS ou um elemento <img> com src HTTPS.';
      if($('profile-social-preview-host'))$('profile-social-preview-host').textContent=host;
    };
    const openSocialModal=index=>{
      if(!avatarCanEdit)return;editingSocialIndex=Number(index);const links=safeSocialLinks(form.__fpSocialLinks||[]),item=links[editingSocialIndex]||null;
      if($('profile-social-modal-title'))$('profile-social-modal-title').textContent=item?'Editar rede':'Adicionar rede';
      if(socialName)socialName.value=item?.name||'';if(socialUrl)socialUrl.value=item?.url||'';if(socialIcon)socialIcon.value=item?.iconUrl||'';
      $('profile-social-delete')?.classList.toggle('hidden',!item);if($('profile-social-modal-status'))$('profile-social-modal-status').textContent='As mudanças serão publicadas junto com “Salvar alterações” do perfil.';
      updateSocialPreview();if(socialModal){socialModal.classList.remove('hidden');socialModal.setAttribute('aria-hidden','false');requestAnimationFrame(()=>socialUrl?.focus());}
    };
    if(socialName)socialName.oninput=updateSocialPreview;if(socialUrl)socialUrl.oninput=updateSocialPreview;if(socialIcon)socialIcon.oninput=updateSocialPreview;
    $('profile-social-grid')&&( $('profile-social-grid').onclick=e=>{const slot=e.target.closest('[data-social-slot]');if(!slot||!editing)return;e.preventDefault();openSocialModal(slot.dataset.socialSlot);});
    $('profile-social-close')&&( $('profile-social-close').onclick=closeSocialModal);
    $('profile-social-cancel')&&( $('profile-social-cancel').onclick=closeSocialModal);
    if(socialModal){socialModal.onclick=e=>{if(e.target===socialModal)closeSocialModal();};socialModal.onkeydown=e=>{if(e.key==='Escape')closeSocialModal();}}
    $('profile-social-save')&&($('profile-social-save').onclick=()=>{
      if(!avatarCanEdit||editingSocialIndex<0)return;
      const rawUrl=String(socialUrl?.value||'').trim(),rawIcon=String(socialIcon?.value||'').trim(),name=String(socialName?.value||inferSocialLabel(rawUrl)).trim().slice(0,40);
      if(!rawUrl){if($('profile-social-modal-status'))$('profile-social-modal-status').textContent='Informe o endereço do perfil.';socialUrl?.focus();return;}
      let item;try{const url=new URL(/^https?:\/\//i.test(rawUrl)?rawUrl:`https://${rawUrl}`);if(!['http:','https:'].includes(url.protocol)||!url.hostname||url.username||url.password)throw new Error();const iconUrl=normalizeSocialIconSource(rawIcon);if(rawIcon&&!iconUrl)throw new Error('icon');item={name,url:url.href,platform:platformFor(name,url.href),iconUrl};}catch(error){if($('profile-social-modal-status'))$('profile-social-modal-status').textContent=error?.message==='icon'?'Informe uma URL HTTPS válida ou um elemento <img> com src HTTPS para a imagem do ícone.':'Informe um endereço válido iniciado por http:// ou https://.';if(rawIcon&&!normalizeSocialIconSource(rawIcon))socialIcon?.focus();else socialUrl?.focus();return;}
      const links=safeSocialLinks(form.__fpSocialLinks||[]);while(links.length<=editingSocialIndex)links.push(null);links[editingSocialIndex]=item;form.__fpSocialLinks=safeSocialLinks(links);renderSocialLinks(form.__fpSocialLinks,true);closeSocialModal();setStatus('Rede atualizada no rascunho do perfil. Clique em “Salvar alterações” para publicar.');
    });
    $('profile-social-delete')&&($('profile-social-delete').onclick=()=>{if(!avatarCanEdit||editingSocialIndex<0)return;const links=safeSocialLinks(form.__fpSocialLinks||[]);links[editingSocialIndex]=null;while(links.length&&!links[links.length-1])links.pop();form.__fpSocialLinks=safeSocialLinks(links);renderSocialLinks(form.__fpSocialLinks,true);closeSocialModal();setStatus('Rede removida do rascunho. Clique em “Salvar alterações” para publicar.');});

    const editButton=$('profile-edit-button');
    if(editButton)editButton.onclick=()=>{
      if(!profileAuthorized)return;
      const user=getUser();if(!user)return;
      form.__fpProfileSnapshot={bio:String(user.bio||''),academicHistory:String(user.academicHistory||''),assignedTitle:String(Object.prototype.hasOwnProperty.call(user,'assignedTitle')?(user.assignedTitle||''):((Array.isArray(user.contributions)?user.contributions:(user.contribution?[String(user.contribution)]:[])).filter(Boolean).join(', '))),profileYear:String(user.profileYear||''),schoolYear:String(user.schoolYear||''),contributions:Array.isArray(user.contributions)?user.contributions.slice():[],avatar:String(user.avatar||''),profileBackgroundImage:String(user.profileBackgroundImage||''),socialLinks:safeSocialLinks(user.socialLinks||[])};
      editing=true;form.dataset.profileEditing='1';form.__fpSocialLinks=safeSocialLinks(user.socialLinks||[]);renderEditingState();updateBioWordCount();setStatus('Edite os campos desejados. As mudanças só serão publicadas ao salvar.');
    };
    const cancelButton=$('profile-cancel-button');
    if(cancelButton)cancelButton.onclick=async()=>{
      if(!editing)return;
      if(avatarClickTimer){clearTimeout(avatarClickTimer);avatarClickTimer=null;}closeSocialModal();form.__fpAvatarReadToken=(Number(form.__fpAvatarReadToken)||0)+1;pendingAvatar='';avatarRemovalPending=false;input.value='';releasePreviewObjectUrl();persistAvatarState();form.__fpSocialLinks=safeSocialLinks(form.__fpProfileSnapshot?.socialLinks||getUser()?.socialLinks||[]);editing=false;delete form.dataset.profileEditing;setStatus('Edição cancelada. Nenhuma mudança deste rascunho foi salva.');await load();
    };

    form.onsubmit=async e=>{
      e.preventDefault();if(!editing||!profileAuthorized)return;
      if(form.dataset.busy==='1')return;
      const bio=$('profile-bio')?.value.trim()||'',words=wordCount(bio);
      if(words>600){setStatus(`A biografia excede o limite de 600 palavras (${words} palavras). Reduza o texto antes de salvar.`);$('profile-bio')?.focus();return;}
      const yearValue=String($('profile-year')?.value||'').trim();
      const assignedTitle=isEditorChief(s)?String($('profile-assigned-title')?.value||'').trim():String(getUser()?.assignedTitle||'').trim();
      if(assignedTitle.length>100){setStatus('O título atribuído deve ter no máximo 100 caracteres.');$('profile-assigned-title')?.focus();return;}
      if(yearValue&&!/^\d{4}$/.test(yearValue)){setStatus('Informe o ano de ingresso com quatro algarismos.');$('profile-year')?.focus();return;}
      if(yearValue&&(Number(yearValue)<1900||Number(yearValue)>2100)){setStatus('Confira o ano de ingresso informado.');$('profile-year')?.focus();return;}
      const all=readUsers(),u=all.find(x=>String(x.uid||'')===String(s.uid||''))||all.find(x=>String(x.email||'').toLowerCase()===String(s.email||'').toLowerCase());if(!u){setStatus('Não foi possível localizar a conta para salvar o perfil.');return;}
      if(!isEditor(s)){
        const authz=await window.FPCloud?.getProfileAuthorization?.(s.uid).catch(()=>({authorized:false}));
        if(authz?.authorized!==true){profileAuthorized=false;editing=false;delete form.dataset.profileEditing;renderEditingState();setStatus('A autorização de edição não está mais ativa. Suas alterações não foram salvas.');await load();return;}
      }
      const schoolYear=String($('profile-school-year')?.value||'').trim();
      const socialLinks=safeSocialLinks(form.__fpSocialLinks||[]);
      const rawBackground=String($('profile-background-url')?.value||'').trim();
      const profileBackgroundImage=rawBackground?normalizeSocialIconSource(rawBackground):'';
      if(rawBackground&&!profileBackgroundImage){setStatus('Link do fundo inválido. Cole uma URL HTTPS ou uma tag img com src HTTPS.');$('profile-background-url')?.focus();return;}
      const profileBackgroundCrop=readProfileBackgroundCropControls();
      u.profileBackgroundImage=profileBackgroundImage;u.profileBackgroundCrop=profileBackgroundCrop;
      u.bio=bio;
      // Keep the legacy field unchanged in storage; it is no longer editable or displayed.
      u.academicHistory=String(u.academicHistory||'');
      if(isEditorChief(s))u.assignedTitle=assignedTitle;
      u.profileYear=/^\d{4}$/.test(yearValue)?yearValue:'';u.schoolYear=schoolYear;
      u.contributions=Array.isArray(u.contributions)?u.contributions:(u.contribution?[String(u.contribution)]:[]);
      u.socialLinks=socialLinks;
      form.dataset.busy='1';const saveButton=$('profile-save-button');if(saveButton){saveButton.disabled=true;saveButton.setAttribute('aria-busy','true');}
      let mainProfileSaved=false;
      try{
        pendingAvatar=String(form.__fpPendingAvatar||'');avatarRemovalPending=form.__fpAvatarRemovalPending===true;
        if(pendingAvatar){if(!window.FPCloud?.uploadDataUrl)throw new Error('O Cloudinary não está disponível para a nova foto.');u.avatar=await window.FPCloud.uploadDataUrl(pendingAvatar,{folder:`users/${s.uid}`});}
        else if(avatarRemovalPending)u.avatar='';else u.avatar=u.avatar||'';
        if(/^data:/i.test(String(u.avatar||'')))throw new Error('A foto de perfil ainda não foi externalizada.');
        s.name=u.name;s.role=u.role;s.avatar=u.avatar;s.schoolYear=u.schoolYear;s.assignedTitle=u.assignedTitle;
        if(fpCloudEnabled()&&s.uid){
          const saved=await window.FPCloud.saveEditorialUser(s.uid,{name:u.name,bio:u.bio,academicHistory:u.academicHistory,assignedTitle:u.assignedTitle,profileYear:u.profileYear,schoolYear:u.schoolYear,contributions:u.contributions,socialLinks:u.socialLinks,avatar:u.avatar,profileBackgroundImage:u.profileBackgroundImage||'',profileBackgroundCrop:u.profileBackgroundCrop||normalizeProfileBackgroundCrop({})});
          if(saved===false)throw new Error('Não foi possível salvar as alterações do perfil no Firebase.');
          mainProfileSaved=true;
          const publicSaved=await window.FPCloud.syncPublicProfileFromUser?.(s.uid);
          if(publicSaved===false||!publicSaved)throw new Error('Os dados do perfil principal foram gravados, mas o espelho público não confirmou a sincronização.');
          const fresh=await window.FPCloud.loadProfile?.(s.uid).catch(()=>null);
          if(fresh)Object.assign(u,fresh);
          await saveUsersLocal(all);
        }else{await saveUsers(all);}
        write(KEYS.session,s);form.__fpAvatarReadToken=(Number(form.__fpAvatarReadToken)||0)+1;pendingAvatar='';avatarRemovalPending=false;input.value='';releasePreviewObjectUrl();persistAvatarState();editing=false;delete form.dataset.profileEditing;form.__fpProfileSnapshot=null;form.__fpSocialLinks=safeSocialLinks(u.socialLinks||[]);await load();window.dispatchEvent(new CustomEvent('fp:profiles-updated'));announce('Perfil atualizado.');setStatus('Alterações salvas com sucesso.',true);
      }catch(error){
        const code=String(error?.code||'').toLowerCase();
        const message=mainProfileSaved
          ?'As alterações foram gravadas no perfil principal, mas a sincronização pública falhou. O perfil público pode continuar mostrando os dados anteriores; tente salvar novamente ou solicite a revisão da redação.'
          :code==='permission-denied'
            ?'O Firebase recusou o salvamento. Confirme se a autorização de edição continua ativa e se as regras publicadas correspondem à versão do site.'
            :error?.message||'Não foi possível salvar o perfil.';
        if(mainProfileSaved){
          try{
            const fresh=await window.FPCloud?.loadProfile?.(s.uid);
            if(fresh){const current=readUsers();const idx=current.findIndex(x=>String(x.uid||'')===String(s.uid||''));if(idx>=0)current[idx]={...current[idx],...fresh};else current.push(fresh);await saveUsersLocal(current);}
          }catch(syncError){console.warn('[Folha do Paiquerê] perfil principal salvo, mas a cópia local não foi atualizada:',syncError);}
        }
        console.error('[Folha do Paiquerê] falha ao salvar perfil:',error);
        setStatus(message);
      }
      finally{delete form.dataset.busy;if(saveButton){saveButton.disabled=!(editing&&profileAuthorized);saveButton.removeAttribute('aria-busy');}}
    };

    await load();
    if(!form.dataset.profileRefreshBound){form.dataset.profileRefreshBound='1';window.addEventListener('focus',()=>{profile(s);});document.addEventListener('visibilitychange',()=>{if(!document.hidden)profile(s);});}
  }
  async function editorialAvisos(){
    const form=$('school-notice-form'),list=$('school-notice-admin-list');
    if(!form||!list)return;
    const durationInput=$('school-notice-duration'),durationUnitInput=$('school-notice-duration-unit');
    const search=$('school-notice-search'),filter=$('school-notice-filter');
    let noticeItems=[],currentPage=1,noticesLoaded=false;const pageSize=5;
    const durationFactors={minutes:60000,hours:3600000,days:86400000};
    const syncDurationControl=()=>{
      const unlimited=durationUnitInput?.value==='unlimited';
      if(durationInput){durationInput.disabled=unlimited;durationInput.required=!unlimited;durationInput.setAttribute('aria-label',unlimited?'Prazo ilimitado; o aviso não expira':'Quantidade de tempo para exibir o aviso');}
      const help=$('school-notice-duration-help');
      if(help)help.textContent=unlimited?'Este aviso continuará visível até ser excluído ou alterado pela redação.':'O aviso sai da página inicial automaticamente quando o prazo terminar.';
    };
    if(durationUnitInput&&durationUnitInput.dataset.durationControlBound!=='1'){
      durationUnitInput.dataset.durationControlBound='1';durationUnitInput.addEventListener('change',syncDurationControl);
    }
    syncDurationControl();
    let expiryTimer=0;
    const load=async()=>{
      let all=read('fp_school_notices',[]);
      if(fpCloudEnabled()){try{const remote=await window.FPCloud.fetchSchoolNotices?.();if(Array.isArray(remote)){all=remote;write('fp_school_notices',all);}}catch(error){console.warn('[Folha do Paiquerê] não foi possível atualizar os avisos pelo Firebase:',error);}}
      all=Array.isArray(all)?all:[];
      const now=Date.now();let changed=false;const normalized=[];
      for(const notice of all){
        if(notice&&notice.visible!==false&&notice.expiresAt&&timeOf(notice.expiresAt)>0&&timeOf(notice.expiresAt)<=now){
          const expiredNotice={...notice,visible:false,updatedAt:new Date(now).toISOString()};
          if(fpCloudEnabled()){
            try{const save=window.FPCloud.saveSchoolNotice;if(typeof save!=='function')throw new Error('A gravação de avisos no Firebase não está disponível.');const result=await save(expiredNotice.id,expiredNotice);if(result===false||result?.ok===false)throw new Error(result?.message||'O Firebase não confirmou a mudança de visibilidade do aviso expirado.');normalized.push(expiredNotice);changed=true;}
            catch(error){console.warn('[Folha do Paiquerê] o prazo expirou, mas não foi possível persistir a visibilidade Oculto:',notice.id,error);normalized.push(notice);}
          }else{normalized.push(expiredNotice);changed=true;}
        }else normalized.push(notice);
      }
      if(changed)write('fp_school_notices',normalized);
      else if(!fpCloudEnabled())write('fp_school_notices',normalized);
      return normalized;
    };
    const timeOf=value=>{
      if(value==null||value==='')return 0;
      if(typeof value==='number')return Number.isFinite(value)?value:0;
      if(typeof value==='object'){
        if(typeof value.toDate==='function'){const ms=value.toDate().getTime();return Number.isFinite(ms)?ms:0;}
        if(Number.isFinite(Number(value.seconds)))return Number(value.seconds)*1000+Math.floor(Number(value.nanoseconds||0)/1e6);
      }
      const ms=Date.parse(String(value));return Number.isFinite(ms)?ms:0;
    };
    const dateLabel=value=>{const ms=timeOf(value);return ms?new Date(ms).toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit',year:'2-digit'}):'—';};
    const isExpired=n=>Boolean(n?.expiresAt&&timeOf(n.expiresAt)>0&&timeOf(n.expiresAt)<=Date.now());
    const modal=$('school-notice-form-modal'),newButton=$('school-notice-new'),pageStatus=$('school-notice-page-status');
    const setNoticeStatus=message=>{const text=String(message||'');const status=$('school-notice-status');if(status)status.textContent=text;if(pageStatus)pageStatus.textContent=text;};
    let noticeImageObjectUrl='';
    const setNoticeImagePreview=(src,crop=fpAdminReadCrop(form))=>{
      const preview=$('school-notice-image-preview'),placeholder=$('school-notice-image-placeholder'),shell=preview?.closest('.fp-notice-image-preview-shell');if(!preview)return;
      fpAdminApplyCropPreview(shell,preview,src,src?crop:null,placeholder);
      // The notice preview shell also contains the empty-state placeholder, so it stays visible without an image.
      shell?.classList.remove('hidden');
      const cropButton=$('school-notice-image-crop');if(cropButton)cropButton.disabled=!Boolean(src);
    };
    const resetNoticeForm=()=>{form.reset();delete form.dataset.userTouched;delete form.dataset.editId;delete form.dataset.initialEdit;delete form.dataset.originalDurationValue;delete form.dataset.originalDurationUnit;delete form.dataset.fpImageCrop;syncDurationControl();$('notice-form-title').textContent='Novo aviso';$('school-notice-save').textContent='Salvar';$('school-notice-image')?.value&&( $('school-notice-image').value='');if(noticeImageObjectUrl){URL.revokeObjectURL(noticeImageObjectUrl);noticeImageObjectUrl='';}setNoticeImagePreview('');setNoticeStatus('');};
    const openNoticeForm=()=>{if(!modal)return;modal.classList.remove('hidden');modal.setAttribute('aria-hidden','false');document.body.classList.add('fp-notice-modal-open');setTimeout(()=>$('school-notice-title')?.focus(),0);};
    const closeNoticeForm=()=>{if(!modal)return;modal.classList.add('hidden');modal.setAttribute('aria-hidden','true');document.body.classList.remove('fp-notice-modal-open');newButton?.focus();};
    const noticeFormHasContent=()=>Boolean(form.dataset.userTouched==='1'||form.dataset.editId||$('school-notice-title')?.value.trim()||$('school-notice-summary')?.value.trim()||$('school-notice-details')?.value.trim()||$('school-notice-image-url')?.value.trim()||$('school-notice-image')?.files?.length);
    const requestNoticeFormClose=()=>{if(form.dataset.busy==='1')return;if(noticeFormHasContent()&&!confirm('Há informações preenchidas neste formulário. Deseja cancelar e descartar as alterações?'))return;resetNoticeForm();closeNoticeForm();};
    if(newButton&&newButton.dataset.bound!=='1'){newButton.dataset.bound='1';newButton.addEventListener('click',()=>{if(form.dataset.busy==='1')return;resetNoticeForm();setNoticeStatus('');openNoticeForm();});}
    const cancelButton=$('school-notice-cancel');
    if(cancelButton&&cancelButton.dataset.bound!=='1'){cancelButton.dataset.bound='1';cancelButton.addEventListener('click',requestNoticeFormClose);}
    if(modal&&modal.dataset.bound!=='1'){
      modal.dataset.bound='1';modal.addEventListener('click',event=>{if(event.target===modal||event.target.closest('[data-notice-form-close]'))requestNoticeFormClose();});
      document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!modal.classList.contains('hidden'))requestNoticeFormClose();});
    }
    const scheduleNoticeExpiry=()=>{if(expiryTimer)clearTimeout(expiryTimer);expiryTimer=0;const next=noticeItems.filter(n=>n&&n.visible!==false&&n.expiresAt&&!isExpired(n)).map(n=>timeOf(n.expiresAt)).filter(t=>t>Date.now()).sort((a,b)=>a-b)[0];if(next)expiryTimer=setTimeout(()=>{void render(true);},Math.min(Math.max(next-Date.now()+100,500),2147480000));};
    const periodLabel=n=>`${dateLabel(n.createdAt||n.updatedAt)} · ${n.durationUnit==='unlimited'||!n.expiresAt?'Ilimitado':`até ${dateLabel(n.expiresAt)}`}`;
    const persistLocalNotice=(n,all)=>{const next=(Array.isArray(all)?all:[]).filter(x=>String(x.id)!==String(n.id));next.push(n);write('fp_school_notices',next);noticeItems=next;noticesLoaded=true;};
    const pageWindow=(total,page)=>{if(total<=3)return Array.from({length:total},(_,i)=>i+1);const first=Math.max(1,Math.min(page,total-2));return [first,first+1,first+2];};
    const showNoticeModal=n=>{
      let modal=$('school-notice-view-modal');
      if(!modal){modal=document.createElement('div');modal.id='school-notice-view-modal';modal.className='fp-detail-modal hidden';modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');modal.setAttribute('aria-labelledby','school-notice-view-title');modal.innerHTML='<div class="fp-detail-dialog"><div class="fp-detail-header"><div><p class="fp-section-eyebrow">COMUNICAÇÃO</p><h2 id="school-notice-view-title" class="fp-detail-title"></h2></div><button type="button" class="fp-detail-close" data-notice-view-close aria-label="Fechar aviso">×</button></div><div class="fp-detail-body" id="school-notice-view-body"></div></div>';document.body.appendChild(modal);modal.addEventListener('click',e=>{if(e.target===modal||e.target.closest('[data-notice-view-close]')){modal.classList.add('hidden');modal.classList.remove('is-open');}});document.addEventListener('keydown',e=>{if(e.key==='Escape'&&modal.classList.contains('is-open')){modal.classList.add('hidden');modal.classList.remove('is-open');}});}
      modal.querySelector('#school-notice-view-title').textContent=n.title||'Aviso';
      const body=modal.querySelector('#school-notice-view-body');
      body.innerHTML=`${n.image?`<img class="fp-detail-image" src="${esc(n.image)}" alt="Imagem do aviso">`:''}${n.summary?`<p class="fp-detail-summary">${esc(n.summary)}</p>`:''}<div class="fp-detail-content">${esc(n.details||n.summary||'Sem conteúdo adicional.').replace(/\r?\n/g,'<br>')}</div><p class="fp-detail-meta">Período: ${esc(periodLabel(n))}${n.visible===false?' · Oculto na página pública':''}</p>`;
      modal.classList.remove('hidden');modal.classList.add('is-open');modal.querySelector('[data-notice-view-close]')?.focus();
    };
    const render=async(refresh=false)=>{
      if(refresh||!noticesLoaded){noticeItems=(await load()).slice();noticesLoaded=true;}
      const all=noticeItems.slice();
      closeFloatingActionMenu();
      const query=normalizeSearch(search?.value||'');
      const mode=String(filter?.value||'recent');
      let items=noticeItems.filter(n=>{
        const visible=n.visible!==false;
        if(mode==='visible'&&!visible)return false;
        if(mode==='hidden'&&visible)return false;
        const hay=normalizeSearch(`${n.title||''} ${n.summary||''} ${n.details||''} ${n.message||''} ${n.author||''} ${n.authorName||''} ${n.category||''} ${n.visibility||''} ${dateLabel(n.createdAt||n.updatedAt)} ${dateLabel(n.expiresAt)} ${visible?'visível visivel permitido ativo':'oculto bloqueado inativo'} ${n.durationUnit==='unlimited'?'ilimitado sem prazo':''} ${n.durationValue||''}`);
        return !query||hay.includes(query);
      });
      items.sort((a,b)=>{
        if(mode==='oldest')return timeOf(a.createdAt||a.updatedAt)-timeOf(b.createdAt||b.updatedAt);
        return timeOf(b.createdAt||b.updatedAt)-timeOf(a.createdAt||a.updatedAt);
      });
      const totalPages=Math.max(1,Math.ceil(items.length/pageSize));currentPage=Math.max(1,Math.min(currentPage,totalPages));
      const visibleItems=items.slice((currentPage-1)*pageSize,currentPage*pageSize);
      list.innerHTML=visibleItems.length?`<div class="fp-data-table-wrap"><table class="fp-data-table fp-notice-table"><thead><tr><th scope="col">Título</th><th scope="col">Período de exibição</th><th scope="col">Visibilidade</th><th scope="col">Ações</th></tr></thead><tbody>${visibleItems.map(n=>{
        const expired=isExpired(n),visible=n.visible!==false;
        return `<tr><td><button type="button" class="fp-table-title-button fp-notice-title-button" data-view-notice="${esc(n.id)}"><strong>${esc(n.title||'Sem título')}</strong></button></td><td><span class="fp-period-label">${esc(periodLabel(n))}</span>${expired?'<span class="fp-expired-label">Prazo encerrado</span>':''}</td><td><span class="fp-visibility-badge ${visible?'is-visible':'is-hidden'}" role="status">${visible?'Visível':'Oculto'}</span></td><td><div class="fp-action-menu"><button type="button" class="fp-action-trigger" data-notice-menu-toggle="${esc(n.id)}" aria-label="Ações para ${esc(n.title||'aviso')}" aria-expanded="false">⋯</button><div class="fp-action-dropdown" data-notice-menu="${esc(n.id)}" hidden><button type="button" data-notice-view="${esc(n.id)}">Visualizar</button><button type="button" data-edit-notice="${esc(n.id)}">Ajustar aviso</button><button type="button" class="is-danger" data-delete-notice="${esc(n.id)}">Excluir</button></div></div></td></tr>`;
      }).join('')}</tbody></table></div>`:`<div class="fp-empty-state">${query||mode==='visible'||mode==='hidden'?'Nenhum aviso corresponde aos filtros.':'Nenhum aviso cadastrado ainda.'}</div>`;
      const from=items.length?(currentPage-1)*pageSize+1:0,to=Math.min(currentPage*pageSize,items.length);
      list.insertAdjacentHTML('beforeend',`<div class="fp-table-footer"><p>Mostrando ${from}–${to} de ${items.length} avisos</p><nav class="fp-pagination" aria-label="Páginas de avisos"><button type="button" class="fp-page-btn fp-page-arrow" data-notice-page="${currentPage-1}" aria-label="Página anterior" ${currentPage<=1?'disabled':''}>‹</button>${pageWindow(Math.ceil(items.length/pageSize),currentPage).map(p=>`<button type="button" class="fp-page-btn ${p===currentPage?'is-current':''}" data-notice-page="${p}" aria-current="${p===currentPage?'page':'false'}">${p}</button>`).join('')}<button type="button" class="fp-page-btn fp-page-arrow" data-notice-page="${currentPage+1}" aria-label="Próxima página" ${currentPage>=totalPages?'disabled':''}>›</button></nav></div>`);
      scheduleNoticeExpiry();
    };
    list.__fpRenderNotices=render;
    const updateNotice=async(n)=>{
      if(fpCloudEnabled()){if(typeof window.FPCloud.saveSchoolNotice!=='function')throw new Error('O módulo de avisos do Firebase não está disponível.');const result=await window.FPCloud.saveSchoolNotice(n.id,n);if(result===false)throw new Error('O Firebase não confirmou a atualização do aviso.');}
      const all=await load();persistLocalNotice(n,all);window.dispatchEvent(new CustomEvent('fp:school-notices-updated'));
    };
    if(list.dataset.actionsBound!=='1'){
      list.dataset.actionsBound='1';
      list.addEventListener('click',async e=>{
        const toggle=e.target.closest('[data-notice-menu-toggle]');
        if(toggle){const id=String(toggle.dataset.noticeMenuToggle||''),menu=list.querySelector(`[data-notice-menu="${CSS.escape(id)}"]`);openFloatingActionMenu(toggle,menu,list);return;}
        const page=e.target.closest('[data-notice-page]');if(page){const next=Number(page.dataset.noticePage);if(Number.isFinite(next)){currentPage=Math.max(1,next);await render();}return;}
        const view=e.target.closest('[data-view-notice]');if(view){const n=noticeItems.find(x=>String(x.id)===String(view.dataset.viewNotice));if(n)showNoticeModal(n);list.querySelectorAll('[data-notice-menu]').forEach(m=>m.hidden=true);return;}
        const viewMenu=e.target.closest('[data-notice-view]');if(viewMenu){const n=noticeItems.find(x=>String(x.id)===String(viewMenu.dataset.noticeView));if(n)showNoticeModal(n);return;}
        const edit=e.target.closest('[data-edit-notice]');if(edit){const n=noticeItems.find(x=>String(x.id)===String(edit.dataset.editNotice));if(!n)return;resetNoticeForm();form.dataset.editId=n.id;form.dataset.initialEdit='1';form.dataset.originalDurationValue=String(n.durationValue??'');form.dataset.originalDurationUnit=['minutes','hours','days','unlimited'].includes(n.durationUnit)?n.durationUnit:'days';$('school-notice-title').value=n.title||'';$('school-notice-summary').value=n.summary||'';$('school-notice-details').value=n.details||'';$('school-notice-duration').value=String(n.durationValue||7);$('school-notice-duration-unit').value=['minutes','hours','days','unlimited'].includes(n.durationUnit)?n.durationUnit:'days';$('school-notice-image-url').value=n.image||'';fpAdminSaveCrop(form,fpAdminNormalizeCrop(n.imageCrop));setNoticeImagePreview(n.image||'',fpAdminReadCrop(form));syncDurationControl();$('notice-form-title').textContent='Ajustar aviso';$('school-notice-save').textContent='Salvar alterações';setNoticeStatus('Se alterar o período de exibição, o aviso voltará a ficar visível ao salvar. Os demais ajustes preservam a visibilidade atual.');openNoticeForm();return;}
        const visibilityAction=e.target.closest('[data-notice-set-visibility]');if(visibilityAction){const id=String(visibilityAction.dataset.noticeSetVisibility||''),n=noticeItems.find(x=>String(x.id)===id);if(!n)return;const nextVisible=visibilityAction.dataset.nextVisible==='true',now=new Date(),next={...n,visible:nextVisible,updatedAt:now.toISOString()};if(nextVisible&&isExpired(n)){const unit=['minutes','hours','days','unlimited'].includes(n.durationUnit)?n.durationUnit:'days';if(unit==='unlimited'){next.durationUnit='unlimited';next.durationValue=null;next.expiresAt=null;}else{const factor=durationFactors[unit]||durationFactors.days,value=Number.isInteger(Number(n.durationValue))&&Number(n.durationValue)>0?Math.min(Number(n.durationValue),3650):7;next.durationUnit=unit;next.durationValue=value;next.expiresAt=new Date(now.getTime()+value*factor).toISOString();}}try{await updateNotice(next);setNoticeStatus(nextVisible?'Aviso novamente visível para a comunidade.':'Aviso ocultado da página pública.');currentPage=1;await render(true);}catch(error){setNoticeStatus(error?.message||'Não foi possível atualizar a visibilidade.');}return;}
        const del=e.target.closest('[data-delete-notice]');if(del){const id=String(del.dataset.deleteNotice||'');const n=noticeItems.find(x=>String(x.id)===id);if(!n||del.dataset.busy==='1')return;if(!confirm(`Excluir o aviso “${n.title||'Sem título'}”?`))return;del.dataset.busy='1';del.disabled=true;try{if(fpCloudEnabled()){const result=await window.FPCloud.deleteSchoolNotice?.(id);if(result===false||result?.ok===false)throw new Error(result?.message||'O Firebase não confirmou a exclusão do aviso.');}const all=await load();write('fp_school_notices',all.filter(x=>String(x.id)!==id));noticeItems=noticeItems.filter(x=>String(x.id)!==id);setNoticeStatus('Aviso excluído.');window.dispatchEvent(new CustomEvent('fp:school-notices-updated'));await render();}catch(error){del.disabled=false;delete del.dataset.busy;setNoticeStatus(error?.message||'Não foi possível excluir o aviso.');}return;}
      });
    }
    bindSearchInput(search,()=>{currentPage=1;void render();});
    if(filter&&filter.dataset.bound!=='1'){filter.dataset.bound='1';filter.addEventListener('change',()=>{currentPage=1;void render();});}
    if(form.dataset.formBound!=='1'){
      form.dataset.formBound='1';form.onsubmit=async e=>{
        e.preventDefault();if(form.dataset.busy==='1')return;
        const title=$('school-notice-title').value.trim(),details=$('school-notice-details').value.trim();
        if(!title){setNoticeStatus('Informe um título.');return;}
        if(!details){setNoticeStatus('Informe o conteúdo do aviso.');$('school-notice-details').focus();return;}
        const durationUnit=$('school-notice-duration-unit')?.value||'days',unlimited=durationUnit==='unlimited',durationValue=unlimited?null:Number($('school-notice-duration')?.value||0);
        if(!unlimited&&(!Number.isInteger(durationValue)||durationValue<1||durationValue>3650||!durationFactors[durationUnit])){setNoticeStatus('Informe um prazo inteiro entre 1 e 3650, com uma unidade válida.');return;}
        const id=form.dataset.editId||uid('notice'),loaded=await load(),existing=loaded.find(x=>String(x.id)===String(id));
        const file=$('school-notice-image')?.files?.[0],imageUrl=$('school-notice-image-url')?.value.trim()||'';
        form.dataset.busy='1';const save=$('school-notice-save');if(save){save.disabled=true;save.setAttribute('aria-busy','true');}
        try{
          let image=existing?.image||'';
          if(file){if(!window.FPCloud?.uploadDataUrl)throw new Error('O Cloudinary não está disponível para a imagem do aviso.');const data=await imageDataURL(file);image=await window.FPCloud.uploadDataUrl(data,{folder:`notices/${id}`});}
          else if(imageUrl)image=imageUrl;
          else if(!existing)image='';
          if(/^data:/i.test(String(image||'')))throw new Error('A imagem ainda não foi enviada para o armazenamento externo.');
          const now=new Date(),nowIso=now.toISOString(),createdAt=existing?.createdAt||nowIso;
          const expiresAt=unlimited?null:new Date(now.getTime()+durationValue*durationFactors[durationUnit]).toISOString();
          const originalDurationValue=form.dataset.editId?String(form.dataset.originalDurationValue??existing?.durationValue??''):String(existing?.durationValue??'');
          const rawOriginalDurationUnit=form.dataset.editId?String(form.dataset.originalDurationUnit||existing?.durationUnit||'days'):String(existing?.durationUnit||'days');
          const originalDurationUnit=['minutes','hours','days','unlimited'].includes(rawOriginalDurationUnit)?rawOriginalDurationUnit:'days';
          const durationChanged=Boolean(existing&&(String(originalDurationValue)!==String(durationValue??'')||originalDurationUnit!==String(durationUnit)));
          const cropWasReplaced=Boolean(file||(imageUrl&&imageUrl!==String(existing?.image||'')));
          const chosenCrop=fpAdminReadCrop(form);
          const imageCrop=image?(cropWasReplaced?(chosenCrop||null):(chosenCrop||fpAdminNormalizeCrop(existing?.imageCrop))):null;
          const n={...(existing||{}),id,title,summary:$('school-notice-summary').value.trim()||details.slice(0,220),details,image,imageCrop,visible:existing?(durationChanged?true:existing.visible!==false):true,createdAt,updatedAt:nowIso,durationValue,durationUnit,expiresAt};
          if(window.FPCloud?.saveSchoolNotice){const saved=await window.FPCloud.saveSchoolNotice(id,n);if(saved===false)throw new Error('O Firebase não confirmou o salvamento do aviso.');}
          persistLocalNotice(n,loaded);resetNoticeForm();closeNoticeForm();
          setNoticeStatus(unlimited?'Aviso salvo sem data de expiração.':(existing?'Aviso atualizado e salvo.':'Aviso salvo e publicado.'));
          currentPage=1;await render();window.dispatchEvent(new CustomEvent('fp:school-notices-updated'));
        }catch(error){setNoticeStatus(error?.message||'Não foi possível salvar o aviso.');}
        finally{delete form.dataset.busy;if(save){save.disabled=false;save.removeAttribute('aria-busy');}}
      };
    }
    const imageInput=$('school-notice-image'),preview=$('school-notice-image-preview'),imageSelect=$('school-notice-image-select'),imageUrlInput=$('school-notice-image-url');
    if(imageSelect&&imageInput&&imageSelect.dataset.bound!=='1'){imageSelect.dataset.bound='1';imageSelect.addEventListener('click',()=>imageInput.click());}
    const noticeCropButton=$('school-notice-image-crop');
    if(noticeCropButton&&noticeCropButton.dataset.bound!=='1'){noticeCropButton.dataset.bound='1';noticeCropButton.addEventListener('click',()=>{const file=imageInput?.files?.[0],fallback=String(imageUrlInput?.value||'').trim()||(form.dataset.editId?noticeItems.find(n=>String(n.id)===String(form.dataset.editId))?.image||'':'');const src=file?noticeImageObjectUrl:fallback;if(!src){setNoticeStatus('Escolha uma imagem ou informe um link antes de recortar.');return;}fpAdminOpenImageCrop({form,source:src,currentCrop:fpAdminReadCrop(form),onApply:crop=>{fpAdminSaveCrop(form,crop);setNoticeImagePreview(src,crop);form.dataset.userTouched='1';}});});}
    if(imageInput&&preview&&imageInput.dataset.bound!=='1'){imageInput.dataset.bound='1';imageInput.addEventListener('change',()=>{const file=imageInput.files?.[0];if(noticeImageObjectUrl){URL.revokeObjectURL(noticeImageObjectUrl);noticeImageObjectUrl='';}if(!file){if(!imageUrlInput?.value.trim())setNoticeImagePreview(form.dataset.editId?noticeItems.find(n=>String(n.id)===String(form.dataset.editId))?.image||'':'');return;}noticeImageObjectUrl=URL.createObjectURL(file);delete form.dataset.fpImageCrop;setNoticeImagePreview(noticeImageObjectUrl,null);if(imageUrlInput)imageUrlInput.value='';});}
    if(imageUrlInput&&imageUrlInput.dataset.previewBound!=='1'){imageUrlInput.dataset.previewBound='1';imageUrlInput.addEventListener('input',()=>{const value=imageUrlInput.value.trim();if(noticeImageObjectUrl){URL.revokeObjectURL(noticeImageObjectUrl);noticeImageObjectUrl='';}if(imageInput)imageInput.value='';if(value){delete form.dataset.fpImageCrop;setNoticeImagePreview(/^https?:\/\//i.test(value)?value:'',null);}else if(!imageInput?.files?.length){const fallback=form.dataset.editId?noticeItems.find(n=>String(n.id)===String(form.dataset.editId))?.image||'':'';setNoticeImagePreview(fallback,fpAdminReadCrop(form));}});}

    if(form.dataset.dirtyBound!=='1'){form.dataset.dirtyBound='1';form.addEventListener('input',()=>{form.dataset.userTouched='1';});form.addEventListener('change',()=>{form.dataset.userTouched='1';});}
    if(!window.__fpNoticeMenuCloseBound){window.__fpNoticeMenuCloseBound=true;document.addEventListener('click',e=>{if(e.target.closest('#school-notice-admin-list .fp-action-menu')||e.target.closest('#fp-floating-action-menu'))return;document.querySelectorAll('#school-notice-admin-list [data-notice-menu]').forEach(m=>m.hidden=true);document.querySelectorAll('#school-notice-admin-list [data-notice-menu-toggle]').forEach(b=>b.setAttribute('aria-expanded','false'));});}
    if(!window.__fpNoticeExpiryFocusBound){window.__fpNoticeExpiryFocusBound=true;const refreshExpired=()=>{if(!document.hidden&&document.querySelector('[data-panel="avisos"]:not(.hidden)'))void render(true);};window.addEventListener('focus',refreshExpired);document.addEventListener('visibilitychange',refreshExpired);}
    await render();
  }

  async function editorialExtras(s){
    if(!isEditor(s))return;
    const suggestions=$("suggestions-list"),form=$("achievement-form"),admin=$("achievement-admin-list");let getAchievementCredits=()=>[];let achievementCreditSource=achievementCreditUsers();
    let editorialPautaItems=[];
    // Declara os renderizadores antes das atribuições assíncronas abaixo. O script usa "use strict", portanto atribuir a um identificador inexistente abortaria editorialExtras antes de renderizar as listas.
    let renderEditorialPautas = async()=>{};
    let renderEditorialConquistas = async()=>{};

    // Pautas: mesmos documentos/coleção, agora com estado editorial, pesquisa e paginação.
    const pautaSearch=$('suggestions-search'),pautaSort=$('suggestions-sort'),pautaTabs=$('pauta-status-tabs'),pautaPager=$('suggestions-pagination');
    const pautaStates=['Pendente','Em análise','Concluída','Rejeitada'];let pautaFilter='Todas',pautaPage=1,pautaRenderSequence=0;const pautaPageSize=5;
    let pautaCleanupRunning=false;
    const pautaTime=value=>{
      if(value==null||value==='')return 0;
      if(typeof value==='number')return Number.isFinite(value)?value:0;
      if(typeof value==='object'){
        if(typeof value.toDate==='function'){const ms=value.toDate().getTime();return Number.isFinite(ms)?ms:0;}
        if(Number.isFinite(Number(value.seconds)))return Number(value.seconds)*1000+Math.floor(Number(value.nanoseconds||0)/1e6);
      }
      const ms=Date.parse(String(value));return Number.isFinite(ms)?ms:0;
    };
    const pautaStatus=item=>{
      const raw=String(item?.status||'').trim().toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[\u0300-\u036f]/g,'');
      if(['concluida','concluido','concluidas','concluidos','concluida.','finalizada','finalizado'].includes(raw))return 'Concluída';
      if(['rejeitada','rejeitado','rejeitadas','rejeitados','recusada','recusado'].includes(raw))return 'Rejeitada';
      if(['em analise','analise','em andamento','trabalhando'].includes(raw))return 'Em análise';
      return 'Pendente';
    };
    const pautaDate=value=>{const ms=pautaTime(value);return ms?new Date(ms).toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit',year:'2-digit'}):'—';};
    const pautaTerminal=status=>status==='Concluída'||status==='Rejeitada';
    const pautaPageWindow=(total,page)=>{if(total<=3)return Array.from({length:total},(_,i)=>i+1);const first=Math.max(1,Math.min(page,total-2));return [first,first+1,first+2];};
    const cleanupOldPautas=async(items,remoteReady)=>{
      if(pautaCleanupRunning||!Array.isArray(items))return items;
      pautaCleanupRunning=true;
      try{
        const cutoff=Date.now()-7*24*60*60*1000,removeIds=[];
        for(const item of items){
          if(!pautaTerminal(pautaStatus(item)))continue;
          const terminalAt=item.terminalAt||item.statusChangedAt||item.updatedAt||item.createdAt;
          const ms=pautaTime(terminalAt);if(!ms||ms>cutoff)continue;
          if(fpCloudEnabled()){
            if(!remoteReady)continue;
            try{const result=await window.FPCloud.deleteSuggestion?.(String(item.id));if(result?.ok===true||result===true)removeIds.push(String(item.id));else console.warn('[Folha do Paiquerê] a limpeza automática não removeu a pauta:',item.id,result?.message||'sem confirmação');}catch(error){console.warn('[Folha do Paiquerê] falha na limpeza automática de pauta:',error);}
          }else removeIds.push(String(item.id));
        }
        if(!removeIds.length)return items;
        const next=items.filter(item=>!removeIds.includes(String(item.id)));
        write('fp_suggestions',next);return next;
      }finally{pautaCleanupRunning=false;}
    };
    const paintEditorialPautas=()=>{
      if(!suggestions)return;
      closeFloatingActionMenu();
      const query=normalizeSearch(pautaSearch?.value||''),sort=String(pautaSort?.value||'recent');
      const all=editorialPautaItems.filter(x=>!['Arquivada','Retirada','Excluída'].includes(String(x?.status||'')));
      const counts={Todas:all.length};pautaStates.forEach(status=>counts[status]=all.filter(x=>pautaStatus(x)===status).length);
      pautaTabs?.querySelectorAll('[data-pauta-filter]').forEach(button=>{
        const status=button.dataset.pautaFilter||'Todas';button.setAttribute('aria-pressed',String(status===pautaFilter));button.classList.toggle('is-active',status===pautaFilter);
        const counter=button.querySelector('[data-pauta-count]');if(counter)counter.textContent=String(counts[status]??all.length);
      });
      let items=all.filter(x=>{
        if(pautaFilter!=='Todas'&&pautaStatus(x)!==pautaFilter)return false;
        const attachmentNames=Array.isArray(x?.attachments)?x.attachments.map(a=>a?.name||'').join(' '):'';
        const hay=normalizeSearch(`${x?.subject||''} ${x?.title||''} ${x?.text||''} ${x?.message||''} ${x?.description||''} ${x?.category||''} ${x?.channel||''} ${x?.name||'Anônimo'} ${x?.author||''} ${x?.authorName||''} ${x?.email||''} ${x?.authorEmail||''} ${x?.status||''} ${attachmentNames} ${pautaDate(x?.createdAt)} ${x?.createdAt&&pautaTime(x.createdAt)?new Date(pautaTime(x.createdAt)).toLocaleString('pt-BR'):''}`);
        return !query||hay.includes(query);
      });
      items.sort((a,b)=>sort==='oldest'?pautaTime(a?.createdAt)-pautaTime(b?.createdAt):pautaTime(b?.createdAt)-pautaTime(a?.createdAt));
      const totalPages=Math.max(1,Math.ceil(items.length/pautaPageSize));pautaPage=Math.max(1,Math.min(pautaPage,totalPages));
      const shown=items.slice((pautaPage-1)*pautaPageSize,pautaPage*pautaPageSize);
      const statusOptions=(item)=>pautaStates.map(status=>`<option value="${esc(status)}" ${pautaStatus(item)===status?'selected':''}>${esc(status)}</option>`).join('');
      suggestions.innerHTML=shown.length?`<div class="fp-data-table-wrap"><table class="fp-data-table fp-pauta-table"><thead><tr><th scope="col">Título</th><th scope="col">Autor</th><th scope="col">Data</th><th scope="col">Status</th><th scope="col">Ações</th></tr></thead><tbody>${shown.map(x=>{
        const status=pautaStatus(x),who=x.name?x.name:'Anônimo';
        return `<tr><td><button type="button" class="fp-table-title-button fp-pauta-title-button" data-open-suggestion="${esc(x.id)}"><span class="fp-pauta-type-icon" aria-hidden="true">☷</span><span><strong>${esc(x.subject||'Sugestão')}</strong><small>${esc(String(x.text||'').replace(/\s+/g,' ').slice(0,86))}${String(x.text||'').length>86?'…':''}</small></span></button></td><td><span class="fp-table-primary">${esc(who)}</span></td><td><span class="fp-date-cell">${esc(pautaDate(x.createdAt))}</span></td><td><select class="fp-pauta-status-select" data-suggestion-status="${esc(x.id)}" data-status="${esc(status)}" aria-label="Status da pauta ${esc(x.subject||'')}">${statusOptions(x)}</select></td><td><div class="fp-action-menu"><button type="button" class="fp-action-trigger" data-suggestion-menu-toggle="${esc(x.id)}" aria-label="Ações para ${esc(x.subject||'pauta')}" aria-expanded="false">⋯</button><div class="fp-action-dropdown" data-suggestion-menu="${esc(x.id)}" hidden><button type="button" data-copy-suggestion="${esc(x.id)}">Copiar conteúdo</button><button type="button" class="is-danger" data-delete-suggestion="${esc(x.id)}">Excluir pauta</button></div></div></td></tr>`;
      }).join('')}</tbody></table></div>`:`<div class="fp-empty-state">${query||pautaFilter!=='Todas'?'Nenhuma pauta corresponde aos filtros.':'Nenhuma pauta enviada pela comunidade.'}</div>`;
      const from=items.length?(pautaPage-1)*pautaPageSize+1:0,to=Math.min(pautaPage*pautaPageSize,items.length);
      if(pautaPager)pautaPager.innerHTML=`<p>Mostrando ${from}–${to} de ${items.length} pautas</p><nav class="fp-pagination" aria-label="Páginas de pautas"><button type="button" class="fp-page-btn fp-page-arrow" data-pauta-page="${pautaPage-1}" aria-label="Página anterior" ${pautaPage<=1?'disabled':''}>‹</button>${pautaPageWindow(Math.ceil(items.length/pautaPageSize),pautaPage).map(p=>`<button type="button" class="fp-page-btn ${p===pautaPage?'is-current':''}" data-pauta-page="${p}" aria-current="${p===pautaPage?'page':'false'}">${p}</button>`).join('')}<button type="button" class="fp-page-btn fp-page-arrow" data-pauta-page="${pautaPage+1}" aria-label="Próxima página" ${pautaPage>=totalPages?'disabled':''}>›</button></nav>`;
    };
    const openPautaDetail=item=>{
      const modal=$('pauta-detail-modal');if(!modal)return;
      $('pauta-detail-title').textContent=item.subject||'Sugestão';$('pauta-detail-author').textContent=item.name||'Anônimo';$('pauta-detail-date').textContent=pautaDate(item.createdAt);$('pauta-detail-content').textContent=item.text||'Sem conteúdo.';
      const status=$('pauta-detail-status');if(status){status.textContent=pautaStatus(item);status.dataset.status=pautaStatus(item);}
      const attachments=$('pauta-detail-attachments');if(attachments)attachments.innerHTML=Array.isArray(item.attachments)&&item.attachments.length?item.attachments.map(a=>`<a class="fp-attachment-link" href="${esc(a.data||'')}" target="_blank" rel="noopener" download="${esc(a.name||'arquivo')}"><span aria-hidden="true">${a.type&&a.type.startsWith('image/')?'▧':a.type==='application/pdf'?'PDF':'DOC'}</span>${esc(a.name||'Arquivo anexado')}</a>`).join('') :'';
      modal.classList.remove('hidden');modal.classList.add('is-open');modal.querySelector('[data-pauta-detail-close]')?.focus();
    };
    const closePautaDetail=()=>{const modal=$('pauta-detail-modal');modal?.classList.add('hidden');modal?.classList.remove('is-open');};
    if(pautaTabs&&pautaTabs.dataset.bound!=='1'){pautaTabs.dataset.bound='1';pautaTabs.addEventListener('click',e=>{const button=e.target.closest('[data-pauta-filter]');if(!button)return;pautaFilter=button.dataset.pautaFilter||'Todas';pautaPage=1;paintEditorialPautas();});}
    bindSearchInput(pautaSearch,()=>{pautaPage=1;paintEditorialPautas();});
    if(pautaSort&&pautaSort.dataset.bound!=='1'){pautaSort.dataset.bound='1';pautaSort.addEventListener('change',()=>{pautaPage=1;paintEditorialPautas();});}
    if(pautaPager&&pautaPager.dataset.bound!=='1'){pautaPager.dataset.bound='1';pautaPager.addEventListener('click',e=>{const button=e.target.closest('[data-pauta-page]');if(!button||button.disabled)return;const page=Number(button.dataset.pautaPage);if(Number.isFinite(page)){pautaPage=Math.max(1,page);paintEditorialPautas();}});}
    if(suggestions&&suggestions.dataset.actionsBound!=='1'){
      suggestions.dataset.actionsBound='1';
      suggestions.addEventListener('click',async e=>{
        const toggle=e.target.closest('[data-suggestion-menu-toggle]');
        if(toggle){const id=String(toggle.dataset.suggestionMenuToggle||''),menu=suggestions.querySelector(`[data-suggestion-menu="${CSS.escape(id)}"]`);openFloatingActionMenu(toggle,menu,suggestions);return;}
        const open=e.target.closest('[data-open-suggestion]');if(open){const item=editorialPautaItems.find(x=>String(x.id)===String(open.dataset.openSuggestion));if(item)openPautaDetail(item);return;}
        const copy=e.target.closest('[data-copy-suggestion]');if(copy){const item=editorialPautaItems.find(x=>String(x.id)===String(copy.dataset.copySuggestion));if(!item)return;const text=`${item.subject||'Sugestão'}\n\nAutor: ${item.name||'Anônimo'}\nData: ${pautaDate(item.createdAt)}\n\n${item.text||''}`;try{if(navigator.clipboard?.writeText)await navigator.clipboard.writeText(text);else{const ta=document.createElement('textarea');ta.value=text;ta.style.position='fixed';ta.style.opacity='0';document.body.appendChild(ta);ta.select();const ok=document.execCommand('copy');ta.remove();if(!ok)throw new Error('copy-failed');}announce('Conteúdo da pauta copiado.');}catch(_){announce('Não foi possível copiar automaticamente. Abra a pauta e copie o texto manualmente.');}suggestions.querySelectorAll('[data-suggestion-menu]').forEach(m=>m.hidden=true);return;}
        const del=e.target.closest('[data-delete-suggestion]');if(del){if(del.dataset.busy==='1')return;const id=String(del.dataset.deleteSuggestion||''),item=editorialPautaItems.find(x=>String(x?.id)===id);if(!item||!confirm(`Excluir a pauta “${item.subject||'Sugestão'}” permanentemente?`))return;del.dataset.busy='1';del.disabled=true;try{if(fpCloudEnabled()){const result=await window.FPCloud.deleteSuggestion?.(id);if(result===false||result?.ok===false||(!result?.ok&&result!==true))throw new Error(result?.message||'Não foi possível excluir a pauta no Firebase.');}editorialPautaItems=editorialPautaItems.filter(x=>String(x?.id)!==id);const local=read('fp_suggestions',[]);write('fp_suggestions',Array.isArray(local)?local.filter(x=>String(x?.id)!==id):[]);window.dispatchEvent(new CustomEvent('fp:suggestions-updated'));announce('Pauta excluída com sucesso.');paintEditorialPautas();}catch(error){del.disabled=false;delete del.dataset.busy;announce(error?.message||'Não foi possível excluir a pauta.');}return;}
      });
      suggestions.addEventListener('change',async e=>{
        const select=e.target.closest('[data-suggestion-status]');if(!select)return;
        const id=String(select.dataset.suggestionStatus||''),item=editorialPautaItems.find(x=>String(x?.id)===id);if(!item)return;
        const previous=pautaStatus(item),nextStatus=String(select.value||''),now=new Date().toISOString();if(!pautaStates.includes(nextStatus)){select.value=previous;return;}
        const next={...item,status:nextStatus,statusChangedAt:now,terminalAt:pautaTerminal(nextStatus)?now:null,updatedAt:now};select.disabled=true;
        try{
          if(fpCloudEnabled()){const result=await window.FPCloud.saveSuggestion?.(id,next);if(!(result===true||result?.ok===true))throw new Error(result?.message||'O Firebase não confirmou a alteração de status.');}
          editorialPautaItems=editorialPautaItems.map(x=>String(x?.id)===id?next:x);const local=read('fp_suggestions',[]);write('fp_suggestions',Array.isArray(local)?local.map(x=>String(x?.id)===id?next:x):[next]);window.dispatchEvent(new CustomEvent('fp:suggestions-updated'));announce(`Status da pauta alterado para ${nextStatus}.`);paintEditorialPautas();
        }catch(error){select.value=previous;select.disabled=false;announce(error?.message||'Não foi possível alterar o status da pauta.');}
      });
    }
    const pautaModal=$('pauta-detail-modal');if(pautaModal&&pautaModal.dataset.bound!=='1'){pautaModal.dataset.bound='1';pautaModal.addEventListener('click',e=>{if(e.target===pautaModal||e.target.closest('[data-pauta-detail-close]'))closePautaDetail();});document.addEventListener('keydown',e=>{if(e.key==='Escape')closePautaDetail();});}
    renderEditorialPautas=async()=>{
      if(!suggestions)return;
      const renderSequence=++pautaRenderSequence;
      let items=read('fp_suggestions',[]),remoteReady=false;
      if(window.FPCloud?.fetchSuggestions){try{const remote=await window.FPCloud.fetchSuggestions();if(Array.isArray(remote)){items=remote;remoteReady=true;}}catch(error){console.warn('[Folha do Paiquerê] não foi possível atualizar as pautas pelo Firebase:',error);}}
      if(renderSequence!==pautaRenderSequence)return;
      items=await cleanupOldPautas(Array.isArray(items)?items:[],remoteReady);
      if(renderSequence!==pautaRenderSequence)return;
      editorialPautaItems=(Array.isArray(items)?items:[]).filter(x=>!['Arquivada','Retirada','Excluída'].includes(String(x?.status||''))).slice().sort((a,b)=>pautaTime(b?.createdAt)-pautaTime(a?.createdAt));
      write('fp_suggestions',editorialPautaItems);paintEditorialPautas();
    };
    void renderEditorialPautas();
    if(window.FPCloud?.listenSuggestions){window.FPCloud.listenSuggestions(items=>{if(Array.isArray(items)){write('fp_suggestions',items);void renderEditorialPautas();}});}
    if(!window.__fpPautaCleanupTimer){window.__fpPautaCleanupTimer=setInterval(()=>{void renderEditorialPautas();},30*60*1000);}
    if(!window.__fpPautaMenuCloseBound){window.__fpPautaMenuCloseBound=true;document.addEventListener('click',e=>{if(e.target.closest('#suggestions-list .fp-action-menu')||e.target.closest('#fp-floating-action-menu'))return;document.querySelectorAll('#suggestions-list [data-suggestion-menu]').forEach(m=>m.hidden=true);document.querySelectorAll('#suggestions-list [data-suggestion-menu-toggle]').forEach(b=>b.setAttribute('aria-expanded','false'));});}

    // Conquistas: formulário em modal e lista editorial com busca, ordenação, ações e paginação.
    const achievementPager=$('achievement-admin-pagination'),achievementSort=$('achievement-admin-sort'),achievementNew=$('achievement-new');
    const achievementFormModal=$('achievement-form-modal'),achievementDetailModal=$('achievement-view-modal'),achievementPageStatus=$('achievement-admin-status');
    const achievementPageSize=5;let achievementPage=1,achievementItems=[],achievementImageObjectUrl='',achievementRenderSequence=0,achievementFetchPromise=null,achievementRemoteCache=null;
    const achievementCategories=item=>{
      const source=Array.isArray(item?.types)&&item.types.length?item.types:String(item?.type||'').split(/\r?\n/);
      return [...new Set(source.map(value=>String(value||'').trim()).filter(Boolean))].slice(0,3);
    };
    const achievementTime=value=>{
      if(value==null||value==='')return 0;
      if(typeof value==='number')return Number.isFinite(value)?value:0;
      if(typeof value==='object'){
        if(typeof value.toDate==='function')return value.toDate().getTime()||0;
        if(Number.isFinite(Number(value.seconds)))return Number(value.seconds)*1000;
      }
      const time=Date.parse(String(value));return Number.isFinite(time)?time:0;
    };
    const achievementDate=value=>{const ms=achievementTime(value);return ms?new Date(ms).toLocaleDateString('pt-BR'):'Data não informada';};
    const achievementPageWindow=(total,page)=>{if(total<=3)return Array.from({length:total},(_,i)=>i+1);const first=Math.max(1,Math.min(page,total-2));return [first,first+1,first+2];};
    const normalizeAchievementImageURL=raw=>{const value=String(raw||'').trim();if(!value)return '';try{const url=new URL(value);return ['http:','https:'].includes(url.protocol)?url.href:'';}catch(_){return '';}};
    const setAchievementImagePreview=(src,crop=fpAdminReadCrop(form))=>{
      const preview=$('achievement-image-preview'),shell=$('achievement-image-preview-shell');if(!preview||!shell)return;
      fpAdminApplyCropPreview(shell,preview,src,src?crop:null);
      const cropButton=$('achievement-image-crop');if(cropButton)cropButton.disabled=!Boolean(src);
    };
    const setAchievementModalOpen=open=>{
      if(!achievementFormModal)return;
      achievementFormModal.classList.toggle('hidden',!open);achievementFormModal.setAttribute('aria-hidden',String(!open));
      document.body.classList.toggle('fp-achievement-modal-open',open);
      if(open)setTimeout(()=>$('achievement-title')?.focus(),0);else achievementNew?.focus();
    };
    const resetAchievementForm=(preserveBusy=false)=>{
      if(!form)return;
      if(achievementImageObjectUrl){URL.revokeObjectURL(achievementImageObjectUrl);achievementImageObjectUrl='';}
      form.reset();delete form.dataset.editId;delete form.dataset.fpImageCrop;if(!preserveBusy)delete form.dataset.busy;
      getAchievementCredits=setupAchievementCredits([],achievementCreditSource)||(()=>[]);
      setAchievementImagePreview('');
      if($('achievement-form-title'))$('achievement-form-title').textContent='Publicação';
      if($('achievement-save-button'))$('achievement-save-button').textContent='Publicar no mural';
      if($('achievement-status'))$('achievement-status').textContent='';
    };
    const closeAchievementForm=(afterSave=false)=>{
      if(form?.dataset.busy==='1'&&!afterSave)return;
      setAchievementModalOpen(false);resetAchievementForm(afterSave);
    };
    const openAchievementForm=item=>{
      if(!form||!achievementFormModal)return;
      resetAchievementForm();
      if(item){
        form.dataset.editId=String(item.id);
        $('achievement-title').value=String(item.title||'');
        $('achievement-description').value=String(item.description||'');
        $('achievement-details').value=String(item.details||'');
        $('achievement-name').value=String(item.name||'');
        $('achievement-type-other').value=achievementCategories(item).join('\n');
        $('achievement-year').value=String(item.year||'');
        if($('achievement-date'))$('achievement-date').value=/^\d{4}-\d{2}-\d{2}$/.test(String(item.date||''))?String(item.date):'';
        const savedCredits=Array.isArray(item.credits)&&item.credits.length?item.credits:(Array.isArray(item.creditProfiles)?item.creditProfiles.map(value=>value?.uid||value?.name).filter(Boolean):[]);
        getAchievementCredits=setupAchievementCredits(savedCredits,achievementCreditSource)||(()=>[]);
        if($('achievement-image-url'))$('achievement-image-url').value=normalizeAchievementImageURL(item.image||'');
        fpAdminSaveCrop(form,fpAdminNormalizeCrop(item.imageCrop));
        setAchievementImagePreview(normalizeAchievementImageURL(item.image||''),fpAdminReadCrop(form));
        if($('achievement-form-title'))$('achievement-form-title').textContent='Ajustar conquista';
        if($('achievement-save-button'))$('achievement-save-button').textContent='Salvar alterações';
        if($('achievement-status'))$('achievement-status').textContent='Edite os dados e salve para atualizar a publicação.';
      }
      setAchievementModalOpen(true);
    };
    const openAchievementDetail=item=>{
      if(!item||!achievementDetailModal)return;
      $('achievement-view-title').textContent=String(item.title||item.name||'Conquista');
      $('achievement-view-person').textContent=String(item.name||'Estudante ou equipe não informado');
      $('achievement-view-category').textContent=achievementCategories(item).join(' · ')||'Categoria não informada';
      $('achievement-view-year').textContent=/^\d{4}-\d{2}-\d{2}$/.test(String(item.date||''))?new Date(`${item.date}T12:00:00`).toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric'}):item.year?`Data não informada · ${item.year}`:'Data não informada';
      const image=$('achievement-view-image');
      if(image){const src=String(item.image||'');if(/^https?:\/\//i.test(src)){image.src=src;image.classList.remove('hidden');}else{image.removeAttribute('src');image.classList.add('hidden');}}
      const summary=$('achievement-view-summary');if(summary){summary.textContent=String(item.description||'');summary.classList.toggle('hidden',!String(item.description||'').trim());}
      $('achievement-view-content').textContent=String(item.details||'Sem conteúdo adicional.');
      const participants=$('achievement-view-participants');
      const names=Array.isArray(item.creditProfiles)&&item.creditProfiles.length?item.creditProfiles.map(value=>value?.name).filter(Boolean):(Array.isArray(item.credits)?item.credits:[]);
      if(participants){participants.textContent=names.length?`Participantes: ${names.join(', ')}`:'';participants.classList.toggle('hidden',!names.length);}
      achievementDetailModal.classList.remove('hidden');achievementDetailModal.classList.add('is-open');achievementDetailModal.querySelector('[data-achievement-view-close]')?.focus();
    };
    const closeAchievementDetail=()=>{achievementDetailModal?.classList.add('hidden');achievementDetailModal?.classList.remove('is-open');};
    if(achievementNew&&achievementNew.dataset.bound!=='1'){achievementNew.dataset.bound='1';achievementNew.addEventListener('click',()=>openAchievementForm(null));}
    const achievementCancel=$('achievement-cancel-edit');
    if(achievementCancel&&achievementCancel.dataset.bound!=='1'){achievementCancel.dataset.bound='1';achievementCancel.addEventListener('click',closeAchievementForm);}
    if(achievementFormModal&&achievementFormModal.dataset.bound!=='1'){
      achievementFormModal.dataset.bound='1';achievementFormModal.addEventListener('click',event=>{if(event.target===achievementFormModal||event.target.closest('[data-achievement-close]'))closeAchievementForm();});
      document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!achievementFormModal.classList.contains('hidden'))closeAchievementForm();});
    }
    if(achievementDetailModal&&achievementDetailModal.dataset.bound!=='1'){
      achievementDetailModal.dataset.bound='1';achievementDetailModal.addEventListener('click',event=>{if(event.target===achievementDetailModal||event.target.closest('[data-achievement-view-close]'))closeAchievementDetail();});
      document.addEventListener('keydown',event=>{if(event.key==='Escape'&&achievementDetailModal.classList.contains('is-open'))closeAchievementDetail();});
    }
    const categoryInput=$('achievement-type-other');
    if(categoryInput&&categoryInput.dataset.lineLimitBound!=='1'){
      categoryInput.dataset.lineLimitBound='1';categoryInput.addEventListener('keydown',event=>{if(event.key!=='Enter')return;const lines=String(categoryInput.value||'').split(/\r?\n/);if(lines.length>=3){event.preventDefault();if($('achievement-status'))$('achievement-status').textContent='O limite é de três categorias, uma por linha.';}});
    }
    const achievementImageInput=$('achievement-image'),achievementImageURLInput=$('achievement-image-url'),achievementImageSelect=$('achievement-image-select'),achievementImageCrop=$('achievement-image-crop');
    if(achievementImageSelect&&achievementImageSelect.dataset.bound!=='1'){achievementImageSelect.dataset.bound='1';achievementImageSelect.addEventListener('click',()=>achievementImageInput?.click());}
    if(achievementImageCrop&&achievementImageCrop.dataset.bound!=='1'){achievementImageCrop.dataset.bound='1';achievementImageCrop.addEventListener('click',()=>{const file=achievementImageInput?.files?.[0],fallback=String(achievementImageURLInput?.value||'').trim()||(form?.dataset.editId?read('fp_achievements',[]).find(value=>String(value.id)===String(form.dataset.editId))?.image||'':'');const src=file?achievementImageObjectUrl:normalizeAchievementImageURL(fallback);if(!src){if($('achievement-status'))$('achievement-status').textContent='Escolha uma imagem ou informe um link antes de recortar.';return;}fpAdminOpenImageCrop({form,source:src,currentCrop:fpAdminReadCrop(form),onApply:crop=>{fpAdminSaveCrop(form,crop);setAchievementImagePreview(src,crop);if($('achievement-status'))$('achievement-status').textContent='Recorte aplicado à prévia. Salve para publicar o enquadramento.';}});});}
    if(achievementImageInput&&achievementImageInput.dataset.bound!=='1'){
      achievementImageInput.dataset.bound='1';achievementImageInput.addEventListener('change',()=>{
        const file=achievementImageInput.files?.[0];if(achievementImageObjectUrl){URL.revokeObjectURL(achievementImageObjectUrl);achievementImageObjectUrl='';}
        if(file){if(achievementImageURLInput)achievementImageURLInput.value='';achievementImageObjectUrl=URL.createObjectURL(file);delete form.dataset.fpImageCrop;setAchievementImagePreview(achievementImageObjectUrl,null);return;}
        const fallback=String(achievementImageURLInput?.value||'').trim()||read('fp_achievements',[]).find(value=>String(value.id)===String(form?.dataset.editId||''))?.image||'';setAchievementImagePreview(fallback,fpAdminReadCrop(form));
      });
    }
    if(achievementImageURLInput&&achievementImageURLInput.dataset.bound!=='1'){
      achievementImageURLInput.dataset.bound='1';achievementImageURLInput.addEventListener('input',()=>{
        const source=String(achievementImageURLInput.value||'').trim();if(achievementImageObjectUrl){URL.revokeObjectURL(achievementImageObjectUrl);achievementImageObjectUrl='';}
        if(achievementImageInput)achievementImageInput.value='';delete form.dataset.fpImageCrop;setAchievementImagePreview(normalizeAchievementImageURL(source)||'',null);
      });
    }
    const achievementDateInput=$('achievement-date'),achievementYearHidden=$('achievement-year');
    if(achievementDateInput&&achievementDateInput.dataset.bound!=='1'){
      achievementDateInput.dataset.bound='1';achievementDateInput.addEventListener('input',()=>{if(achievementYearHidden)achievementYearHidden.value=/^\d{4}-\d{2}-\d{2}$/.test(achievementDateInput.value)?achievementDateInput.value.slice(0,4):'';});
    }
    if(form&&form.dataset.bound!=='1'){
      form.dataset.bound='1';form.addEventListener('submit',async event=>{
        event.preventDefault();if(form.dataset.busy==='1')return;
        const name=$('achievement-name').value.trim(),title=$('achievement-title').value.trim();
        const dateInput=String($('achievement-date')?.value||'').trim();
        const yearInput=/^\d{4}-\d{2}-\d{2}$/.test(dateInput)?dateInput.slice(0,4):'';
        const categoryRaw=$('achievement-type-other')?.value||'';
        const categories=[...new Set(categoryRaw.split(/\r?\n/).map(value=>value.trim()).filter(Boolean))];
        const description=$('achievement-description').value.trim(),details=$('achievement-details').value.trim(),file=$('achievement-image').files?.[0],imageURLRaw=String($('achievement-image-url')?.value||'').trim(),imageURL=normalizeAchievementImageURL(imageURLRaw);
        if(!title)throwStatus('Informe o título da conquista.');
        else if(!name)throwStatus('Informe o nome do aluno ou equipe.');
        else if(!details)throwStatus('Informe o conteúdo completo da conquista.');
        else if(!categories.length)throwStatus('Informe pelo menos uma categoria.');
        else if(categories.length>3)throwStatus('O limite é de três categorias, uma por linha.');
        else if(!/^\d{4}-\d{2}-\d{2}$/.test(dateInput)||!Number.isFinite(Date.parse(`${dateInput}T12:00:00`)))throwStatus('Informe a data completa da conquista.');
        else if(imageURLRaw&&!imageURL)throwStatus('Informe um link absoluto de imagem começando com http:// ou https://.');
        else await saveAchievement();
        function throwStatus(message){if($('achievement-status'))$('achievement-status').textContent=message;announce(message);}
        async function saveAchievement(){
          form.dataset.busy='1';const submit=$('achievement-save-button');if(submit){submit.disabled=true;submit.setAttribute('aria-busy','true');}
          try{
            const editId=form.dataset.editId||'',all=read('fp_achievements',[]);let previous=null;
            if(editId){previous=all.find(item=>String(item.id)===String(editId));if(!previous)throw new Error('Conquista não encontrada.');}
            const selectedCredits=getAchievementCredits();
            const creditProfiles=selectedCredits.map(creditName=>{const found=achievementCreditSource.find(user=>String(user.name||'')===String(creditName)||String(user.email||'')===String(creditName)||String(user.uid||'')===String(creditName));return found?{uid:String(found.uid||''),name:String(found.name||creditName),email:String(found.email||'')}:null;}).filter(Boolean);
            const id=editId||uid('achievement');let nextImage=previous?.image||'';
            if(file){if(!window.FPCloud?.uploadDataUrl)throw new Error('O Cloudinary não está disponível para a imagem da conquista.');const data=await imageDataURL(file);nextImage=await window.FPCloud.uploadDataUrl(data,{folder:`achievements/${id}`});}
            else if(imageURL)nextImage=imageURL;
            if(/^data:/i.test(String(nextImage||'')))throw new Error('A foto da conquista ainda não foi externalizada.');
            const cropWasReplaced=Boolean(file||(imageURL&&imageURL!==String(previous?.image||'')));
            const chosenCrop=fpAdminReadCrop(form);
            const imageCrop=nextImage?(cropWasReplaced?(chosenCrop||null):(chosenCrop||fpAdminNormalizeCrop(previous?.imageCrop))):null;
            const item={...(previous||{}),id,name,title,date:dateInput,year:yearInput,type:categories[0],types:categories,description,details,credits:selectedCredits,creditProfiles,image:nextImage,imageCrop,visible:previous?.visible!==false,createdAt:previous?.createdAt||new Date().toISOString(),updatedAt:new Date().toISOString()};
            if(!window.FPCloud?.saveAchievement)throw new Error('O módulo Firebase de conquistas não está disponível.');
            const savedCloud=await window.FPCloud.saveAchievement(id,item);if(!savedCloud?.id)throw new Error('O Firebase não confirmou o salvamento da conquista.');
            const nextAll=Array.isArray(all)?all.slice():[],index=nextAll.findIndex(value=>String(value.id)===String(id));
            if(index>=0)nextAll[index]={...item,...savedCloud,id};else nextAll.push({...item,...savedCloud,id});
            write('fp_achievements',nextAll);window.dispatchEvent(new CustomEvent('fp:achievements-updated'));
            if(achievementPageStatus)achievementPageStatus.textContent=editId?'Conquista atualizada e salva no Firebase.':'Conquista publicada no mural e salva no Firebase.';
            achievementPage=1;closeAchievementForm(true);await renderEditorialConquistas();announce(editId?'Conquista atualizada.':'Conquista publicada no mural.');
          }catch(error){console.error('[Folha do Paiquerê] save achievement',error);const code=error?.code?` [${error.code}]`:'';if($('achievement-status'))$('achievement-status').textContent=(error?.message||'Não foi possível salvar a conquista no Firebase.')+code;announce((error?.message||'Não foi possível salvar a conquista no Firebase.')+code);}
          finally{delete form.dataset.busy;if(submit){submit.disabled=false;submit.removeAttribute('aria-busy');}}
        }
      });
    }

    if(fpCloudEnabled()){
      try{
        const [remoteUsers,publicProfiles]=await Promise.all([
          window.FPCloud.fetchEditorialUsers?.().catch(()=>[]),
          window.FPCloud.fetchPublicProfiles?.().catch(()=>[])
        ]);
        const map=new Map();
        const addUser=user=>{if(!user||!String(user.name||'').trim())return;const key=String(user.uid||user.email||user.name).trim().toLowerCase();map.set(key,{...(map.get(key)||{}),...user,uid:String(user.uid||map.get(key)?.uid||''),name:String(user.name||map.get(key)?.name||'').trim(),email:String(user.email||map.get(key)?.email||'').trim()});};
        achievementCreditSource.forEach(addUser);(Array.isArray(remoteUsers)?remoteUsers:[]).forEach(addUser);(Array.isArray(publicProfiles)?publicProfiles:[]).forEach(addUser);
        achievementCreditSource=[...map.values()].sort((a,b)=>String(a.name).localeCompare(String(b.name),'pt-BR'));
        await window.FPStore?.setUsersLocal?.(achievementCreditSource);
      }catch(error){console.warn('[Folha do Paiquerê] não foi possível atualizar os participantes das conquistas:',error);}
    }
    getAchievementCredits=setupAchievementCredits([],achievementCreditSource)||(()=>[]);
    renderEditorialConquistas=async(refreshRemote=true)=>{
      if(!admin)return;
      const renderSequence=++achievementRenderSequence;
      let remote=[];
      if(window.FPCloud?.fetchAchievements){
        if(refreshRemote||!achievementFetchPromise){
          achievementFetchPromise=Promise.resolve().then(()=>window.FPCloud.fetchAchievements()).then(fetched=>{
            achievementRemoteCache=Array.isArray(fetched)?fetched:[];return achievementRemoteCache;
          }).catch(error=>{console.warn('[Folha do Paiquerê] não foi possível atualizar conquistas:',error);return Array.isArray(achievementRemoteCache)?achievementRemoteCache:[];});
        }
        try{remote=await achievementFetchPromise;}catch(_){remote=Array.isArray(achievementRemoteCache)?achievementRemoteCache:[];}
      }else if(!refreshRemote&&Array.isArray(achievementItems)){remote=achievementItems;}
      // Uma resposta antiga não pode substituir a pesquisa mais recente.
      if(renderSequence!==achievementRenderSequence)return;
      const local=read('fp_achievements',[]),map=new Map();
      for(const item of (Array.isArray(remote)?remote:[])){if(item?.id)map.set(String(item.id),item);}
      for(const item of (Array.isArray(local)?local:[])){if(item?.id&&!map.has(String(item.id)))map.set(String(item.id),item);}
      achievementItems=[...map.values()];write('fp_achievements',achievementItems);
      const query=normalizeSearch($('achievement-admin-search')?.value||'');
      const searchItems=achievementItems.filter(item=>{
        const profileNames=Array.isArray(item.creditProfiles)?item.creditProfiles.flatMap(value=>[value?.name,value?.email,value?.uid]).filter(Boolean):[];
        const credits=Array.isArray(item.credits)?item.credits:(item.credits&&typeof item.credits==='object'?Object.values(item.credits).flatMap(value=>Array.isArray(value)?value:[value]):[]);
        const hay=normalizeSearch([item.title,item.name,item.studentName,item.teamName,item.school,item.institution,item.achievement,item.summary,item.year,item.type,item.category,item.status,...achievementCategories(item),item.description,item.details,...profileNames,...credits].filter(Boolean).join(' '));
        return !query||hay.includes(query);
      });
      const sortMode=String(achievementSort?.value||'recent');
      if(sortMode==='alpha')searchItems.sort((a,b)=>String(a.title||a.name||'Conquista').localeCompare(String(b.title||b.name||'Conquista'),'pt-BR',{sensitivity:'base'}));
      else if(sortMode==='oldest')searchItems.sort((a,b)=>achievementTime(a.createdAt||a.updatedAt)-achievementTime(b.createdAt||b.updatedAt));
      else searchItems.sort((a,b)=>achievementTime(b.createdAt||b.updatedAt)-achievementTime(a.createdAt||a.updatedAt));
      const totalPages=Math.max(1,Math.ceil(searchItems.length/achievementPageSize));achievementPage=Math.max(1,Math.min(achievementPage,totalPages));
      const shown=searchItems.slice((achievementPage-1)*achievementPageSize,achievementPage*achievementPageSize);
      admin.innerHTML=shown.length?shown.map(item=>{
        const id=esc(item.id),title=esc(item.title||item.name||'Sem título'),person=esc(item.name||'Aluno ou equipe não informado'),categories=achievementCategories(item),categoryText=esc(categories.join(' · ')||'Conquista'),src=/^https?:\/\//i.test(String(item.image||''))?esc(item.image):'';
        const thumb=src?`<img src="${src}" loading="lazy" alt="Miniatura: ${title}">`:'<span aria-hidden="true">✦</span>';
        return `<article class="fp-achievement-row"><div class="fp-achievement-thumb">${thumb}</div><div class="fp-achievement-row-copy"><button type="button" class="fp-achievement-title" data-achievement-view="${id}">${title}</button><div class="fp-achievement-row-meta"><span>${person}</span><span class="fp-achievement-meta-dot" aria-hidden="true"></span><span class="fp-achievement-category">${categoryText}</span></div><small class="fp-achievement-year">${/^\d{4}-\d{2}-\d{2}$/.test(String(item.date||''))?new Date(`${item.date}T12:00:00`).toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric'}):item.year?`Data não informada · ${esc(item.year)}`:'Data não informada'}</small></div><div class="fp-action-menu"><button type="button" class="fp-action-trigger" data-achievement-menu-toggle="${id}" aria-label="Ações para ${title}" aria-expanded="false">⋯</button><div class="fp-action-dropdown" data-achievement-menu="${id}" hidden><button type="button" data-achievement-view="${id}">Visualizar</button><button type="button" data-achievement-adjust="${id}">Ajustar</button><button type="button" class="is-danger" data-achievement-delete="${id}">Excluir</button></div></div></article>`;
      }).join(''):`<div class="fp-empty-state fp-achievement-empty"><span aria-hidden="true">✦</span><strong>${query?'Nenhuma conquista encontrada':'Nenhuma conquista cadastrada'}</strong><p>${query?'Ajuste a pesquisa ou a ordenação.':'Publique a primeira conquista para iniciar o mural.'}</p></div>`;
      const from=searchItems.length?(achievementPage-1)*achievementPageSize+1:0,to=Math.min(achievementPage*achievementPageSize,searchItems.length);
      if(achievementPager)achievementPager.innerHTML=`<p>Mostrando ${from}–${to} de ${searchItems.length} conquistas</p><nav class="fp-pagination" aria-label="Páginas de conquistas"><button type="button" class="fp-page-btn fp-page-arrow" data-achievement-page="${achievementPage-1}" aria-label="Página anterior" ${achievementPage<=1?'disabled':''}>‹</button>${achievementPageWindow(Math.ceil(searchItems.length/achievementPageSize),achievementPage).map(number=>`<button type="button" class="fp-page-btn ${number===achievementPage?'is-current':''}" data-achievement-page="${number}" aria-current="${number===achievementPage?'page':'false'}">${number}</button>`).join('')}<button type="button" class="fp-page-btn fp-page-arrow" data-achievement-page="${achievementPage+1}" aria-label="Próxima página" ${achievementPage>=totalPages?'disabled':''}>›</button></nav>`;
    };
    if(admin&&admin.dataset.actionsBound!=='1'){
      admin.dataset.actionsBound='1';admin.addEventListener('click',async event=>{
        const toggle=event.target.closest('[data-achievement-menu-toggle]');
        if(toggle){const id=String(toggle.dataset.achievementMenuToggle||''),menu=admin.querySelector(`[data-achievement-menu="${CSS.escape(id)}"]`);openFloatingActionMenu(toggle,menu,admin);return;}
        const view=event.target.closest('[data-achievement-view]');if(view){const item=achievementItems.find(value=>String(value.id)===String(view.dataset.achievementView));if(item)openAchievementDetail(item);closeFloatingActionMenu();return;}
        const adjust=event.target.closest('[data-achievement-adjust]');if(adjust){const item=achievementItems.find(value=>String(value.id)===String(adjust.dataset.achievementAdjust));if(item)openAchievementForm(item);closeFloatingActionMenu();return;}
        const del=event.target.closest('[data-achievement-delete]');if(del){const id=String(del.dataset.achievementDelete||''),item=achievementItems.find(value=>String(value.id)===id);if(!item||del.dataset.busy==='1')return;if(!confirm(`Excluir a conquista “${item.title||item.name||'Sem título'}”?`))return;del.dataset.busy='1';del.disabled=true;try{if(fpCloudEnabled()){const result=await window.FPCloud.deleteAchievement?.(id);if(result===false||result?.ok===false)throw new Error(result?.message||'Não foi possível apagar a conquista no Firebase.');}write('fp_achievements',read('fp_achievements',[]).filter(value=>String(value.id)!==id));window.dispatchEvent(new CustomEvent('fp:achievements-updated'));await renderEditorialConquistas();if(achievementPageStatus)achievementPageStatus.textContent='Conquista excluída.';announce('Conquista excluída do mural.');}catch(error){del.disabled=false;delete del.dataset.busy;announce(error?.message||'Não foi possível apagar a conquista.');}return;}
      });
    }
    if(achievementPager&&achievementPager.dataset.bound!=='1'){achievementPager.dataset.bound='1';achievementPager.addEventListener('click',event=>{const button=event.target.closest('[data-achievement-page]');if(!button||button.disabled)return;const number=Number(button.dataset.achievementPage);if(Number.isFinite(number)){achievementPage=Math.max(1,number);void renderEditorialConquistas();}});}
    const achievementSearch=$('achievement-admin-search');
    bindSearchInput(achievementSearch,()=>{achievementPage=1;void renderEditorialConquistas(false);});
    if(achievementSort&&achievementSort.dataset.bound!=='1'){achievementSort.dataset.bound='1';achievementSort.addEventListener('change',()=>{achievementPage=1;void renderEditorialConquistas(false);});}

    renderEditorialConquistas();editorialAvisos();
    window.addEventListener('fp:suggestions-updated',()=>renderEditorialPautas());
    window.addEventListener('fp:achievements-updated',()=>renderEditorialConquistas());window.addEventListener('fp:school-notices-updated',()=>{const host=$('school-notice-admin-list');if(typeof host?.__fpRenderNotices==='function')void host.__fpRenderNotices(true);else void editorialAvisos();});
  }
  async function renderProfileAuthorizations(s){
    if(!isEditor(s))return;
    const box=$("profile-change-requests-list"),search=$("profile-auth-search");if(!box)return;
    let users=[];let authorizations=[];
    try{users=await window.FPCloud?.fetchEditorialUsers?.()||[];}catch(_){users=[];}
    if(!users.length)users=readUsers();
    try{authorizations=await window.FPCloud?.fetchProfileAuthorizations?.()||[];}catch(_){authorizations=[];}
    let authMap=new Map(authorizations.map(x=>[String(x.uid||x.studentUid||x.id||''),x]));
    const render=()=>{
      const q=normalizeSearch(search?.value||'');
      const rows=users.filter(u=>u&&(!q||normalizeSearch(`${u.name||''} ${u.email||''}`).includes(q)));
      box.innerHTML=rows.length?rows.map(u=>{const uid=String(u.uid||'');const isAdmin=['Editor','Editor-Chefe'].includes(String(u.role||''))||String(u.email||'').toLowerCase()===MASTER_EMAIL;const authorized=!isAdmin&&authMap.get(uid)?.authorized===true;return `<article class="rounded-xl border border-slate-200 p-4 dark:border-slate-700"><div class="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4"><div class="min-w-0"><strong class="block text-sm">${esc(u.name||'Sem nome')}</strong><span class="block text-xs text-slate-500">${esc(u.email||'')}</span><span class="mt-1 inline-flex rounded-full px-2.5 py-1 text-[11px] font-extrabold ${authorized?'bg-[#F2F7F3] text-[#1B5E20] dark:bg-[#2D382E] dark:text-[#81C784]':'bg-slate-100 text-slate-600 dark:bg-[#242424] dark:text-slate-400'}">${isAdmin?'Perfil editorial — não se aplica':authorized?'Permitido':'Bloqueado'}</span></div><div class="flex flex-wrap gap-2">${isAdmin?`<span class="text-xs font-semibold text-slate-500">Administrativo</span>`:`<button type="button" class="btn-primary rounded-lg px-3 py-2 text-xs font-bold" data-profile-authorize="${esc(uid)}" ${authorized?'disabled':''}>Permitir alterações</button><button type="button" class="btn-neutral rounded-lg px-3 py-2 text-xs font-bold" data-profile-deny="${esc(uid)}" ${!authorized?'disabled':''}>Não permitir alteração</button>`}</div></div></article>`;}).join(''):`<p class="text-sm text-slate-500">Nenhuma conta encontrada.</p>`;
      box.querySelectorAll('[data-profile-authorize]').forEach(b=>b.onclick=async()=>{b.disabled=true;const result=await window.FPCloud?.setProfileAuthorization?.(b.dataset.profileAuthorize,true);if(!result?.ok){announce(result?.message||'Não foi possível permitir alterações.');b.disabled=false;return;}authorizations=await window.FPCloud?.fetchProfileAuthorizations?.()||authorizations;authMap=new Map(authorizations.map(x=>[String(x.uid||x.studentUid||x.id||''),x]));render();announce('Alterações de perfil autorizadas.');});
      box.querySelectorAll('[data-profile-deny]').forEach(b=>b.onclick=async()=>{b.disabled=true;const result=await window.FPCloud?.setProfileAuthorization?.(b.dataset.profileDeny,false);if(!result?.ok){announce(result?.message||'Não foi possível bloquear alterações.');b.disabled=false;return;}authorizations=await window.FPCloud?.fetchProfileAuthorizations?.()||authorizations;authMap=new Map(authorizations.map(x=>[String(x.uid||x.studentUid||x.id||''),x]));render();announce('Alterações de perfil não autorizadas.');});
    };
    bindSearchInput(search,render);render();
  }

  const isCompactViewport=()=>window.matchMedia('(max-width: 767px), (max-width: 1024px) and (max-height: 600px) and (orientation: landscape)').matches;

  function compactTime(value){
    if(value==null||value==='')return 0;
    if(typeof value==='number')return Number.isFinite(value)?(value<1e11?value*1000:value):0;
    if(typeof value==='object'){
      if(typeof value.toDate==='function'){const t=value.toDate().getTime();return Number.isFinite(t)?t:0;}
      if(Number.isFinite(Number(value.seconds)))return Number(value.seconds)*1000+Math.floor(Number(value.nanoseconds||0)/1e6);
    }
    const t=Date.parse(String(value));return Number.isFinite(t)?t:0;
  }
  function compactStatus(article){return String(article?.status||'Rascunho').trim();}
  function compactCategory(article){const value=article?.category??article?.categories??'';return Array.isArray(value)?value.filter(Boolean).join(' · '):String(value||'').split(/[,;|]/).map(v=>v.trim()).filter(Boolean).join(' · ');}
  function compactCover(article){return [article?.coverURL,article?.thumbURL,article?.image,article?.imageURL].map(v=>String(v||'').trim()).find(v=>/^https?:\/\//i.test(v)||/^data:image\/(?:png|jpe?g|webp|gif);/i.test(v)||/^(?:\.\.?\/)?assets\//i.test(v))||'';}
  function compactReadMinutes(article){
    const objects=Array.isArray(article?.canvasJSON?.objects)?article.canvasJSON.objects:[];
    const canvasText=objects.map(o=>[o?.text,o?.dataPoll?.title,...(Array.isArray(o?.dataPoll?.options)?o.dataPoll.options:[])].filter(Boolean).join(' ')).join(' ');
    const raw=[article?.title,article?.subtitle,article?.content,article?.text,canvasText].filter(v=>typeof v==='string').join(' ').trim();
    return Math.max(1,Math.ceil(raw.split(/\s+/).filter(Boolean).length/200));
  }
  function compactDate(value){const t=compactTime(value);return t?new Date(t).toLocaleDateString('pt-BR',{day:'2-digit',month:'short'}).replace('.',''):'Data não informada';}
  function compactPublishedSort(a,b){return compactTime(b?.approvedAt||b?.publishedAt||b?.date||b?.updatedAt||b?.createdAt)-compactTime(a?.approvedAt||a?.publishedAt||a?.date||a?.updatedAt||a?.createdAt);}

  async function setupMobileDashboard(session, editor, chief){
    const body=document.body;
    const compactQuery=window.matchMedia('(max-width: 767px), (max-width: 1024px) and (max-height: 600px) and (orientation: landscape)');
    const syncCompactClass=()=>body.classList.toggle('fp-compact-layout',compactQuery.matches);
    syncCompactClass();
    if(compactQuery.addEventListener)compactQuery.addEventListener('change',syncCompactClass);else compactQuery.addListener(syncCompactClass);

    const nav=$('fp-mobile-bottom-nav');
    if(nav){
      const homeIcon='<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m3 10 9-7 9 7M5 9v11h14V9M9 20v-6h6v6"/></svg>';
      const articleIcon='<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3.5h8l4 4V20a1.5 1.5 0 0 1-1.5 1.5h-10A1.5 1.5 0 0 1 5 20V5a1.5 1.5 0 0 1 1-1.5Z"/><path d="M14 3.5V8h4M8 12h8M8 16h8"/></svg>';
      const moderationIcon='<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V2.8h6V4M8.5 10h7M8.5 14h4M8.5 18h7"/></svg>';
      const profileIcon='<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="3.5"/><path d="M5 20c.7-3.4 3.2-5.2 7-5.2s6.3 1.8 7 5.2"/></svg>';
      nav.classList.toggle('is-editor-nav',Boolean(editor));
      const mattersTab=`<button type="button" role="tab" data-tab="materias" aria-selected="false">${articleIcon}<span>Matérias</span></button>`;
      const bancaTab=`<button type="button" role="tab" data-tab="moderar" aria-selected="false">${moderationIcon}<span>Banca</span></button>`;
      nav.innerHTML=`<button type="button" role="tab" data-tab="mobile-home" aria-selected="false">${homeIcon}<span>Início</span></button>${editor?mattersTab:''}${editor?bancaTab:mattersTab}<button type="button" role="tab" data-tab="perfil" aria-selected="false">${profileIcon}<span>Perfil</span></button>`;
    }

    const stateKey=`fp_mobile_dash_state_v146_${String(session.uid||session.email||'account').toLowerCase().replace(/[^a-z0-9_-]/g,'_')}`;
    const pautaSeenKey=`fp_mobile_pautas_seen_v146_${String(session.uid||session.email||'account').toLowerCase().replace(/[^a-z0-9_-]/g,'_')}`;
    let notificationState=read(stateKey,null);
    if(!notificationState||typeof notificationState!=='object')notificationState={initialized:false,knownPublished:[],knownAchievements:[],knownNotices:[],ownStatuses:{},notifications:[]};
    if(!Array.isArray(notificationState.notifications))notificationState.notifications=[];
    const priorNotificationCount=notificationState.notifications.length;
    notificationState.notifications=notificationState.notifications.slice().sort((a,b)=>Number(b.createdAt||0)-Number(a.createdAt||0)).slice(0,3);
    if(typeof notificationState.enabled!=='boolean')notificationState.enabled=true;
    if(notificationState.notifications.length!==priorNotificationCount){try{localStorage.setItem(stateKey,JSON.stringify(notificationState));}catch(_){}}
    let publicFeed=[];
    let achievements=read('fp_achievements',[]);if(!Array.isArray(achievements))achievements=[];
    let notices=read('fp_school_notices',[]);if(!Array.isArray(notices))notices=[];
    let suggestions=read('fp_suggestions',[]);if(!Array.isArray(suggestions))suggestions=[];
    let baselineReady=false;
    let expandedNews=false;

    const allLocalArticles=()=>{const all=readArticles();return Array.isArray(all)?all:[];};
    const currentPublished=()=>{
      const map=new Map();
      (Array.isArray(publicFeed)?publicFeed:[]).filter(a=>compactStatus(a)==='Aprovado'&&a.visible!==false).forEach(a=>map.set(String(a.id),a));
      allLocalArticles().filter(a=>compactStatus(a)==='Aprovado'&&a.visible!==false).forEach(a=>{if(!map.has(String(a.id)))map.set(String(a.id),a);});
      return [...map.values()].sort(compactPublishedSort);
    };
    const ownArticles=()=>allLocalArticles().filter(a=>{
      const byUid=session.uid&&String(a.authorUid||'').trim().toLowerCase()===String(session.uid||'').trim().toLowerCase();
      const byEmail=session.email&&String(a.authorEmail||'').trim().toLowerCase()===String(session.email||'').trim().toLowerCase();
      return Boolean(byUid||byEmail);
    }).sort((a,b)=>compactTime(b.updatedAt||b.date||b.createdAt||b.approvedAt)-compactTime(a.updatedAt||a.date||a.createdAt||a.approvedAt));
    const isOwnArticle=a=>Boolean((session.uid&&String(a.authorUid||'').trim().toLowerCase()===String(session.uid||'').trim().toLowerCase())||(session.email&&String(a.authorEmail||'').trim().toLowerCase()===String(session.email||'').trim().toLowerCase()));
    const visibleNotices=()=>notices.filter(n=>n&&n.visible!==false&&(!n.expiresAt||!compactTime(n.expiresAt)||compactTime(n.expiresAt)>Date.now()));
    const activeSuggestions=()=>suggestions.filter(item=>item&&!['Arquivada','Retirada','Excluída'].includes(String(item.status||'')));
    const unseenPautas=()=>{
      const all=activeSuggestions(),seen=read(pautaSeenKey,[]),set=new Set(Array.isArray(seen)?seen.map(String):[]);
      return all.filter(item=>!set.has(String(item.id||item.uid||item.createdAt||item.subject||''))).length;
    };
    const addNotification=(item)=>{
      if(notificationState.enabled===false)return;
      if(notificationState.notifications.some(old=>String(old.key)===String(item.key)))return;
      notificationState.notifications.unshift({...item,createdAt:Date.now(),read:false});
      notificationState.notifications=notificationState.notifications.slice(0,3);
      // The separate Web Notifications module handles news, achievements and school
      // notices. This bridges the personal adjustment request, which is account-specific.
      if(item.type==='adjust'&&browserNotificationsEnabled()&&browserNotificationsSupported()){
        navigator.serviceWorker.ready.then(registration=>registration.showNotification(String(item.title||'Sua matéria precisa de ajustes'),{
          body:String(item.message||'A redação solicitou alterações em uma matéria.'),
          icon:'assets/branding/brasao-folha-paiquere.png',
          badge:'assets/branding/brasao-folha-paiquere.png',
          tag:String(item.key||`fp-adjust-${Date.now()}`),
          data:{url:new URL(String(item.href||'painel.html'),location.href).href}
        })).catch(()=>{});
      }
    };
    const cardSvg={
      article:'<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3.5h8l4 4V20a1.5 1.5 0 0 1-1.5 1.5h-10A1.5 1.5 0 0 1 5 20V5a1.5 1.5 0 0 1 1-1.5Z"/><path d="M14 3.5V8h4M8 12h8M8 16h8"/></svg>',
      trophy:'<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M8 4h8v5.5a4 4 0 0 1-8 0V4Z"/><path d="M8 6H4v2a4 4 0 0 0 4 4M16 6h4v2a4 4 0 0 1-4 4M12 13.5V18m-4 3h8m-7-3h6"/></svg>',
      about:'<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 7.5h.01"/></svg>',
      bulb:'<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18h6M10 21h4M8.2 14.8A7 7 0 1 1 16 14.6c-1.1.8-1.5 1.7-1.5 2.4h-5c0-.8-.4-1.5-1.3-2.2Z"/><path d="M12 3v1.5M4.6 6l1.1 1.1M19.4 6l-1.1 1.1"/></svg>',
      people:'<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="7" r="3.5"/><path d="M2.5 20c.5-3.5 2.7-5.5 6.5-5.5s6 2 6.5 5.5M16 4.1a3.5 3.5 0 0 1 0 6.8M17 15a4.6 4.6 0 0 1 4.5 5"/></svg>',
      notice:'<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 14V9a1 1 0 0 1 1-1h3l9-4v15l-9-4H5a1 1 0 0 1-1-1Z"/><path d="m8 15 1.5 5h3L11 16M20 9l1.5-1M20 14l1.5 1"/></svg>'
    };
    const arrowSvg='<svg class="fp-mobile-quick-arrow" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 5l7 7-7 7"/></svg>';
    const initials=String(session.name||session.email||'?').trim().split(/\s+/).slice(0,2).map(part=>part[0]||'').join('').toLocaleUpperCase('pt-BR')||'?';
    const personalAchievementsHref=()=>session.uid?`perfil.html?uid=${encodeURIComponent(session.uid)}#profile-section-achievements`:(session.email?`perfil.html?email=${encodeURIComponent(session.email)}#profile-section-achievements`:'perfil.html#profile-section-achievements');
    const makeCard=({key,title,subtitle='',icon='about',tone='green',href='',tab='',disabled=false,unread=0})=>{
      const content=`<span class="fp-mobile-quick-icon tone-${esc(tone)}">${cardSvg[icon]||cardSvg.about}</span>${unread?`<span class="fp-mobile-quick-unread" aria-label="${unread} pauta(s) não lida(s)"></span>`:''}<span class="fp-mobile-quick-copy"><strong>${esc(title)}</strong>${subtitle?`<small>${esc(subtitle)}</small>`:''}</span>${arrowSvg}`;
      const cls=`fp-mobile-quick-card tone-card-${esc(tone)}${disabled?' is-disabled':''}`;
      if(disabled)return `<button type="button" class="${cls}" disabled aria-disabled="true" data-mobile-card="${esc(key)}">${content}</button>`;
      if(href)return `<a class="${cls}" data-mobile-card="${esc(key)}" href="${esc(href)}">${content}</a>`;
      return `<button type="button" class="${cls}" data-mobile-card="${esc(key)}" data-mobile-open-tab="${esc(tab)}">${content}</button>`;
    };
    function renderQuickCards(){
      const host=$('fp-mobile-quick-access');if(!host)return;
      const own=ownArticles();
      const active=own.find(a=>['Rascunho','Pendente','Ajustes'].includes(compactStatus(a)));
      const latest=active||own[0]||null;
      let articleCard;
      if(!latest){articleCard=makeCard({key:'new-article',title:'+ Nova matéria',subtitle:'Comece uma nova história',icon:'article',tone:'blue',href:'editor.html'});}
      else if(compactStatus(latest)==='Rascunho')articleCard=makeCard({key:'continue-draft',title:'Continuar rascunho',subtitle:'Matéria em rascunho',icon:'article',tone:'blue',href:`editor.html?edit=${encodeURIComponent(latest.id)}`});
      else if(compactStatus(latest)==='Ajustes')articleCard=makeCard({key:'adjust-article',title:'Ajustar matéria',subtitle:'A redação pediu alterações',icon:'article',tone:'blue',href:`editor.html?edit=${encodeURIComponent(latest.id)}`});
      else if(compactStatus(latest)==='Pendente')articleCard=makeCard({key:'article-pending',title:'Matéria em análise',subtitle:'Aguarde o retorno da redação',icon:'article',tone:'blue',disabled:true});
      else articleCard=makeCard({key:'view-published',title:'Ver matéria publicada',subtitle:'Sua matéria está publicada',icon:'article',tone:'blue',href:`noticia-single.html?id=${encodeURIComponent(latest.id)}`});
      const achievementsCard=makeCard({key:'profile-achievements',title:'Conquistas',subtitle:'Veja sua trajetória',icon:'trophy',tone:'gold',href:personalAchievementsHref()});
      const pautaCard=makeCard({key:'pautas',title:'Pautas',subtitle:'Leia as novas pautas',icon:'bulb',tone:'green',tab:'pautas',unread:unseenPautas()});
      if(chief){
        host.classList.remove('is-student-grid','is-editor-grid');host.classList.add('is-chief-grid');
        host.innerHTML=makeCard({key:'team',title:'Registre',subtitle:'Equipe e acessos',icon:'people',tone:'green',tab:'usuarios'})+pautaCard+makeCard({key:'notices',title:'Avise',subtitle:'Publique um aviso',icon:'notice',tone:'gold',tab:'avisos'})+makeCard({key:'achievements',title:'Conquistas',subtitle:'Poste uma conquista',icon:'trophy',tone:'gold',tab:'conquistas'});
      }else if(editor){
        host.classList.remove('is-student-grid','is-chief-grid');host.classList.add('is-editor-grid');
        host.innerHTML=articleCard+achievementsCard+pautaCard;
      }else{
        host.classList.remove('is-editor-grid','is-chief-grid');host.classList.add('is-student-grid');
        host.innerHTML=articleCard+achievementsCard;
      }
    }
    function renderMobileNews(){
      const host=$('fp-mobile-news-list'),toggle=$('fp-mobile-news-toggle');if(!host)return;
      const items=currentPublished();
      const shown=expandedNews?items:items.slice(0,3);
      host.innerHTML=shown.length?shown.map(article=>{
        const id=String(article.id||''),title=String(article.title||'Sem título'),category=compactCategory(article)||'Notícia';
        const cover=compactCover(article),url=`noticia-single.html?id=${encodeURIComponent(id)}`,reading=`${compactReadMinutes(article)} min de leitura`;
        const image=cover?`<img src="${esc(cover)}" alt="Capa: ${esc(title)}" loading="lazy">`:`<span class="fp-mobile-news-placeholder" aria-hidden="true">▤</span>`;
        return `<article class="fp-mobile-news-item"><a class="fp-mobile-news-cover" href="${esc(url)}" tabindex="0" aria-label="Ler matéria: ${esc(title)}">${image}</a><div class="fp-mobile-news-copy"><span class="fp-mobile-news-category">${esc(category)}</span><a class="fp-mobile-news-title" href="${esc(url)}">${esc(title)}</a><span class="fp-mobile-news-reading">${reading}</span></div></article>`;
      }).join(''):'<p class="fp-mobile-news-empty">As próximas notícias publicadas aparecerão aqui.</p>';
      if(toggle){toggle.classList.toggle('hidden',items.length<=3);toggle.textContent=expandedNews?'Mostrar menos':'Ver todas';toggle.setAttribute('aria-expanded',String(expandedNews));}
    }
    function renderMobileNotifications(){
      const host=$('fp-mobile-notification-list'),badge=$('fp-mobile-notification-badge');
      const all=(notificationState.notifications||[]).slice().sort((a,b)=>Number(b.createdAt||0)-Number(a.createdAt||0)).slice(0,3);
      notificationState.notifications=all;
      const unread=all.filter(item=>!item.read).length;
      if(badge){badge.textContent=unread>9?'9+':String(unread);badge.classList.toggle('hidden',unread===0||notificationState.enabled===false);badge.setAttribute('aria-label',`${unread} notificações não lidas`);}
      if(host){host.innerHTML=all.length?all.map(item=>{
        const icon=item.type==='adjust'?'↻':item.type==='achievement'?'🏆':item.type==='notice'?'!':item.type==='published'?'▤':'•';
        const time=compactTime(item.createdAt)?new Date(compactTime(item.createdAt)).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}):'';
        const body=`<span class="fp-mobile-notification-icon type-${esc(item.type||'general')}">${icon}</span><span class="fp-mobile-notification-copy"><strong>${esc(item.title||'Atualização')}</strong><small>${esc(item.message||'')}</small><time>${esc(time)}</time></span>${item.read?'':'<i class="fp-mobile-notification-unread" aria-label="Não lida"></i>'}`;
        return `<a class="fp-mobile-notification-item${item.read?' is-read':''}" href="${esc(item.href||'#')}" data-mobile-notification-link>${body}</a>`;
      }).join(''):'<div class="fp-mobile-notifications-empty"><span aria-hidden="true">✓</span><strong>Você está em dia</strong><p>Quando houver uma publicação, aviso, conquista ou solicitação de ajustes, ela aparecerá aqui.</p></div>';}
    }
    const browserNotificationsSupported=()=>Boolean(window.isSecureContext&&'Notification' in window&&'serviceWorker' in navigator);
    const browserNotificationsEnabled=()=>Boolean(window.FPNotifications?.enabled?.()&&window.Notification?.permission==='granted');
    function renderMobileNotificationSetting(){
      const enabled=notificationState.enabled!==false;
      const canOfferDeviceAlerts=browserNotificationsSupported()&&Notification.permission!=='denied'&&!browserNotificationsEnabled();
      const toggleLabel=enabled?(canOfferDeviceAlerts?'Ativar alertas no dispositivo':'Desativar notificações'):'Ativar notificações';
      const pressed=enabled&&!canOfferDeviceAlerts;
      const updateButton=(button,labelSelector)=>{
        if(!button)return;
        button.setAttribute('aria-pressed',String(pressed));
        const label=button.querySelector(labelSelector);
        if(label)label.textContent=toggleLabel;
        button.setAttribute('aria-label',toggleLabel);
        button.title=toggleLabel;
      };
      updateButton($('fp-mobile-notifications-toggle'),'[data-mobile-notifications-setting-label]');
      updateButton($('fp-mobile-notifications-mute'),'[data-mobile-notifications-mute-label]');
      $('fp-mobile-notifications-button')?.setAttribute('aria-label',enabled?'Abrir notificações':'Abrir histórico de notificações (alertas desativados)');
    }
    const toggleMobileNotifications=async()=>{
      const currentlyEnabled=notificationState.enabled!==false;
      const canOfferDeviceAlerts=browserNotificationsSupported()&&Notification.permission!=='denied'&&!browserNotificationsEnabled();
      // First activation requests the browser's notification permission without silently
      // turning off the in-panel activity list. Real delivery with the site closed still
      // requires an FCM/Web Push sender, which is not part of this Spark-only client.
      if(currentlyEnabled&&canOfferDeviceAlerts){
        try{await window.FPNotifications?.enable?.();}catch(_){}
        renderMobileNotificationSetting();renderMobileNotifications();return;
      }
      notificationState.enabled=!currentlyEnabled;
      persistNotifications();
      try{
        if(notificationState.enabled){await window.FPNotifications?.enable?.();}
        else window.FPNotifications?.disable?.();
      }catch(_){}
      persistNotifications();renderMobileNotificationSetting();renderMobileNotifications();
    };
    function renderMobileDashboard(){
      const name=$('fp-mobile-greeting-name');if(name)name.textContent=String(session.name||'estudante').trim().split(/\s+/)[0]||'estudante';
      renderQuickCards();renderMobileNews();renderMobileNotifications();renderMobileNotificationSetting();
    }
    const persistNotifications=()=>{try{localStorage.setItem(stateKey,JSON.stringify(notificationState));}catch(_){}};
    const closeMobileNotificationDialog=()=>{const dialog=$('fp-mobile-notifications-dialog'),button=$('fp-mobile-notifications-button');if(!dialog)return;dialog.classList.add('hidden');dialog.setAttribute('aria-hidden','true');button?.setAttribute('aria-expanded','false');button?.focus({preventScroll:true});};
    $('fp-mobile-notifications-button')?.addEventListener('click',()=>{
      const dialog=$('fp-mobile-notifications-dialog');if(!dialog)return;
      notificationState.notifications=(notificationState.notifications||[]).map(item=>({...item,read:true}));persistNotifications();renderMobileNotifications();dialog.classList.remove('hidden');dialog.setAttribute('aria-hidden','false');$('fp-mobile-notifications-button')?.setAttribute('aria-expanded','true');dialog.querySelector('[data-mobile-notifications-close]')?.focus({preventScroll:true});
    });
    $('fp-mobile-notifications-toggle')?.addEventListener('click',toggleMobileNotifications);
    $('fp-mobile-notifications-mute')?.addEventListener('click',toggleMobileNotifications);
    document.querySelectorAll('[data-mobile-notifications-close]').forEach(button=>button.addEventListener('click',closeMobileNotificationDialog));
    $('fp-mobile-notifications-dialog')?.addEventListener('click',event=>{if(event.target.closest('[data-mobile-notification-link]'))closeMobileNotificationDialog();});
    document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!$('fp-mobile-notifications-dialog')?.classList.contains('hidden'))closeMobileNotificationDialog();});
    $('fp-mobile-news-toggle')?.addEventListener('click',()=>{expandedNews=!expandedNews;renderMobileNews();});
    document.querySelectorAll('[data-mobile-theme-toggle]').forEach(button=>button.addEventListener('click',()=>{ $('theme-toggle')?.click();const menu=$('fp-mobile-settings');if(menu)menu.open=false; }));
    document.querySelector('[data-mobile-font-increase]')?.addEventListener('click',()=>{$('font-increase')?.click();$('fp-mobile-settings').open=false;});
    document.querySelector('[data-mobile-font-decrease]')?.addEventListener('click',()=>{$('font-decrease')?.click();$('fp-mobile-settings').open=false;});
    document.querySelector('[data-mobile-logout]')?.addEventListener('click',async()=>{try{await window.FPCloud?.firebaseSignOut?.();}catch(_){}localStorage.removeItem(KEYS.session);location.href='index.html';});
    const openMobileTab=(tab)=>{
      const chiefTabs=['usuarios','avisos','conquistas'];
      const editorTabs=['moderar','pautas'];
      if(chiefTabs.includes(tab)&&!chief){announce('Esta seção é exclusiva do Editor-Chefe.');return false;}
      if(editorTabs.includes(tab)&&!editor){announce('Esta seção é exclusiva da redação.');return false;}
      const target=document.querySelector(`#student-nav [data-tab="${CSS.escape(tab)}"]`);
      if(!target){announce('Não foi possível localizar essa seção.');return false;}
      target.click();
      const panel=document.querySelector(`[data-panel="${CSS.escape(tab)}"]`);
      if(panel&&panel.classList.contains('hidden')){announce('A seção não pôde ser aberta. Verifique as permissões da conta.');return false;}
      $('fp-mobile-settings')?.removeAttribute('open');
      document.querySelector('.fp-workspace-main')?.scrollTo({top:0,behavior:'smooth'});
      return true;
    };
    document.querySelectorAll('[data-mobile-back-home]').forEach(button=>{
      if(button.dataset.bound==='1')return;button.dataset.bound='1';
      button.addEventListener('click',event=>{event.preventDefault();nav?.querySelector('[data-tab="mobile-home"]')?.click();});
    });
    $('fp-mobile-quick-access')?.addEventListener('click',event=>{
      const action=event.target.closest('button.fp-mobile-quick-card[data-mobile-open-tab]');
      if(action){
        event.preventDefault();
        const tab=String(action.dataset.mobileOpenTab||'');
        if(openMobileTab(tab)&&tab==='pautas'){
          const ids=activeSuggestions().map(item=>String(item.id||item.uid||item.createdAt||item.subject||''));
          try{localStorage.setItem(pautaSeenKey,JSON.stringify(ids));}catch(_){}
          renderQuickCards();
        }
        return;
      }
      const link=event.target.closest('a.fp-mobile-quick-card');if(!link)return;
      if(link.dataset.mobileCard==='new-article'&&!updateNewArticleButton(session)){event.preventDefault();announce('Você já possui uma matéria em andamento. Continue-a antes de criar outra.');}
    });
    document.addEventListener('click',event=>{
      const action=event.target.closest('[data-mobile-open-tab]');if(!action||action.closest('#fp-mobile-quick-access'))return;
      const tab=String(action.dataset.mobileOpenTab||'');if(!tab)return;
      if(openMobileTab(tab)&&tab==='pautas'){
        const ids=activeSuggestions().map(item=>String(item.id||item.uid||item.createdAt||item.subject||''));
        try{localStorage.setItem(pautaSeenKey,JSON.stringify(ids));}catch(_){}
        renderQuickCards();
      }
    });
    document.querySelectorAll('[data-mobile-new-article]').forEach(button=>button.addEventListener('click',()=>{if(updateNewArticleButton(session))location.href='editor.html';else announce('Você já possui uma matéria em Rascunho, Em análise ou Necessita ajustes.');}));

    // Primeira exibição usa dados locais; o carregamento remoto atualiza o feed e as notificações.
    publicFeed=currentPublished();renderMobileDashboard();
    const loadInitialData=async()=>{
      if(fpCloudEnabled()){
        const tasks=[
          window.FPCloud.fetchPublicArticles?.().then(items=>{if(Array.isArray(items))publicFeed=items;}).catch(()=>{}),
          window.FPCloud.fetchAchievements?.().then(items=>{if(Array.isArray(items))achievements=items;}).catch(()=>{}),
          window.FPCloud.fetchSchoolNotices?.().then(items=>{if(Array.isArray(items))notices=items;}).catch(()=>{}),
          editor?window.FPCloud.fetchSuggestions?.().then(items=>{if(Array.isArray(items))suggestions=items;}).catch(()=>{}):Promise.resolve()
        ];
        await Promise.all(tasks);
      }
      syncNotifications();baselineReady=true;renderMobileDashboard();
      if(fpCloudEnabled()){
        if(typeof window.FPCloud.listenPublicArticles==='function')window.FPCloud.listenPublicArticles(items=>{if(Array.isArray(items)){publicFeed=items;renderMobileNews();if(baselineReady)syncNotifications();renderQuickCards();}});
        if(typeof window.FPCloud.listenAchievements==='function')window.FPCloud.listenAchievements(items=>{if(Array.isArray(items)){achievements=items;renderMobileDashboard();if(baselineReady)syncNotifications();}});
        if(typeof window.FPCloud.listenSchoolNotices==='function')window.FPCloud.listenSchoolNotices(items=>{if(Array.isArray(items)){notices=items;renderMobileNotifications();if(baselineReady)syncNotifications();}});
        if(editor&&typeof window.FPCloud.listenSuggestions==='function')window.FPCloud.listenSuggestions(items=>{if(Array.isArray(items)){suggestions=items;renderQuickCards();if(baselineReady)syncNotifications();}});
      }
    };
    const syncNotifications=()=>{
      const published=currentPublished(),ach=Array.isArray(achievements)?achievements:[],noticeList=visibleNotices();
      const own=ownArticles(),statuses={};own.forEach(a=>statuses[String(a.id)]={status:compactStatus(a),title:String(a.title||'Sem título'),feedback:String(a.feedback||'')});
      if(!notificationState.initialized){
        notificationState.knownPublished=published.map(a=>String(a.id));notificationState.knownAchievements=ach.filter(a=>a&&a.id).map(a=>String(a.id));notificationState.knownNotices=noticeList.filter(n=>n&&n.id).map(n=>String(n.id));notificationState.ownStatuses=statuses;notificationState.initialized=true;
      }else{
        const knownPublished=new Set((notificationState.knownPublished||[]).map(String));
        published.forEach(a=>{const id=String(a.id||'');if(!id||knownPublished.has(id))return;const title=String(a.title||'Sem título'),ownItem=isOwnArticle(a);addNotification({key:`published:${id}`,type:'published',title:ownItem?'Sua matéria foi publicada':'Nova matéria publicada',message:ownItem?`A redação publicou sua matéria “${title}”.`:`Uma nova matéria está no jornal: “${title}”.`,href:`noticia-single.html?id=${encodeURIComponent(id)}`});});
        const knownAchievements=new Set((notificationState.knownAchievements||[]).map(String));ach.forEach(item=>{const id=String(item?.id||'');if(id&&!knownAchievements.has(id))addNotification({key:`achievement:${id}`,type:'achievement',title:'Nova conquista',message:`Confira “${String(item.title||item.name||'Nova conquista')}” no mural.`,href:'conquistas.html'});});
        const knownNotices=new Set((notificationState.knownNotices||[]).map(String));noticeList.forEach(item=>{const id=String(item?.id||'');if(id&&!knownNotices.has(id))addNotification({key:`notice:${id}`,type:'notice',title:'Novo aviso escolar',message:`Foi publicado um novo aviso: “${String(item.title||'Novo aviso')}”.`,href:'index.html'});});
        own.forEach(article=>{const id=String(article.id||''),status=compactStatus(article),prior=notificationState.ownStatuses?.[id]?.status;if(id&&status==='Ajustes'&&prior&&prior!=='Ajustes')addNotification({key:`adjust:${id}:${compactTime(article.updatedAt||article.date||article.createdAt)}`,type:'adjust',title:'Sua matéria precisa de ajustes',message:`A redação solicitou alterações em “${String(article.title||'Sem título')}”.${article.feedback?` Orientação: ${String(article.feedback)}`:''}`,href:`editor.html?edit=${encodeURIComponent(id)}`});});
        notificationState.knownPublished=[...new Set([...(notificationState.knownPublished||[]).map(String),...published.map(a=>String(a.id))])].slice(-1000);
        notificationState.knownAchievements=[...new Set([...(notificationState.knownAchievements||[]).map(String),...ach.filter(a=>a&&a.id).map(a=>String(a.id))])].slice(-1000);
        notificationState.knownNotices=[...new Set([...(notificationState.knownNotices||[]).map(String),...noticeList.filter(n=>n&&n.id).map(n=>String(n.id))])].slice(-1000);notificationState.ownStatuses=statuses;
      }
      persistNotifications();renderMobileNotifications();
    };
    window.addEventListener('fp:articles-updated',()=>{renderMobileNews();renderQuickCards();if(baselineReady)syncNotifications();});
    window.addEventListener('fp:achievements-updated',()=>{const values=read('fp_achievements',[]);if(Array.isArray(values))achievements=values;renderMobileDashboard();if(baselineReady)syncNotifications();});
    window.addEventListener('fp:school-notices-updated',()=>{const values=read('fp_school_notices',[]);if(Array.isArray(values))notices=values;renderMobileNotifications();if(baselineReady)syncNotifications();});
    window.addEventListener('fp:suggestions-updated',()=>{const values=read('fp_suggestions',[]);if(Array.isArray(values))suggestions=values;renderQuickCards();if(baselineReady)syncNotifications();});
    window.addEventListener('storage',event=>{if(event.key==='fp_articles'){renderMobileNews();renderQuickCards();if(baselineReady)syncNotifications();}if(event.key==='fp_achievements'){achievements=read('fp_achievements',[]);renderMobileDashboard();if(baselineReady)syncNotifications();}if(event.key==='fp_school_notices'){notices=read('fp_school_notices',[]);renderMobileNotifications();if(baselineReady)syncNotifications();}});
    void loadInitialData();
  }

  function setupWelcomeTour(session){
    const overlay=$('fp-welcome-onboarding'),content=$('fp-welcome-step-content'),title=$('fp-welcome-title'),intro=$('fp-welcome-intro');
    const next=$('fp-welcome-next'),agreement=$('fp-welcome-agreement'),agreementWrap=$('fp-welcome-agreement-wrap');
    const counter=$('fp-welcome-step-count'),progress=$('fp-welcome-progress'),status=$('fp-welcome-status');
    if(!overlay||!content||!next||!Array.isArray(session?._welcomeTourSteps))return;
    if(session.welcomeTourPromptEnabled!==true||session.welcomeTourCompleted===true)return;
    const steps=session._welcomeTourSteps;
    let step=0,accepted=false,busy=false;
    const render=()=>{
      const item=steps[step];if(!item)return;
      if(title)title.textContent=item.title;
      if(intro)intro.textContent=item.intro||'';
      content.querySelectorAll('[data-welcome-dynamic]').forEach(node=>node.remove());
      if(item.detail){const detail=document.createElement('p');detail.className='fp-welcome-detail';detail.dataset.welcomeDynamic='1';detail.textContent=item.detail;content.append(detail);}
      if(item.note){const note=document.createElement('p');note.className='fp-welcome-note';note.dataset.welcomeDynamic='1';note.textContent=item.note;content.append(note);}
      if(counter)counter.textContent=`Etapa ${step+1} de ${steps.length}`;
      if(progress){progress.replaceChildren();steps.forEach((_,index)=>{const bar=document.createElement('span');bar.className='fp-welcome-progress-segment'+(index<=step?' is-active':'');bar.setAttribute('aria-hidden','true');progress.append(bar);});}
      const isLast=step===steps.length-1;
      agreementWrap?.classList.toggle('hidden',!isLast);
      if(agreement){agreement.checked=isLast?accepted:false;agreement.disabled=busy;}
      next.textContent=isLast?'Começar a explorar':'Próximo';
      next.disabled=busy||(isLast&&!accepted);
      next.setAttribute('aria-disabled',String(next.disabled));
      if(status)status.textContent='';
      if(isLast)agreement?.focus();else next.focus();
    };
    overlay.classList.remove('hidden');overlay.setAttribute('aria-hidden','false');document.body.classList.add('fp-welcome-open');document.querySelector('main')?.setAttribute('inert','');
    render();
    const close=()=>{overlay.classList.add('hidden');overlay.setAttribute('aria-hidden','true');document.body.classList.remove('fp-welcome-open');document.querySelector('main')?.removeAttribute('inert');const returnFocus=[...document.querySelectorAll('[data-tab="mobile-home"], #student-nav [data-tab="perfil"], [data-tab="perfil"]')].find(el=>el.getClientRects().length>0);returnFocus?.focus?.({preventScroll:true});};
    agreement?.addEventListener('change',()=>{accepted=agreement.checked;next.disabled=busy||(step===steps.length-1&&!accepted);next.setAttribute('aria-disabled',String(next.disabled));});
    overlay.addEventListener('keydown',event=>{
      if(event.key==='Escape'){event.preventDefault();event.stopPropagation();if(!busy){close();announce('Integração fechada. O aceite ainda não foi registrado.');}return;}
      if(event.key==='Tab'){
        const focusable=[agreementWrap&&!agreementWrap.classList.contains('hidden')?agreement:null,next].filter(Boolean).filter(el=>!el.disabled&&el.offsetParent!==null);
        if(!focusable.length){event.preventDefault();return;}
        const first=focusable[0],last=focusable[focusable.length-1];
        if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
        else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
      }
    });
    next.addEventListener('click',async()=>{
      if(busy)return;
      if(step<steps.length-1){step+=1;accepted=false;render();return;}
      if(!accepted){next.disabled=true;return;}
      busy=true;next.disabled=true;next.textContent='Salvando…';if(agreement)agreement.disabled=true;if(status)status.textContent='Registrando seu aceite…';
      try{
        const acceptedAt=new Date().toISOString();
        if(fpCloudEnabled()&&session.uid){
          const saveEditorialUser=window.FPCloud?.saveEditorialUser||window.FPCloud?.setEditorialUser;
          if(typeof saveEditorialUser!=='function'){
            busy=false;close();announce('A janela foi fechada, mas não foi possível confirmar o aceite no servidor. O aceite não foi registrado.');return;
          }
          const saved=await saveEditorialUser.call(window.FPCloud,session.uid,{welcomeTourCompleted:true,welcomeTourAcceptedAt:acceptedAt});
          if(!saved)throw new Error('Não foi possível salvar a conclusão no Firebase. Verifique a conexão e tente novamente.');
        }else{
          const users=readUsers();
          if(!Array.isArray(users))throw new Error('Não foi possível atualizar o registro desta conta.');
          const index=users.findIndex(user=>(session.uid&&String(user.uid||'')===String(session.uid))||normalizeEmail(user.email||'')===normalizeEmail(session.email||''));
          if(index<0)throw new Error('Não encontrei o registro local da conta para salvar o aceite.');
          users[index]={...users[index],welcomeTourCompleted:true,welcomeTourAcceptedAt:acceptedAt};
          await saveUsers(users);
        }
        const cached=readUsers();
        if(Array.isArray(cached)){
          let changed=false;
          const updated=cached.map(user=>{
            const match=(session.uid&&String(user.uid||'')===String(session.uid))||normalizeEmail(user.email||'')===normalizeEmail(session.email||'');
            if(!match)return user;changed=true;return {...user,welcomeTourCompleted:true,welcomeTourPromptEnabled:true,welcomeTourAcceptedAt:acceptedAt};
          });
          if(changed){if(fpCloudEnabled())await window.FPStore?.setUsersLocal?.(updated);else await saveUsers(updated);}
        }
        session.welcomeTourCompleted=true;session.welcomeTourPromptEnabled=true;session.welcomeTourAcceptedAt=acceptedAt;delete session._welcomeTourSteps;write(KEYS.session,session);
        close();announce('Boas-vindas concluídas. Você já pode explorar a Folha do Paiquerê.');
      }catch(error){busy=false;next.disabled=false;next.textContent='Começar a explorar';if(agreement)agreement.disabled=false;if(status)status.textContent=error?.message||'Não foi possível registrar sua conclusão. Tente novamente.';announce(status?.textContent||'Não foi possível salvar o aceite.');}
    });
  }

  async function panelInit(){
    const root=$("protected-content");if(!root)return;
    window.FPAuthLoading?.show('Carregando sua Área do Estudante…');
    const s=read(KEYS.session,null);if(!s||!s.email){localStorage.removeItem(KEYS.session);location.replace("login.html?next=painel.html");return;}
    const workflowNotice=sessionStorage.getItem("fp_workflow_notice"); if(workflowNotice){sessionStorage.removeItem("fp_workflow_notice");setTimeout(()=>announce(workflowNotice),0);}

    // Em modo Firebase, o cargo autorizado vem sempre do perfil autenticado.
    // Não usamos o cache antigo do FPStore para decidir se a pessoa é Estudante,
    // Editor ou Editor-Chefe, pois esse cache pode estar um passo atrás.
    if(fpCloudEnabled()){
      await window.FPCloud.waitForAuth?.();
      const liveUser=window.FPCloud?.getAuthUser?.();
      if(!liveUser){localStorage.removeItem(KEYS.session);location.replace("login.html?next=painel.html");return;}
      const liveProfile=liveUser.uid?await window.FPCloud.loadProfile?.(liveUser.uid).catch(()=>null):null;
      if(!liveProfile){
        try{await window.FPCloud.firebaseSignOut?.();}catch(_){}
        localStorage.removeItem(KEYS.session);
        location.replace("login.html?switch=1");
        return;
      }
      if(liveProfile.accessRevoked){
        try{await window.FPCloud.firebaseSignOut?.();}catch(_){}
        localStorage.removeItem(KEYS.session);
        location.replace("login.html?switch=1");
        return;
      }
      const liveEmail=String(liveUser.email||s.email||'').toLowerCase();
      s.uid=liveUser.uid;
      s.email=liveUser.email||s.email;
      s.name=liveProfile.name||liveUser.displayName||s.name||liveEmail.split('@')[0];
      s.role=liveEmail===MASTER_EMAIL?"Editor-Chefe":(liveProfile.role||"Estudante");
      s.avatar=liveProfile.avatar||liveUser.photoURL||s.avatar||"";
      s.schoolYear=liveProfile.schoolYear||s.schoolYear||"";
      s.welcomeTourCompleted=liveProfile.welcomeTourCompleted===true;
      s.welcomeTourPromptEnabled=liveProfile.welcomeTourPromptEnabled===true;
      s.welcomeTourAcceptedAt=liveProfile.welcomeTourAcceptedAt||null;
      s.firebase=true;
      write(KEYS.session,s);
    } else {
      const freshUser=readUsers().find(u=>String(u.email||"").toLowerCase()===String(s.email||"").toLowerCase());
      if(freshUser?.accessRevoked){localStorage.removeItem(KEYS.session);location.href="login.html?switch=1";return;}
      s.name=freshUser?.name||s.name;
      s.role=String(s.email||"").toLowerCase()===MASTER_EMAIL?"Editor-Chefe":(freshUser?.role||"Estudante");
      s.avatar=freshUser?.avatar||s.avatar||"";
      s.schoolYear=freshUser?.schoolYear||s.schoolYear||"";
      s.uid=freshUser?.uid||s.uid||'';
      s.welcomeTourPromptEnabled=Boolean(freshUser&&Object.prototype.hasOwnProperty.call(freshUser,'welcomeTourCompleted'));
      s.welcomeTourCompleted=freshUser?.welcomeTourCompleted===true;
      s.welcomeTourAcceptedAt=freshUser?.welcomeTourAcceptedAt||null;
      write(KEYS.session,s);
    }

    if(fpCloudEnabled() && s.uid){
      try{await window.FPCloud.waitForAuth?.();await window.FPStore?.syncEditorialArticles?.(s.uid,s.role);}catch(error){announce(error?.message||"Não foi possível sincronizar suas matérias com o Firebase.");}
    }
    $("session-name")&&($("session-name").textContent=s.name);
    $("session-role")&&($("session-role").textContent=s.role);
    $("session-email")&&($("session-email").textContent=s.email);
    $("session-profile-year")&&($("session-profile-year").textContent=String(s.schoolYear||'Série pendente'));
    const sidebarAvatar=$("sidebar-avatar");
    if(sidebarAvatar){
      sidebarAvatar.replaceChildren();
      if(s.avatar){const image=document.createElement('img');image.src=String(s.avatar);image.alt='';image.referrerPolicy='no-referrer';sidebarAvatar.append(image);}
      else sidebarAvatar.textContent=String(s.name||s.email||'?').trim().split(/\s+/).slice(0,2).map(part=>part[0]||'').join('').toLocaleUpperCase('pt-BR')||'?';
    }
    const editor=isEditor(s), chief=isEditorChief(s);
    await setupMobileDashboard(s, editor, chief);
    const compactArticlesTitle=$("fp-compact-articles-title");
    if(compactArticlesTitle)compactArticlesTitle.textContent="Minhas matérias";
    const compactModerationTitle=$("fp-compact-moderation-title");
    if(compactModerationTitle)compactModerationTitle.textContent="Mesa do editor";
    document.querySelectorAll('[data-editor-min="editor"]').forEach(el=>{const hide=!editor;el.classList.toggle("hidden",hide);el.hidden=hide;});
    document.querySelectorAll('[data-chief-only="true"]').forEach(el=>{const hide=!chief;el.classList.toggle("hidden",hide);el.hidden=hide;});
    document.querySelectorAll(".team-accounts-grid").forEach(grid=>grid.classList.toggle("team-editor-layout",!chief));
    document.querySelectorAll('[data-editor-only="true"]').forEach(el=>{const hide=!editor;el.classList.toggle("hidden",hide);el.hidden=hide;});
    document.querySelectorAll('[data-master-only="true"]').forEach(el=>{const hide=!isMaster(s);el.classList.toggle("hidden",hide);el.hidden=hide;});
    updateNewArticleButton(s);
    $("new-article-btn")?.addEventListener("click",()=>{ if(updateNewArticleButton(s)) location.href="editor.html"; });
    $("logout-btn")?.addEventListener("click",async()=>{try{await window.FPCloud?.firebaseSignOut?.();}catch(_){} localStorage.removeItem(KEYS.session);location.href="index.html";});
    const closePreview=()=>{const modal=$("preview-modal");modal?.classList.add("hidden");modal?.setAttribute("aria-hidden","true");document.body.classList.remove("fp-preview-open");};
    $("close-preview")?.addEventListener("click",closePreview);
    $("preview-modal")?.addEventListener("click",event=>{if(event.target===$("preview-modal"))closePreview();});
    document.addEventListener("keydown",event=>{if(event.key==="Escape"&&!$("preview-modal")?.classList.contains("hidden"))closePreview();});
    document.querySelectorAll("[data-tab]").forEach(btn=>btn.addEventListener("click",()=>{
      const tab=String(btn.dataset.tab||''),chiefOnlyTabs=['conquistas','avisos','usuarios'],editorOnlyTabs=['moderar','pautas'];
      if((chiefOnlyTabs.includes(tab)&&!chief)||(editorOnlyTabs.includes(tab)&&!editor)){
        const fallback=document.querySelector('[data-tab="perfil"]');if(fallback&&fallback!==btn){fallback.click();}return;
      }
      document.querySelectorAll("[data-tab]").forEach(b=>{const active=String(b.dataset.tab||"")===tab;b.classList.toggle("tab-active",active);b.setAttribute("aria-selected",String(active));});
      document.querySelectorAll("[data-panel]").forEach(panel=>panel.classList.toggle("hidden",panel.dataset.panel!==tab));
      if(tab==="perfil")profile(s);if(tab==="materias")myArticles(s);if(tab==="moderar"&&editor){const list=$("moderation-list");if(isCompactViewport()&&list&&list.dataset.compactInitialFilter!=="1"){list.dataset.statusFilter="Todos";list.dataset.page="1";list.dataset.compactInitialFilter="1";}moderation();}if(tab==="usuarios"&&chief)void users(s);if(tab==="pautas"&&editor)renderEditorialPautas();if(tab==="conquistas"&&chief)renderEditorialConquistas();if(tab==="avisos"&&chief){const host=$("school-notice-admin-list");if(typeof host?.__fpRenderNotices==="function")void host.__fpRenderNotices(true);else void editorialAvisos();}
    }));
    const requestedTab=new URLSearchParams(location.search).get("tab") || (location.hash==="#materias"?"materias":null);
    const initialTab=requestedTab||(isCompactViewport()?"mobile-home":"perfil");
    document.querySelector(`[data-tab="${initialTab}"]`)?.click();
    if(location.hash==="#materias") setTimeout(()=>document.querySelector('[data-panel="materias"]')?.scrollIntoView({behavior:"smooth",block:"start"}),0);
    myArticles(s);updateNewArticleButton(s);void profile(s);await editorialExtras(s);
    window.addEventListener("storage",e=>{if(e.key==="fp_articles"){myArticles(s);updateNewArticleButton(s);if(editor)moderation();}if(e.key==="fp_users"){void profile(s);}if(e.key==="fp_suggestions"&&editor)renderEditorialPautas();if(e.key==="fp_achievements"&&editor)renderEditorialConquistas();});
    setupWelcomeTour({...s,_welcomeTourSteps:[
      {title:'📰 Bem-vindo à Folha do Paiquerê!',intro:'Sua voz e suas ideias agora fazem parte da história da nossa comunidade escolar.',detail:'Aqui estão algumas dicas rápidas para você começar a aproveitar ao máximo a plataforma:'},
      {title:'👤 Personalize seu perfil',intro:'Assim que a autorização estiver ativa, acesse “Meu Perfil” para adicionar sua biografia, redes sociais e deixar sua trajetória registrada.'},
      {title:'✍️ Crie e envie matérias',intro:'Na seção “Minhas Matérias”, você pode desenvolver reportagens, textos, enquetes e enviar diretamente para a análise da redação.'},
      {title:'🏆 Conquiste destaques',intro:'Participe ativamente dos projetos, ajude com pesquisas e textos para acumular conquistas e reconhecimento no mural público.'},
      {title:'🤝 Respeite as diretrizes',intro:'Lembre-se de que todo conteúdo passa pela curadoria dos editores antes de ser publicado, garantindo um espaço seguro e de qualidade para todos.',note:'Ao continuar, você confirma que leu e aceita as diretrizes editoriais e de convivência.'}
    ]});
    window.FPAuthLoading?.hide();
  }

  setupAccessibility(); loginInit(); panelInit();
})();
