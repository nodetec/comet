FROM node:22-alpine AS deploy

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

RUN corepack enable

WORKDIR /repo

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY patches patches
COPY blossom/package.json blossom/package.json
COPY packages/data/package.json packages/data/package.json
COPY packages/nostr/package.json packages/nostr/package.json

RUN pnpm install --frozen-lockfile --ignore-scripts --filter @comet/blossom...

COPY blossom/src blossom/src
COPY packages/data packages/data
COPY packages/nostr packages/nostr

RUN pnpm --filter @comet/blossom --prod deploy --legacy /prod/blossom

FROM oven/bun:1

WORKDIR /app

ENV NODE_ENV=production

COPY --from=deploy /prod/blossom ./

# Railway may still inject a stale service start command like
# `pnpm --filter @comet/blossom start`. The runtime image only needs Bun, so we
# provide a tiny shim that always starts the Blossom process.
RUN printf '%s\n' '#!/bin/sh' 'exec bun run src/index.ts' > /usr/local/bin/pnpm \
  && chmod +x /usr/local/bin/pnpm

EXPOSE 3000

ENTRYPOINT ["bun", "run", "src/index.ts"]
