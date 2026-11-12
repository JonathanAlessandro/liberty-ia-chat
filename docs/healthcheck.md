# Healthcheck da aplicação

O contêiner consulta `GET /api/health` internamente pelo endereço de loopback, na porta definida por PORT ou 3000. A resposta esperada é HTTP 200 com JSON `{"status":"ok"}`, sem autenticação e sem cache. Não configure uma credencial para essa rota.

Dockerfile e Compose executam `node scripts/healthcheck.mjs` a cada 30 segundos. O script tem limite de 4 segundos para a consulta; o Docker limita a execução a 6 segundos. Há tolerância inicial de 90 segundos para migrações e inicialização, e 3 falhas consecutivas definem o estado unhealthy.

Não é necessário instalar curl ou wget. O script recusa redirecionamento, erro HTTP, JSON inesperado ou uma página HTML retornada pela aplicação no lugar da rota.

Esta checagem indica que o servidor HTTP está respondendo (liveness). Não consulta banco, MinIO nem APIs de IA, e não garante que uma resposta do chat esteja correta. O banco já tem sua própria checagem no Compose. Nenhum crédito de IA é usado. O estado unhealthy, por si só, não equivale a uma política automática de reinício.

Faça o redeploy para os contêineres receberem a nova configuração. A confirmação do estado healthy no Coolify deve ocorrer depois da atualização; a validação local não comprova o estado da VPS.
