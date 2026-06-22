# syntax=docker/dockerfile:1
# Multi-stage build for the Next.js web app (output: 'standalone').
#
# IMPORTANT: build context is the REPO ROOT, not ./web. The build step syncs the shared
# parser-core from job-autofill/ (which lives outside web/), so the context must include
# both. See docker-compose.prod.yml: { context: ., dockerfile: web/Dockerfile }.

# ---- deps ----
FROM node:20-alpine AS deps
WORKDIR /app
# NOTE: do NOT copy web/.npmrc — it pins a Windows cmd.exe script-shell that breaks npm
# inside this Linux image. The lockfile is enough for a reproducible install.
COPY web/package.json web/package-lock.json ./
RUN npm ci

# ---- build ----
FROM node:20-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY web/ ./
RUN rm -f .npmrc
# The prebuild step (sync-parser-core.mjs) reads ../../job-autofill/src/lib/parser-core.js
# relative to /app/scripts → /job-autofill/src/lib/parser-core.js in the image.
COPY job-autofill/src/lib/parser-core.js /job-autofill/src/lib/parser-core.js
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ---- runtime ----
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001
# Standalone output: the self-contained server + its static assets.
COPY --from=build /app/public ./public
COPY --from=build --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/.next/static ./.next/static
USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
