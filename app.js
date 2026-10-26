(async () => {
  'use strict';
  const fpCloudEnabled = () => { const state = window.FPCloud?.enabled; return typeof state === 'function' ? Boolean(state()) : Boolean(state); };

  if (window.FPStore?.ready) await window.FPStore.ready;
  if (window.FPCloudReady) await window.FPCloudReady.catch(() => null);

  const ARTICLES_KEY = 'fp_articles';
  const USERS_KEY = 'fp_users';
  const SESSION_KEY = 'fp_session';
  const LEGACY_META_KEY = 'fp_article_meta';

  const PUBLIC_NEWS = [];
  function getBrowserIdentity(){
    let value=readJSON('fp_anonymous_identity',null);
    if(!value||typeof value!=='object'||!value.id){ value={id:`anon_${Date.now()}_${Math.random().toString(36).slice(2,10)}`,createdAt:new Date().toISOString(),type:'anonymous'}; writeJSON('fp_anonymous_identity',value); }
    return value;
  }

  async function initFirebasePublicFeed(){
    if(!fpCloudEnabled()) return;
    try {
      const remote=await window.FPCloud.fetchPublicArticles();
      if(window.FPStore?.syncPublicArticles) await window.FPStore.syncPublicArticles(remote||[]);
      else { localStorage.setItem(ARTICLES_KEY,JSON.stringify(remote||[])); window.dispatchEvent(new CustomEvent('fp:articles-updated',{detail:remote||[]})); }
      window.FPCloud.listenPublicArticles(items=>{
        if(window.FPStore?.syncPublicArticles) window.FPStore.syncPublicArticles(items||[]);
        else { localStorage.setItem(ARTICLES_KEY,JSON.stringify(items||[])); window.dispatchEvent(new CustomEvent('fp:articles-updated',{detail:items||[]})); }
      });
    } catch(_) {}
  }
  initFirebasePublicFeed();

  async function initFirebaseCommunity(){
    if(!fpCloudEnabled()) return;
    try{
      const profiles=await window.FPCloud.fetchPublicProfiles();
      if(Array.isArray(profiles)){
        // With Firebase enabled, publicProfiles is the source of truth for UID-backed
        // public cards. Do not retain stale cached profiles after an admin removes them.
        const local=readJSON(USERS_KEY,[]);
        const localRows=Array.isArray(local)?local:[];
        const byUid=new Map();
        profiles.filter(p=>p&&p.uid).forEach(p=>{
          const prior=localRows.find(u=>String(u?.uid||'')===String(p.uid))||{};
          // Keep a Plan B tombstone hidden if deletion partially failed; if the
          // Editor-Chefe explicitly restores a public profile (accessRevoked false),
          // let the remote profile replace the stale tombstone marker.
          if(prior.revocationMode==='spark-plan-b'&&p.accessRevoked===true)return;
          const mergedProfile={...prior,...p};
          if(prior.revocationMode==='spark-plan-b'&&p.accessRevoked!==true)delete mergedProfile.revocationMode;
          byUid.set(String(p.uid),mergedProfile);
        });
        const merged=[...byUid.values(),...localRows.filter(u=>u&&!u.uid&&u.revocationMode!=='spark-plan-b')];
        localStorage.setItem(USERS_KEY,JSON.stringify(merged));
        window.dispatchEvent(new CustomEvent('fp:profiles-updated',{detail:merged}));
      }
      try{
        const achievements=await window.FPCloud.fetchAchievements();
        if(Array.isArray(achievements)){
          localStorage.setItem('fp_achievements',JSON.stringify(achievements));
          window.dispatchEvent(new CustomEvent('fp:achievements-updated'));
        }
      }catch(error){console.warn('[Folha do Paiquerê] conquistas remotas indisponíveis; mantendo a cópia local.',error);}
      window.FPCloud.listenAchievements?.(items=>{
        if(Array.isArray(items)){
          localStorage.setItem('fp_achievements',JSON.stringify(items));
          window.dispatchEvent(new CustomEvent('fp:achievements-updated'));
        }
      });
      const notices=await window.FPCloud.fetchSchoolNotices?.(); if(Array.isArray(notices)){localStorage.setItem('fp_school_notices',JSON.stringify(notices));window.dispatchEvent(new CustomEvent('fp:school-notices-updated'));}
      window.FPCloud.listenSchoolNotices?.(items=>{localStorage.setItem('fp_school_notices',JSON.stringify(Array.isArray(items)?items:[]));window.dispatchEvent(new CustomEvent('fp:school-notices-updated'));});
    }catch(_){}
  }
  initFirebaseCommunity();

  const readJSON = (key, fallback) => { try { const raw=localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; } catch (_) { return fallback; } };
  const writeJSON = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch (_) { return false; } };
  const escapeHTML = value => String(value ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
  // Crop metadata must be a normalized rectangle. Invalid legacy values are ignored so
  // the original image falls back to the card's normal object-fit:cover presentation.
  function normalizedCropRect(crop) {
    if(!crop || typeof crop!=='object') return null;
    const x=Number(crop.x), y=Number(crop.y), width=Number(crop.width), height=Number(crop.height);
    if(![x,y,width,height].every(Number.isFinite)) return null;
    // The editor permits crops down to 1% of the source. Smaller/negative/out-of-bounds
    // rectangles are malformed and must not create a tiny or offset image in a card.
    if(x<0 || y<0 || width<0.01 || height<0.01 || width>1 || height>1 || x+width>1.0001 || y+height>1.0001) return null;
    return {x,y,width,height};
  }
  // Cropping is display metadata: source image files remain untouched. Values are normalized (0..1).
  function imageCropMarkup(src, crop, alt='', className='', loading='lazy') {
    const imageSource=String(src||'').trim();
    if(!imageSource)return '';
    const c=normalizedCropRect(crop);
    if(!c)return `<img src="${escapeHTML(imageSource)}" alt="${escapeHTML(alt)}" class="${escapeHTML(className)}" loading="${escapeHTML(loading)}">`;
    // Do not cap these percentages: a legitimate 1%-wide crop needs 10000% image width
    // to fill its viewport. The editor's 1% minimum keeps the values bounded.
    const left=-c.x/c.width*100,top=-c.y/c.height*100,width=100/c.width,height=100/c.height;
    return `<span class="fp-app-image-crop-frame" aria-label="${escapeHTML(alt)}"><img src="${escapeHTML(imageSource)}" alt="${escapeHTML(alt)}" class="${escapeHTML(className)}" loading="${escapeHTML(loading)}" style="position:absolute!important;left:${left}%!important;top:${top}%!important;width:${width}%!important;height:${height}%!important;max-width:none!important;max-height:none!important;object-fit:fill!important;"></span>`;
  }
  const $ = id => document.getElementById(id);
  const normalizeTags = value => Array.isArray(value) ? value.map(v=>String(v).trim()).filter(Boolean) : String(value||'').split(/[,;|]/).map(v=>v.trim()).filter(Boolean);
  const displayTags = value => { const tags=normalizeTags(value); return tags.length?tags:['Sem categoria']; };
  function articleCategoryValues(item){
    const source=item?.sourceArticle||item||{};
    const candidates=[...(Array.isArray(item?.categories)?item.categories:normalizeTags(item?.categories)),...normalizeTags(item?.category),...normalizeTags(source?.categories),...normalizeTags(source?.category),...normalizeTags(item?.customCategory),...normalizeTags(item?.customCategories),...normalizeTags(item?.categoryOther),...normalizeTags(item?.otherCategory),...normalizeTags(item?.otherCategories),...normalizeTags(source?.customCategory),...normalizeTags(source?.customCategories),...normalizeTags(source?.categoryOther),...normalizeTags(source?.otherCategory),...normalizeTags(source?.otherCategories)];
    const seen=new Set(),result=[]; candidates.forEach(value=>{const tag=String(value||'').trim();const key=tag.toLocaleLowerCase('pt-BR');if(!tag||key==='outro'||seen.has(key))return;seen.add(key);result.push(tag);});return result;
  }
  function achievementYearValue(item){
    const raw=String(item?.date||item?.achievementDate||'').trim();
    let match=raw.match(/^(\d{4})-\d{2}-\d{2}$/);if(match)return match[1];
    match=raw.match(/^\d{2}\/\d{2}\/(\d{4})$/);if(match)return match[1];
    const year=String(item?.year||'').trim();return /^\d{4}$/.test(year)?year:'';
  }
  function achievementDateLabel(item){
    const raw=String(item?.date||item?.achievementDate||'').trim();
    let match=raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);if(match)return `${match[3]}/${match[2]}/${match[1]}`;
    match=raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);if(match)return raw;
    if(raw){const stamp=publicDateTime(raw);if(stamp)return new Date(stamp).toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric'});}
    return item?.year?`Data não informada · ${String(item.year)}`:'Data não informada';
  }
  function achievementSortTimestamp(item){const raw=String(item?.date||item?.achievementDate||'').trim();if(raw){const stamp=publicDateTime(raw);if(stamp)return stamp;}return publicDateTime(item?.createdAt||item?.publishedAt||item?.updatedAt);}

  function migrateLegacyArticleMeta(){
    const base=readJSON(ARTICLES_KEY,[]),meta=readJSON(LEGACY_META_KEY,{});
    if(!Array.isArray(base)) return [];
    if(!meta||typeof meta!=='object'||!Object.keys(meta).length) return base;
    let changed=false;
    const merged=base.map(a=>{const m=meta[String(a.id)];if(!m)return a;changed=true;return {...a,...m};});
    if(changed && writeJSON(ARTICLES_KEY,merged)) localStorage.removeItem(LEGACY_META_KEY);
    return merged;
  }
  const getAllLocalArticles = () => { const stored=window.FPStore?.getArticles?.(); if(Array.isArray(stored)&&stored.length)return stored; const direct=readJSON(ARTICLES_KEY,[]); if(Array.isArray(direct)&&direct.length)return direct; const indexed=readJSON('fp_article_index',[]); return Array.isArray(indexed)&&indexed.length?indexed:migrateLegacyArticleMeta(); };
  const updateArticle = async (id, patch) => {
    const all=getAllLocalArticles();
    const i=all.findIndex(a=>String(a.id)===String(id));
    if(i<0) return null;
    all[i]={...all[i],...patch,updatedAt:patch.updatedAt||new Date().toISOString()};
    if(window.FPStore?.setArticles) await window.FPStore.setArticles(all,{cloud:false}); else if(!writeJSON(ARTICLES_KEY,all)) throw new Error('Não foi possível salvar a matéria.');
    return all[i];
  };

  function getApprovedLocalNews() {
    const raw = getAllLocalArticles();
    return raw.filter(a => a.status === 'Aprovado' && a.visible !== false).map(a => ({
      id: String(a.id), category:a.category, categories:articleCategoryValues(a), customCategory:a.customCategory||a.categoryOther||a.otherCategory||'', title:a.title,
      excerpt:a.subtitle || 'Matéria publicada pela redação estudantil.', author:a.author, authorUid:a.authorUid||'', authorEmail:a.authorEmail||'',
      date:new Date(a.date).toLocaleDateString('pt-BR'), isoDate:a.approvedAt||a.publishedAt||a.updatedAt||a.date,
      image:a.coverURL || a.thumbURL || '', coverCrop:a.coverCrop&&typeof a.coverCrop==='object'?a.coverCrop:null, body:[], localArticle:true, videoUrl:a.videoUrl || '',
      canvasJSON:a.canvasJSON || null, sourceArticle:a, editorialHighlight:isEditorialHighlight(a.editorialHighlight)||isEditorialHighlight(a.featured)||isEditorialHighlight(a.isFeatured),
      contentType:a.contentType||'informacional', creativeType:a.creativeType||'',
      views:Number(a.views||0), likes:Number(a.likes||0), dislikes:Number(a.dislikes||0), credits:a.credits||{}, creditProfiles:a.creditProfiles||{}
    }));
  }
  function getPublicNews(){ const local=getApprovedLocalNews(); return [...local,...PUBLIC_NEWS].sort((a,b)=>new Date(b.isoDate||b.date||0)-new Date(a.isoDate||a.date||0)); }
  function publicUserByUid(uid){const key=String(uid||'').trim();if(!key)return null;const all=readJSON(USERS_KEY,[]);return Array.isArray(all)?all.find(u=>String(u?.uid||'').trim()===key&&u?.revocationMode!=='spark-plan-b'):null;}
  function publicUserByName(name){const all=readJSON(USERS_KEY,[]);return Array.isArray(all)?all.find(u=>u?.revocationMode!=='spark-plan-b'&&String(u.name||'').trim().toLocaleLowerCase('pt-BR')===String(name||'').trim().toLocaleLowerCase('pt-BR')):null;}
  function publicUserByEmail(email){const all=readJSON(USERS_KEY,[]);return Array.isArray(all)?all.find(u=>u?.revocationMode!=='spark-plan-b'&&String(u.email||'').trim().toLocaleLowerCase('pt-BR')===String(email||'').trim().toLocaleLowerCase('pt-BR')):null;}
  function resolvePublicUser({uid='',email='',name=''}={}){return publicUserByUid(uid)||publicUserByEmail(email)||publicUserByName(name);}
  function profileHrefByName(name){const u=publicUserByName(name);return u?(u.uid?`perfil.html?uid=${encodeURIComponent(u.uid)}`:`perfil.html?email=${encodeURIComponent(u.email)}`):'#';}
  function authorByline(name,uid='',email=''){const u=resolvePublicUser({uid,email,name});if(!u)return `<strong>${escapeHTML(name||'Redação')}</strong>`;const initials=escapeHTML(String(u.name||'?').split(/\s+/).map(x=>x[0]).slice(0,2).join('').toUpperCase());const href=u.uid?`perfil.html?uid=${encodeURIComponent(u.uid)}`:(u.email?`perfil.html?email=${encodeURIComponent(u.email)}`:'#');return href!=='#'?`<a class="author-profile-link" href="${href}"><span class="author-profile-mini">${u.avatar?`<img src="${escapeHTML(u.avatar)}" alt="">`:`<span>${initials}</span>`}</span><strong>${escapeHTML(u.name)}</strong></a>`:`<strong>${escapeHTML(u.name)}</strong>`;}
  function creditPersonMarkup(name, profile){const u=(profile?.uid&&publicUserByUid(profile.uid))||(profile?.email&&publicUserByEmail(profile.email))||(profile?.name&&publicUserByName(profile.name))||publicUserByUid(typeof name==='object'?name?.uid:name)||publicUserByEmail(typeof name==='object'?name?.email:name)||publicUserByName(typeof name==='object'?name?.name:name);const displayName=typeof name==='object'?(name?.name||name?.email||name?.uid||''):name;if(!u)return escapeHTML(displayName||"");const href=u.uid?`perfil.html?uid=${encodeURIComponent(u.uid)}`:(u.email?`perfil.html?email=${encodeURIComponent(u.email)}`:'#');const label=escapeHTML(u.name||displayName);const initials=escapeHTML(String(u.name||displayName||'?').split(/\s+/).map(x=>x[0]).slice(0,2).join('').toUpperCase());const avatar=u.avatar?`<img src="${escapeHTML(u.avatar)}" alt="" loading="lazy">`:`<span>${initials}</span>`;return href!=='#'?`<a class="credit-profile-link inline-flex items-center gap-1.5 align-middle" href="${href}"><span class="inline-flex h-6 w-6 flex-none items-center justify-center overflow-hidden rounded-full bg-[#F2F7F3] text-[9px] font-extrabold text-[#1B5E20] dark:bg-[#242D25] dark:text-[#81C784]">${avatar}</span><span>${label}</span></a>`:`<span class="inline-flex items-center gap-1.5 align-middle"><span class="inline-flex h-6 w-6 flex-none items-center justify-center overflow-hidden rounded-full bg-[#F2F7F3] text-[9px] font-extrabold text-[#1B5E20] dark:bg-[#242D25] dark:text-[#81C784]">${avatar}</span><span>${label}</span></span>`;}
  function creditNames(value){return Array.isArray(value)?value.filter(Boolean):value?[String(value)]:[];}
  function normalizeSocialIconSource(raw){
    let value=String(raw??'').trim();if(!value)return '';
    if(/<img\b/i.test(value)){
      const match=value.match(/<img\b[^>]*\bsrc\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s"'=<>`]+))/i);
      if(!match)return '';value=String(match[1]||match[2]||match[3]||'').trim();
    }
    if(!value)return '';
    try{
      if(value.startsWith('/')){const parsed=new URL(value,location.origin);return parsed.origin===location.origin?`${parsed.pathname}${parsed.search}${parsed.hash}`:'';}
      const parsed=new URL(/^https?:\/\//i.test(value)?value:`https://${value}`);
      if(!parsed.hostname||parsed.username||parsed.password||parsed.protocol!=='https:')return '';
      return parsed.href;
    }catch(_){return '';}
  }
  function normalizeIdentityText(value,stripDiacritics=true){let s=String(value??'').normalize('NFKC').replace(/[\u200B-\u200D\uFEFF]/g,'').trim().toLowerCase();if(stripDiacritics)s=s.normalize('NFD').replace(/[\u0300-\u036f]/g,'');return s;}
  function creditIdentityKeys(value,profile){
    const keys=[];
    const raw=(value&&typeof value==='object')?value:null;
    const uid=normalizeIdentityText(profile?.uid||raw?.uid||'',false);
    const email=normalizeIdentityText(profile?.email||raw?.email||'',false);
    const stringValue=typeof value==='string'?String(value):'';
    const inferredEmail=!email&&stringValue.includes('@')?normalizeIdentityText(stringValue,false):'';
    const name=normalizeIdentityText(profile?.name||raw?.name||(!inferredEmail?stringValue:''),true);
    if(uid)keys.push(`uid:${uid}`);
    if(email)keys.push(`email:${email}`);
    else if(inferredEmail)keys.push(`email:${inferredEmail}`);
    if(name)keys.push(`name:${name}`);
    return [...new Set(keys)];
  }
  function identityMatches(aValue,aProfile,bValue,bProfile){
    const a=Object.fromEntries(creditIdentityKeys(aValue,aProfile).map(k=>{const i=k.indexOf(':');return [k.slice(0,i),k.slice(i+1)];}));
    const b=Object.fromEntries(creditIdentityKeys(bValue,bProfile).map(k=>{const i=k.indexOf(':');return [k.slice(0,i),k.slice(i+1)];}));
    if(a.uid&&b.uid){
      if(a.uid===b.uid)return true;
      return Boolean(a.email&&b.email&&a.email===b.email);
    }
    if(a.email&&b.email)return a.email===b.email;
    return Boolean(a.name&&b.name&&a.name===b.name);
  }
  function creditProfileEntries(article,key){
    const raw=article?.creditProfiles?.[key];
    if(Array.isArray(raw))return raw.filter(Boolean);
    if(raw&&typeof raw==='object'){
      if(raw.uid||raw.email||raw.name)return [raw];
      return Object.values(raw).flatMap(v=>Array.isArray(v)?v:(v&&typeof v==='object'?[v]:[])).filter(Boolean);
    }
    return [];
  }
  function creditRawEntries(value){
    if(Array.isArray(value))return value.flatMap(creditRawEntries);
    if(value&&typeof value==='object'){
      if(value.uid||value.email||value.name)return [value];
      return Object.values(value).flatMap(creditRawEntries);
    }
    const raw=String(value??'').trim();
    if(!raw)return [];
    return raw.split(/[,;|\n]/).map(v=>v.trim()).filter(Boolean);
  }
  function creditEntryListForField(n,key,label){
    const values=creditRawEntries(n?.credits?.[key]);
    const profiles=creditProfileEntries(n,key);
    const entries=[];
    const usedProfiles=new Set();
    values.forEach(value=>{
      let profile=null;
      const matchIndex=profiles.findIndex((p,idx)=>!usedProfiles.has(idx)&&identityMatches(value,null,p,p));
      if(matchIndex>=0){profile=profiles[matchIndex];usedProfiles.add(matchIndex);}
      entries.push({label,key,value,profile});
    });
    profiles.forEach((profile,idx)=>{
      if(usedProfiles.has(idx))return;
      const displayValue=String(profile?.name||profile?.email||profile?.uid||'').trim();
      if(displayValue)entries.push({label,key,value:displayValue,profile});
    });
    const seen=new Set();
    return entries.filter(e=>{const k=creditIdentityKeys(e.value,e.profile).join('|')||`raw:${normalizeIdentityText(e.value,false)}`;if(seen.has(k))return false;seen.add(k);return true;});
  }
  function creditEntryList(n){return [
    ...creditEntryListForField(n,'researcher','Pesquisa'),
    ...creditEntryListForField(n,'textCredit','Texto'),
    ...creditEntryListForField(n,'imageCredit','Fotografia')
  ];}
  function creditProfileList(article,key,names){
    const stored=creditProfileEntries(article,key);
    return names.map(n=>stored.find(p=>identityMatches(n,null,p,p))||null);
  }
  function achievementCreditMarkup(a){const c=creditNames(a.credits),profiles=Array.isArray(a.creditProfiles)?a.creditProfiles:[];if(!c.length&&!profiles.length)return '';const rows=c.length?c.map(n=>{const p=profiles.find(x=>identityMatches(n,null,x,x));return `<span class="achievement-credit-pill">${creditPersonMarkup(n,p)}</span>`;}):profiles.map(p=>`<span class="achievement-credit-pill">${creditPersonMarkup(p.name,p)}</span>`);return `<div class="achievement-credit-public mt-4"><div class="achievement-credit-label">Participantes</div><div class="achievement-credit-list">${rows.join('')}</div></div>`;}
  function achievementDetailsMarkup(a){
    const person=String(a?.name||'Comunidade escolar').trim();
    const categories=(Array.isArray(a?.types)&&a.types.length?a.types:[a?.type||'Conquista']).filter(Boolean).join(' · ');
    const year=achievementDateLabel(a);
    const summary=String(a?.description||'').trim();
    const details=String(a?.details||'').trim();
    const image=a?.image?`<img class="fp-public-detail-image" src="${escapeHTML(a.image)}" alt="Imagem da conquista: ${escapeHTML(a.title||person||'Conquista')}" loading="lazy">`:'';
    return `<hr class="fp-public-detail-divider fp-achievement-meta-divider"><div class="fp-achievement-detail-meta"><span>${escapeHTML(person||'Comunidade escolar')}</span><i aria-hidden="true">•</i><span>${escapeHTML(categories)}</span>${year?`<i aria-hidden="true">•</i><span>${escapeHTML(year)}</span>`:''}</div><hr class="fp-public-detail-divider">${image}${summary?`<p class="fp-public-detail-summary">${escapeHTML(summary)}</p>`:''}${details?`<div class="fp-public-detail-body">${escapeHTML(details)}</div>`:''}${achievementCreditMarkup(a)}`;
  }
  function closePublicModal(modal){if(!modal)return;modal.classList.add('hidden');modal.classList.remove('flex');}
  function bindPublicDetailModal(modal){
    if(modal.dataset.fpCloseBound)return;modal.dataset.fpCloseBound='1';
    const close=()=>closePublicModal(modal);
    modal.querySelector('[data-detail-modal-close]')?.addEventListener('click',close);
    modal.addEventListener('click',event=>{if(event.target===modal)close();});
    document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!modal.classList.contains('hidden'))close();});
  }

  function articleAuthorIdentity(n){const rawProfile={uid:n?.authorUid||'',email:n?.authorEmail||'',name:n?.author||''};const profile=resolvePublicUser(rawProfile)||null;return {value:n?.author||'',profile:profile||rawProfile,keys:[...new Set([...creditIdentityKeys(n?.author,rawProfile),...creditIdentityKeys(n?.author,profile)])]};}
  function creditPersonMatchesAuthor(n,value,profile){const author=articleAuthorIdentity(n);return creditIdentityKeys(value,profile).some(k=>author.keys.includes(k));}
  function articleHasSoloCreditOwnership(n){
    const authorName=String(n?.author||'').trim();
    if(!authorName)return false;
    const required=['researcher','textCredit','imageCredit'];
    return required.every(key=>{
      const values=creditRawEntries(n?.credits?.[key]);
      const entries=creditEntryListForField(n,key,key);
      return values.length>0&&entries.length>0&&entries.every(e=>creditPersonMatchesAuthor(n,e.value,e.profile));
    });
  }
  function dedupePublicArticlesForActivity(articles){const map=new Map();for(const article of Array.isArray(articles)?articles:[]){const id=String(article?.id||'');if(!id||!map.has(id))map.set(id,article);}return [...map.values()];}
  function profileActivityStats(user,articles){
    const identity={value:user?.name||'',profile:user};
    const same=(value,profile)=>identityMatches(value,profile,identity.value,identity.profile);
    const publicArticles=dedupePublicArticlesForActivity(articles);
    const posts=publicArticles.filter(n=>same(n?.author,{uid:n?.authorUid,email:n?.authorEmail,name:n?.author}));
    const creditMatchesProfile=(article,field)=>{ const values=creditRawEntries(article?.credits?.[field]); if(values.some(value=>same(value,null)))return true; const profiles=creditProfileEntries(article,field); return profiles.some(profile=>same(profile,profile)); };
    const area=field=>publicArticles.filter(n=>creditMatchesProfile(n,field));
    const textArticles=area('textCredit'),imageArticles=area('imageCredit'),researchArticles=area('researcher');
    const soloArticle=n=>posts.some(a=>String(a?.id)===String(n?.id))&&articleHasSoloCreditOwnership(n);
    return {
      posts,
      textArticles,
      imageArticles,
      researchArticles,
      textDisplay:textArticles.filter(n=>!soloArticle(n)),
      imageDisplay:imageArticles.filter(n=>!soloArticle(n)),
      researchDisplay:researchArticles.filter(n=>!soloArticle(n)),
      articles:[...new Map([...posts,...textArticles,...imageArticles,...researchArticles].map(a=>[String(a.id),a])).values()],
      contributions:posts.length+textArticles.length+imageArticles.length+researchArticles.length
    };
  }
  function creditLine(n){const authorName=String(n?.author||'').trim();const authorMarkup=authorName?authorByline(n.author,n.authorUid,n.authorEmail):'';const entries=creditEntryList(n);const solo=articleHasSoloCreditOwnership(n);if(solo)return `<div class="mt-2 flex flex-wrap gap-x-3 gap-y-2 text-xs text-slate-500 dark:text-slate-400"><span class="inline-flex flex-wrap items-center gap-1"><b>Autoria e Diagramação:</b> ${authorMarkup}</span></div>`;const bits=[];if(authorName)bits.push(`<span class="inline-flex flex-wrap items-center gap-1"><b>Diagramação:</b> ${authorMarkup}</span>`);const grouped=new Map();entries.forEach(e=>{if(!grouped.has(e.key))grouped.set(e.key,{label:e.label,items:[]});grouped.get(e.key).items.push(e);});grouped.forEach(group=>{const people=group.items.map(e=>creditPersonMarkup(typeof e.value==='object'?(e.value.name||e.value.email||e.value.uid):e.value,e.profile));bits.push(`<span class="inline-flex flex-wrap items-center gap-1"><b>${group.label}:</b> ${people.join(', ')}</span>`);});return bits.length?`<div class="mt-2 flex flex-wrap gap-x-3 gap-y-2 text-xs text-slate-500 dark:text-slate-400">${bits.join('')}</div>`:"";}
  function readingWords(n){
    const parts=[n?.title,n?.excerpt];
    if(n?.localArticle){
      const objects=Array.isArray(n.canvasJSON?.objects)?[...n.canvasJSON.objects].sort((a,b)=>{
        const dy=(Number(a?.top)||0)-(Number(b?.top)||0);
        return Math.abs(dy)>2?dy:(Number(a?.left)||0)-(Number(b?.left)||0);
      }):[];
      objects.forEach(o=>{
        if(["textbox","i-text","text"].includes(String(o?.type||'').toLowerCase())){
          if(String(o?.text||'').trim())parts.push(o.text);
          return;
        }
        if(o?.dataType==='poll'&&o?.dataPoll){
          const poll=o.dataPoll;
          parts.push(poll.title);
          if(poll.kind==='multi')parts.push('Você pode marcar mais de uma opção.');
          else if(poll.kind==='rating')parts.push('Escolha uma nota de 1 a 5.');
          else parts.push('Escolha uma opção.');
          if(Array.isArray(poll.options))parts.push(...poll.options);
        }
      });
    }else if(Array.isArray(n?.body)){
      n.body.forEach(block=>{
        if(!block||typeof block!=='object')return;
        if(['p','h2','h3','quote'].includes(block.type))parts.push(block.text);
        else if(block.type==='image')parts.push(block.alt);
        else if(block.type==='video')parts.push(block.title);
        else if(typeof block.text==='string')parts.push(block.text);
      });
    }
    return parts.filter(value=>value!=null).map(value=>String(value)).filter(value=>value.trim()).join(' ');
  }
  function readingTime(n){
    const text=readingWords(n).replace(/\s+/g,' ').trim();
    const words=text?text.split(' ').filter(Boolean).length:0;
    const minutes=Math.max(1,Math.ceil(words/200));
    return `${minutes} min de leitura`;
  }

  async function refreshPollResults(box){
    if(!box)return {total:0,options:[]};
    const optionCount=box.querySelectorAll('[data-poll-option]').length;
    const result=await pollResults(box.dataset.pollId,box.dataset.pollIndex,optionCount);
    const total=Number(result.total||0);
    box.querySelectorAll('[data-poll-vote-count]').forEach((el,i)=>{const n=Number(result.options?.[i]||0);el.textContent=`${n}`;el.setAttribute('aria-label',`${n} ${n===1?'voto':'votos'} nesta opção`);});
    const totalEl=box.querySelector('[data-poll-total]'); if(totalEl) totalEl.textContent=`${total} ${total===1?'voto':'votos'}`;
    return result;
  }

  function noticeTimestamp(value){
    if(value==null||value==='')return 0;
    if(typeof value==='number')return Number.isFinite(value)?value:0;
    if(typeof value==='object'){
      if(typeof value.toDate==='function'){const ms=value.toDate().getTime();return Number.isFinite(ms)?ms:0;}
      if(Number.isFinite(Number(value.seconds)))return Number(value.seconds)*1000+Math.floor(Number(value.nanoseconds||0)/1e6);
    }
    const parsed=Date.parse(String(value));
    return Number.isFinite(parsed)?parsed:0;
  }
  function getSchoolNotices(){
    const all=readJSON('fp_school_notices',[]),now=Date.now();
    return (Array.isArray(all)?all:[])
      .filter(n=>n&&n.visible!==false&&(!n.expiresAt||noticeTimestamp(n.expiresAt)>now))
      .sort((a,b)=>noticeTimestamp(b.createdAt||b.updatedAt)-noticeTimestamp(a.createdAt||a.updatedAt));
  }
  let schoolNoticeExpiryTimer=null;
  function scheduleSchoolNoticeExpiry(){
    if(schoolNoticeExpiryTimer)clearTimeout(schoolNoticeExpiryTimer);
    const now=Date.now();
    const next=(Array.isArray(readJSON('fp_school_notices',[]))?readJSON('fp_school_notices',[]):[])
      .filter(n=>n&&n.visible!==false&&n.expiresAt)
      .map(n=>noticeTimestamp(n.expiresAt)).filter(t=>t>now).sort((a,b)=>a-b)[0];
    if(next)schoolNoticeExpiryTimer=setTimeout(()=>renderHome(),Math.min(Math.max(next-now+80,1000),2147480000));
  }
  function schoolNoticeCard(n){const details=n.details?`<button type="button" class="mt-4 text-sm font-bold text-[#2E7D32] dark:text-[#81C784]" data-school-notice-details="${escapeHTML(n.id)}">Ler mais →</button>`:'';return `<article class="school-notice-card panel-surface overflow-hidden">${n.image?imageCropMarkup(n.image,n.imageCrop,n.title||'Aviso da escola','w-full aspect-[16/9] object-cover','lazy'):''}<div class="p-5"><p class="text-[11px] font-extrabold uppercase tracking-wide text-[#2E7D32] dark:text-[#81C784]">Aviso da escola</p><h3 class="mt-2 text-lg font-extrabold leading-tight">${escapeHTML(n.title)}</h3><p class="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-400">${escapeHTML(n.summary||'')}</p>${details}</div></article>`;}
  function openSchoolNotice(n){
    if(!n)return;
    let m=document.getElementById('school-notice-modal');
    if(!m){
      m=document.createElement('div');m.id='school-notice-modal';
      m.className='fp-public-detail-backdrop fixed inset-0 z-[10040] hidden items-center justify-center bg-black/60 p-3 sm:p-6';
      m.setAttribute('role','dialog');m.setAttribute('aria-modal','true');m.setAttribute('aria-labelledby','school-notice-modal-title');
      m.innerHTML='<article class="fp-public-detail-modal fp-notice-detail-modal"><button type="button" class="fp-public-detail-close" data-notice-close aria-label="Fechar aviso">×</button><div class="fp-public-detail-content"><p class="fp-public-detail-kicker">Comunicado da escola</p><h2 id="school-notice-modal-title" data-notice-modal-title></h2><img class="fp-public-detail-image" data-notice-modal-image alt="" hidden><p class="fp-public-detail-summary" data-notice-modal-summary hidden></p><div class="fp-public-detail-body" data-notice-modal-body></div><div class="fp-public-detail-date" data-notice-modal-date></div></div></article>';
      document.body.appendChild(m);
      const close=()=>{m.classList.add('hidden');m.classList.remove('flex');};
      m.querySelector('[data-notice-close]').addEventListener('click',close);
      m.addEventListener('click',e=>{if(e.target===m)close();});
      document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!m.classList.contains('hidden'))close();});
    }
    m.querySelector('[data-notice-modal-title]').textContent=n.title||'Aviso da escola';
    const img=m.querySelector('[data-notice-modal-image]');
    if(n.image){img.src=String(n.image);img.alt=`Imagem do aviso: ${String(n.title||'Comunicado')}`;img.hidden=false;}else{img.removeAttribute('src');img.alt='';img.hidden=true;}
    const summary=m.querySelector('[data-notice-modal-summary]');
    const summaryText=String(n.summary||'').trim();summary.textContent=summaryText;summary.hidden=!summaryText;
    m.querySelector('[data-notice-modal-body]').textContent=n.details||'';
    const stamp=m.querySelector('[data-notice-modal-date]');stamp.textContent=publicDateLabel(n)?`Publicado em ${publicDateLabel(n)}`:'';stamp.hidden=!stamp.textContent;
    m.classList.remove('hidden');m.classList.add('flex');
    m.querySelector('[data-notice-close]')?.focus({preventScroll:true});
  }
  function bindNoticeCards(scope=document){scope.querySelectorAll('[data-school-notice-details]').forEach(b=>b.onclick=()=>openSchoolNotice(getSchoolNotices().find(x=>String(x.id)===String(b.dataset.schoolNoticeDetails))));}
  function focusSchoolNoticeFromHash(){const hash=String(location.hash||'');const id=hash.startsWith('#aviso-')?decodeURIComponent(hash.slice('#aviso-'.length)):'';if(!id)return;const n=getSchoolNotices().find(x=>String(x.id)===id);if(n)openSchoolNotice(n);}
  function reactionState(id){ const all=readJSON('fp_reactions',{}); return all&&typeof all==='object'?all[String(id)]||null:null; }
  function reactionMarkup(n, compact=false){
    const mine=reactionState(n.id);
    return `<div class="news-reactions ${compact?'news-reactions-compact':''}" data-reactions="${escapeHTML(n.id)}"><button type="button" class="reaction-btn ${mine==='like'?'active':''}" data-reaction="like" aria-pressed="${mine==='like'}" aria-label="Gostei desta notícia"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7.5 10.2 11 4.8c.55-.85 1.2-1.3 1.9-1.3 1.15 0 1.8 1 1.55 2.2l-.65 3.1h4.65c1.6 0 2.55 1.45 2.15 2.9l-1.65 6.05a2.35 2.35 0 0 1-2.25 1.75H7.5M3.4 10.1h3.8v9.3H3.4z"/></svg><span>${Number(n.likes||0)}</span></button></div>`;
  }
  async function refreshReactionUI(id){
    const local=getAllLocalArticles().find(a=>String(a.id)===String(id)); if(!local)return;
    let likes=Number(local.likes||0),dislikes=Number(local.dislikes||0),mine=reactionState(id);
    if(window.FPCloud?.fetchReaction){const remote=await window.FPCloud.fetchReaction(id);likes=Number(remote.likes||0);dislikes=Number(remote.dislikes||0);mine=remote.current||null;const states=readJSON('fp_reactions',{});if(mine)states[String(id)]=mine;else delete states[String(id)];writeJSON('fp_reactions',states);await updateArticle(id,{likes,dislikes});}
    document.querySelectorAll(`[data-reactions="${CSS.escape(String(id))}"]`).forEach(el=>{const lb=el.querySelector('[data-reaction="like"]');if(lb){lb.classList.toggle('active',mine==='like');lb.setAttribute('aria-pressed',String(mine==='like'));lb.querySelector('span').textContent=likes;}});
  }
  async function updateReaction(id,type){
    if(String(type) !== "like") return;
    if(String(type)!=='like') return;
    const articles=getAllLocalArticles(),article=articles.find(a=>String(a.id)===String(id));if(!article)return;
    const states=readJSON('fp_reactions',{}),key=String(id),previous=states[key]||null;
    if(window.FPCloud?.saveReaction){const remote=await window.FPCloud.saveReaction(id,type);if(!remote.ok){announce(remote.message||'Não foi possível registrar sua reação.');return;}if(remote.current)states[key]=remote.current;else delete states[key];writeJSON('fp_reactions',states);await updateArticle(id,{likes:Number(remote.likes||0),dislikes:Number(remote.dislikes||0)});await refreshReactionUI(id);return;}
    let likes=Number(article.likes||0),dislikes=Number(article.dislikes||0);if(previous===type){delete states[key];if(type==='like')likes=Math.max(0,likes-1);else dislikes=Math.max(0,dislikes-1);}else{if(previous==='like')likes=Math.max(0,likes-1);if(previous==='dislike')dislikes=Math.max(0,dislikes-1);states[key]=type;if(type==='like')likes++;else dislikes++;}writeJSON('fp_reactions',states);await updateArticle(id,{likes,dislikes});await refreshReactionUI(id);
  }
  function getPollVoterId(){ return String(getBrowserIdentity().id); }
  async function registerGlobalPollVote(articleId,pollIndex,selections){ if(window.FPCloud?.savePollVote) return window.FPCloud.savePollVote(articleId,pollIndex,selections); return false; }
  function localPollResults(articleId,pollIndex,optionCount){const raw=readJSON(`fp_poll_counts_${articleId}_${Number(pollIndex||0)}`,{count:0,options:[]});const options=Array.from({length:optionCount},(_,i)=>Number(Array.isArray(raw?.options)?raw.options[i]||0:0));return {total:Number(raw?.count||0),options};}
  function incrementLocalPollCount(articleId,pollIndex,selections){const key=`fp_poll_counts_${articleId}_${Number(pollIndex||0)}`,current=readJSON(key,{count:0,options:[]}),options=Array.isArray(current.options)?current.options.slice():[];(selections||[]).forEach(i=>options[Number(i)]=(Number(options[Number(i)]||0)+1));const next={count:Number(current?.count||0)+1,options};writeJSON(key,next);return next;}
  async function pollResults(articleId,pollIndex,optionCount){if(window.FPCloud?.fetchPollResults){const remote=await window.FPCloud.fetchPollResults(articleId,pollIndex);if(remote)return {total:Number(remote.total||0),options:Array.from({length:Number(optionCount||0)},(_,i)=>Number(remote.options?.[i]||0))};}return localPollResults(articleId,pollIndex,optionCount);}

  function bindPolls(scope=document){
    scope.querySelectorAll('[data-poll-id]').forEach(box=>{
      const pollKey=box.dataset.pollKey||`${box.dataset.pollId}:${box.dataset.pollIndex||0}`;
      const key=`fp_poll_${pollKey}`;let state=readJSON(key,{});if(!state||typeof state!=='object')state={};
      const buttons=[...box.querySelectorAll('[data-poll-option]')], submit=box.querySelector('[data-poll-submit]');
      const selectedValues=()=>box.dataset.pollKind==='multi'?Object.keys(state).filter(k=>state[k]).map(Number):(state.value!==undefined?[Number(state.value)]:[]);
      const hasSelection=()=>selectedValues().length>0;
      const paint=()=>{buttons.forEach(btn=>{const idx=btn.dataset.pollOption;const on=box.dataset.pollKind==='multi'?!!state[idx]:String(state.value??'')===String(idx);btn.classList.toggle('active',on);btn.setAttribute('aria-pressed',String(on));btn.disabled=!!state.submitted;});if(submit){submit.disabled=!!state.submitted||!hasSelection();submit.textContent=state.submitted?'Voto registrado':'Registrar voto';}};
      const updateStatus=(result=null)=>{const labels=JSON.parse(box.dataset.pollOptions||'[]'),chosen=selectedValues(),status=box.querySelector('.poll-status');if(!status)return;if(state.submitted){const details=chosen.map(i=>{const label=labels[i];const count=Number(result?.options?.[i]||0);return label?`${label} — ${count} ${count===1?'voto':'votos'}`:'';}).filter(Boolean);status.textContent=details.length?`Sua resposta: ${details.join(' · ')}.`:'Voto registrado neste navegador.';}else{const names=chosen.map(i=>labels[i]).filter(Boolean);status.textContent=names.length?`Selecionado: ${names.join(', ')}. Revise e registre seu voto.`:'Nenhuma opção selecionada.';}};
      buttons.forEach(btn=>btn.addEventListener('click',()=>{if(state.submitted)return;const kind=box.dataset.pollKind,idx=btn.dataset.pollOption;if(kind==='multi'){state[idx]=!state[idx];}else{state.value=idx;}try{localStorage.setItem(key,JSON.stringify(state));}catch(_){}paint();updateStatus();}));
      submit?.addEventListener('click',async()=>{if(state.submitted||!hasSelection())return;const selected=selectedValues();const saved=await registerGlobalPollVote(box.dataset.pollId,box.dataset.pollIndex,selected);if(fpCloudEnabled() && saved!==true && saved?.ok!==true){updateStatus();announce('Não foi possível registrar o voto. Tente novamente.');return;}state.submitted=true;try{localStorage.setItem(key,JSON.stringify(state));}catch(_){}if(!fpCloudEnabled())incrementLocalPollCount(box.dataset.pollId,box.dataset.pollIndex,selected);paint();const result=await refreshPollResults(box);updateStatus(result);});
      paint();updateStatus();refreshPollResults(box).then(result=>{if(state.submitted)updateStatus(result);});
    });
  }

  function bindReactionButtons(scope=document){scope.querySelectorAll('[data-reaction]').forEach(b=>b.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();const wrap=b.closest('[data-reactions]');if(wrap)updateReaction(wrap.dataset.reactions,b.dataset.reaction);}));}
  function readViewedArticleIds(){
    const local=readJSON('fp_viewed_articles',[]);
    let fromCookie=[];
    try{
      const raw=document.cookie.split(';').map(v=>v.trim()).find(v=>v.startsWith('fp_viewed_articles='));
      if(raw){const parsed=JSON.parse(decodeURIComponent(raw.slice('fp_viewed_articles='.length)));if(Array.isArray(parsed))fromCookie=parsed;}
    }catch(_){}
    return [...new Set([...(Array.isArray(local)?local:[]),...fromCookie.map(String)])];
  }
  function writeViewedArticleIds(ids){
    const unique=[...new Set((Array.isArray(ids)?ids:[]).map(String))].slice(-100);
    writeJSON('fp_viewed_articles',unique);
    try{document.cookie=`fp_viewed_articles=${encodeURIComponent(JSON.stringify(unique))}; Max-Age=31536000; Path=/; SameSite=Lax`;}catch(_){}
    return unique;
  }
  const viewRequestsInFlight = new Set();
  async function recordView(n){
    if(!n?.localArticle)return;
    const id=String(n.id);
    const viewed=readViewedArticleIds();
    if(viewed.includes(id) || viewRequestsInFlight.has(id))return;
    writeViewedArticleIds([...viewed,id]);
    viewRequestsInFlight.add(id);
    try{
      if(window.FPCloud?.incrementArticleView){
        const remote=await window.FPCloud.incrementArticleView(id);
        if(remote?.ok && Number.isFinite(Number(remote.views))){await updateArticle(id,{views:Number(remote.views)});}
        else{writeViewedArticleIds(viewed);}
      }else{
        const article=getAllLocalArticles().find(a=>String(a.id)===id);
        if(!article){writeViewedArticleIds(viewed);return;}
        const views=Number(article.views||0)+1;
        await updateArticle(id,{views});
      }
    }catch(_){writeViewedArticleIds(viewed);}
    finally{viewRequestsInFlight.delete(id);}
  }

  function initSuggestionsPage(){
    const f=$("suggestion-form");if(!f)return;
    const browserOwner=()=>`anonymous:${getBrowserIdentity().id}`;
    const sessionSnapshot=()=>readJSON(SESSION_KEY,null);
    let activeFirebaseUid='';
    let ownerPromise=null;
    const ownerKeyFor=uid=>uid?`user:${uid}`:browserOwner();
    const getActiveOwner=()=>{
      const session=sessionSnapshot();
      if(session?.uid)return {uid:String(session.uid),key:`user:${String(session.uid)}`,legacy:''};
      if(activeFirebaseUid)return {uid:String(activeFirebaseUid),key:`user:${String(activeFirebaseUid)}`,legacy:browserOwner()};
      return {uid:'',key:browserOwner(),legacy:browserOwner()};
    };
    const ensureSuggestionOwner=async()=>{
      if(ownerPromise)return ownerPromise;
      ownerPromise=(async()=>{
        const session=sessionSnapshot();
        if(session?.uid)return {uid:String(session.uid),key:`user:${String(session.uid)}`,legacy:''};
        if(fpCloudEnabled()){
          if(window.FPCloudReady){try{await window.FPCloudReady;}catch(_) {}}
          const user=await window.FPCloud.ensureAnonymousIdentity?.();
          if(user?.uid){
            activeFirebaseUid=String(user.uid);
            return {uid:activeFirebaseUid,key:`user:${activeFirebaseUid}`,legacy:browserOwner()};
          }
        }
        return {uid:'',key:browserOwner(),legacy:browserOwner()};
      })().catch(()=>getActiveOwner());
      return ownerPromise;
    };
    const cycleStart=iso=>{
      const now=new Date(iso||Date.now());
      const start=new Date(now);start.setHours(0,1,0,0);
      const day=start.getDay();
      const daysSinceSaturday=(day+1)%7;
      start.setDate(start.getDate()-daysSinceSaturday);
      if(now.getTime()<start.getTime())start.setDate(start.getDate()-7);
      return start.getTime();
    };
    const isOwnLocal=(item,owner)=>{
      if(!item)return false;
      const authorUid=String(item.authorUid||'');
      if(owner.uid&&authorUid===owner.uid)return true;
      const qOwner=String(item.quotaOwner||'');
      const bOwner=String(item.browserOwner||'');
      return qOwner===owner.key||Boolean(owner.legacy&&qOwner===owner.legacy)||bOwner===owner.key||Boolean(owner.legacy&&bOwner===owner.legacy);
    };
    const activeItem=item=>!['Arquivada','Retirada','Excluída'].includes(String(item?.status||''));
    const currentSuggestions=(owner=getActiveOwner())=>{
      const all=readJSON('fp_suggestions',[]);
      return (Array.isArray(all)?all:[]).filter(x=>isOwnLocal(x,owner)&&activeItem(x)).sort((a,b)=>new Date(b.createdAt||0)-new Date(a.createdAt||0));
    };
    const usedThisCycleCount=(owner=getActiveOwner())=>{
      const start=cycleStart(), all=readJSON('fp_suggestions',[]);
      return (Array.isArray(all)?all:[]).filter(x=>isOwnLocal(x,owner)&&activeItem(x)&&x.quotaConsumed!==false&&new Date(x.createdAt||0).getTime()>=start).length;
    };
    const suggestionErrorMessage=(error,fallback)=>{const msg=String(error?.message||'').trim();if(error?.code==='permission-denied'||(/permissions/i.test(msg)&&/insufficient/i.test(msg)))return '';return msg||fallback||'';};

    const mergeOwnSuggestions=(remoteItems,owner)=>{
      const remote=Array.isArray(remoteItems)?remoteItems:[];
      const remoteMap=new Map(remote.map(item=>[String(item.id),item]));
      const all=readJSON('fp_suggestions',[]);
      const source=Array.isArray(all)?all:[];
      let changed=false;
      const next=[];
      source.forEach(item=>{
        if(!isOwnLocal(item,owner)){next.push(item);return;}
        const remoteItem=remoteMap.get(String(item?.id||''));
        if(!remoteItem || !activeItem(remoteItem)){changed=true;return;}
        const merged={...item,...remoteItem,authorUid:owner.uid||item.authorUid||'',quotaOwner:owner.key,browserOwner:item.browserOwner||remoteItem.browserOwner||browserOwner()};
        next.push(merged);
        if(JSON.stringify(merged)!==JSON.stringify(item))changed=true;
        remoteMap.delete(String(item.id));
      });
      for(const remoteItem of remoteMap.values()){
        if(!activeItem(remoteItem))continue;
        next.push({...remoteItem,authorUid:owner.uid||remoteItem.authorUid||'',quotaOwner:owner.key,browserOwner:remoteItem.browserOwner||browserOwner()});
        changed=true;
      }
      if(changed||JSON.stringify(next)!==JSON.stringify(source))writeJSON('fp_suggestions',next);
      return changed;
    };

    async function reconcileVisitorSuggestions(){
      const owner=await ensureSuggestionOwner();
      if(!fpCloudEnabled()||!owner.uid)return false;
      const result=await window.FPCloud.fetchOwnSuggestions?.();
      if(!result?.ok)return false;
      return mergeOwnSuggestions(result.items,owner);
    }

    let stopOwnSuggestionListener=()=>{};
    let ownSuggestionListenerStarted=false;
    function startOwnSuggestionListener(){
      if(ownSuggestionListenerStarted||!fpCloudEnabled()||!window.FPCloud.listenOwnSuggestions)return;
      ownSuggestionListenerStarted=true;
      stopOwnSuggestionListener=window.FPCloud.listenOwnSuggestions(async items=>{
        const owner=await ensureSuggestionOwner();
        if(!owner.uid)return;
        mergeOwnSuggestions(items,owner);
        void refreshMine();
      });
    }

    const refreshMine=async()=>{
      const owner=await ensureSuggestionOwner();
      await reconcileVisitorSuggestions();
      let panel=$("suggestion-my-entry");
      if(!panel){panel=document.createElement('section');panel.id='suggestion-my-entry';panel.className='panel-surface mt-4 p-5';f.insertAdjacentElement('afterend',panel);}
      const items=currentSuggestions(owner),used=Math.min(1,usedThisCycleCount(owner));
      const submit=f.querySelector('[type="submit"]');
      if(submit){submit.disabled=used>=1;submit.textContent=used>=1?'Enviado':'Enviar sugestão';submit.removeAttribute('aria-busy');}
      if(!items.length){panel.classList.add('hidden');return;}
      panel.classList.remove('hidden');
      panel.innerHTML=`<div class="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3"><div><p class="text-[11px] font-extrabold uppercase tracking-wide text-[#2E7D32] dark:text-[#81C784]">Sua participação</p><h2 class="mt-1 text-base font-extrabold">Suas sugestões deste ciclo</h2></div><span class="rounded-full bg-[#F2F7F3] px-2.5 py-1 text-[11px] font-bold text-[#1B5E20] dark:bg-[#2D382E] dark:text-[#81C784]">${used}/1 usada</span></div><div class="mt-4 grid gap-3">${items.map(item=>`<article class="rounded-xl border border-slate-200 p-4 dark:border-slate-700"><strong class="block text-sm">${escapeHTML(item.subject||'Sugestão')}</strong><p class="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-400">${escapeHTML(item.text)}</p><div class="mt-3">${item.requiresEditorialWithdrawal?'<p class="text-xs leading-5 text-slate-500 dark:text-slate-400">A pauta foi enviada. Neste navegador não há sessão autenticada para confirmar uma retirada; para removê-la, solicite à redação.</p>':`<button type="button" class="btn-neutral rounded-lg px-3 py-2.5 text-sm font-bold" data-withdraw-my-suggestion="${escapeHTML(item.id)}">Retirar sugestão</button>`}</div></article>`).join('')}</div>`;
      panel.querySelectorAll('[data-withdraw-my-suggestion]').forEach(btn=>btn.onclick=async()=>{
        const item=currentSuggestions(owner).find(x=>String(x.id)===String(btn.dataset.withdrawMySuggestion));if(!item)return;
        if(!confirm('Retirar esta sugestão da pauta? A vaga deste ciclo será liberada.'))return;
        if(btn.dataset.busy==='1')return;
        btn.dataset.busy='1';btn.disabled=true;
        try{
          const activeOwner=await ensureSuggestionOwner();
          if(!isOwnLocal(item,activeOwner))throw new Error('not-owner');
          if(fpCloudEnabled()){
            const result=await window.FPCloud.deleteSuggestion?.(item.id);
            if(!result?.ok)throw new Error(result?.code||result?.message||'delete-failed');
          }
          const all=readJSON('fp_suggestions',[]),next=(Array.isArray(all)?all:[]).filter(x=>String(x?.id)!==String(item.id));
          if(!writeJSON('fp_suggestions',next))throw new Error('local-failed');
          window.dispatchEvent(new CustomEvent('fp:suggestions-updated'));
          $("suggestion-status").textContent='Sugestão retirada. A vaga deste ciclo foi liberada.';
          await refreshMine();
        }catch(error){
          btn.disabled=false;delete btn.dataset.busy;
          const messages={'permission-denied':'Não foi possível retirar a sugestão nesta sessão.','delete-failed':'Não foi possível retirar a sugestão agora.','local-failed':'Não foi possível atualizar a participação neste dispositivo.','session':'Não foi possível confirmar a sessão anônima. Recarregue a página e tente novamente.','not-owner':'Esta sugestão não pertence à sessão atual.'};
          $("suggestion-status").textContent=messages[String(error?.message||'')]||'Não foi possível retirar a sugestão agora.';
          if(error)console.warn('[Folha do Paiquerê] falha ao retirar sugestão:',error);
        }
      });
    };

    if(f.dataset.bound!=="1"){
      f.dataset.bound="1";
      f.addEventListener("submit",async e=>{
        e.preventDefault();
        if(f.dataset.busy==="1")return;
        const subject=$("suggestion-subject")?.value.trim(),text=$("suggestion-text")?.value.trim(),name=$("suggestion-name")?.value.trim();
        if(!text)return;
        const status=$("suggestion-status"),submit=f.querySelector('[type="submit"]');
        f.dataset.busy="1"; if(submit){submit.disabled=true;submit.setAttribute('aria-busy','true');}
        try{
          const owner=await ensureSuggestionOwner();
          const all=readJSON("fp_suggestions",[]);
          const used=usedThisCycleCount(owner);
          if(used>=1){const prior=currentSuggestions(owner)[0];status.textContent=prior?.requiresEditorialWithdrawal?"Você já enviou sua 1 sugestão deste ciclo. Como esta pauta não está vinculada a uma sessão autenticada, peça à redação para retirá-la. O próximo ciclo começa sábado às 00:01.":"Você já usou sua 1 sugestão deste ciclo. Retire a sugestão para liberar a vaga. O próximo ciclo começa sábado às 00:01.";return;}
          const item={id:`suggestion_${Date.now()}_${Math.random().toString(36).slice(2,7)}`,subject:subject||"Sugestão",text,name:name||"",attachments:[],quotaOwner:owner.key,browserOwner:browserOwner(),createdAt:new Date().toISOString(),status:"Novo",anonymous:!name,editedAt:null,quotaConsumed:true};
          if(fpCloudEnabled()){
            // O Firebase Authentication anônimo melhora o vínculo de autoria, mas não é
            // obrigatório para criar uma pauta: as Firestore Rules permitem create público.
            // Se a autenticação anônima estiver desativada/indisponível, mantém-se a
            // identidade local do navegador e tenta-se gravar a pauta normalmente.
            const authorUid=String(owner.uid||window.FPCloud.getAuthUser?.()?.uid||'');
            if(authorUid){
              item.authorUid=String(authorUid);
              item.quotaOwner=`user:${String(authorUid)}`;
            }else{
              // Sem UID, a redação ainda poderá consultar/remover a pauta, mas a
              // exclusão pelo visitante não deve parecer disponível quando as regras
              // exigem uma sessão autenticada para validar a autoria.
              item.requiresEditorialWithdrawal=true;
            }
            const ok=await window.FPCloud.saveSuggestion?.(item.id,{...item,updatedAt:new Date().toISOString()});
            if(!(ok===true||ok?.ok===true))throw new Error(ok?.code||ok?.message||'save-failed');
          }
          all.push(item);
          if(!writeJSON("fp_suggestions",all))throw new Error('local-failed');
          f.reset();
          if(submit){submit.textContent='Enviado';submit.disabled=true;submit.removeAttribute('aria-busy');}
          status.textContent='Sugestão enviada.';
          window.dispatchEvent(new CustomEvent('fp:suggestions-updated'));
          await refreshMine();
        }catch(error){
          if(submit){submit.disabled=false;submit.removeAttribute('aria-busy');}
          status.textContent=suggestionErrorMessage(error,'');
          if(error)console.warn('[Folha do Paiquerê] falha ao registrar sugestão:',error);
        }finally{delete f.dataset.busy;}
      });
    }
    startOwnSuggestionListener();
    void refreshMine();
    window.addEventListener('focus',()=>void refreshMine());
    window.addEventListener('pageshow',()=>void refreshMine());
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)void refreshMine();});
  }

  function initAchievementsPage(){
    const grid=$("achievements-grid");if(!grid)return;
    const search=$("achievement-public-search"),sort=$("achievement-public-sort"),year=$("achievement-public-year"),yearChips=$("achievement-year-chips");
    if(!grid.dataset.fpImageFallbackBound){grid.dataset.fpImageFallbackBound='1';grid.addEventListener('error',event=>{const img=event.target;if(!(img instanceof HTMLImageElement)||!img.matches('.achievement-media img'))return;const fallback=document.createElement('div');fallback.className='achievement-placeholder';fallback.textContent='★';img.replaceWith(fallback);},true);}
    const getYears=()=>[...new Set(readJSON('fp_achievements',[]).filter(a=>a&&a.visible!==false).map(achievementYearValue).filter(v=>/^\d{4}$/.test(v)))].sort((a,b)=>Number(b)-Number(a));
    const fillYears=()=>{if(!year)return;const selected=year.value||'all',ys=getYears();year.innerHTML='<option value="all">Todos os anos</option>'+ys.map(y=>`<option value="${escapeHTML(y)}">${escapeHTML(y)}</option>`).join('');year.value=selected==='all'||ys.includes(selected)?selected:'all';if(yearChips){const values=['all',...ys];yearChips.innerHTML=values.map(v=>`<button type="button" class="achievement-year-chip${year.value===v?' is-active':''}" data-achievement-year="${escapeHTML(v)}" aria-pressed="${String(year.value===v)}">${v==='all'?'Todos os anos':escapeHTML(v)}</button>`).join('');}};
    const syncYearChips=()=>{if(!yearChips||!year)return;yearChips.querySelectorAll('[data-achievement-year]').forEach(button=>{const active=button.dataset.achievementYear===(year.value||'all');button.classList.toggle('is-active',active);button.setAttribute('aria-pressed',String(active));});};
    const render=()=>{let items=readJSON("fp_achievements",[]).filter(x=>x.visible!==false).slice();const q=String(search?.value||"").toLocaleLowerCase("pt-BR").trim(),yv=year?.value||"all";items=items.filter(a=>{const people=creditNames(a.credits).join(" ");const hay=`${a.name||""} ${a.title||""} ${a.description||""} ${a.details||""} ${(a.types||[a.type||""]).join(" ")} ${people}`.toLocaleLowerCase("pt-BR");return (!q||hay.includes(q))&&(yv==='all'||achievementYearValue(a)===yv);});const mode=sort?.value||"recent";items.sort((a,b)=>mode==='oldest'?(achievementSortTimestamp(a)-achievementSortTimestamp(b)):achievementSortTimestamp(b)-achievementSortTimestamp(a));grid.innerHTML=items.length?items.map(a=>`<article class="achievement-card"><div class="achievement-media">${a.image?imageCropMarkup(a.image,a.imageCrop,a.title||a.name||"Conquista da escola",'','lazy'):`<div class="achievement-placeholder">${escapeHTML((a.name||"★").slice(0,1).toUpperCase())}</div>`}</div><div class="p-4"><p class="text-xs font-extrabold uppercase tracking-wide text-[#2E7D32] dark:text-[#81C784]">${escapeHTML((Array.isArray(a.types)&&a.types.length?a.types:[a.type||"Conquista"]).join(" · "))}</p><h2 class="mt-1 text-lg font-extrabold">${escapeHTML(a.title||a.name||"Conquista")}</h2><p class="mt-1 text-sm font-semibold text-slate-500 dark:text-slate-400">${escapeHTML(a.name||"")} · ${escapeHTML(achievementDateLabel(a))}</p>${a.description?`<p class="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-400">${escapeHTML(a.description)}</p>`:""}<button type="button" class="fp-achievement-open-details mt-4" data-achievement-details="${escapeHTML(a.id)}">Ver conquista <span aria-hidden="true">→</span></button>${achievementCreditMarkup(a)}</div></article>`).join(""):`<div class="col-span-full rounded-2xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500 dark:border-slate-700">Nenhuma conquista corresponde à pesquisa.</div>`;syncYearChips();};
    fillYears();render();search?.addEventListener('input',render);sort?.addEventListener('change',render);year?.addEventListener('change',render);yearChips?.addEventListener('click',event=>{const button=event.target.closest('[data-achievement-year]');if(!button||!year)return;year.value=button.dataset.achievementYear||'all';render();});
    grid.addEventListener('click',e=>{const b=e.target.closest('[data-achievement-details]');if(!b)return;const a=readJSON('fp_achievements',[]).find(x=>String(x.id)===String(b.dataset.achievementDetails));if(!a)return;let modal=document.getElementById('achievement-details-modal');if(!modal){modal=document.createElement('div');modal.id='achievement-details-modal';modal.className='fp-public-detail-backdrop fixed inset-0 z-[10030] hidden items-center justify-center bg-black/60 p-3 sm:p-6';modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');modal.setAttribute('aria-labelledby','achievement-details-title');modal.innerHTML='<article class="fp-public-detail-modal fp-achievement-detail-modal"><button type="button" class="fp-public-detail-close" data-detail-modal-close aria-label="Fechar conquista">×</button><div class="fp-public-detail-content"><p class="fp-public-detail-kicker">Conquista da comunidade</p><h2 id="achievement-details-title"></h2><div id="achievement-details-body"></div></div></article>';document.body.appendChild(modal);bindPublicDetailModal(modal);}modal.querySelector('#achievement-details-title').textContent=a.title||a.name||'Conquista';modal.querySelector('#achievement-details-body').innerHTML=achievementDetailsMarkup(a);modal.classList.remove('hidden');modal.classList.add('flex');modal.querySelector('[data-detail-modal-close]')?.focus({preventScroll:true});});
    window.addEventListener('storage',e=>{if(e.key==='fp_achievements'){fillYears();render();}});window.addEventListener('fp:achievements-updated',()=>{fillYears();render();setTimeout(focusAchievementFromHash,0);});
    if(window.FPCloud?.fetchAchievements){window.FPCloud.fetchAchievements().then(items=>{if(Array.isArray(items)){const local=readJSON('fp_achievements',[]),map=new Map((local||[]).filter(x=>x?.id).map(x=>[String(x.id),x]));items.forEach(x=>{if(x?.id)map.set(String(x.id),{...(map.get(String(x.id))||{}),...x});});writeJSON('fp_achievements',[...map.values()]);window.dispatchEvent(new CustomEvent('fp:achievements-updated'));}}).catch(()=>{});}
    const focusAchievementFromHash=()=>{const hash=String(location.hash||'');const id=hash.startsWith('#achievement-')?decodeURIComponent(hash.slice('#achievement-'.length)):'';if(!id)return;const btn=grid.querySelector(`[data-achievement-details="${CSS.escape(id)}"]`);if(btn){btn.click();return;}const cardEl=[...grid.querySelectorAll('.achievement-card')].find(card=>String(card.querySelector('[data-achievement-details]')?.dataset.achievementDetails||'')===id);cardEl?.scrollIntoView({behavior:'smooth',block:'center'});};setTimeout(focusAchievementFromHash,0);window.addEventListener('hashchange',focusAchievementFromHash);
  }
  // ---- Accessibility ----
  let fontScale=Number(localStorage.getItem('fp-font-scale') ?? '0');
  if(!Number.isFinite(fontScale))fontScale=0;
  fontScale=Math.min(3,Math.max(-2,Math.trunc(fontScale)));
  let manualTheme=localStorage.getItem('theme'); let reading=false, queue=[], speechIndex=0;
  const html=document.documentElement;
  function announce(m){ const el=$('accessibility-status'); if(el)el.textContent=m; }
  function applyFontScale(next,say=true){fontScale=Math.min(3,Math.max(-2,next));html.dataset.fontScale=String(fontScale);html.style.fontSize=`${100+fontScale*10}%`;localStorage.setItem('fp-font-scale',String(fontScale));if($('font-decrease'))$('font-decrease').disabled=fontScale<=-2;if($('font-increase'))$('font-increase').disabled=fontScale>=3;if(say)announce(`Tamanho do texto ajustado para ${100+fontScale*10} por cento.`);}
  function applyTheme(t,persist=false,say=true){const dark=t==='dark';html.classList.toggle('dark',dark);html.style.colorScheme=dark?'dark':'light';if($('theme-icon'))$('theme-icon').textContent=dark?'☀️':'🌙';if($('theme-label'))$('theme-label').textContent=dark?'Modo claro':'Modo escuro';if($('theme-toggle'))$('theme-toggle').setAttribute('aria-label',dark?'Alternar para modo claro':'Alternar para modo escuro');if(persist){manualTheme=t;localStorage.setItem('theme',t);}if(say)announce(dark?'Modo escuro ativado.':'Modo claro ativado.');}
  function setupAccessibility(){
    $('font-decrease')?.addEventListener('click',()=>applyFontScale(fontScale-1));
    $('font-increase')?.addEventListener('click',()=>applyFontScale(fontScale+1));
    $('theme-toggle')?.addEventListener('click',()=>{const next=html.classList.contains('dark')?'light':'dark';manualTheme=next;localStorage.setItem('theme',next);localStorage.setItem('fp_theme_manual','1');applyTheme(next,false,true);window.dispatchEvent(new CustomEvent('fp:theme-updated',{detail:next}));});
    if(!document.documentElement.dataset.fpSpeechBound){document.documentElement.dataset.fpSpeechBound='1';document.addEventListener('click',e=>{const button=e.target.closest?.('#speech-toggle');if(!button)return;e.preventDefault();reading?stopReading():startReading();});}
    applyFontScale(fontScale,false);
    const autoTheme=()=>{const h=new Date().getHours();return (h>=18||h<6)?'dark':'light';};
    const stored=localStorage.getItem('theme'),manual=localStorage.getItem('fp_theme_manual')==='1';
    applyTheme(manual&&(stored==='dark'||stored==='light')?stored:autoTheme(),false,false);
    let lastHour=new Date().getHours();
    setInterval(()=>{const h=new Date().getHours();if(h!==lastHour){lastHour=h;if(localStorage.getItem('fp_theme_manual')!=='1')applyTheme(autoTheme(),false,false);}},30000);
    window.addEventListener('storage',e=>{if(e.key==='theme'&&(e.newValue==='dark'||e.newValue==='light'))applyTheme(e.newValue,false,false);});
    window.addEventListener('fp:theme-updated',e=>{if(e.detail==='dark'||e.detail==='light')applyTheme(e.detail,false,false);});
  }
  function mainText(){const article=document.querySelector('#single-container article');if(!article)return '';const parts=[article.querySelector('h1')?.innerText,article.querySelector('header p.text-lg')?.innerText,article.querySelector('.prose-folha')?.innerText].filter(Boolean);return parts.join(' ').replace(/\s+/g,' ').trim();}
  function voices(){return 'speechSynthesis' in window?speechSynthesis.getVoices():[];}
  function chooseVoice(){const vs=voices();return vs.find(v=>/^pt-BR$/i.test(v.lang))||vs.find(v=>/^pt/i.test(v.lang))||null;}
  function chunkText(text){const s=text.match(/[^.!?]+[.!?]+|[^.!?]+$/g)||[text];const out=[];let cur='';for(const part of s){const c=part.trim();if(!c)continue;if((cur+' '+c).trim().length<=240)cur=(cur+' '+c).trim();else{if(cur)out.push(cur);cur=c;}}if(cur)out.push(cur);return out;}
  function updateSpeech(){const b=$('speech-toggle');if(!b)return;b.setAttribute('aria-pressed',String(reading));b.setAttribute('aria-label',reading?'Parar leitura da matéria':'Ouvir matéria');if($('speech-icon'))$('speech-icon').textContent=reading?'⏹️':'🔊';if($('speech-label'))$('speech-label').textContent=reading?'Parar leitura':'Ouvir matéria';}
  function stopReading(){if('speechSynthesis'in window)speechSynthesis.cancel();reading=false;queue=[];speechIndex=0;updateSpeech();announce('Leitura da matéria interrompida.');}
  function nextSpeech(){if(!reading||speechIndex>=queue.length){const had=queue.length>0;reading=false;queue=[];speechIndex=0;updateSpeech();if(had)announce('Leitura da página concluída.');return;}const u=new SpeechSynthesisUtterance(queue[speechIndex++]);const v=chooseVoice();if(v)u.voice=v;u.lang='pt-BR';u.rate=.95;u.onend=nextSpeech;u.onerror=()=>stopReading();speechSynthesis.speak(u);}
  function startReading(){if(!('speechSynthesis'in window))return announce('Seu navegador não oferece leitura por voz.');const t=mainText();if(!t)return announce('Não foi encontrado texto principal para leitura.');speechSynthesis.cancel();queue=chunkText(t);speechIndex=0;reading=true;updateSpeech();announce('Iniciando leitura em português do Brasil.');nextSpeech();}

  function initMenu(){const b=$('mobile-menu-toggle'),m=$('mobile-menu');if(!b||!m)return;const set=o=>{m.classList.toggle('hidden',!o);b.setAttribute('aria-expanded',String(o));b.setAttribute('aria-label',o?'Fechar menu':'Abrir menu');b.textContent=o?'✕':'☰';};b.addEventListener('click',()=>set(b.getAttribute('aria-expanded')!=='true'));m.querySelectorAll('a').forEach(a=>a.addEventListener('click',()=>set(false)));window.addEventListener('resize',()=>{if(innerWidth>=768)set(false);});}

  function badge(cat){return displayTags(cat).map(t=>`<span class="inline-flex rounded-full bg-[#E8F2E9] px-2.5 py-1 text-xs font-bold text-[#1B5E20] dark:bg-[#2D382E] dark:text-[#81C784]">${escapeHTML(t)}</span>`).join(' ');}
  function typeBadge(n){return n?.contentType==='entretenimento'?`<span class="inline-flex rounded-full bg-[#F2F7F3] px-2.5 py-1 text-xs font-bold text-[#1B5E20] dark:bg-[#2D382E] dark:text-[#81C784]">Cantinho Criativo${n.creativeType?` · ${escapeHTML(n.creativeType)}`:''}</span>`:'';}
  const publicCommentCountCache = new Map();
  const publicCommentCountRequests = new Map();
  function localPublicCommentCount(articleId){
    const rows=readJSON('fp_comments',[]);
    return Array.isArray(rows)?rows.filter(x=>String(x?.articleId||'')===String(articleId)&&x?.visible!==false).length:0;
  }
  function setPublicCommentCount(articleId,count){
    const key=String(articleId||'');
    if(!key)return;
    const safeCount=Math.max(0,Number(count)||0);
    publicCommentCountCache.set(key,safeCount);
    document.querySelectorAll('[data-comment-count-for]').forEach(el=>{
      if(String(el.dataset.commentCountFor)===key)el.textContent=String(safeCount);
    });
    const rail=document.getElementById('news-action-comments-count');
    if(rail&&String(rail.dataset.commentCountFor)===key)rail.textContent=String(safeCount);
  }
  function publicCommentCount(articleId){
    const key=String(articleId||'');
    return publicCommentCountCache.has(key)?publicCommentCountCache.get(key):localPublicCommentCount(key);
  }
  function hydratePublicCommentCounts(scope=document){
    const nodes=[...(scope?.querySelectorAll?.('[data-comment-count-for]')||[])];
    const keys=[...new Set(nodes.map(el=>String(el.dataset.commentCountFor||'')).filter(Boolean))];
    keys.forEach(key=>{
      const local=publicCommentCount(key);
      nodes.filter(el=>String(el.dataset.commentCountFor)===key).forEach(el=>el.textContent=String(local));
      if(publicCommentCountCache.has(key)||publicCommentCountRequests.has(key)||typeof window.FPCloud?.fetchComments!=='function')return;
      const request=Promise.resolve().then(()=>window.FPCloud.fetchComments(key)).then(rows=>{
        if(Array.isArray(rows))setPublicCommentCount(key,rows.filter(x=>x&&x.visible!==false).length);
      }).catch(()=>{}).finally(()=>publicCommentCountRequests.delete(key));
      publicCommentCountRequests.set(key,request);
    });
  }

  function publicCoverImageElementMarkup(n,alt=''){
    const src=String(n?.image||'').trim(); if(!src)return '';
    const c=normalizedCropRect(n?.coverCrop);
    if(!c)return `<img src="${escapeHTML(src)}" alt="${escapeHTML(alt)}" loading="eager">`;
    return `<span class="fp-crop-image-window fp-cover-crop-window"><img src="${escapeHTML(src)}" alt="${escapeHTML(alt)}" loading="eager" style="width:${100/c.width}%!important;height:${100/c.height}%!important;left:${-c.x/c.width*100}%!important;top:${-c.y/c.height*100}%!important;max-width:none!important;max-height:none!important;object-fit:fill!important;"></span>`;
  }
  function publicCoverMediaMarkup(n, className='fp-public-article-media', alt=''){
    const src=String(n?.image||'').trim();
    if(!src)return `<span class="${className}" aria-hidden="true"><span class="fp-public-media-placeholder"></span></span>`;
    const c=normalizedCropRect(n?.coverCrop);
    // Invalid/legacy crop metadata is not allowed to offset the image outside its frame.
    // Fall back to the standard cover image instead of rendering an empty-looking card.
    const image=c?`<span class="fp-crop-image-window"><img src="${escapeHTML(src)}" alt="${escapeHTML(alt)}" loading="lazy" style="width:${100/c.width}%!important;height:${100/c.height}%!important;left:${-c.x/c.width*100}%!important;top:${-c.y/c.height*100}%!important;max-width:none!important;max-height:none!important;object-fit:fill!important;"></span>`:`<img src="${escapeHTML(src)}" alt="${escapeHTML(alt)}" loading="lazy">`;
    return `<a href="noticia-single.html?id=${encodeURIComponent(n.id)}" class="${className}" aria-label="Ler ${escapeHTML(n.title||'matéria')}">${image}</a>`;
  }
  function card(n){
    const href=`noticia-single.html?id=${encodeURIComponent(n.id)}`;
    const categories=displayTags(articleCategoryValues(n));
    const categoryMarkup=categories.map(tag=>`<span class="fp-public-card-category">${escapeHTML(tag)}</span>`).join('');
    const dateLabel=publicDateLabel(n);
    const views=Number(n.views||0);
    const highlighted=isEditorialHighlight(n.editorialHighlight)||isEditorialHighlight(n.featured)||isEditorialHighlight(n.isFeatured)||isEditorialHighlight(n.sourceArticle?.editorialHighlight)||isEditorialHighlight(n.sourceArticle?.featured)||isEditorialHighlight(n.sourceArticle?.isFeatured);
    const imageMarkup=n.image?publicCoverMediaMarkup(n,'fp-public-article-media',`Capa: ${n.title||''}`):`<a href="${href}" class="fp-public-article-media" aria-label="Ler ${escapeHTML(n.title)}"><img src="data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%27800%27 height=%27500%27%3E%3Crect width=%27100%25%27 height=%27100%25%27 fill=%27%23dceaf8%27/%3E%3C/svg%3E" alt="" loading="lazy"></a>`;
    const summary=String(n.excerpt||'Matéria publicada pela redação estudantil.').trim();
    const isNewsFeed=document.body.classList.contains('fp-news-feed-page');
    const categoriesRow=`<div class="fp-public-article-categories">${highlighted?'<span class="fp-editorial-highlight-badge">Destaques</span>':''}${categoryMarkup}</div>`;
    const dateRow=`<div class="fp-public-article-date"><time datetime="${escapeHTML(n.isoDate||'')}">${escapeHTML(dateLabel)}</time><span aria-hidden="true">•</span><span class="reading-time">${escapeHTML(readingTime(n))}</span></div>`;
    const interactions=`<div class="fp-public-article-interactions">${reactionMarkup(n,true)}<a class="fp-public-icon-link" href="${href}#news-comments" aria-label="Abrir comentários"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8a2.5 2.5 0 0 1-2.5 2.5H10l-5.5 4v-4.6A2.5 2.5 0 0 1 4 13.5z"/></svg><span class="fp-public-comment-count" data-comment-count-for="${escapeHTML(n.id)}">${publicCommentCount(n.id)}</span><span class="sr-only">Comentários</span></a><span class="fp-public-views" aria-label="${views.toLocaleString('pt-BR')} visualizações"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 12s3.3-6 9.5-6 9.5 6 9.5 6-3.3 6-9.5 6-9.5-6-9.5-6Z"/><circle cx="12" cy="12" r="2.7"/></svg><span>${views.toLocaleString('pt-BR')}</span></span></div>`;
    const readLink=`<a href="${href}" class="fp-public-read-link${n.__profileCard?' profile-reading-link':''}">Ler matéria <span aria-hidden="true">→</span></a>`;
    const meta=isNewsFeed?`<div class="fp-public-article-meta">${categoriesRow}</div>`:`<div class="fp-public-article-meta">${categoriesRow}${dateRow}</div>`;
    return `<article class="fp-public-article-card group ${n.__profileCard?'fp-profile-related-card':''}">
      ${imageMarkup}
      <div class="fp-public-article-body">
        ${meta}
        <h3 class="fp-public-article-title"><a href="${href}">${escapeHTML(n.title)}</a></h3>
        <p class="fp-public-article-summary">${escapeHTML(summary)}</p>
        ${isNewsFeed?dateRow:''}
        <div class="fp-public-article-footer">${isNewsFeed?`${readLink}${interactions}`:`${interactions}${readLink}`}</div>
      </div>
    </article>`;
  }


  function initVisitorWelcome(){
    const panel=$('visitor-welcome'),form=$('visitor-display-name-form'),input=$('visitor-display-name');
    if(!panel||!form||!input)return;
    const title=$('visitor-welcome-title'),description=$('visitor-welcome-description');
    const progress=$('visitor-welcome-progress'),progressBar=$('visitor-welcome-progress-bar');
    const stepNumber=$('visitor-welcome-step-number'),nextButton=$('visitor-welcome-next');
    const nextWrap=$('visitor-welcome-next-wrap'),skipName=$('visitor-welcome-skip'),dismiss=$('visitor-welcome-dismiss');
    const status=$('visitor-display-name-status');
    const steps=[
      {title:'O que é este site?',description:'A Folha do Paiquerê é o jornal digital da comunidade escolar, criado para reunir notícias, projetos e histórias da escola em um só lugar.'},
      {title:'O que você encontrará?',description:'Notícias, eventos, projetos, conquistas e produções da comunidade escolar. Você também pode sugerir pautas e comentar as matérias publicadas.'},
      {title:'Cadastre seu nome',description:'Opcional: seu nome poderá aparecer quando você comentar. Ele fica salvo somente neste navegador; em outro navegador, você poderá escolher um nome diferente.'}
    ];
    try{input.value=String(localStorage.getItem('fp_comment_display_name')||'').slice(0,80);}catch(_){}
    const complete=()=>{
      try{localStorage.setItem('fp_welcome_seen','1');}catch(_){}
      panel.classList.add('hidden');panel.classList.remove('flex');panel.setAttribute('aria-hidden','true');
      const returnFocus=[...document.querySelectorAll('header a[href="index.html"], [aria-label="Navegação principal"] a[href="index.html"], header nav a')].find(el=>el.getClientRects().length>0);
      returnFocus?.focus?.({preventScroll:true});
    };
    let seen=false;
    try{seen=localStorage.getItem('fp_welcome_seen')==='1';}catch(_){}
    if(seen){panel.classList.add('hidden');panel.classList.remove('flex');return;}
    let currentStep=0;
    const paintStep=()=>{
      const step=steps[currentStep];
      title.textContent=step.title;description.textContent=step.description;
      progress.textContent=`${currentStep+1} de ${steps.length}`;
      progressBar.style.width=`${((currentStep+1)/steps.length)*100}%`;
      stepNumber.textContent=String(currentStep+1).padStart(2,'0');
      const naming=currentStep===2;
      form.classList.toggle('hidden',!naming);
      nextWrap.classList.toggle('hidden',naming);
      description.classList.toggle('hidden',false);
      if(status)status.textContent='';
      panel.setAttribute('aria-labelledby','visitor-welcome-title');
      if(naming){input.focus({preventScroll:true});}
      else nextButton?.focus({preventScroll:true});
    };
    panel.classList.remove('hidden');panel.classList.add('flex');panel.setAttribute('aria-hidden','false');
    paintStep();
    panel.addEventListener('keydown',event=>{
      if(event.key==='Escape'){event.preventDefault();complete();return;}
      if(event.key!=='Tab')return;
      const focusable=[...panel.querySelectorAll('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),a[href],[tabindex]:not([tabindex="-1"])')].filter(el=>!el.closest('.hidden')&&el.getClientRects().length>0);
      if(!focusable.length)return;
      const first=focusable[0],last=focusable[focusable.length-1];
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
    });
    nextButton?.addEventListener('click',()=>{if(currentStep<steps.length-1){currentStep++;paintStep();}});
    dismiss?.addEventListener('click',()=>complete());
    form.addEventListener('submit',event=>{
      event.preventDefault();
      const name=String(input.value||'').trim().slice(0,80);
      try{
        if(name)localStorage.setItem('fp_comment_display_name',name);
        else localStorage.removeItem('fp_comment_display_name');
      }catch(_){if(status)status.textContent='Não foi possível salvar neste navegador. Você ainda pode continuar sem nome.';return;}
      complete();
    });
    skipName?.addEventListener('click',()=>{
      if(!input.value.trim()){try{localStorage.removeItem('fp_comment_display_name');}catch(_){}}
      complete();
    });
  }

  let homeCarouselSlides=[];
  let homeCarouselIndex=0;
  let homeCarouselTimer=null;
  let homeCarouselPaused=false;
  let homeCarouselCurrentKey='';

  function publicDateTime(value){
    if(value==null||value==='')return 0;
    if(typeof value==='number')return Number.isFinite(value)?value:0;
    if(typeof value==='object'){
      if(typeof value.toDate==='function'){const n=value.toDate().getTime();return Number.isFinite(n)?n:0;}
      if(Number.isFinite(Number(value.seconds)))return Number(value.seconds)*1000;
    }
    const parsed=Date.parse(String(value));return Number.isFinite(parsed)?parsed:0;
  }
  function publicDateLabel(item){
    const raw=item?.isoDate||item?.approvedAt||item?.publishedAt||item?.createdAt||item?.updatedAt||item?.date;
    const stamp=publicDateTime(raw);return stamp?new Date(stamp).toLocaleDateString('pt-BR',{day:'2-digit',month:'short',year:'numeric'}):String(item?.date||'');
  }
  function achievementTimestamp(item){const exact=achievementSortTimestamp(item);if(exact)return exact;const year=achievementYearValue(item);return year?Date.parse(`${year}-01-01T12:00:00`):0;}
  function sortPublicNews(items){return [...items].sort((a,b)=>publicDateTime(b.isoDate||b.sourceArticle?.approvedAt||b.sourceArticle?.publishedAt||b.createdAt||b.date)-publicDateTime(a.isoDate||a.sourceArticle?.approvedAt||a.sourceArticle?.publishedAt||a.createdAt||a.date));}
  function isEditorialHighlight(value){
    return value===true || value===1 || (typeof value==='string' && ['true','1','sim'].includes(value.trim().toLocaleLowerCase('pt-BR')));
  }
  function isCreativeArticle(n){
    const tags=displayTags(articleCategoryValues(n)).map(v=>normalizeIdentityText(v));
    return tags.some(v=>v==='cantinho criativo');
  }
  function homeArticleCard(n){
    const categories=displayTags(articleCategoryValues(n));
    const categoryMarkup=categories.map(tag=>`<span>${escapeHTML(tag)}</span>`).join('');
    const href=`noticia-single.html?id=${encodeURIComponent(n.id)}`;
    const summary=String(n.excerpt||n.subtitle||'Matéria publicada pela redação estudantil.').trim();
    const views=Number(n.views||0);
    const highlighted=isEditorialHighlight(n.editorialHighlight)||isEditorialHighlight(n.featured)||isEditorialHighlight(n.isFeatured)||isEditorialHighlight(n.sourceArticle?.editorialHighlight)||isEditorialHighlight(n.sourceArticle?.featured)||isEditorialHighlight(n.sourceArticle?.isFeatured);
    return `<article class="fp-home-public-card fp-home-news-card">
      ${n.image?publicCoverMediaMarkup(n,'fp-home-public-card-media',`Capa da matéria: ${n.title||''}`):`<a class="fp-home-public-card-media" href="${href}" aria-label="Ler ${escapeHTML(n.title)}"><img src="assets/editorial/Gemini_01.jpg" alt="Imagem ilustrativa da Folha do Paiquerê" loading="lazy"></a>`}
      <div class="fp-home-public-card-body">
        <div class="fp-home-news-meta"><div class="fp-home-card-tags">${highlighted?'<span class="fp-editorial-highlight-badge">Destaques</span>':''}${categoryMarkup}</div><div class="fp-home-news-date"><time datetime="${escapeHTML(n.isoDate||'')}">${escapeHTML(publicDateLabel(n))}</time><span aria-hidden="true">•</span><span>${escapeHTML(readingTime(n))}</span></div></div>
        <h3><a href="${href}">${escapeHTML(n.title)}</a></h3>
        <p class="fp-home-card-summary">${escapeHTML(summary)}</p>
        <div class="fp-home-card-footer"><a class="fp-home-read-link" href="${href}">Ler matéria <span aria-hidden="true">→</span></a><div class="fp-home-card-interactions">${reactionMarkup(n,true)}<a class="fp-home-card-icon-link" href="${href}#news-comments" aria-label="Abrir comentários da matéria"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8a2.5 2.5 0 0 1-2.5 2.5H10l-5.5 4v-4.6A2.5 2.5 0 0 1 4 13.5z"/></svg><span class="sr-only">Comentários</span><span class="fp-home-comment-count" data-comment-count-for="${escapeHTML(n.id)}">${publicCommentCount(n.id)}</span></a><span class="fp-home-card-views" aria-label="${views.toLocaleString('pt-BR')} visualizações"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 12s3.3-6 9.5-6 9.5 6 9.5 6-3.3 6-9.5 6-9.5-6-9.5-6Z"/><circle cx="12" cy="12" r="2.7"/></svg><span>${views.toLocaleString('pt-BR')}</span></span></div></div>
      </div>
    </article>`;
  }
  function homeAchievementCard(a){
    const title=String(a.title||a.name||'Conquista');
    const name=String(a.name||'Comunidade escolar');
    const href=profileHrefByName(name);
    const date=achievementDateLabel(a);
    const tags=(Array.isArray(a.types)&&a.types.length?a.types:[a.type||'Conquista']).slice(0,2);
    const achievementId=String(a.id||'');
    const achievementHref=achievementId?`conquistas.html#achievement-${encodeURIComponent(achievementId)}`:'conquistas.html';
    return `<article class="fp-home-public-card fp-home-achievement-card"><a class="fp-home-public-card-media" href="${achievementHref}" aria-label="Ver a conquista ${escapeHTML(title)}">${a.image?imageCropMarkup(a.image,a.imageCrop,`Imagem da conquista: ${title}`,'','lazy'):`<img src="assets/editorial/Gemini_01.jpg" alt="Imagem ilustrativa da Folha do Paiquerê" loading="lazy">`}</a><div class="fp-home-public-card-body"><div class="fp-home-card-tags">${tags.map(t=>`<span>${escapeHTML(t)}</span>`).join('')}</div><h3><a href="${achievementHref}">${escapeHTML(title)}</a></h3><p class="fp-home-achievement-recipient">${href!=='#'?`<a href="${href}">${escapeHTML(name)}</a>`:escapeHTML(name)}</p><div class="fp-home-card-meta"><time>${escapeHTML(String(date||''))}</time><a href="${achievementHref}">Ver conquista →</a></div></div></article>`;
  }
  function buildHomeCarouselSlides(){
    const slides=[];
    const notices=getSchoolNotices().slice(0,3);
    notices.forEach(n=>slides.push({key:`notice:${n.id}`,type:'notice',data:n,title:n.title||'Aviso da escola',summary:n.summary||n.details||'Comunicado para a comunidade escolar.',image:n.image||'',label:n.category||'Aviso da escola'}));
    const news=sortPublicNews(getPublicNews());
    const highlighted=news.filter(n=>isEditorialHighlight(n.editorialHighlight)||isEditorialHighlight(n.sourceArticle?.editorialHighlight)||isEditorialHighlight(n.featured)||isEditorialHighlight(n.sourceArticle?.featured)||isEditorialHighlight(n.isFeatured)||isEditorialHighlight(n.sourceArticle?.isFeatured));
    const feature=highlighted[0];
    if(feature){slides.push({key:`featured:${feature.id}`,type:'article',data:feature,title:feature.title||'Matéria em destaque',summary:feature.excerpt||'Uma matéria selecionada pela redação.',image:feature.image||'',label:'Matéria em destaque'});slides.unshift(slides.pop());}
    const achievements=readJSON('fp_achievements',[]).filter(a=>a&&a.visible!==false).slice().sort((a,b)=>achievementTimestamp(b)-achievementTimestamp(a)).slice(0,3);
    achievements.forEach(item=>slides.push({key:`achievement:${item.id||item.title||item.name}`,type:'achievement',data:item,title:item.title||item.name||'Conquista da comunidade',summary:item.description||item.details||'Reconhecemos as conquistas de estudantes e equipes.',image:item.image||'',label:'Conquista da comunidade'}));
    const cutoff=Date.now()-7*24*60*60*1000;
    const recent= news.filter(n=>{const stamp=publicDateTime(n.isoDate||n.sourceArticle?.approvedAt||n.sourceArticle?.publishedAt||n.date);return stamp>0&&stamp>=cutoff;});
    const weeklyPool=recent.length?recent:news;
    const weekly=weeklyPool.find(n=>!feature||String(n.id)!==String(feature.id))||weeklyPool[0];
    if(weekly)slides.push({key:`weekly:${weekly.id}`,type:'article',data:weekly,title:weekly.title||'Última matéria',summary:weekly.excerpt||'Confira a publicação mais recente da redação.',image:weekly.image||'',label:'Última matéria da semana'});
    if(!slides.length)slides.push({key:'welcome',type:'welcome',data:null,title:'Histórias da nossa comunidade',summary:'Acompanhe as notícias, os projetos e as conquistas publicados pela Folha do Paiquerê.',image:'assets/editorial/Gemini_01.jpg',label:'Jornal escolar'});
    return slides;
  }
  function homeSlideMarkup(slide){
    const d=slide.data||{};
    if(slide.type==='notice'){
      return `<p class="fp-home-eyebrow">${escapeHTML(slide.label)}</p><h1>${escapeHTML(slide.title)}</h1><p class="fp-home-slide-summary">${escapeHTML(slide.summary)}</p>${d.category?`<div class="fp-home-slide-tags"><span>${escapeHTML(d.category)}</span></div>`:''}<div class="fp-home-slide-actions"><button type="button" class="fp-home-cta" data-home-open-notice="${escapeHTML(d.id)}">Ler aviso <span aria-hidden="true">→</span></button><span class="fp-home-slide-date">${escapeHTML(publicDateLabel(d))}</span></div>`;
    }
    if(slide.type==='achievement'){
      const person=String(d.name||'Comunidade escolar');const profile=publicUserByName(person);
      const personLabel=profile?authorByline(profile.name,profile.uid,profile.email):`<strong>${escapeHTML(person)}</strong>`;
      const tags=(Array.isArray(d.types)&&d.types.length?d.types:[d.type||'Conquista']).slice(0,3);
      const achievementHref=d.id?`conquistas.html#achievement-${encodeURIComponent(d.id)}`:'conquistas.html';
      return `<p class="fp-home-eyebrow">${personLabel}</p><h2>${escapeHTML(slide.title)}</h2><p class="fp-home-slide-summary">${escapeHTML(slide.summary)}</p><div class="fp-home-slide-tags">${tags.map(t=>`<span>${escapeHTML(t)}</span>`).join('')}</div><div class="fp-home-slide-actions"><a class="fp-home-cta" href="${achievementHref}">Ver conquista <span aria-hidden="true">→</span></a>${d.year?`<span class="fp-home-slide-date">${escapeHTML(d.year)}</span>`:''}</div>`;
    }
    if(slide.type==='article'){
      const n=d;const categoryMarkup=displayTags(articleCategoryValues(n)).map(t=>`<span>${escapeHTML(t)}</span>`).join('');const highlighted=isEditorialHighlight(n.editorialHighlight)||isEditorialHighlight(n.featured)||isEditorialHighlight(n.isFeatured)||isEditorialHighlight(n.sourceArticle?.editorialHighlight)||isEditorialHighlight(n.sourceArticle?.featured)||isEditorialHighlight(n.sourceArticle?.isFeatured);
      return `<p class="fp-home-eyebrow"><time datetime="${escapeHTML(n.isoDate||'')}">${escapeHTML(publicDateLabel(n))}</time></p><h1>${escapeHTML(slide.title)}</h1><p class="fp-home-slide-summary">${escapeHTML(slide.summary)}</p><div class="fp-home-slide-tags">${highlighted?'<span class="fp-editorial-highlight-badge">Destaques</span>':''}${categoryMarkup}</div><div class="fp-home-slide-actions fp-home-article-actions"><span class="fp-home-comment-link" aria-label="${publicCommentCount(n.id)} comentários"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8a2.5 2.5 0 0 1-2.5 2.5H10l-5.5 4v-4.6A2.5 2.5 0 0 1 4 13.5z"/></svg><span class="fp-home-comment-count" data-comment-count-for="${escapeHTML(n.id)}">${publicCommentCount(n.id)}</span></span></div>`;
    }
    return `<p class="fp-home-eyebrow">Folha do Paiquerê · Jornal escolar</p><h1>${escapeHTML(slide.title)}</h1><p class="fp-home-slide-summary">${escapeHTML(slide.summary)}</p><div class="fp-home-slide-actions"><a class="fp-home-cta" href="noticias.html">Explorar notícias <span aria-hidden="true">→</span></a><a class="fp-home-secondary-link" href="participar.html">Enviar uma sugestão</a></div>`;
  }
  function renderHomeCarousel(){
    const content=$('home-feature-content'),image=$('home-feature-image'),link=$('home-feature-link'),dots=$('home-feature-dots'),cardEl=$('home-feature-card');
    if(!content||!image||!link||!dots||!cardEl)return;
    const priorKey=homeCarouselSlides[homeCarouselIndex]?.key||homeCarouselCurrentKey;
    homeCarouselSlides=buildHomeCarouselSlides();
    const preserved=homeCarouselSlides.findIndex(s=>s.key===priorKey);
    if(preserved>=0)homeCarouselIndex=preserved;else homeCarouselIndex=Math.min(homeCarouselIndex,homeCarouselSlides.length-1);
    homeCarouselIndex=Math.max(0,homeCarouselIndex);const active=homeCarouselSlides[homeCarouselIndex];homeCarouselCurrentKey=active.key;
    content.innerHTML=homeSlideMarkup(active);
    image.src=active.image||'assets/editorial/Gemini_01.jpg';
    image.alt=active.image?(active.type==='article'?`Capa da matéria ${active.title}`:active.type==='achievement'?`Imagem da conquista ${active.title}`:active.type==='notice'?`Imagem do aviso ${active.title}`:'Imagem da Folha do Paiquerê'):'Imagem ilustrativa da Folha do Paiquerê';
    link.href=active.type==='article'?`noticia-single.html?id=${encodeURIComponent(active.data.id)}`:active.type==='achievement'?(active.data?.id?`conquistas.html#achievement-${encodeURIComponent(active.data.id)}`:'conquistas.html'):'#home-feature-card';
    link.setAttribute('aria-label',active.type==='article'?`Ler matéria: ${active.title}`:active.type==='achievement'?'Abrir mural de conquistas':active.type==='notice'?`Ver aviso: ${active.title}`:'Ver notícias');
    cardEl.dataset.slideType=active.type;
    cardEl.dataset.slideId=String(active.data?.id||'');
    cardEl.dataset.mobileHref=active.type==='article'&&active.data?.id?`noticia-single.html?id=${encodeURIComponent(active.data.id)}`:active.type==='achievement'&&active.data?.id?`conquistas.html#achievement-${encodeURIComponent(active.data.id)}`:active.type==='achievement'?'conquistas.html':active.type==='notice'?'#home-school-notice':active.type==='welcome'?'noticias.html':'noticias.html';
    cardEl.setAttribute('aria-label',`Novidade: ${String(active.title||'Conteúdo da comunidade')}. Toque para abrir.`);
    dots.innerHTML=homeCarouselSlides.map((slide,index)=>`<button type="button" class="fp-home-dot ${index===homeCarouselIndex?'is-active':''}" data-home-slide-dot="${index}" aria-label="Mostrar destaque ${index+1}: ${escapeHTML(slide.title)}" aria-current="${index===homeCarouselIndex?'true':'false'}"></button>`).join('');
    const prev=$('home-feature-prev'),next=$('home-feature-next');
    if(prev)prev.hidden=homeCarouselSlides.length<2;if(next)next.hidden=homeCarouselSlides.length<2;
    bindReactionButtons(content);hydratePublicCommentCounts(content);
    content.querySelector('[data-home-open-notice]')?.addEventListener('click',()=>openSchoolNotice(getSchoolNotices().find(n=>String(n.id)===String(active.data?.id))));
    if(!cardEl.dataset.controlsBound){
      cardEl.dataset.controlsBound='1';
      const move=delta=>{if(homeCarouselSlides.length<2)return;homeCarouselIndex=(homeCarouselIndex+delta+homeCarouselSlides.length)%homeCarouselSlides.length;homeCarouselCurrentKey=homeCarouselSlides[homeCarouselIndex].key;renderHomeCarousel();resetHomeCarouselTimer();};
      prev?.addEventListener('click',()=>move(-1));next?.addEventListener('click',()=>move(1));
      dots.addEventListener('click',event=>{const button=event.target.closest('[data-home-slide-dot]');if(!button)return;homeCarouselIndex=Math.max(0,Math.min(homeCarouselSlides.length-1,Number(button.dataset.homeSlideDot)||0));homeCarouselCurrentKey=homeCarouselSlides[homeCarouselIndex].key;renderHomeCarousel();resetHomeCarouselTimer();});
      cardEl.addEventListener('mouseenter',()=>{homeCarouselPaused=true;});cardEl.addEventListener('mouseleave',()=>{homeCarouselPaused=false;});
      cardEl.addEventListener('focusin',()=>{homeCarouselPaused=true;});cardEl.addEventListener('focusout',event=>{if(!cardEl.contains(event.relatedTarget))homeCarouselPaused=false;});
      link.addEventListener('click',event=>{if(cardEl.dataset.slideType!=='notice')return;event.preventDefault();const noticeId=homeCarouselSlides[homeCarouselIndex]?.data?.id;openSchoolNotice(getSchoolNotices().find(n=>String(n.id)===String(noticeId)));});
      document.addEventListener('visibilitychange',()=>{if(document.hidden)homeCarouselPaused=true;else homeCarouselPaused=false;});
    }
  }
  function resetHomeCarouselTimer(){
    if(homeCarouselTimer)clearInterval(homeCarouselTimer);homeCarouselTimer=null;
    if(homeCarouselSlides.length<2||window.matchMedia('(prefers-reduced-motion: reduce)').matches)return;
    homeCarouselTimer=setInterval(()=>{if(homeCarouselPaused||document.hidden)return;homeCarouselIndex=(homeCarouselIndex+1)%homeCarouselSlides.length;homeCarouselCurrentKey=homeCarouselSlides[homeCarouselIndex].key;renderHomeCarousel();},5000);
  }
  function renderHome(){
    const grid=$('home-news-grid'),creativeGrid=$('home-creative-grid'),creativeSection=$('home-creative-section'),achievementGrid=$('home-achievements-grid');
    if(!grid)return;
    scheduleSchoolNoticeExpiry();renderHomeCarousel();resetHomeCarouselTimer();
    const news=sortPublicNews(getPublicNews());
    grid.innerHTML=news.length?news.slice(0,3).map(homeArticleCard).join(''):'<p class="fp-home-empty">As primeiras notícias aparecerão aqui assim que forem publicadas.</p>';hydratePublicCommentCounts(grid);
    const creative=news.filter(isCreativeArticle).slice(0,3);
    if(creativeSection)creativeSection.hidden=creative.length===0;
    if(creativeGrid){creativeGrid.innerHTML=creative.map(homeArticleCard).join('');hydratePublicCommentCounts(creativeGrid);}
    const achievements=readJSON('fp_achievements',[]).filter(a=>a&&a.visible!==false).slice().sort((a,b)=>achievementTimestamp(b)-achievementTimestamp(a)).slice(0,3);
    if(achievementGrid)achievementGrid.innerHTML=achievements.length?achievements.map(homeAchievementCard).join(''):'<p class="fp-home-empty">As próximas conquistas da comunidade aparecerão aqui.</p>';
  }
  window.addEventListener('fp:articles-updated',()=>renderHome());
  window.addEventListener('fp:school-notices-updated',()=>renderHome());
  window.addEventListener('fp:achievements-updated',()=>renderHome());
  window.addEventListener('fp:profiles-updated',()=>renderHome());
  window.addEventListener('storage',event=>{if(['fp_articles','fp_school_notices','fp_achievements','fp_users'].includes(event.key))renderHome();});
  window.addEventListener('hashchange',focusSchoolNoticeFromHash);

  function initFeed(){
    const grid=$('news-grid'),empty=$('news-empty'),count=$('news-result-count'),search=$('news-search');
    if(!grid||!empty||!count||!search)return;
    const categorySelect=$('news-category-select'),sortSelect=$('news-sort-select'),legacyButtons=document.querySelectorAll('.category-filter');
    let active=new URLSearchParams(location.search).get('tipo')==='entretenimento'?'Cantinho Criativo':'Todas',sort=sortSelect?.value||'recent',q='';
    const norm=value=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR').trim();
    const isFeatured=n=>isEditorialHighlight(n.editorialHighlight)||isEditorialHighlight(n.featured)||isEditorialHighlight(n.isFeatured)||isEditorialHighlight(n.sourceArticle?.editorialHighlight)||isEditorialHighlight(n.sourceArticle?.featured)||isEditorialHighlight(n.sourceArticle?.isFeatured);
    const matchesCategory=(n,cat)=>{
      if(!cat||cat==='Todas')return true;
      if(cat==='Destaques')return isFeatured(n);
      if(cat==='Cantinho Criativo')return n.contentType==='entretenimento'||isCreativeArticle(n)||norm(n.creativeType)==='cantinho criativo';
      const tags=displayTags(n.categories?.length?n.categories:n.category).map(norm);
      return tags.includes(norm(cat))||(cat==='Opinião'&&tags.includes('opiniao'));
    };
    const metric=(n,key)=>{
      const local=n.sourceArticle||n;
      if(key==='likes')return Number(n.likes??local.likes??0)||0;
      if(key==='views')return Number(n.views??local.views??0)||0;
      return 0;
    };
    const render=()=>{
      const term=norm(q);const all=getPublicNews();
      let filtered=all.filter(n=>{
        if(!matchesCategory(n,active))return false;
        if(!term)return true;
        const searchable=norm(`${n.title||''} ${n.excerpt||''} ${n.author||''} ${n.category||''} ${n.creativeType||''} ${isFeatured(n)?'destaque destaques matéria em destaque':''}`);
        return searchable.includes(term);
      });
      const time=n=>publicDateTime(n.isoDate||n.sourceArticle?.approvedAt||n.sourceArticle?.publishedAt||n.createdAt||n.date)||0;
      if(sort==='oldest')filtered.sort((a,b)=>time(a)-time(b));
      else if(sort==='likes'||sort==='views')filtered.sort((a,b)=>metric(b,sort)-metric(a,sort)||time(b)-time(a));
      else if(sort==='leastLikes')filtered.sort((a,b)=>metric(a,'likes')-metric(b,'likes')||time(b)-time(a));
      else filtered.sort((a,b)=>time(b)-time(a));
      grid.innerHTML=filtered.map(card).join('');bindReactionButtons(grid);hydratePublicCommentCounts(grid);
      empty.classList.toggle('hidden',filtered.length!==0);count.textContent=`${filtered.length} ${filtered.length===1?'matéria encontrada':'matérias encontradas'}.`;
      legacyButtons.forEach(b=>{const on=b.dataset.category===active;b.setAttribute('aria-pressed',String(on));});
    };
    if(categorySelect){categorySelect.value=active;categorySelect.addEventListener('change',()=>{active=categorySelect.value||'Todas';render();});}
    else legacyButtons.forEach(b=>b.addEventListener('click',()=>{active=b.dataset.category||'Todas';render();}));
    if(sortSelect)sortSelect.addEventListener('change',()=>{sort=sortSelect.value||'recent';render();});
    search.addEventListener('input',()=>{q=search.value;render();});
    render();window.addEventListener('storage',e=>{if(e.key===ARTICLES_KEY)render();});window.addEventListener('fp:articles-updated',render);
  }

  function interactiveMarkup(o, articleId, pollIndex){
    if(o.dataType==='poll'&&o.dataPoll){const p=o.dataPoll,pollKey=`${articleId}:${Number(pollIndex||0)}`;return `<section class="news-poll" data-poll-id="${escapeHTML(articleId)}" data-poll-index="${Number(pollIndex||0)}" data-poll-key="${escapeHTML(pollKey)}" data-poll-kind="${escapeHTML(p.kind)}" data-poll-options="${escapeHTML(JSON.stringify(Array.isArray(p.options)?p.options:[]))}"><div class="poll-heading"><span class="poll-badge">ENQUETE</span><span class="poll-kind">${escapeHTML(p.kindLabel)}</span></div><h3>${escapeHTML(p.title)}</h3><p class="poll-help">${p.kind==='multi'?'Você pode marcar mais de uma opção.':p.kind==='rating'?'Escolha uma nota de 1 a 5.':'Escolha uma opção.'}</p><div class="poll-options">${(Array.isArray(p.options)?p.options:[]).map((x,i)=>`<button type="button" data-poll-option="${i}"><span class="poll-option-marker"></span><span class="poll-option-label">${escapeHTML(x)}</span><span class="poll-vote-count" data-poll-vote-count="${i}" aria-label="votos desta resposta">0</span></button>`).join('')}</div><div class="poll-footer"><div><div class="poll-total" data-poll-total>0 votos registrados</div><div class="poll-status" aria-live="polite"></div></div><button type="button" class="poll-submit" data-poll-submit disabled>Registrar voto</button></div></section>`;}
    return '';
  }

  function bodyFor(n){
    if(n.localArticle){
      const objects=Array.isArray(n.canvasJSON?.objects)?[...n.canvasJSON.objects].sort((a,b)=>{const dy=(a.top||0)-(b.top||0);return Math.abs(dy)>2?dy:(a.left||0)-(b.left||0);}):[];
      const textHTML=o=>{
        const text=String(o.text||""),lines=text.split("\n"),styles=o.styles||{};
        const links=Array.isArray(o.dataLinks)?o.dataLinks.filter(link=>{
          if(!link||!Number.isFinite(Number(link.start))||!Number.isFinite(Number(link.end))||Number(link.end)<=Number(link.start))return false;
          try{const url=new URL(String(link.url||""));return ["http:","https:"].includes(url.protocol)&&!url.username&&!url.password;}catch(_){return false;}
        }):[];
        const aligns=Array.isArray(o.dataParagraphAlign)?o.dataParagraphAlign:[];
        const indents=Array.isArray(o.dataParagraphIndent)?o.dataParagraphIndent:[];
        let output="",offset=0;
        lines.forEach((line,li)=>{
          const align=["left","center","right","justify"].includes(aligns[li])?aligns[li]:(["left","center","right","justify"].includes(o.textAlign)?o.textAlign:"left");
          const indent=Math.max(0,Math.min(6,Number(indents[li])||0));
          let lineHTML="",run="",lastSig="",lastHref="";
          const flush=()=>{
            if(!run)return;
            const span=`<span style="${lastSig}">${escapeHTML(run)}</span>`;
            lineHTML+=lastHref?`<a href="${escapeHTML(lastHref)}" target="_blank" rel="noopener noreferrer">${span}</a>`:span;
            run="";
          };
          for(let i=0;i<line.length;i++){
            const absolute=offset+i,st=o.dataEditorCharStyles?.[absolute]||styles[li]?.[i]||{};
            const link=links.find(item=>absolute>=Number(item.start)&&absolute<Number(item.end));
            const href=link?String(link.url):"";
            const family=st.fontFamily||o.fontFamily||"Inter";
            const size=Number(st.fontSize||o.fontSize||19);
            const weight=st.fontWeight||o.fontWeight||"400";
            const italic=st.fontStyle||o.fontStyle||"normal";
            const underlined=Boolean(href||st.underline||o.underline);
            const fill=href?"#2878D0":(st.fill||o.fill||"#1A1D1A");
            const sig=`font-family:${escapeHTML(family)};font-size:${Number.isFinite(size)?size:19}px;font-weight:${escapeHTML(weight)};font-style:${escapeHTML(italic)};color:${escapeHTML(fill)};text-decoration:${underlined?"underline":"none"};`;
            if(run&&(sig!==lastSig||href!==lastHref))flush();
            if(!run){lastSig=sig;lastHref=href;}
            run+=line[i];
          }
          flush();
          output+=`<div class="editor-rich-line" style="text-align:${align};${indent?`padding-left:${indent*1.2}em;`:""}">${lineHTML||"<br>"}</div>`;
          offset+=line.length+1;
        });
        return output;
      };
      let pollIndex=0;
      const parts=objects.map(o=>{
        if(o.dataType==='poll'){const html=interactiveMarkup(o,n.id,pollIndex);pollIndex++;return html;}
        if(["textbox","i-text","text"].includes(o.type)&&String(o.text||"").trim()){const key=o.dataTextStyle||"body";const cls=key==="title"?"article-editor-title":key==="subtitle"?"article-editor-subtitle":"article-editor-body";return `<div class="article-editor-text ${cls}">${textHTML(o)}</div>`;}
        if(o.type==="image"&&o.src){const w=Math.round((o.width||400)*(o.scaleX||1));const align=["left","center","right"].includes(o.dataImageAlign)?o.dataImageAlign:"left";const margin=align==="center"?"1.5rem auto":align==="right"?"1.5rem 0 1.5rem auto":"1.5rem 0";const css=`width:min(${Math.min(w,680)}px,100%);margin:${margin}`;const c=normalizedCropRect(o.dataCropFrame);const sourceW=Number(o.dataCropSourceWidth||o.width||1),sourceH=Number(o.dataCropSourceHeight||o.height||1);const frame=c?`<span class="fp-crop-image-window fp-body-crop-window" style="aspect-ratio:${Math.max(.01,c.width*sourceW)/Math.max(.01,c.height*sourceH)}"><img src="${escapeHTML(o.src)}" alt="Imagem inserida na matéria" loading="lazy" style="width:${100/c.width}%!important;height:${100/c.height}%!important;left:${-c.x/c.width*100}%!important;top:${-c.y/c.height*100}%!important;max-width:none!important;max-height:none!important;object-fit:fill!important;"></span>`:`<img loading="lazy" src="${escapeHTML(o.src)}" alt="Imagem inserida na matéria" class="w-full h-auto rounded-xl">`;return `<figure class="article-editor-image" style="${css}">${frame}</figure>`;}
        if(o.dataType==="video"&&o.dataVideoUrl){const source=String(o.dataVideoSourceUrl||o.dataVideoUrl);return `<figure class="my-8"><div class="aspect-video w-full overflow-hidden rounded-xl bg-black"><iframe class="h-full w-full" src="${escapeHTML(o.dataVideoUrl)}" title="Vídeo da matéria" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe></div><figcaption class="mt-2 text-xs text-slate-500 dark:text-slate-400">Vídeo incorporado pela redação · <a href="${escapeHTML(source)}" target="_blank" rel="noopener noreferrer">Abrir na plataforma original</a></figcaption></figure>`;}
        if(o.dataType==="audio"&&o.dataAudioUrl){return `<figure class="fp-article-audio my-6"><audio controls preload="metadata" src="${escapeHTML(o.dataAudioUrl)}">Seu navegador não oferece suporte à reprodução de áudio.</audio><figcaption class="mt-2 text-xs text-slate-500 dark:text-slate-400">Áudio da matéria</figcaption></figure>`;}
        return "";
      }).join("");
      return parts||`<p>${escapeHTML(n.excerpt||"Matéria publicada pela redação estudantil.")}</p>`;
    }
    return (n.body||[]).map(block=>{if(block.type==='p')return `<p>${escapeHTML(block.text)}</p>`;if(block.type==='h2')return `<h2>${escapeHTML(block.text)}</h2>`;if(block.type==='h3')return `<h3>${escapeHTML(block.text)}</h3>`;if(block.type==='quote')return `<blockquote class="text-lg font-semibold text-[#1B5E20] dark:text-[#81C784]">“${escapeHTML(block.text)}”</blockquote>`;if(block.type==='image')return `<figure><img loading="lazy" src="${escapeHTML(block.src)}" alt="${escapeHTML(block.alt)}"><figcaption class="text-xs text-slate-500 dark:text-slate-400">${escapeHTML(block.alt)}</figcaption></figure>`;if(block.type==='video')return `<figure class="my-8"><div class="aspect-video w-full overflow-hidden rounded-xl bg-black"><iframe class="h-full w-full" src="${escapeHTML(block.src)}" title="${escapeHTML(block.title)}" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe></div><figcaption class="mt-2 text-xs text-slate-500 dark:text-slate-400">${escapeHTML(block.title)}</figcaption></figure>`;return '';}).join('');
  }
  function getAnonymousCommentIdentity(){
    const browser=getBrowserIdentity(),id=browser.id;
    let displayName='';
    try{displayName=String(localStorage.getItem('fp_comment_display_name')||'').trim().slice(0,80);localStorage.setItem('fp_comment_anon_id',JSON.stringify(id));}catch(_){}
    return {name:displayName||'Anônimo',email:'',avatar:'',anonymous:true,authorKey:String(id),uid:''};
  }
  function commentSession(){
    try{const s=JSON.parse(localStorage.getItem(SESSION_KEY)||'null');if(s)return {...s,anonymous:false,authorKey:String(s.email||'').toLowerCase()||String(s.name||'').toLowerCase()};}catch(_){ }
    return getAnonymousCommentIdentity();
  }
  function localComments(articleId){const all=readJSON('fp_comments',[]);return Array.isArray(all)?all.filter(x=>String(x.articleId)===String(articleId)):[];}
  async function cloudComments(articleId){ if(window.FPCloud?.fetchComments){const rows=await window.FPCloud.fetchComments(articleId);return Array.isArray(rows)?rows:null;} return null; }
  async function saveCommentCloud(comment){ if(window.FPCloud?.saveComment) return window.FPCloud.saveComment(comment); return false; }
  async function deleteCommentCloud(id){ if(window.FPCloud?.deleteComment) return window.FPCloud.deleteComment(id); return false; }

  function commentTree(items){const map=new Map(items.map(x=>[String(x.id),{...x,replies:[]}]));const roots=[];map.forEach(x=>{if(x.parentId&&map.has(String(x.parentId)))map.get(String(x.parentId)).replies.push(x);else roots.push(x);});return roots;}
  function renderCommentNode(x,s,depth=0){
    const browser=getBrowserIdentity();
    const browserId=String(browser?.id||'').trim().toLowerCase();
    const browserFirebaseUid=String(browser?.firebaseUid||'').trim().toLowerCase();
    const authorUid=String(x?.authorUid||'').trim().toLowerCase();
    const authorKey=String(x?.authorKey||x?.email||'').trim().toLowerCase();
    const sessionKey=String(s?.authorKey||s?.email||'').trim().toLowerCase();
    const mineByBrowserKey=Boolean(browserId&&authorKey&&authorKey===browserId);
    const mineByBrowserFirebase=Boolean(s?.anonymous&&browserFirebaseUid&&(authorUid===browserFirebaseUid||authorKey===browserFirebaseUid));
    const mineBySessionKey=Boolean(!s?.anonymous&&sessionKey&&authorKey&&authorKey===sessionKey);
    const mine=mineByBrowserKey||mineByBrowserFirebase||mineBySessionKey;
    const actions=[`<button type="button" data-comment-reply="${escapeHTML(x.id)}">Responder</button>`];
    if(mine)actions.push(`<button type="button" data-comment-delete="${escapeHTML(x.id)}">Excluir</button>`);
    const replies=(x.replies||[]).map(r=>renderCommentNode(r,s,depth+1)).join('');
    return `<article class="comment-item ${depth?'comment-reply':''}" data-comment-id="${escapeHTML(x.id)}"><div class="comment-avatar">${x.avatar?`<img src="${escapeHTML(x.avatar)}" alt="Foto de ${escapeHTML(x.name||'Anônimo')}">`:`<span>${escapeHTML(String(x.name||'A').split(/\s+/).map(v=>v[0]).slice(0,2).join('').toUpperCase())}</span>`}</div><div class="comment-main"><div class="comment-head"><strong>${escapeHTML(x.name||'Anônimo')}</strong><time>${escapeHTML(new Date(x.createdAt).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'}))}</time></div><p>${escapeHTML(x.text)}</p><div class="comment-actions">${actions.join('')}</div><div class="comment-reply-form hidden" data-reply-form="${escapeHTML(x.id)}"><textarea rows="2" maxlength="1200" class="site-input" placeholder="Escreva uma resposta..."></textarea><button type="button" class="comment-reply-send" data-comment-send-reply="${escapeHTML(x.id)}">Responder</button></div>${replies}</div></article>`;
  }
  async function initComments(container,articleId){
    const host=document.createElement('section');host.className='news-comments';host.id='news-comments';container.querySelector('article')?.appendChild(host);
    const session=commentSession();
    if(fpCloudEnabled()){
      let liveUser=null;
      try{liveUser=window.FPCloud?.getAuthUser?.()||null;}catch(_){}
      if(liveUser?.uid){
        session.uid=String(liveUser.uid);
        session.anonymous=Boolean(liveUser.isAnonymous);
        if(session.anonymous){
          session.authorKey=String(getBrowserIdentity().id);
          session.email='';
        }else{
          session.authorKey=String(liveUser.email||session.email||'').trim().toLowerCase()||String(liveUser.displayName||session.name||'').trim().toLowerCase();
          if(liveUser.email)session.email=String(liveUser.email);
          if(liveUser.displayName&&!session.name)session.name=String(liveUser.displayName);
        }
      }else if(session.anonymous){
        // A identidade local do navegador é suficiente para comentários anônimos.
      }else{
        try{
          const authUser=await window.FPCloud?.waitForAuthenticatedUser?.(10000);
          if(authUser?.uid)session.uid=String(authUser.uid);
        }catch(_){}
      }
    }
    let comments=localComments(articleId);
    const remote=await cloudComments(articleId);if(Array.isArray(remote)){comments=remote;setPublicCommentCount(articleId,comments.filter(x=>x&&x.visible!==false).length);}
    const globalQuota=async()=>{
      try{
        if(window.FPCloud?.fetchCommentsByAuthorUid&&session.uid){
          const rows=await window.FPCloud.fetchCommentsByAuthorUid(session.uid);
          return Array.isArray(rows)?rows:[];
        }
      }catch(_){}
      const all=readJSON('fp_comments',[]);
      return Array.isArray(all)?all.filter(x=>{
        const sameUid=Boolean(session.uid&&x?.authorUid&&String(x.authorUid)===String(session.uid));
        const sameKey=String(x?.authorKey||x?.email||'').trim().toLowerCase()===String(session.authorKey||'').trim().toLowerCase();
        return sameUid||sameKey;
      }):[];
    };
    let quotaComments=await globalQuota();
    const MAX_COMMENTS=3;
    const quotaDay=iso=>{const d=new Date(iso||Date.now());if(!Number.isFinite(d.getTime()))return '';if(d.getHours()===0&&d.getMinutes()===0)d.setDate(d.getDate()-1);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
    const todayQuotaDay=()=>quotaDay(new Date());
    const recentByMe=()=>quotaComments.filter(x=>quotaDay(x.createdAt)===todayQuotaDay()&&(session.uid&&x.authorUid?String(x.authorUid)===String(session.uid):String(x.authorKey||x.email||'').trim().toLowerCase()===String(session.authorKey||'').trim().toLowerCase())).length;
    const render=()=>{
      const tree=commentTree(comments),remaining=Math.max(0,MAX_COMMENTS-recentByMe());
      const visibleTree=tree.map(x=>renderCommentNode(x,session)).filter(Boolean);
      const head=`<div class="comments-heading"><div><p class="comments-kicker">Comunidade</p><h2>Comentários</h2><p>Pergunte, complemente a matéria ou responda a outra pessoa.</p></div><span class="comments-count">${comments.length} ${comments.length===1?'comentário':'comentários'}</span></div>`;
      const composer=remaining>0?`<form class="comment-composer" id="comment-form"><textarea id="comment-text" rows="3" maxlength="1200" placeholder="Escreva um comentário respeitoso..."></textarea><div class="comment-compose-foot"><small>${session.anonymous?'Você está comentando como <strong>'+escapeHTML(session.name||'Anônimo')+'</strong>.':'Você está comentando como <strong>'+escapeHTML(session.name||session.email)+'</strong>.'} ${remaining===1?'Último comentário disponível hoje.':`${remaining} comentários disponíveis hoje.`}</small><button class="btn-primary rounded-lg px-4 py-2.5 text-sm font-bold">Comentar</button></div></form>`:`<div class="comment-limit-note">Você atingiu o limite de ${MAX_COMMENTS} comentários hoje. Um novo ciclo começa às 00:01.</div>`;
      const list=visibleTree.length?`<div class="comment-list" aria-label="Lista de comentários">${visibleTree.join('')}</div>`:`<div class="comment-empty">Ainda não há comentários. Seja a primeira pessoa a iniciar a conversa.</div>`;
      host.innerHTML=head+composer+list;
      const railCount=document.getElementById('news-action-comments-count');if(railCount&&String(railCount.dataset.commentCountFor)===String(articleId))railCount.textContent=String(comments.filter(x=>x&&x.visible!==false).length);
      setPublicCommentCount(articleId,comments.filter(x=>x&&x.visible!==false).length);
    };
    const add=async(text,parentId='')=>{
      const value=String(text||'').trim();if(!value)return false;
      if(recentByMe()>=MAX_COMMENTS){announce(`Limite de ${MAX_COMMENTS} comentários hoje atingido. Um novo ciclo começa às 00:01.`);return false;}
      let authorUid=String(session.uid||'').trim();
      if(fpCloudEnabled()&&!authorUid&&!session.anonymous){
        try{
          const owner=await window.FPCloud?.waitForAuthenticatedUser?.(10000);
          if(owner?.uid){
            authorUid=String(owner.uid);
            session.uid=authorUid;
          }
        }catch(_){}
      }
      const commentOwnerKey=session.anonymous?String(getBrowserIdentity().id):String(session.authorKey||'');
      const comment={id:`comment_${Date.now()}_${Math.random().toString(36).slice(2,8)}`,articleId:String(articleId),parentId,name:session.name||'Anônimo',email:session.email||'',avatar:session.avatar||'',authorKey:commentOwnerKey,text:value,createdAt:new Date().toISOString(),visible:true,anonymous:!!session.anonymous,authorUid};
      const cloudEnabled=Boolean(fpCloudEnabled());
      if(cloudEnabled){
        const result=await saveCommentCloud(comment);
        if(!(result===true||result?.ok===true)){
          announce(result?.message||'Não foi possível registrar o comentário. Tente novamente.');
          return false;
        }
        if(result?.comment?.authorUid)comment.authorUid=String(result.comment.authorUid);
        if(result?.comment?.authorKey)comment.authorKey=String(result.comment.authorKey);
      }
      comments.push(comment);
      const all=readJSON('fp_comments',[]);const idx=all.findIndex(x=>String(x.id)===String(comment.id));if(idx>=0)all[idx]=comment;else all.push(comment);
      writeJSON('fp_comments',all);
      quotaComments.push(comment);render();
      return true;
    };
    render();
    host.addEventListener('submit',e=>{if(e.target.id==='comment-form'){e.preventDefault();const t=$('comment-text');add(t?.value||'').then(ok=>{if(ok&&t)t.value='';});}});
    host.addEventListener('click',async e=>{
      const reply=e.target.closest('[data-comment-reply]');if(reply){host.querySelector(`[data-reply-form="${CSS.escape(reply.dataset.commentReply)}"]`)?.classList.toggle('hidden');return;}
      const send=e.target.closest('[data-comment-send-reply]');if(send){const form=host.querySelector(`[data-reply-form="${CSS.escape(send.dataset.commentSendReply)}"]`),t=form?.querySelector('textarea');add(t?.value||'',send.dataset.commentSendReply).then(ok=>{if(ok&&t)t.value='';});return;}
      const del=e.target.closest('[data-comment-delete]');if(del){
        const id=del.dataset.commentDelete,x=comments.find(c=>String(c.id)===String(id));if(!x)return;
        if(!confirm('Excluir este comentário?'))return;
        if(fpCloudEnabled()){
          const removed=await deleteCommentCloud(id);
          if(removed!==true){announce('Não foi possível excluir o comentário.');return;}
        }
        comments=comments.filter(c=>String(c.id)!==String(id));
        quotaComments=quotaComments.filter(c=>String(c.id)!==String(id));
        writeJSON('fp_comments',readJSON('fp_comments',[]).filter(c=>String(c.id)!==String(id)));
        render();announce('Comentário excluído.');
      }
    });
  }

  function getSingle(){const p=new URLSearchParams(location.search);const id=p.get('id');return getPublicNews().find(n=>String(n.id)===String(id))||getPublicNews()[0];}
  function initSingle(){
    const c=$('single-container');if(!c)return;
    const n=getSingle();if(!n)return;
    recordView(n).then(()=>{if(document.body.contains(c)){const freshNow=getPublicNews().find(x=>String(x.id)===String(n.id))||n;const countEl=c.querySelector('.news-view-count');if(countEl)countEl.textContent=`${Number(freshNow.views||0).toLocaleString('pt-BR')} ${Number(freshNow.views||0)===1?'visualização':'visualizações'}`;}});
    const fresh=getPublicNews().find(x=>String(x.id)===String(n.id))||n;
    document.title=`${fresh.title||'Matéria'} — Folha do Paiquerê`;
    const imageMarkup=fresh.image?`<figure class="fp-article-cover">${publicCoverImageElementMarkup(fresh,`Capa: ${fresh.title||''}`)}</figure>`:'';
    const videoMarkup=fresh.videoUrl&&!(Array.isArray(fresh.canvasJSON?.objects)&&fresh.canvasJSON.objects.some(o=>o?.dataType==='video'))?`<figure class="fp-article-video"><div class="aspect-video w-full overflow-hidden rounded-2xl bg-black"><iframe class="h-full w-full" src="${escapeHTML(fresh.videoUrl)}" title="Vídeo da matéria" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe></div><figcaption>Vídeo incorporado pela redação</figcaption></figure>`:'';
    c.innerHTML=`
      <article class="fp-article-page">
        <header class="fp-article-heading">
          <div class="fp-article-heading-inner">
            <h1>${escapeHTML(fresh.title||'Matéria')}</h1>
            ${fresh.excerpt?`<p class="fp-article-subtitle text-lg">${escapeHTML(fresh.excerpt)}</p>`:''}
            <div class="fp-article-categories">${isEditorialHighlight(fresh.editorialHighlight)||isEditorialHighlight(fresh.sourceArticle?.editorialHighlight)||isEditorialHighlight(fresh.featured)||isEditorialHighlight(fresh.sourceArticle?.featured)||isEditorialHighlight(fresh.isFeatured)||isEditorialHighlight(fresh.sourceArticle?.isFeatured)?'<span class="fp-editorial-highlight-badge">Destaques</span>':''}${badge(fresh.category)}${typeBadge(fresh)}</div>
            <hr class="fp-public-detail-divider">
            <div class="fp-article-credits"><p class="fp-article-credits-heading">Créditos</p>${creditLine(fresh)||'<p class="fp-article-no-credits">Equipe editorial da Folha do Paiquerê</p>'}</div><hr class="fp-public-detail-divider fp-article-credits-divider">
          </div>
        </header>
        ${imageMarkup}
        <div class="fp-article-content prose-folha">${bodyFor(fresh)}${videoMarkup}</div>
        <footer class="fp-article-footer"><p class="news-view-count news-view-count-single">${Number(fresh.views||0).toLocaleString('pt-BR')} ${Number(fresh.views||0)===1?'visualização':'visualizações'}</p><a href="noticias.html" class="fp-article-back-link"><span aria-hidden="true">←</span> Voltar</a></footer>
      </article>
      <aside class="fp-article-action-rail" aria-label="Ações da matéria">
        <div class="fp-article-rail-like">${reactionMarkup(fresh,true)}</div>
        <button id="news-open-comments" class="fp-article-rail-button" type="button" aria-label="Abrir comentários"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8a2.5 2.5 0 0 1-2.5 2.5H10l-5.5 4v-4.6A2.5 2.5 0 0 1 4 13.5z"/></svg><span id="news-action-comments-count" data-comment-count-for="${escapeHTML(fresh.id)}">${publicCommentCount(fresh.id)}</span></button>
        <button id="speech-toggle" class="fp-article-rail-button" aria-label="Ouvir matéria" title="Ouvir matéria" aria-pressed="false" type="button"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 10v4h4l5 4V6l-5 4H4Z"/><path d="M16 9a4 4 0 0 1 0 6M18 6a8 8 0 0 1 0 12"/></svg><span class="sr-only" id="speech-label">Ouvir matéria</span><span class="sr-only" id="speech-icon">🔊</span></button>
        <button data-print-pdf type="button" class="fp-article-rail-button" aria-label="Baixar matéria em PDF" title="Baixar PDF"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12m-5-5 5 5 5-5M4 17v3h16v-3"/></svg></button>
        <button type="button" data-share="menu" class="fp-article-rail-button" aria-label="Compartilhar matéria" title="Compartilhar"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12h15m-5-5 5 5-5 5"/></svg></button>
      </aside>
      <div id="news-comments-modal" class="fp-public-detail-backdrop fixed inset-0 z-[10060] hidden items-center justify-center bg-black/60 p-3 sm:p-6" role="dialog" aria-modal="true" aria-labelledby="news-comments-modal-title"><section class="fp-public-detail-modal fp-comments-modal"><button type="button" class="fp-public-detail-close" id="news-comments-modal-close" aria-label="Fechar comentários">×</button><div class="fp-public-detail-content"><h2 id="news-comments-modal-title" class="sr-only">Comentários da matéria</h2><div id="news-comments-modal-content"></div></div></section></div>
      <div id="news-share-modal" class="fp-public-detail-backdrop fixed inset-0 z-[10060] hidden items-center justify-center bg-black/60 p-3 sm:p-6" role="dialog" aria-modal="true" aria-labelledby="news-share-modal-title"><section class="fp-public-detail-modal fp-share-modal"><button type="button" class="fp-public-detail-close" id="news-share-modal-close" aria-label="Fechar compartilhamento">×</button><div class="fp-public-detail-content"><p class="fp-public-detail-kicker">Compartilhe</p><h2 id="news-share-modal-title">Envie esta matéria</h2><p class="fp-public-detail-summary">Escolha um aplicativo ou copie o link para compartilhar a notícia.</p><div class="fp-share-options"><a id="news-share-whatsapp" target="_blank" rel="noopener noreferrer" href="#">WhatsApp <span aria-hidden="true">↗</span></a><a id="news-share-email" href="#">E-mail <span aria-hidden="true">↗</span></a><button id="news-share-copy" type="button">Copiar link <span aria-hidden="true">⧉</span></button></div><p id="news-share-status" class="fp-share-status" aria-live="polite"></p></div></section></div>`;
    bindReactionButtons(c);bindPolls(c);
    initComments(c,fresh.id);
    const commentsHost=c.querySelector('#news-comments');
    const commentsModal=c.querySelector('#news-comments-modal');
    const commentsModalContent=c.querySelector('#news-comments-modal-content');
    if(commentsHost&&commentsModalContent)commentsModalContent.appendChild(commentsHost);
    const related=document.createElement('section');related.className='related-news fp-article-related';
    related.innerHTML=`<div class="fp-article-related-heading"><div><p class="fp-public-detail-kicker">Continue lendo</p><h2>Mais histórias para a comunidade</h2></div><a href="noticias.html">Ver todas <span aria-hidden="true">→</span></a></div><div class="fp-article-related-grid" id="related-news-grid"></div>`;
    c.querySelector('.fp-article-page')?.insertAdjacentElement('afterend',related);
    const grid=related.querySelector('#related-news-grid');
    if(grid){grid.innerHTML=getPublicNews().filter(x=>String(x.id)!==String(fresh.id)).slice(0,3).map(card).join('')||'<p class="fp-article-related-empty">Novas notícias aparecerão aqui assim que forem publicadas.</p>';bindReactionButtons(grid);hydratePublicCommentCounts(grid);}
    const openComments=()=>{commentsModal?.classList.remove('hidden');commentsModal?.classList.add('flex');commentsModal?.querySelector('.fp-public-detail-close')?.focus({preventScroll:true});};
    const closeComments=()=>closePublicModal(commentsModal);
    // Card comment links use #news-comments; because comments now live in a modal,
    // honor that deep link by opening the modal after the article UI is mounted.
    const openCommentsFromHash=()=>{if(location.hash==='#news-comments')openComments();};
    openCommentsFromHash();
    c.querySelector('#news-open-comments')?.addEventListener('click',openComments);
    c.querySelector('#news-comments-modal-close')?.addEventListener('click',closeComments);
    commentsModal?.addEventListener('click',event=>{if(event.target===commentsModal)closeComments();});
    commentsModal?.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();closeComments();c.querySelector('#news-open-comments')?.focus({preventScroll:true});}});
    c.querySelector('[data-print-pdf]')?.addEventListener('click',()=>{document.body.classList.add('print-news');const previous=document.title;document.title=fresh.title||'Folha do Paiquerê';window.print();setTimeout(()=>{document.title=previous;document.body.classList.remove('print-news');},1000);});
    const shareModal=c.querySelector('#news-share-modal');
    const openShare=()=>{shareModal?.classList.remove('hidden');shareModal?.classList.add('flex');shareModal?.querySelector('.fp-public-detail-close')?.focus({preventScroll:true});};
    const closeShare=()=>closePublicModal(shareModal);
    c.querySelector('[data-share="menu"]')?.addEventListener('click',openShare);
    c.querySelector('#news-share-modal-close')?.addEventListener('click',closeShare);
    shareModal?.addEventListener('click',event=>{if(event.target===shareModal)closeShare();});
    const encodedText=encodeURIComponent(`${fresh.title||'Folha do Paiquerê'} ${location.href}`);
    const wa=c.querySelector('#news-share-whatsapp');if(wa)wa.href=`https://wa.me/?text=${encodedText}`;
    const mail=c.querySelector('#news-share-email');if(mail)mail.href=`mailto:?subject=${encodeURIComponent(fresh.title||'Folha do Paiquerê')}&body=${encodeURIComponent(`${fresh.excerpt||''}\n\n${location.href}`)}`;
    const copyLink=async()=>{const status=c.querySelector('#news-share-status');try{if(navigator.clipboard?.writeText)await navigator.clipboard.writeText(location.href);else{const input=document.createElement('textarea');input.value=location.href;input.style.position='fixed';input.style.opacity='0';document.body.appendChild(input);input.select();const ok=document.execCommand('copy');input.remove();if(!ok)throw new Error('copy failed');}if(status)status.textContent='Link copiado. Você já pode compartilhar.';announce('Link da matéria copiado.');}catch(_){if(status)status.textContent='Não foi possível copiar automaticamente. Copie o endereço na barra do navegador.';}};
    c.querySelector('#news-share-copy')?.addEventListener('click',copyLink);
    document.addEventListener('keydown',event=>{if(event.key==='Escape'){closeComments();closeShare();}});
    if(location.hash==='#news-comments'){openComments();requestAnimationFrame(()=>commentsModalContent?.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'}));}
  }

  function editorialDisplayTitle(role){
    const value=String(role||'').trim();
    if(value==='Editor-Chefe')return 'Coordenador(a) Editorial';
    if(value==='Editor')return 'Editor(a)';
    // Estudante não é um cargo profissional/editorial; não inventamos um título.
    return '';
  }

  function safeProfileBackgroundUrl(raw){
    let candidate=String(raw||'').trim();if(!candidate)return '';
    if(/<img\b/i.test(candidate)){const match=candidate.match(/<img\b[^>]*\bsrc\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s"'=<>`]+))/i);candidate=String(match?.[1]||match?.[2]||match?.[3]||'').trim();}
    if(!candidate)return '';
    try{
      const rootRelative=candidate.startsWith('/');
      const parsed=/^https?:\/\//i.test(candidate)?new URL(candidate):rootRelative?new URL(candidate,location.origin):new URL(`https://${candidate}`);
      if(parsed.protocol!=='https:'||!parsed.hostname||parsed.username||parsed.password)return '';
      if(rootRelative&&parsed.origin!==location.origin)return '';
      return parsed.href;
    }catch(_){return '';}
  }

  function initAboutDirectory(){
    const grid=$('about-profile-grid'),search=$('about-profile-search'),sort=$('about-profile-sort');
    if(!grid)return;
    const users=()=>{const all=readJSON(USERS_KEY,[]);if(!Array.isArray(all))return [];const map=new Map();all.filter(u=>u&&u.revocationMode!=='spark-plan-b'&&u.name&&(u.email||u.uid)).forEach(u=>{const key=String(u.uid||u.email||u.name||'').trim().toLowerCase();if(!map.has(key)||String(u.role||'').includes('Chefe'))map.set(key,u);});return [...map.values()];};
    const contributionList=u=>Array.isArray(u.contributions)?u.contributions:(u.contribution?[String(u.contribution)]:[]);
    const professionalPositions=new Set(['Professor(a)','Pedagogo(a)','Diretor(a)','Secretário(a)','Secretário(a) e Pedagogo(a)']);
    const normalizedName=v=>String(v||'').toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[\u0300-\u036f]/g,'');
    const statsFor=u=>{
      const activity=profileActivityStats(u,getPublicNews());
      const name=normalizedName(u?.name);
      const uid=String(u?.uid||'').trim();
      const achievements=readJSON('fp_achievements',[]).filter(a=>{
        const credits=creditRawEntries(a?.credits);
        const profiles=Array.isArray(a?.creditProfiles)?a.creditProfiles:[];
        return normalizedName(a?.name).includes(name)||credits.some(v=>identityMatches(v,null,u,u))||(uid&&profiles.some(v=>String(v?.uid||'').trim()===uid));
      });
      return {...activity,achievements};
    };
    const data=()=>users().map(u=>{const st=statsFor(u);const createdAt=publicDateTime(u.createdAt);const year=createdAt>0?new Date(createdAt).getFullYear():null;return {...u,stats:st,year,contributions:contributionList(u)};});
    const initials=v=>String(v||'?').split(/\s+/).map(x=>x[0]).filter(Boolean).slice(0,2).join('').toUpperCase();
    const render=()=>{
      let ds=data();
      const q=normalizedName(search?.value||'').trim();
      ds=ds.filter(u=>{
        const searchText=normalizedName([u.name,u.role,u.assignedTitle,u.schoolYear,u.bio,u.academicHistory,...u.contributions].filter(Boolean).join(' '));
        return (!q||searchText.includes(q));
      });
      const mode=sort?.value||'achievements';
      ds.sort((a,b)=>mode==='contributions'?(b.stats.contributions-a.stats.contributions||a.name.localeCompare(b.name,'pt-BR')):mode==='year'?((Number(b.year||0)-Number(a.year||0))||a.name.localeCompare(b.name,'pt-BR')):mode==='name'?a.name.localeCompare(b.name,'pt-BR'):(b.stats.achievements.length-a.stats.achievements.length||a.name.localeCompare(b.name,'pt-BR')));
      grid.innerHTML=ds.length?ds.map(u=>{
        const rawSchool=String(u.schoolYear||'').trim();
        const position=String(u.assignedTitle||'').trim();
        // Cargos profissionais aparecem no lugar do ano escolar no diretório Sobre,
        // assim como no perfil individual; os campos salvos permanecem inalterados.
        const hasProfessionalPosition=professionalPositions.has(position);
        const school=hasProfessionalPosition?position:(rawSchool?`Estudante do ${rawSchool}`:'Ano escolar não informado');
        const editorialTitle=editorialDisplayTitle(u.role);
        const photo=u.avatar?`<img class="about-profile-avatar" src="${escapeHTML(u.avatar)}" alt="Foto de ${escapeHTML(u.name)}" loading="lazy">`:`<div class="about-profile-avatar about-profile-placeholder">${escapeHTML(initials(u.name))}</div>`;
        const positionMarkup=position&&!hasProfessionalPosition?`<i aria-hidden="true">•</i><span class="fp-community-position">${escapeHTML(position)}</span>`:'';
        const titleMarkup=editorialTitle?`<i aria-hidden="true">•</i><span>${escapeHTML(editorialTitle)}</span>`:'';
        const registrationYearMarkup=`<p class="fp-community-registration-year">Ano de cadastro: ${u.year?escapeHTML(String(u.year)):'não informado'}</p>`;
        const status=u.accessRevoked?'<span class="fp-community-preserved">Perfil preservado</span>':'';
        const profileHref=u.uid?`perfil.html?uid=${encodeURIComponent(u.uid)}`:`perfil.html?email=${encodeURIComponent(u.email)}`;
        const backgroundURL=safeProfileBackgroundUrl(u.profileBackgroundImage||'');
        const crop=u.profileBackgroundCrop&&typeof u.profileBackgroundCrop==='object'?u.profileBackgroundCrop:{};
        const point=key=>Math.max(0,Math.min(100,Number(crop[key])||50));
        return `<a href="${escapeHTML(profileHref)}" class="about-profile-card fp-community-profile-card" aria-label="Abrir perfil público de ${escapeHTML(u.name)}" ${backgroundURL?`data-profile-background="${escapeHTML(backgroundURL)}" data-profile-background-x="${point('desktopX')}" data-profile-background-y="${point('desktopY')}" data-profile-background-mobile-x="${point('mobileX')}" data-profile-background-mobile-y="${point('mobileY')}"`:''}>
          <div class="fp-community-identity-zone">
            <span class="fp-community-card-wallpaper" aria-hidden="true"></span>
            <div class="fp-community-identity">${photo}<div class="fp-community-identity-copy"><h3>${escapeHTML(u.name)}</h3><p class="fp-community-role-line"><span>${escapeHTML(school)}</span>${positionMarkup}${titleMarkup}${status}</p>${registrationYearMarkup}</div></div>
            <hr class="fp-community-divider">
          </div>
          <div class="fp-community-stats" aria-label="Participação no jornal">
            <div class="fp-community-stat" aria-label="${u.stats.contributions} colaborações"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3.2"/><path d="M3.5 19v-1.2A4.8 4.8 0 0 1 8.3 13h1.4a4.8 4.8 0 0 1 4.8 4.8V19M16 5.5a3 3 0 0 1 0 5.8m1.2 2.3a4.5 4.5 0 0 1 3.3 4.3V19"/></svg><strong>${u.stats.contributions}</strong><span class="sr-only">colaborações</span></div>
            <div class="fp-community-stat" aria-label="${u.stats.achievements.length} conquistas"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 4h8v5a4 4 0 0 1-8 0V4ZM8 6H4v2a4 4 0 0 0 4 4m8-6h4v2a4 4 0 0 1-4 4M12 13v4m-4 3h8"/></svg><strong>${u.stats.achievements.length}</strong><span class="sr-only">conquistas</span></div>
          </div>
        </a>`;
      }).join(''):`<div class="about-profile-empty col-span-full">Nenhum perfil corresponde aos filtros atuais.</div>`;
      grid.querySelectorAll('.fp-community-profile-card[data-profile-background]').forEach(cardEl=>{
        const url=String(cardEl.dataset.profileBackground||'');
        try{const parsed=new URL(url);if(parsed.protocol!=='https:'||!parsed.hostname)return;const safe=parsed.href.replace(/[\"\\]/g,ch=>encodeURIComponent(ch));cardEl.style.setProperty('--fp-community-wallpaper-image',`url(\"${safe}\")`);cardEl.style.setProperty('--fp-community-wallpaper-position',`${cardEl.dataset.profileBackgroundX||50}% ${cardEl.dataset.profileBackgroundY||50}%`);cardEl.style.setProperty('--fp-community-wallpaper-position-mobile',`${cardEl.dataset.profileBackgroundMobileX||50}% ${cardEl.dataset.profileBackgroundMobileY||50}%`);}catch(_){}
      });
    };
    search?.addEventListener('input',render);sort?.addEventListener('change',render);render();
  }

  function profileAcademicSearchText(article){
    const categories=normalizeTags(article?.categories?.length?article.categories:article?.category).join(' ');
    const dateValue=article?.isoDate||article?.date||'';
    const parsedDate=dateValue?new Date(dateValue):null;
    const formattedDate=parsedDate&&Number.isFinite(parsedDate.getTime())?parsedDate.toLocaleDateString('pt-BR'):'';
    return [article?.title,article?.subtitle,article?.excerpt,article?.category,categories,article?.contentType,article?.creativeType,article?.date,formattedDate,article?.isoDate].filter(Boolean).join(' ');
  }
  function profileAcademicAchievementSearchText(a){
    return [a?.title,a?.name,a?.year,a?.description,a?.details,Array.isArray(a?.types)?a.types.join(' '):a?.type,creditNames(a?.credits).join(' ')].filter(Boolean).join(' ');
  }

  async function initProfilePage(){
    const host=$("profile-page");if(!host)return;const params=new URLSearchParams(location.search),email=params.get('email'),requestedUid=params.get('uid');
    let u=requestedUid?readJSON(USERS_KEY,[]).find(x=>String(x?.uid||'')===String(requestedUid)&&x?.revocationMode!=='spark-plan-b'):email?publicUserByEmail(email):null;
    if(fpCloudEnabled()){
      try{
        let remote=null,remoteLookupPerformed=false;
        if(requestedUid&&window.FPCloud.loadPublicProfile){remoteLookupPerformed=true;remote=await window.FPCloud.loadPublicProfile(requestedUid);}
        else if(email&&window.FPCloud.fetchPublicProfileByEmail){remoteLookupPerformed=true;remote=await window.FPCloud.fetchPublicProfileByEmail(email);}
        if(remote&&remote.revocationMode!=='spark-plan-b'){
          u={...(u||{}),...remote,uid:String(remote.uid||u?.uid||requestedUid||'')};
          const local=readJSON(USERS_KEY,[]);
          const localRows=Array.isArray(local)?local:[];
          const map=new Map(localRows.filter(Boolean).filter(x=>x.uid&&x.revocationMode!=='spark-plan-b').map(x=>[String(x.uid),x]));
          if(u.uid)map.set(String(u.uid),{...(map.get(String(u.uid))||{}),...u});
          const merged=[...map.values(),...localRows.filter(x=>x&&!x.uid&&x.revocationMode!=='spark-plan-b')];
          writeJSON(USERS_KEY,merged);
        }else if(remoteLookupPerformed){
          // A successful remote miss means the public profile was removed; never
          // render a stale local copy. Network failures still retain offline fallback.
          u=null;
          const local=readJSON(USERS_KEY,[]),localRows=Array.isArray(local)?local:[];
          const filtered=localRows.filter(x=>{
            if(requestedUid&&String(x?.uid||'')===String(requestedUid))return false;
            if(email&&String(x?.email||'').trim().toLowerCase()===String(email).trim().toLowerCase())return false;
            return true;
          });
          writeJSON(USERS_KEY,filtered);
        }
      }catch(_){ }
    }
    if(!u){host.innerHTML='<div class="panel-surface p-8 text-center"><h1 class="text-2xl font-extrabold">Perfil não encontrado</h1><p class="mt-3 text-sm text-slate-500">Este perfil não está disponível.</p></div>';return;}
    const name=String(u.name||'').toLowerCase();
    const uid=String(u.uid||'');
    let publicArticles=getPublicNews();
    if(fpCloudEnabled()&&window.FPCloud.fetchPublicArticles){
      try{
        const remote=await window.FPCloud.fetchPublicArticles();
        if(Array.isArray(remote)){
          if(window.FPStore?.syncPublicArticles)await window.FPStore.syncPublicArticles(remote);
          else{try{localStorage.setItem(ARTICLES_KEY,JSON.stringify(remote));}catch(_){};}
          publicArticles=getPublicNews();
        }
      }catch(_){}
    }
    const activity=profileActivityStats(u,publicArticles);
    const achievements=readJSON('fp_achievements',[]).filter(a=>{
      if(a?.visible===false)return false;
      const credits=creditRawEntries(a?.credits);
      const profiles=Array.isArray(a?.creditProfiles)?a.creditProfiles:[];
      const userNameKey=normalizeIdentityText(u?.name||'',true);
      return (userNameKey && normalizeIdentityText(a?.name||'',true).includes(userNameKey))
        || credits.some(v=>identityMatches(v,null,u,u))
        || (uid&&profiles.some(v=>String(v?.uid||'').trim()===uid));
    });
    const contributions=Array.isArray(u.contributions)?u.contributions:(u.contribution?[String(u.contribution)]:[]);
    const hasAssignedTitle=Object.prototype.hasOwnProperty.call(u,'assignedTitle');
    const assignedTitle=String(u.assignedTitle||'').trim();
    const assignedTitleMarkup=assignedTitle?`<div class="mt-3 flex flex-wrap justify-center sm:justify-start gap-1.5"><span class="rounded-full bg-[#F2F7F3] px-2.5 py-1 text-[11px] font-extrabold text-[#1B5E20] dark:bg-[#242D25] dark:text-[#81C784]">${escapeHTML(assignedTitle)}</span></div>`:'';
    const legacyContributionsMarkup=!hasAssignedTitle&&contributions.length?`<div class="mt-3 flex flex-wrap justify-center sm:justify-start gap-1.5">${contributions.map(c=>`<span class="rounded-full bg-[#F2F7F3] px-2.5 py-1 text-[11px] font-extrabold text-[#1B5E20] dark:bg-[#242D25] dark:text-[#81C784]">${escapeHTML(c)}</span>`).join('')}</div>`:'';
    const authoredArticles=activity.posts;
    const textContributionArticles=activity.textArticles;
    const imageContributionArticles=activity.imageArticles;
    const researchContributionArticles=activity.researchArticles;
    // Dedicated filters must show only this contribution type. When the article's
    // author owns every editorial credit, profileActivityStats exposes it as diagramming
    // rather than duplicating the same article under text/image/research.
    const textArticles=activity.textDisplay||activity.textArticles;
    const imageArticles=activity.imageDisplay||activity.imageArticles;
    const researchArticles=activity.researchDisplay||activity.researchArticles;
    const articles=authoredArticles;
    const initials=escapeHTML(String(u.name||'?').split(/\s+/).map(x=>x[0]).slice(0,2).join('').toUpperCase());
    const profileSocialPlatform=(name,url)=>{
      let host='';try{host=new URL(url).hostname.toLowerCase().replace(/^www\./,'');}catch(_){}
      const value=`${String(name||'').toLowerCase()} ${host}`;
      if(/instagram|instagr\.am/.test(value))return ['Instagram','◎'];
      if(/tiktok/.test(value))return ['TikTok','♪'];
      if(/github/.test(value))return ['GitHub','⌘'];
      if(/youtube|youtu\.be/.test(value))return ['YouTube','▶'];
      if(/linkedin/.test(value))return ['LinkedIn','in'];
      if(/facebook|fb\.com/.test(value))return ['Facebook','f'];
      if(/twitter|(^|\s)x($|\s)|x\.com/.test(value))return ['X','𝕏'];
      if(/twitch/.test(value))return ['Twitch','▰'];
      if(/discord/.test(value))return ['Discord','◉'];
      return [String(name||'Site'), '↗'];
    };
    const profileSocialLinks=(Array.isArray(u.socialLinks)?u.socialLinks:[]).slice(0,3).map(item=>{
      const label=String(item?.name||'').trim().slice(0,40),rawUrl=String(item?.url||'').trim();
      if(!label||!rawUrl)return null;
      try{const parsed=new URL(/^https?:\/\//i.test(rawUrl)?rawUrl:`https://${rawUrl}`);if(!['http:','https:'].includes(parsed.protocol)||!parsed.hostname||parsed.username||parsed.password)return null;const platform=profileSocialPlatform(label,parsed.href);return {name:label,url:parsed.href,platform:platform[0],mark:platform[1],iconUrl:normalizeSocialIconSource(item?.iconUrl||'')};}catch(_){return null;}
    }).filter(Boolean);
    const socialMarkup=profileSocialLinks.length?`<nav class="profile-public-socials" aria-label="Redes e sites de ${escapeHTML(u.name)}">${profileSocialLinks.map(link=>`<a class="profile-public-social-link" href="${escapeHTML(link.url)}" target="_blank" rel="noopener noreferrer" aria-label="Abrir ${escapeHTML(link.name)} em nova aba" title="${escapeHTML(link.name)}"><span class="profile-public-social-icon" aria-hidden="true">${link.iconUrl?`<img src="${escapeHTML(link.iconUrl)}" alt="" loading="lazy">`:escapeHTML(link.mark)}</span><span class="sr-only">${escapeHTML(link.name)}</span></a>`).join('')}</nav>`:'<p class="fp-profile-no-socials">Nenhuma rede social adicionada.</p>';
    const allContributionArticles=[...new Map((activity.articles||[]).map(a=>[String(a?.id||''),a]).filter(([id])=>id)).values()].sort((a,b)=>publicDateTime(b.isoDate||b.approvedAt||b.publishedAt||b.createdAt||b.date)-publicDateTime(a.isoDate||a.approvedAt||a.publishedAt||a.createdAt||a.date));
    const orderedAchievements=achievements.slice().sort((a,b)=>achievementTimestamp(b)-achievementTimestamp(a));
    const roleLabel=editorialDisplayTitle(u.role);
    const rawSchoolLabel=String(u.schoolYear||'').trim();
    const positionLabel=String(u.assignedTitle||'').trim();
    // Cargos profissionais substituem a indicação de ano escolar no cartão público.
    // Não mudamos os dados da conta; cargos editoriais só são exibidos para funções editoriais.
    const professionalPositions=new Set(['Professor(a)','Pedagogo(a)','Diretor(a)','Secretário(a)','Secretário(a) e Pedagogo(a)']);
    const hasProfessionalPosition=professionalPositions.has(positionLabel);
    const schoolLabel=hasProfessionalPosition
      ? positionLabel
      : rawSchoolLabel?`Estudante do ${rawSchoolLabel}`:'Ano escolar não informado';
    const displayedPositionLabel=hasProfessionalPosition?'':positionLabel;
    const accountActive=u.accessRevoked!==true&&u.accountActive!==false;
    const profilePhoto=u.avatar?`<img src="${escapeHTML(u.avatar)}" alt="Foto de ${escapeHTML(u.name)}" class="fp-profile-large-avatar" loading="eager">`:`<div class="fp-profile-large-avatar fp-profile-avatar-placeholder" aria-label="Sem foto de perfil">${initials}</div>`;
    const profileArticleCard=(a)=>`<div class="fp-profile-carousel-item" data-profile-carousel-card data-academic-search="${escapeHTML(profileAcademicSearchText(a))}">${card({...a,__profileCard:true})}</div>`;
    const profileAchievementCard=(a)=>`<article class="fp-profile-carousel-item fp-profile-achievement-card" data-profile-carousel-card data-academic-search="${escapeHTML(profileAcademicAchievementSearchText(a))}"><a class="fp-profile-achievement-image" href="conquistas.html#achievement-${encodeURIComponent(String(a.id||''))}" aria-label="Ver conquista ${escapeHTML(a.title||a.name||'')} ">${a.image?imageCropMarkup(a.image,a.imageCrop,`Imagem da conquista ${a.title||a.name||'Conquista'}`,'','lazy'):`<span aria-hidden="true">🏆</span>`}</a><div class="fp-profile-achievement-body"><p>${escapeHTML((Array.isArray(a.types)&&a.types.length?a.types:[a.type||'Conquista']).join(' · '))}</p><h3>${escapeHTML(a.title||a.name||'Conquista')}</h3><div class="fp-profile-achievement-meta">${escapeHTML(a.name||'Comunidade escolar')} <span aria-hidden="true">•</span> ${escapeHTML(achievementDateLabel(a))}</div>${a.description?`<p class="fp-profile-achievement-summary">${escapeHTML(a.description)}</p>`:''}<button type="button" data-achievement-details="${escapeHTML(a.id)}">Ver conquista <span aria-hidden="true">→</span></button></div></article>`;
    const filterItems={
      diagramming:{title:'Últimas matérias com contribuição em diagramação',items:authoredArticles,empty:'Nenhuma matéria com contribuição de diagramação.'},
      research:{title:'Últimas matérias com contribuição em pesquisa',items:researchArticles,empty:'Nenhuma matéria com contribuição de pesquisa.'},
      text:{title:'Últimas matérias com contribuição em texto',items:textArticles,empty:'Nenhuma matéria com contribuição em texto.'},
      image:{title:'Últimas matérias com contribuição em imagem',items:imageArticles,empty:'Nenhuma matéria com contribuição em imagem.'},
      achievements:{title:'Conquistas deste perfil',items:orderedAchievements,empty:'Nenhuma conquista vinculada a este perfil.',achievement:true}
    };
    const filteredSections=Object.entries(filterItems).map(([key,config])=>`<section id="profile-section-${key}" class="fp-profile-filter-results" data-profile-filter-section data-profile-section-key="${key}" hidden><div class="fp-profile-section-heading"><div><p class="fp-profile-section-kicker">Contribuições</p><h2>${config.title}</h2><p class="fp-profile-result-count" data-profile-result-count>${config.items.length} ${config.achievement?'conquistas':'matérias'}</p></div></div><div class="fp-profile-filter-grid" data-profile-filter-grid>${config.items.map(item=>config.achievement?`<div id="profile-achievement-${Array.from(String(item?.id||item?.title||item?.name||'conquista')).map(char=>char.codePointAt(0).toString(16)).join('-')}" class="fp-profile-filter-card" data-academic-card data-academic-search="${escapeHTML(profileAcademicAchievementSearchText(item))}">${profileAchievementCard(item)}</div>`:`<div class="fp-profile-filter-card" data-academic-card data-academic-search="${escapeHTML(profileAcademicSearchText(item))}">${card({...item,__profileCard:true})}</div>`).join('')||`<p class="fp-profile-empty">${config.empty}</p>`}</div><p class="fp-profile-empty fp-profile-no-search-results" hidden>Nenhum resultado corresponde à pesquisa.</p></section>`).join('');
    const defaultContributionMarkup=allContributionArticles.map(profileArticleCard).join('')||'<p class="fp-profile-empty" data-profile-default-empty>Nenhuma contribuição publicada até o momento.</p>';
    const defaultAchievementMarkup=orderedAchievements.map(profileAchievementCard).join('')||'<p class="fp-profile-empty" data-profile-default-empty>Nenhuma conquista publicada até o momento.</p>';
    host.innerHTML=`<div class="fp-public-profile-page"><div class="fp-profile-paper-backdrop" data-profile-paper aria-hidden="true"></div><div class="fp-profile-topbar"><button type="button" data-profile-back class="fp-profile-back-button"><span aria-hidden="true">←</span> Voltar</button></div><div class="fp-public-profile-layout"><aside class="fp-profile-sidebar"><div class="fp-profile-avatar-overlap">${profilePhoto}</div><section class="fp-profile-identity-card"><h1>${escapeHTML(u.name||'Perfil público')}</h1><p class="fp-profile-role-line"><span>${escapeHTML(schoolLabel)}</span>${displayedPositionLabel?`<i aria-hidden="true">•</i><span>${escapeHTML(displayedPositionLabel)}</span>`:''}${roleLabel?`<i aria-hidden="true">•</i><span>${escapeHTML(roleLabel)}</span>`:''}</p><p class="fp-profile-bio">${escapeHTML(u.bio||'Este integrante ainda não adicionou uma biografia.')}</p><hr><div class="fp-profile-social-heading">Blog pessoal</div>${socialMarkup}</section></aside><div class="fp-profile-main"><section class="fp-profile-stats" aria-label="Resumo de participação"><div class="fp-profile-stat-card"><span class="fp-profile-stat-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M8 4h8v5a4 4 0 0 1-8 0V4ZM8 6H4v2a4 4 0 0 0 4 4m8-6h4v2a4 4 0 0 1-4 4M12 13v4m-4 3h8m-6-3h4"/></svg></span><div><span>Conquistas</span><strong>${orderedAchievements.length}</strong></div></div><div class="fp-profile-stat-card"><span class="fp-profile-stat-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3"/><path d="M3.5 19v-1.2A4.8 4.8 0 0 1 8.3 13h1.4a4.8 4.8 0 0 1 4.8 4.8V19M16 5.5a3 3 0 0 1 0 5.8m1.2 2.3a4.5 4.5 0 0 1 3.3 4.3V19"/></svg></span><div><span>Colaborações</span><strong>${allContributionArticles.length}</strong></div></div></section><section class="fp-profile-filter-panel" aria-label="Filtrar contribuições"><p class="fp-profile-section-kicker">Explorar atividade</p><div class="fp-profile-filter-buttons" role="group" aria-label="Tipo de contribuição">${[['diagramming','Diagramação'],['research','Pesquisa'],['text','Texto'],['image','Imagem'],['achievements','Conquista']].map(([key,label])=>`<button type="button" data-profile-toggle="${key}" aria-pressed="false">${label}</button>`).join('')}</div></section><section class="fp-profile-search-panel"><label for="profile-academic-search">Pesquisar no perfil</label><div class="fp-profile-search-control"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 4.5 4.5"/></svg><input id="profile-academic-search" class="site-input" type="search" placeholder="Buscar por título, tema, data ou subtítulo…" autocomplete="off"></div></section><div id="profile-default-content" data-profile-default-content><section class="fp-profile-module" id="profile-latest-contributions-section"><div class="fp-profile-module-heading"><div><p class="fp-profile-section-kicker">Participação na comunidade</p><h2>Últimas contribuições</h2></div><span class="fp-profile-module-count">${allContributionArticles.length}</span></div><div class="fp-profile-carousel-wrap"><button type="button" class="fp-profile-carousel-arrow is-prev" data-profile-carousel-prev="contributions" aria-label="Ver contribuições mais recentes" hidden>‹</button><div class="fp-profile-carousel-viewport" id="profile-contributions-viewport"><div class="fp-profile-carousel-track" id="profile-contributions-track">${defaultContributionMarkup}</div></div><button type="button" class="fp-profile-carousel-arrow is-next" data-profile-carousel-next="contributions" aria-label="Ver contribuições anteriores" hidden>›</button></div><p class="fp-profile-empty fp-profile-no-default-results" data-profile-empty-for="contributions" hidden>Nenhuma contribuição corresponde à pesquisa.</p></section><section class="fp-profile-module" id="profile-latest-achievements-section"><div class="fp-profile-module-heading"><div><p class="fp-profile-section-kicker">Reconhecimento</p><h2>Mural de conquistas</h2></div><a href="conquistas.html">Ver mural <span aria-hidden="true">→</span></a></div><div class="fp-profile-carousel-wrap"><button type="button" class="fp-profile-carousel-arrow is-prev" data-profile-carousel-prev="achievements" aria-label="Ver conquistas mais recentes" hidden>‹</button><div class="fp-profile-carousel-viewport" id="profile-achievements-viewport"><div class="fp-profile-carousel-track" id="profile-achievements-track">${defaultAchievementMarkup}</div></div><button type="button" class="fp-profile-carousel-arrow is-next" data-profile-carousel-next="achievements" aria-label="Ver conquistas anteriores" hidden>›</button></div><p class="fp-profile-empty fp-profile-no-default-results" data-profile-empty-for="achievements" hidden>Nenhuma conquista corresponde à pesquisa.</p></section></div>${filteredSections}</div></div></div>`;
    const paper=host.querySelector('[data-profile-paper]');
    if(paper){
      const rawBackground=String(u.profileBackgroundImage||'').trim();
      const backgroundURL=safeProfileBackgroundUrl(rawBackground);
      if(backgroundURL){const safeBackgroundURL=backgroundURL.replace(/[\s"'\\]/g,ch=>`%${ch.charCodeAt(0).toString(16).padStart(2,'0')}`);paper.style.backgroundImage=`url("${safeBackgroundURL}")`;}
      const crop=u.profileBackgroundCrop&&typeof u.profileBackgroundCrop==='object'?u.profileBackgroundCrop:{};
      const point=(x,y)=>`${Math.max(0,Math.min(100,Number(x)||50))}% ${Math.max(0,Math.min(100,Number(y)||50))}%`;
      paper.style.setProperty('--fp-profile-paper-position-desktop',point(crop.desktopX,crop.desktopY));
      paper.style.setProperty('--fp-profile-paper-position-mobile',point(crop.mobileX,crop.mobileY));
      const updatePaperWidth=()=>{if(window.matchMedia('(max-width: 767px)').matches){paper.style.width='100%';paper.style.maxWidth='100vw';return;}const sidebar=host.querySelector('.fp-profile-sidebar');if(!sidebar)return;const rect=sidebar.getBoundingClientRect();paper.style.width=`${Math.min(window.innerWidth,Math.max(280,Math.ceil(rect.right+18)))}px`;paper.style.maxWidth='100vw';};
      updatePaperWidth();if(host.__fpPaperResize)window.removeEventListener('resize',host.__fpPaperResize);host.__fpPaperResize=updatePaperWidth;window.addEventListener('resize',updatePaperWidth,{passive:true});
    }
    document.body.classList.add('fp-profile-scroll-shell');
    if(!host.dataset.fpProfileAchievementImageFallbackBound){
      host.dataset.fpProfileAchievementImageFallbackBound='1';
      host.addEventListener('error',event=>{
        const image=event.target;
        if(!(image instanceof HTMLImageElement))return;
        if(image.matches('.fp-profile-achievement-image img')){
          const fallback=document.createElement('span');fallback.className='fp-achievement-image-fallback';fallback.setAttribute('aria-hidden','true');fallback.textContent='🏆';image.replaceWith(fallback);return;
        }
        if(image.matches('.profile-public-social-icon img')){
          const link=image.closest('.profile-public-social-link');const mark=profileSocialPlatform(link?.title||'',link?.href||'')[1]||'↗';
          const fallback=document.createElement('span');fallback.textContent=mark;fallback.setAttribute('aria-hidden','true');image.replaceWith(fallback);return;
        }
        if(image.matches('img.fp-profile-large-avatar')){
          const fallback=document.createElement('div');fallback.className='fp-profile-large-avatar fp-profile-avatar-placeholder';fallback.setAttribute('aria-label','Sem foto de perfil');
          fallback.textContent=String(image.alt||'Perfil').replace(/^Foto de\s*/i,'').trim().split(/\s+/).filter(Boolean).slice(0,2).map(part=>part[0]).join('').toUpperCase()||'?';image.replaceWith(fallback);
        }
      },true);
    }
    host.querySelector('[data-profile-back]')?.addEventListener('click',()=>{if(history.length>1)history.back();else location.href='sobre.html';});
    const sections=[...host.querySelectorAll('[data-profile-filter-section]')];
    const toggles=[...host.querySelectorAll('[data-profile-toggle]')];
    const searchInput=host.querySelector('#profile-academic-search');
    let activeFilter='';
    const setActiveFilter=(key)=>{activeFilter=key||'';toggles.forEach(button=>{const active=button.dataset.profileToggle===activeFilter;button.classList.toggle('is-active',active);button.setAttribute('aria-pressed',String(active));});renderProfileContent();};
    const normalizeSearch=value=>normalizeIdentityText(value,true).trim();
    const updateCarouselArrows=(key)=>{
      const viewport=host.querySelector(key==='contributions'?'#profile-contributions-viewport':'#profile-achievements-viewport');
      const prev=host.querySelector(`[data-profile-carousel-prev="${key}"]`),next=host.querySelector(`[data-profile-carousel-next="${key}"]`);
      if(!viewport||!prev||!next)return;
      const max=Math.max(0,viewport.scrollWidth-viewport.clientWidth),atStart=viewport.scrollLeft<=2,atEnd=viewport.scrollLeft>=max-2;
      prev.hidden=max<=4||atStart;next.hidden=max<=4||atEnd;
    };
    const updateAllCarouselArrows=()=>{updateCarouselArrows('contributions');updateCarouselArrows('achievements');};
    const renderProfileContent=()=>{
      const query=normalizeSearch(searchInput?.value||'');
      const defaultContent=host.querySelector('#profile-default-content');
      if(defaultContent)defaultContent.hidden=Boolean(activeFilter);
      sections.forEach(section=>{const active=section.dataset.profileSectionKey===activeFilter;section.hidden=!active;if(!active)return;
        const cards=[...section.querySelectorAll('[data-academic-card]')];let visibleCount=0;
        cards.forEach(item=>{const hay=normalizeSearch(item.dataset.academicSearch||item.textContent||'');const show=!query||hay.includes(query);item.classList.toggle('hidden',!show);if(show)visibleCount++;});
        const count=section.querySelector('[data-profile-result-count]');if(count)count.textContent=`${visibleCount} ${section.dataset.profileSectionKey==='achievements'?'conquistas':'matérias'}`;
        const noResults=section.querySelector('.fp-profile-no-search-results');if(noResults)noResults.hidden=!query||visibleCount>0;
      });
      if(!activeFilter){
        [['contributions','#profile-contributions-track'],['achievements','#profile-achievements-track']].forEach(([key,selector])=>{
          const track=host.querySelector(selector);if(!track)return;const cards=[...track.querySelectorAll('[data-profile-carousel-card]')];let visibleCount=0;
          cards.forEach(item=>{const hay=normalizeSearch(item.dataset.academicSearch||item.textContent||'');const show=!query||hay.includes(query);item.classList.toggle('hidden',!show);if(show)visibleCount++;});
          const empty=host.querySelector(`[data-profile-empty-for="${key}"]`);if(empty)empty.hidden=!query||visibleCount>0;
          const section=host.querySelector(key==='contributions'?'#profile-latest-contributions-section':'#profile-latest-achievements-section');if(section)section.hidden=Boolean(query)&&visibleCount===0;
          const viewport=host.querySelector(key==='contributions'?'#profile-contributions-viewport':'#profile-achievements-viewport');if(viewport)viewport.scrollLeft=0;
        });
      }
      requestAnimationFrame(updateAllCarouselArrows);
    };
    toggles.forEach(button=>button.addEventListener('click',()=>setActiveFilter(activeFilter===button.dataset.profileToggle?'':button.dataset.profileToggle)));
    searchInput?.addEventListener('input',renderProfileContent);
    [['contributions','#profile-contributions-viewport'],['achievements','#profile-achievements-viewport']].forEach(([key,selector])=>{
      const viewport=host.querySelector(selector);viewport?.addEventListener('scroll',()=>requestAnimationFrame(()=>updateCarouselArrows(key)),{passive:true});
      host.querySelector(`[data-profile-carousel-prev="${key}"]`)?.addEventListener('click',()=>viewport?.scrollBy({left:-Math.max(240,viewport.clientWidth*.88),behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'}));
      host.querySelector(`[data-profile-carousel-next="${key}"]`)?.addEventListener('click',()=>viewport?.scrollBy({left:Math.max(240,viewport.clientWidth*.88),behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'}));
    });
    const requestedHash=String(location.hash||'').slice(1);
    const requestedSection=requestedHash.replace(/^profile-section-/,'');
    const filterKeys=['diagramming','research','text','image','achievements'];
    if(requestedHash.startsWith('profile-achievement-')){
      setActiveFilter('achievements');
      requestAnimationFrame(()=>{const target=document.getElementById(requestedHash);if(target&&host.contains(target))target.scrollIntoView({behavior:'auto',block:'center'});});
    }else if(requestedHash.startsWith('profile-section-')&&filterKeys.includes(requestedSection)){
      setActiveFilter(requestedSection);
      requestAnimationFrame(()=>host.querySelector(`[data-profile-section-key="${CSS.escape(requestedSection)}"]`)?.scrollIntoView({behavior:'auto',block:'start'}));
    }else renderProfileContent();
    host.addEventListener('click',e=>{
      const btn=e.target.closest('[data-achievement-details]');if(!btn)return;
      const a=achievements.find(x=>String(x.id)===String(btn.dataset.achievementDetails));if(!a)return;
      let modal=document.getElementById('profile-achievement-details-modal');
      if(!modal){modal=document.createElement('div');modal.id='profile-achievement-details-modal';modal.className='fp-public-detail-backdrop fixed inset-0 z-[10030] hidden items-center justify-center bg-black/60 p-3 sm:p-6';modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');modal.setAttribute('aria-labelledby','profile-achievement-details-title');modal.innerHTML='<article class="fp-public-detail-modal fp-achievement-detail-modal"><button type="button" class="fp-public-detail-close" data-detail-modal-close aria-label="Fechar conquista">×</button><div class="fp-public-detail-content"><p class="fp-public-detail-kicker">Conquista da comunidade</p><h2 id="profile-achievement-details-title"></h2><div id="profile-achievement-details-body"></div></div></article>';document.body.appendChild(modal);bindPublicDetailModal(modal);}
      modal.querySelector('#profile-achievement-details-title').textContent=a.title||a.name||'Conquista';modal.querySelector('#profile-achievement-details-body').innerHTML=achievementDetailsMarkup(a);modal.classList.remove('hidden');modal.classList.add('flex');modal.querySelector('[data-detail-modal-close]')?.focus({preventScroll:true});
    });
    bindReactionButtons(host);

  }

  setupAccessibility(); initMenu(); initVisitorWelcome(); renderHome(); initFeed(); initSingle(); initSuggestionsPage(); initAchievementsPage();
  try{initAboutDirectory();}catch(error){console.error('[Folha do Paiquerê] falha ao montar diretório público:',error);}
  try{await initProfilePage();}catch(error){console.error('[Folha do Paiquerê] falha ao montar perfil público:',error);}
  window.addEventListener('fp:articles-updated',()=>{ try{renderHome();initFeed();initSingle();}catch(_){}; try{initAboutDirectory();}catch(_){}; Promise.resolve(initProfilePage()).catch(()=>{}); });
  window.addEventListener('fp:profiles-updated',()=>{ try{initAboutDirectory();}catch(_){}; Promise.resolve(initProfilePage()).catch(()=>{}); });

  window.addEventListener('beforeunload',()=>{if('speechSynthesis'in window)speechSynthesis.cancel();});
})();
