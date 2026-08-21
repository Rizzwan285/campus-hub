# Campus Hub API.
#
# BUILD FROM THE REPO ROOT, not from server/:
#   docker build -f server/Dockerfile -t campus-hub-api .
#
# The root context is required because scripts/seed.ts and scripts/verify.ts read
# the app's static data from ../../src/data — that data is the seed source of
# truth, so the image bakes it in and can seed a fresh database on its own.

# ── Stage 1: Install production dependencies ──
FROM node:20-alpine AS deps
WORKDIR /app/server
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev

# ── Stage 2: Runtime image ──
FROM node:20-alpine
WORKDIR /app/server

# Non-root user for security.
RUN addgroup -g 1001 -S appgroup && \
    adduser -S appuser -u 1001 -G appgroup

COPY --from=deps /app/server/node_modules ./node_modules
COPY server/package.json server/tsconfig.json ./
COPY server/src/ ./src/
COPY server/db/ ./db/
COPY server/scripts/ ./scripts/

# Seed/verify resolve this as ../../src/data from /app/server/scripts.
COPY src/data/ /app/src/data/

# tsx is a production dependency: TypeScript runs directly, there is no build step.
USER appuser
EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:4000/api/health || exit 1

CMD ["node_modules/.bin/tsx", "src/server.ts"]
