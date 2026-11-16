# Community images are no longer distributed by MinIO. Build the official
# security release from source; keep /data and credentials compatible.
FROM golang:1.24.8-bookworm AS builder
ENV CGO_ENABLED=0 GOMAXPROCS=1 GOMEMLIMIT=256MiB
# A pipe enables VCS fallback on timeouts, unlike Go's default comma separator.
# These two large modules timed out behind storage.googleapis.com on the VPS;
# fetch them from their upstream repositories immediately. Keep checksum checks.
ENV GOPROXY="https://proxy.golang.org|direct" \
    GONOPROXY="google.golang.org/api,github.com/klauspost/compress" \
    GOSUMDB=sum.golang.org
# RELEASE.2025-10-15T17-29-55Z, pinned to its upstream commit.
RUN --mount=type=cache,id=liberty-minio-modules,target=/go/pkg/mod,sharing=locked \
    --mount=type=cache,id=liberty-minio-build,target=/root/.cache/go-build,sharing=locked \
    go install -p=1 -trimpath -ldflags="-s -w" github.com/minio/minio@9e49d5e7a648f00e26f2246f4dc28e6b07f8c84a

FROM debian:bookworm-slim
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl \
    && rm -rf /var/lib/apt/lists/*
COPY --from=builder /go/bin/minio /usr/local/bin/minio
EXPOSE 9000 9001
VOLUME ["/data"]
HEALTHCHECK --interval=30s --timeout=6s --start-period=30s --retries=3 CMD ["curl", "--fail", "--silent", "--show-error", "--max-time", "4", "http://127.0.0.1:9000/minio/health/live"]
ENTRYPOINT ["/usr/local/bin/minio"]
CMD ["server", "/data", "--console-address", ":9001"]
