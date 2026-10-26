PERSISTÊNCIA — FOLHA DO PAIQUERÊ

A publicação não depende do botão de PDF. O PDF foi removido da leitura pública nesta reconstrução.

O sistema agora usa IndexedDB como armazenamento persistente adicional para as matérias, mantendo fp_articles como cache compatível. Isso evita que uma matéria desapareça quando o localStorage atingir o limite por causa de imagens/canvas.

IMPORTANTE: para testar localmente, prefira abrir o projeto por um servidor HTTP local em vez de abrir os HTMLs diretamente com file://. Exemplo, na pasta do projeto:

python -m http.server 8000

Depois acesse:
http://localhost:8000/

Fluxo esperado:
1. Estudante cria/salva a matéria.
2. Envia para revisão.
3. Editor abre a matéria pendente.
4. Editor clica em Postar.
5. A matéria recebe status Aprovado e visible=true.
6. Home e Notícias leem o mesmo registro persistido.
7. A página individual usa o mesmo registro.

A foto de perfil também recebe uma camada persistente no IndexedDB para reduzir falhas quando o armazenamento local estiver cheio.
