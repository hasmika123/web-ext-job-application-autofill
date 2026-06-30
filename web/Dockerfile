# syntax=docker/dockerfile:1
# Multi-stage build for the Next.js web app (output: 'standalone').
#
# IMPORTANT: build context is the REPO ROOT (docker-compose.prod.yml: { context: .,
# dockerfile: web/Dockerfile }). web/ is an npm-WORKSPACE member: it consumes the
# @kiwiply/ui package (packages/ui/) and syncs the shared parser-core from job-autofill/ —
# all outside web/. So installs run WORKSPACE-AWARE from the ROOT lockfile, and the build
# runs from the repo root. (Next standalone output is monorepo-nested: standalone/web/server.js.)

# ---- deps (workspace-aware install from the root lockfile) ----
FROM node:20-alpine AS deps
WORKDIR /repo
# Only the manifests needed to resolve the install, so this layer caches until deps change.
# NOTE: do NOT copy web/.npmrc — it pins a Windows cmd.exe script-shell that breaks npm here.
COPY package.json package-lock.json ./
COPY packages/ui/package.json ./packages/ui/
COPY web/package.json ./web/
# job-autofill is also a workspace member, so a root `npm ci` needs its manifest present to
# resolve the workspace (its deps install into this build stage only — the runtime image is the
# standalone output, which doesn't carry node_modules).
COPY job-autofill/package.json ./job-autofill/
# --ignore-scripts: skip lifecycle scripts at install. Critically, job-autofill's
# `postinstall: wxt prepare` needs its entrypoints/ source (not copied here) and would fail.
# The web image only builds WEB (`npm run build -w web` runs web's own scripts), so no install
# script is needed; native deps still come via optionalDependencies regardless of this flag.
RUN npm ci --ignore-scripts

# ---- build ----
FROM node:20-alpine AS build
WORKDIR /repo
COPY --from=deps /repo/node_modules ./node_modules
# Root workspace manifests — `npm run build --workspace web` needs the root package.json to
# resolve the `web` workspace.
COPY package.json package-lock.json ./
# Workspace sources: the shared UI package + the web app.
COPY packages ./packages
COPY web ./web
RUN rm -f web/.npmrc
# The web prebuild (sync-parser-core.mjs) reads ../../job-autofill/src/lib/parser-core.js
# relative to /repo/web/scripts → /repo/job-autofill/src/lib/parser-core.js in the image.
COPY job-autofill/src/lib/parser-core.js ./job-autofill/src/lib/parser-core.js
# Public analytics config — NEXT_PUBLIC_* is inlined into the client bundle at BUILD time, so
# it must be present here (not the runtime env). Empty/false by default, so a plain
# `docker build` produces an analytics-free image; CI passes real values via --build-arg.
ARG NEXT_PUBLIC_GA_MEASUREMENT_ID=""
ARG NEXT_PUBLIC_ANALYTICS_ENABLED="false"
ENV NEXT_TELEMETRY_DISABLED=1 \
    NEXT_PUBLIC_GA_MEASUREMENT_ID=$NEXT_PUBLIC_GA_MEASUREMENT_ID \
    NEXT_PUBLIC_ANALYTICS_ENABLED=$NEXT_PUBLIC_ANALYTICS_ENABLED
RUN npm run build --workspace web

# ---- runtime ----
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001
# Standalone is monorepo-nested (outputFileTracingRoot = repo root): the bundle carries its
# own node_modules + web/server.js; @kiwiply/ui is transpiled in (no extra runtime dep). Static
# assets + public are copied separately, UNDER web/ to match the nested server's expectations.
COPY --from=build --chown=nextjs:nodejs /repo/web/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /repo/web/.next/static ./web/.next/static
COPY --from=build /repo/web/public ./web/public
USER nextjs
EXPOSE 3000
CMD ["node", "web/server.js"]
