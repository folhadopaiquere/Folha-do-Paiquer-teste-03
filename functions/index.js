'use strict';

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore } = require('firebase-admin/firestore');

initializeApp();

const MASTER_EMAIL = 'folhadopaiquere@gmail.com';
const MASTER_UID = 'lS9e7GzRx2XmfuPdnxNpMjNCpqe2';
const REGION = 'us-central1';

/**
 * Removes one editorial access from Firebase Authentication and its personal
 * account/profile documents. Shared journalism content is intentionally kept.
 * This endpoint is callable only by the Editor-Chefe or the Master account.
 */
// O endpoint callable precisa aceitar o preflight HTTP publicamente. A identidade
// do solicitante e o cargo administrativo continuam validados abaixo, no servidor.
exports.deleteEditorialAccess = onCall({ region: REGION, cors: true, invoker: 'public', enforceAppCheck: false }, async request => {
  if (!request.auth?.uid) {
    throw new HttpsError('unauthenticated', 'Entre novamente para excluir um acesso.');
  }

  const db = getFirestore();
  const auth = getAuth();
  const actorUid = String(request.auth.uid);
  const actorEmail = String(request.auth.token?.email || '').trim().toLowerCase();
  const actorRef = db.collection('users').doc(actorUid);
  const actorSnap = await actorRef.get();
  const actorRole = String(actorSnap.data()?.role || '');
  const isMaster = actorEmail === MASTER_EMAIL;
  const isChief = isMaster || actorRole === 'Editor-Chefe';

  if (!isChief) {
    throw new HttpsError('permission-denied', 'Somente o Editor-Chefe pode excluir contas.');
  }
  if (actorSnap.data()?.accessRevoked === true && !isMaster) {
    throw new HttpsError('permission-denied', 'Esta conta está desativada.');
  }

  const targetUid = String(request.data?.uid || '').trim();
  if (!targetUid || targetUid.length > 128) {
    throw new HttpsError('invalid-argument', 'O identificador do acesso não é válido.');
  }
  if (targetUid === actorUid) {
    throw new HttpsError('failed-precondition', 'Não é permitido excluir a própria conta.');
  }
  if (targetUid === MASTER_UID) {
    throw new HttpsError('failed-precondition', 'O Administrador Master não pode ser excluído.');
  }

  const targetRef = db.collection('users').doc(targetUid);
  const targetSnap = await targetRef.get();
  if (!targetSnap.exists) {
    throw new HttpsError('failed-precondition', 'O cadastro deste acesso não foi encontrado. Atualize a lista e tente novamente.');
  }
  const targetData = targetSnap.data() || {};
  const profileEmail = String(targetData.email || '').trim().toLowerCase();
  if (targetData.protected === true || profileEmail === MASTER_EMAIL) {
    throw new HttpsError('failed-precondition', 'O Administrador Master não pode ser excluído.');
  }

  // If the auth identity already disappeared in a previous interrupted attempt,
  // the personal Firestore records can still be cleaned up safely.
  try {
    const targetAuth = await auth.getUser(targetUid);
    const authEmail = String(targetAuth.email || '').trim().toLowerCase();
    if (authEmail === MASTER_EMAIL) {
      throw new HttpsError('failed-precondition', 'O Administrador Master não pode ser excluído.');
    }
    await auth.deleteUser(targetUid);
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    if (error?.code !== 'auth/user-not-found') {
      console.error('[deleteEditorialAccess] Não foi possível excluir o usuário do Firebase Authentication:', error);
      throw new HttpsError('internal', 'Não foi possível remover a autenticação deste acesso. Nenhum dado foi removido.');
    }
  }

  const refs = new Map();
  const addRef = ref => refs.set(ref.path, ref);
  addRef(targetRef);
  addRef(db.collection('publicProfiles').doc(targetUid));
  addRef(db.collection('profileChangeRequests').doc(targetUid));

  // Old profile-authorization records can have an id different from the UID.
  const relatedQueries = await Promise.all([
    db.collection('profileChangeRequests').where('studentUid', '==', targetUid).get(),
    db.collection('profileChangeRequests').where('uid', '==', targetUid).get()
  ]);
  relatedQueries.forEach(snapshot => snapshot.docs.forEach(docSnap => addRef(docSnap.ref)));

  const docs = [...refs.values()];
  for (let offset = 0; offset < docs.length; offset += 400) {
    const batch = db.batch();
    docs.slice(offset, offset + 400).forEach(ref => batch.delete(ref));
    try {
      await batch.commit();
    } catch (error) {
      console.error('[deleteEditorialAccess] A autenticação foi removida, mas a limpeza dos dados individuais falhou:', error);
      throw new HttpsError('internal', 'A autenticação foi removida, mas a limpeza dos dados de perfil não foi concluída. Reabra a seção e tente novamente para finalizar.');
    }
  }

  // Do not delete articles, achievements, suggestions, shared contributions,
  // comments, poll data, or public newsroom records that should remain available.
  return { ok: true, uid: targetUid, deletedAuth: true, removedPersonalDocuments: docs.length };
});
