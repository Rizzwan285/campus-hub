# Campus Hub frontend: build the Vite bundle, serve it from nginx.
#
#   docker build -t campus-hub-frontend .

# ── Stage 1: Build the React app ──
FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .

# VITE_* values are baked into the bundle at build time, so the API URL is a
# build argument — changing it requires rebuilding this image.
ARG VITE_API_URL=http://localhost:4000
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

# ── Stage 2: Serve with nginx ──
FROM nginx:1.27-alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

# 127.0.0.1, not localhost: localhost resolves to ::1 first in the container and
# nginx listens on IPv4 only, so the probe would be refused while the server is
# serving fine.
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:80/ >/dev/null || exit 1
