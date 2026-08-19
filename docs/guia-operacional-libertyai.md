# LibertyAI — Guia Operacional Completo

## 1. Finalidade

A **LibertyAI** é uma aplicação web de perguntas e respostas baseada em documentos fornecidos pela operação. Ela extrai e indexa conteúdo de PDFs, imagens e planilhas para responder perguntas no chat público. Os documentos são sempre a fonte prioritária. Quando habilitada, a pesquisa externa via Tavily apenas complementa o contexto e aparece identificada separadamente na resposta.

O sistema possui um chat público, um painel administrativo em `/admin`, histórico isolado por navegador, armazenamento persistente de arquivos, banco de dados para conversas e um monitor que mantém o acervo sincronizado a partir de uma pasta da VPS.

## 2. Como a resposta é construída

Quando um visitante faz uma pergunta, a aplicação identifica os termos relevantes, busca trechos entre os documentos que já foram indexados e seleciona até sete trechos com melhor correspondência. Em paralelo, a integração Tavily pode retornar evidências externas. A IA recebe a instrução administrativa, a política fixa de segurança, os trechos documentais prioritários, as fontes externas e parte do histórico recente da mesma conversa.

| Regra | Comportamento da LibertyAI |
| --- | --- |
| Fonte prioritária | Os documentos indexados prevalecem sobre fontes externas. |
| Fonte externa | É complementar, depende de `TAVILY_API_KEY` e aparece separada no chat. |
| Falta de evidência | A resposta informa que não há informação suficiente nos documentos nem nas fontes externas. |
| Segurança | Instruções encontradas em PDFs, planilhas, imagens ou páginas externas são dados, não comandos. |
| Idioma | A política fixa solicita respostas em português do Brasil. |
| Referências | Cada mensagem da IA salva as fontes documentais e externas utilizadas. |

## 3. Arquitetura e arquivos principais

| Área | Responsabilidade | Arquivos principais |
| --- | --- | --- |
| Chat público | Interface de perguntas, histórico e fontes. | `client/src/pages/Home.tsx`, `client/src/components/AIChatBox.tsx` |
| Painel | Login local, documentos e instrução-base. | `client/src/pages/Admin.tsx`, `client/src/pages/AdminLogin.tsx` |
| Rotas | Contratos tRPC de chat, admin e autenticação. | `server/routes/`, `server/routers.ts` |
| Controladores | Orquestram os casos de uso. | `server/controllers/` |
| Serviços | Indexação, OCR, monitoramento, busca externa e IA. | `server/services/` |
| Repositórios | Leitura e escrita de documentos, trechos, conversas e configuração. | `server/repositories/` |
| Banco | Schema e migrações do MariaDB. | `drizzle/schema.ts`, `drizzle/` |
| Inicialização | Express, tRPC, Vite e monitor de arquivos. | `server/_core/index.ts` |
| Produção | Imagem Docker, Compose e migração automática. | `Dockerfile`, `docker-compose.yml`, `scripts/start.sh` |

## 4. Conversas simultâneas e histórico

Cada navegador recebe um identificador privado de visitante e mantém o identificador da conversa ativa no armazenamento local. A API só devolve mensagens quando a conversa pertence ao visitante que a solicitou. Dessa forma, várias pessoas podem enviar perguntas simultaneamente sem compartilhar histórico ou contexto.

### 4.1. Teste local da pasta de conhecimento

Ao iniciar a aplicação em modo de desenvolvimento (`NODE_ENV=development`) sem definir `KNOWLEDGE_DIR`, a LibertyAI cria automaticamente a pasta `knowledge` na raiz do repositório e começa a monitorá-la. Coloque nela PDFs, imagens, planilhas ou o arquivo `fontes.txt` para testar a indexação localmente. Em produção, essa conveniência não é usada: `KNOWLEDGE_DIR` deve apontar explicitamente para `/app/knowledge`.

Ao atualizar a página, a interface consulta a conversa guardada naquele mesmo navegador e restaura suas mensagens. Se o usuário trocar de navegador, dispositivo ou apagar os dados locais, ele começará uma conversa separada. O histórico permanece no banco enquanto os volumes do MariaDB forem preservados.

## 5. Acervo de documentos

O acervo pode ser administrado pelo painel, para PDFs enviados manualmente, ou pela pasta monitorada da VPS, indicada para a rotina operacional. A pasta aceita vários formatos e detecta inclusão, alteração e remoção de arquivos automaticamente.

| Tipo | Extensões aceitas | Tratamento |
| --- | --- | --- |
| PDF | `.pdf` | Extração de texto e indexação por página. |
| Imagem | `.png`, `.jpg`, `.jpeg`, `.webp` | OCR com Tesseract em português e inglês. |
| Planilha | `.xlsx`, `.xls`, `.csv` | Conversão de cada aba para texto tabular. |
| Lista de URLs | `fontes.txt` | Busca e indexação controlada de páginas web cadastradas. |

O tamanho máximo para sincronização automática é **25 MB por arquivo**. Um hash do conteúdo impede reindexação de arquivos que não mudaram. Se um arquivo for atualizado, seus trechos são recriados; se for removido da pasta, o documento de origem `folder` deixa de ser usado pelo chat.

### 5.1. Pasta correta na VPS

Os arquivos do acervo devem ficar no host da VPS em:

```text
/data/liberty-ai/knowledge
```

Antes do primeiro deploy, conecte-se por SSH à VPS e crie a pasta:

```bash
sudo mkdir -p /data/liberty-ai/knowledge
sudo chmod 775 /data/liberty-ai/knowledge
```

O Docker Compose monta essa pasta no contêiner como `/app/knowledge` e já define `KNOWLEDGE_DIR=/app/knowledge`. Não guarde o acervo dentro do repositório Git nem em diretórios temporários de deploy do Coolify.

### 5.2. Rotina de atualização do acervo

Copie, altere ou exclua documentos diretamente em `/data/liberty-ai/knowledge`. É possível usar subpastas, como `politicas/`, `procedimentos/` e `materiais/`. O monitor enfileira o processamento de um arquivo por vez, reduzindo o pico de memória na VPS. Para evitar sobrecarga, não adicione muitas imagens grandes simultaneamente.

### 5.3. Páginas web cadastradas com `fontes.txt`

Para disponibilizar páginas web como complemento permanente do acervo, crie o arquivo `/data/liberty-ai/knowledge/fontes.txt`. Cada linha deve conter uma URL pública completa; linhas vazias e comentários iniciados por `#` são ignorados. Use [`docs/fontes.txt.example`](fontes.txt.example) como ponto de partida.

```text
# Protocolos e orientações oficiais
https://www.gov.br/saude/pt-br
https://www.who.int/
```

Ao salvar ou substituir esse arquivo, o monitor atualiza as páginas listadas. Ao remover uma URL da lista, a página correspondente e seus trechos deixam de participar das respostas. Ao apagar `fontes.txt`, a LibertyAI remove todas as páginas que foram importadas por essa lista.

| Regra | Limite aplicado |
| --- | --- |
| Quantidade | Até 25 URLs por arquivo. |
| Protocolo | Apenas `https://` e `http://`. |
| Destino | Somente internet pública; endereços locais, redes privadas, metadados de nuvem, credenciais na URL e portas não usuais são bloqueados. |
| Conteúdo | Apenas HTML ou texto simples, até 2 MB por página e 45 mil caracteres indexados. |
| Atualização | Ocorre ao criar ou alterar `fontes.txt`; não há atualização periódica automática. |
| Referência no chat | Aparece como **Lista de links · domínio**, separada dos PDFs e da pesquisa web sob demanda. |

> Cadastre apenas páginas cuja informação você autorizou e confia. A LibertyAI trata todo conteúdo da página como informação de referência, nunca como instruções executáveis. PDFs e demais documentos internos continuam prioritários quando houver divergência.

## 6. Painel administrativo

O painel fica em:

```text
https://SEU-DOMINIO/admin/login
```

O login usa `ADMIN_EMAIL` e `ADMIN_PASSWORD`. A sessão local é assinada por `LOCAL_AUTH_SECRET`, dura doze horas e usa cookie HTTP-only.

| Função | Efeito |
| --- | --- |
| Enviar PDF | Valida, armazena e indexa um documento enviado pelo painel. |
| Listar acervo | Exibe documentos, origem e status de processamento. |
| Remover documento | Remove registro e trechos que poderiam responder perguntas futuras. |
| Instrução-base | Define tom, estilo e regras de negócio sem eliminar a política fixa de fontes. |

## 7. Variáveis de ambiente no Coolify

Cadastre estas variáveis na área de ambiente da aplicação no Coolify. Elas não devem ser enviadas ao GitHub, exibidas em capturas de tela ou compartilhadas em conversas públicas.

> Use [`docs/env.example`](env.example) como modelo. No ambiente local, copie seu conteúdo para um arquivo `.env` na raiz do projeto. No Coolify, cadastre os mesmos nomes individualmente no painel, sem criar ou enviar um `.env` ao repositório.

| Variável | Obrigatória | Exemplo | Finalidade |
| --- | --- | --- | --- |
| `APP_PORT` | Sim no Compose público | `3000` | Porta publicada pelo `docker-compose.yml` atualmente no GitHub. |
| `PORT` | Não | `3000` | Porta interna que o processo Node tenta usar; o padrão já é `3000`. |
| `NODE_ENV` | Não | `production` | Ativa o servidor de arquivos compilados; a imagem Docker já define este valor. |
| `MYSQL_DATABASE` | Sim | `libertyai` | Nome do banco MariaDB. |
| `MYSQL_USER` | Sim | `libertyai` | Usuário do banco. |
| `MYSQL_PASSWORD` | Sim | segredo forte | Senha do usuário do banco. |
| `MYSQL_ROOT_PASSWORD` | Sim | segredo distinto | Senha administrativa do MariaDB. |
| `DATABASE_URL` | Sim | `mysql://libertyai:SENHA@database:3306/libertyai` | Conexão da aplicação e migrações. |
| `ADMIN_EMAIL` | Sim | `admin@dominio.com.br` | E-mail do administrador. |
| `ADMIN_PASSWORD` | Sim | segredo forte | Senha do painel. |
| `LOCAL_AUTH_SECRET` | Sim | texto aleatório longo | Assina a sessão administrativa. |
| `S3_ENDPOINT` | Sim | `http://minio:9000` | Endpoint interno do MinIO. |
| `S3_REGION` | Sim | `us-east-1` | Região do cliente S3. |
| `S3_BUCKET` | Sim | `libertyai-documents` | Bucket privado de documentos. |
| `S3_ACCESS_KEY_ID` | Sim | identificador longo | Credencial do MinIO. |
| `S3_SECRET_ACCESS_KEY` | Sim | segredo com 8+ caracteres | Chave do MinIO. |
| `LLM_BASE_URL` | Sim | `https://api.openai.com/v1` | URL de provedor compatível com Chat Completions. |
| `LLM_API_KEY` | Sim | chave privada | Credencial do provedor de IA. |
| `LLM_MODEL` | Sim | nome do modelo | Modelo que gera as respostas. |
| `TAVILY_API_KEY` | Não | chave privada | Habilita pesquisa web complementar. |
| `KNOWLEDGE_DIR` | Sim para monitoramento automático | `/app/knowledge` | Pasta interna monitorada para PDFs, imagens e planilhas. |
| `NODE_OPTIONS` | Não | `--max-old-space-size=512` | Limite de heap do Node.js. |
| `JWT_SECRET` | Não | texto aleatório longo | Fallback para `LOCAL_AUTH_SECRET` e sessões Manus; não é necessário se `LOCAL_AUTH_SECRET` estiver definido. |

As variáveis são lidas diretamente pelo código com `process.env.NOME_DA_VARIAVEL`; elas não ficam gravadas no código-fonte. O `dotenv/config` lê o `.env` no ambiente local. No Coolify, os mesmos valores entram como variáveis de ambiente do contêiner, sem arquivo `.env` publicado no GitHub.

Uma chave adequada para `LOCAL_AUTH_SECRET` pode ser criada com:

```bash
openssl rand -base64 48
```

## 8. Execução local no Windows e VS Code

O ambiente de produção utiliza Node.js 22. Para reproduzir o comportamento local, instale o pnpm e as dependências na raiz do repositório:

```powershell
npm install -g pnpm@10.4.1
& "$env:APPDATA\npm\pnpm.cmd" install --frozen-lockfile
```

Se houver aviso de scripts de dependências bloqueados, aprove os pacotes solicitados:

```powershell
& "$env:APPDATA\npm\pnpm.cmd" approve-builds
```

Crie um `.env` local, que **não deve ser versionado**, com banco, IA e credenciais adequadas ao seu ambiente. Para testar a pasta monitorada, defina também `KNOWLEDGE_DIR` apontando para uma pasta existente no Windows.

```dotenv
DATABASE_URL=mysql://libertyai:SUA_SENHA@127.0.0.1:3306/libertyai
ADMIN_EMAIL=admin@local.test
ADMIN_PASSWORD=troque-esta-senha
LOCAL_AUTH_SECRET=gere-uma-chave-longa-e-aleatoria
LLM_BASE_URL=https://SEU-PROVEDOR/v1
LLM_API_KEY=SUA_CHAVE
LLM_MODEL=SEU_MODELO
TAVILY_API_KEY=SUA_CHAVE_OPCIONAL
KNOWLEDGE_DIR=C:/Users/SEU_USUARIO/Documents/liberty-ia-chat/knowledge
```

Inicie o servidor pelo PowerShell:

```powershell
$env:NODE_ENV = "development"
& "$env:APPDATA\npm\pnpm.cmd" exec tsx watch server/_core/index.ts
```

Abra [http://localhost:3000](http://localhost:3000). Para interromper, use `Ctrl + C`.

| Mensagem no terminal | Significado | Ação |
| --- | --- | --- |
| `OAUTH_SERVER_URL is not configured` | OAuth específico do ambiente Manus não foi configurado. | Não bloqueia o servidor da VPS; o painel usa autenticação local. |
| `Monitoramento desativado: KNOWLEDGE_DIR não configurado` | Não foi definida uma pasta local de acervo. | Defina `KNOWLEDGE_DIR` para testar a sincronização. |
| `Malformed URI sequence ... VITE_ANALYTICS...` | O HTML tinha referência a analytics exclusiva do ambiente Manus. | Atualize o projeto com a correção que remove esse script. |

Valide antes de enviar alterações ao GitHub:

```powershell
& "$env:APPDATA\npm\pnpm.cmd" check
& "$env:APPDATA\npm\pnpm.cmd" test
```

## 9. Implantação no Coolify

No Coolify, escolha o tipo de build **Docker Compose**, utilize o arquivo `docker-compose.yml` da raiz do repositório e associe o domínio ao serviço `app` na porta interna `3000`. O Compose usa `expose: 3000`; não publique a porta 3000 diretamente na internet.

| Serviço | Responsabilidade | Limite configurado |
| --- | --- | ---: |
| `app` | API, chat, indexação e OCR por demanda. | 640 MB |
| `database` | MariaDB com documentos, conversas e mensagens. | 384 MB |
| `minio` | Armazenamento persistente de arquivos. | 256 MB |

O arquivo `scripts/start.sh` executa `corepack pnpm drizzle-kit migrate` antes de iniciar o servidor com `node dist/index.js`. Se `DATABASE_URL` estiver ausente, inválida ou não conseguir conectar ao MariaDB, o contêiner encerra antes de mostrar `Server running...`.

### 9.1. Memória de build e memória de runtime

O build do frontend com Vite transforma milhares de módulos e precisa de mais memória que o processo de chat em operação. O `Dockerfile` reserva **1.024 MB de heap somente** para `pnpm install` e `pnpm run build`. O `docker-compose.yml` continua limitando o processo Node em execução a `512 MB` por meio de `NODE_OPTIONS` e o contêiner `app` a `640 MB`.

Para reduzir a pressão de memória, o chat deixou de incluir o renderizador de Markdown com suporte a diagramas e centenas de linguagens de código. A nova implementação mantém negrito, links, código simples, listas e parágrafos com um parser leve. Na validação local, o build caiu de **5.867 para 1.786 módulos transformados** e concluiu com heap de **768 MB**.

> Um erro `exit code 134` acompanhado de `FATAL ERROR: Reached heap limit` é uma falha de memória do Node durante o build, não um erro de credenciais ou da lógica do chat. A correção no Dockerfile deve estar commitada e enviada ao GitHub antes do novo deploy.

### 9.2. Checklist de primeira publicação

1. Confirme que as alterações foram testadas, commitadas e enviadas ao branch configurado, normalmente `main`.
2. Crie `/data/liberty-ai/knowledge` na VPS com a permissão indicada na seção 5.1.
3. Cadastre todas as variáveis obrigatórias no Coolify.
4. Aponte o domínio para a porta interna `3000` do serviço `app`.
5. Inicie o deploy e verifique se `app`, `database` e `minio` permanecem ativos.
6. Copie um PDF pequeno para a pasta de conhecimento.
7. Confirme no painel administrativo que o documento ficou pronto.
8. Faça uma pergunta no chat e verifique se a resposta mostra a fonte documental.

## 10. Diagnóstico de reinícios no Coolify

Quando o Coolify mostra `Stopped after reaching restart limit`, os contêineres temporários podem ser removidos antes de uma inspeção manual. Por isso, inicie a coleta **antes** do próximo deploy. No terminal SSH da VPS, execute:

```bash
sudo mkdir -p /root/libertyai-diagnostico
sudo docker events --since 0s --filter type=container \
  --format '{{.Time}} | {{.Action}} | {{.Actor.Attributes.name}}' \
  | grep --line-buffered -Ei 'liberty|n103b9o9|mariadb|minio' \
  | sudo tee /root/libertyai-diagnostico/libertyai-events-filtrados.log
```

O terminal ficará sem novas linhas até um novo deploy criar os contêineres da LibertyAI. Isso é esperado. Com o comando rodando, inicie um deploy no Coolify. Depois do erro, pressione `Ctrl + C` e leia o arquivo:

```bash
sudo cat /root/libertyai-diagnostico/libertyai-events-filtrados.log
free -h
sudo dmesg -T | grep -Ei 'out of memory|oom|killed process|memory cgroup' | tail -n 80
sudo journalctl -u docker --since '15 minutes ago' --no-pager | tail -n 200
```

| Evidência | Causa provável | Próxima ação |
| --- | --- | --- |
| `OOMKilled`, `Killed process` ou `memory cgroup` | Falta de memória na VPS ou pico durante build/início. | Medir serviços concorrentes, pausar itens não essenciais durante o deploy ou ampliar recursos após confirmação. |
| `exit code 134` e `Reached heap limit` no Vite | Heap do Node insuficiente durante a compilação da interface. | Confirmar que o `Dockerfile` usa `NODE_OPTIONS=--max-old-space-size=1024` no comando de build. |
| `DATABASE_URL is required` | Variável ausente. | Cadastrar `DATABASE_URL` no Coolify. |
| Erro em `database:3306` | Banco indisponível ou URL com host errado. | Usar `database` como host interno e revisar variáveis MySQL. |
| Erro de MinIO | `S3_*` ausentes ou incompatíveis. | Usar `http://minio:9000`, bucket e credenciais consistentes. |
| Erro de volume | Pasta do host não existe ou não permite acesso. | Criar `/data/liberty-ai/knowledge` e aplicar permissão 775. |

Os eventos de Listmonk, Traefik e Coolify podem aparecer no monitor completo porque compartilham a mesma VPS; eles não provam que sejam a causa do problema. Apenas a saída do `dmesg`, os eventos do contêiner LibertyAI e os logs de inicialização permitem concluir se ocorreu falta de memória.

## 11. Atualização segura

Faça alterações localmente, valide, envie ao GitHub e só então inicie um novo deploy no Coolify:

```powershell
& "$env:APPDATA\npm\pnpm.cmd" check
& "$env:APPDATA\npm\pnpm.cmd" test
git status
git add .
git commit -m "tipo: descreva a alteracao"
git push origin main
```

Nunca inclua `.env`, chaves, dados de clientes nem arquivos da pasta de conhecimento no Git. O acervo deve permanecer em `/data/liberty-ai/knowledge`, e as credenciais devem permanecer no Coolify.

## 12. Backup

Para recuperação completa, preserve três grupos de dados: o banco MariaDB, o volume MinIO e a pasta de conhecimento do host.

| Item | Conteúdo | Recomenda-se guardar |
| --- | --- | --- |
| MariaDB | Metadados, trechos, conversas, mensagens e instrução-base. | Dump diário ou antes de alterações relevantes. |
| MinIO | Arquivos guardados pelo sistema. | Backup conforme a frequência de inclusão. |
| Pasta de conhecimento | Arquivos originais usados na sincronização. | Cópia após alterações importantes do acervo. |

## 13. Referências internas

- [`docker-compose.yml`](../docker-compose.yml): serviços, limites de memória e volume da pasta de conhecimento.
- [`scripts/start.sh`](../scripts/start.sh): migração automática e início do servidor.
- [`docs/vps-environment.md`](vps-environment.md): referência resumida das variáveis da VPS.
- [`server/services/knowledge-ingestion.service.ts`](../server/services/knowledge-ingestion.service.ts): ingestão de PDF, imagem e planilha.
- [`server/services/chat-context.service.ts`](../server/services/chat-context.service.ts): política de contexto, fontes e resposta.
