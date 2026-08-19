# LibertyAI

A LibertyAI é uma aplicação de perguntas e respostas baseada em documentos e fontes externas controladas. O painel administrativo recebe PDFs, extrai o texto por página, indexa os segmentos e permite definir uma instrução-base. O chat prioriza o acervo interno, pode complementar com fontes web identificadas e, quando não houver acervo disponível, responde com orientação geral deixando clara a ausência de fontes internas.

## Acesso privado

A versão de produção é publicada em [**https://ia.libertysaude.com.br**](https://ia.libertysaude.com.br), mas o chat exige uma conta local ativa. O painel administrativo fica em [**https://ia.libertysaude.com.br/admin/login**](https://ia.libertysaude.com.br/admin/login). Somente o administrador cria, desativa e redefine as contas em `/admin/usuarios`; não há cadastro público.

> O domínio deve apresentar um certificado HTTPS válido. Não utilize a opção de continuar em uma página marcada como “Não seguro”; corrija o certificado no Coolify antes de administrar a aplicação ou inserir credenciais.

## Estrutura e garantia de contexto

| Área | Responsabilidade |
| --- | --- |
| `server/models` | Tipos de domínio de documentos, segmentos e fontes. |
| `server/repositories` | Persistência de documentos, contexto, conversas e configuração. |
| `server/services` | Upload, leitura de PDF, indexação, recuperação de contexto e integração com IA. |
| `server/controllers` | Casos de uso administrativos e de conversa. |
| `server/middlewares` | Validação de PDF e autenticação administrativa local. |
| `server/routes` | Contratos de API tipados para o painel e o chat. |

> A instrução-base define comportamento e tom, mas não pode desativar a política fixa: documentos internos continuam prioritários, fontes externas são identificadas e, sem acervo, a resposta deve esclarecer que se trata de orientação geral não fundamentada em material da LibertyAI.

## Conversas simultâneas e histórico

Cada usuário acessa com uma conta local criada pelo administrador. Depois do login, uma sessão HTTP-only permanece válida por até 30 dias no navegador, evitando novo login a cada visita. O navegador também recebe um identificador aleatório próprio e mantém a conversa ativa separada. No servidor, uma conversa só é lida quando pertencente **à conta autenticada e ao navegador correspondente**. O banco guarda cada mensagem associada ao respectivo `conversationId`, incluindo as fontes usadas na resposta.

| Situação | Comportamento da LibertyAI |
| --- | --- |
| Dez pessoas perguntam ao mesmo tempo | Cada solicitação é processada de forma independente, sem memória global compartilhada entre usuários. |
| A mesma pessoa atualiza a página | A sessão permanece válida por até 30 dias e o chat restaura a conversa salva naquele navegador. |
| Outra pessoa tenta usar um identificador de conversa | O servidor exige a conta proprietária e o identificador privado do navegador; sem ambas as correspondências, devolve histórico vazio. |
| A mesma pessoa tenta enviar duas mensagens simultâneas | A interface desabilita o envio enquanto a resposta está em processamento, preservando a ordem da conversa no navegador. |

O histórico permanece no banco enquanto os dados da aplicação forem preservados. Uma mesma conta pode usar mais de um navegador, mas cada navegador inicia e restaura sua própria conversa. Desativar uma conta ou redefinir sua senha encerra imediatamente as sessões existentes.

## Implantação na VPS com Docker

Na VPS, instale Docker Engine e o plugin Docker Compose. Crie o arquivo `.env` a partir da [referência de variáveis](docs/vps-environment.md), troque **todas** as senhas e chaves por valores seguros do seu ambiente e inicie os serviços.

```bash
nano .env
docker compose up -d --build
docker compose ps
```

O conjunto sobe três serviços persistentes: a aplicação Node.js, MariaDB e MinIO. Os PDFs ficam no volume do MinIO e os metadados, trechos e conversas ficam no volume do MariaDB. Assim, reinicializações dos contêineres não removem o contexto.

| Variável | Finalidade |
| --- | --- |
| `ADMIN_EMAIL` e `ADMIN_PASSWORD` | Credenciais do painel em `/admin/login`. |
| `LOCAL_AUTH_SECRET` | Protege a sessão administrativa e as sessões locais de usuários; use uma sequência aleatória longa. |
| `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL` | Conecta um provedor de IA compatível com Chat Completions. |
| `S3_*` | Protege o armazenamento privado de PDFs no MinIO. |

Para expor o serviço em um domínio com HTTPS, coloque um proxy reverso (por exemplo, Nginx ou Caddy) diante da porta definida em `APP_PORT`. O proxy deve encaminhar o cabeçalho `X-Forwarded-Proto: https`, permitindo que os cookies administrativos sejam marcados como seguros.

## Operação

Após a implantação, abra `https://seu-dominio/admin/login`, entre com as credenciais definidas no `.env`, crie as contas em `/admin/usuarios` e envie os PDFs. Cada pessoa acessa `https://seu-dominio/login` com a senha temporária recebida e deve trocá-la no primeiro uso. Um documento só é consultado no chat quando o estado exibido no painel é **Pronto**. Ao removê-lo, seus segmentos deixam de ser elegíveis para respostas futuras.

Para atualizar a aplicação na VPS, execute `git pull` e depois `docker compose up -d --build`. A inicialização aplica as migrações Drizzle antes de subir o servidor.

## Implantação no Coolify

Para esta aplicação, escolha **Docker Compose** como tipo de build, use a base `/` e aponte o arquivo de composição para `docker-compose.yml`. No serviço `app`, associe o domínio à porta interna **3000**; não é necessário expor a porta 3000 diretamente na internet.

> A composição não usa mais um contêiner temporário para criar o bucket. Essa mudança evita o ciclo de reinício observado no Coolify quando o contêiner de inicialização termina antes de o orquestrador concluir o acompanhamento. A própria aplicação cria o bucket do MinIO de modo idempotente na primeira gravação.

No painel de variáveis do Coolify, cadastre as variáveis descritas em [`docs/vps-environment.md`](docs/vps-environment.md). A composição usa explicitamente o caminho seguro `/data/liberty-ai/knowledge`, fora do diretório temporário do deploy. Crie essa pasta no servidor e permita leitura e escrita ao Docker antes de publicar.

```bash
sudo mkdir -p /data/liberty-ai/knowledge
sudo chmod 775 /data/liberty-ai/knowledge
```

Depois da publicação, deixe nesta pasta os arquivos que alimentarão o chat. A LibertyAI monitora inclusões, alterações e exclusões de **PDF, PNG, JPG, WEBP, XLSX, XLS e CSV**, processando um arquivo por vez para conservar memória. PDFs usam extração textual, imagens usam OCR em português e inglês e planilhas são convertidas em texto por aba.

| Serviço | Limite configurado | Motivo |
| --- | ---: | --- |
| Aplicação Node.js | 640 MB | Chat, indexação serializada e OCR por demanda. |
| MariaDB | 384 MB | Buffer reduzido e suficiente para o acervo inicial. |
| MinIO | 256 MB | Armazenamento privado dos arquivos processados. |

Essa distribuição deixa margem para o Coolify e o sistema operacional em uma VPS de 2 GB. Amplie a memória somente se os logs mostrarem reinicialização por falta de memória, OCR recorrente de imagens grandes ou processamento de muitos arquivos simultâneos.
