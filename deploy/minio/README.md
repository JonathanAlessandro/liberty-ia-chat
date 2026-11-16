# MinIO no deploy

A edição comunitária passou à distribuição apenas por código-fonte. O Compose compila o MinIO a partir do commit oficial `9e49d5e7a648f00e26f2246f4dc28e6b07f8c84a` (release de segurança `RELEASE.2025-10-15T17-29-55Z`), sem depender de `minio/minio:latest` no Docker Hub.

Em 16/11/2026 o build falhou por timeout ao baixar `google.golang.org/api@v0.230.0` e `github.com/klauspost/compress@v1.18.0`, ambos redirecionados pelo proxy Go para `storage.googleapis.com`. Não foi uma falha de compilação do chat. O builder agora usa `GONOPROXY` para baixar esses dois módulos diretamente dos repositórios upstream e `GOPROXY=https://proxy.golang.org|direct` para permitir fallback em erros de rede nos demais módulos. A validação pública de checksums permanece ativa (`GOSUMDB=sum.golang.org`); não há proxy de terceiros nem desativação de TLS.

Os caches BuildKit de módulos e compilação são persistidos separadamente da camada final, inclusive quando um build falha. Eles aceleram tentativas seguintes enquanto o cache do builder for preservado. O Coolify já executa o build com BuildKit habilitado. A primeira compilação ainda depende de acesso HTTPS ao GitHub, aos upstreams e à infraestrutura Go; esta alteração não garante corrigir indisponibilidade geral de rede na VPS.

O serviço, o nome do volume `minio_data`, o caminho `/data`, as portas e as variáveis de credenciais permanecem os mesmos. Não remova volumes ao implantar. A primeira compilação exige acesso ao proxy de módulos Go e leva mais tempo; as seguintes usam o cache Docker. A compilação é serial para reduzir o consumo de memória na VPS.

Referência oficial: https://github.com/minio/minio/releases/tag/RELEASE.2025-10-15T17-29-55Z

Validação local do Compose: `pnpm test server/deployment/docker-compose.test.ts`.
Validação da imagem onde houver Docker: `docker build -t liberty-minio-test deploy/minio` e `docker run --rm liberty-minio-test --version`.

Validação da correção de 16/11/2026: os dois downloads diretos foram concluídos com `go mod download -json`, cache isolado e checksum público ativo. Os upstreams confirmados foram `github.com/googleapis/google-api-go-client` (tag v0.230.0) e `github.com/klauspost/compress` (tag v1.18.0). Os quatro testes de deploy passaram. A imagem completa não foi recompilada localmente: o Docker Desktop estava sem engine Linux em execução. Além disso, o Compose CLI local rejeita o campo `is_directory` já existente e usado pelo Coolify; esse campo não foi alterado nesta correção e não foi a falha indicada no log da VPS. O próximo build no Coolify é a confirmação final da conectividade e da compilação.
