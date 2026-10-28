# Community images are no longer distributed by MinIO. Build the official
# security release from source; keep /data and credentials compatible.
FROM golang:1.24.8-bookworm AS builder
ENV CGO_ENABLED=0 GOMAXPROCS=1 GOMEMLIMIT=256MiB
# RELEASE.2025-10-15T17-29-55Z, pinned to its upstream commit.
RUN go install -p=1 -trimpath -ldflags="-s -w" github.com/minio/minio@9e49d5e7a648f00e26f2246f4dc28e6b07f8c84a

FROM debian:bookworm-slim
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY --from=builder /go/bin/minio /usr/local/bin/minio
EXPOSE 9000 9001
VOLUME ["/data"]
ENTRYPOINT ["/usr/local/bin/minio"]
CMD ["server", "/data", "--console-address", ":9001"]
