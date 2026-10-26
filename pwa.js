(() => {
  'use strict';
  let installPrompt = null;

  const isStandalone = () => Boolean(
    window.matchMedia?.('(display-mode: standalone)')?.matches ||
    window.navigator.standalone === true
  );

  const showMessage = message => {
    let box = document.getElementById('fp-pwa-status');
    if (!box) {
      box = document.createElement('div');
      box.id = 'fp-pwa-status';
      box.className = 'fp-pwa-status';
      box.setAttribute('role', 'status');
      box.setAttribute('aria-live', 'polite');
      document.body.append(box);
    }
    box.textContent = message;
    box.classList.add('is-visible');
    window.clearTimeout(box.__fpHideTimer);
    box.__fpHideTimer = window.setTimeout(() => box?.classList.remove('is-visible'), 5200);
  };

  const showInstallHelp = () => {
    const ua = navigator.userAgent || '';
    let message = 'O navegador não disponibilizou a instalação direta agora. Abra o menu do navegador e procure “Instalar app” ou “Adicionar à tela inicial”. Depois, abra a Folha pelo ícone criado para usar a janela do aplicativo, sem a barra de endereço quando a plataforma oferecer esse modo.';
    if (/iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1)) {
      message = 'Neste dispositivo, o site não pode criar o atalho silenciosamente. Abra o menu Compartilhar do navegador e escolha “Adicionar à Tela de Início”; confirme a adição e abra a Folha pelo ícone criado.';
    } else if (/Android/i.test(ua)) {
      message = 'Se a instalação direta não estiver disponível, abra o menu ⋮ do navegador e escolha “Instalar app” ou “Adicionar à tela inicial”. Confirme a ação e depois abra a Folha pelo ícone criado para ocultar a barra de endereço. O navegador exige essa confirmação.';
    } else if (/Windows|Linux|Macintosh/i.test(ua)) {
      message = 'Use a opção “Instalar Folha do Paiquerê” no menu do navegador ou o ícone de instalação da barra de endereço. Confirme a instalação e abra o atalho criado. O site não pode remover a barra do navegador de uma aba comum.';
    }

    let overlay = document.getElementById('fp-pwa-install-help');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'fp-pwa-install-help';
      overlay.className = 'fp-pwa-help-overlay';
      overlay.innerHTML = '<section class="fp-pwa-help-dialog" role="dialog" aria-modal="true" aria-labelledby="fp-pwa-help-title"><img src="assets/branding/brasao-folha-paiquere-192.png" alt="" width="58" height="58"><h2 id="fp-pwa-help-title">Instalar a Folha do Paiquerê</h2><p id="fp-pwa-help-text"></p><button type="button" class="fp-pwa-install-button" id="fp-pwa-help-close">Entendi</button></section>';
      document.body.append(overlay);
      overlay.addEventListener('click', event => {
        if (event.target === overlay || (event.target instanceof Element && event.target.closest('#fp-pwa-help-close'))) overlay.classList.remove('is-visible');
      });
      overlay.addEventListener('keydown', event => {
        if (event.key === 'Escape') overlay.classList.remove('is-visible');
      });
    }
    const text = overlay.querySelector('#fp-pwa-help-text');
    if (text) text.textContent = message;
    overlay.classList.add('is-visible');
    overlay.querySelector('#fp-pwa-help-close')?.focus();
  };

  const handleInstall = async event => {
    event?.preventDefault?.();
    if (isStandalone()) {
      showMessage('Você já está usando a Folha do Paiquerê como aplicativo.');
      return;
    }
    const promptEvent = installPrompt;
    if (!promptEvent || typeof promptEvent.prompt !== 'function') {
      showInstallHelp();
      return;
    }
    installPrompt = null;
    try {
      // O prompt nativo só pode ser aberto como consequência direta da ação da pessoa.
      promptEvent.prompt();
      const result = await promptEvent.userChoice;
      if (result?.outcome === 'accepted') {
        showMessage('O navegador confirmou a instalação. Abra o ícone da Folha do Paiquerê quando ele aparecer no dispositivo.');
      } else {
        showMessage('A instalação não foi confirmada. Você pode tentar novamente quando o navegador oferecer a opção.');
      }
    } catch (_) {
      showInstallHelp();
    }
  };

  // O evento pode chegar antes que o menu público móvel seja criado; guardamos o prompt.
  // `beforeinstallprompt` não é suportado de modo uniforme em todas as plataformas.
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    installPrompt = event;
  });
  window.addEventListener('appinstalled', () => {
    installPrompt = null;
    showMessage('Folha do Paiquerê instalada com sucesso. Abra-a pelo ícone do dispositivo.');
  });

  const boot = () => {
    // Event delegation supports [data-pwa-install] buttons generated after DOMContentLoaded.
    if (!document.documentElement.dataset.fpPwaClickBound) {
      document.documentElement.dataset.fpPwaClickBound = '1';
      document.addEventListener('click', event => {
        if (!(event.target instanceof Element)) return;
        const button = event.target.closest('[data-pwa-install]');
        if (!button || button.disabled) return;
        handleInstall(event);
      });
    }
    if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
      const appBase = new URL('./', window.location.href);
      const workerUrl = new URL('folha-notifications-sw.js', appBase);
      navigator.serviceWorker.register(workerUrl.href, { scope: appBase.pathname }).catch(() => {});
    }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
