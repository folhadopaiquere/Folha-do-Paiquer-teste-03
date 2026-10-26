/* Folha do Paiquerê v168 — controlled authentication/loading veil. */
(() => {
  'use strict';
  const overlay = document.getElementById('fp-auth-loading');
  if (!overlay) return;
  const message = overlay.querySelector('[data-auth-loading-message]');
  let failSafeTimer = 0;
  let closeTimer = 0;
  let leavingForNavigation = false;

  const show = (text) => {
    if (closeTimer) window.clearTimeout(closeTimer);
    closeTimer = 0;
    leavingForNavigation = false;
    if (message && typeof text === 'string' && text.trim()) message.textContent = text.trim();
    overlay.hidden = false;
    overlay.classList.remove('is-leaving');
    overlay.setAttribute('aria-busy', 'true');
    if (failSafeTimer) window.clearTimeout(failSafeTimer);
    // Network/auth failures must never trap a person behind the veil indefinitely.
    failSafeTimer = window.setTimeout(() => hide(), 45000);
  };
  const hide = () => {
    if (leavingForNavigation) return;
    if (failSafeTimer) window.clearTimeout(failSafeTimer);
    failSafeTimer = 0;
    overlay.setAttribute('aria-busy', 'false');
    overlay.classList.add('is-leaving');
    if (closeTimer) window.clearTimeout(closeTimer);
    closeTimer = window.setTimeout(() => {
      overlay.hidden = true;
      overlay.classList.remove('is-leaving');
    }, 240);
  };
  const keepUntilNavigation = () => { leavingForNavigation = true; };
  window.FPAuthLoading = { show, hide, keepUntilNavigation };

  const mode = String(overlay.dataset.authLoadingMode || 'manual');
  if (mode === 'editor') {
    const settle = () => window.setTimeout(hide, 420);
    window.addEventListener('load', settle, { once: true });
    window.setTimeout(() => { if (!overlay.hidden) hide(); }, 18000);
    if (document.readyState === 'complete') settle();
  } else if (mode === 'panel') {
    // portal.js hides this when panel initialization completes; fallback is in show().
    show('Carregando sua Área do Estudante…');
  }
})();
