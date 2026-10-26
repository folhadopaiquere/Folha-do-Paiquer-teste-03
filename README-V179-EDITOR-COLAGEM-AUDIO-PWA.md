# Folha do Paiquerê — v179

## Base e escopo

- Base: pacote completo `folha-do-paiquere-v178.zip`.
- Objetivo: corrigir a colagem de texto no editor, esclarecer as fontes válidas do bloco de áudio e reforçar a instalação do site como aplicativo web (PWA).
- A versão v178 não foi sobrescrita.
- Nenhum deploy foi realizado. Não houve alteração no projeto Firebase remoto, nos documentos do Firestore ou nas permissões.

## 1. Colagem de texto no editor

### Causa

O handler de `paste` do editor de blocos só intervinha quando havia marcas de formatação pendentes. Em outros casos, o navegador executava a colagem rica padrão e podia importar HTML do clipboard ou herdar a aparência do elemento anterior, incluindo negrito e tamanho de título.

### Correção

- A colagem no campo editável passa a usar o texto simples (`text/plain`), evitando importar a formatação HTML do site/documento de origem.
- O texto inserido recebe uma base explícita de fonte, tamanho, peso, itálico e sublinhado, em vez de depender apenas da formatação herdada do elemento anterior.
- O preset Normal/Título/Subtítulo recém-selecionado tem prioridade para tamanho e peso na próxima colagem, inclusive quando só um trecho do bloco recebeu o preset.
- Os controles de fonte, negrito, itálico, sublinhado, alinhamento, listas e links existentes foram preservados; o handler atualiza o modelo de texto pelo evento `input` já usado pelo editor.
- Se o clipboard não tiver texto simples, a ação é bloqueada e uma orientação é exibida, em vez de inserir HTML não solicitado.

## 2. Bloco de áudio e links externos

O bloco de áudio continua aceitando links HTTP/HTTPS públicos que apontem diretamente para um arquivo de áudio compatível. A prévia tenta reproduzir esse recurso com o player nativo do navegador.

URLs de páginas do YouTube, TikTok e outras plataformas de vídeo/música passam a ser reconhecidas e recusadas com uma explicação. Uma URL de página não é um arquivo de áudio direto, e o navegador não a transforma automaticamente em MP3.

**Não foi implementada extração/separação do áudio de vídeos externos.** Isso não é fornecido pelas APIs oficiais de incorporação; as políticas de desenvolvedor do YouTube proíbem separar ou isolar componentes de áudio/vídeo do conteúdo disponibilizado por seus serviços. Alternativas: inserir o vídeo pelo bloco Vídeo oficial ou hospedar um arquivo de áudio que o publicador tenha direito de distribuir e colar a URL direta.

## 3. “Baixar site” e abertura sem barra de endereço

- O manifesto já usava `display: "standalone"`; esse comportamento foi preservado.
- Foram criados ícones quadrados PWA de 192×192 e 512×512 com base no brasão existente e incluídos no `manifest.webmanifest`.
- O service worker passou para um cache versionado novo e inclui os novos ícones no precache, sem remover a estratégia network-first existente.
- A orientação de instalação agora explica que o usuário precisa abrir a versão instalada pelo ícone do dispositivo para obter a janela de aplicativo sem a barra de endereço, quando suportado pela plataforma.
- “Baixar site” instala/adiciona a aplicação web; não baixa um ZIP independente e não garante, por si só, funcionamento completo offline de todas as páginas e dados.

## 4. Arquivos alterados

- `editor.js` — colagem em texto simples, cálculo do estilo de colagem e validação/orientação de URL no bloco de áudio.
- `editor.html` — instruções do bloco de áudio.
- `manifest.webmanifest` — ícones PWA quadrados.
- `pwa.js` — instruções sobre a instalação e a experiência standalone.
- `folha-notifications-sw.js` — cache versionado e precache dos novos ícones.
- `assets/branding/pwa-icon-192.png` e `assets/branding/pwa-icon-512.png` — novos ícones.
- `firestore.rules-v179.txt` — cópia integral de referência; as regras não foram alteradas.

## 5. Verificações e limitações

- `node --check`: 14 arquivos JavaScript passaram sem erros de sintaxe.
- Parser CSS: 45 folhas CSS, sem erros.
- HTML: 14 páginas; sem IDs duplicados nem recursos locais ausentes após resolver caminhos absolutos a partir da raiz do site.
- Manifesto JSON: válido; arquivos de ícones existem e as dimensões conferem.
- Regras: `firestore.rules-v179.txt` é idêntico byte a byte a `firestore.rules`.
- ZIP: verificado após empacotamento.
- Teste visual/interativo integrado no navegador: não concluído. A tentativa headless de abrir o editor excedeu o limite do ambiente; portanto, colagem real e instalação devem ser testadas no navegador-alvo antes da publicação.
