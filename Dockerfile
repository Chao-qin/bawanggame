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
# Usage statistics endpoint (docs/superpowers/specs/2026-11-24-usage-analytics-design.md); unset leaves them off.
ARG VITE_ANALYTICS_URL=
RUN pnpm build \
 && pnpm --filter @xiaochao/server build

# The MRP runtime (vmrp_v1.0, ~3 MB) from the same pinned vmrp checkout the Android release uses. The ~200 MB game
# library is not copied: the catalog marks every game bundled=false and the page loads it from the public mirror.
FROM node:22-bookworm-slim AS mrp-runtime

ARG VMRP_COMMIT=7f96c715244adaea927eb8f60d9319160a767e5a
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates git \
 && rm -rf /var/lib/apt/lists/*
RUN git clone --filter=blob:none --no-checkout https://github.com/vmrp/vmrp.github.io.git /vmrp \
 && git -C /vmrp sparse-checkout set --no-cone /vmrp_v1.0/ \
 && git -C /vmrp checkout "$VMRP_COMMIT"
COPY maopao-revival/hall/manifest.json /catalog/manifest.json
RUN node -e "const fs=require('fs');const games=JSON.parse(fs.readFileSync('/catalog/manifest.json','utf8')).map((game)=>({...game,bundled:false}));fs.writeFileSync('/catalog/manifest.json',JSON.stringify(games))"

FROM node:22-bookworm-slim AS runtime

RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates coturn curl \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
ENV NODE_ENV=production PORT=8080 TURN_STATE_DIR=/app/turn

COPY --from=build /app/public/ public/
COPY --from=production-dependencies /app/node_modules/ node_modules/
COPY --from=production-dependencies /app/apps/server/node_modules/ apps/server/node_modules/
COPY --from=build /app/apps/server/package.json apps/server/
# The server resolves asset paths relative to its entrypoint.
COPY --from=build /app/apps/server/dist/src/ apps/server/dist/src/
COPY runtime/ runtime/
COPY games/jar/.keep games/jar/
COPY start.sh turnserver.conf ./
COPY --from=mrp-runtime /vmrp/vmrp_v1.0/ maopao-revival/vendor/vmrp.github.io/vmrp_v1.0/
COPY --from=mrp-runtime /catalog/manifest.json maopao-revival/vendor/vmrp.github.io/hall/manifest.json
RUN install -d -o node -g node "$TURN_STATE_DIR"

USER node
EXPOSE 8080 3478/tcp 3478/udp 49160-49200/udp
HEALTHCHECK --interval=15s --timeout=3s --start-period=10s \
  CMD curl -fsS "http://127.0.0.1:${PORT}/" > /dev/null || exit 1
ENTRYPOINT ["bash", "start.sh"]
CMD ["node", "apps/server/dist/src/main.js"]
