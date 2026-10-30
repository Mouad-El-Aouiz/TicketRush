FROM node:26-bookworm-slim AS base
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
RUN npm install --global pnpm@10.34.9

FROM base AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
ARG API_URL=http://api:3000
ENV API_URL=${API_URL}
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/web/package.json ./apps/web/package.json
COPY apps/fake-payment/package.json ./apps/fake-payment/package.json
COPY apps/notifications/package.json ./apps/notifications/package.json
COPY packages/api-client/package.json ./packages/api-client/package.json
COPY packages/contracts ./packages/contracts
RUN --mount=type=cache,id=ticketrush-pnpm,target=/pnpm/store pnpm install --frozen-lockfile --store-dir /pnpm/store
COPY . .
RUN pnpm --filter @ticketrush/api db:generate && pnpm --filter @ticketrush/api build
RUN pnpm --filter @ticketrush/notifications build
RUN pnpm --filter @ticketrush/web build

FROM base AS api
WORKDIR /app
COPY --from=build --chown=node:node /app /app
RUN mkdir -p /app/apps/api/storage && chown node:node /app/apps/api/storage
USER node
WORKDIR /app/apps/api
EXPOSE 3000
CMD ["node", "--import", "./telemetry.mjs", "dist/main.js"]

FROM node:26-bookworm-slim AS web
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3001
COPY --from=build --chown=node:node /app/apps/web/.next/standalone /app
USER node
EXPOSE 3001
CMD ["node", "apps/web/server.js"]

FROM node:26-bookworm-slim AS fake-payment
WORKDIR /app
COPY --chown=node:node apps/fake-payment/src/server.mjs ./server.mjs
USER node
ENV FAKE_PAYMENT_HOST=0.0.0.0
EXPOSE 4000
CMD ["node", "server.mjs"]

FROM api AS notifications
USER root
RUN mkdir -p /app/apps/notifications/storage && chown node:node /app/apps/notifications/storage
USER node
WORKDIR /app/apps/notifications
ENV OTEL_SERVICE_NAME=ticketrush-notifications
EXPOSE 4100
CMD ["node","--import","../api/telemetry.mjs","dist/server.js"]
