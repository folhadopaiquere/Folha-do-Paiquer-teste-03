(() => {
  'use strict';
  const fpCloudEnabled = () => { const state = window.FPCloud?.enabled; return typeof state === 'function' ? Boolean(state()) : Boolean(state); };
  const DB_NAME='folhaPaiquereDB';
  const DB_VERSION=2;
  const STORE='articles';
  const USER_STORE='users';
  const INDEX_KEY='fp_article_index';
  const PENDING_CLOUD_KEY='fp_pending_article_sync';
  let cache=[];
  let userCache=[];
  let dbPromise=null;
  const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
  function open(){
    if(!('indexedDB' in window)) return Promise.resolve(null);
    if(dbPromise)return dbPromise;
    dbPromise=new Promise(resolve=>{
      try{
        const req=indexedDB.open(DB_NAME,DB_VERSION);
        req.onupgradeneeded=()=>{const db=req.result;if(!db.objectStoreNames.contains(STORE))db.createObjectStore(STORE,{keyPath:'id'});if(!db.objectStoreNames.contains(USER_STORE))db.createObjectStore(USER_STORE,{keyPath:'email'});};
        req.onsuccess=()=>resolve(req.result); req.onerror=()=>resolve(null);
      }catch(_){resolve(null)}
    });
    return dbPromise;
  }
  const readLocal=(key,fallback)=>{try{const r=localStorage.getItem(key);return r?JSON.parse(r):fallback}catch(_){return fallback}};
  const localRead=()=>readLocal('fp_articles',[]);
  function writeIndex(items){
    const index=(Array.isArray(items)?items:[]).map(a=>({id:String(a.id),status:a.status||'Rascunho',visible:a.visible!==false,title:a.title||'',subtitle:a.subtitle||'',category:a.category||'',contentType:a.contentType||'informacional',creativeType:a.creativeType||'',author:a.author||'',authorEmail:a.authorEmail||'',date:a.date||'',updatedAt:a.updatedAt||'',approvedAt:a.approvedAt||'',coverURL:a.coverURL||'',thumbURL:a.thumbURL||'',views:Number(a.views||0),likes:Number(a.likes||0),dislikes:Number(a.dislikes||0)}));
    try{localStorage.setItem(INDEX_KEY,JSON.stringify(index));return true}catch(_){return false}
  }
  async function getDB(){const db=await open();if(!db)return [];return new Promise(resolve=>{try{const tx=db.transaction(STORE,'readonly'),req=tx.objectStore(STORE).getAll();req.onsuccess=()=>resolve(Array.isArray(req.result)?req.result:[]);req.onerror=()=>resolve([]);}catch(_){resolve([])}})}
  async function getUsersDB(){const db=await open();if(!db)return [];return new Promise(resolve=>{try{const tx=db.transaction(USER_STORE,'readonly'),req=tx.objectStore(USER_STORE).getAll();req.onsuccess=()=>resolve(Array.isArray(req.result)?req.result:[]);req.onerror=()=>resolve([]);}catch(_){resolve([])}})}
  async function putUsers(items){const db=await open();if(!db)return false;return new Promise(resolve=>{try{const tx=db.transaction(USER_STORE,'readwrite'),store=tx.objectStore(USER_STORE);store.clear();(items||[]).forEach(u=>{if(u?.email)store.put(clone(u))});tx.oncomplete=()=>resolve(true);tx.onerror=()=>resolve(false);tx.onabort=()=>resolve(false);}catch(_){resolve(false)}})}
  async function putAll(items){const db=await open();if(!db)return false;return new Promise(resolve=>{try{const tx=db.transaction(STORE,'readwrite'),store=tx.objectStore(STORE);store.clear();(items||[]).forEach(a=>{if(a?.id)store.put(clone(a))});tx.oncomplete=()=>resolve(true);tx.onerror=()=>resolve(false);tx.onabort=()=>resolve(false);}catch(_){resolve(false)}})}
  async function putOne(item){
    const db=await open();
    if(!db || !item?.id) return false;
    return new Promise(resolve=>{
      try{
        const tx=db.transaction(STORE,'readwrite');
        tx.objectStore(STORE).put(clone(item));
        tx.oncomplete=()=>resolve(true);
        tx.onerror=()=>resolve(false);
        tx.onabort=()=>resolve(false);
      }catch(_){resolve(false)}
    });
  }
  async function deleteOne(id){
    const db=await open();
    if(!db || !id) return false;
    return new Promise(resolve=>{
      try{
        const tx=db.transaction(STORE,'readwrite');
        tx.objectStore(STORE).delete(String(id));
        tx.oncomplete=()=>resolve(true);
        tx.onerror=()=>resolve(false);
        tx.onabort=()=>resolve(false);
      }catch(_){resolve(false)}
    });
  }
  const withTimeout=(promise,ms,message)=>Promise.race([promise,new Promise((_,reject)=>setTimeout(()=>reject(new Error(message)),ms))]);
  const getPendingCloudIds=()=>{try{const raw=localStorage.getItem(PENDING_CLOUD_KEY);const parsed=raw?JSON.parse(raw):[];return Array.isArray(parsed)?parsed.map(String):[]}catch(_){return []}};
  const setPendingCloudIds=ids=>{try{localStorage.setItem(PENDING_CLOUD_KEY,JSON.stringify([...new Set((ids||[]).map(String))]));}catch(_){}};
  const markPendingCloud=id=>{const ids=getPendingCloudIds();if(!ids.includes(String(id))){ids.push(String(id));setPendingCloudIds(ids);}};
  const clearPendingCloud=id=>setPendingCloudIds(getPendingCloudIds().filter(x=>x!==String(id)));
  async function upsertOne(item, options={}){
    if(!item?.id) throw new Error('A matéria precisa ter um identificador.');
    const nextItem=clone(item);
    let cloudWrite=options.cloud===true && Boolean(fpCloudEnabled());
    if(cloudWrite && window.FPCloud?.waitForAuth) await window.FPCloud.waitForAuth();
    cloudWrite=cloudWrite && Boolean(window.FPCloud?.getAuthUser?.());
    const cloudRequired=options.cloudRequired===true;
    if (typeof options.onProgress === 'function') options.onProgress(4, 'Preservando a matéria neste dispositivo…');

    // Primeiro preserva no navegador. Assim, uma falha/rede lenta no Firebase
    // nunca apaga o trabalho que acabou de ser escrito pelo usuário.
    let stored=nextItem;
    const current=Array.isArray(cache)?cache:[];
    const index=current.findIndex(a=>String(a.id)===String(stored.id));
    const previousStored=index>=0?clone(current[index]):null;
    const restorePreviousLocal=async()=>{
      cache=(Array.isArray(cache)?cache:[]).filter(a=>String(a.id)!==String(stored.id));
      let safeLocal=null;
      if(previousStored && String(previousStored.status||'')!=='Aprovado'){
        // Se a publicação falhar, conserva o conteúdo recém-editado como trabalho
        // não publicado, mas restaura os metadados do fluxo editorial anterior.
        safeLocal=clone(stored);
        const workflowFields=['status','visible','approvedAt','editorEditUntil','publicationHistoryLegacy','feedback','correctionCycle'];
        workflowFields.forEach(key=>{
          if(Object.prototype.hasOwnProperty.call(previousStored,key))safeLocal[key]=clone(previousStored[key]);
          else delete safeLocal[key];
        });
        safeLocal.status=previousStored.status||'Rascunho';
        if(safeLocal.status!=='Aprovado')safeLocal.visible=false;
      }else if(previousStored){
        // Nunca substitui uma publicação já aprovada por conteúdo que o servidor
        // recusou. A edição permanece aberta para o autor tentar salvar como rascunho.
        safeLocal=clone(previousStored);
      }else{
        // A falha não apaga um novo trabalho: mantém como rascunho não visível.
        safeLocal=clone(stored);
        safeLocal.status='Rascunho';safeLocal.visible=false;
        ['approvedAt','editorEditUntil','publicationHistoryLegacy'].forEach(key=>delete safeLocal[key]);
        safeLocal.feedback=String(safeLocal.feedback||'');
      }
      if(safeLocal)cache.push(safeLocal);
      cache.sort((a,b)=>new Date(b.updatedAt||b.date||0)-new Date(a.updatedAt||a.date||0));
      clearPendingCloud(stored.id);writeIndex(cache);
      try{localStorage.setItem('fp_articles',JSON.stringify(cache));}catch(_){}
      if(safeLocal)await putOne(safeLocal);else await deleteOne(stored.id);
      if(typeof CustomEvent==='function')window.dispatchEvent(new CustomEvent('fp:articles-updated',{detail:clone(cache)}));
    };
    if(index>=0) current[index]=stored; else current.push(stored);
    cache=current.sort((a,b)=>new Date(b.updatedAt||b.date||0)-new Date(a.updatedAt||a.date||0));
    let localOK=true;
    try{localStorage.setItem('fp_articles',JSON.stringify(cache));}catch(_){localOK=false;}
    const dbOK=await putOne(stored);
    writeIndex(cache);
    if (typeof options.onProgress === 'function') options.onProgress(cloudWrite ? 8 : 100, cloudWrite ? 'Matéria preservada. Preparando sincronização…' : 'Matéria salva.');
    if(!dbOK && !localOK) throw new Error('Não foi possível persistir a matéria neste navegador.');
    if(typeof CustomEvent==='function') window.dispatchEvent(new CustomEvent('fp:articles-updated',{detail:clone(cache)}));

    if(!cloudWrite){
      if(cloudRequired&&fpCloudEnabled()){
        const error=new Error('A sessão do Firebase não está disponível. O conteúdo foi preservado neste dispositivo, mas a operação não foi confirmada no servidor. Entre novamente e tente de novo.');
        error.code='folha/auth-required';
        if(options.rollbackLocalOnCloudFailure===true)await restorePreviousLocal();
        throw error;
      }
      return clone(stored);
    }

    // A sincronização com o Firebase é rastreada separadamente da persistência local.
    // Isso evita que a Mesa do Editor apague visualmente uma matéria recém-enviada
    // enquanto o upload de imagens/Firestore ainda termina em segundo plano.
    markPendingCloud(stored.id);
    const cloudTask=Promise.resolve().then(()=>window.FPCloud.saveArticle(nextItem,{onProgress:options.onProgress}));
    if(cloudRequired){
      let remote;
      try {
        remote=await withTimeout(cloudTask,90000,'O Firebase demorou mais de 90 segundos para confirmar o salvamento. O rascunho local foi preservado.');
        if(!remote) throw new Error('Não foi possível sincronizar esta matéria com o Firebase.');
      } catch(error) {
        const code=String(error?.code||'').toLowerCase();
        const definitiveRejection=code==='permission-denied'||code.endsWith('/permission-denied')||code==='failed-precondition'||code==='invalid-argument'||code==='folha/legacy-approval-chief-required';
        if(options.rollbackLocalOnCloudFailure===true&&definitiveRejection)await restorePreviousLocal();
        throw error;
      }
      stored=clone(remote);
      const i=cache.findIndex(a=>String(a.id)===String(stored.id));
      if(i>=0) cache[i]=stored; else cache.push(stored);
      try{localStorage.setItem('fp_articles',JSON.stringify(cache));}catch(_){}
      await putOne(stored); writeIndex(cache);
      clearPendingCloud(stored.id);
      if(typeof CustomEvent==='function') window.dispatchEvent(new CustomEvent('fp:articles-updated',{detail:clone(cache)}));
      return clone(stored);
    }

    // Rascunhos não prendem o editor esperando upload de imagens/Firestore.
    // A sincronização continua em segundo plano.
    cloudTask.then(remote=>{
      if(!remote)return;
      const i=cache.findIndex(a=>String(a.id)===String(remote.id));
      if(i>=0)cache[i]=clone(remote); else cache.push(clone(remote));
      clearPendingCloud(remote.id);
      try{localStorage.setItem('fp_articles',JSON.stringify(cache));}catch(_){}
      putOne(remote).catch(()=>{}); writeIndex(cache);
      if(typeof CustomEvent==='function') window.dispatchEvent(new CustomEvent('fp:articles-updated',{detail:clone(cache)}));
    }).catch(error=>console.warn('[Folha do Paiquerê] sincronização pendente:',error));
    return clone(stored);
  }

  async function upsertAchievement(item, options={}){
    if(!item?.id) throw new Error('A conquista precisa ter um identificador.');
    const nextItem=clone(item);
    const id=String(nextItem.id);
    const cloudRequired=options.cloudRequired===true;
    let cloudWrite=options.cloud===true && Boolean(fpCloudEnabled());
    if(cloudWrite && window.FPCloud?.waitForAuthenticatedUser) await window.FPCloud.waitForAuthenticatedUser(10000);
    else if(cloudWrite && window.FPCloud?.waitForAuth) await window.FPCloud.waitForAuth();
    cloudWrite=cloudWrite && Boolean(window.FPCloud?.getAuthUser?.());

    // Mesmo princípio usado nos rascunhos: primeiro preserva a edição localmente,
    // depois exige a confirmação remota quando o fluxo pede persistência no Firebase.
    let localOK=true;
    const all=readLocal('fp_achievements',[]);
    const list=Array.isArray(all)?all.slice():[];
    const index=list.findIndex(x=>String(x?.id)===id);
    if(index>=0) list[index]=nextItem; else list.push(nextItem);
    try{localStorage.setItem('fp_achievements',JSON.stringify(list));}catch(_){localOK=false;}
    if(typeof CustomEvent==='function') window.dispatchEvent(new CustomEvent('fp:achievements-updated',{detail:clone(list)}));

    if(!cloudWrite){
      if(cloudRequired) throw new Error('Sua sessão do Firebase ainda não está disponível. A conquista não foi confirmada no Firebase.');
      if(!localOK) throw new Error('Não foi possível preservar a conquista neste navegador.');
      return clone(nextItem);
    }

    if(typeof options.onProgress==='function') options.onProgress(8,'Conectando ao Firebase…');
    try{
      const remote=await window.FPCloud.saveAchievement(id,nextItem,{onProgress:options.onProgress});
      if(!remote?.id) throw new Error('O Firebase não confirmou o salvamento da conquista.');
      const merged={...nextItem,...clone(remote),id};
      const latest=readLocal('fp_achievements',[]);
      const arr=Array.isArray(latest)?latest.slice():[];
      const idx=arr.findIndex(x=>String(x?.id)===id);
      if(idx>=0) arr[idx]=merged; else arr.push(merged);
      try{localStorage.setItem('fp_achievements',JSON.stringify(arr));}catch(_){throw new Error('A conquista foi salva no Firebase, mas não foi possível atualizar a cópia local.');}
      if(typeof CustomEvent==='function') window.dispatchEvent(new CustomEvent('fp:achievements-updated',{detail:clone(arr)}));
      if(typeof options.onProgress==='function') options.onProgress(100,'Conquista salva no Firebase.');
      return clone(merged);
    }catch(error){
      // A cópia local permanece para não perder o preenchimento enquanto o erro remoto é mostrado.
      throw error instanceof Error ? error : new Error(String(error||'Não foi possível salvar a conquista no Firebase.'));
    }
  }

  async function removeOne(id, options={}){
    if(!id) throw new Error('Matéria inválida.');
    const cloudWrite=options.cloud===true && Boolean(fpCloudEnabled() && window.FPCloud?.getAuthUser?.());
    if(cloudWrite){
      const ok=await window.FPCloud.deleteArticle(String(id));
      if(!ok) throw new Error('Não foi possível excluir a matéria do Firebase.');
    }
    clearPendingCloud(id);
    cache=(Array.isArray(cache)?cache:[]).filter(a=>String(a.id)!==String(id));
    let localOK=true;
    try{localStorage.setItem('fp_articles',JSON.stringify(cache));}catch(_){localOK=false;}
    const dbOK=await deleteOne(String(id));
    writeIndex(cache);
    if(!dbOK && !localOK && !cloudWrite) throw new Error('Não foi possível remover a matéria localmente.');
    if(typeof CustomEvent==='function') window.dispatchEvent(new CustomEvent('fp:articles-updated',{detail:clone(cache)}));
    return true;
  }

  async function set(items, options={}){
    const previous=Array.isArray(cache)?clone(cache):[];
    const map=new Map();
    (Array.isArray(items)?items:[]).forEach(item=>{if(item&&item.id)map.set(String(item.id),clone(item));});
    const next=[...map.values()];
    const previousIds=new Set(previous.map(a=>String(a.id)));
    const nextIds=new Set(next.map(a=>String(a.id)));
    const removedIds=[...previousIds].filter(id=>!nextIds.has(id));

    let localOK=true;
    try{localStorage.setItem('fp_articles',JSON.stringify(next));}catch(_){localOK=false;}

    let dbOK=await putAll(next);
    const cloudWrite = options.cloud === true && Boolean(fpCloudEnabled() && window.FPCloud?.getAuthUser?.());
    let cloudOK=!cloudWrite;
    let cloudError=null;
    let storedNext=next;

    if(cloudWrite){
      try{
        storedNext=[];
        for(const item of next){
          const stored=await window.FPCloud.saveArticle(item);
          if(!stored) throw new Error(`Não foi possível salvar a matéria ${item.id}.`);
          storedNext.push(clone(stored));
        }
        for(const id of removedIds) await window.FPCloud.deleteArticle(id);
        cloudOK=true;
      }catch(error){
        cloudError=error;
      }
    }

    cache=clone(storedNext);
    writeIndex(cache);
    try{localStorage.setItem('fp_articles',JSON.stringify(cache));}catch(_){localOK=false;}
    if(!(await putAll(cache))) dbOK=false;

    if(cloudWrite && !cloudOK){
      throw cloudError || new Error('Não foi possível sincronizar as matérias com o Firebase.');
    }
    if(!dbOK && !localOK && !cloudOK) throw new Error('Não foi possível persistir as matérias.');
    if(typeof CustomEvent==='function')window.dispatchEvent(new CustomEvent('fp:articles-updated',{detail:clone(cache)}));
    return {localOK,dbOK,cloudOK};
  }

  async function hydrate(){
    const localUsers=readLocal('fp_users',[]),dbUsers=await getUsersDB();
    userCache=dbUsers.length?dbUsers:localUsers;
    if(userCache.length){try{localStorage.setItem('fp_users',JSON.stringify(userCache));}catch(_){};await putUsers(userCache);}
    const local=localRead(),stored=await getDB(),index=readLocal(INDEX_KEY,[]);
    const byId=new Map();
    [...local,...index,...stored].forEach(a=>{if(a&&a.id)byId.set(String(a.id),a);});
    cache=[...byId.values()].sort((a,b)=>new Date(b.updatedAt||b.date||0)-new Date(a.updatedAt||a.date||0));
    if(fpCloudEnabled()){try{const remote=await window.FPCloud.fetchPublicArticles();if(Array.isArray(remote)&&remote.length){const map=new Map(cache.map(a=>[String(a.id),a]));remote.forEach(a=>map.set(String(a.id),a));cache=[...map.values()].sort((a,b)=>new Date(b.updatedAt||b.date||0)-new Date(a.updatedAt||a.date||0));writeIndex(cache);try{localStorage.setItem('fp_articles',JSON.stringify(cache));}catch(_){}}}catch(_){} }
    if(cache.length){writeIndex(cache);try{localStorage.setItem('fp_articles',JSON.stringify(cache));}catch(_){};await putAll(cache);}
    return cache;
  }
  async function setUsers(items){
    userCache=Array.isArray(items)?clone(items):[];
    try{localStorage.setItem('fp_users',JSON.stringify(userCache));}catch(_){}
    await putUsers(userCache);
    if(fpCloudEnabled()){
      try{
        for(const u of userCache){
          if(!u.uid) continue;
          await window.FPCloud.saveEditorialUser(u.uid,{name:u.name||'',role:u.role||'Estudante',bio:u.bio||'',academicHistory:u.academicHistory||'',profileYear:u.profileYear||'',contributions:Array.isArray(u.contributions)?u.contributions:[],avatar:u.avatar||'',accessRevoked:Boolean(u.accessRevoked)});
          if(typeof window.FPCloud.syncPublicProfileFromUser==='function') await window.FPCloud.syncPublicProfileFromUser(u.uid);
          else await window.FPCloud.savePublicProfile(u.uid,u);
        }
      }catch(_){}
    }
    return userCache;
  }
  async function syncPublicArticles(items){
    const remote=Array.isArray(items)?items.filter(a=>a&&a.id):[];
    const remoteIds=new Set(remote.map(a=>String(a.id)));
    const current=Array.isArray(cache)?cache:[];
    const map=new Map(current.filter(a=>a&&a.id&&(a.status!=="Aprovado"||remoteIds.has(String(a.id)))).map(a=>[String(a.id),clone(a)]));
    remote.forEach(a=>map.set(String(a.id),clone(a)));
    cache=[...map.values()].sort((a,b)=>new Date(b.updatedAt||b.date||0)-new Date(a.updatedAt||a.date||0));
    try{localStorage.setItem('fp_articles',JSON.stringify(cache));}catch(_){ }
    await putAll(cache);
    writeIndex(cache);
    if(typeof CustomEvent==='function')window.dispatchEvent(new CustomEvent('fp:articles-updated',{detail:clone(cache)}));
    return clone(cache);
  }
  async function syncEditorialArticles(uid, role){
    if(!fpCloudEnabled() || !uid) return window.FPStore.getArticles();
    const remote=await window.FPCloud.fetchEditorialArticles(uid,role);
    const pendingIds=new Set(getPendingCloudIds());
    const localById=new Map((Array.isArray(cache)?cache:[]).filter(a=>a&&a.id).map(a=>[String(a.id),clone(a)]));
    const remoteList=Array.isArray(remote)?remote:[];
    const remoteById=new Map(remoteList.filter(a=>a&&a.id).map(a=>[String(a.id),clone(a)]));
    // O remoto é a fonte de verdade quando já existe. Enquanto uma matéria está
    // em sincronização, o item local pendente continua visível para não parecer perdido.
    pendingIds.forEach(id=>{if(!remoteById.has(id) && localById.has(id)) remoteById.set(id,localById.get(id));});
    const confirmedIds=new Set(remoteList.filter(a=>a&&a.id).map(a=>String(a.id)));
    confirmedIds.forEach(id=>clearPendingCloud(id));
    cache=[...remoteById.values()].sort((a,b)=>new Date(b.updatedAt||b.date||0)-new Date(a.updatedAt||a.date||0));
    writeIndex(cache);
    try{localStorage.setItem('fp_articles',JSON.stringify(cache));}catch(_){}
    await putAll(cache);
    if(typeof CustomEvent==='function')window.dispatchEvent(new CustomEvent('fp:articles-updated',{detail:clone(cache)}));

    // Tenta reenviar em segundo plano os itens que ficaram pendentes. A Mesa não espera
    // esse upload para abrir; quando o Firebase confirmar, o item é atualizado no cache.
    for(const id of getPendingCloudIds()){
      const local=localById.get(String(id));
      if(!local || !window.FPCloud?.saveArticle) continue;
      Promise.resolve().then(()=>window.FPCloud.saveArticle(local)).then(remoteItem=>{
        if(!remoteItem)return;
        clearPendingCloud(remoteItem.id);
        const index=cache.findIndex(a=>String(a.id)===String(remoteItem.id));
        if(index>=0)cache[index]=clone(remoteItem);else cache.push(clone(remoteItem));
        cache.sort((a,b)=>new Date(b.updatedAt||b.date||0)-new Date(a.updatedAt||a.date||0));
        try{localStorage.setItem('fp_articles',JSON.stringify(cache));}catch(_){}
        putOne(remoteItem).catch(()=>{});
        writeIndex(cache);
        if(typeof CustomEvent==='function')window.dispatchEvent(new CustomEvent('fp:articles-updated',{detail:clone(cache)}));
      }).catch(error=>console.warn('[Folha do Paiquerê] nova tentativa de sincronização:',error));
    }
    return clone(cache);
  }

  async function setUsersLocal(items){
    userCache=Array.isArray(items)?clone(items):[];
    try{localStorage.setItem('fp_users',JSON.stringify(userCache));}catch(_){ }
    await putUsers(userCache);
    if(typeof CustomEvent==='function')window.dispatchEvent(new CustomEvent('fp:users-updated',{detail:clone(userCache)}));
    return userCache;
  }

  function syncFromLocal(raw){
    try{const parsed=raw==null?[]:JSON.parse(raw);if(Array.isArray(parsed)){cache=clone(parsed);writeIndex(cache);}}catch(_){}
  }
  window.addEventListener('storage',e=>{if(e.key==='fp_articles')syncFromLocal(e.newValue);});
  window.addEventListener('fp:articles-updated',e=>{if(Array.isArray(e.detail))cache=clone(e.detail);});
  window.FPStore={
    getArticles:()=>Array.isArray(cache)?clone(cache):localRead(),
    setArticles:set,
    upsertArticle:upsertOne,
    upsertAchievement,
    removeArticle:removeOne,
    syncEditorialArticles,
    syncPublicArticles,
    setUsersLocal,
    getUsers:()=>userCache.length?clone(userCache):readLocal('fp_users',[]),
    setUsers,
    setUserAvatar:async(email,avatar)=>{const all=window.FPStore.getUsers().map(u=>String(u.email).toLowerCase()===String(email).toLowerCase()?{...u,avatar}:u);await setUsers(all);return avatar;},
    getUserAvatar:email=>(window.FPStore.getUsers().find(u=>String(u.email||'').toLowerCase()===String(email||'').toLowerCase())||{}).avatar||'',
    ready:hydrate()
  };
})();
