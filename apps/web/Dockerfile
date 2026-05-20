# syntax=docker/dockerfile:1.7

FROM node:22-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
ENV NEXT_TELEMETRY_DISABLED=1
RUN corepack enable
WORKDIR /repo

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/tsconfig.json ./packages/shared/
COPY apps/web/package.json apps/web/tsconfig.json apps/web/next.config.ts apps/web/postcss.config.mjs apps/web/tailwind.config.ts ./apps/web/
RUN pnpm install --frozen-lockfile

FROM deps AS build
ARG NEXT_PUBLIC_API_BASE_URL=""
ENV NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL
COPY packages/shared ./packages/shared
COPY apps/web ./apps/web
RUN pnpm --filter @base-orchestrator/web build

FROM node:22-alpine AS runtime
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3100
ENV HOSTNAME=0.0.0.0
ENV INTERNAL_API_BASE_URL=http://api:4100
WORKDIR /app
RUN addgroup -S baseapp && adduser -S baseapp -G baseapp \
  && chown -R baseapp:baseapp /app
COPY --from=build --chown=baseapp:baseapp /repo/apps/web/.next/standalone ./
COPY --from=build --chown=baseapp:baseapp /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=baseapp:baseapp /repo/apps/web/public ./apps/web/public
USER baseapp
EXPOSE 3100
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3100').then(r=>process.exit(r.status<500?0:1)).catch(()=>process.exit(1))"
CMD ["node", "apps/web/server.js"]
