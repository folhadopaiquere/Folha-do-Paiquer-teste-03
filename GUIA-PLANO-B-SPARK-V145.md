# Guia rápido — Plano B Spark v145

1. Faça backup do site e confirme o projeto Firebase.
2. Extraia `folha-do-paiquere-v145.zip` e publique a pasta `v145_work` mantendo a estrutura dos arquivos.
3. Se as regras do Plano B da v144 ainda não foram publicadas, copie `firestore.rules-v145.txt` integralmente para Firebase Console → Firestore Database → Regras. Se a v144 já está ativa, as regras não mudaram nesta versão.
4. Publique somente Hosting: `firebase.cmd deploy --only hosting --project folha-do-paiquere`.
5. Teste primeiro com uma conta não protegida.

Após conclusão sem avisos, “Remover perfil e dados” retira o registro das listas Ativos e Inativos. Se algum passo falhar, ele fica em Inativos para nova tentativa. O documento privado tombstone permanece no Firestore para evitar a recuperação do perfil; a conta do Firebase Authentication deve ser apagada manualmente em Authentication → Users.

Não execute deploy de Cloud Functions para esta versão.
