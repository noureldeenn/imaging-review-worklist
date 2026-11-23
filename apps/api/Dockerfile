# Build context is the repo root: docker build -f apps/api/Dockerfile .
FROM node:22-alpine AS deps
# openssl must be present at `prisma generate` so the openssl-3.0.x musl engine is selected
RUN apk add --no-cache openssl
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
# --ignore-scripts skips husky's `prepare` (no .git in the image)
RUN npm ci --ignore-scripts

FROM deps AS build
COPY tsconfig.base.json ./
COPY apps/api apps/api
RUN npx prisma generate --schema apps/api/prisma/schema.prisma \
  && npm -w apps/api run build

FROM node:22-alpine AS runtime
# Prisma's query engine needs openssl on alpine
RUN apk add --no-cache openssl
ENV NODE_ENV=production
# Layout mirrors the repo so dist/studies resolves ../../../../fixtures to /app/fixtures
WORKDIR /app/apps/api
COPY --from=build --chown=node:node /app/node_modules /app/node_modules
COPY --from=build /app/apps/api/dist ./dist
COPY apps/api/prisma ./prisma
COPY apps/api/package.json ./
COPY fixtures /app/fixtures
COPY apps/api/docker-entrypoint.sh ./
USER node
EXPOSE 4000
ENTRYPOINT ["sh", "./docker-entrypoint.sh"]
