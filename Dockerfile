# ---- build frontend (Plex proxy enabled at compile time) ----
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ENV VITE_PLEX_PROXY=1
RUN npm run build

# ---- production image: static UI + Express Plex proxy ----
FROM node:22-alpine AS production
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8090

RUN apk add --no-cache su-exec ffmpeg

# /app must be writable by node for npm ci; avoid recursive chown over node_modules
RUN chown node:node /app

COPY --chown=node:node package.json package-lock.json ./

USER node
RUN npm ci --omit=dev

COPY --chown=node:node server ./server
COPY --chown=node:node --from=build /app/dist ./dist

USER root
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

EXPOSE 8090
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8090/api/health || exit 1
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "server/index.js"]
