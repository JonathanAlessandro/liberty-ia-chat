#!/bin/sh
set -eu

corepack pnpm exec drizzle-kit migrate
exec node dist/index.js
