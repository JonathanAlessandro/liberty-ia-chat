# LibertyAI — documentação do projeto

## 1. Objetivo

A LibertyAI é um sistema privado de perguntas e respostas sobre documentos. Seu foco atual é consultar materiais de operadoras de saúde, incluindo tabelas de reembolso em PDF e planilha. O sistema mantém o arquivo original, extrai trechos pesquisáveis, seleciona o contexto relacionado à pergunta e produz uma resposta rastreável.

Este documento representa o código atual do repositório e cobre arquitetura, dados, indexação, busca, autenticação, configuração, produção e diagnóstico.

## 2. Arquitetura

A aplicação é um monólito modular. Um processo Node entrega a interface React compilada e a API Express/tRPC. MariaDB armazena dados relacionais e MinIO guarda os arquivos originais.

```mermaid
flowchart TB
    Browser[Navegador] --> Proxy[HTTPS / proxy reverso]
    Proxy --> App[Node.js: Express + tRPC + React]
    App --> DB[(MariaDB)]
    App --> Objects[(MinIO / S3)]
    App --> Provider[LLM compatível com OpenAI]
    App -. sem contexto interno .-> Tavily[Tavily opcional]
    Folder[Pasta de conhecimento] --> Watcher[Chokidar]
    Watcher --> App
    App --> OCR[Tesseract]
```

| Camada | Diretório | Papel |
| --- | --- | --- |
| Interface | `client/src` | Páginas, componentes, estado e cliente tRPC. |
| Rotas | `server/routes` | Procedimentos tRPC e validação Zod. |
| Controladores | `server/controllers` | Coordenação dos casos de uso. |
| Serviços | `server/services` | Indexação, busca, LLM, OCR, fontes e S3. |
| Repositórios | `server/repositories` | Persistência MariaDB via Drizzle. |
| Dados | `drizzle` | Schema e migrações. |

## 3. Interface e API

As rotas do navegador são:

| Caminho | Função | Acesso |
| --- | --- | --- |
| `/` | Chat e histórico | usuário autenticado |
| `/login` | Login | público |
| `/alterar-senha` | Troca da senha temporária | usuário autenticado |
| `/admin/login` | Login administrativo | público |
| `/admin` | Documentos, pastas, IA e reindexação | administrador |
| `/admin/usuarios` | Gestão de contas | administrador |

O backend monta tRPC em `/api/trpc`. Seus grupos são `system`, `userAuth`, `adminAuth`, `adminUsers`, `admin` e `chat`. `AppRouter` fornece tipos ao frontend.

`AIChatBox.tsx` bloqueia envios concorrentes, restaura mensagens e exibe fontes. O navegador mantém um UUID local, mas a propriedade da conversa também é conferida no servidor.

## 4. Dados

O schema fica em `drizzle/schema.ts`.

| Tabela | Finalidade |
| --- | --- |
| `users` | Identidade e papel `user` ou `admin`. |
| `localUserAccounts` | Hash de senha, estado ativo e troca obrigatória. |
| `localUserSessions` | Hash do token, validade e último uso. |
| `knowledgeFolders` | Pastas virtuais administradas no painel. |
| `documents` | Metadados, origem, autoridade, vigência, status e chave S3. |
| `documentChunks` | Texto pesquisável, página e ordinal. |
| `aiConfigurations` | Instrução administrativa do chat. |
| `conversations` | Conversas ligadas ao usuário e navegador. |
| `messages` | Perguntas, respostas e fontes serializadas. |

Excluir documento remove seus chunks em cascata. Excluir usuário remove conta, sessões e conversas. Mensagens com mais de sete dias são eliminadas na inicialização e diariamente.

## 5. Entrada de conteúdo

### Painel

O upload manual aceita PDF até 15 MB e XLSX, XLS ou CSV até 8 MB. O servidor valida extensão, tamanho e assinatura básica antes de guardar o objeto. Cada upload cria um documento; reenviar o mesmo nome não substitui automaticamente um registro anterior.

### Pasta monitorada

`KNOWLEDGE_DIR` aceita PDF, PNG, JPG, JPEG, WEBP, XLSX, XLS, CSV e `fontes.txt`. O watcher usa uma fila serial para limitar memória. Arquivos gerais têm limite de 25 MB; planilhas têm limite de 8 MB e 100 mil linhas por aba.

O fingerprint SHA-256 inclui a versão do indexador para PDFs e planilhas. Mudar a versão força nova leitura mesmo sem mudar os bytes. Alterar um arquivo atualiza seu registro; excluí-lo retira o documento do índice.

Em produção, `/data/liberty-ai/knowledge` é montado como `/app/knowledge`. Em desenvolvimento, sem `KNOWLEDGE_DIR`, usa-se `./knowledge`.

## 6. Indexação

### PDF

O fluxo possui três camadas:

1. `pdf-parse` extrai texto por página.
2. `numericTableSections` reconstrói relações como `Linha: Psicoterapia por Sessão` e `Coluna 16: 194,53`.
3. Páginas sem texto suficiente ou com tabela numérica ainda ambígua são renderizadas e enviadas ao `PDF_VISION_MODEL`.

A leitura visual é sequencial, limitada por `PDF_VISION_MAX_PAGES` e ocorre somente na indexação. Se falhar, o texto nativo continua disponível. O prompt visual proíbe completar valores ilegíveis por suposição.

### Planilha

SheetJS lê cada aba e transforma cada linha em uma seção com nome da aba, número da linha, cabeçalhos próximos, coordenadas e valores. Cabeçalhos numéricos são preservados. Fórmulas não são recalculadas: o indexador usa o valor armazenado no arquivo.

### Imagem

Imagens da pasta monitorada passam pelo Tesseract com os idiomas `por+eng` e seguem para o particionador comum.

### Particionamento

O texto normalizado é dividido em trechos de cerca de 1.400 caracteres, com sobreposição de 140. Cada trecho preserva documento, página e ordem.

## 7. Busca e resposta

```mermaid
sequenceDiagram
    participant U as Usuário
    participant API as chat.ask
    participant R as Recuperação
    participant DB as MariaDB
    participant L as LLM
    participant W as Web opcional
    U->>API: pergunta
    API->>DB: grava pergunta
    API->>R: busca contexto
    R->>DB: candidatos prontos
    alt linha, código e valor únicos
        R-->>API: resposta direta
    else há contexto interno
        R->>L: trechos + pergunta
        L-->>API: resposta
    else não há contexto interno
        R->>W: evidência opcional
        R->>L: evidência + pergunta
        L-->>API: resposta
    end
    API->>DB: grava resposta e fontes
    API-->>U: resultado
```

A busca atual é lexical. A pergunta é normalizada e usada para recuperar candidatos `ready`. O serviço pontua os trechos por conteúdo, nome, grupo, autoridade e vigência.

Para tabelas, uma etapa determinística ocorre antes do LLM. Ela reconhece `categoria`, `plano` ou `produto`, trata `C16` e `16` como aliases, permite que `psicoterapia` encontre `Psicoterapia por Sessão` e só responde diretamente quando há uma combinação única de linha, código e valor.

Se houver ambiguidade, o LLM recebe os trechos selecionados. Tavily só é chamado quando não existe contexto documental relevante e há uma fonte/configuração utilizável.

## 8. Fontes e vigência

Arquivos internos usam autoridade `internal_training`; páginas cadastradas usam `official_registered`. `sourceGroup` identifica a operadora e `effectiveAt` representa a vigência.

Na pasta, a primeira subpasta pode definir o grupo e uma data `AAAA-MM-DD` no caminho pode definir vigência. Em `fontes.txt`:

```text
https://exemplo.com/pagina|2025-01-01|omint
```

Uma fonte oficial mais nova pode ser ordenada antes de material interno da mesma operadora quando as datas são comparáveis. Conteúdo dos arquivos nunca substitui as instruções fixas da aplicação.

## 9. Modelo e tempo de resposta

O serviço usa `/chat/completions`. O padrão é `gpt-4.1-mini`, resposta máxima de 600 tokens e timeout de 45 segundos. Para GPT-5, o esforço padrão é `minimal`; para outros modelos, a temperatura é `0.1`.

Consultas tabulares exatas não chamam o LLM. OCR e visão não rodam durante a pergunta. Demora normalmente indica latência do provedor, contexto ambíguo, ausência de conteúdo interno que ativou consulta externa ou pressão de memória.

## 10. Autenticação e privacidade

O administrador entra com `ADMIN_EMAIL` e `ADMIN_PASSWORD`. Usuários são criados no painel, recebem senha temporária e devem trocá-la. Senhas são armazenadas como hash e sessões guardam hash do token.

Cookies são HTTP-only e `sameSite=lax`. Com HTTPS são seguros. Desativar usuário ou redefinir senha encerra sessões existentes.

Cada conversa pertence a `ownerUserId` e `visitorId`. Um `conversationId` isolado não permite acessar o histórico de outra pessoa.

## 11. Reindexação

O botão **Reler arquivos** percorre PDFs e planilhas cadastrados, lê os objetos do S3 e recria seus chunks sequencialmente. Erros ficam no documento. Conversas e mensagens não são alteradas. Imagens e páginas web são ignoradas nessa ação. Cache do navegador não reindexa conteúdo.

## 12. Ambiente

Configuração recomendada:

```dotenv
PORT=3000
DATABASE_URL=mysql://usuario:senha@database:3306/libertyai
ADMIN_EMAIL=admin@exemplo.com
ADMIN_PASSWORD=senha-forte
LOCAL_AUTH_SECRET=segredo-aleatorio-com-32-ou-mais-caracteres
S3_ENDPOINT=http://minio:9000
S3_REGION=us-east-1
S3_BUCKET=libertyai-documents
S3_ACCESS_KEY_ID=usuario-minio
S3_SECRET_ACCESS_KEY=senha-minio
LLM_BASE_URL=https://api.openai.com/v1
LLM_API_KEY=chave-privada
LLM_MODEL=gpt-4.1-mini
LLM_TIMEOUT_MS=45000
LLM_MAX_COMPLETION_TOKENS=600
PDF_VISION_ENABLED=true
PDF_VISION_MODEL=gpt-4.1-mini
PDF_VISION_MAX_PAGES=20
KNOWLEDGE_DIR=/app/knowledge
NODE_OPTIONS=--max-old-space-size=512
```

Segredos nunca devem aparecer no Git, frontend ou logs.

## 13. Desenvolvimento

```bash
corepack enable
pnpm install
pnpm db:push
pnpm dev
```

Validação:

```bash
pnpm test
pnpm check
pnpm build
```

Os testes cobrem autenticação, autorização, upload, ingestão, watcher, retenção, fontes, busca, tabelas, PDF e payload do LLM.

## 14. Produção

O Dockerfile usa Node 22 Bookworm, instala Tesseract `por+eng` e gera o bundle. `scripts/start.sh` aplica migrações antes de iniciar a aplicação.

| Serviço | Persistência | Memória |
| --- | --- | ---: |
| `app` | bind mount do acervo | 640 MB |
| `database` | `mariadb_data` | 384 MB |
| `minio` | `minio_data` | 256 MB |

O proxy HTTPS aponta para a porta interna 3000. MariaDB e MinIO não devem ficar públicos.

## 15. Diagnóstico

### Documento não responde

1. Confirme estado **Pronto** e examine `errorMessage` e logs.
2. Remova versões antigas ou duplicadas.
3. Publique o backend atualizado e clique em **Reler arquivos**.
4. Pergunte incluindo procedimento, operadora e categoria.

### Coluna errada

Confirme que descrição e cabeçalhos pertencem à mesma tabela. A resposta direta exige uma correspondência única. `C16` e `16` são equivalentes; `19/39` é um código composto diferente.

### Resposta lenta

Confira `LLM_MODEL`, `LLM_TIMEOUT_MS`, memória e se Tavily foi acionado. Uma consulta estruturada exata deve retornar sem chamada ao modelo. Leitura visual lenta durante reindexação é esperada.

Filtre os logs do serviço `app` por `chat_timing`. Todas as linhas de uma pergunta compartilham o mesmo `requestId`. `durationMs` mede a etapa e `totalMs` mede o tempo acumulado desde a entrada da requisição. O último estágio com estado `started` sem um `completed` correspondente identifica onde a execução ficou presa.

```json
{"event":"chat_timing","requestId":"a1b2c3d4","stage":"database_search","state":"completed","durationMs":4200,"candidateCount":80}
{"event":"chat_timing","requestId":"a1b2c3d4","stage":"structured_match","state":"completed","durationMs":2,"found":false}
{"event":"chat_timing","requestId":"a1b2c3d4","stage":"external_search","state":"completed","durationMs":14001,"used":true,"resultCount":0}
{"event":"chat_timing","requestId":"a1b2c3d4","stage":"llm","state":"completed","durationMs":38000}
```

### PDF escaneado não é lido

Confirme `PDF_VISION_ENABLED=true`, `LLM_API_KEY`, suporte visual do modelo e `PDF_VISION_MAX_PAGES`. Para imagens avulsas, verifique o Tesseract.

### Mudança não apareceu

Recrie a imagem Docker, confirme o contêiner novo e reindexe. Cache do navegador não atualiza código de servidor nem chunks.

## 16. Limitações atuais

- busca lexical, sem embeddings ou banco vetorial;
- fórmulas de planilha não são recalculadas;
- visão consome tokens na indexação e possui limite de páginas;
- upload repetido pode criar documentos duplicados;
- reindexação manual cobre PDF e planilha, não imagem ou web;
- conflito documental continua exigindo confirmação humana.

## 17. Referências internas

- `README.md`: entrada no GitHub;
- `env.example`: ambiente sem segredos;
- `docs/guia-operacional-libertyai.md`: rotina do administrador;
- `docs/vps-environment.md`: VPS e Coolify;
- `docs/external-source-policy.md`: fontes externas;
- `drizzle/schema.ts`: dados;
- `server/services/chat-context.service.ts`: busca e resposta;
- `server/services/document-indexing.service.ts`: PDF e chunks;
- `server/services/knowledge-ingestion.service.ts`: planilhas, imagens e watcher.
