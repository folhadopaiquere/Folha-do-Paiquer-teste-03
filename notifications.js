(() => {
  'use strict';
  const ENABLED_KEY='fp_notifications_enabled',DEVICE_KEY='fp_notification_device_id',SEEN_KEY='fp_notification_seen';
  let registration=null,unsubs=[],started=false;
  const $=id=>document.getElementById(id);
  const announce=m=>{const el=$('accessibility-status');if(el)el.textContent=m;};
  const enabled=()=>localStorage.getItem(ENABLED_KEY)==='1';
  const deviceId=()=>{let id='';try{id=localStorage.getItem(DEVICE_KEY)||'';}catch(_){};if(!id){id=globalThis.crypto?.randomUUID?.()||`device-${Date.now()}-${Math.random().toString(36).slice(2)}`;try{localStorage.setItem(DEVICE_KEY,id);}catch(_){}}return id;};
  const seen=()=>{try{const v=JSON.parse(localStorage.getItem(SEEN_KEY)||'{}');return v&&typeof v==='object'?v:{}}catch(_){return {}}};
  const saveSeen=v=>{try{localStorage.setItem(SEEN_KEY,JSON.stringify(v));}catch(_){}};
  const markSeen=(type,ids)=>{const s=seen(),set=new Set(Array.isArray(s[type])?s[type].map(String):[]);ids.forEach(id=>set.add(String(id)));s[type]=[...set].slice(-300);saveSeen(s);};
  const supported=()=>globalThis.isSecureContext&&'Notification' in window&&'serviceWorker' in navigator;
  const titleFor=type=>type==='news'?'📰 Nova notícia na Folha do Paiquerê':type==='achievement'?'🏆 Um novo destaque da nossa escola!':'🔔 Novo aviso escolar';
  const bodyFor=(type,item)=>{const title=String(item?.title||item?.name||'Novo conteúdo').trim();if(type==='news')return `“${title}” · Toque para ler a matéria.`;if(type==='achievement')return `${String(item?.name||'Um aluno ou equipe').trim()} foi reconhecido(a) além das paredes da sala de aula! Toque para descobrir como se destacou.`;return `${title}. Toque para conferir as informações importantes da escola.`;};
  const linkFor=(type,item)=>{const base=new URL('./',location.href);if(type==='news')return new URL(`noticia-single.html?id=${encodeURIComponent(String(item?.id||''))}`,base).href;if(type==='achievement'){const url=new URL('conquistas.html',base);url.hash=`achievement-${encodeURIComponent(String(item?.id||''))}`;return url.href;}const url=new URL('index.html',base);url.hash=`aviso-${encodeURIComponent(String(item?.id||''))}`;return url.href;};
  const iconFor=type=>type==='schoolNotice'?'assets/branding/brasao-escola.jpeg':'assets/branding/brasao-folha-paiquere.png';
  async function registerSW(){try{registration=registration||await navigator.serviceWorker.register('folha-notifications-sw.js',{scope:'./'});return registration;}catch(_){return null;}}
  async function notify(type,item){if(!enabled()||!supported()||Notification.permission!=='granted')return;const options={body:bodyFor(type,item),icon:iconFor(type),badge:'assets/branding/brasao-folha-paiquere.png',tag:`fp-${type}-${item?.id||Date.now()}`,data:{url:linkFor(type,item),type,deviceId:deviceId()}};try{const reg=registration||await registerSW();if(reg?.showNotification)return await reg.showNotification(titleFor(type),options);}catch(_){}try{if(!/Android|iPhone|iPad|iPod/i.test(navigator.userAgent))new Notification(titleFor(type),options);}catch(_){}}
  function listen(type,subscribe){if(typeof subscribe!=='function')return;const stop=subscribe(items=>{const rows=Array.isArray(items)?items:[],s=seen(),previous=new Set(Array.isArray(s[type])?s[type].map(String):[]),ids=rows.map(x=>String(x?.id||'')).filter(Boolean);if(!Object.prototype.hasOwnProperty.call(s,type)){markSeen(type,ids);return;}rows.filter(x=>x?.id&&!previous.has(String(x.id))).slice(0,3).forEach((x,i)=>setTimeout(()=>notify(type,x),i*750));markSeen(type,ids);});unsubs.push(typeof stop==='function'?stop:()=>{});}
  function stop(){unsubs.splice(0).forEach(fn=>{try{fn();}catch(_){}});started=false;}
  async function seedMissingSeenTypes(cloud){
    const before=seen(),missing=['news','achievement','schoolNotice'].filter(type=>!Object.prototype.hasOwnProperty.call(before,type));
    if(!missing.length)return;
    const jobs={
      news:()=>cloud.fetchPublicArticles?.(),
      achievement:()=>cloud.fetchAchievements?.(),
      schoolNotice:()=>cloud.fetchSchoolNotices?.()
    };
    await Promise.allSettled(missing.map(async type=>{
      const rows=await jobs[type]();
      // Only initialize categories that have never been tracked; preserve existing seen IDs.
      if(!Object.prototype.hasOwnProperty.call(seen(),type))markSeen(type,(Array.isArray(rows)?rows:[]).map(item=>item?.id).filter(Boolean));
    }));
  }
  async function start(){
    if(started||!enabled())return;
    const cloud=window.FPCloud;if(!cloud?.enabled?.())return;
    started=true;
    // Older browser state may contain only some categories. Establish baselines for the missing
    // categories before subscribing, otherwise their first snapshot would silently consume the
    // next school notice/achievement as if it were just initial data.
    await seedMissingSeenTypes(cloud);
    if(!enabled()||window.FPCloud!==cloud){started=false;return;}
    listen('news',cb=>cloud.listenPublicArticles?.(cb));
    listen('achievement',cb=>cloud.listenAchievements?.(cb));
    listen('schoolNotice',cb=>cloud.listenSchoolNotices?.(cb));
  }
  function updateButton(){const b=$('notification-toggle');if(!b)return;const on=enabled();b.setAttribute('aria-pressed',String(on));b.setAttribute('aria-label',on?'Desativar notificações':'Ativar notificações');if($('notification-icon'))$('notification-icon').textContent=on?'🔔':'🔕';if($('notification-label'))$('notification-label').textContent=on?'Notificações ativas':'Notificações desativadas';}
  async function enable(){if(!supported()){announce('Notificações exigem HTTPS, suporte do navegador e service worker.');return;}try{const permission=Notification.permission==='granted'?'granted':await Notification.requestPermission();if(permission!=='granted'){announce(permission==='denied'?'As notificações foram bloqueadas pelo navegador.':'A permissão de notificações não foi concedida.');return;}await registerSW();deviceId();localStorage.setItem(ENABLED_KEY,'1');updateButton();if(!Object.keys(seen()).length){const [n,a,s]=await Promise.all([window.FPCloud.fetchPublicArticles?.(),window.FPCloud.fetchAchievements?.(),window.FPCloud.fetchSchoolNotices?.()]);markSeen('news',(n||[]).map(x=>x?.id).filter(Boolean));markSeen('achievement',(a||[]).map(x=>x?.id).filter(Boolean));markSeen('schoolNotice',(s||[]).map(x=>x?.id).filter(Boolean));}await start();announce('Notificações ativadas neste navegador.');}catch(error){announce(error?.message||'Não foi possível ativar as notificações.');}}
  function disable(){localStorage.setItem(ENABLED_KEY,'0');stop();updateButton();announce('Notificações desativadas neste navegador.');}
  function setup(){
    // The public mobile shell has its own notification button; some public pages (notably perfil.html)
    // do not contain the legacy desktop #notification-toggle. Listener startup must not depend on it.
    const b=$('notification-toggle');
    if(b&&b.dataset.bound!=='1'){
      b.dataset.bound='1';
      b.addEventListener('click',()=>enabled()?disable():enable());
    }
    updateButton();
    if(enabled())registerSW().then(start);
  }
  window.FPNotifications={enabled,deviceId,enable,disable};
  (async()=>{try{if(window.FPCloudReady?.then)await window.FPCloudReady;}catch(_){}setup();window.addEventListener('fp:firebase-ready',setup);})();
})();
