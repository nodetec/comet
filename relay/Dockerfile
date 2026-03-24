FROM node:22-alpine AS deploy

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

RUN corepack enable

WORKDIR /repo

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY relay/package.json relay/package.json
COPY packages/data/package.json packages/data/package.json
COPY packages/nostr/package.json packages/nostr/package.json

RUN pnpm install --frozen-lockfile --ignore-scripts --filter @comet/relay...

COPY relay/src relay/src
COPY relay/vendor relay/vendor
COPY packages/data packages/data
COPY packages/nostr packages/nostr

RUN pnpm --filter @comet/relay --prod deploy --legacy /prod/relay

FROM oven/bun:1

WORKDIR /app

ENV NODE_ENV=production

COPY --from=deploy /prod/relay ./

# Railway may still inject a stale service start command like
# `pnpm --filter @comet/relay start`. The runtime image only needs Bun, so we
# provide a tiny shim that always starts the relay process.
RUN printf '%s\n' '#!/bin/sh' 'exec bun run src/index.ts' > /usr/local/bin/pnpm \
  && chmod +x /usr/local/bin/pnpm

EXPOSE 3400

ENTRYPOINT ["bun", "run", "src/index.ts"]
