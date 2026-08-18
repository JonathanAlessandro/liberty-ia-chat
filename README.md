# LibertyAI

A LibertyAI é uma aplicação de perguntas e respostas ancorada em documentos. O painel administrativo recebe PDFs, extrai o texto por página, indexa os segmentos e permite definir uma instrução-base. O chat público envia ao modelo somente trechos recuperados dos documentos ativos e uma política fixa que proíbe fontes externas.

## Estrutura e garantia de contexto

| Área | Responsabilidade |
| --- | --- |
| `server/models` | Tipos de domínio de documentos, segmentos e fontes. |
| `server/repositories` | Persistência de documentos, contexto, conversas e configuração. |
| `server/services` | Upload, leitura de PDF, indexação, recuperação de contexto e integração com IA. |
| `server/controllers` | Casos de uso administrativos e de conversa. |
| `server/middlewares` | Validação de PDF e autenticação administrativa local. |
| `server/routes` | Contratos de API tipados para o painel e o chat. |

> A instrução-base define comportamento e tom, mas não pode desativar a política fixa: a LibertyAI não usa ferramentas nem contexto externo e informa quando não existe evidência documental suficiente.

## Conversas simultâneas e histórico

Cada navegador recebe um identificador aleatório próprio e a conversa ativa recebe um identificador separado. Ambos são enviados em cada pergunta. No servidor, uma conversa só é lida quando os dois valores correspondem; portanto, uma solicitação com o identificador de outra conversa não retorna mensagens. O banco guarda cada mensagem associada ao respectivo `conversationId`, incluindo as fontes usadas na resposta.

| Situação | Comportamento da LibertyAI |
| --- | --- |
| Dez pessoas perguntam ao mesmo tempo | Cada solicitação é processada de forma independente, sem memória global compartilhada entre os visitantes. |
| A mesma pessoa atualiza a página | O chat consulta o `conversationId` salvo naquele navegador e restaura apenas o próprio histórico. |
| Outra pessoa tenta usar um identificador de conversa | O servidor compara o identificador privado do visitante antes de retornar mensagens; sem correspondência, devolve histórico vazio e inicia uma conversa própria na próxima pergunta. |
| A mesma pessoa tenta enviar duas mensagens simultâneas | A interface desabilita o envio enquanto a resposta está em processamento, preservando a ordem da conversa no navegador. |

O histórico permanece no banco enquanto os dados da aplicação forem preservados. Para que a pessoa volte à mesma conversa, ela deve usar o mesmo navegador e não apagar os dados locais desse navegador. Se for necessário que o histórico acompanhe usuários em diversos dispositivos, a próxima evolução recomendada é adicionar autenticação de usuários ao chat público.

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
| `LOCAL_AUTH_SECRET` | Assina a sessão administrativa; use uma sequência aleatória longa. |
| `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL` | Conecta um provedor de IA compatível com Chat Completions. |
| `S3_*` | Protege o armazenamento privado de PDFs no MinIO. |

Para expor o serviço em um domínio com HTTPS, coloque um proxy reverso (por exemplo, Nginx ou Caddy) diante da porta definida em `APP_PORT`. O proxy deve encaminhar o cabeçalho `X-Forwarded-Proto: https`, permitindo que os cookies administrativos sejam marcados como seguros.

## Operação

Após a implantação, abra `https://seu-dominio/admin/login`, entre com as credenciais definidas no `.env` e envie os PDFs. Um documento só é consultado no chat quando o estado exibido no painel é **Pronto**. Ao removê-lo, seus segmentos deixam de ser elegíveis para respostas futuras.

Para atualizar a aplicação na VPS, execute `git pull` e depois `docker compose up -d --build`. A inicialização aplica as migrações Drizzle antes de subir o servidor.
