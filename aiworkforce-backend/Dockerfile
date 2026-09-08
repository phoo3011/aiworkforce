FROM node:24-bookworm-slim AS dependencies

WORKDIR /app

# sqlite3 can fall back to a native build when a prebuilt binary is unavailable.
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
# Build sqlite3 inside this Debian image so its native module uses a compatible
# glibc version rather than a prebuilt binary for a newer Linux distribution.
RUN npm_config_build_from_source=true npm ci --omit=dev

FROM node:24-bookworm-slim

WORKDIR /app
ENV NODE_ENV=production

COPY --from=dependencies /app/node_modules ./node_modules
# .dockerignore prevents secrets, databases, and local content files from being
# copied into the image while retaining the seed/import utilities for server use.
COPY . .

RUN mkdir -p /data
EXPOSE 5000

CMD ["node", "server.js"]
