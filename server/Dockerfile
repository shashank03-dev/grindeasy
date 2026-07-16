# Build from the REPO ROOT (the server imports shared scoring from ../src):
#   docker build -f server/Dockerfile -t grindeasy-server .
#   docker run -p 8787:8787 -v grindeasy-data:/data \
#     -e DB_PATH=/data/grindeasy.db -e BASE_URL=https://your.domain \
#     -e DISCORD_CLIENT_ID=... -e DISCORD_CLIENT_SECRET=... grindeasy-server
FROM node:24-alpine

WORKDIR /app

COPY server/package.json server/package-lock.json ./server/
RUN cd server && npm ci --no-audit --no-fund

COPY src/types.ts src/tiers.ts src/plan.ts ./src/
COPY server/src ./server/src
COPY server/tsconfig.json ./server/

ENV NODE_ENV=production
ENV DB_PATH=/data/grindeasy.db
EXPOSE 8787

WORKDIR /app/server
CMD ["npx", "tsx", "src/index.ts"]
