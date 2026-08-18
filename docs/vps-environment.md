# Variáveis de ambiente para a VPS

Crie um arquivo chamado `.env` no diretório da aplicação da VPS antes de iniciar o Docker Compose. Não envie esse arquivo ao repositório e não compartilhe seus valores em canais públicos.

| Variável | Exemplo de formato | Finalidade |
| --- | --- | --- |
| `APP_PORT` | `3000` | Porta pública exposta pelo contêiner da aplicação. |
| `MYSQL_DATABASE` | `libertyai` | Nome do banco MariaDB. |
| `MYSQL_USER` | `libertyai` | Usuário de acesso da aplicação ao banco. |
| `MYSQL_PASSWORD` | senha longa e única | Senha do usuário do banco. |
| `MYSQL_ROOT_PASSWORD` | senha longa e distinta | Senha administrativa do MariaDB. |
| `DATABASE_URL` | `mysql://usuario:senha@database:3306/libertyai` | Conexão interna usada pelas migrações e pela aplicação. |
| `ADMIN_EMAIL` | `admin@seudominio.com.br` | E-mail de acesso ao painel em `/admin/login`. |
| `ADMIN_PASSWORD` | senha longa e única | Senha de acesso ao painel administrativo. |
| `LOCAL_AUTH_SECRET` | sequência aleatória com 32+ caracteres | Chave de assinatura da sessão administrativa. |
| `S3_ENDPOINT` | `http://minio:9000` | Endpoint interno do MinIO. |
| `S3_REGION` | `us-east-1` | Região informada ao cliente compatível com S3. |
| `S3_BUCKET` | `libertyai-documents` | Bucket privado dos PDFs. |
| `S3_ACCESS_KEY_ID` | identificador longo | Usuário do armazenamento MinIO. |
| `S3_SECRET_ACCESS_KEY` | senha com 8+ caracteres | Chave secreta do MinIO. |
| `LLM_BASE_URL` | `https://api.openai.com/v1` | URL base de um provedor compatível com Chat Completions. |
| `LLM_API_KEY` | chave privada do provedor | Credencial usada somente pelo servidor. |
| `LLM_MODEL` | identificador do modelo | Modelo usado para gerar as respostas ancoradas no contexto. |

Uma forma segura de gerar uma chave para `LOCAL_AUTH_SECRET` na VPS é: `openssl rand -base64 48`.
