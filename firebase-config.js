/* Configuração Web pública do Firebase — Folha do Paiquerê */
const config = {
  apiKey: "AIzaSyCWhhMHuqoAZ-mRVWKDmBKXUI70bJSGlv4",
  authDomain: "folha-do-paiquere.firebaseapp.com",
  projectId: "folha-do-paiquere",
  storageBucket: "folha-do-paiquere.firebasestorage.app",
  messagingSenderId: "688129869180",
  appId: "1:688129869180:web:61dba2dcf3e1c700a950f9",
  measurementId: "G-7258101FR6"
};

window.FIREBASE_CONFIG = { enabled: true, ...config };
window.FOLHA_FIREBASE = { enabled: true, config };

// A ponte de inicialização evita que portal.js execute o fallback local antes do módulo Firebase.
if (!window.FPCloudReady) window.FPCloudReady = new Promise(resolve => { window.__resolveFPCloudReady = resolve; });
