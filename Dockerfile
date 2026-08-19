FROM node:22-bookworm-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends tesseract-ocr tesseract-ocr-por \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY . .
RUN npm install -g corepack@latest \
    && NODE_OPTIONS=--max-old-space-size=1024 corepack pnpm install --frozen-lockfile \
    && NODE_OPTIONS=--max-old-space-size=1024 corepack pnpm run build

ENV NODE_ENV=production
EXPOSE 3000
CMD ["sh", "scripts/start.sh"]
