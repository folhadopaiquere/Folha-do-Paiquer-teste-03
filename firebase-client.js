import { initializeApp, getApps, getApp } from 'https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js';
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  signInAnonymously,
  createUserWithEmailAndPassword,
  updateProfile,
  updateEmail,
  updatePassword,
  sendPasswordResetEmail
} from 'https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js';
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  deleteField,
  updateDoc,
  deleteDoc,
  increment,
  runTransaction,
  query,
  where,
  orderBy,
  onSnapshot,
  limit,
  serverTimestamp,
  Timestamp
} from 'https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js';

(() => {
  'use strict';

  const cfg = window.FOLHA_FIREBASE || {};
  const valid = Boolean(cfg.enabled && cfg.config?.apiKey && cfg.config?.projectId && cfg.config?.appId);
  const dbName = 'folhaPaiquereFirebase';
  let app = null;
  let auth = null;
  let db = null;
  let currentUser = null;
  let currentProfile = null;
  const listeners = new Set();
  let resolveAuthReady = null;
  const authReady = new Promise(resolve => { resolveAuthReady = resolve; });
  if (!window.FPCloudReady) window.FPCloudReady = new Promise(resolve => { window.__resolveFPCloudReady = resolve; });

  if (valid) {
    app = getApps().length ? getApp() : initializeApp(cfg.config);
    auth = getAuth(app);
    db = getFirestore(app);
    onAuthStateChanged(auth, async user => {
      currentUser = user || null;
      currentProfile = user ? await loadProfile(user.uid).catch(() => null) : null;
      if (resolveAuthReady) { resolveAuthReady(currentUser); resolveAuthReady = null; }
      window.dispatchEvent(new CustomEvent('fp:firebase-auth', { detail: { user: currentUser, profile: currentProfile } }));
      if (user) syncCurrentProfileToLocal(currentProfile, user).catch(() => {});
    });
  } else {
    if (resolveAuthReady) { resolveAuthReady(null); resolveAuthReady = null; }
  }

  const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
  const normalizeEmailAddress = value => String(value ?? '')
    .normalize('NFKC')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\s+/g, '')
    .trim()
    .toLowerCase();
  const looksLikeEmailAddress = value => {
    const email = normalizeEmailAddress(value);
    if (!email || email.length > 254) return false;
    const at = email.lastIndexOf('@');
    if (at <= 0 || at >= email.length - 1) return false;
    const local = email.slice(0, at);
    const domain = email.slice(at + 1);
    return local.length <= 64 && domain.length <= 253 && !domain.startsWith('.') && !domain.endsWith('.') && !domain.includes('..') && /^[^@]+@[^@]+(?:\.[^@]+)+$/.test(email);
  };
  const isDataUrl = value => typeof value === 'string' && value.startsWith('data:');
  function dataUrlToBlob(dataUrl) {
    const match = String(dataUrl || '').match(/^data:([^;,]+)?(;base64)?,(.*)$/s);
    if (!match) return null;
    const mime = match[1] || 'application/octet-stream';
    const body = match[2] ? atob(match[3]) : decodeURIComponent(match[3]);
    const bytes = new Uint8Array(body.length);
    for (let i = 0; i < body.length; i++) bytes[i] = body.charCodeAt(i);
    return new Blob([bytes], { type: mime });
  }
  async function compressImageDataUrl(value, maxWidth = 1400, quality = 0.78) {
    if (!isDataUrl(value) || !/^data:image\//i.test(value)) return value;
    try {
      const img = new Image();
      img.decoding = 'async';
      const loaded = new Promise((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = reject;
      });
      img.src = value;
      await loaded;
      const width = Math.max(1, img.naturalWidth || img.width || 1);
      const height = Math.max(1, img.naturalHeight || img.height || 1);
      const scale = Math.min(1, maxWidth / width);
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(width * scale));
      canvas.height = Math.max(1, Math.round(height * scale));
      const ctx = canvas.getContext('2d', { alpha: false });
      if (!ctx) return value;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const webp = canvas.toDataURL('image/webp', quality);
      return webp && webp.startsWith('data:image/webp') ? webp : canvas.toDataURL('image/jpeg', quality);
    } catch (_) {
      return value;
    }
  }

  function cloudinaryConfig() {
    const cfg = window.FP_CLOUDINARY || {};
    return {
      enabled: Boolean(cfg.enabled && cfg.cloudName && cfg.uploadPreset),
      cloudName: String(cfg.cloudName || '').trim(),
      uploadPreset: String(cfg.uploadPreset || '').trim(),
      maxImageBytes: Number(cfg.maxImageBytes || 8 * 1024 * 1024),
      maxRawBytes: Number(cfg.maxRawBytes || 2 * 1024 * 1024),
      folder: String(cfg.folder || 'folha-do-paiquere').replace(/^\/+|\/+$/g, '') || 'folha-do-paiquere'
    };
  }

  function cloudinaryReady() {
    return cloudinaryConfig().enabled;
  }

  function cloudinaryEndpoint(resourceType, cloud) {
    return `https://api.cloudinary.com/v1_1/${encodeURIComponent(cloud.cloudName)}/${resourceType}/upload`;
  }

  function dataUrlToBlob(dataUrl) {
    const match = String(dataUrl || '').match(/^data:([^;,]+)?(;base64)?,(.*)$/s);
    if (!match) return null;
    const mime = match[1] || 'application/octet-stream';
    const body = match[2] ? atob(match[3]) : decodeURIComponent(match[3]);
    const bytes = new Uint8Array(body.length);
    for (let i = 0; i < body.length; i++) bytes[i] = body.charCodeAt(i);
    return new Blob([bytes], { type: mime });
  }

  function cloudinaryUpload(blobOrFile, options = {}) {
    return new Promise((resolve, reject) => {
      const cloud = cloudinaryConfig();
      if (!cloud.enabled) {
        reject(new Error('O Cloudinary ainda não está configurado. Defina cloudName e uploadPreset em cloudinary-config.js antes de enviar arquivos.'));
        return;
      }
      if (!blobOrFile) { reject(new Error('Arquivo de mídia inválido.')); return; }
      const mime = String(blobOrFile.type || 'application/octet-stream').toLowerCase();
      const isImage = mime.startsWith('image/');
      const maxBytes = isImage ? cloud.maxImageBytes : cloud.maxRawBytes;
      if (Number(blobOrFile.size || 0) > maxBytes) {
        reject(new Error(`${isImage ? 'Imagem' : 'Arquivo'} grande demais para o limite deste portal.`));
        return;
      }
      const resourceType = isImage ? 'image' : 'raw';
      const folder = [cloud.folder, String(options.folder || '').replace(/^\/+|\/+$/g, '')].filter(Boolean).join('/');
      const form = new FormData();
      form.append('file', blobOrFile);
      form.append('upload_preset', cloud.uploadPreset);
      if (folder) form.append('folder', folder);

      const xhr = new XMLHttpRequest();
      xhr.open('POST', cloudinaryEndpoint(resourceType, cloud), true);
      xhr.timeout = Number(options.timeoutMs || 60000);
      xhr.upload.onprogress = event => {
        if (!event.lengthComputable || typeof options.onProgress !== 'function') return;
        options.onProgress(Math.round((event.loaded / event.total) * 100), 'Enviando mídia…');
      };
      xhr.onerror = () => reject(new Error('Não foi possível comunicar com o Cloudinary. Verifique a conexão e tente novamente.'));
      xhr.ontimeout = () => reject(new Error('O envio ao Cloudinary demorou demais para responder.'));
      xhr.onload = () => {
        let data = null;
        try { data = JSON.parse(xhr.responseText || '{}'); } catch (_) {}
        if (xhr.status < 200 || xhr.status >= 300 || !data?.secure_url) {
          const detail = data?.error?.message || xhr.responseText || `HTTP ${xhr.status}`;
          reject(new Error(`O Cloudinary recusou o arquivo: ${detail}`));
          return;
        }
        resolve({ ...data, url: data.secure_url, resourceType });
      };
      xhr.send(form);
    });
  }

  async function persistDataUrl(path, value, options = {}) {
    if (!isDataUrl(value)) return value;
    const normalized = await compressImageDataUrl(value, 1200, 0.72);
    const blob = dataUrlToBlob(normalized);
    if (!blob) throw new Error('Não foi possível preparar a mídia para o Cloudinary.');
    if (typeof options.onProgress === 'function') options.onProgress(12, 'Mídia otimizada. Preparando envio…');
    const uploaded = await cloudinaryUpload(blob, {
      folder: options.folder || String(path || 'media').replace(/^\/+/, '').replace(/\\/g, '/').replace(/\/[^/]+$/, ''),
      onProgress: (pct, label) => {
        if (typeof options.onProgress === 'function') options.onProgress(12 + Math.round(Math.max(0, Math.min(100, pct)) * 0.82), label);
      }
    });
    if (typeof options.onUploaded === 'function') options.onUploaded(uploaded);
    if (typeof options.onProgress === 'function') options.onProgress(100, 'Mídia salva no Cloudinary.');
    return uploaded.url;
  }

  async function uploadDataUrl(value, options = {}) {
    if (!isDataUrl(value)) return String(value || '');
    return persistDataUrl('media', value, options);
  }

  async function uploadFile(path, file, metadata = {}) {
    const folder = metadata.folder || String(path || 'media').replace(/^\/+/, '').replace(/\\/g, '/').replace(/\/[^/]+$/, '');
    const uploaded = await cloudinaryUpload(file, { folder, onProgress: metadata.onProgress });
    return uploaded.url;
  }

  function cloudinaryRefFromUrl(url) {
    const raw = String(url || '').trim();
    if (!/^https:\/\/res\.cloudinary\.com\//i.test(raw)) return null;
    try {
      const parsed = new URL(raw);
      const parts = parsed.pathname.split('/').filter(Boolean);
      const uploadIndex = parts.indexOf('upload');
      if (uploadIndex < 1) return null;
      const resourceType = parts[uploadIndex - 1] || 'image';
      const publicParts = parts.slice(uploadIndex + 1);
      if (publicParts[0] && /^v\d+$/.test(publicParts[0])) publicParts.shift();
      if (!publicParts.length) return null;
      let publicId = publicParts.join('/');
      if (resourceType === 'image') publicId = publicId.replace(/\.[^/.]+$/i, '');
      return { url: raw, publicId, resourceType };
    } catch (_) { return null; }
  }

  function dedupeMediaRefs(refs) {
    const seen = new Set();
    return (Array.isArray(refs) ? refs : []).filter(ref => {
      if (!ref?.publicId) return false;
      const key = `${ref.resourceType || 'image'}:${ref.publicId}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  async function sanitizeCanvasObjectImages(objects, articleId, authorUid, onProgress, startPct=35, endPct=88, mediaRefs=[]) {
    if (!Array.isArray(objects)) return objects || [];
    const out = [];
    const total = objects.length || 1;
    for (let index = 0; index < objects.length; index++) {
      const item = clone(objects[index]);
      const itemStart = startPct + Math.floor((index / total) * (endPct - startPct));
      const itemEnd = startPct + Math.floor(((index + 1) / total) * (endPct - startPct));
      if (item && item.type === 'image' && isDataUrl(item.src)) {
        let uploadedMeta = null;
        item.src = await persistDataUrl(`articles/${authorUid}/${articleId}/body-${index}.jpg`, item.src, { folder: `articles/${authorUid}/${articleId}/body`,
          onUploaded: uploaded => { uploadedMeta = uploaded; },
          onProgress: (pct, label) => {
            if (typeof onProgress === 'function') {
              const mapped = itemStart + Math.round((Math.max(0, Math.min(100, Number(pct) || 0)) / 100) * Math.max(1, itemEnd - itemStart));
              onProgress(mapped, label);
            }
          }
        });
        const ref = uploadedMeta && { url: uploadedMeta.url, publicId: uploadedMeta.public_id, resourceType: uploadedMeta.resourceType || 'image' };
        if (ref?.publicId) { mediaRefs.push(ref); item.dataCloudinary = ref; }
      } else if (item && item.type === 'image' && item.src) {
        const ref = item.dataCloudinary || cloudinaryRefFromUrl(item.src);
        if (ref?.publicId) mediaRefs.push({ ...ref, url: ref.url || item.src, resourceType: ref.resourceType || 'image' });
      }
      out.push(item);
      if (typeof onProgress === 'function') onProgress(itemEnd, `Conteúdo ${index + 1}/${objects.length} processado.`);
    }
    return out;
  }

  async function sanitizeArticle(article, onProgress) {
    const payload = clone(article);
    const uid = payload.authorUid || currentUser?.uid;
    if (!uid) throw new Error('A matéria precisa estar vinculada a um usuário Firebase.');
    const baseRefs = Array.isArray(payload.mediaRefs) ? payload.mediaRefs.filter(r => r?.publicId) : [];
    const mediaRefs = [];
    if (typeof onProgress === 'function') onProgress(10, 'Preparando matéria…');

    if (isDataUrl(payload.coverURL)) {
      let uploadedMeta = null;
      payload.coverURL = await persistDataUrl(`articles/${uid}/${payload.id}/cover.jpg`, payload.coverURL, { folder: `articles/${uid}/${payload.id}/cover`,
        onUploaded: uploaded => { uploadedMeta = uploaded; },
        onProgress: (pct, label) => { if (typeof onProgress === 'function') onProgress(10 + Math.round((Math.max(0, Math.min(100, Number(pct) || 0)) / 100) * 15), label); }
      });
      const ref = uploadedMeta && { url: uploadedMeta.url, publicId: uploadedMeta.public_id, resourceType: uploadedMeta.resourceType || 'image', kind: 'cover' };
      if (ref?.publicId) mediaRefs.push(ref);
      if (typeof onProgress === 'function') onProgress(25, 'Capa salva.');
    } else if (payload.coverURL) {
      const ref = baseRefs.find(r => r.url === payload.coverURL) || cloudinaryRefFromUrl(payload.coverURL);
      if (ref?.publicId) mediaRefs.push({ ...ref, kind: 'cover', url: ref.url || payload.coverURL });
      if (typeof onProgress === 'function') onProgress(25, 'Capa verificada.');
    } else if (typeof onProgress === 'function') onProgress(25, 'Capa verificada.');

    // A miniatura nova é derivada da capa e não precisa ser recriada a partir do canvas.
    if (isDataUrl(payload.thumbURL)) payload.thumbURL = payload.coverURL || '';

    if (payload.canvasJSON && Array.isArray(payload.canvasJSON.objects)) {
      payload.canvasJSON.objects = await sanitizeCanvasObjectImages(payload.canvasJSON.objects, payload.id, uid, onProgress, 35, 88, mediaRefs);
    } else if (typeof onProgress === 'function') onProgress(88, 'Conteúdo verificado.');

    // Mantém referências antigas ainda presentes no conteúdo, inclusive para artigos
    // migrados da v45 que ainda não possuíam mediaRefs explícitas.
    if (payload.canvasJSON?.objects) {
      payload.canvasJSON.objects.forEach(obj => {
        if (obj?.type !== 'image' || !obj.src || isDataUrl(obj.src)) return;
        const ref = obj.dataCloudinary || baseRefs.find(r => r.url === obj.src) || cloudinaryRefFromUrl(obj.src);
        if (ref?.publicId) mediaRefs.push({ ...ref, url: ref.url || obj.src, resourceType: ref.resourceType || 'image', kind: 'body' });
      });
    }
    if (payload.thumbURL && !isDataUrl(payload.thumbURL) && payload.thumbURL !== payload.coverURL) {
      const ref = baseRefs.find(r => r.url === payload.thumbURL) || cloudinaryRefFromUrl(payload.thumbURL);
      if (ref?.publicId) mediaRefs.push({ ...ref, url: ref.url || payload.thumbURL, resourceType: ref.resourceType || 'image', kind: 'thumb' });
    }
    payload.mediaRefs = dedupeMediaRefs(mediaRefs);

    const hasEmbeddedMedia = (value, seen = new Set()) => {
      if (value == null || typeof value !== 'object') return typeof value === 'string' && /^data:(image|video|audio|application\/pdf)/i.test(value);
      if (seen.has(value)) return false; seen.add(value);
      if (Array.isArray(value)) return value.some(item => hasEmbeddedMedia(item, seen));
      return Object.values(value).some(item => hasEmbeddedMedia(item, seen));
    };
    if (hasEmbeddedMedia(payload)) throw new Error('A matéria ainda contém uma mídia incorporada. Salve novamente para que ela seja enviada ao Cloudinary.');
    if (typeof onProgress === 'function') onProgress(88, 'Mídias externas confirmadas.');
    return payload;
  }

  const roleRank = role => ({ 'Estudante': 1, 'Editor': 2, 'Editor-Chefe': 3 }[String(role || '')] || 0);
  const roleAtLeast = (role, minimum) => roleRank(role) >= roleRank(minimum);
  const normalizeProfileBackgroundCrop = raw => {
    const source=raw&&typeof raw==='object'?raw:{};
    const number=key=>Math.max(0,Math.min(100,Number.isFinite(Number(source[key]))?Math.round(Number(source[key])):50));
    return {desktopX:number('desktopX'),desktopY:number('desktopY'),mobileX:number('mobileX'),mobileY:number('mobileY')};
  };
  const normalizeProfile = (uid, data = {}) => ({
    uid,
    email: data.email || '',
    name: data.name || data.displayName || '',
    role: data.role || 'Estudante',
    bio: data.bio || '',
    academicHistory: data.academicHistory || '',
    ...(Object.prototype.hasOwnProperty.call(data, 'assignedTitle') ? { assignedTitle: String(data.assignedTitle || '') } : {}),
    profileYear: data.profileYear || '',
    schoolYear: data.schoolYear || '',
    contributions: Array.isArray(data.contributions) ? data.contributions : [],
    socialLinks: Array.isArray(data.socialLinks) ? data.socialLinks : [],
    avatar: data.avatar || data.photoURL || '',
    profileBackgroundImage: String(data.profileBackgroundImage || ''),
    profileBackgroundCrop: normalizeProfileBackgroundCrop(data.profileBackgroundCrop),
    accessRevoked: Boolean(data.accessRevoked),
    revocationMode: String(data.revocationMode || ''),
    revokedAt: data.revokedAt || null,
    profileEditAllowance: Number(data.profileEditAllowance || 0),
    profileEditAuthorized: Boolean(data.profileEditAuthorized),
    welcomeTourCompleted: data.welcomeTourCompleted === true,
    welcomeTourPromptEnabled: Object.prototype.hasOwnProperty.call(data, 'welcomeTourCompleted'),
    welcomeTourAcceptedAt: data.welcomeTourAcceptedAt || null,
    ...(Object.prototype.hasOwnProperty.call(data, 'profileRemovalCompleted') ? { profileRemovalCompleted: data.profileRemovalCompleted === true } : {}),
    profileRemovalCompletedAt: data.profileRemovalCompletedAt || null,
    createdAt: data.createdAt || null,
    updatedAt: data.updatedAt || null
  });

  async function loadProfile(uid) {
    if (!db || !uid) return null;
    const snap = await getDoc(doc(db, 'users', uid));
    return snap.exists() ? normalizeProfile(uid, snap.data()) : null;
  }

  async function loadPublicProfile(uid) {
    if (!db || !uid) return null;
    const snap = await getDoc(doc(db, 'publicProfiles', uid));
    return snap.exists() ? { uid, ...clone(snap.data()) } : null;
  }


  // O documento users/{uid} é a fonte de verdade dos dados do perfil.
  // O espelho publicProfiles/{uid} deve copiar esses valores reais, em vez de
  // reconstruí-los a partir de campos locais ou da sessão (que podem estar
  // desatualizados). Os valores padrão abaixo correspondem aos defaults usados
  // nas regras do Firestore, inclusive null para recorte ausente.
  async function syncPublicProfileFromUser(uid) {
    if (!valid || !db || !uid) return false;
    const userSnap = await getDoc(doc(db, 'users', String(uid)));
    if (!userSnap.exists()) throw new Error('Não foi possível localizar o perfil principal no Firebase.');
    const source = userSnap.data() || {};
    const has = key => Object.prototype.hasOwnProperty.call(source, key);
    const value = (key, fallback) => has(key) ? source[key] : fallback;
    const publicData = {
      uid: String(uid),
      email: value('email', ''),
      name: value('name', ''),
      role: value('role', 'Estudante'),
      accessRevoked: value('accessRevoked', false),
      bio: value('bio', ''),
      academicHistory: value('academicHistory', ''),
      assignedTitle: value('assignedTitle', ''),
      profileYear: value('profileYear', ''),
      schoolYear: value('schoolYear', ''),
      contributions: value('contributions', []),
      socialLinks: value('socialLinks', []),
      avatar: value('avatar', ''),
      profileBackgroundImage: value('profileBackgroundImage', ''),
      profileBackgroundCrop: value('profileBackgroundCrop', null),
      updatedAt: serverTimestamp()
    };
    await setDoc(doc(db, 'publicProfiles', String(uid)), publicData, { merge: true });
    return publicData;
  }

  async function syncCurrentProfileToLocal(profile, user = currentUser) {
    if (!profile || !user) return;
    try {
      const raw = localStorage.getItem('fp_users');
      const users = raw ? JSON.parse(raw) : [];
      const next = Array.isArray(users) ? users.slice() : [];
      const idx = next.findIndex(u => String(u.email || '').toLowerCase() === String(user.email || '').toLowerCase());
      const local = {
        ...(idx >= 0 ? next[idx] : {}),
        uid: user.uid,
        email: user.email || '',
        name: profile.name || user.displayName || user.email?.split('@')[0] || '',
        role: profile.role || 'Estudante',
        avatar: profile.avatar || user.photoURL || '',
        profileBackgroundImage: String(profile.profileBackgroundImage || ''),
        profileBackgroundCrop: normalizeProfileBackgroundCrop(profile.profileBackgroundCrop),
        bio: profile.bio || '',
        academicHistory: profile.academicHistory || '',
        ...(Object.prototype.hasOwnProperty.call(profile, 'assignedTitle') ? { assignedTitle: String(profile.assignedTitle || '') } : {}),
        profileYear: profile.profileYear || '',
        schoolYear: profile.schoolYear || '',
        contributions: profile.contributions || [],
        socialLinks: Array.isArray(profile.socialLinks) ? profile.socialLinks : [],
        accessRevoked: Boolean(profile.accessRevoked),
        revocationMode: String(profile.revocationMode || ''),
        revokedAt: profile.revokedAt || null,
        profileEditAllowance: Number(profile.profileEditAllowance || 0),
        profileEditAuthorized: Boolean(profile.profileEditAuthorized),
        ...(profile.welcomeTourPromptEnabled ? { welcomeTourCompleted: profile.welcomeTourCompleted === true, welcomeTourPromptEnabled: true, welcomeTourAcceptedAt: profile.welcomeTourAcceptedAt || null } : {})
      };
      if (idx >= 0) next[idx] = local; else next.push(local);
      localStorage.setItem('fp_users', JSON.stringify(next));
      if (typeof CustomEvent === 'function') window.dispatchEvent(new CustomEvent('storage', { detail: { key: 'fp_users' } }));
    } catch (_) {}
  }

  async function ensureProfileRecord(uid, user) {
    if (!valid || !db || !uid || !user) return null;
    let profile = await loadProfile(uid).catch(() => null);
    if (profile) {
      // O documento editorial e o perfil público precisam nascer juntos.
      // Uma conta Auth já existente pode ter users/{uid}, mas ainda não ter
      // publicProfiles/{uid}; nesse caso, sincronizamos o vínculo sem alterar
      // o cargo já salvo.
      try {
        const publicProfile = await loadPublicProfile(uid).catch(() => null);
        const email = String(user.email || '').trim().toLowerCase();
        const needsPublic = !publicProfile
          || String(publicProfile.uid || uid) !== String(uid)
          || String(publicProfile.email || '').trim().toLowerCase() !== email
          || String(publicProfile.name || '') !== String(profile.name || '')
          || String(publicProfile.role || '') !== String(profile.role || '');
        if (needsPublic) {
          const identity = {
            uid,
            email,
            name: profile.name || user.displayName || email.split('@')[0] || 'Usuário',
            role: profile.role || 'Estudante',
            accessRevoked: Boolean(profile.accessRevoked),
            updatedAt: serverTimestamp()
          };
          if (!publicProfile) {
            // Primeiro espelho público: reproduz os dados existentes em users/{uid};
            // nunca cria um perfil público a partir de valores novos do formulário.
            await setDoc(doc(db, 'publicProfiles', uid), {
              ...identity,
              bio: profile.bio || '',
              academicHistory: profile.academicHistory || '',
              assignedTitle: profile.assignedTitle || '',
              profileYear: profile.profileYear || '',
              schoolYear: profile.schoolYear || '',
              contributions: Array.isArray(profile.contributions) ? profile.contributions : [],
              socialLinks: Array.isArray(profile.socialLinks) ? profile.socialLinks : [],
              avatar: profile.avatar || '',
            }, { merge: true });
          } else {
            // Sincroniza somente metadados de identidade em perfil existente.
            // Conteúdo de perfil só muda pelo fluxo autorizado de salvar perfil.
            await setDoc(doc(db, 'publicProfiles', uid), identity, { merge: true });
          }
        }
      } catch (_) {}
      return profile;
    }

    // A conta do Firebase Authentication e o perfil editorial são registros
    // distintos. Se a conta foi criada, mas o documento users/{uid} não foi
    // gravado, reconstituímos somente o perfil básico do próprio usuário.
    // Para segurança, uma conta comum nunca ganha cargo privilegiado por
    // fallback; somente o Administrador Master é reconhecido pelo e-mail.
    const master = String(user.email || '').trim().toLowerCase() === 'folhadopaiquere@gmail.com';
    const publicProfile = await loadPublicProfile(uid).catch(() => null);
    const role = master ? 'Editor-Chefe' : 'Estudante';
    const name = String(publicProfile?.name || user.displayName || user.email?.split('@')[0] || 'Usuário').trim();
    const email = String(user.email || publicProfile?.email || '').trim().toLowerCase();
    const repaired = {
      uid, email, name, role, accessRevoked: false, welcomeTourCompleted: false,
      profileEditAllowance: 0, avatar: publicProfile?.avatar || user.photoURL || '',
      bio: publicProfile?.bio || '', academicHistory: publicProfile?.academicHistory || '',
      ...(publicProfile && Object.prototype.hasOwnProperty.call(publicProfile, 'assignedTitle') ? { assignedTitle: String(publicProfile.assignedTitle || '') } : {}),
      profileYear: publicProfile?.profileYear || '', schoolYear: publicProfile?.schoolYear || '',
      contributions: Array.isArray(publicProfile?.contributions) ? publicProfile.contributions : [],
      socialLinks: Array.isArray(publicProfile?.socialLinks) ? publicProfile.socialLinks : [],
      updatedAt: new Date().toISOString()
    };
    await setDoc(doc(db, 'users', uid), { ...repaired, createdAt: new Date().toISOString() }, { merge: true });
    await setDoc(doc(db, 'publicProfiles', uid), {
      uid, email, name, role, accessRevoked: false,
      bio: repaired.bio, academicHistory: repaired.academicHistory,
      ...(Object.prototype.hasOwnProperty.call(repaired, 'assignedTitle') ? { assignedTitle: repaired.assignedTitle } : {}),
      profileYear: repaired.profileYear, schoolYear: repaired.schoolYear,
      contributions: repaired.contributions, socialLinks: repaired.socialLinks,
      avatar: repaired.avatar, updatedAt: serverTimestamp()
    }, { merge: true });
    return normalizeProfile(uid, repaired);
  }

  async function firebaseSignIn(email, password) {
    if (!valid) return { ok: false, disabled: true };
    const cleanEmail = normalizeEmailAddress(email);
    if (!looksLikeEmailAddress(cleanEmail)) return { ok:false, code:'invalid-email', message:'Não foi possível validar o e-mail. Use o endereço completo, como nome@escola.pr.gov.br ou nome@gmail.com.' };
    try {
      const credential = await signInWithEmailAndPassword(auth, cleanEmail, password);
      const profile = await ensureProfileRecord(credential.user.uid, credential.user);
      if (!profile) {
        await signOut(auth);
        return { ok: false, code: 'missing-profile', message: 'A conta existe, mas o perfil editorial ainda não foi cadastrado.' };
      }
      if (profile.accessRevoked) {
        await signOut(auth);
        return { ok: false, code: 'revoked', message: 'Este acesso foi revogado. O perfil permanece preservado.' };
      }
      await syncCurrentProfileToLocal(profile, credential.user);
      return { ok: true, user: credential.user, profile };
    } catch (error) {
      const code=error?.code||'auth-error';
      const message=code==='auth/invalid-email'
        ? 'Não foi possível validar o e-mail. Verifique se ele está completo, sem espaços ou caracteres extras, por exemplo nome@escola.pr.gov.br ou nome@gmail.com.'
        : (error?.message || 'Não foi possível entrar.');
      return { ok: false, code, message };
    }
  }

  async function ensureAnonymousIdentity() {
    if (!valid || !auth) return null;
    // Aguarde a restauração da sessão do Firebase antes de criar uma nova
    // identidade anônima. Sem essa espera, uma navegação rápida podia criar
    // outro UID antes de o Firebase terminar de restaurar o anterior.
    if (auth.currentUser) {
      currentUser = auth.currentUser;
      return currentUser;
    }
    try {
      const restored = await authReady;
      if (restored) {
        currentUser = restored;
        return restored;
      }
    } catch (_) {}
    try {
      if (auth.currentUser) {
        currentUser = auth.currentUser;
        return currentUser;
      }
      const credential = await signInAnonymously(auth);
      currentUser = credential?.user || currentUser || auth.currentUser || null;
      if(currentUser?.uid){
        try{
          const raw=localStorage.getItem('fp_anonymous_identity');
          const existing=raw?JSON.parse(raw):{};
          const next={...(existing&&typeof existing==='object'?existing:{}),firebaseUid:String(currentUser.uid)};
          localStorage.setItem('fp_anonymous_identity',JSON.stringify(next));
        }catch(_){}
      }
      return currentUser;
    } catch (_) {
      return auth.currentUser || currentUser || null;
    }
  }

  async function firebaseSignOut() {
    if (!valid) return;
    try { await signOut(auth); } catch (_) {}
  }

  async function createOwnAuthAccount(email, password, displayName) {
    if (!valid) return { ok: false, disabled: true };
    try {
      const credential = await createUserWithEmailAndPassword(auth, email, password);
      if (displayName) await updateProfile(credential.user, { displayName });
      return { ok: true, user: credential.user };
    } catch (error) {
      return { ok: false, code: error?.code || 'auth-error', message: error?.message || 'Não foi possível criar a conta.' };
    }
  }

  async function provisionUser(payload) {
    if (!valid || !auth || !db) return { ok: false, disabled: true };
    const name=String(payload?.name||'').trim(), email=normalizeEmailAddress(payload?.email), password=String(payload?.password||''), role=String(payload?.role||'Estudante');
    if(!name||!email||!password) return { ok:false, message:'Preencha nome, e-mail e senha.' };
    if(!looksLikeEmailAddress(email)) return {ok:false,message:'Não foi possível validar o e-mail. Use o endereço completo, como nome@escola.pr.gov.br ou nome@gmail.com.'};
    const current=await waitForAuth();
    const currentProfile=current?.uid ? await loadProfile(current.uid).catch(()=>null) : null;
    const chief=String(currentProfile?.role||'')==='Editor-Chefe' || String(current?.email||'').toLowerCase()==='folhadopaiquere@gmail.com';
    if(!chief) return {ok:false,message:'Somente o Editor-Chefe pode cadastrar novos acessos.'};
    let secondaryApp=null, secondaryAuth=null;
    try {
      const appName=`provision-${Date.now()}-${Math.random().toString(36).slice(2,7)}`;
      secondaryApp=initializeApp(cfg.config,appName);
      secondaryAuth=getAuth(secondaryApp);
      const credential=await createUserWithEmailAndPassword(secondaryAuth,email,password);
      if(name) await updateProfile(credential.user,{displayName:name});
      const uid=credential.user.uid;
      await setDoc(doc(db,'users',uid),{uid,email,name,role:role==='Editor-Chefe'||role==='Editor'?role:'Estudante',accessRevoked:false,welcomeTourCompleted:false,bio:'',academicHistory:'',profileYear:'',schoolYear:'',contributions:[],socialLinks:[],avatar:'',profileBackgroundImage:'',profileBackgroundCrop:normalizeProfileBackgroundCrop({}),profileEditAllowance:0,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()});
      await setDoc(doc(db,'publicProfiles',uid),{uid,email,name,role:role==='Editor-Chefe'||role==='Editor'?role:'Estudante',bio:'',academicHistory:'',profileYear:'',schoolYear:'',contributions:[],socialLinks:[],avatar:'',profileBackgroundImage:'',profileBackgroundCrop:normalizeProfileBackgroundCrop({}),accessRevoked:false,updatedAt:serverTimestamp()},{merge:true});
      await signOut(secondaryAuth);
      return {ok:true,data:{uid,email,name,role:role==='Editor-Chefe'||role==='Editor'?role:'Estudante'}};
    } catch(error) {
      const code=error?.code||'auth-error'; const friendly={
        'auth/email-already-in-use':'Este e-mail já possui uma conta no Firebase.',
        'auth/invalid-email':'Não foi possível validar o e-mail. Verifique se ele está completo e sem espaços ou caracteres extras, por exemplo nome@escola.pr.gov.br ou nome@gmail.com.',
        'auth/weak-password':'A senha precisa ter pelo menos 6 caracteres.',
        'auth/operation-not-allowed':'O login por e-mail e senha não está habilitado no Firebase Authentication.',
        'auth/network-request-failed':'Falha de conexão com o Firebase. Tente novamente.',
        'permission-denied':'O usuário atual não tem permissão para concluir o cadastro.'
      }; return {ok:false,code,message:friendly[code]||error?.message||'Não foi possível cadastrar o acesso.'};
    } finally {
      try { if(secondaryAuth) await signOut(secondaryAuth); } catch(_){}
      try { if(secondaryApp) { /* secondary app intentionally left isolated; current auth remains untouched */ } } catch(_){}
    }
  }

  async function setEditorialUser(uid, patch) {
    if (!valid || !db || !uid) return false;
    await setDoc(doc(db, 'users', uid), { uid, ...clone(patch), updatedAt: serverTimestamp() }, { merge: true });
    return true;
  }

  async function saveOwnProfileOnce(uid, profile) {
    if (!valid || !db || !uid) return {ok:false,message:'O Firebase não está disponível.'};
    await authReady.catch(()=>null);
    if (!currentUser || String(currentUser.uid)!==String(uid)) return {ok:false,message:'Sua sessão do Firebase não corresponde a este perfil.'};
    try {
      const userRef=doc(db,'users',uid);
      const publicRef=doc(db,'publicProfiles',uid);
      let allowanceAfter=0;
      await runTransaction(db,async transaction=>{
        const userSnap=await transaction.get(userRef);
        if(!userSnap.exists()) throw new Error('Seu perfil não foi encontrado no Firebase.');
        const data=userSnap.data()||{};
        const roleName=String(data.role||'Estudante');
        if(['Editor','Editor-Chefe'].includes(roleName) || String(currentUser.email||'').toLowerCase()==='folhadopaiquere@gmail.com') {
          throw new Error('Este perfil não utiliza autorização de edição.');
        }
        if(Number(data.profileEditAllowance||0)!==1) {
          throw new Error('Esta autorização de edição já foi utilizada. Solicite uma nova autorização.');
        }
        const clean={
          name:String(profile.name||data.name||''),
          bio:String(profile.bio||''),
          academicHistory:String(profile.academicHistory||''),
          profileYear:String(profile.profileYear||''),
          schoolYear:String(profile.schoolYear||data.schoolYear||''),
          contributions:Array.isArray(profile.contributions)?profile.contributions:[],
          socialLinks:Array.isArray(profile.socialLinks)?profile.socialLinks:[],
          avatar:String(profile.avatar||data.avatar||'')
        };
        transaction.update(userRef,{...clean,profileEditAllowance:0,updatedAt:serverTimestamp()});
        transaction.set(publicRef,{uid:String(uid),email:String(profile.email||data.email||currentUser.email||''),role:roleName,...clean,accessRevoked:Boolean(data.accessRevoked),updatedAt:serverTimestamp()},{merge:true});
        allowanceAfter=0;
      });
      return {ok:true,uid:String(uid),profileEditAllowance:allowanceAfter};
    } catch(error) {
      return {ok:false,message:error?.message||'Não foi possível salvar o perfil autorizado.'};
    }
  }

  async function savePublicProfile(uid, profile) {
    if (!valid || !db || !uid) return false;
    let avatar = profile.avatar || '';
    if (isDataUrl(avatar)) avatar = await persistDataUrl(`users/${uid}/avatar.jpg`, avatar, { folder: `users/${uid}/avatar` });
    let assignedTitle;
    let hasAssignedTitle = Object.prototype.hasOwnProperty.call(profile, 'assignedTitle');
    if (hasAssignedTitle) {
      assignedTitle = String(profile.assignedTitle || '').slice(0, 100);
    } else {
      const userSnap = await getDoc(doc(db, 'users', uid)).catch(() => null);
      hasAssignedTitle = Boolean(userSnap?.exists() && Object.prototype.hasOwnProperty.call(userSnap.data() || {}, 'assignedTitle'));
      if (hasAssignedTitle) assignedTitle = String(userSnap.data()?.assignedTitle || '').slice(0, 100);
    }
    const publicData = {
      uid,
      email: profile.email || '',
      name: profile.name || '',
      role: profile.role || 'Estudante',
      bio: profile.bio || '',
      academicHistory: profile.academicHistory || '',
      ...(hasAssignedTitle ? { assignedTitle } : {}),
      profileYear: profile.profileYear || '',
      schoolYear: profile.schoolYear || '',
      contributions: Array.isArray(profile.contributions) ? profile.contributions : [],
      socialLinks: Array.isArray(profile.socialLinks) ? profile.socialLinks : [],
      avatar,
      profileBackgroundImage: String(profile.profileBackgroundImage || '').slice(0, 2000),
      profileBackgroundCrop: normalizeProfileBackgroundCrop(profile.profileBackgroundCrop),
      accessRevoked: Boolean(profile.accessRevoked),
      updatedAt: serverTimestamp()
    };
    await setDoc(doc(db, 'publicProfiles', uid), publicData, { merge: true });
    return publicData;
  }

  async function fetchPublicProfiles() {
    if (!valid || !db) return [];
    const snap = await getDocs(collection(db, 'publicProfiles'));
    return snap.docs.map(s => ({ uid: s.id, ...s.data() }));
  }

  async function fetchPublicProfileByEmail(email) {
    if (!valid || !db || !email) return null;
    const clean = String(email).trim().toLowerCase();
    const snap = await getDocs(query(collection(db, 'publicProfiles'), where('email', '==', clean), limit(1)));
    const row = snap.docs[0];
    return row ? { uid: row.id, ...row.data() } : null;
  }

  async function fetchEditorialUsers() {
    if (!valid || !db) return [];
    const current = await waitForAuth();
    if (!current) return [];
    const profile = await loadProfile(current.uid).catch(() => null);
    const chief = String(profile?.role || '') === 'Editor-Chefe' || String(current.email || '').toLowerCase() === 'folhadopaiquere@gmail.com';
    const editor = chief || String(profile?.role || '') === 'Editor';
    if (!editor) return [];
    const snap = await getDocs(collection(db, 'users'));
    return snap.docs.map(s => ({ uid: s.id, ...s.data() }));
  }

  async function fetchAchievements() {
    if (!valid || !db) return [];
    const snap = await getDocs(collection(db, 'achievements'));
    return snap.docs.map(s => ({ id: s.id, ...s.data() }));
  }

  async function saveSchoolNotice(id, data) {
    if (!valid || !db || !id) return false;
    await setDoc(doc(db, 'schoolNotices', String(id)), { ...clone(data), id:String(id), updatedAt:serverTimestamp() }, { merge:true });
    return true;
  }
  async function deleteSchoolNotice(id) {
    if (!valid || !db || !id) return false;
    await deleteDoc(doc(db, 'schoolNotices', String(id)));
    return true;
  }
  async function fetchSchoolNotices() {
    if (!valid || !db) return [];
    const snap = await getDocs(collection(db, 'schoolNotices'));
    return snap.docs.map(s => ({ id:s.id, ...s.data() }));
  }
  function listenSchoolNotices(callback) {
    if (!valid || !db) return () => {};
    return onSnapshot(collection(db,'schoolNotices'), snap => callback(snap.docs.map(s=>({id:s.id,...s.data()}))));
  }
  async function getProfileAuthorization(uid) {
    if(!valid || !db || !uid) return {uid:String(uid||''),authorized:false};
    try {
      const snap=await getDoc(doc(db,'profileChangeRequests',String(uid)));
      if(!snap.exists()) return {uid:String(uid),authorized:false};
      const data=snap.data()||{};
      if(data.kind && data.kind!=='profileAuthorization') return {uid:String(uid),authorized:false};
      return {uid:String(uid),authorized:data.authorized===true,updatedAt:data.updatedAt||null};
    } catch(error) {
      return {uid:String(uid),authorized:false,error:true,message:error?.message||'Não foi possível consultar a autorização de perfil.'};
    }
  }

  async function fetchProfileAuthorizations() {
    if(!valid || !db) return [];
    await authReady.catch(()=>null);
    if(!currentUser) return [];
    const liveProfile=await loadProfile(currentUser.uid).catch(()=>null);
    const editor=String(liveProfile?.role||'')==='Editor'||String(liveProfile?.role||'')==='Editor-Chefe'||String(currentUser.email||'').toLowerCase()==='folhadopaiquere@gmail.com';
    if(!editor) return [];
    const snap=await getDocs(collection(db,'profileChangeRequests'));
    return snap.docs.map(s=>({id:s.id,...s.data()})).filter(x=>x.kind==='profileAuthorization' || (x.id && x.id.includes('_')===false && Object.prototype.hasOwnProperty.call(x,'authorized')));
  }

  async function revokeAndHideEditorialAccess(uid) {
    if (!valid || !db || !uid) return {ok:false,disabled:true,message:'O Firebase não está disponível.'};
    const targetUid=String(uid).trim();
    if(!targetUid) return {ok:false,message:'O identificador do acesso está vazio.'};
    let accessRevoked=false;
    try {
      const current=await waitForAuth();
      if(!current?.uid) return {ok:false,message:'Sua sessão do Firebase expirou. Entre novamente.'};
      const ctx=await getCurrentEditorContext();
      if(!ctx.chief) return {ok:false,message:'Somente o Editor-Chefe pode revogar acessos.'};
      if(targetUid===String(current.uid)) return {ok:false,message:'Não é permitido revogar o próprio acesso por este fluxo.'};
      if(targetUid==='lS9e7GzRx2XmfuPdnxNpMjNCpqe2') return {ok:false,message:'O acesso administrativo protegido não pode ser revogado por este fluxo.'};
      const target=await loadProfile(targetUid).catch(()=>null);
      if(!target) return {ok:false,message:'O registro do usuário não foi encontrado no Firestore.'};
      if(String(target.email||'').trim().toLowerCase()==='folhadopaiquere@gmail.com') return {ok:false,message:'O Administrador Master não pode ser revogado por este fluxo.'};

      // Primeiro, revoga acesso e remove o conteúdo pessoal do documento privado.
      // Nome/e-mail/cargo mínimos são mantidos temporariamente para localizar a conta Auth
      // que precisará ser removida manualmente no console, pois o plano Spark não publica Functions.
      const tombstone={
        uid:targetUid,
        name:String(target.name||'Acesso revogado').trim(),
        email:String(target.email||'').trim().toLowerCase(),
        role:String(target.role||'Estudante'),
        accessRevoked:true,
        revocationMode:'spark-plan-b',
        profileRemovalCompleted:false,
        bio:'',academicHistory:'',assignedTitle:'',profileYear:'',schoolYear:'',
        contributions:[],socialLinks:[],avatar:'',
        profileEditAllowance:0,profileEditAuthorized:false,
        welcomeTourCompleted:false,welcomeTourAcceptedAt:null,
        updatedAt:new Date().toISOString(),revokedAt:new Date().toISOString()
      };
      await setDoc(doc(db,'users',targetUid),{
        ...tombstone,
        password:deleteField(),displayName:deleteField(),photoURL:deleteField(),contribution:deleteField(),createdAt:deleteField(),
        updatedAt:serverTimestamp(),
        revokedAt:serverTimestamp(),
        welcomeTourAcceptedAt:deleteField()
      },{merge:true});
      accessRevoked=true;

      let publicProfileRemoved=false;
      let publicProfileError='';
      try {
        await deleteDoc(doc(db,'publicProfiles',targetUid));
        publicProfileRemoved=true;
      } catch(error) {
        publicProfileError=error?.message||'O Firestore não permitiu remover o perfil público.';
      }

      // Remove solicitações/autorização de perfil diretamente associadas ao UID.
      const requestRefs=new Map();
      const warnings=[];
      try {
        const directRef=doc(db,'profileChangeRequests',targetUid);
        const directSnap=await getDoc(directRef);
        if(directSnap.exists())requestRefs.set(directRef.path,directRef);
      } catch(error) { warnings.push(`Não foi possível consultar a autorização com ID do usuário: ${error?.message||'erro de leitura'}`); }
      for(const field of ['studentUid','uid']){
        try {
          const snap=await getDocs(query(collection(db,'profileChangeRequests'),where(field,'==',targetUid)));
          snap.docs.forEach(item=>requestRefs.set(item.ref.path,item.ref));
        } catch(error) { warnings.push(`Não foi possível consultar autorizações por ${field}: ${error?.message||'erro de leitura'}`); }
      }
      const refs=[...requestRefs.values()];
      for(let i=0;i<refs.length;i+=20){
        try { await Promise.all(refs.slice(i,i+20).map(ref=>deleteDoc(ref))); }
        catch(error){warnings.push(`Algumas autorizações pessoais não puderam ser removidas: ${error?.message||'erro de permissão ou conexão'}`);break;}
      }
      if(!publicProfileRemoved || warnings.length){
        // A linha continua na aba Inativos enquanto houver limpeza pendente, para que
        // a operação possa ser tentada novamente sem perder o registro tombstone.
        const message=!publicProfileRemoved
          ? `O acesso foi revogado e os campos pessoais foram limpos, mas o perfil público não foi removido. Confira as regras Firestore e tente novamente. Detalhe: ${publicProfileError}`
          : 'O perfil público foi removido, mas não foi possível confirmar a limpeza de todas as autorizações de perfil. A conta permanece na aba Inativos para permitir uma nova tentativa.';
        return {ok:false,accessRevoked:true,partial:true,data:{uid:targetUid,accessRevoked:true,profileRemovalCompleted:false,publicProfileRemoved,authAccountRetained:true,user:{...tombstone,profileRemovalCompleted:false}},message,warnings};
      }
      try {
        await setDoc(doc(db,'users',targetUid),{profileRemovalCompleted:true,profileRemovalCompletedAt:serverTimestamp(),updatedAt:serverTimestamp()},{merge:true});
      } catch(error) {
        // Não declare a remoção concluída sem conseguir registrar o estado final.
        return {ok:false,accessRevoked:true,partial:true,data:{uid:targetUid,accessRevoked:true,profileRemovalCompleted:false,publicProfileRemoved:true,authAccountRetained:true,user:{...tombstone,profileRemovalCompleted:false}},message:`O perfil público foi removido, mas não foi possível registrar a conclusão no Firestore. Tente novamente. Detalhe: ${error?.message||'erro ao atualizar o registro'}`,warnings};
      }
      tombstone.profileRemovalCompleted=true;
      return {ok:true,accessRevoked:true,data:{uid:targetUid,accessRevoked:true,profileRemovalCompleted:true,publicProfileRemoved:true,authAccountRetained:true,user:tombstone},warnings};
    } catch(error) {
      return {ok:false,accessRevoked,message:error?.message||'Não foi possível revogar esse acesso no Firestore.'};
    }
  }

  async function setProfileAuthorization(uid, authorized) {
    if(!valid || !db || !uid) return {ok:false,message:'O Firebase não está disponível.'};
    const current=await waitForAuth();
    if(!current) return {ok:false,message:'Sua sessão do Firebase ainda não está disponível.'};
    const profile=await loadProfile(current.uid).catch(()=>null);
    const editor=String(profile?.role||'')==='Editor'||String(profile?.role||'')==='Editor-Chefe'||String(current.email||'').toLowerCase()==='folhadopaiquere@gmail.com';
    if(!editor) return {ok:false,message:'Somente um editor pode alterar autorizações de perfil.'};
    try {
      const target=await loadProfile(uid).catch(()=>null);
      if(!target) throw new Error('A conta selecionada não possui perfil no Firebase.');
      if(['Editor','Editor-Chefe'].includes(String(target.role||'')) || String(target.email||'').toLowerCase()==='folhadopaiquere@gmail.com') {
        throw new Error('Perfis editoriais não utilizam esta autorização.');
      }
      const value=authorized===true;
      await setDoc(doc(db,'profileChangeRequests',String(uid)),{
        id:String(uid),uid:String(uid),studentUid:String(uid),kind:'profileAuthorization',authorized:value,
        updatedAt:serverTimestamp(),updatedBy:String(current.uid)
      },{merge:true});
      return {ok:true,uid:String(uid),authorized:value};
    } catch(error) {
      return {ok:false,message:error?.message||'Não foi possível alterar a autorização de perfil.'};
    }
  }

  // Legado: pedidos antigos continuam legíveis, mas o fluxo novo usa a autorização direta por conta.
  async function createProfileChangeRequest(data) {
    return {ok:false,message:'O fluxo de pedidos individuais foi substituído por Autorização de perfil.'};
  }
  async function fetchProfileChangeRequests() {
    return fetchProfileAuthorizations();
  }
  async function resolveProfileChangeRequest(id, approve) {
    return setProfileAuthorization(id, approve===true);
  }

  async function deleteAchievement(id) {
    if (!valid || !db || !id) return false;
    await authReady.catch(()=>null);
    const ctx=await getCurrentEditorContext();
    if(!ctx.editor) throw new Error('Somente um Editor ou Editor-Chefe pode apagar conquistas.');
    await deleteDoc(doc(db, 'achievements', String(id)));
    return true;
  }

  function listenAchievements(callback) {
    if (!valid || !db) return () => {};
    return onSnapshot(collection(db, 'achievements'), snap => callback(snap.docs.map(s => ({ id: s.id, ...s.data() }))));
  }

  const CLOUDINARY_ORPHAN_KEY = 'fp_cloudinary_orphans';

  function readCloudinaryOrphans() {
    try {
      const raw = localStorage.getItem(CLOUDINARY_ORPHAN_KEY);
      const value = raw ? JSON.parse(raw) : [];
      return Array.isArray(value) ? value : [];
    } catch (_) {
      return [];
    }
  }

  function rememberCloudinaryOrphans(refs, context = {}) {
    const clean = dedupeMediaRefs(refs).filter(r => r?.publicId);
    if (!clean.length) return [];
    const now = new Date().toISOString();
    const previous = readCloudinaryOrphans();
    const known = new Set(previous.map(r => `${r.resourceType || 'image'}:${r.publicId}`));
    const additions = clean.filter(r => !known.has(`${r.resourceType || 'image'}:${r.publicId}`)).map(r => ({
      ...r,
      articleId: context.articleId ? String(context.articleId) : '',
      reason: context.reason || 'substituido-ou-excluido',
      createdAt: now
    }));
    const next = [...previous, ...additions].slice(-500);
    try { localStorage.setItem(CLOUDINARY_ORPHAN_KEY, JSON.stringify(next)); } catch (_) {}
    return additions;
  }

  function listCloudinaryOrphans() {
    return clone(readCloudinaryOrphans());
  }

  function clearCloudinaryOrphans() {
    try { localStorage.removeItem(CLOUDINARY_ORPHAN_KEY); } catch (_) {}
    return true;
  }

  async function deleteCloudinaryAssets(refs, context = {}) {
    const remembered = rememberCloudinaryOrphans(refs, context);
    // V47/A: sem backend. O navegador não recebe o API Secret e não tenta
    // chamar uma Cloud Function apenas para apagar o asset.
    return { ok: true, deferred: true, remembered };
  }

  async function incrementArticleView(id) {
    if (!valid || !db || !id) return { ok: false };
    try {
      const articleRef = doc(db, 'articles', String(id));
      await updateDoc(articleRef, { views: increment(1) });
      const fresh = await getDoc(articleRef);
      return { ok: true, views: Number(fresh.data()?.views || 0), localOnly: false };
    } catch (error) {
      return { ok: false, localOnly: true, message: error?.message || 'Não foi possível registrar a visualização.' };
    }
  }

  async function saveArticle(article, options = {}) {
    if (!valid || !db || !article?.id) return false;
    if (typeof options.onProgress === 'function') options.onProgress(6, 'Conectando ao Firebase…');
    const articleRef = doc(db, 'articles', String(article.id));
    const previousSnap = await getDoc(articleRef).catch(() => null);
    const previous = previousSnap?.exists?.() ? previousSnap.data() : null;

    // As regras do Firestore impedem que um Editor reinicie uma janela de edição
    // quando um registro legado não possui datas confiáveis. Antecipamos essa
    // validação para mostrar um motivo compreensível antes de subir mídia ou
    // tentar uma gravação que o servidor necessariamente recusaria.
    if (article.status === 'Aprovado' && previous && previous.status !== 'Aprovado') {
      const noPreviousDates = previous.approvedAt == null && previous.editorEditUntil == null;
      const hasLegacyVisibility = noPreviousDates && Object.prototype.hasOwnProperty.call(previous, 'visible');
      const hasAnyHistory = previous.approvedAt != null || previous.editorEditUntil != null || previous.publicationHistoryLegacy === true || hasLegacyVisibility;
      const validOpenWindow = previous.approvedAt instanceof Timestamp
        && previous.editorEditUntil instanceof Timestamp
        && previous.editorEditUntil.toMillis() === previous.approvedAt.toMillis() + 7 * 24 * 60 * 60 * 1000
        && Date.now() < previous.editorEditUntil.toMillis()
        && previous.publicationHistoryLegacy !== true;
      if (hasAnyHistory && !validOpenWindow) {
        const editorContext = await getCurrentEditorContext();
        if (!editorContext.chief) {
          const error = new Error('Esta matéria tem histórico editorial antigo ou um prazo de edição inválido. Para não reiniciar nem ampliar indevidamente os sete dias de edição, somente o Editor-Chefe pode concluir esta publicação. Peça ao Editor-Chefe para revisar esta matéria.');
          error.code = 'folha/legacy-approval-chief-required';
          throw error;
        }
      }
    }

    const payload = await sanitizeArticle(article, options.onProgress);
    // A janela de edição é vinculada à primeira publicação da matéria.
    // Devolver a rascunho/em análise não apaga nem reinicia essa janela.
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    const previousApproved = previous?.status === 'Aprovado';
    const previousHasNoDates = Boolean(previous && previous.approvedAt == null && previous.editorEditUntil == null);
    const hasLegacyVisibilityField = Boolean(previousHasNoDates && Object.prototype.hasOwnProperty.call(previous, 'visible'));
    const hasPublicationHistory = Boolean(previous && (previous.approvedAt != null || previous.editorEditUntil != null || previous.publicationHistoryLegacy === true || hasLegacyVisibilityField));
    if (payload.status === 'Aprovado' && !previousApproved && !hasPublicationHistory) {
      const approvalMs = Date.now();
      payload.approvedAt = Timestamp.fromMillis(approvalMs);
      payload.editorEditUntil = Timestamp.fromMillis(approvalMs + sevenDaysMs);
    } else if (previousApproved || hasPublicationHistory) {
      // Já existe histórico remoto: preserva exatamente os valores e os tipos
      // armazenados pelo Firestore. Não converte strings antigas em timestamps
      // nem inventa um editorEditUntil ausente, pois isso permitiria redefinir
      // uma janela que o servidor não consegue validar.
      if (previous && Object.prototype.hasOwnProperty.call(previous, 'approvedAt')) payload.approvedAt = previous.approvedAt;
      else delete payload.approvedAt;
      if (previous && Object.prototype.hasOwnProperty.call(previous, 'editorEditUntil')) payload.editorEditUntil = previous.editorEditUntil;
      else delete payload.editorEditUntil;
      if (previous?.publicationHistoryLegacy === true || (previousHasNoDates && (previousApproved || hasLegacyVisibilityField))) {
        // Publicação legada sem datas confiáveis: não transformar numa matéria inédita.
        payload.publicationHistoryLegacy = true;
      } else if (previous && Object.prototype.hasOwnProperty.call(previous, 'publicationHistoryLegacy')) {
        payload.publicationHistoryLegacy = previous.publicationHistoryLegacy;
      } else {
        delete payload.publicationHistoryLegacy;
      }
    } else {
      // Itens que nunca foram publicados não carregam uma janela editorial.
      delete payload.editorEditUntil;
      delete payload.publicationHistoryLegacy;
      if (payload.status !== 'Aprovado') delete payload.approvedAt;
    }
    // Contadores comunitários pertencem à matéria e nunca devem ser sobrescritos por uma edição editorial.
    if(previous){
      payload.likes = Number(previous.likes || 0);
      payload.dislikes = Number(previous.dislikes || 0);
      payload.views = Number(previous.views || 0);
    }
    payload.updatedAt = payload.updatedAt || new Date().toISOString();
    const stored = { ...payload, id: String(article.id) };
    if (typeof options.onProgress === 'function') options.onProgress(92, 'Gravando matéria no banco de dados…');
    await setDoc(articleRef, stored, { merge: true });

    // Remove arquivos antigos que deixaram de ser usados após uma correção.
    const currentKeys = new Set(dedupeMediaRefs(stored.mediaRefs).map(r => `${r.resourceType || 'image'}:${r.publicId}`));
    const previousBodyRefs = Array.isArray(previous?.canvasJSON?.objects)
      ? previous.canvasJSON.objects.map(obj => obj?.dataCloudinary || cloudinaryRefFromUrl(obj?.src)).filter(Boolean)
      : [];
    const oldRefs = dedupeMediaRefs(previous?.mediaRefs?.length
      ? previous.mediaRefs
      : [previous?.coverURL, previous?.thumbURL, ...previousBodyRefs].map(ref => typeof ref === 'string' ? cloudinaryRefFromUrl(ref) : ref).filter(Boolean));
    const stale = oldRefs.filter(r => !currentKeys.has(`${r.resourceType || 'image'}:${r.publicId}`));
    if (stale.length) await deleteCloudinaryAssets(stale, { articleId: article.id, reason: 'substituido-em-edicao' });

    if (typeof options.onProgress === 'function') options.onProgress(100, 'Publicação salva no Firebase.');
    return stored;
  }

  async function replaceArticles(articles) {
    if (!valid || !db || !Array.isArray(articles)) return [];
    const stored = [];
    for (const article of articles) stored.push(await saveArticle(article));
    return stored;
  }

  async function deleteArticle(id, options = {}) {
    if (!valid || !db || !id) return false;
    const articleRef = doc(db, 'articles', String(id));
    const snap = await getDoc(articleRef).catch(() => null);
    const article = snap?.exists?.() ? snap.data() : null;
    await deleteDoc(articleRef);
    const previousBodyRefs = Array.isArray(article?.canvasJSON?.objects)
      ? article.canvasJSON.objects.map(obj => obj?.dataCloudinary || cloudinaryRefFromUrl(obj?.src)).filter(Boolean)
      : [];
    const refs = dedupeMediaRefs(article?.mediaRefs?.length
      ? article.mediaRefs
      : [article?.coverURL, article?.thumbURL, ...previousBodyRefs].map(ref => typeof ref === 'string' ? cloudinaryRefFromUrl(ref) : ref).filter(Boolean));
    if (refs.length) await deleteCloudinaryAssets(refs, { articleId: id, reason: 'artigo-excluido' });
    return true;
  }

  async function fetchPublicArticles() {
    if (!valid || !db) return [];
    const q = query(collection(db, 'articles'), where('status', '==', 'Aprovado'), where('visible', '==', true));
    const snap = await getDocs(q);
    return snap.docs.map(s => ({ id: s.id, ...s.data() }));
  }

  async function fetchEditorialArticles(uid, role) {
    if (!valid || !db || !uid) return [];
    const articlesRef = collection(db, 'articles');
    if (roleAtLeast(role, 'Editor-Chefe')) {
      const snap = await getDocs(query(articlesRef, limit(500)));
      return snap.docs.map(s => ({ id: s.id, ...s.data() }));
    }
    if (roleAtLeast(role, 'Editor')) {
      const [workflowSnap, ownPublishedSnap] = await Promise.all([
        getDocs(query(articlesRef, where('status', 'in', ['Rascunho', 'Pendente', 'Ajustes']), limit(500))),
        getDocs(query(articlesRef, where('authorUid', '==', uid), where('status', '==', 'Aprovado'), where('editorEditUntil', '>', Timestamp.now()), limit(500)))
      ]);
      const unique = new Map();
      [...workflowSnap.docs, ...ownPublishedSnap.docs].forEach(s => unique.set(s.id, { id: s.id, ...s.data() }));
      return [...unique.values()];
    }
    // Estudantes continuam vendo as próprias matérias, inclusive publicadas,
    // dentro de Minhas matérias. A restrição editorial vale para cargos Editor.
    const snap = await getDocs(query(articlesRef, where('authorUid', '==', uid), limit(500)));
    return snap.docs.map(s => ({ id: s.id, ...s.data() }));
  }

  function listenPublicArticles(callback) {
    if (!valid || !db) return () => {};
    const q = query(collection(db, 'articles'), where('status', '==', 'Aprovado'), where('visible', '==', true));
    return onSnapshot(q, snap => callback(snap.docs.map(s => ({ id: s.id, ...s.data() }))));
  }

  function listenEditorialArticles(uid, role, callback) {
    if (!valid || !db || !uid || typeof callback !== 'function') return () => {};
    const articlesRef = collection(db, 'articles');
    const merge = () => {
      const unique = new Map();
      snapshots.forEach(snap => snap?.docs?.forEach(s => unique.set(s.id, { id: s.id, ...s.data() })));
      callback([...unique.values()]);
    };
    const snapshots = [];
    const unsubs = [];
    const subscribe = (q, index) => unsubs.push(onSnapshot(q, snap => { snapshots[index] = snap; merge(); }));
    if (roleAtLeast(role, 'Editor-Chefe')) {
      subscribe(query(articlesRef, limit(500)), 0);
    } else if (roleAtLeast(role, 'Editor')) {
      subscribe(query(articlesRef, where('status', 'in', ['Rascunho', 'Pendente', 'Ajustes']), limit(500)), 0);
      subscribe(query(articlesRef, where('authorUid', '==', uid), where('status', '==', 'Aprovado'), where('editorEditUntil', '>', Timestamp.now()), limit(500)), 1);
    } else {
      subscribe(query(articlesRef, where('authorUid', '==', uid), limit(500)), 0);
    }
    return () => unsubs.forEach(unsub => { try { unsub(); } catch (_) {} });
  }

  async function getCurrentEditorContext() {
    const current = await waitForAuth();
    if (!current?.uid) return { current: null, profile: null, chief: false, editor: false };
    const profile = await loadProfile(current.uid).catch(() => null);
    const master = String(current.email || '').toLowerCase() === 'folhadopaiquere@gmail.com';
    const chief = master || String(profile?.role || '') === 'Editor-Chefe';
    const editor = chief || String(profile?.role || '') === 'Editor';
    return { current, profile, chief, editor };
  }

  async function updateEditorialAccess(uid, patch = {}) {
    if (!valid || !db || !auth || !uid) return {ok:false,disabled:true};
    let secondaryApp=null, secondaryAuth=null;
    try {
      const ctx=await getCurrentEditorContext();
      if(!ctx.chief)return {ok:false,message:'Somente o Editor-Chefe pode ajustar acessos.'};
      const targetRef=doc(db,'users',String(uid));
      const targetSnap=await getDoc(targetRef);
      if(!targetSnap.exists())return {ok:false,message:'Perfil do acesso não encontrado no Firebase.'};
      const currentData=targetSnap.data()||{};
      const oldEmail=normalizeEmailAddress(currentData.email||'');
      const oldName=String(currentData.name||'').trim();
      if(oldEmail==='folhadopaiquere@gmail.com')return {ok:false,message:'O Administrador Master não pode ser alterado por este fluxo.'};
      if(!oldEmail||!looksLikeEmailAddress(oldEmail))return {ok:false,message:'O acesso selecionado não possui um identificador de login válido.'};
      const nextName=String(patch?.name??oldName).normalize('NFKC').trim();
      const nextEmail=normalizeEmailAddress(patch?.email??oldEmail);
      const currentPassword=String(patch?.currentPassword??'');
      const newPassword=String(patch?.newPassword??'');
      if(!nextName)return {ok:false,message:'Informe um nome válido.'};
      if(!looksLikeEmailAddress(nextEmail))return {ok:false,message:'Informe um identificador de login válido, como nome@escola.pr.gov.br ou nome@gmail.com.'};
      if(!currentPassword)return {ok:false,message:'Informe a senha atual deste acesso para confirmar o ajuste.'};
      if(newPassword&&newPassword.length<6)return {ok:false,message:'A nova senha precisa ter pelo menos 6 caracteres.'};
      const emailChanged=nextEmail!==oldEmail;
      const passwordChanged=Boolean(newPassword);
      const appName=`adjust-${Date.now()}-${Math.random().toString(36).slice(2,7)}`;
      secondaryApp=initializeApp(cfg.config,appName);
      secondaryAuth=getAuth(secondaryApp);
      const credential=await signInWithEmailAndPassword(secondaryAuth,oldEmail,currentPassword);
      const targetUser=credential.user;
      let authNameChanged=false,authEmailChanged=false,authPasswordChanged=false;
      try{
        if(nextName!==oldName){await updateProfile(targetUser,{displayName:nextName});authNameChanged=true;}
        if(emailChanged){await updateEmail(targetUser,nextEmail);authEmailChanged=true;}
        if(passwordChanged){await updatePassword(targetUser,newPassword);authPasswordChanged=true;}
        await runTransaction(db,async transaction=>{
          const snap=await transaction.get(targetRef);
          if(!snap.exists())throw new Error('Perfil do acesso não encontrado no Firebase.');
          const storedEmail=normalizeEmailAddress(snap.data()?.email||oldEmail);
          if(storedEmail==='folhadopaiquere@gmail.com')throw new Error('O Administrador Master não pode ser alterado por este fluxo.');
          transaction.set(targetRef,{uid:String(uid),email:nextEmail,name:nextName,updatedAt:serverTimestamp()},{merge:true});
          transaction.set(doc(db,'publicProfiles',String(uid)),{uid:String(uid),email:nextEmail,name:nextName,updatedAt:serverTimestamp()},{merge:true});
        });
        return {ok:true,data:{uid:String(uid),name:nextName,email:nextEmail,passwordChanged}};
      }catch(error){
        try{if(authPasswordChanged)await updatePassword(targetUser,currentPassword);}catch(_){}
        try{if(authEmailChanged)await updateEmail(targetUser,oldEmail);}catch(_){}
        try{if(authNameChanged)await updateProfile(targetUser,{displayName:oldName});}catch(_){}
        throw error;
      }finally{try{await signOut(secondaryAuth);}catch(_){}
      }
    }catch(error){
      const code=error?.code||'';
      const friendly={
        'auth/invalid-credential':'A senha atual do acesso não confere.',
        'auth/wrong-password':'A senha atual do acesso não confere.',
        'auth/user-not-found':'Não foi encontrada a conta correspondente ao identificador atual deste acesso.',
        'auth/invalid-email':'O identificador de login informado não possui um formato válido.',
        'auth/email-already-in-use':'O novo identificador de login já está sendo usado por outra conta.',
        'auth/requires-recent-login':'A autenticação recente do acesso foi exigida novamente. Tente o ajuste mais uma vez.',
        'auth/weak-password':'A nova senha precisa ter pelo menos 6 caracteres.',
        'auth/too-many-requests':'Muitas tentativas. Aguarde um pouco antes de tentar novamente.'
      };
      return {ok:false,code,message:friendly[code]||error?.message||'Não foi possível ajustar este acesso.'};
    }finally{try{if(secondaryAuth)await signOut(secondaryAuth);}catch(_){}
    }
  }

  async function updateEditorialProfileData(uid, patch = {}) {
    if (!valid || !db || !uid) return {ok:false,disabled:true};
    try {
      const ctx=await getCurrentEditorContext();
      if(!ctx.chief)return {ok:false,message:'Somente o Editor-Chefe pode editar dados administrativos.'};
      const target=await loadProfile(uid).catch(()=>null);
      if(!target)return {ok:false,message:'Perfil do usuário não encontrado no Firebase.'};
      if(String(target.email||'').trim().toLowerCase()==='folhadopaiquere@gmail.com')return {ok:false,message:'O Administrador Master não pode ser alterado por este fluxo.'};
      const name=String(patch?.name||'').trim();if(!name)return {ok:false,message:'Informe um nome válido.'};
      await runTransaction(db,async transaction=>{
        const targetRef=doc(db,'users',uid),publicRef=doc(db,'publicProfiles',uid),snap=await transaction.get(targetRef);
        if(!snap.exists())throw new Error('Perfil do usuário não encontrado no Firebase.');
        const email=String(snap.data()?.email||target.email||'').trim().toLowerCase();
        if(email==='folhadopaiquere@gmail.com')throw new Error('O Administrador Master não pode ser alterado por este fluxo.');
        transaction.set(targetRef,{name,updatedAt:serverTimestamp()},{merge:true});
        transaction.set(publicRef,{uid,email,name,updatedAt:serverTimestamp()},{merge:true});
      });
      return {ok:true,data:{uid,name}};
    } catch(error){return {ok:false,message:error?.message||'Não foi possível atualizar os dados administrativos.'};}
  }

  async function sendPasswordResetForUser(email) {
    if(!valid||!auth||!email)return {ok:false,disabled:true};
    try{
      const ctx=await getCurrentEditorContext();if(!ctx.chief)return {ok:false,message:'Somente o Editor-Chefe pode solicitar redefinição de senha.'};
      const clean=normalizeEmailAddress(email);if(clean==='folhadopaiquere@gmail.com')return {ok:false,message:'A redefinição do Administrador Master não deve ser feita por este formulário.'};
      await sendPasswordResetEmail(auth,clean);return {ok:true};
    }catch(error){
      const code=error?.code||'';
      const friendly={'auth/user-not-found':'Não foi encontrada uma conta Firebase com esse e-mail.','auth/invalid-email':'Não foi possível validar o e-mail. Verifique se ele está completo e sem espaços ou caracteres extras.','auth/too-many-requests':'Muitas solicitações. Tente novamente mais tarde.'};
      return {ok:false,code,message:friendly[code]||error?.message||'Não foi possível enviar a redefinição de senha.'};
    }
  }

  async function setUserRole(uid, role) {
    if (!valid || !db || !uid) return { ok:false, disabled:true };
    try {
      const ctx = await getCurrentEditorContext();
      if (!ctx.chief) return {ok:false,message:'Somente o Editor-Chefe pode alterar cargos.'};
      const target = await loadProfile(uid).catch(() => null);
      if (!target) return {ok:false,message:'Perfil do usuário não encontrado no Firebase.'};
      if (String(target.email||'').toLowerCase() === 'folhadopaiquere@gmail.com') return {ok:false,message:'O Administrador Master não pode ser rebaixado.'};
      const nextRole = ['Editor-Chefe','Editor','Estudante'].includes(role) ? role : 'Estudante';
      const userRef=doc(db,'users',uid), publicRef=doc(db,'publicProfiles',uid);
      await runTransaction(db,async transaction=>{
        const targetSnap=await transaction.get(userRef);
        if(!targetSnap.exists()) throw new Error('Perfil do usuário não encontrado no Firebase.');
        if(String(targetSnap.data()?.email||target.email||'').toLowerCase()==='folhadopaiquere@gmail.com') throw new Error('O Administrador Master não pode ser rebaixado.');
        transaction.set(userRef,{role:nextRole,updatedAt:serverTimestamp()},{merge:true});
        transaction.set(publicRef,{uid,email:targetSnap.data()?.email||target.email||'',role:nextRole,updatedAt:serverTimestamp()},{merge:true});
      });
      return {ok:true,data:{uid,role:nextRole}};
    } catch (error) {
      return {ok:false,message:error?.message||'Não foi possível atualizar o cargo no Firebase.'};
    }
  }

  async function revokeAccess(uid) {
    if (!valid || !db || !uid) return {ok:false,disabled:true};
    try {
      const ctx = await getCurrentEditorContext();
      if (!ctx.chief) return {ok:false,message:'Somente o Editor-Chefe pode revogar acessos.'};
      const target = await loadProfile(uid).catch(() => null);
      if (!target) return {ok:false,message:'Perfil do usuário não encontrado no Firebase.'};
      if (String(target.email||'').toLowerCase() === 'folhadopaiquere@gmail.com') return {ok:false,message:'O Administrador Master não pode ser removido.'};
      await setDoc(doc(db,'users',uid),{accessRevoked:true,welcomeTourCompleted:false,welcomeTourAcceptedAt:deleteField(),updatedAt:serverTimestamp()},{merge:true});
      await setDoc(doc(db,'publicProfiles',uid),{accessRevoked:true,updatedAt:serverTimestamp()},{merge:true});
      return {ok:true,data:{uid,accessRevoked:true}};
    } catch (error) {
      return {ok:false,message:error?.message||'Não foi possível revogar o acesso no Firebase.'};
    }
  }

  async function restoreAccess(uid) {
    if (!valid || !db || !uid) return {ok:false,disabled:true};
    try {
      const ctx = await getCurrentEditorContext();
      if (!ctx.chief) return {ok:false,message:'Somente o Editor-Chefe pode restaurar acessos.'};
      const target = await loadProfile(uid).catch(() => null);
      if (!target) return {ok:false,message:'Perfil do usuário não encontrado no Firebase.'};
      if(String(target.email||'').trim().toLowerCase()==='folhadopaiquere@gmail.com')return {ok:false,message:'O Administrador Master não pode ser alterado por este fluxo.'};
      let profileRebuilt=false;
      await runTransaction(db,async transaction=>{
        const userRef=doc(db,'users',String(uid)),publicRef=doc(db,'publicProfiles',String(uid));
        const userSnap=await transaction.get(userRef);
        if(!userSnap.exists())throw new Error('Perfil do usuário não encontrado no Firebase.');
        const userData=userSnap.data()||{};
        if(String(userData.email||target.email||'').trim().toLowerCase()==='folhadopaiquere@gmail.com')throw new Error('O Administrador Master não pode ser alterado por este fluxo.');
        const wasPlanBTombstone=String(userData.revocationMode||'')==='spark-plan-b';
        const publicSnap=await transaction.get(publicRef);
        transaction.set(userRef,{accessRevoked:false,welcomeTourCompleted:false,welcomeTourAcceptedAt:deleteField(),revocationMode:deleteField(),revokedAt:deleteField(),updatedAt:serverTimestamp()},{merge:true});
        if(publicSnap.exists()&&!wasPlanBTombstone){
          // A simple reversible removal keeps the existing profile data, as before.
          transaction.set(publicRef,{accessRevoked:false,updatedAt:serverTimestamp()},{merge:true});
        }else{
          // A Plan B tombstone may exist even if its earlier public-profile delete failed.
          // Replace the public record atomically with an empty profile; do not restore private fields.
          transaction.set(publicRef,{
            uid:String(uid),email:String(userData.email||target.email||'').trim().toLowerCase(),
            name:String(userData.name||target.name||'').trim(),role:String(userData.role||target.role||'Estudante'),accessRevoked:false,
            bio:'',academicHistory:'',assignedTitle:'',profileYear:'',schoolYear:'',
            contributions:[],socialLinks:[],avatar:'',updatedAt:serverTimestamp()
          });
          profileRebuilt=true;
        }
      });
      return {ok:true,data:{uid,accessRevoked:false,profileRebuilt}};
    } catch (error) {
      return {ok:false,message:error?.message||'Não foi possível restaurar o acesso no Firebase.'};
    }
  }

  async function saveAchievement(id, data, options = {}) {
    if (!valid || !db || !id) return false;
    const payload = clone(data) || {};
    if (typeof options.onProgress === 'function') options.onProgress(6, 'Conectando ao Firebase…');
    if (!currentUser) throw new Error('É necessário estar autenticado no Firebase para registrar a conquista.');
    if (isDataUrl(payload.image)) {
      const uid = currentUser.uid;
      payload.image = await persistDataUrl(`users/${uid}/achievements/${id}.jpg`, payload.image, {
        folder: `achievements/${id}`,
        onProgress: options.onProgress
      });
    }
    if (/^data:/i.test(String(payload.image || ''))) {
      throw new Error('A foto da conquista ainda está em formato local e não foi enviada ao Cloudinary.');
    }
    const stored = { ...payload, id: String(id), updatedAt: serverTimestamp() };
    if (typeof options.onProgress === 'function') options.onProgress(92, 'Gravando conquista no banco de dados…');
    await setDoc(doc(db, 'achievements', String(id)), stored, { merge: true });
    if (typeof options.onProgress === 'function') options.onProgress(100, 'Conquista salva no Firebase.');
    return stored;
  }

  async function saveSuggestion(id, data) {
    if (!valid || !db || !id) return {ok:false,message:'O Firebase não está disponível.'};
    try {
      const payload={ ...clone(data), id: String(id), updatedAt: serverTimestamp() };
      if(!payload.authorUid && currentUser?.uid) payload.authorUid=String(currentUser.uid);
      if(!payload.createdAt)payload.createdAt=new Date().toISOString();
      // A criação de suggestions é pública, enquanto a leitura é restrita à redação.
      // Não faça uma leitura de confirmação após o write: para um visitante isso
      // gera permission-denied mesmo quando o setDoc já foi aceito pelo Firebase.
      await setDoc(doc(db, 'suggestions', String(id)), payload, { merge: true });
      return {ok:true,id:String(id)};
    } catch(error) {
      return {ok:false,code:error?.code||'',message:error?.message||'Falha ao salvar a pauta no Firebase.'};
    }
  }

  async function deleteSuggestion(id) {
    if(!valid||!db||!id)return {ok:false,message:'O Firebase não está disponível.'};
    try {
      // Use o ID real do documento recebido pelos leitores da coleção.
      // Uma exclusão de caminho inexistente pode terminar sem erro no Firestore;
      // conferir a existência evita retirar somente o card local por engano.
      const ref=doc(db,'suggestions',String(id));
      const existing=await getDoc(ref);
      if(!existing.exists())return {ok:false,code:'not-found',message:'A pauta não foi encontrada no Firebase. Atualize a lista e tente novamente.'};
      await deleteDoc(ref);
      return {ok:true,id:String(id)};
    } catch(error) {
      return {ok:false,code:error?.code||'',message:error?.message||'Não foi possível excluir a pauta no Firebase.'};
    }
  }

  async function fetchOwnSuggestions() {
    if(!valid||!db)return {ok:false,items:[],message:'O Firebase não está disponível.'};
    try {
      const user = currentUser || auth?.currentUser;
      if(!user?.uid)return {ok:false,items:[],code:'not-authenticated',message:'Não há uma identidade anônima ativa.'};
      // A consulta já limita os resultados ao próprio UID. Isso permite que o
      // visitante descubra quando a redação excluiu uma pauta sem abrir a
      // coleção para leitura pública.
      const snap=await getDocs(query(collection(db,'suggestions'),where('authorUid','==',String(user.uid)),limit(500)));
      return {ok:true,items:snap.docs.map(s=>({...s.data(),id:s.id}))};
    } catch(error) {
      return {ok:false,items:[],code:error?.code||'',message:error?.message||'Não foi possível consultar suas pautas.'};
    }
  }

  function listenOwnSuggestions(callback) {
    if(!valid||!db||typeof callback!=='function')return()=>{};
    let stopped=false;
    let unsubscribe=()=>{};
    ensureAnonymousIdentity().then(user=>{
      if(stopped||!user?.uid)return;
      const q=query(collection(db,'suggestions'),where('authorUid','==',String(user.uid)),limit(500));
      unsubscribe=onSnapshot(q,snap=>callback(snap.docs.map(s=>({...s.data(),id:s.id}))),()=>{});
    }).catch(()=>{});
    return ()=>{stopped=true;try{unsubscribe();}catch(_){}};
  }

  async function fetchOwnSuggestion(id) {
    const all=await fetchOwnSuggestions();
    if(!all?.ok)return {ok:false,exists:false,code:all?.code||'',message:all?.message||'Não foi possível consultar a pauta.'};
    const suggestion=all.items.find(x=>String(x.id)===String(id));
    return suggestion?{ok:true,exists:true,id:String(id),suggestion}:{ok:true,exists:false,id:String(id)};
  }

  const reactionVoterId = () => { if(currentUser?.uid) return `u_${currentUser.uid}`; let id=''; try{id=localStorage.getItem('fp_reaction_voter_id')||'';}catch(_){} if(!id){id=`b_${Date.now()}_${Math.random().toString(36).slice(2,10)}`;try{localStorage.setItem('fp_reaction_voter_id',id);}catch(_){}} return id; };
  async function saveReaction(articleId, type) {
    if(!valid||!db||!articleId) return {ok:false}; type='like';
    const voterId=reactionVoterId(), ref=doc(db,'reactions',`${String(articleId)}__${encodeURIComponent(voterId)}`), articleRef=doc(db,'articles',String(articleId));
    try { const result=await runTransaction(db,async tx=>{ const [reactionSnap,articleSnap]=await Promise.all([tx.get(ref),tx.get(articleRef)]); if(!articleSnap.exists()) throw new Error('Matéria não encontrada.'); const article=articleSnap.data()||{}; const prev=reactionSnap.exists()?reactionSnap.data()?.type:null; let likes=Number(article.likes||0),dislikes=Number(article.dislikes||0); if(prev===type){ if(type==='like')likes=Math.max(0,likes-1);else dislikes=Math.max(0,dislikes-1); tx.delete(ref); } else { if(prev==='like')likes=Math.max(0,likes-1); if(prev==='dislike')dislikes=Math.max(0,dislikes-1); if(type==='like')likes++;else dislikes++; tx.set(ref,{articleId:String(articleId),voterId,type,updatedAt:serverTimestamp()}); } tx.update(articleRef,{likes,dislikes}); return {likes,dislikes,current:prev===type?null:type}; }); return {ok:true,...result}; } catch(error){return {ok:false,message:error?.message||'Não foi possível registrar a reação.'};}
  }
  async function fetchReaction(articleId){ if(!valid||!db||!articleId)return {likes:0,dislikes:0,current:null}; try{const article=await getDoc(doc(db,'articles',String(articleId))); if(!article.exists())return {likes:0,dislikes:0,current:null}; const voterId=reactionVoterId(); const mine=await getDoc(doc(db,'reactions',`${String(articleId)}__${encodeURIComponent(voterId)}`)); const d=article.data()||{}; return {likes:Number(d.likes||0),dislikes:Number(d.dislikes||0),current:mine.exists()?mine.data()?.type:null};}catch(_){return {likes:0,dislikes:0,current:null};}}
  async function fetchComments(articleId) {
    if(!valid||!db||!articleId)return null;
    await authReady.catch(()=>null);
    try{
      const snap=await getDocs(query(collection(db,'comments'),where('articleId','==',String(articleId))));
      return snap.docs.map(s=>({id:s.id,...s.data()})).sort((a,b)=>new Date(a.createdAt||0)-new Date(b.createdAt||0));
    }catch(_){return null;}
  }
  async function fetchCommentsByAuthorUid(uid){
    if(!valid||!db||!uid)return [];
    await authReady.catch(()=>null);
    if(!currentUser?.uid||String(currentUser.uid)!==String(uid))return [];
    try{
      const snap=await getDocs(query(collection(db,'comments'),where('authorUid','==',String(uid))));
      return snap.docs.map(s=>({id:s.id,...s.data()}));
    }catch(_){return [];}
  }
  async function saveComment(comment) {
    if(!valid||!db||!comment?.id)return false;
    try{
      const payload={...clone(comment),createdAt:comment.createdAt||new Date().toISOString(),visible:comment.visible!==false};
      await setDoc(doc(db,'comments',String(comment.id)),payload,{merge:true});
      return true;
    }catch(_){return false;}
  }

  async function deleteComment(id) {
    if(!valid||!db||!id)return false;
    try {
      await deleteDoc(doc(db,'comments',String(id)));
      return true;
    } catch(_) {
      return false;
    }
  }
  async function fetchPollResults(articleId,pollIndex){if(!valid||!db||!articleId)return {total:0,options:[]};try{const snap=await getDocs(collection(db,'pollVotes'));const rows=snap.docs.map(s=>s.data()).filter(v=>String(v.articleId)===String(articleId)&&Number(v.pollIndex||0)===Number(pollIndex||0));const options=[];rows.forEach(v=>(Array.isArray(v.selections)?v.selections:[]).forEach(i=>options[Number(i)]=(Number(options[Number(i)]||0)+1)));return {total:rows.length,options};}catch(_){return {total:0,options:[]};}}
  async function savePollVote(articleId,pollIndex,selections){if(!valid||!db||!articleId)return false;try{const voterId=reactionVoterId();await setDoc(doc(db,'pollVotes',`${String(articleId)}__${Number(pollIndex||0)}__${encodeURIComponent(voterId)}`),{articleId:String(articleId),pollIndex:Number(pollIndex||0),voterId,selections:Array.isArray(selections)?selections:[],updatedAt:serverTimestamp()},{merge:true});return true;}catch(_){return false;}}
  async function fetchSuggestions(){if(!valid||!db)return [];const snap=await getDocs(collection(db,'suggestions'));return snap.docs.map(s=>({...s.data(),id:s.id}));}
  function listenSuggestions(callback){if(!valid||!db||typeof callback!=='function')return()=>{};return onSnapshot(collection(db,'suggestions'),snap=>callback(snap.docs.map(s=>({...s.data(),id:s.id}))),()=>{});}
  async function waitForAuthenticatedUser(timeoutMs = 10000) {
    if (!valid || !auth) return null;
    if (currentUser) return currentUser;
    return new Promise(resolve => {
      let done = false;
      let timer = null;
      const finish = user => {
        if (done) return;
        done = true;
        if (timer) clearTimeout(timer);
        try { unsubscribe?.(); } catch (_) {}
        resolve(user || null);
      };
      const unsubscribe = onAuthStateChanged(auth, user => {
        if (user) finish(user);
      });
      timer = setTimeout(() => finish(currentUser || null), Number(timeoutMs) || 10000);
    });
  }

  async function waitForAuth() { return authReady; }
  function isEnabled() { return valid; }
  function getAuthUser() { return currentUser; }
  function getProfile() { return clone(currentProfile); }
  function watchAuth(callback) { if (!valid || typeof callback !== 'function') return () => {}; return onAuthStateChanged(auth, callback); }

  window.FPCloud = {
    version: 'wave-1-foundation',
    enabled: isEnabled,
    app,
    auth,
    db,
    roleAtLeast,
    firebaseSignIn,
    firebaseSignOut,
    ensureAnonymousIdentity,
    createOwnAuthAccount,
    provisionUser,
    setUserRole,
    updateEditorialProfileData,
    updateEditorialAccess,
    sendPasswordResetForUser,
    revokeAccess,
    restoreAccess,
    revokeAndHideEditorialAccess,
    loadProfile,
    loadPublicProfile,
    syncPublicProfileFromUser,
    savePublicProfile,
    saveOwnProfileOnce,
    fetchPublicProfiles,
    fetchPublicProfileByEmail,
    fetchEditorialUsers,
    fetchAchievements,
    deleteAchievement,
    listenAchievements,
    saveEditorialUser: setEditorialUser,
    syncCurrentProfileToLocal,
    saveArticle,
    replaceArticles,
    deleteArticle,
    deleteCloudinaryAssets,
    listCloudinaryOrphans,
    clearCloudinaryOrphans,
    incrementArticleView,
    fetchPublicArticles,
    fetchEditorialArticles,
    listenPublicArticles,
    listenEditorialArticles,
    uploadFile,
    uploadDataUrl,
    saveAchievement,
    saveSuggestion, deleteSuggestion, fetchOwnSuggestion, fetchOwnSuggestions, listenOwnSuggestions,
    saveSchoolNotice, deleteSchoolNotice, fetchSchoolNotices, listenSchoolNotices,
    createProfileChangeRequest, fetchProfileChangeRequests, resolveProfileChangeRequest,
    getProfileAuthorization, fetchProfileAuthorizations, setProfileAuthorization,
    fetchSuggestions, listenSuggestions,
    saveReaction,
    fetchReaction,
    fetchComments,
    fetchCommentsByAuthorUid,
    saveComment,
    deleteComment,
    fetchPollResults,
    savePollVote,
    getAuthUser,
    waitForAuth,
    waitForAuthenticatedUser,
    getProfile,
    getCurrentEditorContext,
    watchAuth,
    collection,
    doc,
    getDoc,
    getDocs,
    setDoc,
    updateDoc,
    deleteDoc,
    serverTimestamp,
    isReady: valid
  };

  if (typeof window.__resolveFPCloudReady === 'function') { window.__resolveFPCloudReady(window.FPCloud); window.__resolveFPCloudReady = null; }
  window.dispatchEvent(new CustomEvent('fp:firebase-ready', { detail: { enabled: valid } }));
})();
