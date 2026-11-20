FROM node:22-bookworm-slim AS workspace

WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY patches/ patches/
COPY apps/server/package.json apps/server/

FROM workspace AS production-dependencies

RUN pnpm --filter @xiaochao/server install --prod --frozen-lockfile

FROM workspace AS build

COPY apps/web/package.json apps/web/
RUN pnpm --filter @xiaochao/web --filter @xiaochao/server install --frozen-lockfile

COPY apps/web/ apps/web/
COPY apps/server/ apps/server/
COPY games/flash/ games/flash/
RUN pnpm build \
 && pnpm --filter @xiaochao/server build

FROM node:22-bookworm-slim AS runtime

RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates coturn curl \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
ENV NODE_ENV=production PORT=8080

COPY --from=build /app/public/ public/
COPY --from=production-dependencies /app/node_modules/ node_modules/
COPY --from=production-dependencies /app/apps/server/node_modules/ apps/server/node_modules/
COPY --from=build /app/apps/server/package.json apps/server/
# The server resolves asset paths relative to its entrypoint.
COPY --from=build /app/apps/server/dist/src/index.js apps/server/src/
COPY runtime/ runtime/
COPY games/jar/.keep games/jar/
COPY start.sh turnserver.conf ./
RUN mkdir -p maopao-revival/vendor/vmrp.github.io/hall \
 && printf '[]\n' > maopao-revival/vendor/vmrp.github.io/hall/manifest.json

USER node
EXPOSE 8080 3478/tcp 3478/udp 49160-49200/udp
HEALTHCHECK --interval=15s --timeout=3s --start-period=10s \
  CMD curl -fsS "http://127.0.0.1:${PORT}/" > /dev/null || exit 1
ENTRYPOINT ["bash", "start.sh"]
CMD ["node", "apps/server/src/index.js"]
