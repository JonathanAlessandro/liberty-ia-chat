# LibertyAI — Documentação Técnica e de Operação

> **Escopo deste documento.** Este guia descreve a implementação da LibertyAI presente neste repositório. Ele é destinado à administração da plataforma, à manutenção técnica, ao suporte operacional e à evolução do sistema. Para o procedimento diário de inclusão de arquivos e configuração do Coolify, consulte também o [Guia Operacional](guia-operacional-libertyai.md) e o [modelo seguro de ambiente](env.example).

## 1. Visão geral

A **LibertyAI** é uma aplicação web de perguntas e respostas em português do Brasil, construída para atender usuários a partir de um acervo controlado pela administração. Esse acervo pode ser composto por PDFs, imagens, planilhas e páginas web previamente aprovadas em `fontes.txt`. O chat reúne apenas os trechos pertinentes à pergunta e os envia ao provedor de IA com regras fixas de prioridade e rastreabilidade.

O sistema mantém três princípios operacionais. O primeiro é a **prioridade documental**: materiais internos indexados são a base da resposta; páginas cadastradas e pesquisa web são complementares e sempre identificadas. O segundo é o **isolamento de conversa**: cada navegador mantém um identificador próprio e só pode recuperar o histórico associado a ele. O terceiro é a **operação desacoplada do Git**: o acervo da produção vive em volume da VPS, e não dentro do repositório ou do diretório temporário de deploy.

| Capacidade | Implementação atual |
| --- | --- |
| Chat público | Interface React com histórico do navegador, estado de carregamento, fontes e Markdown leve. |
| Administração | Login local, envio manual de PDFs, listagem/remoção de documentos e edição da instrução administrativa. |
| Acervo automático | Monitoramento de pasta com Chokidar para PDFs, imagens, planilhas e `fontes.txt`. |
| Recuperação de contexto | Busca lexical por termos normalizados, seleção dos sete melhores trechos e rastreio por página/origem. |
| IA | Provedor compatível com OpenAI Chat Completions ou fallback de desenvolvimento; Tavily opcional para busca complementar. |
| Persistência | MariaDB para metadados, trechos e conversas; MinIO/S3 para os arquivos originais. |
| Implantação | Docker Compose no Coolify, com Node.js 22, MariaDB 11.4, MinIO e OCR Tesseract. |

## 2. Arquitetura de alto nível

A LibertyAI é uma aplicação monolítica modular. O frontend React e a API Express/tRPC são entregues pelo mesmo processo Node em produção. Os serviços de banco de dados e de objetos rodam como contêineres separados, enquanto o acervo operacional é montado da VPS no contêiner da aplicação.

```mermaid
flowchart LR
    U[Visitante] -->|HTTPS| T[Traefik / Coolify]
    A[Administrador] -->|HTTPS /admin| T
    T --> APP[LibertyAI
Express + tRPC + React]
    APP --> DB[(MariaDB)]
    APP --> S3[(MinIO / S3)]
    APP --> LLM[Provedor LLM
OpenAI-compatible]
    APP -. opcional .-> TV[Tavily]
    VPS[/data/liberty-ai/knowledge] -->|bind mount| APP
    APP -->|OCR| OCR[Tesseract por+eng]
```

O Coolify recebe o domínio público e encaminha requisições HTTPS ao serviço `app` na porta interna `3000`. O MariaDB e o MinIO não devem ser expostos diretamente à internet. A aplicação se conecta a eles pelos nomes internos de serviço `database` e `minio` da rede Docker Compose.

## 3. Tecnologias, camadas e estrutura de diretórios

O projeto usa React 19, TypeScript, Vite, Express 4, tRPC 11, Drizzle ORM, MySQL/MariaDB e pnpm. A divisão do backend evita que regras de negócio sejam concentradas nas rotas: as rotas validam contratos, os controladores coordenam casos de uso, os serviços realizam regras de negócio e os repositórios concentram persistência.

| Caminho | Responsabilidade |
| --- | --- |
| `client/src/pages/` | Páginas de navegador: chat público, painel, login e 404. |
| `client/src/components/` | Componentes reutilizáveis, incluindo `AIChatBox` e o layout administrativo. |
| `client/src/lib/` | Cliente tRPC, serialização de histórico e renderização Markdown leve. |
| `server/_core/` | Bootstrap Express, Vite/arquivos estáticos, tRPC, contexto, OAuth e infraestrutura compartilhada. |
| `server/routes/` | Procedimentos tRPC para chat, administração e autenticação local. |
| `server/controllers/` | Orquestração fina dos casos de uso chamados pelas rotas. |
| `server/services/` | Indexação, OCR, armazenamento, contexto RAG, IA, Tavily, watcher e ingestão de URLs. |
| `server/repositories/` | Consultas e atualizações do MariaDB por Drizzle. |
| `server/middlewares/` | Validação de PDFs e autenticação administrativa local. |
| `drizzle/` | Schema Drizzle, journal e SQL de migração. |
| `docs/` | Guias operacionais, ambiente, fontes externas e esta documentação. |
| `scripts/start.sh` | Migração do banco antes da inicialização em produção. |

### 3.1. Cadeia de requisição

O processo principal é iniciado por `server/_core/index.ts`. Ele carrega o ambiente, cria Express e HTTP, limita os corpos JSON e URL-encoded a 50 MB, registra rotas de armazenamento/OAuth e monta o adaptador tRPC em `/api/trpc`. Em desenvolvimento, o Vite entrega a interface; em produção, os arquivos compilados são servidos pelo próprio Express. Após abrir a porta, o processo inicia o observador da pasta de conhecimento.

```mermaid
sequenceDiagram
    participant Browser as Navegador
    participant API as Express / tRPC
    participant Ctrl as Controlador
    participant Service as Serviço de domínio
    participant Repo as Repositório
    participant DB as MariaDB

    Browser->>API: /api/trpc/chat.ask
    API->>Ctrl: valida entrada Zod
    Ctrl->>Repo: localiza/cria conversa
    Ctrl->>Repo: registra pergunta
    Ctrl->>Service: monta contexto e responde
    Service->>Repo: lê trechos e configuração
    Repo->>DB: consulta dados persistidos
    Service-->>Ctrl: resposta e fontes
    Ctrl->>Repo: registra resposta
    API-->>Browser: conversationId, resposta e fontes
```

## 4. Rotas do navegador

As rotas de interface são declaradas em `client/src/App.tsx` com Wouter. A página pública não possui página de marketing nem exemplos de perguntas: o foco é exclusivamente a conversa documental.

| Caminho | Público | Página | Função |
| --- | --- | --- | --- |
| `/` | Sim | `Home.tsx` | Exibe o chat, restaura o histórico local e envia perguntas. |
| `/admin/login` | Sim | `AdminLogin.tsx` | Formulário de autenticação administrativa local. |
| `/admin` | Não | `Admin.tsx` | Gerencia PDFs enviados, estado do acervo e instrução administrativa. |
| `/404` e demais | Sim | `NotFound.tsx` | Resposta para caminhos não reconhecidos. |

O link de administração é apenas uma rota de navegação. A proteção efetiva ocorre na API por meio de `adminProcedure`; não se deve assumir que esconder um botão do frontend substitui a autorização do servidor.

## 5. API tRPC e contratos

Todas as chamadas de negócio passam por `POST` ou `GET` no endpoint tRPC:

```text
/api/trpc/<grupo>.<procedimento>
```

O servidor usa `superjson` no transporte tRPC. Entradas são validadas com Zod antes de chegarem aos controladores. O contrato real é exportado como `AppRouter` em `server/routers.ts`, permitindo ao cliente React inferir tipos sem duplicar interfaces manualmente.

### 5.1. Procedimentos públicos

| Procedimento | Tipo | Entrada validada | Saída/efeito |
| --- | --- | --- | --- |
| `chat.ask` | Mutation | `visitorId` UUID, `conversationId` opcional positivo, pergunta entre 2 e 2.200 caracteres. | Cria ou reutiliza conversa do visitante, registra pergunta, gera resposta e grava fontes. |
| `chat.history` | Query | `visitorId` UUID e `conversationId` positivo. | Retorna mensagens somente se a conversa pertencer ao visitante informado. |
| `adminAuth.login` | Mutation | E-mail válido até 320 caracteres e senha até 256 caracteres. | Cria cookie de sessão administrativa quando as credenciais são corretas. |
| `adminAuth.logout` | Mutation | Sem entrada. | Limpa a sessão administrativa local. |
| `auth.me` | Query | Sem entrada. | Retorna o usuário presente no contexto, quando houver. |
| `auth.logout` | Mutation | Sem entrada. | Limpa a sessão de autenticação do contexto compatível com OAuth. |

### 5.2. Procedimentos administrativos

Os procedimentos abaixo usam `adminProcedure`. Ela exige usuário no contexto e `role === "admin"`; sem esses requisitos, o servidor retorna erro de autorização.

| Procedimento | Tipo | Entrada validada | Efeito |
| --- | --- | --- | --- |
| `admin.documents` | Query | Sem entrada. | Lista documentos, origem e estado de indexação. |
| `admin.uploadDocument` | Mutation | Nome, MIME type e conteúdo PDF em Base64. | Armazena e indexa um PDF enviado pelo painel. |
| `admin.removeDocument` | Mutation | `documentId` inteiro positivo. | Apaga o documento e os trechos vinculados. |
| `admin.aiConfiguration` | Query | Sem entrada. | Lê a instrução administrativa atual. |
| `admin.saveAiConfiguration` | Mutation | Texto entre 40 e 8.000 caracteres. | Atualiza a instrução de tom/regras de negócio. |

> O painel administrativo aceita **PDFs manuais**. Para imagens, planilhas e automação em lote, a rotina correta é adicionar arquivos à pasta monitorada da VPS.

## 6. Modelo de dados

O schema está em `drizzle/schema.ts`. A tabela de objetos não armazena os bytes do arquivo dentro do MariaDB; ela armazena referências ao MinIO/S3 e metadados. Isso evita crescimento excessivo do banco e permite manter arquivos, chunks e histórico com finalidades distintas.

| Entidade | Finalidade | Relações principais |
| --- | --- | --- |
| `users` | Usuários OAuth ou administrador local, com papel `user`/`admin`. | Pode criar documentos e atualizar a configuração. |
| `documents` | Metadados do item do acervo, origem, tipo, status e chave de armazenamento. | Um documento possui vários `documentChunks`. |
| `documentChunks` | Texto pesquisável, página/faixa de página e ordinal do fragmento. | Removido em cascata ao excluir o documento. |
| `aiConfigurations` | Instrução administrativa editável para a IA. | Registra o administrador que fez a última alteração. |
| `conversations` | Conversa identificada por `visitorId` do navegador. | Possui várias `messages`. |
| `messages` | Perguntas e respostas persistidas, incluindo `sourcesJson`. | Removida em cascata com a conversa. |

### 6.1. Proveniência de documentos

`documents` possui campos que permitem saber de onde cada conteúdo veio e como foi processado.

| Campo | Uso |
| --- | --- |
| `sourceKind` | Distingue `pdf`, `image`, `spreadsheet` e `web`. |
| `sourceOrigin` | Distingue, por exemplo, upload manual, pasta monitorada e fonte web importada. |
| `sourcePath` | Caminho relativo na pasta de conhecimento ou chave determinística de uma URL cadastrada. |
| `sourceFingerprint` | Hash do conteúdo, usado para não reindexar arquivo idêntico. |
| `status` | `processing`, `ready` ou `failed`; erros ficam em `errorMessage`. |
| `storageKey` | Referência do objeto no MinIO/S3 ou URL preservada para página web importada. |

## 7. Fluxo completo de chat e RAG

A LibertyAI não usa banco vetorial nesta versão. A recuperação é lexical e explicável: a pergunta e os chunks são normalizados para português, termos irrelevantes são removidos e cada chunk recebe pontuação conforme os termos encontrados. A estratégia tem baixo custo operacional e é adequada a acervos moderados; um crescimento significativo do acervo pode justificar a inclusão futura de embeddings e busca vetorial.

1. A página `Home.tsx` obtém ou cria um `visitorId` no armazenamento local e recupera o `conversationId` anterior do mesmo navegador.
2. A pergunta é mostrada imediatamente na interface e enviada a `chat.ask`.
3. O controlador localiza ou cria uma conversa associada àquele visitante e persiste a mensagem do usuário.
4. `chat-context.service.ts` lê os chunks de documentos com estado `ready`, executa a pesquisa Tavily em paralelo quando a chave está configurada e seleciona no máximo sete chunks relevantes.
5. Trechos internos e fontes complementares são separados. Páginas vindas de `fontes.txt` aparecem como **Lista de links**; resultados Tavily aparecem como **Web**.
6. A IA recebe a instrução administrativa, a política fixa, os dois blocos de contexto, até oito turnos recentes da conversa e a pergunta atual.
7. A resposta e as fontes utilizadas são gravadas em `messages`; a interface salva o novo `conversationId` no navegador e exibe as referências abaixo da mensagem.

### 7.1. Prioridade e regras da resposta

A política fixa enviada à IA não pode ser removida pelo administrador. Ela estabelece que documentos internos são prioritários, que conteúdo externo é apenas complementar, que instruções encontradas dentro de documentos/páginas são dados e que uma falta de evidência exige uma resposta explícita de insuficiência de contexto.

| Regra | Aplicação prática |
| --- | --- |
| Prioridade | Os trechos internos, com destaque para PDFs, prevalecem se houver conflito com conteúdo externo. |
| Fontes | A mensagem persiste referências por documento/página, URL cadastrada ou URL de busca. |
| Histórico | Apenas os oito últimos turnos são enviados ao modelo; cada conteúdo é limitado a 1.600 caracteres. |
| Segurança de prompt | Texto contido em PDF, imagem, planilha ou página não se torna instrução executável. |
| Ausência de contexto | A resposta informa que não existe evidência suficiente, em vez de inventar informação. |

### 7.2. Provedor de IA

`llm.service.ts` utiliza `LLM_BASE_URL`, `LLM_API_KEY` e `LLM_MODEL` para chamar um endpoint compatível com OpenAI Chat Completions, com temperatura baixa (`0.1`) para reduzir variação. Se essa configuração não estiver disponível no ambiente de desenvolvimento, existe fallback da infraestrutura de desenvolvimento. Em produção na VPS, configure explicitamente um provedor e não dependa do fallback.

## 8. Conversas simultâneas e isolamento

O isolamento não é baseado em IP, conta pública ou memória do processo. O cliente guarda dois valores no `localStorage`: `liberty-ai-visitor-id` e `liberty-ai-conversation-id`. O primeiro representa aquele perfil de navegador; o segundo aponta para sua conversa ativa.

No servidor, `findOrCreateConversation` só reutiliza conversa se o `visitorId` recebido corresponder ao valor persistido. Na leitura, `listConversationMessages` devolve lista vazia se `conversationId` e `visitorId` não coincidirem. Assim, duas pessoas que enviem mensagens simultaneamente possuem conversas independentes; apagar os dados do navegador ou trocar de dispositivo inicia outro contexto.

`createVisitorId` usa `crypto.randomUUID()` quando essa API estiver disponível. Em navegadores ou prévias HTTP que não a exponham, utiliza `crypto.getRandomValues()` para formar um UUID v4 compatível; há ainda uma alternativa de disponibilidade para navegadores excepcionalmente antigos. Esse cuidado mantém o chat operacional fora de HTTPS, mas não substitui HTTPS para proteção do tráfego real.

## 9. Administração e autenticação local

Em uma VPS independente do ambiente Manus, o painel usa autenticação local. As variáveis `ADMIN_EMAIL`, `ADMIN_PASSWORD` e `LOCAL_AUTH_SECRET` são obrigatórias para esse modo. Após validar e-mail e senha com comparação resistente a tempo, o servidor garante um usuário local com papel administrativo e emite JWT HS256 com expiração de 12 horas.

O token é gravado no cookie HTTP-only `libertyai_admin_session`, com `sameSite: lax`. O contexto tRPC tenta autenticação compatível com OAuth e, se ela não estiver disponível, utiliza a sessão local. Isso permite que os mesmos procedimentos administrativos sejam protegidos por `adminProcedure` sem acoplar o painel a uma única forma de login.

| Operação administrativa | Resultado |
| --- | --- |
| Login em `/admin/login` | Cria cookie de sessão por até 12 horas. |
| Upload manual de PDF | Valida conteúdo, armazena objeto, cria metadado e indexa páginas. |
| Remoção | Apaga metadado e chunks associados; o objeto pode ser tratado conforme política de armazenamento. |
| Instrução administrativa | Define tom e regras de negócio, sem substituir a política fixa de fontes. |
| Acervo de pasta | É listado no painel, mas deve ser modificado diretamente no diretório da VPS. |

## 10. Base de conhecimento e indexação

### 10.1. Pasta monitorada

Em produção, o diretório do host é `/data/liberty-ai/knowledge`. O Docker Compose monta esse caminho no contêiner como `/app/knowledge` e define `KNOWLEDGE_DIR=/app/knowledge`. O serviço `knowledge-watcher.service.ts` cria um observador Chokidar, ignora arquivos ocultos/não suportados e serializa eventos em uma fila para evitar picos de CPU e memória durante atualizações simultâneas.

Em desenvolvimento, se `NODE_ENV=development` e `KNOWLEDGE_DIR` não estiver definido, o sistema cria automaticamente `./knowledge` na raiz do repositório. Essa conveniência é exclusiva de desenvolvimento; a VPS deve usar caminho explícito e volume persistente.

| Entrada | Limite e processamento |
| --- | --- |
| PDF (`.pdf`) | Extração por página com `pdf-parse`; páginas são quebradas em chunks. |
| Imagem (`.png`, `.jpg`, `.jpeg`, `.webp`) | OCR Tesseract com idiomas `por+eng`. |
| Planilha (`.xlsx`, `.xls`, `.csv`) | Cada aba é convertida para CSV e indexada como seção. |
| `fontes.txt` | URLs autorizadas são buscadas, extraídas e armazenadas como fontes web. |
| Tamanho | Arquivos monitorados têm limite de 25 MB. |

O indexador normaliza texto e cria chunks de aproximadamente 1.150 caracteres com sobreposição de 180 caracteres, respeitando preferencialmente limites de frase ou quebra de linha. Quando um arquivo muda, o hash SHA-256 é comparado ao fingerprint armazenado: um item idêntico em estado `ready` é ignorado; um item modificado é reindexado; e um item removido deixa de participar do chat.

### 10.2. Páginas cadastradas em `fontes.txt`

`fontes.txt` é uma lista de URLs públicas, uma por linha. Linhas vazias e comentários com `#` são ignorados. O serviço aceita no máximo 25 URLs únicas, somente `http` e `https`, e rejeita credenciais na URL, portas incomuns, endereços privados, localhost e destinos semelhantes a metadados de nuvem. O objetivo é impedir SSRF, isto é, que uma lista administrativa induza o servidor a acessar serviços internos.

As páginas precisam ser HTML ou texto simples, têm limite de 2 MB por download e até 45 mil caracteres indexados. Ao retirar uma URL da lista ou apagar o arquivo, os documentos web importados correspondentes são removidos da base. A atualização ocorre quando o arquivo é criado ou alterado; não há coleta periódica automática.

### 10.3. Armazenamento de arquivos

`document-storage.service.ts` usa credenciais S3 para gravar arquivos sob chaves semelhantes a `liberty-ai/<origem>/<fingerprint>-<uuid>-<nome-seguro>`. No Compose da VPS, o endpoint é MinIO interno (`http://minio:9000`). O serviço tenta aguardar/criar o bucket durante a inicialização, reduzindo erros de corrida entre aplicação e MinIO.

## 11. Pesquisa externa com Tavily

`TAVILY_API_KEY` é opcional. Quando ausente, a busca externa retorna lista vazia e o chat continua funcionando com documentos internos. Quando presente, a aplicação consulta Tavily com profundidade básica, solicita até três resultados e conserva somente URLs HTTP/HTTPS, títulos, domínios e fragmentos reduzidos a 2.200 caracteres.

O resultado Tavily não é persistido como documento permanente, salvo pelo histórico de fontes da resposta. Isso é diferente de uma URL de `fontes.txt`, que é pré-aprovada, indexada e permanece no acervo até ser removida da lista.

| Origem | Quem controla | Persistência | Rótulo no chat |
| --- | --- | --- | --- |
| PDF/imagem/planilha | Administração | Documento e chunks no banco, arquivo no S3/MinIO. | `PDF` ou referência documental. |
| `fontes.txt` | Administração | Documento web e chunks até remoção da URL. | `Lista de links`. |
| Tavily | Busca sob demanda | Somente referência da mensagem. | `Web`. |

## 12. Variáveis de ambiente

Nunca envie `.env`, senhas, tokens, dumps ou arquivos do acervo ao Git. O arquivo [env.example](env.example) contém exemplos sem segredos. Em produção, os valores devem ser cadastrados no Coolify; localmente, podem estar no arquivo `.env` ignorado pelo Git.

| Grupo | Variáveis principais | Objetivo |
| --- | --- | --- |
| Banco | `MYSQL_DATABASE`, `MYSQL_USER`, `MYSQL_PASSWORD`, `MYSQL_ROOT_PASSWORD`, `DATABASE_URL` | Inicializa MariaDB e conecta aplicação/migrações. |
| Administração | `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `LOCAL_AUTH_SECRET` | Protege login e sessão local. |
| Objetos | `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | Permite persistir PDFs e arquivos da pasta. |
| IA | `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL` | Configura o provedor de chat. |
| Busca opcional | `TAVILY_API_KEY` | Ativa complementação web sob demanda. |
| Runtime | `NODE_ENV`, `PORT`, `NODE_OPTIONS`, `KNOWLEDGE_DIR` | Controla modo, porta, heap e diretório monitorado. |

Uma `DATABASE_URL` de produção usa o host interno `database`, não IP público:

```dotenv
DATABASE_URL=mysql://libertyai:SENHA_URL_ENCODED@database:3306/libertyai
S3_ENDPOINT=http://minio:9000
KNOWLEDGE_DIR=/app/knowledge
```

Se uma senha possuir caracteres reservados em URL, como `@`, `:`, `/`, `?` ou `#`, ela deve ser codificada na `DATABASE_URL`. A mesma senha, sem codificação, permanece no campo `MYSQL_PASSWORD`.

## 13. Implantação com Docker Compose e Coolify

O arquivo `docker-compose.yml` define três serviços. A imagem da aplicação é baseada em `node:22-bookworm-slim`, instala Tesseract e dados de idioma português, executa o build com heap reservado e inicia `scripts/start.sh`. Esse script executa `pnpm drizzle-kit migrate` antes de `node dist/index.js`.

| Serviço | Imagem/função | Persistência | Limite atual |
| --- | --- | --- | ---: |
| `app` | LibertyAI, API, frontend, RAG, watcher e OCR. | Bind mount da pasta de conhecimento. | 640 MB |
| `database` | MariaDB 11.4. | Volume `mariadb_data`. | 384 MB |
| `minio` | Armazenamento compatível com S3. | Volume `minio_data`. | 256 MB |

O banco possui healthcheck e a aplicação aguarda a condição saudável antes do start. O MinIO é acessado pelo nome de serviço interno e o serviço de armazenamento realiza tentativas de disponibilidade do bucket. A porta `3000` está apenas em `expose`; o acesso externo deve acontecer pelo proxy do Coolify, não por publicação direta de porta.

### 13.1. Domínio e HTTPS

Para domínio próprio, a forma recomendada é criar um subdomínio, como `ia.exemplo.com.br`, e apontá-lo para a VPS. Se já existir um subdomínio `api.exemplo.com.br` com registro A para a mesma VPS, é possível criar `ia` como CNAME para `api.exemplo.com.br`. No Coolify, associe o domínio **somente** ao serviço `app` e informe a URL com esquema:

```text
https://ia.exemplo.com.br
```

O campo de domínio do MinIO deve permanecer vazio. Com DNS já propagado e portas 80/443 disponíveis, o Traefik/Coolify solicita e renova o certificado. HTTPS é obrigatório para proteger as credenciais e também evita indisponibilidade de APIs de navegador que exigem contexto seguro, como certas funções de Web Crypto.

A instalação de produção atual usa [**https://ia.libertysaude.com.br**](https://ia.libertysaude.com.br). Esse endereço também está registrado no `README.md` como ponto público de visita. O certificado precisa ser válido antes da utilização administrativa; um erro como `NET::ERR_CERT_AUTHORITY_INVALID` indica certificado provisório, cadeia não confiável ou emissão ainda não concluída no proxy e não deve ser ignorado.

### 13.2. Ordem segura de publicação

1. Atualize o branch configurado pelo Coolify e execute `pnpm check` e `pnpm test` localmente.
2. Confirme que `drizzle/meta/_journal.json` referencia arquivos SQL existentes e que nenhum segmento separado por `--> statement-breakpoint` está vazio.
3. Crie no host o diretório `/data/liberty-ai/knowledge` e aplique permissão de escrita adequada ao Docker.
4. Cadastre as variáveis no Coolify e confira especialmente `DATABASE_URL`, variáveis `MYSQL_*`, `S3_*`, `LLM_*` e credenciais administrativas.
5. Configure o domínio HTTPS do serviço `app`, aguarde DNS e inicie **Deploy without cache** quando houver atualização de dependências ou Dockerfile.
6. Confirme nos logs a aplicação das migrações e a mensagem `Server running...`.
7. Faça o teste funcional: login em `/admin/login`, inclusão de PDF na pasta, status pronto no painel e pergunta com fonte exibida.

### 13.3. Memória

O Dockerfile reserva heap maior apenas durante a instalação/build, pois o Vite transforma muitos módulos. Em runtime, o contêiner da aplicação e `NODE_OPTIONS` têm limites menores para coexistir com MariaDB e MinIO em VPS pequena. Não aumente limites de um serviço isoladamente sem considerar a memória total do host, o sistema operacional, Traefik/Coolify e demais aplicações hospedadas.

## 14. Execução local

No Windows com PowerShell, use a versão de pnpm indicada pelo projeto. O script `dev` do `package.json` utiliza uma sintaxe de variável típica de Unix; por isso, execute o comando explícito abaixo no PowerShell.

```powershell
npm install -g pnpm@10.4.1
& "$env:APPDATA\npm\pnpm.cmd" install --frozen-lockfile
$env:NODE_ENV = "development"
& "$env:APPDATA\npm\pnpm.cmd" exec tsx watch server/_core/index.ts
```

Crie `.env` a partir de `docs/env.example` e use serviços locais/credenciais de teste. Com `NODE_ENV=development` e sem `KNOWLEDGE_DIR`, a aplicação cria `knowledge/` automaticamente. Abra `http://localhost:3000` após a mensagem de servidor iniciado.

| Comando | Finalidade |
| --- | --- |
| `pnpm check` | Executa TypeScript sem emitir arquivos. |
| `pnpm test` | Roda a suíte Vitest. |
| `pnpm exec vitest run server/deployment/migrations.test.ts` | Confere journal e proteções de migração. |
| `pnpm run build` | Gera frontend e backend compilados para produção. |

## 15. Testes e qualidade

A suíte cobre componentes críticos de isolamento de conversa, rotas de administração, upload/validação de PDF, contexto híbrido, watcher, ingestão de conhecimento, importação de URLs, segredo Tavily e configuração de deploy. Antes de qualquer alteração, a manutenção deve validar tanto a tipagem quanto os testes comportamentais.

```powershell
& "$env:APPDATA\npm\pnpm.cmd" check
& "$env:APPDATA\npm\pnpm.cmd" test
```

Mudanças em `drizzle/schema.ts` exigem especial cuidado. Gere e revise a migração, confira se ela é compatível com volumes já existentes e garanta que o journal e todos os arquivos SQL estejam no Git. Um erro de migração ocorre antes do processo HTTP iniciar e, por consequência, o Coolify pode exibir reinícios, 502 ou 404 no domínio.

## 16. Observabilidade e diagnóstico

O primeiro local de diagnóstico é o log de deploy/runtime do Coolify. Para falhas que reiniciam contêineres rapidamente, conecte-se por SSH à VPS e colete eventos antes do deploy. Os comandos abaixo ajudam a diferenciar erro de aplicação, banco indisponível e falta de memória.

```bash
free -h
sudo dmesg -T | grep -Ei 'out of memory|oom|killed process|memory cgroup' | tail -n 80
sudo docker ps -a --format 'table {{.Names}}\t{{.Status}}\t{{.Image}}'
sudo journalctl -u docker --since '15 minutes ago' --no-pager | tail -n 200
```

| Sintoma | Hipótese inicial | Ação recomendada |
| --- | --- | --- |
| `ER_EMPTY_QUERY` durante migração | Arquivo SQL começa/termina com marcador de breakpoint vazio. | Corrigir a migração, testar a divisão por breakpoint e publicar novo commit. |
| `ER_CANT_DROP_FIELD_OR_KEY` | Migração tenta remover chave já inexistente no volume preservado. | Usar SQL idempotente compatível e revisar a sequência de migrações. |
| `Reached heap limit` / código 134 no build | Heap insuficiente no processo Vite/Node durante build. | Confirmar heap de build e pressão de memória do host. |
| Status 429 do provedor de IA | Cota, limite temporário ou faturamento da credencial LLM. | Verificar a chave e a cota do provedor configurado; o chat exibe orientação amigável ao visitante. |
| `DATABASE_URL is required` | Variável ausente ou não entregue ao contêiner. | Revisar Environment Variables do Coolify. |
| Falha em `database:3306` | Banco não saudável, host incorreto ou senha incompatível. | Confirmar serviço `database`, healthcheck e URL interna. |
| Erro de OCR | Tesseract/dados de idioma indisponíveis ou imagem problemática. | Confirmar Dockerfile, pacote `por+eng` e log do documento. |
| `crypto.randomUUID is not a function` | Navegador em HTTP ou contexto sem API segura. | Configurar HTTPS e manter fallback de geração de UUID no cliente. |
| 404/502 no domínio | Aplicação não iniciou ou regra de domínio não está no serviço `app`. | Ver logs, domínio HTTPS, porta interna 3000 e status do contêiner. |

## 17. Backup e recuperação

Uma recuperação completa exige os três planos de persistência: banco, objetos e arquivos da pasta de conhecimento. Um deles isoladamente não é suficiente para reconstruir toda a operação.

| Item | Contém | Motivo para backup |
| --- | --- | --- |
| Volume MariaDB | Metadados, chunks, configuração, conversas e mensagens. | Preserva o índice e o histórico. |
| Volume MinIO | PDFs e demais ativos enviados/armazenados. | Preserva os arquivos originais guardados pelo sistema. |
| `/data/liberty-ai/knowledge` | Arquivos administrados pelo watcher e `fontes.txt`. | Permite reindexação e preserva a fonte operacional. |
| Repositório Git | Código, Docker, migrações e documentos. | Permite reconstruir a aplicação. |

Antes de atualizações estruturais, faça dump do banco e cópia dos volumes. Ao recuperar, restaure primeiramente serviços/volumes, confirme `DATABASE_URL`, execute as migrações compatíveis e só então inicie a aplicação. Não apague volumes de MariaDB ou MinIO para “corrigir” falhas de deploy sem backup: isso pode eliminar acervo, histórico e configuração.

## 18. Procedimento de manutenção e evolução

O fluxo de mudança deve ser reprodutível. Desenvolva localmente, atualize testes, execute validações, revise `git diff`, faça commit e envie para o branch rastreado pelo Coolify. Em seguida, acompanhe o deploy e realize um teste funcional simples no domínio HTTPS.

```powershell
& "$env:APPDATA\npm\pnpm.cmd" check
& "$env:APPDATA\npm\pnpm.cmd" test
git status
git add <arquivos-alterados>
git commit -m "tipo: descreva a alteracao"
git push origin main
```

Arquivos secretos, `.env`, arquivos do acervo, exports de banco, credenciais LLM/Tavily e tokens de infraestrutura não pertencem ao Git. Alterações de banco devem ter migrações pequenas, revisadas e testadas em base compatível antes de chegar ao volume de produção.

## 19. Limites e decisões atuais

| Decisão | Benefício | Consideração futura |
| --- | --- | --- |
| Busca lexical por termos | Simples, barata e rastreável. | Para acervo muito grande, avaliar embeddings e busca vetorial. |
| Histórico por navegador | Sem cadastro obrigatório para usuário público. | Não sincroniza conversa entre dispositivos. |
| Upload manual somente PDF | Reduz complexidade e mantém painel objetivo. | Outros formatos entram pela pasta monitorada. |
| Tavily opcional | Chat funciona mesmo sem busca externa. | Depende de cota/chave quando habilitado. |
| Watcher por evento | Atualização imediata após salvar arquivos. | Não é atualização periódica de páginas externas. |
| MinIO interno | Evita depender de serviço externo para arquivos. | Exige backup do volume e credenciais fortes. |

## 20. Referências internas

| Documento/código | Finalidade |
| --- | --- |
| [Guia Operacional](guia-operacional-libertyai.md) | Rotina do acervo, Coolify e diagnóstico operacional. |
| [env.example](env.example) | Modelo comentado de variáveis, sem segredos. |
| [Política de fontes externas](external-source-policy.md) | Regras de prioridade documental e fontes complementares. |
| [Modelo de fontes](fontes.txt.example) | Exemplo de URLs pré-aprovadas. |
| [`server/_core/index.ts`](../server/_core/index.ts) | Inicialização HTTP, tRPC, Vite e watcher. |
| [`server/routers.ts`](../server/routers.ts) | Composição dos grupos tRPC. |
| [`drizzle/schema.ts`](../drizzle/schema.ts) | Entidades, campos, índices e relações. |
| [`server/services/chat-context.service.ts`](../server/services/chat-context.service.ts) | RAG, política fixa, fontes e histórico. |
| [`server/services/knowledge-ingestion.service.ts`](../server/services/knowledge-ingestion.service.ts) | Ingestão de PDF, imagem, planilha e `fontes.txt`. |
| [`docker-compose.yml`](../docker-compose.yml) | Serviços, volumes e limites de memória. |
| [`Dockerfile`](../Dockerfile) | Imagem Node/Tesseract e build de produção. |
