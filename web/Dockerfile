FROM node:22-slim AS base
RUN corepack enable && corepack prepare pnpm@10.32.1 --activate
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY web/package.json web/
COPY packages/data/package.json packages/data/
COPY packages/nostr/package.json packages/nostr/
RUN pnpm install --frozen-lockfile

FROM base AS build
ARG VITE_RELAY_URL
ARG VITE_BLOSSOM_URL
ENV VITE_RELAY_URL=$VITE_RELAY_URL
ENV VITE_BLOSSOM_URL=$VITE_BLOSSOM_URL
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/web/node_modules ./web/node_modules
COPY --from=deps /app/packages/data/node_modules ./packages/data/node_modules
COPY --from=deps /app/packages/nostr/node_modules ./packages/nostr/node_modules
COPY web/ web/
COPY packages/ packages/
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
WORKDIR /app/web
RUN pnpm build

FROM base AS runtime
COPY --from=build /app/web/.output .output
EXPOSE 3100
CMD ["node", ".output/server/index.mjs"]
