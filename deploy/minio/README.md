# MinIO no deploy

A edição comunitária passou à distribuição apenas por código-fonte. O Compose compila o MinIO a partir do commit oficial `9e49d5e7a648f00e26f2246f4dc28e6b07f8c84a` (release de segurança `RELEASE.2025-10-15T17-29-55Z`), sem depender de `minio/minio:latest` no Docker Hub.

O serviço, o nome do volume `minio_data`, o caminho `/data`, as portas e as variáveis de credenciais permanecem os mesmos. Não remova volumes ao implantar. A primeira compilação exige acesso ao proxy de módulos Go e leva mais tempo; as seguintes usam o cache Docker. A compilação é serial para reduzir o consumo de memória na VPS.

Referência oficial: https://github.com/minio/minio/releases/tag/RELEASE.2025-10-15T17-29-55Z

Validação local do Compose: `pnpm test server/deployment/docker-compose.test.ts`.
Validação da imagem onde houver Docker: `docker build -t liberty-minio-test deploy/minio` e `docker run --rm liberty-minio-test --version`.
