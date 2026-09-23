FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY services/api/package.json services/api/
COPY apps/web/package.json apps/web/
RUN npm ci
COPY services/api services/api
COPY db/migrations db/migrations
RUN npm run build -w @shiftledger/api

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY services/api/package.json services/api/
COPY apps/web/package.json apps/web/
RUN npm ci --omit=dev
COPY --from=build /app/services/api/dist services/api/dist
COPY db/migrations db/migrations
ENV MIGRATIONS_DIR=/app/db/migrations
EXPOSE 3001
CMD ["node", "services/api/dist/index.js"]
