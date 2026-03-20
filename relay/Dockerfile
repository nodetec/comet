FROM node:22-alpine AS deploy

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

RUN corepack enable

WORKDIR /repo

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY app/package.json app/package.json
COPY relay/package.json relay/package.json

RUN pnpm install --frozen-lockfile --ignore-scripts --filter @comet/relay...

COPY relay/src relay/src
COPY relay/drizzle relay/drizzle

RUN pnpm --filter @comet/relay --prod deploy --legacy /prod/relay

FROM oven/bun:1

WORKDIR /app

ENV NODE_ENV=production

COPY --from=deploy /prod/relay ./

EXPOSE 3000

CMD ["bun", "run", "src/index.ts"]
