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

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY server ./server
COPY --from=build /app/dist ./dist

RUN chown -R node:node /app
EXPOSE 8090
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8090/api/health || exit 1

USER node
CMD ["node", "server/index.js"]
