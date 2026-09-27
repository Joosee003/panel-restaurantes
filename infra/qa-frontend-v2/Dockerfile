# QA companion frontend only. Do not use the historical root Dockerfile.
FROM node:24.11.1-bookworm-slim@sha256:48abc13a19400ca3985071e287bd405a1d99306770eb81d61202fb6b65cf0b57 AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

FROM base AS dependencies
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM dependencies AS builder
COPY . .
ARG QA_PUBLIC_CONFIG_SHA256
# Public QA config only; no private credential is available to this build.
# The public-file digest invalidates BuildKit cache when mounted config changes.
RUN --mount=type=secret,id=qa_public,required=true node infra/qa-frontend-v2/build.mjs

FROM base AS runner
ENV NODE_ENV=production
# NODE_ENV is the optimized Next runtime mode, NOT the GastroHelp environment.
ARG SOURCE_COMMIT
LABEL org.opencontainers.image.revision=$SOURCE_COMMIT
COPY --from=builder --chown=node:node /app/.next ./.next
COPY --from=builder --chown=node:node /app/public ./public
COPY --from=dependencies /app/node_modules ./node_modules
COPY --from=builder /app/package.json /app/next.config.ts /app/tsconfig.json ./
COPY --from=builder /app/qa-public-config.json ./qa-public-config.json
COPY --from=builder /app/infra/qa-frontend-v2 ./infra/qa-frontend-v2
# Keep the locked dependency tree, including TS config loading dependencies.
# No source checkout, Git data, .env, dumps, or private runtime secret is copied.
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/login',{redirect:'manual'}).then(r=>process.exit(r.status===200?0:1)).catch(()=>process.exit(1))"
CMD ["node", "infra/qa-frontend-v2/start.mjs"]
