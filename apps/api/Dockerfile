# syntax=docker/dockerfile:1.7

FROM node:22-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
WORKDIR /repo

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/tsconfig.json ./packages/shared/
COPY apps/api/package.json apps/api/tsconfig.json apps/api/drizzle.config.ts ./apps/api/
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY packages/shared ./packages/shared
COPY apps/api ./apps/api
RUN pnpm --filter @base-orchestrator/shared exec tsc --noEmit false --declaration true --outDir dist
RUN pnpm --filter @base-orchestrator/api exec tsc --noEmit false --outDir dist \
  && find apps/api/dist -name "*.test.js" -delete \
  && find apps/api/dist -name "*.integration.test.js" -delete
RUN pnpm --filter @base-orchestrator/api deploy --prod /prod/api
RUN cp -R apps/api/dist /prod/api/dist \
  && cp -R packages/shared/dist /prod/api/node_modules/@base-orchestrator/shared/dist \
  && node -e "const fs=require('node:fs'); const p='/prod/api/node_modules/@base-orchestrator/shared/package.json'; const pkg=JSON.parse(fs.readFileSync(p,'utf8')); pkg.exports={'.':{types:'./dist/index.d.ts',default:'./dist/index.js'}}; fs.writeFileSync(p, JSON.stringify(pkg, null, 2));" \
  && rm -rf /prod/api/src /prod/api/tsconfig.json /prod/api/drizzle.config.ts

FROM node:22-alpine AS runtime
ENV NODE_ENV=production
ENV API_HOST=0.0.0.0
ENV API_PORT=4100
ENV DEMO_MODE=true
ENV DRY_RUN=true
ENV REQUIRE_LIVE_CONFIRMATION=true
ENV ALLOW_UNLIMITED_APPROVAL=false
ENV AUTO_APPROVE=false
ENV SCHEDULER_LIVE_EXECUTION=false
ENV QUOTE_PROVIDER=mock
ENV MASTER_KEY_FILE=/var/lib/base-orchestrator/master.key
WORKDIR /app
RUN addgroup -S baseapp && adduser -S baseapp -G baseapp \
  && mkdir -p /var/lib/base-orchestrator \
  && chown -R baseapp:baseapp /app /var/lib/base-orchestrator
COPY --from=build --chown=baseapp:baseapp /prod/api ./
USER baseapp
EXPOSE 4100
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:4100/health').then(async r=>{const b=await r.json().catch(()=>({ok:false})); process.exit(r.ok&&b.ok?0:1)}).catch(()=>process.exit(1))"
CMD ["node", "dist/apps/api/src/server.js"]
