#!/bin/sh
set -eu

corepack pnpm drizzle-kit migrate
exec node dist/index.js
